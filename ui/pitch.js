// Two overlapping, windowed delay taps shift pitch independently of the transport.
class PitchShift extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = 16384;
    this.rings = [new Float32Array(this.size), new Float32Array(this.size)];
    this.write = 0;
    this.phase = 0;
    this.window = Math.min(this.size - 4, Math.round(sampleRate * .058));
    this.target = this.ratio = options?.processorOptions?.ratio || 1;
    this.port.onmessage = event => { this.target = event.data; };
  }
  read(ring, phase) {
    const position = this.write - 2 - this.window * phase;
    const floor = Math.floor(position), fraction = position - floor;
    return ring[floor & (this.size-1)]*(1-fraction) + ring[(floor+1) & (this.size-1)]*fraction;
  }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    for (let i = 0; i < output[0].length; i++) {
      this.ratio += (this.target - this.ratio) * .006;
      const mix = Math.min(1, Math.abs(this.ratio-1)*200);
      const second = (this.phase + .5) % 1;
      const weight = mix ? .5 - .5*Math.cos(2*Math.PI*this.phase) : 0;
      for (let c=0; c<output.length; c++) {
        const ring = this.rings[c], sample = input[c]?.[i] ?? input[0]?.[i] ?? 0;
        ring[this.write] = sample;
        output[c][i] = mix ? sample*(1-mix) + mix*(weight*this.read(ring,this.phase)+(1-weight)*this.read(ring,second)) : sample;
      }
      this.phase = (1+this.phase+(1-this.ratio)/this.window)%1;
      this.write = (this.write+1)&(this.size-1);
    }
    return true;
  }
}
registerProcessor('fader-pitch', PitchShift);
