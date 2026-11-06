'use strict';
const $=id=>document.getElementById(id);
let plan=[],log=null,active=false,current=-1,raf=null;
const names={none:'看不出',slight:'轻微',clear:'明显',unobserved:'没观察'};
function render(){
 plan=Refinement.makePlan(Number($('distance').value),Number($('repeat').value));
 $('duration').textContent=`8 个条件，约 ${Math.ceil(plan.at(-1).end)} 秒。每轮顺序固定随机，发送时隐藏参数；停止后再显示结果表。`;
 $('observations').replaceChildren();
 plan.forEach((c,i)=>{
  const row=document.createElement('label');row.className='observation';
  const label=document.createElement('span');label.textContent=`第 ${i+1} 段`;
  const select=document.createElement('select');select.dataset.index=i;
  for(const [value,text]of [['','请选择'],...Object.entries(names)]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  select.onchange=()=>{if(log)log.trials[i].flicker_observation=select.value||null;};row.append(label,select);$('observations').append(row);
 });
}
function observe(value){
 if(!active||current<0)return;
 log.trials[current].flicker_observation=value;
 const select=$('observations').querySelector(`[data-index="${current}"]`);select.value=value;
 $('notice').textContent=`第 ${current+1} 段：${names[value]}`;
}
document.addEventListener('keydown',e=>{if(active&&['0','1','2'].includes(e.key))observe({0:'none',1:'slight',2:'clear'}[e.key]);if(active&&e.key==='Escape')finish(true);});
async function finish(aborted){
 if(!active)return;
 active=false;cancelAnimationFrame(raf);$('picture').style.opacity='1';$('overlay').hidden=true;
 log.aborted=aborted;log.ended_at=new Date().toISOString();
 for(const trial of log.trials){
  trial.complete=trial.frames.some(f=>f.t>=trial.modulation_end);
  const times=trial.frames.filter(f=>f.bit_index>=0).map(f=>f.t);
  trial.active_average_fps=times.length>1?(times.length-1)/(times.at(-1)-times[0]):0;
  trial.active_max_frame_gap_seconds=times.length>1?Math.max(...times.slice(1).map((v,i)=>v-times[i])):null;
 }
 for(const id of ['start','distance','repeat','observer','lighting'])$(id).disabled=false;
 $('stop').disabled=true;$('save').disabled=false;
 const rows=$('observations').querySelectorAll('label');
 rows.forEach((row,i)=>{const c=plan[i];row.querySelector('span').textContent=`第 ${i+1} 段 · Δα ${c.delta} · ${c.raw_bit_rate_bps} bit/s · ${c.f0_hz}/${c.f1_hz} Hz`;});
 $('status').textContent=aborted?'已中断，请保存日志；未完成的条件不算有效测量。':'完成。手机先停止并保存；再保存电脑日志。没有观察的项目请选「没观察」。';
 if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}
}
$('start').onclick=async()=>{
 const observer=Number($('observer').value),lighting=$('lighting').value.trim();
 if(!(observer>=20&&observer<=300)||!lighting){
  const field=!(observer>=20&&observer<=300)?$('observer'):$('lighting');
  const message=field===$('lighting')?'请先填写房间灯光，例如：顶灯开，窗帘关。':'请填写眼睛距屏幕的距离（20–300 cm）。';
  $('status').textContent=message;field.focus();field.setCustomValidity(message);field.reportValidity();
  field.addEventListener('input',()=>field.setCustomValidity(''),{once:true});return;
 }
 $('observer').setCustomValidity('');$('lighting').setCustomValidity('');
 render();active=true;current=-1;
 for(const id of ['start','distance','repeat','observer','lighting'])$(id).disabled=true;
 $('stop').disabled=false;$('save').disabled=true;
 log={schema_version:2,type:'refinement_transmitter',profile:'rate-coupled',
  protocol:{preamble:Refinement.PREAMBLE,carrier_cycles_per_bit:[2,3],payload_bytes:5},
  observer:{distance_cm:observer,lighting,screen_brightness:'Held fixed throughout the run; operator-confirmed in setup'},
  distance_cm:Number($('distance').value),repeat:Number($('repeat').value),started_at:new Date().toISOString(),aborted:false,
  trials:plan.map(({bits,...c})=>({...c,flicker_observation:null,frames:[]}))};
 try{await $('stage').requestFullscreen();}catch{}
 let begin;
 function tick(now){
  if(!active)return;if(begin===undefined)begin=now;const t=(now-begin)/1000;
  if(document.hidden){finish(true);return;}
  const i=plan.findIndex(c=>t>=c.start&&t<c.end);
  if(i<0){finish(false);return;}
  if(current!==i)$('notice').textContent='请在这一段发送时按键记录观察';
  current=i;const c=plan[i],value=Refinement.alphaAt(c,t);$('picture').style.opacity=String(value.alpha);
  log.trials[i].frames.push({t,...value});$('overlay').hidden=false;
  $('label').textContent=`第 ${i+1}/8 段 · ${t<c.modulation_start?'准备':t<c.modulation_end?'观察图片':'短暂停顿'}`;
  $('countdown').textContent='0 看不出 · 1 轻微 · 2 明显（发送时记录；可重复按键修正）';
  raf=requestAnimationFrame(tick);
 }
 $('status').textContent='发送中。观察图片，保持自己和手机的位置不变。';raf=requestAnimationFrame(tick);
};
$('stop').onclick=()=>finish(true);
$('save').onclick=()=>{
 if(!log)return;
 const blob=new Blob([JSON.stringify(log)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`refinement_d${log.distance_cm}_r${log.repeat}_${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)finish(true);});
$('distance').onchange=render;$('repeat').onchange=render;render();
