/* RCM-inspired educational synth. PCM -> FM operator 2. Not a SY77 emulator. */
class RCMVoiceProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.voices=[];
    this.params={mode:'rcm',fmIndex:3.7,pcmDepth:3.8,ratio:2,blend:.24,pcmTone:8500,cutoff:9000,resonance:.13,attack:.015,decay:.34,sustain:.6,release:.4,volume:.6};
    this.pcm=new Float32Array(2048);
    for(let i=0;i<this.pcm.length;i++)this.pcm[i]=Math.sin(2*Math.PI*i/2048);
    this.wavetable=true;this.pcmRate=sampleRate;this.baseMidi=60;
    this.port.onmessage=e=>this.receive(e.data);
  }
  receive(msg){
    if(msg.type==='params'){Object.assign(this.params,msg.params);return}
    if(msg.type==='sample'){
      const data=msg.data instanceof Float32Array?msg.data:new Float32Array(msg.data);
      if(data.length>1){this.pcm=data;this.wavetable=!!msg.wavetable;this.pcmRate=msg.rate||sampleRate;this.baseMidi=msg.baseMidi??60}
    }else if(msg.type==='on'){
      const note=msg.note|0;
      this.voices=this.voices.filter(v=>v.note!==note);
      if(this.voices.length>=8)this.voices.shift();
      this.voices.push({note,velocity:Math.min(1,Math.max(0,msg.velocity??.9)),gate:true,stage:0,env:0,
        p1:0,p2:0,p3:0,pos:0,pre:0,ic1:0,ic2:0});
    }else if(msg.type==='off'){
      for(const v of this.voices)if(v.note===(msg.note|0))v.gate=false;
    }else if(msg.type==='panic'){this.voices=[]}
  }
  readPCM(pos){
    const a=this.pcm,n=a.length,x=((pos%n)+n)%n,i=Math.floor(x),f=x-i;
    return a[i]*(1-f)+a[(i+1)%n]*f;
  }
  process(inputs,outputs){
    const out=outputs[0];if(!out||!out.length)return true;
    const left=out[0],right=out[1]||left,p=this.params;
    const cut=Math.min(sampleRate*.46,Math.max(80,p.cutoff));
    const g=Math.tan(Math.PI*cut/sampleRate),k=2-1.88*Math.max(0,Math.min(1,p.resonance));
    const a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;
    const preAlpha=1-Math.exp(-2*Math.PI*Math.min(sampleRate*.45,Math.max(80,p.pcmTone))/sampleRate);
    const attackStep=1/(Math.max(.003,p.attack)*sampleRate);
    const decayRate=1/(Math.max(.02,p.decay)*sampleRate);
    const relMult=Math.exp(-1/(Math.max(.025,p.release)*sampleRate));
    const twopi=2*Math.PI;
    for(let i=0;i<left.length;i++){
      let sum=0;
      for(const v of this.voices){
        if(!v.gate){v.stage=3;v.env*=relMult}
        else if(v.stage===0){v.env+=attackStep;if(v.env>=1){v.env=1;v.stage=1}}
        else if(v.stage===1){v.env-=decayRate*(1-p.sustain);if(v.env<=p.sustain){v.env=p.sustain;v.stage=2}}
        if(v.env<.00009)continue;
        const freq=440*Math.pow(2,(v.note-69)/12);
        const raw=this.readPCM(v.pos);
        const phaseStep=twopi*freq/sampleRate;
        v.pos+=this.wavetable?this.pcm.length*freq/sampleRate:(this.pcmRate/sampleRate)*Math.pow(2,(v.note-this.baseMidi)/12);
        v.pre+=preAlpha*(raw-v.pre);
        const ext=p.mode==='rcm'?p.pcmDepth*v.pre:0;
        const secondary=Math.sin(v.p3);
        const op2=Math.sin(v.p2+.55*p.fmIndex*secondary+ext);
        const fm=Math.sin(v.p1+p.fmIndex*op2);
        v.p1=(v.p1+phaseStep)%twopi;
        v.p2=(v.p2+phaseStep*p.ratio)%twopi;
        v.p3=(v.p3+phaseStep*p.ratio*2.01)%twopi;
        const signal=p.mode==='pcm'?raw:p.mode==='fm'?fm:(1-p.blend)*fm+p.blend*raw;
        const v3=signal-v.ic2,v1=a1*v.ic1+a2*v3,v2=v.ic2+a2*v.ic1+a3*v3;
        v.ic1=2*v1-v.ic1;v.ic2=2*v2-v.ic2;
        sum+=v2*v.env*v.velocity;
      }
      const val=Math.tanh(sum*.504*p.volume);
      left[i]=val;if(right!==left)right[i]=val;
    }
    this.voices=this.voices.filter(v=>v.env>=.00009);
    return true;
  }
}
registerProcessor('rcm-voice-processor',RCMVoiceProcessor);
