// Runs only in the music-service frame hosted directly by Fader's playback page.
const relay='https://playback.fader.example';
if(location.ancestorOrigins[0]!==relay||!['https://w.soundcloud.com','https://www.youtube.com','https://open.spotify.com'].includes(location.origin))return;
let settings={eq:[0,0,0,0,0],drive:0,reverb:0,echo:0,fade:0,speed:1,pitch:0,linked:true,bypass:false,volume:1};
let currentMedia=null;
const exportWidget=location.origin==='https://w.soundcloud.com'&&(window.name==='fader-sc-export'||location.hash==='#fader-export');
let recorder;
function recordOutput(ctx,output){
  if(recorder)return;
  const sink=ctx.createMediaStreamDestination();output.connect(sink);
  recorder=new MediaRecorder(sink.stream);
  const chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>parent.postMessage({type:'captured',audio:new Blob(chunks,{type:recorder.mimeType})},relay);
  recorder.onerror=()=>parent.postMessage({type:'capture-error'},relay);
  recorder.start(1000);
}
window.addEventListener('message',e=>{
  if(exportWidget&&e.source===parent&&e.origin===relay&&e.data?.type==='end-capture'){
    if(recorder?.state==='recording')recorder.stop();else parent.postMessage({type:'capture-error'},relay);
  }
});
const stages=new Map();
const connect=AudioNode.prototype.connect,disconnect=AudioNode.prototype.disconnect;
// Two delay taps sweep half a cycle apart. Each resets while its window is silent.
function pitchSend(ctx,input,output){
  const sweep=.058,size=1024,buffer=ctx.createBuffer(4,size,ctx.sampleRate);
  const modulation=ctx.createBufferSource(),split=ctx.createChannelSplitter(4);
  modulation.buffer=buffer;modulation.loop=true;modulation.connect(split);
  const depths=[];
  for(let tap=0;tap<2;tap++){
    const ramp=buffer.getChannelData(2*tap),window=buffer.getChannelData(2*tap+1);
    for(let i=0;i<size;i++){
      const phase=(i/size+tap*.5)%1;
      ramp[i]=2*phase-1;window[i]=.5-.5*Math.cos(2*Math.PI*phase);
    }
    const delay=ctx.createDelay(.1),depth=ctx.createGain(),gain=ctx.createGain();
    delay.delayTime.value=sweep/2+.001;gain.gain.value=0;
    split.connect(depth,2*tap);depth.connect(delay.delayTime);split.connect(gain.gain,2*tap+1);
    input.connect(delay);delay.connect(gain);gain.connect(output);depths.push(depth);
  }
  modulation.start();
  return ratio=>{
    for(const depth of depths)depth.gain.setTargetAtTime(Math.sign(1-ratio)*sweep/2,ctx.currentTime,.012);
    modulation.playbackRate.setTargetAtTime(Math.abs(1-ratio)*size/(ctx.sampleRate*sweep),ctx.currentTime,.012);
  };
}
function envelope(){
  const media=currentMedia;
  if(!media||!Number.isFinite(media.duration)||!settings.fade||settings.bypass)return 1;
  const span=Math.min(media.duration/2,settings.fade*(media.playbackRate||1));
  if(span<=0)return 1;
  return Math.min(1,Math.max(0,Math.min(media.currentTime,media.duration-media.currentTime)/span));
}
function applyRate(){
  if(!currentMedia||currentMedia.mediaKeys)return;
  const rate=settings.bypass?1:settings.speed;
  currentMedia.preservesPitch=settings.bypass||!settings.linked;
  if(Math.abs(currentMedia.playbackRate-rate)>.0001)currentMedia.playbackRate=rate;
}
function watchMedia(media){
  if(media.mediaKeys)return;
  currentMedia=media;applyRate();
}
function stage(ctx){
  if(stages.has(ctx))return stages.get(ctx);
  const tone=createToneStage(ctx);
  const dry=ctx.createGain(),wet=ctx.createGain(),output=ctx.createGain(),transition=ctx.createGain();
  let shift;
  tone.output.connect(dry);dry.connect(output);wet.gain.value=0;wet.connect(output);
  output.connect(transition);
  if(exportWidget)recordOutput(ctx,transition);else connect.call(transition,ctx.destination);
  tone.fade=()=>transition.gain.setTargetAtTime(envelope(),ctx.currentTime,.045);
  const update=tone.apply;
  tone.apply=s=>{
    update(s);output.gain.setTargetAtTime(location.origin==='https://open.spotify.com'?s.volume:1,ctx.currentTime,.015);
    const ratio=s.bypass||s.linked?1:2**(s.pitch/12);
    if(ratio!==1&&!shift)shift=pitchSend(ctx,tone.output,wet);
    shift?.(ratio);dry.gain.setTargetAtTime(ratio===1?1:0,ctx.currentTime,.014);
    wet.gain.setTargetAtTime(ratio===1?0:1,ctx.currentTime,.014);tone.fade();
  };
  stages.set(ctx,tone);tone.apply(settings);parent.postMessage({type:'tone-ready'},relay);
  return tone;
}
// Some players already route the recording through Web Audio. Insert the
// tone stage once at their output, keeping every upstream connection intact.
AudioNode.prototype.connect=function(target,...ports){
  if(target!==this.context.destination||!(this.context instanceof AudioContext))return connect.call(this,target,...ports);
  connect.call(this,stage(this.context).input,...ports);return target;
};
AudioNode.prototype.disconnect=function(...args){
  if(args[0]===this.context.destination&&stages.has(this.context))args[0]=stages.get(this.context).input;
  return disconnect.apply(this,args);
};
const wired=new WeakSet();
let mediaContext;
if(location.origin==='https://open.spotify.com'){
  // Spotify serves its public preview MP3s with anonymous CORS support.
  // Request that mode before the element starts loading a preview.
  const src=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
  Object.defineProperty(HTMLMediaElement.prototype,'src',{...src,set(value){
    if(typeof value==='string'&&/^https:\/\/p\.scdn\.co\/mp3-preview\//.test(value)&&this.crossOrigin===null){
      this.crossOrigin='anonymous';
      const fallback=()=>{
        if(this.src===value){this.removeAttribute('crossorigin');src.set.call(this,value);}
      };
      this.addEventListener('error',fallback,{once:true});
      this.addEventListener('loadeddata',()=>this.removeEventListener('error',fallback),{once:true});
    }
    src.set.call(this,value);
  }});
}
function routeMedia(media){
  if(media instanceof HTMLMediaElement)watchMedia(media);
  if(location.origin==='https://w.soundcloud.com'&&stages.size)return;
  if(!(media instanceof HTMLMediaElement)||wired.has(media)||media.mediaKeys||!media.currentSrc)return;
  // Web Audio can process same-origin media or a CORS-enabled media element.
  // Leave other elements with their normal output.
  let url;try{url=new URL(media.currentSrc);}catch{return;}
  if(url.origin!==location.origin&&media.crossOrigin===null)return;
  try{
    mediaContext||=new AudioContext({latencyHint:'playback'});
    const source=mediaContext.createMediaElementSource(media);
    source.connect(mediaContext.destination);wired.add(media);mediaContext.resume().catch(()=>{});
  }catch{/* A provider-owned MediaElementAudioSourceNode uses the output stage above. */}
}
document.addEventListener('playing',e=>routeMedia(e.target),true);
const playMedia=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(...args){
  watchMedia(this);
  if(!this.isConnected){
    this.addEventListener('playing',()=>routeMedia(this),{once:true});
  }
  return playMedia.apply(this,args);
};
const createMediaSource=AudioContext.prototype.createMediaElementSource;
AudioContext.prototype.createMediaElementSource=function(media){
  const source=createMediaSource.call(this,media);watchMedia(media);return source;
};
setInterval(()=>{
  if(!currentMedia||currentMedia.paused||!settings.fade)return;
  for(const tone of stages.values())tone.fade();
},100);
let meterTimer;
window.addEventListener('message',e=>{
  if(e.source===parent&&e.origin===relay&&e.data?.type==='meter'){
    clearInterval(meterTimer);
    if(e.data.enabled)meterTimer=setInterval(()=>{
      for(const [ctx,tone] of stages)if(ctx.state==='running'){
        tone.spectrum||=createSpectrum(ctx,tone.output);
        parent.postMessage({type:'spectrum',bands:tone.spectrum()},relay);break;
      }
    },60);
    return;
  }
  if(e.source!==parent||e.origin!==relay||e.data?.type!=='fader-tone')return;
  const p=e.data.settings;
  if(!Array.isArray(p?.eq)||p.eq.length!==5||!p.eq.every(v=>Number.isFinite(v)&&Math.abs(v)<=12)||!Number.isFinite(p.drive)||p.drive<0||p.drive>100)return;
  const clamp=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
  settings={eq:p.eq,drive:p.drive,bypass:!!p.bypass,volume:clamp(p.volume,0,1,1),
    speed:clamp(p.speed,.5,2,1),pitch:clamp(p.pitch,-12,12,0),linked:p.linked!==false,
    fade:clamp(p.fade,0,12,0),reverb:clamp(p.reverb,0,100,0),echo:clamp(p.echo,0,100,0)};
  applyRate();
  for(const tone of stages.values())tone.apply(settings);
  if(stages.size)parent.postMessage({type:'tone-ready'},relay);
});
