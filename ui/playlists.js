let playlists=[],playlistID='',editID='',drawerOpen=false,playlistSort='library';
const currentPlaylist=()=>playlists.find(p=>p.id===playlistID);
function libraryDrawer(open){
  drawerOpen=open;document.querySelector('.workspace').classList.toggle('expanded',open);
  $('drawer').hidden=!open;$('nav-library').setAttribute('aria-expanded',String(open));
}
async function putPlaylist(p,changeItems){
  const db=await libraryDB;
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('playlists','readwrite'),store=tx.objectStore('playlists');
    if(changeItems){
      const read=store.get(p.id);
      read.onsuccess=()=>{const latest=read.result;if(!latest){tx.abort();return;}p={...latest,items:changeItems(latest.items)};store.put(p);};
    }else store.put(p);
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
  const i=playlists.findIndex(item=>item.id===p.id);if(i<0)playlists.push(p);else playlists[i]=p;
  renderList();
}
function openPlaylist(id,expand=true){playlistID=id;playlistSort='library';if(expand)libraryDrawer(true);go('playlist');}
function reference(t){
  if(t.url&&sharedTrack(t.url))return {id:'web:'+t.url,url:t.url,provider:sharedTrack(t.url),title:t.title,artist:t.artist||'',art:safeArt(t.art),duration:Number(t.duration)||0};
  if(isAudius(t))return {id:t.id,title:t.title,artist:t.artist,genre:t.genre,duration:t.duration,provider:'Audius',src:'https://api.audius.co/v1/tracks/'+t.id.slice(3)+'/stream',art:t.art?.startsWith('https://')?t.art:'',album:'Audius'};
  return {id:t.id,title:t.title,artist:t.artist};
}
function listTracks(p){return (p?.items||[]).map(ref=>trackById(ref.id)||ref);}
function rowAction(name,glyph,fn){const btn=make('button','icon tiny');buttonIcon(btn,glyph,name);btn.onclick=fn;return btn;}
function paintPlaylists(){
  const active=currentPlaylist(),show=view==='playlist'&&!$('search').value.trim()&&active;
  $('pl-head').hidden=!show;
  if(show){
    $('view-title').textContent=active.name;$('pl-description').textContent=active.description;
    showArt($('pl-art'),{id:active.id+active.updated,art:active.cover,title:active.name,album:''});
    $('pl-play').disabled=!active.items.length;
  }
  const links=$('playlist-links'),pins=$('pinned-playlists');links.replaceChildren();pins.replaceChildren();
  for(const p of playlists){
    const btn=make('button','drawer-link');btn.classList.toggle('chosen',!!show&&active.id===p.id);
    const art=make('span','art');showArt(art,{id:p.id,art:p.cover,title:p.name,album:''});btn.append(art,make('span','',p.name));
    btn.dataset.playlist=p.id;btn.title=p.name;btn.onclick=()=>openPlaylist(p.id);
    if(prefs.pinnedPlaylists?.includes(p.id)){
      const pin=btn.cloneNode(true);pin.classList.add('pinned-link');pin.setAttribute('aria-label',p.name);
      pin.onclick=()=>openPlaylist(p.id,false);pins.append(pin);
    }else links.append(btn);
  }
}
function editPlaylist(id=''){
  editID=id;const p=playlists.find(item=>item.id===id);$('pl-form-title').textContent=p?'Edit playlist':'Create playlist';
  $('pl-name').value=p?.name||'';$('pl-desc').value=p?.description||'';$('pl-image').value='';
  $('pl-editor').showModal();$('pl-name').focus();
}
async function coverImage(file){
  const img=await createImageBitmap(file);
  try{
    const c=document.createElement('canvas');c.width=c.height=320;const side=Math.min(img.width,img.height);
    c.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,320,320);
    return c.toDataURL('image/jpeg',.86);
  }finally{img.close();}
}
function choices(title){$('pl-picker-title').textContent=title;const el=$('pl-choices');el.replaceChildren();$('pl-picker').showModal();return el;}
async function includeTrack(p,t){
  const ref=reference(t);
  if(p.items.some(item=>item.id===ref.id)){notify('Already in playlist');return;}
  await putPlaylist(p,items=>items.some(t=>t.id===ref.id)?items:[...items,ref]);notify('Added to '+p.name);
}
let pendingTrack=null;
function pickPlaylist(t){
  const el=choices('Add to playlist');
  const create=make('button','drawer-link','＋  Create playlist');create.onclick=()=>{$('pl-picker').close();pendingTrack=t;editPlaylist();};el.append(create);
  for(const p of playlists){
    const btn=make('button','drawer-link',p.name);btn.onclick=async()=>{btn.disabled=true;try{await includeTrack(p,t);$('pl-picker').close();}catch{notify('Could not save playlist');btn.disabled=false;}};el.append(btn);
  }
}
function chooseTracks(){
  const playlist=currentPlaylist(),dialog=$('add-tracks'),input=$('track-search'),source=$('track-source');
  const list=$('track-match-list'),status=$('track-search-status'),saving=new Set();
  let generation=0,timer;
  function renderRow(t){
    const row=make('button','track-match'),art=resultImage(t),meta=make('span','result-meta');
    const credit=make('small','song-credit'),mark=make('span','add-mark');
    credit.append(sourceIcon(t.provider),make('span','',t.artist));
    meta.append(make('strong','',t.title),credit);
    const added=currentPlaylist()?.items.some(item=>item.id===t.id);
    row.disabled=added||saving.has(t.id);
    row.dataset.track=t.id;
    row.setAttribute('aria-label',(added?'Already added: ':'Add ')+t.title+' · '+t.artist);
    row.classList.toggle('added',!!added);
    if(added)mark.textContent='✓';else mark.innerHTML=icon('plus');
    row.append(art,meta,make('time','',t.duration?time(t.duration):''),mark);
    row.onclick=async()=>{
      saving.add(t.id);row.disabled=true;
      try{await includeTrack(playlist,t);}
      catch{status.textContent='Could not save track. Try again.';}
      finally{
        saving.delete(t.id);
        const visible=list.querySelector('[data-track="'+CSS.escape(t.id)+'"]');
        if(dialog.open&&currentPlaylist()?.id===playlist.id&&visible)visible.replaceWith(renderRow(t));
      }
    };
    return row;
  }
  function search(immediate=false){
    clearTimeout(timer);
    const token=++generation,query=input.value.trim(),q=normalized(query),scope=source.value;
    const current=()=>dialog.open&&generation===token;
    const known=[...tracks,...[...liked].map(trackById).filter(Boolean),...listeningList('recent')];
    const results=new Map();
    for(const t of known){
      if(scope!=='All'&&scope!=='Library'&&t.provider!==scope)continue;
      if(!q||normalized([t.title,t.artist,t.album].join(' ')).includes(q))results.set(t.id,t);
    }
    $('track-source-glyph').replaceChildren(sourceIcon(scope));
    const services=activeSources(scope),direct=sharedTrack(query);
    const lookup=query&&(immediate||query.length>=2)&&services.length&&!direct;
    let pending=lookup?services.length:0;
    const failed=[];
    function paint(){
      const rows=[...results.values()];
      if(query)rows.sort((a,b)=>matchesScore(b,query)-matchesScore(a,query));
      list.replaceChildren(...rows.map(renderRow));
      status.textContent=pending?'Searching…':failed.length?'Search unavailable · '+failed.join(', '):
        rows.length?'':query?'No matching tracks.':'Search for a track or artist.';
    }
    if(direct&&services.includes(direct)){
      const t=linkedResult(direct,query);results.set(t.id,t);
    }
    $('track-matches').scrollTop=0;paint();
    if(!lookup)return;
    const fetchSource=async name=>{
      const data=await catalogLookup(name,query);
      if(!current())return;
      const rows=(data.rows||[]).filter(row=>sharedTrack(row.url)===name);
      for(const row of rows){const t=webTrack(name,row);results.set(t.id,t);}
      if(data.status!=='ok')failed.push(name);
      pending--;paint();
      if(name==='SoundCloud')await enrichSoundCloud(rows,current,row=>{
        const t=results.get('web:'+row.url);
        const visible=list.querySelector('[data-track="'+CSS.escape(t.id)+'"]');
        if(visible)visible.replaceWith(renderRow(t));
      });
    };
    timer=setTimeout(()=>services.forEach(fetchSource),immediate?0:500);
  }
  source.replaceChildren(...Array.from($('source').options,option=>option.cloneNode(true)));
  source.value=prefs.source;input.value='';
  dialog.showModal();input.focus();search();
  input.oninput=()=>search();source.onchange=()=>search();
  $('track-search-form').onsubmit=e=>{e.preventDefault();search(true);};
  dialog.onclose=()=>{generation++;clearTimeout(timer);};
}
function saveDownload(p){
  const blob=new Blob([JSON.stringify({format:'Fader playlist',name:p.name,description:p.description,cover:p.cover,items:p.items},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download=p.name.replace(/[<>:"/\\|?*]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function importPlaylist(file){
  if(!file)return;if(file.size>6*1024*1024)throw Error('Too large');
  const raw=await file.text();let name=file.name.replace(/\.[^.]+$/,''),description='',cover='',entries;
  if(/\.json$/i.test(file.name)){
    const p=JSON.parse(raw);entries=p.items||p.tracks||p.songs||p;if(!Array.isArray(entries))throw Error('Unsupported playlist');
    if(p.name)name=String(p.name);description=String(p.description||'').slice(0,600);
    if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.cover||'')&&p.cover.length<1000000)cover=p.cover;
  }else entries=raw.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  const items=[],ids=new Set();let missing=0;
  for(const entry of entries){
    const e=typeof entry==='string'?{path:entry,url:entry}:entry;if(!e){missing++;continue;}
    const base=String(e.path||'').split(/[\\/]/).at(-1);
    let t=trackById(e.id)||tracks.find(t=>(base&&t.id.startsWith('file:'+base+':'))||(e.title&&t.title===e.title&&(!e.artist||t.artist===e.artist)));
    if(!t&&isAudius(e)&&typeof e.title==='string'&&typeof e.artist==='string'&&Number(e.duration)>0){t=reference(e);indexRemote([t]);}
    if(!t&&sharedTrack(e.url))t={url:e.url,title:String(e.title||e.url),artist:String(e.artist||''),provider:sharedTrack(e.url)};
    if(!t){missing++;continue;}const ref=reference(t);if(!ids.has(ref.id)){ids.add(ref.id);items.push(ref);}
  }
  const p={id:crypto.randomUUID(),name:name.slice(0,100)||'Imported playlist',description,cover,items,updated:Date.now()};
  await putPlaylist(p);openPlaylist(p.id);notify(items.length+' imported'+(missing?' · '+missing+' unavailable':''));
}
async function initPlaylists(){
  playlists=await dbGet('playlists');for(const p of playlists)indexRemote(p.items);
  $('nav-library').onclick=()=>libraryDrawer(!drawerOpen);
  $('all-tracks').onclick=()=>go('library');$('pl-new').onclick=()=>editPlaylist();
  $('pl-art').onclick=$('pl-edit').onclick=()=>editPlaylist(playlistID);$('pl-add').onclick=chooseTracks;
  $('pl-import').onclick=()=>$('pl-file').click();$('pl-file').onchange=async e=>{try{await importPlaylist(e.target.files[0]);}catch{notify('Could not read playlist. Use M3U, M3U8 or Fader JSON.');}finally{e.target.value='';}};
  $('pl-export').onclick=()=>saveDownload(currentPlaylist());
  $('pl-play').onclick=()=>{const rows=listTracks(currentPlaylist());if(rows[0])startListTrack(rows[0],rows);};
  $('pl-editor').addEventListener('close',()=>pendingTrack=null);
  $('pl-form').onsubmit=async e=>{e.preventDefault();const name=$('pl-name').value.trim();if(!name){$('pl-name').focus();return;}
    const p=playlists.find(p=>p.id===editID)||{id:crypto.randomUUID(),items:pendingTrack?[reference(pendingTrack)]:[],cover:''};
    $('pl-save').disabled=true;
    try{const file=$('pl-image').files[0];const cover=file?await coverImage(file):p.cover;
      await putPlaylist({...p,name,description:$('pl-desc').value.trim(),cover,updated:Date.now()});$('pl-editor').close();openPlaylist(p.id);
    }catch{notify('Could not save playlist or cover');}finally{$('pl-save').disabled=false;}
  };
}
function startListTrack(t,rows){
  for(const item of rows)if(item.url&&!trackById(item.id))indexRemote([item]);
  if(!trackById(t.id)){notify('Import this audio file to play it');return;}
  playList(rows.filter(item=>trackById(item.id)),t.id,view==='playlist'&&!$('search').value.trim()?playlistID:'');
}
