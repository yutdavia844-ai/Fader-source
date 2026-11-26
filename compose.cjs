// Render the four original Afterimage arrangements. Supply an ffmpeg executable as argv[2].
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const rate = 32000;
const tau = 2 * Math.PI;
const sine = cycles => Math.sin(tau * cycles);
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const arrangements = [
  { title: 'Soft Focus', bpm: 96, roots: [50, 46, 53, 48], melody: [0,7,10,14,7,3,12,10], offset: 0 },
  { title: 'Glass Hours', bpm: 108, roots: [48, 51, 46, 53], melody: [7,12,3,10,14,7,10,3], offset: 3 },
  { title: 'Low Orbit', bpm: 84, roots: [45, 48, 43, 50], melody: [12,7,3,10,0,7,14,10], offset: 5 },
  { title: 'Signal Bloom', bpm: 116, roots: [53, 49, 46, 51], melody: [3,10,7,14,12,3,7,10], offset: 1 }
];
const folder = path.join(__dirname, 'ui', 'media');
fs.mkdirSync(folder, { recursive: true });
const catalog = [];
for (const [index, song] of arrangements.entries()) {
  const beat = 60 / song.bpm;
  const seconds = beat * 4 * 20;
  const frames = Math.round(seconds * rate);
  const pcm = Buffer.alloc(frames * 4);
  let seed = 19 + index, prevNoise = 0, slowNoise = 0;
  const chords = song.roots.map(n => [0,3,7,10].map(d => hz(n + d + 12)));
  const notes = song.roots.map(n => song.melody.map(d => hz(n + d + 12)));
  const echo = new Float32Array(Math.floor(beat * 0.75 * rate));
  for (let i = 0; i < frames; i++) {
    const t = i / rate, b = t / beat, bar = Math.floor(b / 4);
    const chord = Math.floor(bar / 2) % 4, step = Math.floor(b * 2), k = Math.floor(b) % 4;
    const pulse = (b % 1) * beat, half = (b * 2 % 1) * beat / 2;
    const chordTime = (b % 8) * beat;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const hiss = (noise - prevNoise) * 0.5;
    prevNoise = noise;
    slowNoise += 0.23 * (noise - slowNoise);
    const drums = bar >= 2 && bar < 19;
    const kick = drums && (k === 0 || k === 2 || (index === 3 && bar > 6)) ? 0.56 * Math.exp(-pulse * 14) * sine(46*pulse + 2.4*(1-Math.exp(-pulse*45))) : 0;
    const snare = drums && k%2 ? Math.exp(-pulse*24) * (slowNoise*0.65 + 0.12*sine(172*pulse)*Math.exp(-pulse*18)) : 0;
    const hat = drums ? hiss * Math.exp(-half*(step%2 ? 67 : 95)) * (step%2 ? 0.18 : 0.083) : 0;
    const root = hz(song.roots[chord]-12 + ((k===3 && step%2) ? 7 : 0));
    const bass = bar>0 ? (sine(root*half)+0.18*sine(root*half*2))*Math.min(1,half*120)*Math.exp(-half*6)*0.22 : 0;
    const note = notes[chord][(step+song.offset)%8];
    const pluck = (sine(note*half + 0.13*sine(2*note*half)*Math.exp(-half*12)) + 0.13*sine(2*note*half)) * Math.min(1,half*240)*Math.exp(-half*(index===2 ? 7 : 12))*0.15*(step%3===1 ? 0.44 : 1);
    const tap = i % echo.length, delay = echo[tap];
    echo[tap] = pluck + delay * 0.36;
    let left = 0, right = 0;
    for (const f of chords[chord]) {
      left += sine(f*t + 0.16*sine(0.16*t))*0.65 + sine(f*1.002*t)*0.35;
      right += sine(f*t + 0.14*sine(0.21*t))*0.6 + sine(f*0.998*t)*0.4;
    }
    const pad = Math.min(1,chordTime*2,(beat*8-chordTime)*4)*0.049*(1-0.24*Math.exp(-pulse*7));
    const fade = Math.min(1,t/0.24,(seconds-t)/1.4);
    const center = kick + bass + snare + pluck;
    pcm.writeInt16LE(Math.round(Math.tanh(center+pad*left+hat+delay*0.39)*fade*29600),i*4);
    pcm.writeInt16LE(Math.round(Math.tanh(center+pad*right+hat*0.7+delay*0.64)*fade*29600),i*4+2);
  }
  const id = 'afterimage-' + (index+1);
  const file = path.join(folder, id+'.ogg');
  execFileSync(process.argv[2], ['-hide_banner','-loglevel','error','-y','-f','s16le','-ar',String(rate),'-ac','2','-i','pipe:0','-c:a','libvorbis','-q:a','3','-metadata','title='+song.title,'-metadata','artist=Fader Studio','-metadata','album=Afterimage',file], { input:pcm });
  catalog.push({id,title:song.title,artist:'Fader Studio',album:'Afterimage',duration:seconds,src:'media/'+id+'.ogg',art:'media/afterimage.jpg',bpm:song.bpm});
}
fs.writeFileSync(path.join(__dirname,'ui','catalog.js'), 'const demoTracks = '+JSON.stringify(catalog,null,2)+';\n');
