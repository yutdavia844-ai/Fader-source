// Keep listening signals on this device. Only a genre or an artist lookup leaves the player.
const historyStore=JSON.parse(localStorage.getItem('fader.listening')||'{}');
const discoveryCache=JSON.parse(localStorage.getItem('fader.discovery')||'{}');
const artistStyles=JSON.parse(localStorage.getItem('fader.artistStyles')||'{}');
const homeGenres=['Hip-Hop/Rap','Electronic','Pop','Rock','Alternative','R&B/Soul','House','Techno','Ambient','Classical','Jazz','Metal','Latin','Reggae','Country','Folk','Punk','Trap','Dubstep','Drum & Bass','Lo-Fi','World'];
const genreAliases=[[/hip.?hop|\brap\b|grime/i,'Hip-Hop/Rap'],[/r&b|rhythm and blues|soul/i,'R&B/Soul'],[/lo.?fi|chillhop/i,'Lo-Fi'],[/drum and bass|dnb/i,'Drum & Bass'],[/synth|electro|edm|dance/i,'Electronic'],[/reggaeton|samba|bossa|brazilian|latin|funk carioca/i,'Latin'],[/indie/i,'Alternative']];
function musicStyle(raw=''){
  const exact=homeGenres.find(g=>g.toLowerCase()===raw.trim().toLowerCase());
  return exact||genreAliases.find(([pattern])=>pattern.test(raw))?.[1]||homeGenres.find(g=>raw.toLowerCase().includes(g.toLowerCase()))||'';
}
function genreOf(t){return musicStyle(t.genre||'')||musicStyle(artistStyles[t.artist]?.genre||'')||(t.artist==='Fader Studio'?'Electronic':'');}
const remoteTracks=new Map();
function isAudius(t){return t?.provider==='Audius'&&/^au-[a-zA-Z0-9]+$/.test(t.id);}
function indexRemote(rows){for(const t of rows)if(isAudius(t)||t.url&&/^https:\/\//.test(t.url))remoteTracks.set(t.id,t);}
for(const item of Object.values(discoveryCache))indexRemote(item.rows||[]);
for(const entry of Object.values(historyStore))indexRemote([entry.track]);
let lastSample=null,homeReady=false,shownShelf='',generation=0,shelfTracks=[],shelfStatus='',retryAfter=0;
const decay=days=>Math.exp(-days/28);
function weight(entry){
  return (entry.score||0)*decay((Date.now()-entry.last)/86400000)+(liked.has(entry.track.id)?55:0);
}
function record(t,seconds,penalty=0){
  if(!t)return;
  let entry=historyStore[t.id];
  if(!entry){
    const {art,...metadata}=t;
    entry=historyStore[t.id]={track:{...metadata,art:isAudius(t)||t.url?art:''},seconds:0,plays:0,score:0,last:Date.now()};
  }
  entry.score=(entry.score||0)*decay((Date.now()-entry.last)/86400000)+seconds-penalty;
  entry.seconds+=seconds;entry.last=Date.now();
  if(Object.keys(historyStore).length>300){
    const oldest=Object.keys(historyStore).filter(id=>!liked.has(id)&&id!==t.id).sort((a,b)=>historyStore[a].last-historyStore[b].last)[0];
    if(oldest)delete historyStore[oldest];
  }
}
let visit=null;
function listenThreshold(t){return Math.min(10,(t.duration||20)/2);}
function listeningList(kind){
  const entries=Object.values(historyStore).filter(e=>trackById(e.track.id)&&
    (kind==='recent'?e.seconds>0:e.plays>0||e.plays===undefined&&e.seconds>=listenThreshold(e.track)));
  entries.sort((a,b)=>kind==='recent'?(b.lastPlayed||b.last)-(a.lastPlayed||a.last):
    (b.plays||0)-(a.plays||0)||b.seconds-a.seconds);
  return entries.map(e=>trackById(e.track.id));
}
function historyMetric(t,kind){
  const e=historyStore[t.id];
  if(kind==='recent')return new Intl.DateTimeFormat('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(e.lastPlayed||e.last);
  return e.plays?e.plays+(e.plays===1?' play':' plays'):time(e.seconds)+' listened';
}
function sampleListening(){
  if(!homeReady)return;
  const now=performance.now()/1000;
  if(lastSample){
    const dt=Math.min(60,Math.max(0,now-lastSample.at));
    if(dt>.01&&lastSample.track){
      const t=lastSample.track;record(t,dt);
      const entry=historyStore[t.id];entry.lastPlayed=Date.now();
      if(visit?.id===t.id){
        visit.seconds+=dt;
        if(!visit.counted&&visit.seconds+.001>=listenThreshold(t)){entry.plays=(entry.plays||0)+1;visit.counted=true;}
      }
    }
  }
  if(visit?.id!==player.id||(!player.playing&&!player.loading&&player.offset===0))visit=null;
  if(player.playing){
    const pos=player.position();
    if(!visit||visit.pos>(trackById(player.id)?.duration||Infinity)-1.5&&pos<1.5)visit={id:player.id,seconds:0,counted:false};
    visit.pos=pos;
  }
  lastSample=player.playing?{track:trackById(player.id),at:now}:null;
}
function flushHistory(){sampleListening();save('listening',historyStore);}
function taste(){
  const entries=Object.values(historyStore).filter(e=>(e.seconds>=10||liked.has(e.track.id))&&(trackById(e.track.id)||e.track.url));
  for(const id of liked){
    const t=trackById(id);if(t&&!entries.some(e=>e.track.id===id))entries.push({track:t,score:0,seconds:0,last:Date.now()});
  }
  const artists=new Map(),genres=new Map();
  const bump=(map,key,v)=>{if(key)map.set(key,(map.get(key)||0)+v);};
  for(const e of entries){const value=weight(e),t=trackById(e.track.id)||e.track;
    if(value<=0)continue;bump(artists,t.artist,value);bump(genres,genreOf(t),value);
  }
  entries.sort((a,b)=>weight(b)-weight(a));
  const best=map=>[...map].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  return {entries:entries.filter(e=>weight(e)>0),artists,genres,artist:best(artists),genre:best(genres)};
}
async function identifyStyle(t){
  if(!t||genreOf(t)||!t.artist||t.artist==='Unknown artist'||Date.now()-(artistStyles[t.artist]?.at||0)<7*86400000)return;
  artistStyles[t.artist]={at:Date.now(),genre:''};
  try{
    const q='artist:"'+t.artist.replace(/[^\p{L}\p{N} .-]/gu,' ')+'"';
    const r=await fetch('https://musicbrainz.org/ws/2/artist?fmt=json&limit=3&query='+encodeURIComponent(q),{signal:AbortSignal.timeout(7000)});
    if(!r.ok)throw Error();
    const hit=(await r.json()).artists?.find(a=>normalized(a.name)===normalized(t.artist));
    const genre=(hit?.tags||[]).sort((a,b)=>b.count-a.count).map(tag=>musicStyle(tag.name)).find(Boolean)||'';
    artistStyles[t.artist]={at:Date.now(),genre};save('artistStyles',artistStyles);
    if(genre&&view==='home')renderHome();
  }catch{artistStyles[t.artist].at=Date.now()-7*86400000+600000;}
}
async function getShelf(genre){
  const qs=new URLSearchParams({time:'week',limit:'18'});if(genre)qs.set('genre',genre);
  const r=await fetch('https://api.audius.co/v1/tracks/trending?'+qs,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error();
  const data=(await r.json()).data;
  return data.filter(x=>x.is_streamable && !x.is_stream_gated && !x.is_unlisted && x.duration>0 && x.duration<1200 && /^[a-zA-Z0-9]+$/.test(x.id)).map(x=>({
    id:'au-'+x.id,provider:'Audius',title:x.title,artist:x.user.name,album:'Audius',duration:x.duration,genre:x.genre,
    src:'https://api.audius.co/v1/tracks/'+x.id+'/stream',art:/^https:\/\//.test(x.artwork?.['480x480']||'')?x.artwork['480x480']:''
  }));
}
function loadShelf(genre){
  const key=genre||'all',cached=discoveryCache[key];
  if(shownShelf===key && (shelfStatus==='loading'||Date.now()<retryAfter))return;
  if(shownShelf===key && cached && Date.now()-cached.at<6*3600000)return;
  const version=++generation;shownShelf=key;shelfTracks=cached?.rows||[];shelfStatus='';
  if(cached&&Date.now()-cached.at<6*3600000)return;
  shelfStatus='loading';
  getShelf(genre).then(rows=>{
    indexRemote(rows);discoveryCache[key]={rows,at:Date.now()};save('discovery',discoveryCache);
    if(version===generation){shelfTracks=rows;shelfStatus='';retryAfter=0;if(view==='home')renderHome();}
  }).catch(()=>{if(version===generation){shelfStatus='offline';retryAfter=Date.now()+60000;if(view==='home')renderHome();}});
}
function playHome(t,list){
  if(t.url&&!t.src&&!trackById(t.id)){browseSource(t.provider,t.title+' '+t.artist,t.url,t.title,t.artist);return;}
  playList(list.filter(x=>trackById(x.id)),t.id);
}
function homeCard(t,list){
  const btn=make('button','home-card');btn.dataset.track=t.id;btn.title='Play '+t.title+' · '+t.artist;
  const art=make('span','art home-art');showArt(art,t);
  const overlay=make('span','card-play');overlay.innerHTML=icon('play');art.append(overlay);
  btn.append(art,make('strong','',t.title),make('small','',t.artist));btn.onclick=()=>playHome(t,list);return btn;
}
function renderHome(){
  const pane=$('home-shelves');
  const visible=homeReady&&view==='home'&&!$('search').value.trim();
  pane.hidden=!visible;if(!visible)return;
  const p=taste(),lead=p.entries[0]?.track;
  if(lead)identifyStyle(trackById(lead.id)||lead);
  loadShelf(p.genre);
  const score=t=>(p.genres.get(genreOf(t))||0)+(p.artists.get(t.artist)||0)*.7;
  const recent=p.entries.filter(e=>e.seconds>=10).slice(0,6).map(e=>trackById(e.track.id)||e.track);
  const known=new Set(recent.map(t=>normalized(t.title+' '+t.artist)));
  const local=tracks.filter(t=>score(t)>0&&!known.has(normalized(t.title+' '+t.artist))).sort((a,b)=>score(b)-score(a));
  const skip=t=>historyStore[t.id]&&historyStore[t.id].score<0;
  const online=shelfTracks.filter(t=>!known.has(normalized(t.title+' '+t.artist))&&!skip(t));
  const picks=(local.length&&!p.genre?local:[...local.slice(0,2),...online,...local.slice(2)]).filter(t=>!skip(t));
  const unique=[],artists=new Set();for(const t of picks){if(!artists.has(t.artist)){unique.push(t);artists.add(t.artist);}}
  const choice=unique.concat(picks.filter(t=>!unique.includes(t))).slice(0,6);
  const sig=JSON.stringify([shownShelf,shelfStatus,choice.map(t=>t.id),recent.map(t=>t.id),p.genre]);
  if(pane.dataset.sig===sig)return;pane.dataset.sig=sig;pane.replaceChildren();
  const shelf=(title,subtitle,list)=>{
    const line=make('div','home-shelf-heading');line.append(make('h2','',title));
    if(subtitle)line.append(make('small','',subtitle));pane.append(line);
    if(list.length){const grid=make('div',title==='In rotation'?'home-grid rotation':'home-grid');for(const t of list)grid.append(homeCard(t,list));pane.append(grid);}
  };
  $('hero').hidden=recent.length>0;
  if(recent.length)shelf('In rotation','',recent);
  shelf((p.genre||local.length)?'For you':'Explore',p.genre?p.genre+' · Audius & library':'Audius',choice);
  if(!choice.length)pane.append(make('p','home-empty',shelfStatus==='loading'?'Finding tracks…':shelfStatus==='offline'?'Discovery is offline. Your library is ready to play.':'More tracks will appear as you listen.'));
}
function initHome(){
  homeReady=true;
  setInterval(()=>{if(player.playing||lastSample){
    flushHistory();
    if(!document.hidden&&!$('search').value){if(view==='home')renderHome();else if(view==='recent'||view==='most')renderList();}
  }},5000);
  window.addEventListener('pagehide',flushHistory);
  $('nav-home').onclick=()=>go('home');
  for(const key of ['recent','most'])$('nav-'+key).onclick=()=>{flushHistory();go(key);};
}
