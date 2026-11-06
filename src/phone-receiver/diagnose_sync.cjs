/* Post-hoc preamble-only diagnosis. Never replaces recorded live delivery results. */
const fs=require('node:fs'),path=require('node:path');
const {classify,PREAMBLE,textOf}=require('./dist/decoder.js');
const [receiverPath,senderPath,resultPath,id]=process.argv.slice(2);
if(!id)throw Error('Usage: node diagnose_sync.cjs receiver.json transmitter.json results.json TRIAL_ID');
const rx=JSON.parse(fs.readFileSync(receiverPath)),tx=JSON.parse(fs.readFileSync(senderPath));
const result=JSON.parse(fs.readFileSync(resultPath)),trial=tx.trials.find(t=>t.id===id);
if(!trial||!Number.isFinite(result.clock_offset_seconds))throw Error('Trial or independent clock alignment missing');
const times=rx.samples.map(x=>x[0]),values=rx.samples.map(x=>x[1]),T=trial.symbol,frequencies=[trial.f0_hz,trial.f1_hz];
let best=null;
for(let start=trial.modulation_start+result.clock_offset_seconds-.3;start<trial.modulation_start+result.clock_offset_seconds+.3;start+=1/600){
 const codes=PREAMBLE.map((_,i)=>classify(times,values,start+i*T,T,frequencies));
 const matches=codes.filter((x,i)=>x.bit===PREAMBLE[i]).length;
 const score=codes.reduce((s,x,i)=>s+(x.bit===PREAMBLE[i]?1:-1)*x.confidence,0)/24;
 if(!best||matches>best.matches||matches===best.matches&&score>best.score)best={start,matches,score};
}
const bits=Array.from({length:40},(_,i)=>classify(times,values,best.start+(24+i)*T,T,frequencies).bit);
const out={scope:'POST-HOC OFFLINE DIAGNOSTIC. Does not replace the recorded live missing-packet result.',trial_id:id,
 search:'Preamble only, within 0.3 s of an offset established by other live packets; fine 1/600 s alignment grid.',
 best_preamble_matches:best.matches,mean_signed_preamble_confidence:best.score,offline_payload:textOf(bits),
 live_required_matches:23,live_start_grid_seconds:1/60};
fs.writeFileSync(path.join(path.dirname(resultPath),'offline_diagnostic.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
