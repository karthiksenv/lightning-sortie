export class FlightAudio {
  constructor() { this.context=null; this.enabled=true; }
  start() {
    if(!this.context) {
      const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
      this.context=new C(); const a=this.context;
      this.master=a.createGain(); this.master.gain.value=this.enabled?0.22:0; this.master.connect(a.destination);
      this.engine=a.createOscillator(); this.engine.type='sawtooth';
      this.filter=a.createBiquadFilter(); this.filter.type='lowpass'; this.filter.frequency.value=150;
      this.engineGain=a.createGain(); this.engineGain.gain.value=0;
      this.engine.connect(this.filter); this.filter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
      const buffer=a.createBuffer(1,a.sampleRate*2,a.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      this.noiseBuffer=buffer; this.wind=a.createBufferSource(); this.wind.buffer=buffer; this.wind.loop=true;
      this.windFilter=a.createBiquadFilter(); this.windFilter.type='lowpass'; this.windFilter.frequency.value=900;
      this.windGain=a.createGain(); this.windGain.gain.value=0;
      this.wind.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master); this.wind.start();
    }
    this.context.resume();
  }
  setEnabled(value) { this.enabled=!!value; if(this.master)this.master.gain.setTargetAtTime(this.enabled?0.22:0,this.context.currentTime,0.15); }
  update(s,active) {
    if(!this.context)return; const t=this.context.currentTime;
    this.engine.frequency.setTargetAtTime(38+s.throttle*56+(s.afterburner?32:0),t,0.15);
    this.filter.frequency.setTargetAtTime(120+s.speed*1.7,t,0.15);
    this.engineGain.gain.setTargetAtTime(active?0.2+s.throttle*0.3:0,t,0.1);
    this.windGain.gain.setTargetAtTime(active?Math.min(s.speed/550,1)*0.35:0,t,0.1);
  }
  cue(type) {
    if(!this.context)return; const a=this.context, t=a.currentTime, gain=a.createGain(); gain.connect(this.master);
    if(type==='explosion'||type==='gun'||type==='missile') {
      const noise=a.createBufferSource(); noise.buffer=this.noiseBuffer;
      const filter=a.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=type==='gun'?1800:500;
      noise.connect(filter); filter.connect(gain); const duration=type==='gun'?0.09:type==='missile'?0.35:1.1;
      gain.gain.setValueAtTime(type==='explosion'?1.6:0.35,t); gain.gain.exponentialRampToValueAtTime(0.001,t+duration);
      noise.start(); noise.stop(t+duration); noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
    } else {
      const osc=a.createOscillator(); osc.type='sine'; osc.connect(gain);
      osc.frequency.setValueAtTime(type==='hit'?240:type==='success'?660:820,t);
      osc.frequency.exponentialRampToValueAtTime(type==='success'?1320:440,t+0.2);
      gain.gain.setValueAtTime(0.35,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.35); osc.start();osc.stop(t+0.4);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
  }
}
