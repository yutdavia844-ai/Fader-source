const libraryDB=new Promise((resolve,reject)=>{
  const req=indexedDB.open('fader.library',3);
  req.onupgradeneeded=()=>{
    if(!req.result.objectStoreNames.contains('tracks'))req.result.createObjectStore('tracks',{keyPath:'id'});
    if(!req.result.objectStoreNames.contains('audio'))req.result.createObjectStore('audio');
    if(!req.result.objectStoreNames.contains('playlists'))req.result.createObjectStore('playlists',{keyPath:'id'});
    if(!req.result.objectStoreNames.contains('lyrics'))req.result.createObjectStore('lyrics',{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function dbGet(store,key) {
  const db=await libraryDB;
  return new Promise((resolve,reject)=>{
    const table=db.transaction(store).objectStore(store);
    const r=key===undefined?table.getAll():table.get(key);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
}
async function storeFile(meta,file) {
  const db=await libraryDB;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['tracks','audio'],'readwrite');
    tx.objectStore('tracks').put(meta);tx.objectStore('audio').put(file,meta.id);
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
async function removeFile(id) {
  const db=await libraryDB;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['tracks','audio'],'readwrite');
    tx.objectStore('tracks').delete(id);tx.objectStore('audio').delete(id);
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
function readDuration(file) {
  return new Promise((resolve,reject)=>{
    const a=new Audio(),url=URL.createObjectURL(file);
    const finish=(value)=>{
      clearTimeout(timer);a.onloadedmetadata=a.onerror=null; a.removeAttribute('src');a.load();URL.revokeObjectURL(url);
      if(Number.isFinite(value)&&value>0) resolve(value);else reject(Error('Unreadable audio'));
    };
    const timer=setTimeout(()=>finish(0),12000);
    a.preload='metadata';a.onloadedmetadata=()=>finish(a.duration);a.onerror=()=>finish(0);a.src=url;
  });
}
async function readTags(file) {
  const tags=await new Promise(resolve=>{
    const timer=setTimeout(()=>resolve({}),3500);
    const done=v=>{clearTimeout(timer);resolve(v);};
    try{jsmediatags.read(file,{onSuccess:r=>done(r.tags),onError:()=>done({})});}catch{done({});}
  });
  let art='';
  if(tags.picture?.data?.length && tags.picture.data.length<12_000_000) {
    try {
      const bmp=await createImageBitmap(new Blob([new Uint8Array(tags.picture.data)],{type:tags.picture.format}));
      const canvas=document.createElement('canvas');canvas.width=canvas.height=160;
      const side=Math.min(bmp.width,bmp.height);
      canvas.getContext('2d').drawImage(bmp,(bmp.width-side)/2,(bmp.height-side)/2,side,side,0,0,160,160);
      bmp.close();art=canvas.toDataURL('image/jpeg',.75);
    } catch {}
  }
  const stem=file.name.replace(/\.[^.]+$/,'');
  const parts=stem.split(' - ');
  return {title:tags.title || (parts.length>1?parts.slice(1).join(' - '):stem),artist:tags.artist || (parts.length>1?parts[0]:'Unknown artist'),album:tags.album || 'Local files',genre:String(tags.genre||''),art};
}
