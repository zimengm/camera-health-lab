'use strict';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const APP_VERSION='2026-11-05-refinement-v4';
let worker=null,stream=null,active=false,frameHandle=null,rafHandle=null,healthTimer=null,buffer=[],samples=[],packets=[],lastMedia=-1,lastFlush=0,source='',cameraSettings=null,objectURL=null,wake=null,generation=0;
let clockOrigin=null,lastCallbackAt=0,lastRawMediaTime=null,diagnostics={};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function flush(){if(buffer.length&&worker){worker.postMessage({type:'samples',samples:buffer});buffer=[];}}
function resetDecoder(){
 worker?.terminate();worker=new Worker('worker.js?v=4');
 worker.onerror=()=>status('解码程序载入失败。请刷新页面后重试。',true);
 worker.onmessage=({data})=>{
  if(data.type==='sync'){status('找到发送信号，正在接收文字…');$('message').textContent='';}
  if(data.type==='progress'){$('message').textContent=data.text||'…';$('progress').value=data.bits;status(`接收中：${data.bits} / ${data.total} 比特`);}
  if(data.type==='packet'){
   packets.push(data);$('message').textContent=data.text;
   const weak=data.confidence<.2||data.erasures>0||data.text.includes('�');
   status(weak?'收到一段数据，但信号较弱或出现乱码。请保持对准后重试。':'接收完成！可以在电脑换一个同长度的单词，再次发送。',weak);
   $('save').disabled=false;
  }
  if(data.type==='error')status('解码出错：'+data.message,true);
 };
 const bytes=Number($('bytes').value);worker.postMessage({type:'reset',config:{profile:$('profile')?.value||'legacy',symbol:$('symbol').value==='auto'?'auto':Number($('symbol').value),bytes}});
 samples=[];packets=[];buffer=[];lastMedia=-1;lastFlush=0;$('message').textContent='—';$('progress').max=bytes*8;$('progress').value=0;$('save').disabled=true;
 clockOrigin=null;lastCallbackAt=0;lastRawMediaTime=null;
 diagnostics={video_frame_callbacks:0,raf_fallback_samples:0,repeated_media_times:0,sampling_errors:[],clock:source==='camera'?'monotonic callback time':'video media time',scheduler:'waiting'};
 $('sampling').textContent=`v4 · 已采样 0 点 · 已接收 0 条 · ${source==='camera'?'等待实时画面':'等待视频'}`;
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
  $('sampling').textContent=`v4 · ${samples.length} 点 · 已接收 ${packets.length} 条 · 采样约 ${fps.toFixed(1)} 次/秒${diagnostics.raf_fallback_samples?' · 兼容采样模式（不保证每点是独立新帧）':''}${bad?' · 采样偏低':''}`;
  if(bad&&!packets.length)status('摄像头采样不足。请保持页面在前台并增加环境光。',true);
 }
 // Cap a long unattended capture, preserving data and stopping the camera.
 if(samples.length>60*60*5)stopCapture('已达到 5 分钟采样上限，接收数据已保留。');
}
function scheduleFrames(token){
 const valid=()=>active&&generation===token;
 const safelySample=(now,mediaTime,fallback=false)=>{
  if(clockOrigin===null)clockOrigin=now;
  // Safari MediaStreams may supply a constant mediaTime. Camera timing must not
  // reject every later frame merely because the media timeline stays at zero.
  const t=source==='camera'?(now-clockOrigin)/1000:mediaTime;
  try{sample(t);if(fallback)diagnostics.raf_fallback_samples++;}
  catch(error){if(diagnostics.sampling_errors.length<5)diagnostics.sampling_errors.push(error.message);status('画面采样异常：'+error.message,true);}
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
  if(samples.length<2)status('摄像头尚未连续采样，请保持此页面在前台。暂时不要在电脑发送。',true);
  if(stream?.getVideoTracks()[0]?.readyState==='ended')stopCapture('摄像头已断开，请重新打开。');
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
 if(!Number.isInteger(Number($('bytes').value))||Number($('bytes').value)<1||Number($('bytes').value)>16){status('消息字符数应为 1–16 的整数。',true);return;}
 source=kind;cameraSettings=null;resetDecoder();$('start').disabled=true;
 try{
  if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}
  video.removeAttribute('src');video.load();
  if(kind==='camera'){
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('请在 Safari 中直接打开 HTTPS 接收链接，不能使用电脑的 localhost 地址。');
   stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60,min:30}}});
   cameraSettings=stream.getVideoTracks()[0].getSettings();video.srcObject=stream;
  }else{objectURL=URL.createObjectURL(file);video.src=objectURL;}
  await Promise.race([video.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('视频未能开始播放。请在 iPhone Safari 重试；回放文件可能需要转换为兼容的视频格式。')),12000))]);
  active=true;generation++;scheduleFrames(generation);
  $('stop').disabled=false;$('symbol').disabled=true;$('bytes').disabled=true;$('file').disabled=true;if($('profile'))$('profile').disabled=true;
  $('mode').textContent=kind==='camera'?'手机实时接收':'本机视频回放';
  status(kind==='camera'?'摄像头已打开。对准图片中央，然后在电脑点击「全屏发送」。':'正在按原速回放并解码，请等待视频结束。');
  try{wake=await navigator.wakeLock?.request('screen');}catch{}
 }catch(error){await stopCapture();status(error.name==='NotAllowedError'?'摄像头权限未开启。请在 Safari 允许此网站使用摄像头后重试。':'无法开始：'+error.message,true);}
}
$('start').onclick=()=>begin('camera');$('stop').onclick=()=>stopCapture('已停止，接收数据保留。');
$('file').onchange=event=>{const file=event.target.files[0];if(file)begin('file',file);};
video.onended=()=>{flush();stopCapture('视频回放结束，正在完成最后的数据解码。');};
video.onloadedmetadata=()=>{if(video.videoWidth&&video.videoHeight)document.querySelector('.view').style.aspectRatio=`${video.videoWidth}/${video.videoHeight}`;};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stopCapture('页面离开前台，已停止摄像头。请重新开始后再发送。');});
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(track=>track.stop());worker?.terminate();});
$('save').onclick=()=>{
 const result={schema_version:4,profile:$('profile')?.value||'legacy',app_version:APP_VERSION,source,camera_settings:cameraSettings,capture_diagnostics:diagnostics,exported_at:new Date().toISOString(),symbol_seconds:$('symbol').value==='auto'?'auto':Number($('symbol').value),payload_bytes:Number($('bytes').value),packets,samples,notes:'All samples processed on-device. Camera times use a monotonic callback clock. RAF fallback is approximate and may contain duplicated frames. Expected message is not supplied to decoder. BER requires comparison with transmitted bits.'};
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));a.href=url;a.download=`receiver_${$('profile')?.value==='rate-coupled'?'refinement_':''}${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
if(!window.isSecureContext)status('摄像头需要 HTTPS 链接。此页仍可选择本机视频做回放验证。',true);

function configureProfile(){
 const refinement=$('profile').value==='rate-coupled';
 $('symbol').value='auto';
 for(const option of $('symbol').options||[])option.disabled=refinement&&option.value!=='auto';
 status(refinement?'补测模式：使用电脑 refine.html 页面，手机采样需超过 50 次/秒。':'原实验模式：使用电脑 batch.html 页面。');
}
if(window.location){
 const profile=new URLSearchParams(window.location.search).get('profile');
 if(profile==='rate-coupled'){
  $('profile').value=profile;configureProfile();
  status('补测模式：等待打开摄像头；使用电脑 refine.html 页面。');
  document.querySelector('details').open=true;
 }
}
$('profile').onchange=configureProfile;
