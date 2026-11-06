/* Shared deterministic plan: two/three carrier cycles per bit, not legacy 4/10 Hz. */
(function(root){
 'use strict';
 const PREAMBLE='110100111010000101101100';
 function makePlan(distance=20,repeat=1){
  if(![20,40,80,120].includes(distance)||![1,2,3].includes(repeat))throw Error('Invalid distance or repeat');
  let seed=20261105+distance*31+repeat;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const conditions=[2,4,6,8].flatMap(rate=>[.1,.5].map(delta=>({rate,delta})));
  for(let i=conditions.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[conditions[i],conditions[j]]=[conditions[j],conditions[i]];}
  let at=0;
  return conditions.map(({rate,delta},i)=>{
   const message='V'+String([20,40,80,120].indexOf(distance)*24+(repeat-1)*8+i+1).padStart(4,'0');
   const symbol=1/rate,bits=[...PREAMBLE,...[...message].flatMap(c=>c.charCodeAt(0).toString(2).padStart(8,'0').split(''))].map(Number);
   const start=at,modulation_start=start+3,modulation_end=modulation_start+bits.length*symbol,end=modulation_end+3;
   at=end;
   return {id:message,message,distance_cm:distance,repeat,profile:'rate-coupled',delta,symbol,raw_bit_rate_bps:rate,
    f0_hz:2*rate,f1_hz:3*rate,start,modulation_start,modulation_end,end,bits};
  });
 }
 function alphaAt(trial,t){
  if(t<trial.modulation_start||t>=trial.modulation_end)return {alpha:1,bit_index:-1};
  const local=t-trial.modulation_start,bit_index=Math.floor(local/trial.symbol);
  const phase=local-bit_index*trial.symbol,f=trial.bits[bit_index]?trial.f1_hz:trial.f0_hz;
  return {alpha:1-trial.delta/2+trial.delta/2*Math.cos(2*Math.PI*f*phase),bit_index};
 }
 const api={PREAMBLE,makePlan,alphaAt};root.Refinement=api;
 if(typeof module!=='undefined')module.exports=api;
})(globalThis);
