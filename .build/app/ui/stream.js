const playbackOrigin='https://playback.fader.example';

class FaderTransport extends Transport {
  get playing(){return this.stream ? this.stream.playing : super.playing;}
  position(){
    const s=this.stream;
    if(!s)return super.position();
    const elapsed=s.playing?Math.min(1,(performance.now()-s.stamp)/1000)*(s.toneReady?this.speed:1):0;
    return Math.min(s.duration||s.track.duration||Infinity,s.position+elapsed);
  }
  send(command,value){
    if(this.stream?.ready)this.stream.frame.contentWindow.postMessage({command,value},playbackOrigin);
  }
  releaseStream(){
    if(!this.stream)return;
    clearTimeout(this.stream.timer);
    this.stream.frame.remove();this.stream=null;
    $('video-slot').hidden=true;
  }
  arm(s){
    clearTimeout(s.timer);
    s.timer=setTimeout(()=>{if(this.stream===s&&this.loading)this.failStream();},22000);
  }
  failStream(){
    const name=this.stream.track.provider;
    this.offset=this.position();this.releaseStream();this.loading=false;this.change();
    this.report(name+' could not play this track. Try another result.');
  }
  async play(id=this.id,offset=0){
    const t=trackById(id);
    if(!t?.url){this.releaseStream();return super.play(id,offset);}
    if(this.stream?.track.id===id){
      const s=this.stream;s.wantsPlay=true;
      if(Math.abs(s.position-offset)>.65)this.seek(offset);
      this.loading=true;this.arm(s);this.send('play');this.change();return;
    }
    this.releaseStream();this.cancel();this.ctx?.suspend();
    this.id=id;this.offset=offset;this.loading=true;
    const frame=make('iframe'),url=new URL(t.url);
    const key=t.provider==='SoundCloud'?'https://soundcloud.com'+url.pathname:t.provider==='Spotify'?url.pathname.split('/').filter(Boolean).at(-1):url.searchParams.get('v')||url.pathname.slice(1);
    const s=this.stream={track:t,frame,ready:false,wantsPlay:true,playing:false,position:offset,stamp:performance.now()};
    frame.allow='autoplay; encrypted-media; fullscreen';frame.title=t.provider+' playback';
    frame.src=playbackOrigin+'/player.html#'+new URLSearchParams({service:t.provider,id:key});
    const video=t.provider==='YouTube';
    $('video-slot').hidden=!video;
    (video?$('video-slot'):$('audio-slot')).replaceChildren(frame);
    this.arm(s);this.change();
  }
  receive(event){
    const s=this.stream;
    if(!s||event.origin!==playbackOrigin||event.source!==s.frame.contentWindow)return;
    const m=event.data||{};
    if(m.type==='tone-ready'){
      s.toneReady=true;this.updateTone();syncMeter();syncTransport();return;
    }
    if(m.type==='spectrum'){if(m.bands instanceof Uint8Array&&m.bands.length===32)s.bands=m.bands;return;}
    if(m.type==='error'){this.failStream();return;}
    if(m.type==='ready'){
      s.ready=true;this.apply();syncMeter();
      if(s.position>0)this.send('seek',s.position);
      this.send(s.wantsPlay?'play':'pause');return;
    }
    if(m.type==='meta'){
      const t=s.track;
      const duration=Number(m.duration);
      if(t.provider==='Spotify'&&duration>0&&duration<=31&&t.duration>duration+2)s.preview=true;
      let changed=duration>0&&s.duration!==duration;
      if(duration>0)s.duration=duration;
      for(const [k,v] of Object.entries({duration:duration>0&&!s.preview?duration:null,art:safeArt(m.art),title:m.title,artist:m.artist})){
        if(v&&t[k]!==v){t[k]=v;changed=true;}
      }
      if(changed)syncTransport();
      return;
    }
    if(m.type==='finish'){
      const id=this.next();this.releaseStream();this.loading=false;this.offset=0;
      if(id)this.play(id);else this.change();return;
    }
    if(m.type==='blocked'){this.pause();this.report('Press Play to start this track.');return;}
    if(m.type==='play'||m.type==='progress'||m.type==='pause'){
      const was=s.playing,pending=this.loading,pos=this.position();
      if(Number.isFinite(m.position))s.position=Math.max(0,m.position);else s.position=pos;
      s.stamp=performance.now();this.offset=s.position;
      const running=m.type==='play'?true:m.type==='pause'?false:m.playing;
      if(typeof running==='boolean'){
        if(running&&!s.wantsPlay){this.send('pause');return;}
        s.playing=running;
        if(running||was){clearTimeout(s.timer);this.loading=false;}
      }
      if(was!==s.playing||pending!==this.loading)this.change();else tick();
    }
  }
  pause(){
    const s=this.stream;
    if(!s)return super.pause();
    this.offset=s.position=this.position();s.stamp=performance.now();
    s.wantsPlay=false;s.playing=false;this.loading=false;clearTimeout(s.timer);
    this.send('pause');this.change();
  }
  seek(position){
    if(!this.stream)return super.seek(position);
    this.offset=this.stream.position=position;this.stream.stamp=performance.now();
    this.send('seek',position);this.change();
  }
  updateTone(){
    if(this.stream?.toneReady){
      const {eq,drive,reverb,echo,fade,speed,pitch,linked,bypass,volume}=this.settings;
      this.stream.frame.contentWindow.postMessage({command:'tone',value:{eq,drive,reverb,echo,fade,speed,pitch,linked,bypass,volume}},playbackOrigin);
    }
  }
  apply(){
    super.apply();this.send('volume',this.settings.volume);
    this.updateTone();
    const mute=this.settings.volume===0;
    if(mute!==this.hostMuted){
      this.hostMuted=mute;
      bridge('mute',{enabled:mute}).catch(()=>{this.hostMuted=undefined;});
    }
  }
}
function safeArt(url){return typeof url==='string'&&/^https:\/\//i.test(url)?url:'';}
