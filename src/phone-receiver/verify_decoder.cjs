const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {LiveDecoder,PREAMBLE}=require('./dist/decoder.js');
function run(rows,config){const d=new LiveDecoder(config);for(let i=0;i<rows.length;i++){d.push(...rows[i]);if(i%24===0)d.process();}d.process();return d.packets;}
let seed=42;function noise(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296-.5;}
function synthetic(message,T,fps=60){
 const bits=[...PREAMBLE,...[...Buffer.from(message)].flatMap(v=>v.toString(2).padStart(8,'0').split('').map(Number))];
 const start=4.173,rows=[];
 for(let t=0;t<start+bits.length*T+3;t+=1/fps){
  const index=Math.floor((t-start)/T);let y=180;
  if(index>=0&&index<bits.length){const f=bits[index]?10:4;y=160+20*Math.cos(2*Math.PI*f*(t-start-index*T));}
  rows.push([t,y+.5*noise()+.3*Math.sin(t)]);
 }
 return rows;
}
const report=[];
for(const [message,T,fps] of [['WORLD',.5,60],['WATER',.5,30],['LIGHT',.4,60],['CMU42',.25,60]]){
 const packets=run(synthetic(message,T,fps),{symbol:T,bytes:message.length});
 assert.equal(packets.length,1,`${message}: expected one packet`);
 assert.equal(packets[0].text,message,`${message}: wrong decoded text`);
 report.push({case:'synthetic',expected:message,T,fps,received:packets[0].text});
}
const csv=path.join(__dirname,'../../results/part3/pilots/01_offline/brightness.csv');
const real=fs.readFileSync(csv,'utf8').trim().split('\n').slice(1).map(s=>s.split(',').map(Number));
const packets=run(real,{symbol:.5,bytes:5});assert.equal(packets.length,1);assert.equal(packets[0].text,'HELLO');
report.push({case:'real recorded signal, replayed incrementally',received:packets[0].text,packet:packets[0]});
const short=synthetic('WORLD',.5).filter(([t])=>t<30);assert.equal(run(short,{symbol:.5,bytes:5}).length,0);
const flat=Array.from({length:60*60},(_,i)=>[i/60,150+noise()*.01]);assert.equal(run(flat,{symbol:.5,bytes:5}).length,0);
const out=path.join(__dirname,'../../results/software_checks');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'decoder_verification.json'),JSON.stringify({note:'Software checks, not a live iPhone validation.',report,truncated_packet_rejected:true,flat_signal_rejected:true},null,2));
console.log('PASS: 4 unseen synthetic messages, incrementally replayed real HELLO, truncated and flat signal checks.');
