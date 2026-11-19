import {barcodeValue} from './lookup.mjs';

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

// 카메라 획득과 해제를 한 곳에서 관리합니다. BarcodeDetector 지원 여부와 무관합니다.
export class CameraScanner{
 constructor({video,mediaDevices,load=loadDecoder,onStatus=()=>{},onRead=()=>{}}){this.video=video;this.mediaDevices=mediaDevices;this.load=load;this.onStatus=onStatus;this.onRead=onRead;this.run=0;this.stream=null;this.controls=null;}
 stop(){this.run++;this.controls?.stop();this.controls=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;}
 async start(deviceId=''){
  this.stop();const run=this.run;this.onStatus('카메라 접근을 요청합니다. 권한 창이 뜨면 허용 여부를 선택하세요.');
  try{
   if(!this.mediaDevices?.getUserMedia)throw Error('카메라 기능을 사용할 수 없습니다. HTTPS 배포 주소에서 Edge를 열어 주세요.');
   const media=await this.mediaDevices.getUserMedia({audio:false,video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
   if(run!==this.run){media.getTracks().forEach(t=>t.stop());return;}
   this.stream=media;this.video.srcObject=media;await this.video.play();if(run!==this.run)return;
   this.onStatus('카메라가 열렸습니다. 바코드를 화면에 비춰 주세요. 인식 기능을 준비하고 있습니다.');
   const decoder=await this.load();if(run!==this.run)return;
   const reader=new decoder.BrowserMultiFormatReader(undefined,{delayBetweenScanAttempts:250,delayBetweenScanSuccess:1000});
   if(decoder.BarcodeFormat)reader.possibleFormats=['EAN_13','EAN_8','UPC_A','UPC_E','ITF','CODE_128'].map(k=>decoder.BarcodeFormat[k]).filter(Number.isInteger);
   const controls=await reader.decodeFromStream(media,this.video,(result,_error,activeControls)=>{
    if(run!==this.run||!result)return;let code;try{code=barcodeValue(result.getText());}catch{return;}
    activeControls?.stop();this.stop();this.onRead(code);
   });
   if(run!==this.run){controls.stop();return;}this.controls=controls;
   this.onStatus('카메라가 열렸습니다. 제품의 숫자 바코드를 비춰 주세요.');
  }catch(error){if(run!==this.run)return;this.stop();this.onStatus(cameraError(error));}
 }
}

export function initCameraScanner({onRead,onStatus}){
 const dialog=document.getElementById('camera-dialog'),video=document.getElementById('camera'),message=document.getElementById('camera-status'),picker=document.getElementById('camera-device'),pickerLabel=document.getElementById('camera-device-label');
 const scanner=new CameraScanner({video,mediaDevices:navigator.mediaDevices,onStatus:text=>{message.textContent=text;},onRead:code=>{dialog.close();onStatus('바코드를 읽었습니다. 제품정보를 조회합니다.');onRead(code);}});
 async function start(deviceId=''){
  picker.disabled=true;await scanner.start(deviceId);if(!dialog.open||!scanner.stream)return;
  try{const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');if(!dialog.open||!scanner.stream)return;picker.replaceChildren();devices.forEach((d,i)=>picker.append(new Option(d.label||'카메라 '+(i+1),d.deviceId)));const active=scanner.stream.getVideoTracks()[0]?.getSettings?.().deviceId;if(active)picker.value=active;picker.hidden=pickerLabel.hidden=devices.length<2;picker.disabled=false;}catch{picker.hidden=pickerLabel.hidden=true;}
 }
 document.getElementById('scan').onclick=()=>{if(!dialog.open)dialog.showModal();start();};
 document.getElementById('retry-camera').onclick=()=>start();picker.onchange=()=>start(picker.value);
 document.getElementById('close-camera').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{scanner.stop();picker.hidden=pickerLabel.hidden=true;});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dialog.open)dialog.close();});
 window.addEventListener('pagehide',()=>scanner.stop());return scanner;
}
