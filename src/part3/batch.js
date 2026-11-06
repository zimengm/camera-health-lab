'use strict';
const $=id=>document.getElementById(id);
let protocol,plan=[],log=null,active=false,current=-1,raf=null;
function makePlan(distance){
 const cases=[];let at=0;
 for(const symbol of [.5,.4,.25])for(const delta of [.5,.1]){
  const index=[20,40,80,120].indexOf(distance)*6+cases.length+1;
  const message='T'+String(index).padStart(4,'0');
  const bits=[...protocol.preamble].map(Number).concat([...message].flatMap(c=>c.charCodeAt(0).toString(2).padStart(8,'0').split('').map(Number)));
  const end=at+3+bits.length*symbol+3;
  cases.push({id:message,message,distance_cm:distance,delta,symbol,start:at,payload_start:at+3+protocol.preamble.length*symbol,modulation_start:at+3,modulation_end:end-3,end,bits});at=end+3;
 }
 return cases;
}
function render(){
 if(!protocol)return;plan=makePlan(Number($('distance').value));
 $('duration').textContent=`Six transmissions per distance, approximately ${Math.ceil(plan.at(-1).end)} seconds. Save the transmitter log before changing distance.`;
 $('observations').replaceChildren();
 for(const c of plan){
  const row=document.createElement('label');row.className='observation';
  const text=document.createElement('span');text.textContent=`${c.id} · Δα ${c.delta} · ${1/c.symbol} bit/s`;
  const select=document.createElement('select');select.dataset.id=c.id;
  for(const [v,t]of [['','Select an observation'],['none','Not visible'],['slight','Slightly visible'],['clear','Clearly visible'],['unobserved','Not observed']]){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);}
  select.onchange=()=>{if(log){const trial=log.trials.find(t=>t.id===c.id);if(trial)trial.flicker_observation=select.value||null;}};
  row.append(text,select);$('observations').append(row);
 }
}
function observe(value){if(!active||current<0)return;const c=plan[current];log.trials[current].flicker_observation=value;const select=$('observations').querySelector(`[data-id="${c.id}"]`);if(select)select.value=value;$('notice').textContent=`${c.id} recorded: ${{none:'Not visible',slight:'Slightly visible',clear:'Clearly visible'}[value]}`;}
document.addEventListener('keydown',event=>{if(active&&['0','1','2'].includes(event.key))observe({0:'none',1:'slight',2:'clear'}[event.key]);});
async function finish(aborted){
 active=false;cancelAnimationFrame(raf);$('picture').style.opacity='1';$('overlay').hidden=true;
 log.aborted=aborted;log.ended_at=new Date().toISOString();
 for(const trial of log.trials){
  const times=trial.frames.filter(f=>f.bit_index>=0).map(f=>f.t),gaps=times.slice(1).map((v,i)=>v-times[i]);
  trial.complete=trial.frames.length>0&&trial.frames.at(-1).t>=trial.end;
  trial.active_average_fps=times.length>1?(times.length-1)/(times.at(-1)-times[0]):0;
  trial.active_max_frame_gap_seconds=gaps.length?Math.max(...gaps):null;
 }
 $('start').disabled=false;$('distance').disabled=false;$('save').disabled=false;
 $('status').textContent=aborted?'Interrupted. Save the log; this run is incomplete.':'All six transmissions finished. Stop and save the phone capture, complete the observations, and save the transmitter log.';
 if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}
}
$('start').onclick=async()=>{
 if(active||!protocol)return;render();active=true;current=-1;$('start').disabled=true;$('distance').disabled=true;$('save').disabled=true;
 log={schema_version:1,type:'batch_transmitter',protocol,started_at:new Date().toISOString(),distance_cm:Number($('distance').value),aborted:false,trials:plan.map(({bits,...c})=>({...c,flicker_observation:null,frames:[]}))};
 try{await $('stage').requestFullscreen();}catch{}
 let begin;
 function tick(now){
  if(!active)return;if(begin===undefined)begin=now;const t=(now-begin)/1000;
  if(document.hidden){finish(true);return;}
  const i=plan.findIndex(c=>t>=c.start&&t<c.end+3);
  if(i<0){finish(false);return;}
  current=i;const c=plan[i],trial=log.trials[i];let alpha=1,bit_index=-1;
  if(t>=c.modulation_start&&t<c.modulation_end){
   const local=t-c.modulation_start;bit_index=Math.floor(local/c.symbol);
   alpha=1-c.delta/2+c.delta/2*Math.cos(2*Math.PI*(c.bits[bit_index]?10:4)*(local-bit_index*c.symbol));
  }
  $('picture').style.opacity=String(alpha);trial.frames.push({t,alpha,bit_index});
  const phase=t<c.modulation_start?'Ready':t<c.modulation_end?'Transmitting':'Gap';
  $('overlay').hidden=false;$('label').textContent=`${i+1}/6 · ${phase} · ${c.id} · Δα ${c.delta} · ${1/c.symbol} bit/s`;
  $('countdown').textContent=`Remaining ${Math.ceil(plan.at(-1).end-t)} seconds. Press 0: not visible / 1: slightly visible / 2: clearly visible`;
  if(t>=plan.at(-1).end){finish(false);return;}raf=requestAnimationFrame(tick);
 }
 $('status').textContent='Batch transmission in progress. Keep the phone fixed; press 0/1/2 to record visibility.';raf=requestAnimationFrame(tick);
};
$('save').onclick=()=>{if(!log)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(log)],{type:'application/json'}));a.href=url;a.download=`batch_d${log.distance_cm}_${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
fetch('protocol.json').then(r=>r.json()).then(p=>{protocol=p;render();$('start').disabled=false;$('status').textContent='Ready. Confirm that the phone sample count is increasing before starting.';}).catch(e=>{$('status').textContent='Protocol loading failed: '+e.message;});
$('distance').onchange=render;
