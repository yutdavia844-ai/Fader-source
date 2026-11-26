'use strict';
let exportJob;
const exportKnobs=[
  ['drive','Distortion',0,100,1,'%'],['reverb','Reverb',0,100,1,'%'],['echo','Echo',0,100,1,'%'],
  ['speed','Speed',.5,2,.01,'×'],['pitch','Pitch',-12,12,.1,' st']
];
function initAudioExport(){
  initTrimEditor();
  const eq=$('export-eq');
  for(const name of ['Current EQ',...Object.keys(eqPresets)])eq.add(new Option(name,name));
  const box=$('export-knobs');
  for(const [key,label,min,max,step,unit] of exportKnobs){
    const field=make('label','export-control'),input=make('input'),value=make('output');
    Object.assign(input,{type:'range',min,max,step,id:'export-'+key});
    input.oninput=()=>{value.textContent=input.value+unit;fill(input);};
    field.append(make('span','',label),value,input);box.append(field);
  }
  const linked=make('input'),label=make('label','setting','Link pitch to speed');
  linked.type='checkbox';linked.id='export-linked';label.append(linked);box.append(label);
  linked.onchange=()=>{$('export-pitch').disabled=linked.checked;};
  $('export-form').onsubmit=e=>{e.preventDefault();saveAudioExport();};
  $('export-locate').onclick=()=>$('export-file').click();
  $('export-file').onchange=e=>{const file=e.target.files[0];if(file&&exportJob)loadExportAudio(exportJob,file);};
  $('export-dialog').addEventListener('close',()=>{if(!$('export-dialog').open){exportJob?.abort?.abort();exportJob=null;}});
}
function openAudioExport(t,entry=null,section=''){
  exportJob?.abort?.abort();
  const job=exportJob={track:t,entry,section,currentEQ:entry?.currentEQ||(settings.bypass?[0,0,0,0,0]:settings.eq.slice())};
  $('export-heading').textContent=entry?'Track settings':'Download audio';
  $('export-save').textContent=entry?'Apply':'Save WAV';
  const meta=make('span','result-meta');
  meta.append(make('strong','',t.title),make('small','',t.artist));
  $('export-track').replaceChildren(resultImage(t),meta);
  $('export-quality').value=entry?.quality||'44100/16';$('export-eq').value=entry?.preset||'Current EQ';
  $('export-fx').open=section==='effects';$('export-file').value='';
  for(const [key] of exportKnobs){
    const input=$('export-'+key);input.value=entry?.effects[key]??(settings.bypass?audioDefaults[key]:settings[key]);input.oninput();
  }
  $('export-linked').checked=entry?.effects.linked??(settings.bypass||settings.linked);$('export-linked').onchange();
  $('export-dialog').showModal();loadExportAudio(job);
}
async function exportSource(t,signal){
  if(t.url||isAudius(t)){
    const copy=tracks.find(item=>!item.src&&normalized(item.title)===normalized(t.title)&&normalized(item.artist||'')===normalized(t.artist||''));
    if(copy){const file=await dbGet('audio',copy.id);if(file)return file.arrayBuffer();}
  }
  if(!t.url&&!isAudius(t)&&!t.src)return (await dbGet('audio',t.id)).arrayBuffer();
  let url=t.src;
  if(isAudius(t))url='https://api.audius.co/v1/tracks/'+encodeURIComponent(t.id.slice(3))+'/download';
  else if(t.url){
    if(t.provider!=='SoundCloud'||!configured.includes('SoundCloud'))throw Error();
    const id=(await soundDetails(t)).downloadId;if(!id)throw Error();
    url=(await bridge('soundDownload',{query:id})).value;
  }
  const res=await fetch(url,{signal});if(!res.ok)throw Error();
  return res.arrayBuffer();
}
async function loadExportAudio(job,file){
  job.abort?.abort();const abort=job.abort=new AbortController();job.buffer=null;
  $('export-locate').disabled=false;$('export-save').disabled=true;
  job.trim=null;job.waveform=null;job.waveformTask=null;$('export-trim').disabled=true;$('trim-summary').textContent='';$('export-status').textContent='Loading audio…';
  try{
    const audio=await decodeExport(job.track,file||job.entry?.file,abort.signal,msg=>{if(exportJob===job)$('export-status').textContent=msg;},job.entry);
    if(exportJob!==job||abort.signal.aborted)return;
    job.file=file||job.entry?.file;job.buffer=audio;job.trim=!file&&job.entry?.trim?{...job.entry.trim}:{from:0,to:audio.duration};updateTrimSummary(job);$('export-trim').disabled=false;
    $('export-save').disabled=false;$('export-status').textContent=file?file.name:'';
    if(job.section==='trim'){job.section='';$('export-trim').click();}
  }catch(err){
    if(exportJob===job&&!abort.signal.aborted)$('export-status').textContent=file?'Could not read this audio file. Choose another file.':exportError(job.track,err);
  }
}
async function renderAudioClip(buffer,from,to,sampleRate,effects){
  const duration=(to-from)/effects.speed;
  const ctx=new OfflineAudioContext(Math.min(buffer.numberOfChannels,2),Math.max(1,Math.round(duration*sampleRate)),sampleRate);
  const src=ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=effects.speed;
  const tone=createToneStage(ctx);tone.apply(effects);tone.output.connect(ctx.destination);
  const ratio=effects.linked?1:2**(effects.pitch/12)/effects.speed;
  if(Math.abs(ratio-1)>.0001){
    await ctx.audioWorklet.addModule('pitch.js');
    const shift=new AudioWorkletNode(ctx,'fader-pitch',{outputChannelCount:[ctx.destination.channelCount],processorOptions:{ratio}});
    src.connect(shift);shift.connect(tone.input);
  }else src.connect(tone.input);
  src.start(0,from,to-from);return ctx.startRendering();
}
function wavBlob(buffer,bits){
  const channels=buffer.numberOfChannels,bytes=bits/8,align=channels*bytes,size=buffer.length*align;
  const header=new DataView(new ArrayBuffer(44));
  const tag=(at,str)=>{for(const c of str)header.setUint8(at++,c.charCodeAt(0));};
  tag(0,'RIFF');header.setUint32(4,36+size+(size%2),true);tag(8,'WAVE');tag(12,'fmt ');
  header.setUint32(16,16,true);header.setUint16(20,1,true);header.setUint16(22,channels,true);
  header.setUint32(24,buffer.sampleRate,true);header.setUint32(28,buffer.sampleRate*align,true);
  header.setUint16(32,align,true);header.setUint16(34,bits,true);tag(36,'data');header.setUint32(40,size,true);
  const parts=[header],planes=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  for(let start=0;start<buffer.length;start+=65536){
    const frames=Math.min(65536,buffer.length-start),block=new DataView(new ArrayBuffer(frames*align));
    for(let i=0,at=0;i<frames;i++)for(const channel of planes){
      const x=Math.min(1,Math.max(-1,channel[start+i]));
      const v=Math.round(x*((1<<(bits-1))-(x>=0?1:0)));
      if(bits===16)block.setInt16(at,v,true);
      else{block.setUint8(at,v);block.setUint8(at+1,v>>8);block.setUint8(at+2,v>>16);}
      at+=bytes;
    }
    parts.push(block);
  }
  if(size%2)parts.push(new Uint8Array(1));
  return new Blob(parts,{type:'audio/wav'});
}
async function saveAudioExport(){
  const job=exportJob;if(!job?.buffer||job.saving)return;
  const {from,to}=job.trim;
  const [rate,bits]=$('export-quality').value.split('/').map(Number),effects={linked:$('export-linked').checked,eq:eqPresets[$('export-eq').value]||job.currentEQ};
  for(const [key] of exportKnobs)effects[key]=Number($('export-'+key).value);
  if(job.entry){
    Object.assign(job.entry,{trim:{from,to},quality:$('export-quality').value,preset:$('export-eq').value,effects,file:job.file});
    job.entry.label.textContent=clipTime(from)+' – '+clipTime(to);$('export-dialog').close();return;
  }
  const name=(job.track.artist+' - '+job.track.title).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,160)+'.wav';
  job.saving=true;$('export-save').disabled=$('export-locate').disabled=$('export-trim').disabled=true;
  try{
    let handle;
    if(window.showSaveFilePicker){
      try{handle=await showSaveFilePicker({suggestedName:name,types:[{description:'WAV audio',accept:{'audio/wav':['.wav']}}]});}
      catch(e){if(!['NotAllowedError','SecurityError','NotSupportedError'].includes(e.name))throw e;}
    }
    if(exportJob!==job)return;
    $('export-status').textContent='Rendering audio…';
    const rendered=await renderAudioClip(job.buffer,from,to,rate,effects);
    if(exportJob!==job)return;
    const blob=wavBlob(rendered,bits);
    if(handle){
      const stream=await handle.createWritable();try{await stream.write(blob);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}
    }else{
      const a=make('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),60000);
    }
    if(exportJob===job){$('export-dialog').close();notify(handle?'Audio saved':'Download started');}
  }catch(e){
    if(exportJob===job)$('export-status').textContent=e.name==='AbortError'?'':'Could not save audio. Try a shorter clip or a different location.';
  }finally{
    job.saving=false;if(exportJob===job)$('export-save').disabled=$('export-locate').disabled=$('export-trim').disabled=false;
  }
}
