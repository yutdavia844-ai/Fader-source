'use strict';
const $=id=>document.getElementById(id);
function stored(key,fallback){try{return JSON.parse(localStorage.getItem('fader.'+key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem('fader.'+key,JSON.stringify(value));}catch{}}
const savedAudio=stored('audio',{});
const settings=Object.assign(structuredClone(audioDefaults),savedAudio);
if(savedAudio.linked===undefined && (settings.pitch!==0 || settings.speed!==1))settings.linked=false;
const prefs=Object.assign({motion:false,remember:true,desk:false,shuffle:false,repeat:'off',sort:'library'},stored('prefs',{}));
let userPresets=stored('presets',[]),liked=new Set(stored('liked',[])),tracks=[...demoTracks],queue=[],view='home',toastTimer,seekDrag=false,unmuted=settings.volume||.72;
const trackById=id=>tracks.find(t=>t.id===id)||remoteTracks.get(id);
const time=s=>Number.isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
const normalized=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const player=new FaderTransport(settings,async id=>{
  const t=trackById(id);
  if(t.src){const r=await fetch(t.src,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Missing audio');return r.arrayBuffer();}
  const file=await dbGet('audio',id);return file.arrayBuffer();
},()=>nextId(false),onTransport,notify);
function notify(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2700);}
function buttonIcon(el,name,label){if(el.dataset.glyph!==name){el.innerHTML=icon(name);el.dataset.glyph=name;}el.title=label;el.setAttribute('aria-label',label);}
function pressed(el,value){el.classList.toggle('on',!!value);el.setAttribute('aria-pressed',String(!!value));}
function fill(el){el.style.setProperty('--fill',100*(el.value-el.min)/(el.max-el.min)+'%');}
function make(tag,cls,txt){const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;}
function showArt(el,t){
  if(el.dataset.id===t.id&&el.dataset.art===(t.art||''))return;
  el.dataset.id=t.id;el.dataset.art=t.art||'';el.style.backgroundImage=t.art?'url('+JSON.stringify(t.art)+')':'';el.innerHTML=t.art?'':icon('music');
  if(!t.art){let hash=0;for(const c of t.album+t.title)hash=(hash*31+c.charCodeAt(0))|0;el.style.backgroundColor='hsl('+Math.abs(hash%360)+' 20% 24%)';}
  el.classList.remove('changed');void el.offsetWidth;el.classList.add('changed');
}
const savePrefs=()=>save('prefs',prefs);
function visibleTracks(){
  const q=normalized($('search').value.trim());
  if(!q&&(view==='recent'||view==='most'))return listeningList(view);
  const pool=q?tracks:view==='playlist'?listTracks(currentPlaylist()):view==='liked'?[...liked].map(trackById).filter(Boolean):tracks;
  const rows=pool.filter(t=>(!q||normalized([t.title,t.artist,t.album].join(' ')).includes(q)));
  const sort=view==='playlist'&&!q?playlistSort:prefs.sort;
  if(sort==='title')rows.sort((a,b)=>a.title.localeCompare(b.title));
  if(sort==='artist')rows.sort((a,b)=>a.artist.localeCompare(b.artist)||a.title.localeCompare(b.title));
  return rows;
}
let queuePlaylistID='';
function makeQueue(list,first,playlist='') {
  queuePlaylistID=playlist;
  queue=list.map(t=>t.id);
  if(prefs.shuffle){
    queue=queue.filter(id=>id!==first);
    for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
    queue.unshift(first);
  }
}
function nextId(manual,delta=1){
  if(!queue.length)return null;
  if(!manual&&prefs.repeat==='one')return player.id;
  const pos=queue.indexOf(player.id)+delta;
  if(pos>=0&&pos<queue.length)return queue[pos];
  return manual||prefs.repeat==='all'?queue[(pos+queue.length)%queue.length]:null;
}
function playList(list,id,playlist=''){makeQueue(list,id,playlist);player.play(id);}
function toggleLike(id){if(liked.has(id))liked.delete(id);else{liked.add(id);record(trackById(id),0);save('listening',historyStore);}save('liked',[...liked]);renderList();syncTransport();}
function renderList(){
  const q=$('search').value.trim(), rows=visibleTracks();
  const historyKind=!q&&(view==='recent'||view==='most')?view:'';
  $('hero').hidden=view!=='home'||!!q||taste().entries.length>0;
  $('view-title').textContent=q?'Search':view==='home'?'Home':view==='liked'?'Liked tracks':view==='recent'?'Recently played':view==='most'?'Most played':'Library';
  $('count').textContent=view==='home'?'':rows.length+' '+(rows.length===1?'TRACK':'TRACKS');
  $('list-title').textContent=q?'Results':view==='home'?'From your library':'Tracks';
  $('sort').hidden=!!historyKind;
  document.querySelector('.table-head .album-cell').textContent=historyKind==='recent'?'Last played':historyKind==='most'?'Listening':'Album';
  for(const key of ['recent','most'])pressed($('nav-'+key),historyKind===key);
  const playlistView=view==='playlist'&&!q;
  $('sort').title='Sort by '+({library:playlistView?'playlist order':'library order',title:'track title',artist:'artist'}[playlistView?playlistSort:prefs.sort])+' · Click to change';
  $('nav-library').classList.toggle('selected',view==='library');$('nav-liked').classList.toggle('selected',view==='liked');
  $('nav-home').classList.toggle('selected',view==='home');
  const frag=document.createDocumentFragment();
  rows.forEach((t,i)=>{
    const row=make('div','track');row.dataset.id=t.id;
    const index=make('button','index');index.title='Play '+t.title;index.setAttribute('aria-label',index.title);
    index.append(make('span','number',String(i+1).padStart(2,'0')));
    const glyph=make('b','row-play');glyph.innerHTML=icon('play');index.append(glyph);
    const name=make('button','track-name');const art=make('span','art');showArt(art,t);
    const meta=make('span');meta.append(make('strong','track-title',t.title),make('small','',t.artist));name.append(art,meta);
    name.title=t.title+' · '+t.artist;
    const start=()=>{if(player.id===t.id&&(player.playing||player.loading))player.pause();else if(player.id===t.id){makeQueue(rows.filter(item=>trackById(item.id)),t.id,playlistView?playlistID:'');player.play(t.id,player.offset);}else startListTrack(t,rows);};
    name.onclick=index.onclick=start;
    const like=make('button','icon tiny');buttonIcon(like,'heart',(liked.has(t.id)?'Unlike ':'Like ')+t.title);
    like.classList.toggle('liked',liked.has(t.id));like.onclick=()=>toggleLike(t.id);
    const actions=make('span','track-tools');
    if(view==='playlist'&&!q){actions.append(rowAction('Remove from playlist','close',async()=>{const p=currentPlaylist();try{await putPlaylist(p,items=>items.filter(x=>x.id!==t.id));}catch{notify('Could not save playlist');}}));}
    else actions.append(rowAction('Add to playlist','plus',()=>pickPlaylist(t)));
    if(!t.url)actions.append(like);
    if(playlistView){
      row.draggable=true;
      const grip=make('button','drag-grip');buttonIcon(grip,'grip','Drag to reorder');grip.draggable=true;actions.prepend(grip);
    }
    row.append(index,name,make('span','album-cell',historyKind?historyMetric(t,historyKind):t.album||t.provider||''),make('time','',t.duration?time(t.duration):''),actions);frag.append(row);
  });
  if(!rows.length)frag.append(make('p','empty',q?'No matching tracks.':historyKind?'Your listening history will appear here.':view==='playlist'?'Add tracks to this playlist.':view==='liked'?'Tap a heart to keep a track here.':'Import music to start listening.'));
  $('track-list').replaceChildren(frag);syncRows();renderCatalogs();renderHome();paintPlaylists();
}
function syncRows(){document.querySelectorAll('.track').forEach((row,index)=>{
  const active=row.dataset.id===player.id;row.classList.toggle('active',active);
  const indicator=row.querySelector('.number');
  if(active&&player.playing)indicator.innerHTML=icon('wave');
  else indicator.textContent=String(index+1).padStart(2,'0');
  row.querySelector('.row-play').innerHTML=icon(active&&player.playing?'pause':'play');
});}
function syncTransport(){
  const t=trackById(player.id)||tracks[0];
  if($('now-cover').dataset.id!==t.id){
    const info=document.querySelector('.now-info');info.classList.remove('changed');void info.offsetWidth;info.classList.add('changed');
  }
  showArt($('now-cover'),t);$('now-title').textContent=t.title;$('now-artist').textContent=t.artist;
  loadLyrics(t);showArt($('detail-art'),t);$('detail-title').textContent=t.title;$('detail-artist').textContent=t.artist;
  const duration=player.stream?.duration||t.duration;
  $('detail-source').replaceChildren(sourceIcon(t.provider),make('span','',[player.stream?.preview?'Preview':'',duration?time(duration):''].filter(Boolean).join(' · ')));
  if($('now-source').dataset.source!==(t.provider||'Library')){
    $('now-source').dataset.source=t.provider||'Library';$('now-source').replaceChildren(sourceIcon(t.provider));
  }
  document.querySelector('footer').style.setProperty('--sleeve',$('now-cover').style.backgroundImage||'none');
  $('detail-art').hidden=!!player.stream&&t.provider==='YouTube';
  const isStream=!!t.url;
  $('fx-status').hidden=!isStream||!!player.stream?.toneReady;
  $('fx-status').textContent=player.playing?'This stream has not connected to audio effects.':'Settings apply when the stream connects.';
  $('fx-fade').labels[0].querySelector('span').textContent=isStream?'Track fade':'Crossfade';
  $('transition-mode').textContent=isStream?'Fade out / in':settings.fade===0?'Gapless':'';
  $('volume').disabled=isStream&&t.provider==='Spotify'&&!player.stream?.toneReady;
  $('volume').title=$('volume').disabled?'Use Windows volume for this stream':'Volume · '+Math.round(settings.volume*100)+'%';
  for(const row of document.querySelectorAll('[data-result]'))row.classList.toggle('current',row.dataset.result===t.id);
  const top=document.querySelector('.top-result');
  if(top)buttonIcon(top.querySelector('.top-play'),top.dataset.result===t.id&&(player.playing||player.loading)?'pause':'play',top.dataset.result===t.id&&player.playing?'Pause':'Play');
  buttonIcon($('play'),player.playing||player.loading?'pause':'play',player.playing||player.loading?'Pause':'Play');
  buttonIcon($('ly-editor-play'),player.playing||player.loading?'pause':'play',player.playing||player.loading?'Pause':'Play');
  $('now-like').classList.toggle('liked',liked.has(t.id));$('now-like').title=liked.has(t.id)?'Unlike current track':'Like current track';
  pressed($('shuffle'),prefs.shuffle);pressed($('repeat'),prefs.repeat!=='off');
  $('repeat').classList.toggle('repeat-one',prefs.repeat==='one');$('repeat').title='Repeat · '+prefs.repeat;
  $('duration').textContent=duration?time(duration):'–:––';$('seek').max=duration||1;$('seek').disabled=!duration;
  tick();
}
let ticker=0,lastFrame=0;
function tick(){updateLyricLine(player.position());if(!seekDrag){const pos=player.position(),label=time(pos);$('seek').value=pos;if($('elapsed').textContent!==label)$('elapsed').textContent=label;fill($('seek'));}}
function animateSeek(now){
  if(!player.playing)return;
  if(now-lastFrame>=32){tick();if(lyricView.screen)drawOrb();lastFrame=now;}
  ticker=requestAnimationFrame(animateSeek);
}
function remember(){
  if(prefs.remember&&player.id){const t=trackById(player.id);save('session',{id:player.id,pos:player.position(),track:t?.url?reference(t):undefined});}
}
function onTransport(){
  sampleListening();
  syncMeter();if(lyricView.screen)drawOrb();
  syncTransport();syncRows();remember();
  cancelAnimationFrame(ticker);if(player.playing)ticker=requestAnimationFrame(animateSeek);
  if('mediaSession' in navigator){
    const t=trackById(player.id);
    navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album,...(t.art?{artwork:[{src:t.art}]}:{})});
    navigator.mediaSession.playbackState=player.playing?'playing':'paused';
  }
}
function playPause(){if(player.playing||player.loading)player.pause();else player.play(player.id,player.offset);}
function skip(delta){if(delta<0&&player.position()>3){player.seek(0);return;}if(delta>0&&player.playing&&player.position()<8)record(trackById(player.id),0,15);const id=nextId(true,delta);if(id)player.play(id);}
function toggleDesk(value=!prefs.desk){prefs.desk=value;document.querySelector('.workspace').classList.toggle('closed',!value);$('effects').inert=!value;pressed($('desk'),value);savePrefs();}
function go(v){view=v;$('search').value='';renderList();const list=$('track-list');list.classList.remove('page-changed');void list.offsetWidth;list.classList.add('page-changed');}
function toggleMute(){if(settings.volume>0){unmuted=settings.volume;settings.volume=0;}else settings.volume=unmuted||.72;syncEffects();player.apply();save('audio',settings);}
const controlSpecs=[
  ['drive','Distortion',0,100,1,v=>v+'%'],['reverb','Reverb',0,100,1,v=>v+'%'],['echo','Echo',0,100,1,v=>v+'%'],['speed','Speed',.5,2,.01,v=>v.toFixed(2)+'×'],
  ['pitch','Pitch',-12,12,.1,v=>(v>0?'+':'')+v.toFixed(1)+' st'],['fade','Crossfade',0,12,.5,v=>v+' s']
];
function updateRate(key,value){
  settings[key]=value;
  if(settings.linked){
    if(key==='speed')settings.pitch=12*Math.log2(value);
    else settings.speed=2**(value/12);
  }
  player.refreshTime();syncRate();save('audio',settings);
}
function syncRate(){
  for(const [key,,,,,format] of controlSpecs.filter(s=>s[0]==='speed'||s[0]==='pitch')){
    const input=$('fx-'+key);input.value=settings[key];fill(input);$('value-'+key).textContent=format(settings[key]);
  }
  pressed($('link-rate'),settings.linked);$('link-rate').title=settings.linked?'Unlink speed and pitch':'Link speed and pitch';
  document.querySelectorAll('.rate-chip').forEach(btn=>pressed(btn,Math.abs(settings.speed-Number(btn.dataset.rate))<.001));
}
function selectEffect(page){
  document.querySelectorAll('.fx-tab').forEach(btn=>{
    const selected=btn.dataset.page===page;pressed(btn,selected);$(btn.dataset.page+'-page').hidden=!selected;
  });
}
function buildControls(){
  for(const btn of document.querySelectorAll('[data-space]'))btn.onclick=()=>{
    [settings.drive,settings.reverb,settings.echo]=btn.dataset.space.split(',').map(Number);
    player.apply();syncEffects();save('audio',settings);
  };
  for(const speed of [.8,.9,1,1.15,1.25,1.5]){
    const btn=make('button','rate-chip',speed+'×');btn.dataset.rate=speed;btn.onclick=()=>updateRate('speed',speed);$('rate-chips').append(btn);
  }
  document.querySelectorAll('.fx-tab').forEach(btn=>btn.onclick=()=>selectEffect(btn.dataset.page));
  $('link-rate').onclick=()=>{settings.linked=!settings.linked;updateRate('speed',settings.speed);};
  selectEffect('rate');
  controlSpecs.forEach(([key,label,min,max,step])=>{
    const rate=key==='speed'||key==='pitch';
    const wrap=make('div','control'), cap=make('label','range-caption');
    cap.htmlFor='fx-'+key;const out=make('output','range-value');out.id='value-'+key;cap.append(make('span','',label),out);
    const input=make('input');Object.assign(input,{id:'fx-'+key,type:'range',min,max,step});input.setAttribute('aria-label',label);
    input.oninput=()=>{
      if(rate){updateRate(key,Number(input.value));return;}
      settings[key]=Number(input.value);syncEffects();save('audio',settings);
      if(key==='fade'&&!player.stream)return;
      player.apply();
    };
    input.onchange=()=>{if(key==='fade')player.plan();};
    wrap.append(cap,input);
    if(rate){
      const steps=make('div','steps');
      for(const dir of [-1,1]){
        const btn=make('button','step-button',dir<0?'−':'+');
        btn.title=(dir<0?'Decrease ':'Increase ')+label.toLowerCase();btn.setAttribute('aria-label',btn.title);
        btn.onclick=()=>updateRate(key,Math.min(max,Math.max(min,Math.round((settings[key]+dir*step)*100)/100)));
        if(dir===1)steps.append(out);steps.append(btn);
      }
      wrap.append(steps);
    }
    $(rate?'playback-knobs':key==='fade'?'fade-control':'drive-control').append(wrap);
  });
  frequencies.forEach((freq,i)=>{
    const band=make('label','band'),input=make('input','vertical');
    Object.assign(input,{type:'range',min:-12,max:12,step:.5,id:'band-'+i});
    input.setAttribute('aria-label',freq+' Hz gain');input.oninput=()=>{
      settings.eq[i]=Number(input.value);settings.preset='Custom';player.apply();syncEffects();save('audio',settings);
    };
    const out=make('output');out.id='gain-'+i;band.append(input,make('span','',freq>=1000?(freq/1000)+'k':String(freq)),out);$('bands').append(band);
  });
  let grid='';for(let x=0;x<=300;x+=30)grid+='<path d="M'+x+' 0v92"/>';
  for(let y=6;y<92;y+=20)grid+='<path d="M0 '+y+'h300"/>';
  $('grid').innerHTML=grid;$('grid').setAttribute('stroke','#343333');$('grid').setAttribute('stroke-width','.65');
}
const graphCtx=new OfflineAudioContext(1,1,44100);
const graphFilters=frequencies.map((f,i)=>{const b=graphCtx.createBiquadFilter();b.type=i===0?'lowshelf':i===4?'highshelf':'peaking';b.frequency.value=f;b.Q.value=.85;return b;});
const probes=Float32Array.from({length:121},(_,i)=>20*1000**(i/120));
const mag=new Float32Array(probes.length),phase=new Float32Array(probes.length);
function drawCurve(){
  const gains=new Float32Array(probes.length);
  graphFilters.forEach((b,i)=>{b.gain.value=settings.eq[i];b.getFrequencyResponse(probes,mag,phase);mag.forEach((g,j)=>gains[j]+=20*Math.log10(Math.max(.001,g)));});
  const y=j=>Math.min(90,Math.max(2,46-gains[j]*2.7));
  const line=gains.reduce((s,g,i)=>s+(i?'L':'M')+(i*2.5)+' '+y(i).toFixed(2),'');
  $('curve').setAttribute('d',line);$('fill-path').setAttribute('d',line+'L300 92H0Z');
  $('points').innerHTML=frequencies.map(f=>{const x=300*Math.log(f/20)/Math.log(1000);return '<circle cx="'+x+'" cy="'+y(Math.round(x/2.5))+'" r="3" fill="#ff835c" stroke="#191819" stroke-width="1.3"/>';}).join('');
}
function syncEffects(){
  const opts=[...Object.keys(eqPresets),...userPresets.map(p=>p.name)];
  if(!opts.includes(settings.preset))opts.push('Custom');
  $('preset').replaceChildren(...opts.map(n=>new Option(n,n)));$('preset').value=settings.preset;
  settings.eq.forEach((v,i)=>{$('band-'+i).value=v;$('gain-'+i).textContent=(v>0?'+':'')+v;});
  controlSpecs.forEach(([key,,,,,format])=>{const el=$('fx-'+key);el.value=settings[key];fill(el);$('value-'+key).textContent=format(settings[key]);});
  syncRate();
  $('transition-mode').textContent=trackById(player.id)?.url?'Fade out / in':settings.fade===0?'Gapless':'';
  for(const btn of document.querySelectorAll('[data-space]'))pressed(btn,btn.dataset.space===[settings.drive,settings.reverb,settings.echo].join(','));
  $('volume').value=settings.volume;$('volume').title='Volume · '+Math.round(settings.volume*100)+'%';fill($('volume'));
  buttonIcon($('mute'),settings.volume?'volume':'mute',settings.volume?'Mute':'Unmute');pressed($('bypass'),!settings.bypass);
  $('bypass').title=settings.bypass?'Enable audio effects':'Bypass audio effects';
  $('bypass').setAttribute('aria-label',$('bypass').title);
  drawCurve();
}
function setEQ(name,values){settings.preset=name;settings.eq=values.slice();player.apply();syncEffects();save('audio',settings);}
let importing=false;
async function importFiles(files){
  if(importing){notify('Import in progress.');return;}
  importing=true;$('import').disabled=true;
  let added=0,duplicates=0,failed=0;
  for(const file of files){
    const id='file:'+file.name+':'+file.size+':'+file.lastModified;
    if(trackById(id)){duplicates++;continue;}
    try{
      const duration=await readDuration(file), tags=await readTags(file);
      const meta={id,duration,...tags};
      await storeFile(meta,file);tracks.push(meta);added++;
    }catch{failed++;}
  }
  importing=false;$('import').disabled=false;$('files').value='';
  if(added){go('library');if(!player.playing){makeQueue(visibleTracks(),player.id);}}
  notify([added?added+' imported':'',duplicates?duplicates+' already in library':'',failed?failed+' could not be imported':''].filter(Boolean).join(' · ')||'No files selected');
}
let sleepDeadline=0,sleepTimeout;
function checkSleepTimer(){
  if(!sleepDeadline||Date.now()<sleepDeadline)return;
  sleepDeadline=0;$('sleep-timer').value='0';$('sleep-until').textContent='';
  if(player.playing||player.loading)player.pause();
  notify('Sleep timer finished');
}
function setSleepTimer(ms){
  clearTimeout(sleepTimeout);sleepDeadline=ms?Date.now()+ms:0;
  $('sleep-until').textContent=ms?'Pauses at '+new Date(sleepDeadline).toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'}):'';
  if(ms)sleepTimeout=setTimeout(checkSleepTimer,ms);
}
function events(){
  $('sleep-timer').onchange=e=>setSleepTimer(Number(e.target.value)*60000);
  document.addEventListener('visibilitychange',checkSleepTimer);
  $('import').onclick=()=>$('files').click();$('files').onchange=e=>importFiles([...e.target.files]);
  document.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();document.body.classList.add('drag');}};
  document.ondragleave=e=>{if(!e.relatedTarget)document.body.classList.remove('drag');};
  document.ondrop=e=>{e.preventDefault();document.body.classList.remove('drag');if(e.dataTransfer.files.length)importFiles([...e.dataTransfer.files]);};
  $('nav-library').onclick=()=>go('library');$('nav-liked').onclick=()=>go('liked');$('search').oninput=renderList;
  $('sort').onclick=()=>{const order=['library','title','artist'],inPlaylist=view==='playlist'&&!$('search').value.trim();const next=order[(order.indexOf(inPlaylist?playlistSort:prefs.sort)+1)%3];if(inPlaylist)playlistSort=next;else{prefs.sort=next;savePrefs();}renderList();notify($('sort').title.split(' · ')[0]);};
  $('desk').onclick=()=>toggleDesk();$('close-effects').onclick=()=>toggleDesk(false);
  document.addEventListener('pointerdown',e=>{if(prefs.desk&&!e.target.closest('#effects,#desk,dialog'))toggleDesk(false);});
  $('play-ep').onclick=()=>playList(demoTracks,demoTracks[0].id);
  $('play').onclick=playPause;$('next').onclick=()=>skip(1);$('prev').onclick=()=>skip(-1);$('now-like').onclick=()=>toggleLike(player.id);
  $('now-add').onclick=()=>pickPlaylist(trackById(player.id));
  $('shuffle').onclick=()=>{prefs.shuffle=!prefs.shuffle;makeQueue(queue.map(trackById).filter(Boolean),player.id,queuePlaylistID);player.plan();syncTransport();savePrefs();};
  $('repeat').onclick=()=>{const modes=['off','all','one'];prefs.repeat=modes[(modes.indexOf(prefs.repeat)+1)%3];player.plan();syncTransport();savePrefs();notify('Repeat '+prefs.repeat);};
  $('seek').oninput=e=>{seekDrag=true;$('elapsed').textContent=time(+e.target.value);fill(e.target);};
  $('seek').onchange=e=>{seekDrag=false;player.seek(+e.target.value);};$('seek').onblur=()=>{seekDrag=false;};
  $('mute').onclick=toggleMute;$('volume').oninput=e=>{settings.volume=+e.target.value;player.apply();syncEffects();save('audio',settings);};
  $('preset').onchange=e=>{const name=e.target.value;const values=eqPresets[name]||userPresets.find(p=>p.name===name)?.eq;if(values)setEQ(name,values);};
  $('reset-eq').onclick=()=>setEQ('Flat',eqPresets.Flat);
  $('bypass').onclick=()=>{settings.bypass=!settings.bypass;player.refreshTime();syncEffects();save('audio',settings);notify(settings.bypass?'Effects bypassed':'Effects enabled');};
  $('reset-audio').onclick=()=>{Object.assign(settings,structuredClone(audioDefaults));player.refreshTime();player.plan();syncEffects();save('audio',settings);notify('Audio settings reset');};
  $('save-preset').onclick=()=>{$('preset-name').value='';$('preset-name').setCustomValidity('');$('preset-dialog').returnValue='';$('preset-dialog').showModal();$('preset-name').focus();};
  $('preset-name').oninput=e=>{const name=e.target.value.trim();e.target.setCustomValidity(!name||['Custom',...Object.keys(eqPresets)].some(n=>n.toLowerCase()===name.toLowerCase())?'Choose a different name.':'');};
  $('preset-dialog').onclose=()=>{if($('preset-dialog').returnValue!=='save')return;const name=$('preset-name').value.trim();if(!name)return;userPresets=userPresets.filter(p=>p.name!==name);userPresets.push({name,eq:settings.eq.slice()});save('presets',userPresets);setEQ(name,settings.eq);};
  $('settings-open').onclick=()=>$('settings').showModal();
  $('manage-imports').onclick=()=>{renderImports();$('imports-dialog').showModal();};
  document.querySelectorAll('[data-dismiss]').forEach(el=>el.onclick=()=>el.closest('dialog').close('cancel'));
  $('motion').checked=prefs.motion;document.body.classList.toggle('reduced',prefs.motion);
  $('motion').onchange=e=>{prefs.motion=e.target.checked;document.body.classList.toggle('reduced',prefs.motion);savePrefs();syncMeter();drawOrb();};
  $('remember').checked=prefs.remember;$('remember').onchange=e=>{prefs.remember=e.target.checked;savePrefs();if(prefs.remember)remember();else save('session',null);};
  document.onkeydown=e=>{
    if(e.key==='Tab'||e.key==='F7'){e.preventDefault();return;}
    if(e.key==='Escape'&&prefs.desk&&!document.querySelector('dialog[open]')){toggleDesk(false);return;}
    if(document.querySelector('dialog[open]'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('search').focus();return;}
    if(e.target.matches('input,select,textarea')||e.ctrlKey||e.altKey||e.metaKey)return;
    if(e.code==='Space'&&!e.target.closest('button')){e.preventDefault();playPause();}
    if(e.key.toLowerCase()==='e')toggleDesk();if(e.key.toLowerCase()==='m')toggleMute();
  };
  window.addEventListener('pagehide',remember);document.addEventListener('visibilitychange',()=>{if(document.hidden)remember();});
  if('mediaSession' in navigator)for(const [key,fn] of Object.entries({play:()=>player.play(player.id,player.offset),pause:()=>player.pause(),nexttrack:()=>skip(1),previoustrack:()=>skip(-1),seekto:e=>player.seek(e.seekTime)})){try{navigator.mediaSession.setActionHandler(key,fn);}catch{}}
}
function renderImports(){
  const list=$('imports-list');list.replaceChildren();
  for(const t of tracks.filter(track=>!track.src)){
    const row=make('div','import-row'), label=make('span','',t.title),remove=make('button','icon tiny');
    buttonIcon(remove,'trash','Remove '+t.title+' from library');row.append(label,remove);list.append(row);
    remove.onclick=async()=>{
      remove.disabled=true;
      try{
        await removeFile(t.id);
        if(player.id===t.id)player.pause();
        tracks=tracks.filter(other=>other.id!==t.id);queue=queue.filter(id=>id!==t.id);
        liked.delete(t.id);save('liked',[...liked]);
        if(player.id===t.id){
          player.id=tracks[0].id;player.offset=0;
          makeQueue(tracks,player.id);player.trim([]);onTransport();
        }else player.plan();
        renderImports();renderList();notify('Removed from library');
      }catch{remove.disabled=false;notify('Could not remove this track.');}
    };
  }
  if(!list.childElementCount)list.append(make('p','empty','Your imported tracks will appear here.'));
}
async function boot(){
  paintIcons();buildControls();events();initAudioExport();initTrackTools();initWindowUI();initLyrics();initSources();toggleDesk(prefs.desk);syncEffects();
  try{tracks.push(...await dbGet('tracks'));await initPlaylists();}catch{notify('Local storage is unavailable.');}
  const last=prefs.remember?stored('session',{}):{};
  if(last.track&&sharedTrack(last.track.url))indexRemote([last.track]);
  const t=trackById(last.id)||tracks[0];player.id=t.id;player.offset=Math.max(0,Math.min(last.pos||0,(t.duration||0)-.05));
  makeQueue(t.url||isAudius(t)?[t,...tracks]:tracks,t.id);initHome();renderList();syncTransport();
  let lastSaved=0;
  setInterval(()=>{if(player.playing&&Math.abs(player.position()-lastSaved)>2){remember();lastSaved=player.position();}},5000);
}
boot();
