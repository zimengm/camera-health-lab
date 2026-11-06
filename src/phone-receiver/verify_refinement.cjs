/* Exercise the actual rate-coupled planner and auto worker, including display sampling. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makePlan,alphaAt}=require('../part3/refine_plan.js');
const {classify}=require('./dist/decoder.js');
const all=[20,40,80,120].flatMap(d=>[1,2,3].flatMap(r=>makePlan(d,r)));
assert.equal(new Set(all.map(t=>t.id)).size,96);
for(const t of all){
 assert.equal(t.bits.length,64);assert.equal(t.f0_hz*t.symbol,2);assert.equal(t.f1_hz*t.symbol,3);
 assert.ok(t.f1_hz<30);
 for(let x=t.modulation_start;x<t.modulation_end;x+=.011){const {alpha}=alphaAt(t,x);assert.ok(alpha>=1-t.delta-1e-12&&alpha<=1+1e-12);}
}
const events=[],sandbox={postMessage:e=>events.push(e)};vm.createContext(sandbox);
sandbox.importScripts=()=>vm.runInContext(fs.readFileSync(__dirname+'/dist/decoder.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync(__dirname+'/dist/worker.js','utf8'),sandbox);
sandbox.onmessage({data:{type:'reset',config:{symbol:'auto',bytes:5,profile:'rate-coupled'}}});
const plan=makePlan(20,1);let buffer=[],seen=0;
for(let i=0;i<Math.ceil((plan.at(-1).end+1)*59.4);i++){
 const t=i/59.4+.0007*Math.sin(i*1.77);
 // A 60 Hz display holds each requested opacity until its next refresh;
 // camera exposure averages 6 instants over 8 ms, rather than sampling an ideal sinusoid.
 let a=0;
 for(let k=0;k<6;k++){
  const display=Math.floor(Math.max(0,t-.008*k/5)*60)/60;
  const trial=plan.find(c=>display>=c.start&&display<c.end);
  a+=trial?alphaAt(trial,display).alpha:1;
 }
 const y=180*a/6+.08*Math.sin(i*2.17)+.2*Math.sin(t*.4);buffer.push([t,y]);
 if(buffer.length===24){
  sandbox.onmessage({data:{type:'samples',samples:buffer}});buffer=[];
  const count=events.filter(e=>e.type==='packet').length;
  if(count>seen){console.log('Decoded packets:',count);seen=count;}
 }
}
sandbox.onmessage({data:{type:'samples',samples:buffer}});
const packets=events.filter(e=>e.type==='packet');
assert.equal(packets.length,8,'One delivered packet per condition; reject false rate locks');
assert.deepEqual(packets.map(p=>p.text),plan.map(t=>t.message));
assert.ok(packets.every(p=>p.profile==='rate-coupled'&&p.erasures===0));
// 30 Hz sampling cannot support the 24 Hz carrier, even when a sinusoidal fit is possible.
const t=Array.from({length:100},(_,i)=>i/30),y=t.map(x=>100+20*Math.cos(2*Math.PI*24*x));
assert.equal(classify(t,y,.5,.5,[16,24]).bit,-1);
const out=__dirname+'/../../results/software_checks';fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/refinement_verification.json',JSON.stringify({scope:'Synthetic software verification only; not physical results or human perception.',
 display_hz:60,camera_hz:59.4,exposure_ms:8,packets:packets.map(p=>({text:p.text,symbol:p.symbol_seconds,preamble_matches:p.preamble_matches})),
 unique_trial_ids:96,undersampled_signal_rejected:true},null,2));
console.log('PASS: 8 rate-coupled packets across both alpha differences; 60 Hz display hold + 59.4 Hz jittered camera/exposure; 96 unique IDs; undersampling rejected.');
