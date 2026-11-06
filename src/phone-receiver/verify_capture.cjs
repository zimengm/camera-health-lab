/* Exercise the actual app's camera path with synthetic frame events. No camera permissions used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {LiveDecoder,PREAMBLE}=require('./dist/decoder.js');
async function test({fallback=false,throwFrame=false,profile='legacy',symbol=.5}){
 let now=0,nextFrame=null,nextRAF=null,pixel=180,frameIndex=0,download=null;
 const elements={};
 function element(id){return elements[id]??=(
  {value:id==='bytes'?'5':id==='symbol'?String(symbol):id==='profile'?profile:'',textContent:'',disabled:false,
   classList:{toggle(){}},style:{},click(){},removeAttribute(){}});}
 const video=element('video');
 Object.assign(video,{videoWidth:1280,videoHeight:720,currentTime:0,srcObject:null,
  play:async()=>{},pause(){},load(){},requestVideoFrameCallback(cb){nextFrame=cb;return 1;},cancelVideoFrameCallback(){nextFrame=null;}});
 const context={drawImage(){},getImageData(){
  if(throwFrame&&frameIndex===100)throw Error('Transient canvas frame not ready');
  const p=new Uint8ClampedArray(64*64*4);for(let i=0;i<p.length;i+=4){p[i]=p[i+1]=p[i+2]=Math.round(pixel);p[i+3]=255;}return {data:p};
 }};
 element('canvas').getContext=()=>context;
 class FakeWorker{
  terminate(){}
  postMessage(data){
   if(data.type==='reset')this.decoder=new LiveDecoder(data.config);
   if(data.type==='samples'){for(const row of data.samples)this.decoder.push(...row);for(const event of this.decoder.process())this.onmessage({data:event});}
  }
 }
 class FakeBlob{constructor(parts){this.parts=parts;}}
 const sandbox={document:{getElementById:element,querySelector:()=>({style:{}}),addEventListener(){},createElement:()=>element('download')},
  window:{isSecureContext:true,addEventListener(){}},navigator:{mediaDevices:{getUserMedia:async()=>({getVideoTracks:()=>[{getSettings:()=>({frameRate:60}),readyState:'live'}],getTracks:()=>[{stop(){}}]})}},
  performance:{now:()=>now},Worker:FakeWorker,Blob:FakeBlob,URL:{createObjectURL(blob){download=blob;return 'blob:test';},revokeObjectURL(){}},
  setTimeout:()=>1,setInterval:()=>1,clearInterval(){},requestAnimationFrame(cb){nextRAF=cb;return 2;},cancelAnimationFrame(){nextRAF=null;},Uint8ClampedArray,console};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(__dirname+'/dist/app.js','utf8'),sandbox);
 await element('start').onclick();
 const word='WORLD',T=symbol,start=4.173,frequencies=profile==='rate-coupled'?[2/T,3/T]:[4,10];
 const bits=[...PREAMBLE,...[...Buffer.from(word)].flatMap(v=>v.toString(2).padStart(8,'0').split('').map(Number))];
 for(let t=0;t<40;t+=1/60){
  frameIndex++;now=t*1000;const i=Math.floor((t-start)/T);pixel=i<0||i>=bits.length?180:160+20*Math.cos(2*Math.PI*frequencies[bits[i]]*(t-start-i*T));
  if(fallback){const cb=nextRAF;nextRAF=null;cb?.(now);}
  else{const cb=nextFrame;nextFrame=null;cb?.(now,{mediaTime:0});}
 }
 element('save').onclick();const result=JSON.parse(download.parts.join(''));
 assert.ok(result.samples.length>2300,'Capture must not stop at the first zero-mediaTime frame');
 assert.equal(result.packets[0]?.text,word);
 if(fallback)assert.ok(result.capture_diagnostics.raf_fallback_samples>0);
 else assert.ok(result.capture_diagnostics.repeated_media_times>2300);
 if(throwFrame)assert.equal(result.capture_diagnostics.sampling_errors.length,1);
 return {fallback,throwFrame,samples:result.samples.length,decoded:result.packets[0].text,diagnostics:result.capture_diagnostics};
}
(async()=>{
 const cases=[await test({}),await test({throwFrame:true}),await test({fallback:true}),await test({profile:'rate-coupled',symbol:.125})];
 fs.mkdirSync(__dirname+'/../../results/software_checks',{recursive:true});
 fs.writeFileSync(__dirname+'/../../results/software_checks/capture_v2_verification.json',JSON.stringify({scope:'Mock camera callbacks exercise actual app; live iPhone remains unverified.',cases},null,2));
 console.log('PASS: zero mediaTime, canvas error, fallback, and 8 bit/s refinement capture/decode through the actual app.');
})().catch(error=>{console.error(error);process.exitCode=1;});
