import {barcodeValue} from './lookup.mjs';
import {readCameraSettings,resolutionConstraints,focusConstraints,focusLabels,waitForVideoSize} from './camera-settings.mjs';

export function cameraError(error){
 const name=error?.name;
 if(name==='NotAllowedError'||name==='SecurityError')return '카메라 접근이 차단되었습니다. Edge의 이 사이트 카메라 권한과 Windows 설정 → 개인정보 및 보안 → 카메라를 확인하세요. 회사 정책으로 잠겨 있으면 IT 담당자의 확인이 필요합니다.';
 if(name==='NotFoundError'||name==='DevicesNotFoundError')return '사용 가능한 카메라를 찾지 못했습니다. 웹캠 연결과 장치 활성화 상태를 확인하세요.';
 if(name==='NotReadableError'||name==='TrackStartError')return '카메라를 시작하지 못했습니다. Teams·Zoom 등 카메라를 사용 중인 앱을 닫고 다시 시도하세요.';
 if(name==='OverconstrainedError')return '선택한 카메라를 사용할 수 없습니다. 기본 카메라로 다시 시도하세요.';
 return error?.message||'카메라를 시작하지 못했습니다. 권한과 장치 연결을 확인하세요.';
}

let decoderPromise;
function loadDecoder(){
 if(globalThis.ZXingBrowser?.BrowserMultiFormatReader)return Promise.resolve(globalThis.ZXingBrowser);
 if(!decoderPromise)decoderPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=new URL('./zxing-browser.min.js',import.meta.url).href;
  const timeout=setTimeout(()=>{script.remove();reject(Error('바코드 인식 모듈을 불러오지 못했습니다. zxing-browser.min.js 파일이 함께 배포됐는지 확인하세요.'));},15000);
  script.onload=()=>{clearTimeout(timeout);if(globalThis.ZXingBrowser?.BrowserMultiFormatReader)resolve(globalThis.ZXingBrowser);else reject(Error('바코드 인식 모듈이 올바르지 않습니다. 배포 파일을 확인하세요.'));};
  script.onerror=()=>{clearTimeout(timeout);script.remove();reject(Error('바코드 인식 모듈 파일이 없습니다. zxing-browser.min.js를 함께 업로드하세요.'));};document.head.append(script);
 }).catch(error=>{decoderPromise=null;throw error;});
 return decoderPromise;
}

// 카메라 획득·초점·해상도·해제를 한 곳에서 관리합니다.
export class CameraScanner{
 constructor({video,mediaDevices,load=loadDecoder,onStatus=()=>{},onRead=()=>{}}){Object.assign(this,{video,mediaDevices,load,onStatus,onRead});this.run=0;this.stream=null;this.controls=null;this.reader=null;this.videoConstraints={};this.resolutionMode='auto';this.focusRequested='';this.focusWarning='';}
 get track(){return this.stream?.getVideoTracks()[0];}
 state(){return {...readCameraSettings(this.track,this.video),resolutionMode:this.resolutionMode,focusRequested:this.focusRequested,focusWarning:this.focusWarning};}
 stop(){this.run++;try{this.controls?.stop();}finally{this.controls=null;this.reader=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;}}
 _decode(run){
  if(run!==this.run||!this.reader||!this.stream)return;
  this.controls=this.reader.scan(this.video,(result,_error,activeControls)=>{
   if(run!==this.run||!result)return;let code;try{code=barcodeValue(result.getText());}catch{return;}
   activeControls?.stop();this.stop();this.onRead(code);
  });
  if(run!==this.run){this.controls?.stop();this.controls=null;}
 }
 async _apply(changes,rebuild=false){
  const run=this.run,track=this.track;if(!track||typeof track.applyConstraints!=='function')throw Error('이 카메라·브라우저에서는 설정 변경을 지원하지 않습니다.');
  let previous=this.videoConstraints;try{previous=track.getConstraints?.()||previous;}catch{}
  const constraints={...previous,...changes};if(rebuild){this.controls?.stop();this.controls=null;}
  try{
   await track.applyConstraints(constraints);if(run!==this.run)return false;
   this.videoConstraints=constraints;
   if(rebuild){const s=this.state();await waitForVideoSize(this.video,s.width,s.height);if(run!==this.run)return false;this._decode(run);}
   return run===this.run;
  }catch(error){if(rebuild&&run===this.run)this._decode(run);throw error;}
 }
 async setFocus(mode,distance){const constraints=focusConstraints(mode,distance,this.state());if(await this._apply(constraints)){this.focusRequested=mode;this.focusWarning='';return true;}return false;}
 async setResolution(value){const changes=resolutionConstraints(value),state=this.state();if(state.capabilities.resizeMode?.includes('none'))changes.resizeMode='none';if(await this._apply(changes,true)){this.resolutionMode=value;return true;}return false;}
 async start(deviceId=''){
  this.stop();const run=this.run;this.resolutionMode='auto';this.focusRequested='';this.focusWarning='';this.onStatus('카메라 접근을 요청합니다. 권한 창이 뜨면 허용 여부를 선택하세요.');
  try{
   if(!this.mediaDevices?.getUserMedia)throw Error('카메라 기능을 사용할 수 없습니다. HTTPS 배포 주소에서 Edge를 열어 주세요.');
   this.videoConstraints={...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}}),...resolutionConstraints('auto')};
   const media=await this.mediaDevices.getUserMedia({audio:false,video:this.videoConstraints});
   if(run!==this.run){media.getTracks().forEach(t=>t.stop());return;}
   this.stream=media;this.video.srcObject=media;await this.video.play();if(run!==this.run)return;
   const modes=this.state().focusModes,automatic=modes.includes('continuous')?'continuous':modes.includes('single-shot')?'single-shot':'';
   if(automatic){try{await this.setFocus(automatic);}catch{this.focusWarning='자동초점 요청을 적용하지 못했습니다. 카메라 기본 설정으로 인식합니다.';}}
   if(run!==this.run)return;
   this.onStatus('카메라가 열렸습니다. 바코드 인식을 준비하고 있습니다.');
   const decoder=await this.load();if(run!==this.run)return;
   // 3 = 이 배포본 ZXing의 DecodeHintType.TRY_HARDER. 회전 및 더 많은 주사선을 시도합니다.
   this.reader=new decoder.BrowserMultiFormatReader(new Map([[3,true]]),{delayBetweenScanAttempts:350,delayBetweenScanSuccess:1000});
   if(decoder.BarcodeFormat)this.reader.possibleFormats=['EAN_13','EAN_8','UPC_A','UPC_E','ITF','CODE_128'].map(k=>decoder.BarcodeFormat[k]).filter(Number.isInteger);
   // 공개 scan API는 프레임만 처리합니다. 스트림 수명은 CameraScanner가 소유합니다.
   this._decode(run);if(run!==this.run)return;
   this.onStatus('제품의 숫자 바코드를 비춰 주세요. 흐리면 초점과 해상도를 조절하세요.');
  }catch(error){if(run!==this.run)return;this.stop();this.onStatus(cameraError(error));}
 }
}

export function initCameraScanner({onRead,onStatus,mediaDevices=navigator.mediaDevices,load=loadDecoder}){
 const byId=id=>document.getElementById(id);
 const dialog=byId('camera-dialog'),video=byId('camera'),message=byId('camera-status'),picker=byId('camera-device'),pickerLabel=byId('camera-device-label'),settings=byId('camera-settings'),resolution=byId('camera-resolution'),focus=byId('camera-focus-mode'),distance=byId('camera-focus-distance'),distanceBox=byId('camera-manual-focus'),settingStatus=byId('camera-settings-status');
 let busy=false;
 const scanner=new CameraScanner({video,mediaDevices,load,onStatus:text=>{message.textContent=text;},onRead:code=>{dialog.close();onStatus('바코드를 읽었습니다. 제품정보를 조회합니다.');onRead(code);}});
 const format=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:4}).format(n);
 function draw(){
  const s=scanner.state(),ready=!!scanner.stream;settings.hidden=!ready;resolution.disabled=busy||!s.canConfigure;focus.disabled=busy||!s.canConfigure||!s.focusModes.length;picker.disabled=busy;
  resolution.replaceChildren(new Option('자동 · 고해상도 우선','auto'));for(const [key,w,h]of s.presets)resolution.append(new Option(w+' × '+h+' 요청',key));resolution.value=s.resolutionMode;if(!resolution.value)resolution.value='auto';
  byId('camera-actual-resolution').textContent=s.width&&s.height?'현재 실제 영상: '+s.width+' × '+s.height:'현재 영상 해상도를 확인할 수 없습니다.';
  focus.replaceChildren();for(const mode of s.focusModes)focus.append(new Option(focusLabels[mode],mode));
  const active=s.settings.focusMode||s.focusRequested;
  if(!s.focusModes.length){focus.append(new Option('초점 제어 미지원',''));byId('camera-focus-support').textContent='고정초점이거나 브라우저가 초점 조절 정보를 제공하지 않습니다. 거리와 조명을 조절하세요.';}
  else{focus.value=s.focusModes.includes(active)?active:s.focusModes[0];byId('camera-focus-support').textContent=s.focusWarning||(s.settings.focusMode?'장치 초점 상태: '+(focusLabels[s.settings.focusMode]||s.settings.focusMode):s.focusRequested?'장치 지원 확인 · '+focusLabels[s.focusRequested]+' 요청됨':'장치가 초점 제어를 지원합니다.');}
  distanceBox.hidden=focus.value!=='manual'||!s.manualRange;distance.disabled=busy||distanceBox.hidden;
  if(s.manualRange){const r=s.manualRange;distance.min=r.min;distance.max=r.max;distance.step=r.step;distance.value=Number.isFinite(s.settings.focusDistance)?s.settings.focusDistance:(r.min+r.max)/2;byId('camera-focus-value').textContent=format(Number(distance.value));}
 }
 async function start(deviceId=''){
  busy=true;settingStatus.textContent='';settings.hidden=true;picker.disabled=true;
  try{await scanner.start(deviceId);if(!dialog.open||!scanner.stream)return;
   try{const devices=(await mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');if(!dialog.open||!scanner.stream)return;picker.replaceChildren();devices.forEach((d,i)=>picker.append(new Option(d.label||'카메라 '+(i+1),d.deviceId)));const active=scanner.track?.getSettings?.().deviceId;if(active)picker.value=active;picker.hidden=pickerLabel.hidden=devices.length<2;}catch{picker.hidden=pickerLabel.hidden=true;}
  }finally{busy=false;if(dialog.open)draw();}
 }
 async function configure(action){
  if(busy||!scanner.stream)return;busy=true;settingStatus.textContent='설정 적용 중…';draw();
  try{const applied=await action();if(dialog.open&&applied)settingStatus.textContent='설정을 적용했습니다. 실제 해상도와 영상 선명도를 확인하세요.';}
  catch(error){if(dialog.open)settingStatus.textContent=(error.name==='OverconstrainedError'?'이 해상도 조합을 지원하지 않습니다. 다른 해상도를 선택하세요.':error.message)+' 기존 영상으로 인식을 계속합니다.';}
  finally{busy=false;if(dialog.open)draw();}
 }
 byId('scan').onclick=()=>{if(!dialog.open)dialog.showModal();start();};
 byId('retry-camera').onclick=()=>start(picker.hidden?'':picker.value);picker.onchange=()=>start(picker.value);
 resolution.onchange=()=>{const value=resolution.value;configure(()=>scanner.setResolution(value));};
 focus.onchange=()=>{const mode=focus.value;configure(()=>scanner.setFocus(mode));};
 distance.oninput=()=>{byId('camera-focus-value').textContent=format(Number(distance.value));};distance.onchange=()=>{const value=Number(distance.value);configure(()=>scanner.setFocus('manual',value));};
 byId('close-camera').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{scanner.stop();picker.hidden=pickerLabel.hidden=true;settings.hidden=true;});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dialog.open)dialog.close();});
 window.addEventListener('pagehide',()=>scanner.stop());return scanner;
}

