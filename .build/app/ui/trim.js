'use strict';
function clipTime(seconds){
  const ms=Math.round(seconds*1000);
  return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');
}
function updateTrimSummary(job){
  const {from,to}=job.trim;
  $('trim-summary').textContent=from===0&&to===job.buffer.duration?'Full track':clipTime(from)+' – '+clipTime(to);
}
async function readWavePeaks(buffer,isCurrent){
  const count=Math.min(2048,buffer.length),low=new Float32Array(count),high=new Float32Array(count);
  const channels=Array.from({length:buffer.numberOfChannels},(_,n)=>buffer.getChannelData(n));
  let peak=.001,lastYield=performance.now();
  for(let col=0;col<count;col++){
    const start=Math.floor(col*buffer.length/count),end=Math.floor((col+1)*buffer.length/count);
    let min=0,max=0;
    for(const channel of channels)for(let i=start;i<end;i++){
      const value=channel[i];if(value<min)min=value;if(value>max)max=value;
    }
    low[col]=min;high[col]=max;peak=Math.max(peak,-min,max);
    if(performance.now()-lastYield>14){
      await new Promise(resolve=>setTimeout(resolve,0));if(!isCurrent())return null;
      lastYield=performance.now();
    }
  }
  return {low,high,peak};
}
function initTrimEditor(){
  const dialog=$('trim-editor'),wave=$('trim-wave'),canvas=wave.querySelector('canvas');
  const start=$('trim-start'),end=$('trim-end'),head=$('trim-playhead');
  let job,draft,drag,preview;
  function paintWave(){
    if(!dialog.open||!job?.waveform)return;
    const {low,high,peak}=job.waveform;
    const w=canvas.width=Math.max(1,Math.round(wave.clientWidth*devicePixelRatio));
    const h=canvas.height=Math.max(1,Math.round(wave.clientHeight*devicePixelRatio));
    const ctx=canvas.getContext('2d'),scale=h*.43/peak;
    ctx.fillStyle='#e99c77';
    for(let x=0;x<w;x++){
      const first=Math.floor(x*low.length/w),last=Math.min(low.length,Math.max(first+1,Math.floor((x+1)*low.length/w)));
      let min=0,max=0;
      for(let i=first;i<last;i++){min=Math.min(min,low[i]);max=Math.max(max,high[i]);}
      ctx.fillRect(x,h/2-max*scale,1,Math.max(1,(max-min)*scale));
    }
  }
  new ResizeObserver(paintWave).observe(wave);
  function refresh(){
    const duration=job.buffer.duration;
    wave.style.setProperty('--from',100*draft.from/duration+'%');wave.style.setProperty('--to',100*draft.to/duration+'%');
    $('clip-from').value=Number(draft.from.toFixed(6));$('clip-to').value=Number(draft.to.toFixed(6));
    $('trim-length').textContent=clipTime(draft.to-draft.from);
    for(const [el,value,min,max] of [[start,draft.from,0,draft.to],[end,draft.to,draft.from,duration]]){
      el.setAttribute('aria-valuemin',min);el.setAttribute('aria-valuemax',max);
      el.setAttribute('aria-valuenow',value);el.setAttribute('aria-valuetext',clipTime(value));
    }
  }
  function stopPreview(){
    if(!preview)return;
    const p=preview;preview=null;cancelAnimationFrame(p.frame);
    if(p.source){p.source.onended=null;try{p.source.stop();}catch{}}
    p.ctx.close().catch(()=>{});head.hidden=true;buttonIcon($('trim-listen'),'play','Preview selection');
    if(p.resume&&player.id===p.resume.id&&!player.playing&&!player.loading&&player.offset===p.resume.offset)player.play(player.id,player.offset);
  }
  function setBoundary(key,value){
    if(!Number.isFinite(value)){refresh();return;}
    stopPreview();
    const sample=1/job.buffer.sampleRate;
    const snapped=Math.round(value/sample)*sample;
    draft[key]=key==='from'?Math.max(0,Math.min(snapped,draft.to-sample)):Math.min(job.buffer.duration,Math.max(snapped,draft.from+sample));
    refresh();
  }
  for(const [handle,key,field] of [[start,'from',$('clip-from')],[end,'to',$('clip-to')]]){
    field.onchange=()=>setBoundary(key,field.valueAsNumber);
    handle.onpointerdown=e=>{
      if(e.button!==0||drag)return;
      e.preventDefault();stopPreview();handle.setPointerCapture(e.pointerId);
      drag={id:e.pointerId,x:e.clientX,initial:draft[key],key,handle};handle.classList.add('dragging');
    };
    handle.onlostpointercapture=finishDrag;
    handle.onkeydown=e=>{
      const step=e.shiftKey?1:.01;
      const value={ArrowLeft:draft[key]-step,ArrowRight:draft[key]+step,Home:0,End:job.buffer.duration}[e.key];
      if(value!==undefined){e.preventDefault();setBoundary(key,value);}
    };
  }
  function finishDrag(){if(drag){drag.handle.classList.remove('dragging');drag=null;}}
  function trackDrag(e){
    if(drag?.id!==e.pointerId)return;
    setBoundary(drag.key,drag.initial+(e.clientX-drag.x)*job.buffer.duration/wave.getBoundingClientRect().width);
    if(e.type==='pointerup')finishDrag();
  }
  document.addEventListener('pointermove',trackDrag);
  document.addEventListener('pointerup',trackDrag);
  document.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)finishDrag();});
  window.addEventListener('blur',finishDrag);
  $('export-trim').onclick=async()=>{
    const opened=exportJob;if(!opened?.buffer||opened.saving)return;
    job=opened;draft={...job.trim};
    $('trim-track').textContent=job.track.title+' · '+job.track.artist;
    const ruler=$('trim-ruler');ruler.replaceChildren();
    for(let i=0;i<5;i++)ruler.append(make('span','',clipTime(job.buffer.duration*i/4).slice(0,-2)));
    canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    dialog.showModal();dialog.focus();refresh();
    if(!opened.waveform){
      const buffer=opened.buffer;
      opened.waveformTask||=readWavePeaks(buffer,()=>exportJob===opened&&opened.buffer===buffer);
      const peaks=await opened.waveformTask;
      if(opened.buffer===buffer)opened.waveform=peaks;
    }
    if(job===opened&&dialog.open)paintWave();
  };
  $('trim-reset').onclick=()=>{stopPreview();draft={from:0,to:job.buffer.duration};refresh();};
  $('trim-apply').onclick=()=>{job.trim={...draft};updateTrimSummary(job);dialog.close();};
  $('trim-listen').onclick=async()=>{
    if(preview){stopPreview();return;}
    const ctx=new AudioContext(),p=preview={ctx};
    try{
      await ctx.resume();if(preview!==p)return;
      if(player.playing){player.pause();p.resume={id:player.id,offset:player.offset};}
      const gain=ctx.createGain();gain.gain.value=settings.volume;gain.connect(ctx.destination);
      const source=p.source=ctx.createBufferSource();source.buffer=job.buffer;source.connect(gain);
      const began=ctx.currentTime;source.onended=stopPreview;source.start(began,draft.from,draft.to-draft.from);
      head.hidden=false;buttonIcon($('trim-listen'),'pause','Stop preview');
      const frame=()=>{
        head.style.left=100*Math.min(draft.to,draft.from+ctx.currentTime-began)/job.buffer.duration+'%';
        p.frame=requestAnimationFrame(frame);
      };frame();
    }catch{if(preview===p){stopPreview();notify('Could not preview this selection');}}
  };
  dialog.addEventListener('close',()=>{stopPreview();finishDrag();job=null;draft=null;});
}
