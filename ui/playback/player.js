'use strict';
const appOrigin='https://fader.example';
const params=new URLSearchParams(location.hash.slice(1));
const provider=params.get('service'),id=params.get('id');
const mount=document.getElementById('mount');
const send=(type,data={})=>parent.postMessage({type,...data},appOrigin);
let controls={};
const serviceOrigin={SoundCloud:'https://w.soundcloud.com',YouTube:'https://www.youtube.com',Spotify:'https://open.spotify.com'}[provider];
let toneWindow=null;
window.addEventListener('message',event=>{
  if(event.origin===serviceOrigin&&event.data?.type==='tone-ready'&&event.source===document.querySelector('iframe')?.contentWindow){
    if(!toneWindow){toneWindow=event.source;send('tone-ready');}return;
  }
  if(event.source===toneWindow&&event.origin===serviceOrigin&&event.data?.type==='spectrum'){
    send('spectrum',{bands:event.data.bands});return;
  }
  if(event.origin!==appOrigin||event.source!==parent)return;
  const {command,value}=event.data||{};
  if(command==='meter'){toneWindow?.postMessage({type:'meter',enabled:!!value},serviceOrigin);return;}
  if(command==='tone'){toneWindow?.postMessage({type:'fader-tone',settings:value},serviceOrigin);return;}
  if(Object.hasOwn(controls,command))controls[command](Number(value)||0);
});
function script(url){const s=document.createElement('script');s.src=url;s.onerror=()=>send('error');document.head.append(s);}
function soundCloud(){
  const frame=document.createElement('iframe'),origin='https://w.soundcloud.com';
  const capture=params.get('mode')==='export';
  if(capture)frame.name='fader-sc-export';
  frame.allow='autoplay';frame.title='SoundCloud';
  const command=(method,value)=>frame.contentWindow.postMessage(JSON.stringify({method,value}),origin);
  let lastProgress=-Infinity;
  controls={play:()=>command('play'),pause:()=>command('pause'),seek:v=>command('seekTo',v*1000),volume:v=>command('setVolume',100*v)};
  window.addEventListener('message',event=>{
    if(event.origin!==origin||event.source!==frame.contentWindow)return;
    if(capture&&event.data?.type==='captured'){send('captured',{audio:event.data.audio});return;}
    if(capture&&event.data?.type==='capture-error'){send('error');return;}
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    const {method,value}=msg;
    if(method==='ready'){
      for(const evt of ['play','pause','playProgress','finish','error','seek'])command('addEventListener',evt);
      command('getCurrentSound');command('getDuration');send('ready');if(capture)command('play');
    }else if(method==='getCurrentSound'&&value){
      send('meta',{title:value.title,artist:value.user?.username,art:value.artwork_url?.replace(/-large\./,'-t500x500.'),duration:value.duration/1000});
    }else if(method==='getDuration')send('meta',{duration:value/1000});
    else if(method==='playProgress'&&performance.now()-lastProgress>=200){
      lastProgress=performance.now();send('progress',{position:value.currentPosition/1000,playing:true});
    }
    else if(method==='seek')command('getPosition');
    else if(method==='getPosition')send('progress',{position:value/1000});
    else if(capture&&method==='finish')frame.contentWindow.postMessage({type:'end-capture'},origin);
    else if(['play','pause','finish','error'].includes(method))send(method);
  });
  frame.src=origin+'/player/?auto_play=false&show_comments=false&url='+encodeURIComponent(id)+(capture?'#fader-export':'');
  mount.append(frame);
}
function youTube(){
  window.onYouTubeIframeAPIReady=()=>{
    const api=new YT.Player(mount,{videoId:id,width:'100%',height:'100%',playerVars:{playsinline:1,origin:location.origin},events:{
      onReady:()=>{controls={play:()=>api.playVideo(),pause:()=>api.pauseVideo(),seek:s=>api.seekTo(s,true),volume:v=>api.setVolume(v*100)};send('ready');},
      onError:()=>send('error'),onAutoplayBlocked:()=>send('blocked'),
      onStateChange:e=>{
        if(e.data===0)send('finish');
        if(e.data===1){send('meta',{duration:api.getDuration(),title:api.getVideoData().title,artist:api.getVideoData().author});send('play');}
        if(e.data===2)send('pause');
      }
    }});
    setInterval(()=>{if(api.getPlayerState?.()===1)send('progress',{position:api.getCurrentTime(),playing:true});},350);
  };
  script('https://www.youtube.com/iframe_api');
}
function spotify(){
  window.onSpotifyIframeApiReady=api=>api.createController(mount,{uri:'spotify:track:'+id,width:'100%',height:'100%'},ctl=>{
    let played=false,ended=false;
    controls={play:()=>played?ctl.resume():ctl.play(),pause:()=>ctl.pause(),seek:s=>ctl.seek(s)};
    ctl.addListener('ready',()=>send('ready'));
    ctl.addListener('error',()=>send('error'));
    ctl.addListener('playback_update',({data})=>{
      const duration=data.duration/1000,position=data.position/1000;
      if(duration>0)send('meta',{duration});
      if(!data.isPaused){played=true;ended=false;}
      if(played&&!ended&&duration>0&&position>=duration-.025){ended=true;send('finish');return;}
      if(played||!data.isPaused)send('progress',{position,playing:!data.isPaused});
    });
  });
  script('https://open.spotify.com/embed/iframe-api/v1');
}
if(provider==='SoundCloud'&&/^https:\/\/(?:www\.|m\.)?soundcloud\.com\/[\w-]+\/[\w-]+\/?$/.test(id))soundCloud();
else if(provider==='YouTube'&&/^[\w-]{11}$/.test(id))youTube();
else if(provider==='Spotify'&&/^[a-zA-Z0-9]{22}$/.test(id))spotify();
else send('error');
