const sources=['SoundCloud','YouTube','Spotify'];
const requests=new Map();
let serial=0,revision=0,configured=[],searchKey='',catalogRows=new Map();
let searchTimer=0;
const recentQueries=new Map();
function bridge(action,fields={}){
  const seq=++serial;
  return new Promise((resolve,reject)=>{
    if(!window.chrome?.webview){reject(Error('Desktop host unavailable'));return;}
    const timeout=setTimeout(()=>{requests.delete(seq);reject(Error('Timed out'));},action==='quickAudio'?180000:24000);
    requests.set(seq,reply=>{clearTimeout(timeout);reply.ok?resolve(reply):reject(Error('Request failed'));});
    chrome.webview.postMessage({seq,action,...fields});
  });
}
function activeSources(source=prefs.source){return source==='All'?sources:sources.filter(n=>n===source);}
function sharedTrack(query){
  try{
    const u=new URL(query);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    const h=u.hostname;
    if(h==='open.spotify.com'&&/^\/(?:intl-[a-z]+\/)?track\/[a-z0-9]+\/?$/i.test(u.pathname))return 'Spotify';
    if(h==='youtu.be'||(['youtube.com','www.youtube.com','music.youtube.com','m.youtube.com'].includes(h)&&u.pathname==='/watch'&&u.searchParams.get('v')))return 'YouTube';
    if(['soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(h)&&u.pathname.split('/').filter(Boolean).length>=2)return 'SoundCloud';
  }catch{}
  return null;
}
function webTrack(provider,row){
  const id='web:'+row.url,existing=remoteTracks.get(id);
  if(existing){
    if(row.art)existing.art=safeArt(row.art);
    if(row.duration)existing.duration=row.duration;
    return existing;
  }
  const t={...row,id,provider,art:safeArt(row.art),duration:Number(row.duration)||0,album:provider};
  remoteTracks.set(id,t);return t;
}
function linkedResult(provider,url){
  const slug=new URL(url).pathname.split('/').filter(Boolean).at(-1);
  let title=provider+' track';
  if(provider==='SoundCloud'){try{title=decodeURIComponent(slug);}catch{title=slug;}}
  return webTrack(provider,{url,title,artist:provider});
}
function browseSource(name,query,url='',title='',artist=''){
  if(sharedTrack(url)!==name)return;
  const t=webTrack(name,{url,title:title||name,artist});
  playList([t],t.id);
}
function matchesScore(t,query){
  const text=normalized(t.title+' '+t.artist),title=normalized(t.title),artist=normalized(t.artist||''),q=normalized(query);
  const words=q.split(/\s+/).filter(Boolean);
  return (title===q?16:0)+(text.includes(q)?6:0)+words.reduce((n,w)=>n+(text.includes(w)?3:0)+(title===w?2:0)+(artist.includes(w)?2:0),0);
}
function resultImage(t){
  const art=make('span','art result-art');showArt(art,t);return art;
}
function playResult(t,rows){
  if(player.id===t.id&&(player.playing||player.loading)){player.pause();return;}
  makeQueue(rows,t.id);player.play(t.id,player.id===t.id?player.offset:0);
}
function resultRow(t,rows,i){
  const line=make('div','online-line');line.dataset.result=t.id;
  line.classList.toggle('current',player.id===t.id);
  const btn=make('button','online-track'),meta=make('span','result-meta');
  const number=make('span','result-index',String(i+1)),glyph=make('span','result-glyph');glyph.innerHTML=icon('play');number.append(glyph);
  const credit=make('small','song-credit');credit.append(sourceIcon(t.provider),make('span','',t.artist));
  meta.append(make('strong','',t.title),credit);
  btn.append(number,resultImage(t),meta,make('time','',t.duration?time(t.duration):''));
  btn.onclick=()=>playResult(t,rows);btn.title='Play '+t.title;
  line.append(btn,rowAction('Add to playlist','plus',()=>pickPlaylist(t)));return line;
}
function renderCatalogs(){
  const query=$('search').value.trim(),key=prefs.source+'|'+query;
  const filter=$('source-glyph');
  if(filter.dataset.source!==prefs.source){filter.dataset.source=prefs.source;filter.replaceChildren(sourceIcon(prefs.source||'All'));$('source').title='Search source · '+(prefs.source||'All');}
  if(key!==searchKey){revision++;catalogRows.clear();searchKey=key;}
  const online=!!query&&activeSources().length>0;
  for(const el of [document.querySelector('.section-line'),document.querySelector('.table-head'),$('track-list')])el.hidden=online;
  const panel=$('catalog-results');panel.hidden=!online;panel.replaceChildren();
  if(!online)return;
  const direct=sharedTrack(query),rows=[],hints=[];
  if(direct&&activeSources().includes(direct)){
    rows.push(linkedResult(direct,query));
  }else{
    if(prefs.source==='All')rows.push(...visibleTracks());
    const messages={busy:'Searching…',access:'Check API access in Settings',limit:'Search quota reached',unavailable:'Service unavailable'};
    for(const name of activeSources()){
      const data=catalogRows.get(name);
      for(const r of data?.rows||[])if(sharedTrack(r.url)===name)rows.push(webTrack(name,r));
      if(messages[data?.status])hints.push(name+' · '+messages[data.status]);
    }
  }
  rows.sort((a,b)=>matchesScore(b,query)-matchesScore(a,query));
  const t=rows[0];
  if(t){
    const layout=make('div','search-grid'),top=make('section'),songs=make('section');
    const card=make('button','top-result'),title=make('strong','',t.title);
    const badge=make('span','top-play');card.dataset.result=t.id;badge.innerHTML=icon(player.id===t.id&&(player.playing||player.loading)?'pause':'play');
    const credit=make('small','song-credit');credit.append(sourceIcon(t.provider),make('span','',t.artist));
    card.append(resultImage(t),title,credit,badge);
    card.onclick=()=>playResult(t,rows);card.title='Play '+t.title;
    top.append(make('h2','','Top result'),card);
    songs.append(make('h2','','Songs'));
    rows.slice(0,4).forEach((track,i)=>songs.append(resultRow(track,rows,i)));
    layout.append(top,songs);panel.append(layout);
    if(rows.length>4){const more=make('div','more-results');rows.slice(4).forEach((track,i)=>more.append(resultRow(track,rows,i+4)));panel.append(more);}
  }
  if(hints.length||!t)panel.append(make('p','source-status',hints.join('   ·   ')||(catalogRows.size?'No matches':'Searching…')));
}
async function catalogLookup(name,query){
  const key=JSON.stringify([name,query,configured.includes(name)]);
  let entry=recentQueries.get(key);
  if(!entry||Date.now()-entry.at>300000){
    const task=configured.includes(name)?bridge('search',{name,query}).then(r=>r.value):searchPublic(name,query).then(rows=>({status:'ok',rows}));
    entry={at:Date.now(),task};recentQueries.set(key,entry);
    if(recentQueries.size>36)recentQueries.delete(recentQueries.keys().next().value);
  }
  let result;
  try{result=await entry.task;}catch{result={status:'unavailable'};}
  if(result.status!=='ok'&&recentQueries.get(key)===entry)recentQueries.delete(key);
  return result;
}
async function submitCatalogs(){
  clearTimeout(searchTimer);
  renderList();
  const query=$('search').value.trim(),selected=activeSources();
  if(!query||!selected.length)return;
  const direct=sharedTrack(query);
  if(direct&&selected.includes(direct))return;
  const ready=selected;
  const token=++revision;
  await Promise.all(ready.map(async name=>{
    catalogRows.set(name,{status:'busy'});renderCatalogs();
    const result=await catalogLookup(name,query);
    if(token===revision){
      catalogRows.set(name,result);renderCatalogs();
      if(name==='SoundCloud'&&result.rows?.length)await enrichSoundCloud(result.rows,()=>token===revision,renderCatalogs);
    }
  }));
}
function connectionForm(){
  const name=$('service-name').value,yt=name==='YouTube';
  $('key-caption').textContent=yt?'API key':'Client ID';
  $('secret-field').hidden=yt;$('service-secret').required=!yt;
  $('service-key').value='';$('service-secret').value='';
  $('forget-service').hidden=!configured.includes(name);
  $('connection-state').textContent=configured.includes(name)?'Credentials saved':'Public search enabled';
}
async function updateConnection(remove){
  const name=$('service-name').value;
  try{
    const reply=await bridge('configure',{name,id:remove?'':$('service-key').value,secret:remove?'':$('service-secret').value});
    configured=reply.configured;revision++;catalogRows.clear();connectionForm();renderCatalogs();
    notify(remove?'Credentials removed':'Credentials saved');
  }catch{notify('Could not save connection');}
}
function initSources(){
  window.chrome?.webview?.addEventListener('message',e=>{const cb=requests.get(e.data.seq);if(cb){requests.delete(e.data.seq);cb(e.data);}});
  window.addEventListener('message',e=>player.receive(e));
  if(!['All','Library',...sources].includes(prefs.source))prefs.source='All';
  $('source').value=prefs.source;
  $('search').oninput=()=>{clearTimeout(searchTimer);renderList();if($('search').value.trim().length>=2&&activeSources().length)searchTimer=setTimeout(submitCatalogs,850);};
  $('source').onchange=()=>{prefs.source=$('source').value;savePrefs();submitCatalogs();};
  $('search-form').onsubmit=e=>{e.preventDefault();submitCatalogs();};
  $('connections-open').onclick=()=>{connectionForm();$('connections').showModal();};
  $('service-name').onchange=connectionForm;
  $('service-form').onsubmit=e=>{e.preventDefault();updateConnection(false);};
  $('forget-service').onclick=()=>updateConnection(true);
  $('connections').addEventListener('close',()=>{$('service-key').value=$('service-secret').value='';});
  $('tray-pref').onchange=async e=>{const el=e.target;el.disabled=true;try{await bridge('tray',{enabled:el.checked});}catch{el.checked=!el.checked;notify('Could not save tray preference');}finally{el.disabled=false;}};
  bridge('state').then(state=>{configured=state.configured;$('tray-pref').checked=state.closeToTray;renderCatalogs();}).catch(()=>{});
}
