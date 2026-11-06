/* Shared browser/Node decoder. The receiver has no expected message text. */
(function(root){
 'use strict';
 const PREAMBLE='110100111010000101101100'.split('').map(Number);
 const REFINEMENT_SYMBOLS=[.5,.25,1/6,.125];
 function lowerBound(a,x){let l=0,r=a.length;while(l<r){const m=(l+r)>>1;if(a[m]<x)l=m+1;else r=m;}return l;}
 function solve(A,b){
  const m=A.map((r,i)=>[...r,b[i]]),n=b.length;
  for(let k=0;k<n;k++){
   let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;
   [m[k],m[pivot]]=[m[pivot],m[k]];
   if(Math.abs(m[k][k])<1e-10)return null;
   const scale=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=scale;
   for(let i=0;i<n;i++)if(i!==k){const v=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=v*m[k][j];}
  }
  return m.map(r=>r[n]);
 }
 function classify(t,y,start,T,frequencies=[4,10]){
  const l=lowerBound(t,start),r=lowerBound(t,start+T),n=r-l;
  if(n<5||t[0]>start+.04||t.at(-1)<start+T-.045)return {bit:-1,confidence:0};
  if((n-1)/(t[r-1]-t[l])<=2*Math.max(...frequencies))return {bit:-1,confidence:0};
  let mean=0;for(let i=l;i<r;i++)mean+=y[i];mean/=n;
  let variance=0,maxGap=0;for(let i=l;i<r;i++){variance+=(y[i]-mean)**2;if(i>l)maxGap=Math.max(maxGap,t[i]-t[i-1]);}
  if(variance/n<.01||maxGap>Math.min(.12,T*.4))return {bit:-1,confidence:0};
  const rss=frequencies.map(f=>{
   const A=Array.from({length:4},()=>[0,0,0,0]),b=[0,0,0,0];
   for(let i=l;i<r;i++){
    const x=(t[i]-start)/T,phase=2*Math.PI*f*(t[i]-start),row=[1,x,Math.sin(phase),Math.cos(phase)],v=y[i]-mean;
    for(let j=0;j<4;j++){b[j]+=row[j]*v;for(let k=0;k<4;k++)A[j][k]+=row[j]*row[k];}
   }
   const beta=solve(A,b);if(!beta)return Infinity;
   // Minimum least-squares residual = y'y - beta' X'y.
   return Math.max(0,variance-beta.reduce((a,v,j)=>a+v*b[j],0));
  });
  if(!rss.every(Number.isFinite))return {bit:-1,confidence:0};
  return {bit:rss[1]<rss[0]?1:0,confidence:Math.abs(rss[0]-rss[1])/(rss[0]+rss[1]+1e-10)};
 }
 function textOf(bits){
  let text='';for(let i=0;i+8<=bits.length;i+=8){let v=0,bad=false;for(const b of bits.slice(i,i+8)){bad||=b<0;v=(v<<1)|Math.max(0,b);}text+=bad||v<32||v>126?'�':String.fromCharCode(v);}return text;
 }
 class LiveDecoder{
  constructor({symbol=.5,bytes=5,profile='legacy'}={}){
   const allowed=profile==='rate-coupled'?REFINEMENT_SYMBOLS:profile==='legacy'?[.5,.4,.25]:[];
   if(!allowed.includes(symbol)||!Number.isInteger(bytes)||bytes<1||bytes>16)throw Error('Invalid profile, symbol time or message length');
   this.profile=profile;this.frequencies=profile==='rate-coupled'?[2/symbol,3/symbol]:[4,10];
   this.T=symbol;this.bytes=bytes;this.t=[];this.y=[];this.scan=0;this.lock=null;this.bits=[];this.conf=[];this.packets=[];
  }
  push(t,y){if(Number.isFinite(t)&&Number.isFinite(y)&&(!this.t.length||t>this.t.at(-1))){if(!this.t.length)this.scan=t;this.t.push(t);this.y.push(y);}}
  process(){
   const events=[];if(!this.t.length)return events;
   const now=this.t.at(-1),T=this.T;
   if(!this.lock){
    const last=now-PREAMBLE.length*T-.15*T;
    if(last>=this.scan){
     let best=null;
     for(let start=this.scan;start<=last;start+=1/60){
      let matches=0,confidence=0;
      for(let i=0;i<PREAMBLE.length;i++){
       const c=classify(this.t,this.y,start+i*T,T,this.frequencies),correct=c.bit===PREAMBLE[i];
       if(correct)matches++;confidence+=(correct?1:-1)*c.confidence;
      }
      if(!best||matches>best.matches||(matches===best.matches&&confidence>best.score))best={start,matches,score:confidence};
     }
     this.scan=last+1/60;
     if(best&&best.matches>=23&&best.score/PREAMBLE.length>.25){
      this.lock={start:best.start,matches:best.matches,confidence:best.score/PREAMBLE.length};this.bits=[];this.conf=[];
      events.push({type:'sync',...this.lock});
     }
    }
   }
   if(this.lock){
    const start=this.lock.start+PREAMBLE.length*T;
    while(this.bits.length<this.bytes*8&&now>=start+(this.bits.length+1)*T+.025){
     const c=classify(this.t,this.y,start+this.bits.length*T,T,this.frequencies);this.bits.push(c.bit);this.conf.push(c.confidence);
     events.push({type:'progress',bits:this.bits.length,total:this.bytes*8,text:textOf(this.bits)});
    }
    if(this.bits.length===this.bytes*8){
     const packet={type:'packet',text:textOf(this.bits),bits:[...this.bits],profile:this.profile,f0_hz:this.frequencies[0],f1_hz:this.frequencies[1],
      symbol_seconds:T,payload_bytes:this.bytes,preamble_matches:this.lock.matches,
      preamble_start_seconds:this.lock.start,completed_at_seconds:now,
      confidence:this.conf.reduce((a,v)=>a+v,0)/this.conf.length,
      erasures:this.bits.filter(b=>b<0).length,
      packet_duration_seconds:(PREAMBLE.length+this.bits.length)*T,
      raw_bit_rate_bps:1/T};
     this.packets.push(packet);events.push(packet);this.scan=start+this.bits.length*T;this.lock=null;
    }
   }
   // Keep only history required for preamble search or the in-flight packet.
   const cutoff=this.lock?this.lock.start:Math.max(0,this.scan-.1);
   const trim=lowerBound(this.t,cutoff);if(trim>0){this.t.splice(0,trim);this.y.splice(0,trim);}
   return events;
  }
 }
 const api={PREAMBLE,REFINEMENT_SYMBOLS,classify,textOf,LiveDecoder};root.BFSK=api;
 if(typeof module!=='undefined')module.exports=api;
})(globalThis);
