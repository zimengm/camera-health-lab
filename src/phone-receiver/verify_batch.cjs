const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const protocol=JSON.parse(fs.readFileSync(__dirname+'/../part3/protocol.json','utf8'));
const doc={getElementById:()=>({}),addEventListener(){}};
const context=vm.createContext({document:doc,fetch:()=>new Promise(()=>{}),inputProtocol:protocol});
vm.runInContext(fs.readFileSync(__dirname+'/../part3/batch.js','utf8'),context);
const plans=vm.runInContext('protocol=inputProtocol; [20,40,80,120].map(makePlan)',context);
assert.equal(new Set(plans.flat().map(c=>c.id)).size,24);
const report=[];
for(const plan of plans){
 const events=[];
 const sandbox={postMessage:event=>events.push(event)};
 vm.createContext(sandbox);
 sandbox.importScripts=()=>vm.runInContext(fs.readFileSync(__dirname+'/dist/decoder.js','utf8'),sandbox);
 vm.runInContext(fs.readFileSync(__dirname+'/dist/worker.js','utf8'),sandbox);
 sandbox.onmessage({data:{type:'reset',config:{symbol:'auto',bytes:5}}});
 let buffer=[];
 for(let i=0;i<Math.ceil((plan.at(-1).end+3)*60);i++){
  const t=i/60,c=plan.find(c=>t>=c.modulation_start&&t<c.modulation_end);let y=180;
  if(c){const local=t-c.modulation_start,j=Math.floor(local/c.symbol),amp=c.delta*40;y=180-amp+amp*Math.cos(2*Math.PI*(c.bits[j]?10:4)*(local-j*c.symbol));}
  buffer.push([t,y+.15*Math.sin(i*1.71)]);
  if(buffer.length===24){sandbox.onmessage({data:{type:'samples',samples:buffer}});buffer=[];}
 }
 sandbox.onmessage({data:{type:'samples',samples:buffer}});
 const packets=events.filter(e=>e.type==='packet');
 assert.equal(packets.length,6,'Exactly six packets should be detected across automatic rates');
 assert.deepEqual(packets.map(p=>p.text),Array.from(plan,c=>c.message));
 report.push({distance:plan[0].distance_cm,received:packets.map(p=>p.text),seconds:plan.at(-1).end});
}
fs.mkdirSync(__dirname+'/../../results/software_checks',{recursive:true});
fs.writeFileSync(__dirname+'/../../results/software_checks/batch_verification.json',JSON.stringify({scope:'Synthetic software batch; physical conditions still require user measurement.',report},null,2));
console.log('PASS: actual batch planner + auto-rate worker recover all 24 unique trial IDs across 4 simulated distance sessions.');
