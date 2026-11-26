'use strict';
function exportError(track,error){
  if(error?.message==='Playback unavailable')return 'SoundCloud playback could not supply audio. Retry or choose a local file.';
  return track.url?track.provider+' did not provide an audio file. Choose a local copy to continue.':'Could not load this audio. Choose a local file or retry.';
}
async function quickSoundCloud(track,signal){
  signal.throwIfAborted();
  const name=crypto.randomUUID(),cancel=()=>bridge('quickCancel',{name}).catch(()=>{});
  signal.addEventListener('abort',cancel,{once:true});
  try{
    await bridge('quickAudio',{name,query:'https://soundcloud.com'+new URL(track.url).pathname});
    signal.throwIfAborted();
    const r=await fetch('https://exports.fader.example/'+name+'.m4a',{signal,cache:'no-store'});
    if(!r.ok)throw Error();
    return await r.blob();
  }finally{
    signal.removeEventListener('abort',cancel);
    await bridge('quickRelease',{name}).catch(()=>{});
  }
}
async function decodeExport(track,file,signal,progress,entry){
  const decoder=new OfflineAudioContext(2,1,48000);
  if(file||entry?.capture)return decoder.decodeAudioData(await (file||entry.capture).arrayBuffer());
  try{
    const bytes=await exportSource(track,AbortSignal.any([signal,AbortSignal.timeout(30000)]));
    return await decoder.decodeAudioData(bytes);
  }catch(err){
    if(signal.aborted||track.provider!=='SoundCloud')throw err;
    progress('Downloading SoundCloud audio…');const blob=await quickSoundCloud(track,signal);
    const audio=await decoder.decodeAudioData(await blob.arrayBuffer());
    if(entry)entry.capture=blob;
    return audio;
  }
}
async function writeBatchWav(blob,name,signal){
  await bridge('batchFile',{name});
  for(let i=0;i<blob.size;i+=384*1024){
    signal.throwIfAborted();
    const chunk=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob.slice(i,i+384*1024));
    });
    await bridge('batchChunk',{chunk});
  }
  signal.throwIfAborted();await bridge('batchCommit');
}
let activeBatch;
function openBatch(p){
  if(activeBatch)return;
  const dialog=$('batch-dialog'),list=$('batch-rows'),status=$('batch-status'),start=$('batch-start');
  const batch=activeBatch={folder:'',entries:[],abort:null};
  $('batch-name').textContent=p.name;list.replaceChildren();status.textContent='Files are saved in a playlist folder in Downloads.';
  for(const track of listTracks(p)){
    const row=make('div','batch-row'),text=make('div','result-meta'),label=make('small','',track.artist);
    const entry={track,label,quality:'44100/16',currentEQ:settings.bypass?[0,0,0,0,0]:settings.eq.slice(),effects:{...(settings.bypass?audioDefaults:settings)}};
    entry.effects.eq=entry.currentEQ;
    const trim=rowAction('Trim audio','edit',()=>openAudioExport(track,entry,'trim'));
    const fx=rowAction('Audio effects','sliders',()=>openAudioExport(track,entry,'effects'));
    text.append(make('strong','',track.title),label);row.append(resultImage(track),text,trim,fx);list.append(row);
    entry.buttons=[trim,fx];batch.entries.push(entry);
  }
  start.textContent='Download WAVs';start.disabled=!batch.entries.length;
  dialog.oncancel=e=>{if(batch.abort){e.preventDefault();batch.abort.abort();}};
  const close=dialog.querySelector('[data-dismiss]');
  close.onclick=()=>{if(batch.abort)batch.abort.abort();else dialog.close();};
  dialog.onclose=async()=>{try{if(batch.folder)await bridge('batchEnd');}finally{activeBatch=null;}};
  start.onclick=async()=>{
    if(batch.abort){batch.abort.abort();start.disabled=true;return;}
    const abort=batch.abort=new AbortController();start.textContent='Stop';
    batch.entries.forEach(e=>e.buttons.forEach(b=>b.disabled=true));
    try{
      if(!batch.folder)batch.folder=(await bridge('batchBegin',{name:p.name})).value;
      for(const [index,entry] of batch.entries.entries()){
        if(entry.saved||abort.signal.aborted)continue;
        const {track,label}=entry;label.textContent='Preparing…';let stage='read';
        try{
          const audio=await decodeExport(track,entry.file,abort.signal,msg=>label.textContent=msg,entry);
          abort.signal.throwIfAborted();stage='render';label.textContent='Rendering…';
          const {from,to}=entry.trim||{from:0,to:audio.duration},[rate,bits]=entry.quality.split('/').map(Number);
          const rendered=await renderAudioClip(audio,from,Math.min(to,audio.duration),rate,entry.effects);
          stage='write';label.textContent='Saving…';
          await writeBatchWav(wavBlob(rendered,bits),String(index+1).padStart(2,'0')+' - '+track.title,abort.signal);
          entry.saved=true;label.textContent='Saved';entry.capture=null;
        }catch(err){
          if(stage==='write')await bridge('batchDiscard').catch(()=>{});
          label.textContent=abort.signal.aborted?'Stopped':stage==='read'?exportError(track,err):
            stage==='write'?'Could not save WAV. Check free disk space and retry.':'Could not render this selection.';
        }
      }
      status.textContent=batch.entries.filter(e=>e.saved).length+' / '+batch.entries.length+' saved · '+batch.folder;
    }catch{status.textContent='Could not create the download folder.';}
    finally{
      batch.abort=null;
      for(const e of batch.entries)e.buttons.forEach(b=>b.disabled=!!e.saved);
      start.disabled=batch.entries.every(e=>e.saved);start.textContent=start.disabled?'Downloaded':'Retry remaining';
    }
  };
  dialog.showModal();
}
