'use strict';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const APP_VERSION='2026-11-05-refinement-v4';
let worker=null,stream=null,active=false,frameHandle=null,rafHandle=null,healthTimer=null,buffer=[],samples=[],packets=[],lastMedia=-1,lastFlush=0,source='',cameraSettings=null,objectURL=null,wake=null,generation=0;
let clockOrigin=null,lastCallbackAt=0,lastRawMediaTime=null,diagnostics={};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function flush(){if(buffer.length&&worker){worker.postMessage({type:'samples',samples:buffer});buffer=[];}}
function resetDecoder(){
 worker?.terminate();worker=new Worker('worker.js?v=4');
 worker.onerror=()=>status('Decoder failed to load. Refresh and retry.',true);
 worker.onmessage=({data})=>{
  if(data.type==='sync'){status('Signal synchronized. Receiving text...');$('message').textContent='';}
  if(data.type==='progress'){$('message').textContent=data.text||'…';$('progress').value=data.bits;status(`Receiving: ${data.bits} / ${data.total} bits`);}
  if(data.type==='packet'){
   packets.push(data);$('message').textContent=data.text;
   const weak=data.confidence<.2||data.erasures>0||data.text.includes('�');
   status(weak?'Packet received with a weak signal or corrupted characters. Keep the camera aligned and retain the log.':'Reception complete. You can transmit another word of the same length.',weak);
   $('save').disabled=false;
  }
  if(data.type==='error')status('Decoder error: '+data.message,true);
 };
 const bytes=Number($('bytes').value);worker.postMessage({type:'reset',config:{profile:$('profile')?.value||'legacy',symbol:$('symbol').value==='auto'?'auto':Number($('symbol').value),bytes}});
 samples=[];packets=[];buffer=[];lastMedia=-1;lastFlush=0;$('message').textContent='—';$('progress').max=bytes*8;$('progress').value=0;$('save').disabled=true;
 clockOrigin=null;lastCallbackAt=0;lastRawMediaTime=null;
 diagnostics={video_frame_callbacks:0,raf_fallback_samples:0,repeated_media_times:0,sampling_errors:[],clock:source==='camera'?'monotonic callback time':'video media time',scheduler:'waiting'};
 $('sampling').textContent=`v4 · 0 samples; 0 packets; ${source==='camera'?'waiting for camera frames':'waiting for video'}`;
}
function sample(t){
 if(!Number.isFinite(t)||t<=lastMedia||!video.videoWidth)return;
 lastMedia=t;
 const w=video.videoWidth,h=video.videoHeight;
 ctx.drawImage(video,w*.35,h*.35,w*.3,h*.3,0,0,64,64);
 const pixels=ctx.getImageData(0,0,64,64).data;let sum=0;
 for(let i=0;i<pixels.length;i+=4)sum+=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
 const value=sum/(pixels.length/4);buffer.push([t,value]);samples.push([t,value]);
 if(t-lastFlush>=.4){flush();lastFlush=t;}
 if(samples.length%30===0&&samples.length>30){
  const tail=samples.slice(-120),fps=(tail.length-1)/(tail.at(-1)[0]-tail[0][0]);
  const bad=fps<=($('profile')?.value==='rate-coupled'?50:22);
  $('sampling').textContent=`v4 · ${samples.length} samples; ${packets.length} packets; approximately ${fps.toFixed(1)} samples/s${diagnostics.raf_fallback_samples?'; fallback sampling (independent frames not guaranteed)':''}${bad?'; low sampling rate':''}`;
  if(bad&&!packets.length)status('Camera sampling is low. Keep this page in the foreground and improve room lighting.',true);
 }
 // Cap a long unattended capture, preserving data and stopping the camera.
 if(samples.length>60*60*5)stopCapture('Five-minute capture limit reached. Receiver data are retained.');
}
function scheduleFrames(token){
 const valid=()=>active&&generation===token;
 const safelySample=(now,mediaTime,fallback=false)=>{
  if(clockOrigin===null)clockOrigin=now;
  // Safari MediaStreams may supply a constant mediaTime. Camera timing must not
  // reject every later frame merely because the media timeline stays at zero.
  const t=source==='camera'?(now-clockOrigin)/1000:mediaTime;
  try{sample(t);if(fallback)diagnostics.raf_fallback_samples++;}
  catch(error){if(diagnostics.sampling_errors.length<5)diagnostics.sampling_errors.push(error.message);status('Frame sampling error: '+error.message,true);}
 };
 if('requestVideoFrameCallback' in video){
  const next=(now,meta)=>{
   if(!valid())return;
   diagnostics.video_frame_callbacks++;diagnostics.scheduler='video-frame-callback';lastCallbackAt=performance.now();
   if(meta.mediaTime===lastRawMediaTime)diagnostics.repeated_media_times++;
   lastRawMediaTime=meta.mediaTime;
   // Always re-arm, including when drawImage/getImageData temporarily fails.
   safelySample(now,meta.mediaTime);
   if(valid())frameHandle=video.requestVideoFrameCallback(next);
  };
  frameHandle=video.requestVideoFrameCallback(next);
 }
 const fallback=(now)=>{
  if(!valid())return;
  // A watchdog handles browsers exposing rVFC without delivering callbacks.
  // For file playback, media time still rejects duplicate frames. Camera fallback
  // samples are explicitly marked approximate because independent-frame timing
  // cannot be established from rAF alone.
  if(!('requestVideoFrameCallback' in video)||performance.now()-lastCallbackAt>250){
   diagnostics.scheduler='raf-fallback';safelySample(now,video.currentTime,true);
  }
  if(valid())rafHandle=requestAnimationFrame(fallback);
 };
 lastCallbackAt=performance.now();rafHandle=requestAnimationFrame(fallback);
 healthTimer=setInterval(()=>{
  if(!valid())return;
  if(samples.length<2)status('Waiting for continuous camera sampling. Keep this page in the foreground before transmitting.',true);
  if(stream?.getVideoTracks()[0]?.readyState==='ended')stopCapture('Camera disconnected. Open it again.');
 },2000);
}
async function stopCapture(text){
 active=false;generation++;flush();
 if(frameHandle!==null){video.cancelVideoFrameCallback?.(frameHandle);frameHandle=null;}
 if(rafHandle!==null){cancelAnimationFrame(rafHandle);rafHandle=null;}
 if(healthTimer!==null){clearInterval(healthTimer);healthTimer=null;}
 stream?.getTracks().forEach(track=>track.stop());stream=null;video.pause();video.srcObject=null;
 if(wake){try{await wake.release();}catch{}wake=null;}
 $('start').disabled=false;$('stop').disabled=true;$('symbol').disabled=false;$('bytes').disabled=false;$('file').disabled=false;if($('profile'))$('profile').disabled=false;
 if(samples.length)$('save').disabled=false;
 if(typeof text==='string')status(text);
}
async function begin(kind,file){
 await stopCapture();
 if(!Number.isInteger(Number($('bytes').value))||Number($('bytes').value)<1||Number($('bytes').value)>16){status('Message length must be an integer from 1 to 16.',true);return;}
 source=kind;cameraSettings=null;resetDecoder();$('start').disabled=true;
 try{
  if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}
  video.removeAttribute('src');video.load();
  if(kind==='camera'){
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Open the hosted HTTPS receiver directly in iPhone Safari; the computer localhost address does not work on the phone.');
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60,min:30}}});
   cameraSettings=stream.getVideoTracks()[0].getSettings();video.srcObject=stream;
  }else{objectURL=URL.createObjectURL(file);video.src=objectURL;}
  await Promise.race([video.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Video playback did not start. Retry in iPhone Safari; local files may require conversion to a compatible format.')),12000))]);
  active=true;generation++;scheduleFrames(generation);
  $('stop').disabled=false;$('symbol').disabled=true;$('bytes').disabled=true;$('file').disabled=true;if($('profile'))$('profile').disabled=true;
  $('mode').textContent=kind==='camera'?'Live phone reception':'Local video playback';
  status(kind==='camera'?'Camera started. Aim at the image center and start transmission on the computer.':'Playing and decoding at original speed. Wait for the video to finish.');
  try{wake=await navigator.wakeLock?.request('screen');}catch{}
 }catch(error){await stopCapture();status(error.name==='NotAllowedError'?'Camera permission denied. Allow camera access in Safari and retry.':'Unable to start: '+error.message,true);}
}
$('start').onclick=()=>begin('camera');$('stop').onclick=()=>stopCapture('Stopped. Receiver data are retained.');
$('file').onchange=event=>{const file=event.target.files[0];if(file)begin('file',file);};
video.onended=()=>{flush();stopCapture('Video ended. Completing the remaining decoding.');};
video.onloadedmetadata=()=>{if(video.videoWidth&&video.videoHeight)document.querySelector('.view').style.aspectRatio=`${video.videoWidth}/${video.videoHeight}`;};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stopCapture('Page left the foreground. Camera stopped; restart capture before transmitting.');});
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(track=>track.stop());worker?.terminate();});
$('save').onclick=()=>{
 const result={schema_version:4,profile:$('profile')?.value||'legacy',app_version:APP_VERSION,source,camera_settings:cameraSettings,capture_diagnostics:diagnostics,exported_at:new Date().toISOString(),symbol_seconds:$('symbol').value==='auto'?'auto':Number($('symbol').value),payload_bytes:Number($('bytes').value),packets,samples,notes:'All samples processed on-device. Camera times use a monotonic callback clock. RAF fallback is approximate and may contain duplicated frames. Expected message is not supplied to decoder. BER requires comparison with transmitted bits.'};
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));a.href=url;a.download=`receiver_${$('profile')?.value==='rate-coupled'?'refinement_':''}${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
if(!window.isSecureContext)status('Camera access requires HTTPS. Local video playback validation is still available.',true);

function configureProfile(){
 const refinement=$('profile').value==='rate-coupled';
 $('symbol').value='auto';
 for(const option of $('symbol').options||[])option.disabled=refinement&&option.value!=='auto';
 status(refinement?'Supplement profile: use refine.html on the computer; phone sampling must exceed 50 samples/s.':'Original profile: use batch.html on the computer.');
}
if(window.location){
 const profile=new URLSearchParams(window.location.search).get('profile');
 if(profile==='rate-coupled'){
  $('profile').value=profile;configureProfile();
  status('Supplement profile: open the camera and use refine.html on the computer.');
  document.querySelector('details').open=true;
 }
}
$('profile').onchange=configureProfile;
