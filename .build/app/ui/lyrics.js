'use strict';
const lyricView={key:'',doc:null,track:null,lines:[],active:-1,screen:false,version:0,translationJob:0};
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
function syncMeter(){
  const s=player.stream;
  if(!s?.ready||!s.toneReady)return;
  const enabled=lyricView.screen&&player.playing&&!prefs.motion&&!motionPreference.matches&&!document.hidden&&s.track.provider!=='YouTube';
  if(s.meterEnabled!==enabled){s.meterEnabled=enabled;player.send('meter',enabled);}
}
function drawOrb(){
  if(!lyricView.screen||player.stream?.track.provider==='YouTube'||document.hidden)return;
  const canvas=$('stage-orb').firstElementChild,ctx=canvas.getContext('2d');
  let bands;
  if(player.playing&&!prefs.motion&&!motionPreference.matches){
    if(player.stream)bands=player.stream.bands;
    else if(player.master){player.spectrum||=createSpectrum(player.ctx,player.master);bands=player.spectrum();}
  }
  ctx.clearRect(0,0,480,480);ctx.lineCap='round';ctx.lineWidth=4.5;
  for(let i=0;i<64;i++){
    const angle=i*Math.PI/32,amp=(bands?.[i<32?i:63-i]||0)/255;
    const x=Math.cos(angle),y=Math.sin(angle),base=162,end=base+3+67*amp**1.8;
    ctx.strokeStyle='rgba(255,206,180,'+(.30+.66*amp)+')';
    ctx.beginPath();ctx.moveTo(240+x*base,240+y*base);ctx.lineTo(240+x*end,240+y*end);ctx.stroke();
  }
}
document.addEventListener('visibilitychange',()=>{syncMeter();drawOrb();});
motionPreference.addEventListener('change',()=>{syncMeter();drawOrb();});
const languageNames={en:'English','pt-BR':'Portuguese (Brazil)',es:'Spanish',fr:'French',de:'German',it:'Italian',ja:'Japanese',ko:'Korean'};
let lyricPrefs,editTrack,manualScrollUntil=0;
function lyricName(s){return normalized(String(s||'')).replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function lyricIdentity(t){
  let artist=(t.artist||'').replace(/\s+-\s+Topic$/i,'').trim();
  let title=(t.title||'').replace(/\s*[([](?:official (?:music )?(?:video|audio)|lyrics?(?: video)?|visuali[sz]er)[)\]]/ig,'').trim();
  const split=title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if(split&&(t.provider==='YouTube'||lyricName(split[1])===lyricName(artist))){artist=split[1];title=split[2];}
  return {title,artist};
}
function parseLyrics(text){
  const rows=[];let shift=0;
  for(const raw of String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    const offset=line.match(/^\[offset:\s*([+-]?\d+)\]$/i);
    if(offset){shift=Number(offset[1])/1000;continue;}
    if(/^\[[a-z]+:[^\]]*\]$/i.test(line))continue;
    const tags=line.match(/^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/)?.[0];
    if(!tags){rows.push({text:line});continue;}
    const words=line.slice(tags.length).trim();
    for(const m of tags.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)){
      if(Number(m[2])<60)rows.push({at:60*Number(m[1])+Number(m[2])+Number('0.'+(m[3]||0)),text:words});
    }
  }
  for(const l of rows)if(l.at!==undefined)l.at=Math.max(0,l.at-shift);
  return rows.every(l=>l.at!==undefined)?rows.sort((a,b)=>a.at-b.at):rows;
}
async function changeLyrics(id,update){
  const db=await libraryDB;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('lyrics','readwrite'),store=tx.objectStore('lyrics');let result;
    const request=store.get(id);request.onsuccess=()=>{
      result=update(request.result||{id});if(result)store.put(result);
    };
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
  });
}
function bestLyrics(rows,t,identity){
  const title=lyricName(identity.title),artist=lyricName(identity.artist);
  const duration=player.stream?.preview?0:t.duration;
  const hits=rows.filter(x=>lyricName(x.trackName)===title&&lyricName(x.artistName)===artist&&
    (!duration||!x.duration||Math.abs(x.duration-duration)<=7));
  const score=x=>(x.syncedLyrics?3:0)-Math.abs(duration&&x.duration?duration-x.duration:0);
  return hits.sort((a,b)=>score(b)-score(a))[0];
}
async function lookupLyrics(t,identity){
  if(demoTracks.some(x=>x.id===t.id))return {raw:'',source:'Fader Studio',instrumental:true};
  const {value}=await bridge('publicData',{name:'Lyrics',query:identity.title.slice(0,240),matches:identity.artist.slice(0,240)});
  const hit=bestLyrics(JSON.parse(value),t,identity);
  return {raw:hit?.syncedLyrics||hit?.plainLyrics||'',source:hit?'LRCLIB':'',instrumental:!!hit?.instrumental};
}
function loadLyrics(t,force=false){
  const identity=lyricIdentity(t),key=JSON.stringify([t.id,identity.title,identity.artist]);
  document.body.style.setProperty('--ly-art',t.art?'url('+JSON.stringify(t.art)+')':'none');
  if(lyricView.key===key&&!force){
    if(lyricView.doc&&lyricView.preview!==!!player.stream?.preview)paintLyrics();
    return;
  }
  if($('ly-translator').open)$('ly-translator').close();
  const version=++lyricView.version;
  lyricView.translationJob++;lyricView.track=t;lyricView.key=key;lyricView.doc=null;
  manualScrollUntil=0;
  paintLyrics('Looking for lyrics…');
  (async()=>{
    const cached=await dbGet('lyrics',t.id);
    if(version!==lyricView.version)return;
    if(cached&&(cached.edited||!force&&cached.lookupKey===key&&Date.now()-cached.checked<(cached.raw||cached.instrumental?30*86400000:6*3600000))){
      lyricView.doc=cached;paintLyrics();return;
    }
    if(cached?.raw){lyricView.doc=cached;paintLyrics();}
    try{
      const result=await lookupLyrics(t,identity);
      if(version!==lyricView.version)return;
      const updated=await changeLyrics(t.id,d=>d.edited?d:{...d,...result,lookupKey:key,checked:Date.now(),translations:d.raw===result.raw?d.translations:{},translation:d.raw===result.raw?d.translation:''});
      if(version===lyricView.version){lyricView.doc=updated;paintLyrics();}
    }catch{
      if(version===lyricView.version){lyricView.doc=cached||{id:t.id};paintLyrics(cached?.raw?'':'Lyrics lookup unavailable');}
    }
  })().catch(()=>{if(version===lyricView.version){lyricView.doc={id:t.id};paintLyrics('Could not read the lyrics cache');}});
}
function paintLyrics(message=''){
  cancelAnimationFrame(lyricScrollFrame);
  const d=lyricView.doc||{},box=$('ly-lines');
  lyricView.preview=!!player.stream?.preview;
  const lines=lyricView.lines=parseLyrics(d.raw);
  const synced=lines.some(l=>l.at!==undefined)&&!player.stream?.preview;
  lyricView.timeline=lines.flatMap((l,index)=>l.at===undefined?[]:[{at:l.at,index}]).sort((a,b)=>a.at-b.at);
  lyricView.synced=synced;lyricView.active=-1;
  box.classList.toggle('synced',synced);box.replaceChildren();box.scrollTop=0;
  const translated=d.translations?.[d.translation];
  lines.forEach((l,i)=>{
    const seekable=synced&&l.at!==undefined;
    const row=make(seekable?'button':'p','ly-line',l.text||'♪');row.dir='auto';
    if(seekable)row.dataset.time=time(l.at);
    if(seekable){row.title='Seek to '+time(l.at);row.onclick=()=>{manualScrollUntil=0;player.seek(Math.max(0,Math.min(Number($('seek').max),l.at+(d.offset||0))));};}
    if(translated?.[i]){const tr=make('small','',translated[i]);tr.dir='auto';row.append(tr);}
    box.append(row);
  });
  if(!lines.length){
    const empty=make('div','ly-empty');const glyph=make('span','ly-empty-icon');glyph.innerHTML=icon('lyrics');
    empty.append(glyph,make('p','',message||(d.instrumental?'Instrumental':'No lyrics found')));
    if(lyricView.doc){const add=make('button','ly-empty-action','Add lyrics');add.onclick=openLyricEditor;empty.append(add);}
    box.append(empty);
  }
  $('ly-source').textContent=[d.edited?'Your lyrics':d.source,lines.length?(synced?'Synced':'Plain text'):''].filter(Boolean).join(' · ');
  $('ly-retry').hidden=!lyricView.doc||d.edited||d.instrumental;
  $('ly-language').disabled=!lines.length;
  pressed($('ly-language'),!!translated);
  $('ly-offset').value=d.offset||0;$('ly-offset').disabled=!synced;
  if(lines.length&&!prefs.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    box.animate([{opacity:.55,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:210,easing:'ease-out'});
  }
  updateLyricLine(player.position(),true);
}
let lyricScrollFrame=0;
function centerLyric(instant=false){
  cancelAnimationFrame(lyricScrollFrame);
  if(!lyricPrefs?.follow||Date.now()<manualScrollUntil)return;
  const box=$('ly-lines'),row=box.children[lyricView.active];if(!row||!box.clientHeight)return;
  const top=box.scrollTop+row.getBoundingClientRect().top-box.getBoundingClientRect().top-(box.clientHeight-row.offsetHeight)*.42;
  const start=box.scrollTop,end=Math.max(0,Math.min(top,box.scrollHeight-box.clientHeight));
  if(instant||prefs.motion||matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(end-start)<2){box.scrollTop=end;return;}
  const at=performance.now(),duration=Math.min(530,235+Math.abs(end-start)*.42);
  const move=now=>{
    const p=Math.min(1,(now-at)/duration);
    box.scrollTop=start+(end-start)*p*p*(3-2*p);
    if(p<1)lyricScrollFrame=requestAnimationFrame(move);
  };
  lyricScrollFrame=requestAnimationFrame(move);
}
function updateLyricLine(pos,force=false){
  if(!lyricView.synced)return;
  const lines=lyricView.timeline,target=pos-(lyricView.doc?.offset||0);
  let lo=0,hi=lines.length;while(lo<hi){const m=(lo+hi)>>1;if(lines[m].at<=target+.025)lo=m+1;else hi=m;}
  const index=lo?lines[lo-1].index:-1,box=$('ly-lines');
  if(index===lyricView.active&&!force)return;
  box.children[lyricView.active]?.classList.remove('active');lyricView.active=index;
  box.children[index]?.classList.add('active');centerLyric(force);
}
async function lyricsScreen(enabled){
  if(lyricView.screen===enabled)return;
  lyricView.screen=enabled;document.body.classList.toggle('lyrics-screen',enabled);
  syncMeter();drawOrb();
  if(enabled&&prefs.desk)toggleDesk(false);
  buttonIcon($('ly-expand'),enabled?'shrink':'expand',enabled?'Exit full screen':'Full-screen lyrics');
  buttonIcon($('ly-footer'),enabled?'shrink':'lyrics',enabled?'Exit full screen':'Full-screen lyrics');
  requestAnimationFrame(()=>centerLyric(true));
  try{await bridge('lyricsScreen',{enabled});}catch{notify('Window resizing is unavailable');}
}
function openLyricEditor(){
  editTrack={id:lyricView.track.id,title:lyricView.track.title,artist:lyricView.track.artist,edited:!!lyricView.doc?.edited};
  $('ly-edit-track').textContent=editTrack.title+' · '+editTrack.artist;
  $('ly-text').value=lyricView.doc?.raw||'';$('ly-file').value='';
  $('ly-editor').showModal();$('ly-text').focus();
}
function stampLyric(){
  if(editTrack.id!==player.id){notify('Play the track being edited');return;}
  const el=$('ly-text'),v=el.value,pos=el.selectionStart,start=v.lastIndexOf('\n',pos-1)+1;
  const end=v.indexOf('\n',pos),line=v.slice(start,end<0?v.length:end);
  const seconds=Math.floor(player.position()*100);
  const tag='['+String(Math.floor(seconds/6000)).padStart(2,'0')+':'+String(Math.floor(seconds/100)%60).padStart(2,'0')+'.'+String(seconds%100).padStart(2,'0')+'] ';
  const replacement=tag+line.replace(/^(?:\[\d+:\d{2}(?:[.:]\d+)?\]\s*)+/,'');
  el.setRangeText(replacement,start,end<0?v.length:end,'end');
  const next=Math.min(el.value.length,start+replacement.length+1);el.focus();el.setSelectionRange(next,next);
}
async function saveLyricEdits(e){
  e.preventDefault();const id=editTrack.id,raw=$('ly-text').value.trim();
  if(raw&&!parseLyrics(raw).length){notify('Add a lyric line before saving');return;}
  if(!raw&&!editTrack.edited){$('ly-editor').close();return;}
  try{
    await changeLyrics(id,d=>d.raw===raw?d:{...d,raw,source:'',instrumental:false,edited:!!raw,checked:0,translations:{},translation:''});
    if(lyricView.track.id===id)loadLyrics(lyricView.track,true);
    $('ly-editor').close();notify(raw?'Lyrics saved':'Using online lyrics');
  }catch{notify('Could not save lyrics');}
}
async function translateLine(text,from,to){
  const chunks=[];let current='',bytes=0;
  for(const ch of text){const size=new TextEncoder().encode(ch).length;if(bytes+size>480){chunks.push(current);current='';bytes=0;}current+=ch;bytes+=size;}
  if(current)chunks.push(current);
  const output=[];
  for(const q of chunks){
    const url=new URL('https://api.mymemory.translated.net/get');url.search=new URLSearchParams({q,langpair:from+'|'+to});
    const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Translation service unavailable');
    const data=await r.json();
    if(data.quotaFinished||Number(data.responseStatus)===429)throw Error('Translation quota reached. Try again later.');
    if(Number(data.responseStatus)!==200||!data.responseData?.translatedText)throw Error('This language pair is unavailable.');
    const doc=new DOMParser().parseFromString('<textarea>'+data.responseData.translatedText.replace(/</g,'&lt;')+'</textarea>','text/html');
    output.push(doc.querySelector('textarea').value);
  }
  return output.join(' ');
}
async function translateLyrics(e){
  e.preventDefault();const d=lyricView.doc,from=$('ly-from').value,to=$('ly-to').value;
  if(!d?.raw)return;
  if(from===to){$('ly-tr-status').textContent='Choose two different languages.';return;}
  Object.assign(lyricPrefs,{from,to});save('lyricsPrefs',lyricPrefs);
  const key=from+'|'+to,job=++lyricView.translationJob,lines=lyricView.lines.slice();
  const button=$('ly-translate');button.disabled=true;
  try{
    let result=d.translations?.[key];
    if(!result){
      const memo=new Map();result=[];
      for(let i=0;i<lines.length;i++){
        if(job!==lyricView.translationJob)return;
        $('ly-tr-status').textContent='Translating '+(i+1)+' / '+lines.length;
        const text=lines[i].text;if(text&&!memo.has(text))memo.set(text,await translateLine(text,from,to));
        result.push(memo.get(text)||'');
      }
    }
    if(job!==lyricView.translationJob)return;
    const updated=await changeLyrics(d.id,current=>current.raw===d.raw?{...current,translations:{...current.translations,[key]:result},translation:key}:current);
    if(job!==lyricView.translationJob)return;
    lyricView.doc=updated;paintLyrics();$('ly-translator').close();
  }catch(error){if(job===lyricView.translationJob)$('ly-tr-status').textContent=error.message||'Translation unavailable.';}
  finally{if(job===lyricView.translationJob)button.disabled=false;}
}
function initLyrics(){
  lyricPrefs=Object.assign({follow:true,size:'normal',from:'en',to:'pt-BR'},stored('lyricsPrefs',{}));
  $('ly-follow').checked=lyricPrefs.follow;$('ly-size').value=lyricPrefs.size;document.body.dataset.lyricSize=lyricPrefs.size;
  $('ly-follow').onchange=e=>{lyricPrefs.follow=e.target.checked;save('lyricsPrefs',lyricPrefs);manualScrollUntil=0;centerLyric(true);};
  $('ly-size').onchange=e=>{document.body.dataset.lyricSize=lyricPrefs.size=e.target.value;save('lyricsPrefs',lyricPrefs);centerLyric(true);};
  $('ly-offset').onchange=async e=>{
    const d=lyricView.doc;if(!d)return;const offset=Math.max(-30,Math.min(30,Number(e.target.value)||0));
    try{const updated=await changeLyrics(d.id,item=>({...item,offset}));if(lyricView.doc?.id===d.id){lyricView.doc=updated;e.target.value=offset;updateLyricLine(player.position(),true);}}catch{notify('Could not save timing');}
  };
  $('ly-settings').onclick=()=>$('ly-options').showModal();
  $('ly-expand').onclick=$('ly-footer').onclick=()=>lyricsScreen(!lyricView.screen);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&lyricView.screen&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopImmediatePropagation();lyricsScreen(false);}},true);
  $('ly-lines').onwheel=$('ly-lines').ontouchmove=()=>{cancelAnimationFrame(lyricScrollFrame);manualScrollUntil=Date.now()+3800;};
  $('ly-retry').onclick=()=>loadLyrics(lyricView.track,true);
  $('ly-edit').onclick=openLyricEditor;$('ly-edit-form').onsubmit=saveLyricEdits;$('ly-stamp').onclick=stampLyric;
  $('ly-editor-play').onclick=()=>{if(editTrack.id===player.id)playPause();else notify('Play the track being edited');};
  $('ly-file-btn').onclick=()=>$('ly-file').click();
  $('ly-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>100000){notify('Choose a lyric file under 100 KB');return;}try{$('ly-text').value=await f.text();}catch{notify('Could not read the file');}};
  for(const id of ['ly-from','ly-to'])for(const [code,name] of Object.entries(languageNames))$(id).add(new Option(name,code));
  $('ly-language').onclick=()=>{$('ly-from').value=lyricPrefs.from;$('ly-to').value=lyricPrefs.to;$('ly-tr-status').textContent='Translate these lyrics with MyMemory.';$('ly-translate').disabled=false;$('ly-translator').showModal();};
  $('ly-tr-form').onsubmit=translateLyrics;
  $('ly-translator').addEventListener('close',()=>{lyricView.translationJob++;$('ly-translate').disabled=false;});
  $('ly-original').onclick=async()=>{const d=lyricView.doc;if(!d)return;lyricView.translationJob++;try{const updated=await changeLyrics(d.id,item=>({...item,translation:''}));if(lyricView.doc?.id===d.id){lyricView.doc=updated;paintLyrics();}$('ly-translator').close();}catch{notify('Could not save preference');}};
  new ResizeObserver(()=>centerLyric(true)).observe($('ly-lines'));
}
