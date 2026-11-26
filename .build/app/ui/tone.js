function createSpectrum(ctx,output){
  const analyser=ctx.createAnalyser();
  analyser.fftSize=1024;analyser.smoothingTimeConstant=.76;
  output.connect(analyser);
  const bins=new Uint8Array(analyser.frequencyBinCount),bands=new Uint8Array(32);
  return ()=>{
    analyser.getByteFrequencyData(bins);
    for(let i=0;i<bands.length;i++){
      const start=Math.floor(2**(i/4)),end=Math.min(bins.length,Math.max(start+1,Math.ceil(2**((i+1)/4))));
      let sum=0;for(let j=start;j<end;j++)sum+=bins[j];
      bands[i]=sum/(end-start);
    }
    return bands;
  };
}
function createToneStage(ctx){
  const bands=[60,230,910,3600,14000];
  const filters=bands.map((frequency,i)=>{
    const f=ctx.createBiquadFilter();
    f.type=i===0?'lowshelf':i===bands.length-1?'highshelf':'peaking';
    f.frequency.value=frequency;f.Q.value=.85;return f;
  });
  for(let i=1;i<filters.length;i++)filters[i-1].connect(filters[i]);
  const drive=ctx.createWaveShaper();filters.at(-1).connect(drive);
  const output=ctx.createGain();drive.connect(output);
  let room,repeat;
  function send(effect){
    const wet=ctx.createGain();wet.gain.value=0;
    drive.connect(effect);effect.connect(wet);wet.connect(output);return wet;
  }
  function roomSend(){
    const convolver=ctx.createConvolver(),length=Math.round(ctx.sampleRate*1.65);
    const impulse=ctx.createBuffer(2,length,ctx.sampleRate);
    for(let channel=0;channel<2;channel++){
      const data=impulse.getChannelData(channel);
      for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length)**3;
    }
    convolver.buffer=impulse;return send(convolver);
  }
  function echoSend(){
    const delay=ctx.createDelay(1),feedback=ctx.createGain(),filter=ctx.createBiquadFilter();
    delay.delayTime.value=.31;feedback.gain.value=.34;
    filter.type='lowpass';filter.frequency.value=3600;
    delay.connect(filter);filter.connect(feedback);feedback.connect(delay);
    return send(delay);
  }
  let lastDrive=0;
  function apply(settings){
    filters.forEach((f,i)=>f.gain.setTargetAtTime(settings.bypass?0:settings.eq[i],ctx.currentTime,.014));
    const reverb=settings.bypass?0:(settings.reverb||0)/100,echo=settings.bypass?0:(settings.echo||0)/100;
    if(reverb&&!room)room=roomSend();
    if(echo&&!repeat)repeat=echoSend();
    room?.gain.setTargetAtTime(reverb*.85,ctx.currentTime,.025);
    repeat?.gain.setTargetAtTime(echo*.72,ctx.currentTime,.025);
    const value=settings.bypass?0:settings.drive;
    if(value===lastDrive)return;
    lastDrive=value;
    const k=value*.085,curve=new Float32Array(2049);
    if(k)for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((1+k)*(i/1024-1))/Math.tanh(1+k)/(1+k*.12);
    drive.curve=k?curve:null;
  }
  return {input:filters[0],output,filters,apply};
}
