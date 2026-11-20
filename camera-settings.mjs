export const resolutionPresets=[['640x480',640,480],['1280x720',1280,720],['1920x1080',1920,1080],['1920x1440',1920,1440],['2560x1440',2560,1440],['3840x2160',3840,2160]];
export const focusLabels={'continuous':'연속 자동초점','single-shot':'한 번 자동초점','manual':'수동 초점'};
export function readCameraSettings(track,video={}){
 let capabilities={},settings={};try{capabilities=track?.getCapabilities?.()||{};}catch{}try{settings=track?.getSettings?.()||{};}catch{}
 const distance=capabilities.focusDistance;
 const manualRange=distance&&Number.isFinite(distance.min)&&Number.isFinite(distance.max)&&distance.max>distance.min?{min:distance.min,max:distance.max,step:Number.isFinite(distance.step)&&distance.step>0?distance.step:(distance.max-distance.min)/100}:null;
 const focusModes=Array.isArray(capabilities.focusMode)?capabilities.focusMode.filter(m=>['continuous','single-shot','manual'].includes(m)&&(m!=='manual'||manualRange)):[];
 const presets=resolutionPresets.filter(([,w,h])=>(!capabilities.width?.max||w<=capabilities.width.max)&&(!capabilities.height?.max||h<=capabilities.height.max)&&(!capabilities.width?.min||w>=capabilities.width.min)&&(!capabilities.height?.min||h>=capabilities.height.min));
 return {capabilities,settings,focusModes,manualRange,presets,width:settings.width||video.videoWidth||0,height:settings.height||video.videoHeight||0,canConfigure:typeof track?.applyConstraints==='function'};
}
export function resolutionConstraints(value){if(value==='auto')return {width:{ideal:1920},height:{ideal:1440}};const preset=resolutionPresets.find(p=>p[0]===value);if(!preset)throw Error('목록의 해상도를 선택하세요.');return {width:{exact:preset[1]},height:{exact:preset[2]}};}
export function focusConstraints(mode,distance,state){if(!state.focusModes.includes(mode))throw Error('이 카메라·브라우저에서 해당 초점 조절을 지원하지 않습니다.');const advanced={focusMode:mode};if(mode==='manual'&&distance!=null){if(!Number.isFinite(Number(distance)))throw Error('올바른 초점값을 선택하세요.');const r=state.manualRange,value=Math.min(r.max,Math.max(r.min,Number(distance)));advanced.focusDistance=Math.min(r.max,Math.max(r.min,Number((r.min+Math.round((value-r.min)/r.step)*r.step).toPrecision(12))));}return {advanced:[advanced]};}
export function waitForVideoSize(video,width,height){if(!video.addEventListener||!width||!height||(video.videoWidth===width&&video.videoHeight===height))return Promise.resolve();return new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);video.removeEventListener('resize',done);resolve();};video.addEventListener('resize',done,{once:true});timer=setTimeout(done,1000);});}
