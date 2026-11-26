const frequencies = [60, 230, 910, 3600, 14000];
const audioDefaults = {eq:[0,0,0,0,0], preset:'Flat', drive:0, reverb:0, echo:0, speed:1, pitch:0, linked:true, volume:.72, fade:3, bypass:false};
const eqPresets = {'Flat':[0,0,0,0,0], 'Bass Boost':[5,3,0,-1,0], 'Vocal Lift':[-2,-1,2,4,1], 'Warm Tape':[3,1,0,-1,-3], 'Air':[0,-1,0,2,4]};
class Transport {
  constructor(settings, read, next, change, report) {
    Object.assign(this,{settings, read, next, change, report});
    this.version=0; this.planVersion=0; this.offset=0; this.id=null;
    this.cache=new Map();
  }
  async init() {
    if (!this.ready) this.ready=this.createGraph().catch(e=>{this.ready=null;this.ctx?.close();throw e;});
    await this.ready;
    await this.ctx.resume();
  }
  async createGraph() {
    const ctx=this.ctx=new AudioContext({latencyHint:'playback', sampleRate:44100});
    await ctx.audioWorklet.addModule('pitch.js');
    this.pitchNode=new AudioWorkletNode(ctx,'fader-pitch',{outputChannelCount:[2]});
    this.tone=createToneStage(ctx);this.filters=this.tone.filters;
    this.pitchNode.connect(this.tone.input);
    this.master=ctx.createGain();this.tone.output.connect(this.master);
    this.master.connect(ctx.destination);
    this.apply();
  }
  get speed(){return this.settings.bypass?1:this.settings.speed;}
  apply() {
    if (!this.master) return;
    const s=this.settings, t=this.ctx.currentTime;
    this.tone.apply(s);
    this.master.gain.setTargetAtTime(s.volume,t,.015);
    this.pitchNode.port.postMessage(s.bypass||s.linked?1:2**(s.pitch/12)/this.speed);
  }
  get playing(){return !!this.deck;}
  position() {
    if (!this.deck) return this.offset;
    return this.deckPosition(this.deck,this.ctx.currentTime);
  }
  deckPosition(d,now){
    const t=Math.max(0,now-d.start),r=Math.min(t,d.ramp);
    const travel=d.ramp ? r*(d.from+(d.rate-d.from)*r/(2*d.ramp))+(t-r)*d.rate : t*d.rate;
    return Math.min(d.buffer.duration,d.offset+travel);
  }
  endTime(d){
    const left=d.buffer.duration-d.offset;
    const swept=d.ramp*(d.from+d.rate)*.5;
    if(left>=swept)return d.start+d.ramp+(left-swept)/d.rate;
    const slope=(d.rate-d.from)/d.ramp;
    return d.start+2*left/(d.from+Math.sqrt(Math.max(0,d.from*d.from+2*slope*left)));
  }
  rampRate(d,now){
    const fraction=d.ramp?Math.min(1,Math.max(0,(now-d.start)/d.ramp)):1;
    const from=d.from+(d.rate-d.from)*fraction,offset=this.deckPosition(d,now);
    Object.assign(d,{offset,start:now,from,rate:this.speed,ramp:.075});
    d.src.playbackRate.cancelScheduledValues(now);
    d.src.playbackRate.setValueAtTime(from,now);d.src.playbackRate.linearRampToValueAtTime(d.rate,now+d.ramp);
  }
  buffer(id) {
    if (!this.cache.has(id)) {
      const pending=this.read(id).then(data=>this.ctx.decodeAudioData(data));
      this.cache.set(id,pending);
      pending.catch(()=>{if(this.cache.get(id)===pending)this.cache.delete(id);});
    }
    return this.cache.get(id);
  }
  trim(ids) {for (const key of this.cache.keys()) if(!ids.includes(key))this.cache.delete(key);}
  makeDeck(id,buffer,start,offset) {
    const src=this.ctx.createBufferSource(), gain=this.ctx.createGain();
    src.buffer=buffer; src.playbackRate.value=this.speed;
    src.connect(gain); gain.connect(this.pitchNode); src.start(start,offset);
    return {id,buffer,src,gain,start,offset,rate:this.speed,from:this.speed,ramp:0};
  }
  drop(d) {
    if (!d) return;
    d.src.onended=null;
    try {d.src.stop();} catch {}
    d.src.disconnect(); d.gain.disconnect();
  }
  cancel() {
    clearTimeout(this.preloadTimer);
    this.version++; this.planVersion++;
    this.drop(this.deck);this.drop(this.upcoming);
    this.deck=this.upcoming=null;this.loading=false;
  }
  pause() {
    this.offset=this.position(); this.cancel();
    if(this.ctx?.state==='running') this.ctx.suspend();
    this.trim([this.id]);this.change();
  }
  async play(id=this.id,offset=0) {
    this.cancel();
    const version=this.version;
    this.id=id;this.offset=offset;this.loading=true; this.trim([id]);this.change();
    try {
      await this.init();
      if(version!==this.version)return;
      const buffer=await this.buffer(id);
      if(version!==this.version)return;
      this.loading=false;
      const d=this.deck=this.makeDeck(id,buffer,this.ctx.currentTime,Math.min(offset,Math.max(0,buffer.duration-.02)));
      this.watch(d);this.change();this.plan();
    } catch(e){if(version===this.version){this.pause();this.report('Could not play this audio file.');}}
  }
  watch(d) {
    d.src.onended=()=>{
      if (this.deck!==d)return;
      this.drop(d);
      const next=this.upcoming;
      this.deck=next;this.upcoming=null;this.planVersion++;
      if(next) {this.id=next.id;this.offset=next.offset;this.watch(next);this.change();this.plan();}
      else {
        const id=this.next();
        if(id && id!==this.failedNext)this.play(id);
        else {this.offset=0;this.pause();}
      }
    };
  }
  async plan() {
    clearTimeout(this.preloadTimer);
    const token=++this.planVersion,d=this.deck;
    if(!d)return;
    this.drop(this.upcoming);this.upcoming=null;
    const now=this.ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);d.gain.gain.setValueAtTime(1,now);
    const id=this.next();this.trim([this.id,id]);this.failedNext=null;
    if(!id||trackById(id)?.url)return;
    // Keep the next decoded track out of memory until the handoff approaches.
    const untilEnd=this.endTime(d)-now;
    if(untilEnd>65){
      this.preloadTimer=setTimeout(()=>{if(token===this.planVersion)this.plan();},(untilEnd-30)*1000);
      return;
    }
    try {
      const buf=await this.buffer(id);
      if(token!==this.planVersion||this.deck!==d)return;
      const end=this.endTime(d);
      const remaining=Math.max(0,end-this.ctx.currentTime);
      const fade=Math.min(this.settings.fade,remaining,buf.duration/(this.speed*2));
      const start=Math.max(this.ctx.currentTime,end-fade);
      this.upcoming=this.makeDeck(id,buf,start,0);
      if(fade>.001) {
        d.gain.gain.setValueAtTime(1,start);d.gain.gain.linearRampToValueAtTime(0,end);
        const g=this.upcoming.gain.gain;g.setValueAtTime(0,start);g.linearRampToValueAtTime(1,end);
      }
    } catch {if(token===this.planVersion)this.failedNext=id;}
  }
  seek(position) {
    if(this.playing||this.loading)this.play(this.id,position);
    else {this.offset=position;this.change();}
  }
  refreshTime(){
    this.apply();
    if(!this.deck||this.deck.rate===this.speed)return;
    const now=this.ctx.currentTime;
    this.rampRate(this.deck,now);
    if(this.upcoming && this.upcoming.start<=now){
      this.rampRate(this.upcoming,now);
      const end=Math.max(now+.001,this.endTime(this.deck));
      for(const [d,target] of [[this.deck,0],[this.upcoming,1]]){
        d.gain.gain.cancelAndHoldAtTime(now);d.gain.gain.linearRampToValueAtTime(target,end);
      }
    }else this.plan();
  }
}
