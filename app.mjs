import {initCameraScanner} from './camera.mjs';
import {initProductLookup} from './lookup-ui.mjs';
import {metrics,columns,schemaUpgrade,normalizeRecord,validateRTD,today,validate,safeUrl,toRow,fromRows,similarity,productKey,isProduct,catalogId,metadataFields,productDraft,buildLibrary,productDeletionRanges} from './core.mjs';
import {barcodeValue} from './lookup.mjs';
const $=s=>document.querySelector(s),form=$('#record-form'),productForm=$('#product-form'),queryForm=$('#lookup-form'),LOCAL='chagok-local-v1';
let records=[],selected='',category='전체',limit=20,token='',sheetId='',busy=false,productDirty=false,tastingDirty=false,activeProductId='',draftProductId='',needsReconnect=false,epoch=0;
const pending={product:{id:'',text:''},tasting:{id:'',text:''}};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const status=text=>{$('#status').textContent=text;};
const dirty=()=>productDirty||tastingDirty;
const library=()=>buildLibrary(records);
const button=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
function externalLink(label,url){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function localRecords(strict=false){try{const a=JSON.parse(localStorage.getItem(LOCAL)||'[]');if(!Array.isArray(a))throw Error();return a.map(normalizeRecord);}catch{const message='이 기기의 기록을 읽지 못했습니다. 백업을 확인해 주세요.';if(strict)throw Error(message);status(message);return [];}}
records=localRecords();$('#date').value=today();
let confirmResolve=null;
function confirmDiscard(title,description,action='작성한 내용 지우기'){
 if(!dirty())return Promise.resolve(true);
 return confirmAction(title,description,action,'취소 · 현재 내용 유지');
}
function confirmAction(title,description,action,cancel='취소',destructive=false){
 if($('#reset-dialog').open)return Promise.resolve(false);
 $('#cancel-reset').textContent=cancel;$('#reset-title').textContent=title;$('#reset-description').textContent=description;$('#confirm-reset').textContent=action;
 $('#confirm-reset').classList.toggle('destructive',destructive);
 $('#reset-dialog').showModal();return new Promise(resolve=>{confirmResolve=resolve;});
}
function finishConfirm(value){$('#reset-dialog').close();confirmResolve?.(value);confirmResolve=null;}
$('#cancel-reset').onclick=()=>finishConfirm(false);$('#confirm-reset').onclick=()=>finishConfirm(true);
$('#reset-dialog').addEventListener('cancel',event=>{event.preventDefault();finishConfirm(false);});
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
function setBusy(value){busy=value;productForm.inert=value;form.inert=value;queryForm.inert=value;$('#connect').disabled=value;$('#save-product').setAttribute('aria-busy',String(value));$('#save').setAttribute('aria-busy',String(value));updateFormState();}
function updateRTD(){const yes=$('#category').value==='RTD';$('#rtd-fields').hidden=!yes;$('#rtd-fields').disabled=!yes;}
function updateFormState(){
 const ready=!!activeProductId&&!productDirty;
 $('#tasting-fields').disabled=!ready;$('#save').disabled=busy||!ready;
 $('#save-product').disabled=busy||!!activeProductId&&!productDirty;
 $('#save-product').textContent=activeProductId&&!productDirty?'제품정보 저장됨':'제품정보 저장';
 $('#tasting-product').textContent=ready?'평가할 제품: '+$('#name').value:productDirty?'제품정보를 먼저 저장하면 이 제품에 평가를 추가할 수 있어요.':'제품정보를 먼저 저장하거나 컬렉션에서 선택하세요.';
 $('#product-state').textContent=activeProductId?(productDirty?'수정 중 · 제품정보를 저장하세요.':'저장된 제품 · 지금 또는 나중에 테이스팅을 추가하세요.'):'검색 후보를 선택하거나 직접 입력한 뒤 제품정보를 저장하세요.';
 updateRTD();
}
function growTextareas(root){root.querySelectorAll('textarea').forEach(n=>{n.style.height='auto';if(n.value)n.style.height=n.scrollHeight+'px';});}
document.querySelectorAll('textarea').forEach(n=>n.addEventListener('input',()=>growTextareas(n.parentElement)));
function updateProductLinks(){for(const [id,field] of [['open-image','이미지URL'],['open-purchase','구매URL'],['open-source','제품정보출처'],['open-official-notice','공식몰상품고시URL']]){const a=$('#'+id),url=safeUrl(productForm.elements.namedItem(field).value);a.hidden=!url;if(url)a.href=url;else a.removeAttribute('href');}}
function imagePreview(){updateProductLinks();const box=$('#product-image-preview'),url=safeUrl($('#image').value);box.replaceChildren();if(url){const img=el('img');img.src=url;img.alt=($('#name').value||'제품')+' 이미지';img.referrerPolicy='no-referrer';img.onerror=()=>{if(img.isConnected)box.replaceChildren(el('p','이미지를 불러오지 못했습니다. 주소와 원문을 확인하세요.','help'));};box.append(img);}else box.append(el('div','茶','tea-mark'),el('p','제품 이미지 미리보기 · 이미지 미등록','help'));
 const retrieved=productForm.elements.namedItem('제품정보조회일').value;$('#source-summary').textContent=retrieved?'정보 조회일: '+retrieved+' · 불러온 항목: '+productForm.elements.namedItem('제품정보반영항목').value:'원문에서 확인된 정보만 사용합니다.';
}
function resetTasting(){form.reset();$('#date').value=today();tastingDirty=false;pending.tasting={id:'',text:''};$('#form-error').textContent='';form.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));growTextareas(form);updateFormState();}
function resetEntry(keepLookup=false){if(!keepLookup)lookupUI.close();productForm.reset();productForm.querySelectorAll('input[type=hidden]').forEach(n=>{n.value='';});$('#product-extra').open=false;activeProductId='';draftProductId='';productDirty=false;pending.product={id:'',text:''};$('#product-error').textContent='';productForm.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));resetTasting();imagePreview();growTextareas(productForm);updateFormState();}
async function startNew(){if(busy)return;if(!await confirmDiscard('새 제품을 입력할까요?','저장하지 않은 제품정보와 관능평가를 비웁니다. 저장된 기록은 유지됩니다.'))return;resetEntry();$('#name').focus();status('제품정보와 관능평가 입력을 초기화했습니다. 저장된 기록은 유지됩니다.');}
$('#new-product').onclick=startNew;$('#reset-entry').onclick=startNew;
$('#reset-tasting').onclick=async()=>{if(busy)return;if(tastingDirty&&!await confirmDiscard('관능평가 입력을 비울까요?','저장하지 않은 관능평가만 비웁니다. 저장된 제품정보와 기록은 유지됩니다.'))return;resetTasting();$('#date').focus();status('관능평가 입력을 초기화했습니다.');};
for(const name of metrics){const row=el('div',undefined,'metric'),label=el('label',name),select=el('select'),id='metric-'+metrics.indexOf(name);label.htmlFor=id;select.id=id;select.name=name;select.append(new Option('미평가',''));for(let i=1;i<=9;i++)select.append(new Option(i+'점',String(i)));row.append(label,select);$('#sensory').append(row);}
productForm.addEventListener('input',event=>{productDirty=true;updateFormState();if(['image','purchase','name','source-url'].includes(event.target.id))imagePreview();});productForm.addEventListener('change',()=>{productDirty=true;updateFormState();});form.addEventListener('input',()=>{tastingDirty=true;});form.addEventListener('change',()=>{tastingDirty=true;});
function fillProduct(r){productForm.reset();for(const key of metadataFields){const input=productForm.elements.namedItem(key);if(input)input.value=r[key]||'';}growTextareas(productForm);imagePreview();updateFormState();}
async function applyCandidate(candidate){
 if(busy){status('진행 중인 작업이 끝나면 후보를 선택하세요.');return false;}
 if(!await confirmDiscard('이 후보로 제품정보를 바꿀까요?','현재 작성 중인 제품정보와 관능평가는 아직 저장되지 않았습니다. 바꾸면 이 입력은 지워지고 선택한 후보의 정보가 채워집니다. 이미 저장한 기록은 그대로 유지됩니다.','이 후보로 바꾸기'))return false;
 const r={...candidate.record};r['분류']=r['분류']||$('#query-category').value;r['브랜드']=r['브랜드']||$('#query-brand').value.trim();
 const match=candidate.source==='내 기록'?library().find(g=>g.id===catalogId(candidate.record)):library().find(g=>productKey(g.product)===productKey(normalizeRecord(r)));
 resetEntry(true);draftProductId=match?.id||'';activeProductId=candidate.source==='내 기록'?match?.id||'':'';productDirty=!activeProductId;
 fillProduct(r);if(r['제품정보출처'])$('#product-extra').open=true;updateFormState();$('#name').focus();
 status(activeProductId?'저장된 제품정보를 불러왔습니다. 날짜별 평가를 추가하세요.':'확인된 제품정보를 입력했습니다. 분류와 실제 포장을 확인한 뒤 제품정보를 저장하세요.');return true;
}
const lookupUI=initProductLookup({form:productForm,queryForm,getRecords:()=>library().map(g=>({...g.product,'제품ID':g.id})),onApply:applyCandidate,onDirty:()=>{productDirty=true;updateFormState();},onStatus:status});
async function loadProduct(g){if(busy)return;if(!await confirmDiscard('저장된 제품을 불러올까요?','저장하지 않은 입력을 비우고 이 제품에 테이스팅을 추가합니다.'))return;resetEntry();activeProductId=g.id;draftProductId=g.id;fillProduct(g.product);selected=g.id;render();$('#date').focus();$('#tasting-title').scrollIntoView({block:'start'});status('저장된 제품정보를 불러왔습니다. 테이스팅 날짜와 평가를 입력하세요.');}
function render(){
 const query=$('#search').value.normalize('NFKC').toLowerCase().trim(),from=$('#from').value,until=$('#until').value;$('#clear-search').hidden=!query;
 const all=library(),groups=all.filter(g=>(category==='전체'||g.product['분류']===category)&&(!from&&!until||g.tastings.some(r=>(!from||r['테이스팅일']>=from)&&(!until||r['테이스팅일']<=until)))&&[g.product,...g.tastings].some(r=>Object.values(r).join(' ').normalize('NFKC').toLowerCase().includes(query)));
 $('#count').textContent=all.length+'개 제품 · '+records.filter(r=>!isProduct(r)).length+'회 테이스팅'+(groups.length!==all.length?' · 검색 '+groups.length+'개':'');
 const list=$('#list');list.replaceChildren();if(!groups.length)list.append(el('p',all.length?'검색 결과가 없습니다. 검색어나 날짜 조건을 바꿔보세요.':'아직 저장된 제품이 없어요. 위에서 검색하거나 제품을 직접 등록하세요.','empty'));
 for(const g of groups.slice(0,limit)){const r=g.product,b=button('',()=>{selected=g.id;render();detail(g);});b.className='record'+(selected===g.id?' selected':'');b.setAttribute('aria-pressed',String(selected===g.id));const content=el('div');content.append(el('strong',r['제품명']),el('small',(r['브랜드']||'브랜드 미입력')+' · '+r['분류']),el('br'),el('small',g.tastings.length?g.tastings[0]['테이스팅일']+' · '+g.tastings.length+'회 테이스팅':'제품정보만 저장 · 아직 테이스팅 없음'));
 const url=safeUrl(r['이미지URL']);if(url){const img=el('img');img.src=url;img.alt='';img.referrerPolicy='no-referrer';img.className='record-thumb';img.onerror=()=>img.replaceWith(el('span','茶','mini'));b.append(img);}else b.append(el('span','茶','mini'));b.append(content);list.append(b);}
 $('#more').hidden=groups.length<=limit;
}
function detail(g,tastingId=''){
 const area=$('#detail'),r=g.product;area.replaceChildren();const image=safeUrl(r['이미지URL']);if(image){const img=el('img');img.className='hero-image';img.src=image;img.alt=r['제품명']+' 제품 이미지';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(el('p','제품 이미지를 불러올 수 없습니다.','help'));area.append(img);}else area.append(el('div','茶','tea-mark'));
 if(image)area.append(externalLink('이미지 원본 열기',image));
 area.append(el('small',r['분류']+' · '+(r['브랜드']||'브랜드 미입력'),'muted'),el('h2',r['제품명']));
 const meta=el('dl',undefined,'product-meta');for(const [key,label] of [['용량','용량 · 포장'],['바코드','바코드'],['판매가격','판매가격 · 원문 표기'],['판매가격확인일','판매가격 확인일'],['원재료표기','원재료명'],['블렌딩','블렌딩']])if(r[key])meta.append(el('dt',label),el('dd',r[key]));area.append(meta);
 if(safeUrl(r['구매URL']))area.append(externalLink('판매 페이지 열기',safeUrl(r['구매URL'])));
 const source=safeUrl(r['제품정보출처']),officialNotice=safeUrl(r['공식몰상품고시URL']);
 if(source||officialNotice){
  const box=el('div',undefined,'source-note');
  if(source&&source!==officialNotice)box.append(externalLink('제품정보 원문',source));
  if(officialNotice)box.append(source&&source!==officialNotice?' · ':'',externalLink('공식몰 상품고시',officialNotice));
  if(r['제품정보조회일'])box.append(el('p','조회일: '+r['제품정보조회일']));
  if(source&&new URL(source).hostname==='world.openfoodfacts.org')box.append(externalLink('Open Food Facts · ODbL / DbCL · 이미지 CC BY-SA','https://world.openfoodfacts.org/terms-of-use'));
  area.append(box);
 }
 const actions=el('div',undefined,'toolbar');
 const remove=button('제품 삭제',()=>deleteProduct(g.id));
 remove.className='danger-text';
 actions.append(button('제품정보 / 테이스팅 추가',()=>loadProduct(g)),remove);
 area.append(actions,el('h3','날짜별 테이스팅 기록'));
 if(!g.tastings.length){area.append(el('p','제품정보만 저장되어 있습니다. 마신 날 테이스팅을 추가하세요.','help'));return;}
 const t=g.tastings.find(x=>x.id===tastingId)||g.tastings[0];area.append(el('p',t['테이스팅일']+' 평가','note'));if(t['가격_원']!=='')area.append(el('p','내 구매가격: '+Number(t['가격_원']).toLocaleString('ko-KR')+'원'));
 for(const tag of t['향미태그'].split(/[,，]/).filter(Boolean))area.append(el('span',tag.trim(),'tag'));
 const bars=el('div',undefined,'bars');for(const name of metrics){const row=el('div',undefined,'bar'),track=el('div',undefined,'bar-track'),fill=el('div',undefined,'bar-fill'),value=t[name];fill.style.width=value?Number(value)/9*100+'%':'0';track.append(fill);row.append(el('span',name),track,el('span',value?value+'/9':'—'));bars.append(row);}area.append(bars);
 if(t['분류']==='RTD'){for(const [key,label,unit] of [['Brix','Brix',' °Bx'],['pH','pH',''],['산도','적정산도','%']])if(t[key]!==''&&t[key]!=null)area.append(el('p',label+': '+t[key]+unit,'note'));if(t['산도기준'])area.append(el('p','산도 기준: '+t['산도기준'],'help'));}
 for(const [key,label] of [['테이스팅노트','테이스팅 노트'],['개발참고','개발 참고점'],['추출조건','추출 · 음용 조건']])if(t[key])area.append(el('h3',label),el('p',t[key],'note'));
 area.append(button('유사한 티 찾기',()=>showSimilar(g,t)));
 for(const x of g.tastings){const wrap=el('div',undefined,'history');wrap.append(button(x['테이스팅일']+' · '+(x['테이스팅노트'].slice(0,55)||'노트 없음'),()=>detail(g,x.id)));area.append(wrap);}const results=el('div');results.id='similar-results';results.setAttribute('aria-live','polite');area.append(results);
}
function showSimilar(group,r){const results=$('#similar-results');results.replaceChildren(el('h3','관능강도 기준 유사 제품'));const matches=library().filter(g=>g.id!==group.id&&g.tastings.length).map(g=>({g,match:similarity(r,g.tastings[0])})).filter(x=>x.match).sort((a,b)=>b.match.score-a.match.score).slice(0,5);if(!matches.length)results.append(el('p','비교할 제품의 관능강도를 먼저 기록하세요.','help'));for(const x of matches)results.append(button(x.g.product['제품명']+' · 유사도 '+x.match.score+'% · 공통 '+x.match.count+'항목',()=>{selected=x.g.id;render();detail(x.g);}));results.append(el('p','제품별 최근 평가 비교 · 통계적 일치도나 개발 성공 확률이 아닙니다. 평가조건이 비슷한 기록끼리 비교하세요.','help'));}
function refreshDetail(){const g=library().find(g=>g.id===selected);if(g)detail(g);else $('#detail').replaceChildren(el('p','컬렉션에서 제품을 선택하세요.','empty'));}
$('#categories').onclick=event=>{const b=event.target.closest('[data-category]');if(!b)return;category=b.dataset.category;limit=20;document.querySelectorAll('[data-category]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));render();};
for(const id of ['search','from','until'])$('#'+id).addEventListener('input',event=>{if(!event.isComposing){limit=20;render();}});$('#search').addEventListener('compositionend',()=>{limit=20;render();});$('#clear-search').onclick=()=>{$('#search').value='';render();$('#search').focus();};$('#more').onclick=()=>{limit+=20;render();};
async function api(url,options={}){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{...options,signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});const data=await response.json();if(!response.ok){if(response.status===401){needsReconnect=true;accountUI();throw Error('Google 연결이 만료되었습니다. 다시 연결하세요. 입력 중인 내용은 유지됩니다.');}throw Error(data.error?.message||'Google 요청 실패');}return data;}catch(e){if(e.name==='AbortError')throw Error('응답 시간이 초과되었습니다. 저장 요청이었다면 새로고침으로 기록을 먼저 확인하세요.');throw e;}finally{clearTimeout(timeout);}}
async function readCloud(){
const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
const data=await api(base+'/values/Records?valueRenderOption=UNFORMATTED_VALUE');
const rows=data.values||[],result=fromRows(rows),upgrade=schemaUpgrade(rows);
if(upgrade){
 const metadata=await api(base+'?fields=sheets.properties');
 const sheet=metadata.sheets.find(s=>s.properties.title==='Records').properties;
 if(sheet.gridProperties.columnCount<columns.length)await api(base+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{updateSheetProperties:{properties:{sheetId:sheet.sheetId,gridProperties:{columnCount:columns.length}},fields:'gridProperties.columnCount'}}]})});
 const updates=[{range:'Records!A1',values:[upgrade.header]}];
 if(upgrade.values.length)updates.push({range:'Records!'+upgrade.firstColumn+'2',values:upgrade.values});
 await api(base+'/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:updates})});
}
return result;
}

async function deleteProduct(productId){
 if(busy){status('진행 중인 작업이 끝나면 제품을 삭제하세요.');return;}
 if(needsReconnect){status('Google에 다시 연결한 뒤 제품을 삭제하세요.');return;}
 const productRows=records.filter(r=>catalogId(r)===productId);
 const group=buildLibrary(productRows)[0];
 if(!group){status('이미 목록에서 사라진 제품입니다.');return;}
 const expected=new Set(productRows.map(r=>r.id));
 const destination=token&&sheetId?'Google 개인 시트':'이 기기';
 const connectionVersion=epoch;
 const currentDraft=activeProductId===productId||draftProductId===productId;
 const tastingCount=group.tastings.length;
 const scope=tastingCount?`‘${group.product['제품명']}’ 제품정보와 연결된 테이스팅 ${tastingCount}회가`:`‘${group.product['제품명']}’ 제품정보가`;
 const warning=`${scope} ${destination}에서 삭제됩니다. ${currentDraft&&dirty()?'이 제품에 작성 중인 입력도 비웁니다. ':''}차곡에서 바로 되돌릴 수 없습니다.`;
 if(!await confirmAction('이 제품을 삭제할까요?',warning,'제품 삭제','취소',true))return;
 if(busy||connectionVersion!==epoch){status('저장 위치를 다시 확인한 뒤 제품을 선택해 주세요.');return;}
 setBusy(true);
 status('제품과 테이스팅을 삭제하고 있습니다…');
 try{
  const cloud=Boolean(token&&sheetId);
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId;
  const valuesUrl=base+'/values/Records?valueRenderOption=UNFORMATTED_VALUE';
  const rows=cloud?(await api(valuesUrl)).values||[]:null;
  const fresh=cloud?fromRows(rows):localRecords(true);
  const target=fresh.filter(r=>catalogId(r)===productId);
  if(target.length&&(target.length!==expected.size||target.some(r=>!expected.has(r.id)))){
   records=fresh;
   render();refreshDetail();
   status('이 제품의 기록이 바뀌었습니다. 삭제할 내용을 다시 확인해 주세요.');
   return;
  }
  const remaining=fresh.filter(r=>catalogId(r)!==productId);
  if(cloud&&target.length){
   const ranges=productDeletionRanges(rows,expected);
   if(ranges.length!==expected.size)throw Error('시트에서 삭제 대상을 확인할 수 없습니다.');
   await api(base+'/values:batchClear',{method:'POST',body:JSON.stringify({ranges})});
   const saved=fromRows((await api(valuesUrl)).values||[]);
   if(saved.some(r=>catalogId(r)===productId))throw Error('시트에 이 제품의 기록이 남아 있습니다.');
   records=saved;
  }else{
   if(!cloud&&target.length)localStorage.setItem(LOCAL,JSON.stringify(remaining));
   records=remaining;
  }
  if(currentDraft)resetEntry();else lookupUI.close();
  if(selected===productId)selected='';
  render();refreshDetail();$('#search').focus();
  status(target.length?`‘${group.product['제품명']}’ 제품${tastingCount?`과 테이스팅 기록 ${tastingCount}건`:''}을 ${destination}에서 삭제했습니다.`:'이미 저장소에서 삭제된 제품입니다.');
 }catch(error){
  status(`삭제를 확인하지 못했습니다. ${error.message} · 새로고침으로 상태를 확인한 뒤 다시 시도하세요.`);
 }finally{setBusy(false);}
}

function accountUI(){const cloud=!!token&&!!sheetId;$('#account').textContent=cloud?(needsReconnect?'Google 연결 만료 · 다시 연결하세요.':'Google 개인 시트 연결됨 · 60초마다 갱신'):'이 기기에 저장 · Google 연결 전';$('#connect').textContent='Google로 연결';$('#connect').hidden=cloud&&!needsReconnect;$('#disconnect').hidden=true;$('#sheet').disabled=!cloud;}
async function sync(show=true){if(busy||!token||!sheetId||needsReconnect||!show&&dirty())return false;setBusy(true);const version=epoch;try{const data=await readCloud();if(version!==epoch)return false;records=data;render();refreshDetail();if(activeProductId&&!productDirty){const g=library().find(g=>g.id===activeProductId);if(g)fillProduct(g.product);else{activeProductId='';productDirty=true;updateFormState();}}if(show)status('시트에서 최신 제품정보와 테이스팅을 불러왔습니다.');return true;}catch(e){if(version===epoch)status(e.message);return false;}finally{setBusy(false);}}
$('#connect').onclick=async()=>{
 if(busy)return;
 const clientId=window.TEA_CONFIG?.googleClientId;if(!clientId){status('Google 연결 설정 전입니다. 「처음 사용하시나요?」에서 설정을 확인하세요.');return;}if(!window.google?.accounts?.oauth2){status('Google 로그인 기능을 불러오지 못했습니다. 인터넷 연결과 팝업 차단을 확인하세요.');return;}
 const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',error_callback:()=>status('로그인 창이 닫혔거나 차단되었습니다. 다시 연결하세요.'),callback:async response=>{
  if(response.error){status('Google 연결 권한이 허용되지 않았습니다.');return;}setBusy(true);epoch++;const previous={token,sheetId,records,selected,needsReconnect};token=response.access_token;sheetId='';
  try{status('개인 데이터 시트를 준비하고 있습니다.');const q="trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '차곡 Tea Library'";const files=await api('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id,name)&pageSize=100');if(files.files.length>1)throw Error('이름이 같은 시트가 여러 개입니다. 사용할 시트 하나만 「차곡 Tea Library」 이름으로 남겨 주세요.');if(files.files.length)sheetId=files.files[0].id;else{const result=await api('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',body:JSON.stringify({properties:{title:'차곡 Tea Library'},sheets:[{properties:{title:'Records',gridProperties:{frozenRowCount:1,columnCount:columns.length}},data:[{startRow:0,startColumn:0,rowData:[{values:columns.map(k=>({userEnteredValue:{stringValue:k}}))}]}]}]})});sheetId=result.spreadsheetId;}
   records=await readCloud();needsReconnect=false;selected='';if(previous.sheetId!==sheetId){activeProductId='';draftProductId='';if($('#name').value.trim())productDirty=true;}lookupUI.close();render();refreshDetail();updateFormState();accountUI();status('개인 시트를 연결했습니다. 기기 기록은 자동으로 옮겨지지 않습니다. 백업으로 옮길 수 있습니다.');
  }catch(e){({token,sheetId,records,selected,needsReconnect}=previous);status(e.message);accountUI();}finally{setBusy(false);}
 }});client.requestAccessToken({prompt:'select_account'});
};
$('#disconnect').onclick=()=>{if(busy||dirty())return;epoch++;if(token&&window.google)google.accounts.oauth2.revoke(token,()=>{});token='';sheetId='';needsReconnect=false;records=localRecords();selected='';resetEntry();render();refreshDetail();accountUI();status('Google 연결 해제 · 시트는 Drive에 보관되어 있습니다.');};
async function persist(row){
 if(token&&sheetId){const fresh=await readCloud();if(!fresh.some(x=>x.id===row.id))await api('https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values/Records:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[toRow(row)]})});const saved=await readCloud();if(!saved.some(x=>x.id===row.id))throw Error('저장한 행을 아직 확인하지 못했습니다. 새로고침 후 다시 확인하세요.');records=saved;
 }else{const fresh=localRecords();if(!fresh.some(x=>x.id===row.id))fresh.push(normalizeRecord(row));localStorage.setItem(LOCAL,JSON.stringify(fresh));records=fresh;}
}
function rowIdentity(kind,row){const text=JSON.stringify(row),state=pending[kind];if(text!==state.text){state.text=text;state.id=crypto.randomUUID();}return {...row,id:state.id,'기록시각':new Date().toISOString()};}
function showError(root,error,id){const box=$(id);box.textContent=error;const key=error.includes('제품명')?'제품명':error.includes('분류')?'분류':error.includes('판매가격 확인일')?'판매가격확인일':error.includes('Brix')?'Brix':error.includes('pH')?'pH':error.includes('환산')?'산도기준':error.includes('산도')?'산도':error.includes('가격')?'가격_원':error.includes('날짜')?'테이스팅일':error.includes('이미지URL')?'이미지URL':error.includes('구매URL')?'구매URL':error.includes('출처')?'제품정보출처':null;const field=key?root.elements.namedItem(key):null;if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',id.slice(1));field.focus();}box.scrollIntoView({block:'center'});}
productForm.onsubmit=async event=>{
 event.preventDefault();if(busy)return;if(activeProductId&&!productDirty)return;
 const source=Object.fromEntries(new FormData(productForm));source['제품명']=source['제품명'].trim();source['브랜드']=source['브랜드'].trim();
 try{if(source['바코드'])source['바코드']=barcodeValue(source['바코드']);}catch(e){showError(productForm,e.message,'#product-error');$('#product-barcode').focus();return;}
 const error=validate({...source,'기록유형':'제품'});if(error){showError(productForm,error,'#product-error');return;}
 if(!draftProductId)draftProductId=library().find(g=>productKey(g.product)===productKey(normalizeRecord(source)))?.id||crypto.randomUUID();
 const r=rowIdentity('product',productDraft(source,draftProductId));setBusy(true);$('#product-error').textContent='';
 try{await persist(r);activeProductId=draftProductId;productDirty=false;pending.product={id:'',text:''};selected=activeProductId;render();refreshDetail();updateFormState();status((token?'Google 시트':'이 기기')+'에 제품정보를 저장했습니다. 테이스팅은 지금 또는 나중에 추가할 수 있습니다.');}
 catch(e){showError(productForm,e.message,'#product-error');status('제품정보 저장 결과를 확인하지 못했습니다. 입력을 유지합니다. 새로고침으로 확인 후 다시 저장하세요.');}finally{setBusy(false);}
};
form.onsubmit=async event=>{
 event.preventDefault();if(busy)return;if(!activeProductId||productDirty){status('제품정보를 먼저 저장하세요.');return;}
 const saved=library().find(g=>g.id===activeProductId);if(!saved){status('연결된 제품을 찾지 못했습니다. 제품정보를 다시 저장하세요.');return;}
 const draft=normalizeRecord({...productDraft(saved.product,activeProductId),...Object.fromEntries(new FormData(form)),'기록유형':'테이스팅'}),error=validate(draft)||validateRTD(draft);if(error){showError(form,error,'#form-error');return;}
 if(!tastingDirty&&pending.tasting.text==='saved'){status('이 평가는 이미 저장했습니다. 평가 초기화를 누르면 새 기록을 입력할 수 있습니다.');return;}
 const r=rowIdentity('tasting',draft);setBusy(true);$('#form-error').textContent='';
 try{await persist(r);tastingDirty=false;pending.tasting={id:'',text:'saved'};selected=activeProductId;render();const group=library().find(g=>g.id===activeProductId);if(group)detail(group,r.id);status((token?'Google 시트':'이 기기')+'에 '+r['테이스팅일']+' 테이스팅을 저장했습니다.');}
 catch(e){$('#form-error').textContent=e.message;status('저장 결과를 확인하지 못했습니다. 입력을 유지합니다. 새로고침으로 확인 후 다시 저장하세요.');}finally{setBusy(false);}
};
$('#refresh').onclick=()=>{if(busy)return;if(token){if(needsReconnect)status('Google 연결이 만료되었습니다. 다시 연결하세요. 입력은 유지됩니다.');else sync();}else{records=localRecords();render();refreshDetail();status('이 기기의 최신 제품정보와 테이스팅을 불러왔습니다.');}};
$('#reload-home').onclick=async event=>{
 event.preventDefault();if(busy){status('진행 중인 작업이 끝나면 새로고침하세요.');return;}if(!await confirmDiscard('차곡 화면을 새로고침할까요?','저장하지 않은 입력을 비우고 최신 기록을 불러옵니다. Google 연결은 유지됩니다.','새로고침'))return;
 resetEntry();queryForm.reset();$('#search').value='';$('#from').value='';$('#until').value='';category='전체';limit=20;selected='';document.querySelectorAll('[data-category]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.category==='전체')));
 if(token){if(needsReconnect){render();refreshDetail();status('Google 연결이 만료되었습니다. 다시 연결하세요.');}else await sync();}else{records=localRecords();render();refreshDetail();status('차곡 화면과 저장된 기록을 새로고침했습니다.');}window.scrollTo({top:0,behavior:'auto'});
};
$('#sheet').onclick=()=>{if(sheetId)window.open('https://docs.google.com/spreadsheets/d/'+sheetId+'/edit','_blank','noopener');};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='chagok-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('제품정보와 테이스팅을 함께 백업했습니다.');};
$('#import').onclick=()=>{if(!busy)$('#import-file').click();};$('#import-file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;if(file.size>10*1024*1024){status('백업 파일은 10MB 이하로 선택하세요.');return;}if(busy)return;setBusy(true);
 try{const data=JSON.parse(await file.text());if(![1,2].includes(data.version)||!Array.isArray(data.records))throw Error('차곡 백업 파일이 아닙니다.');const imported=data.records.map(normalizeRecord);for(const r of imported){const error=validate(r)||validateRTD(r);if(error||!r.id)throw Error('잘못된 기록: '+(error||'ID 없음'));}const fresh=token?await readCloud():localRecords(),ids=new Set(fresh.map(x=>x.id)),add=[];for(const r of imported)if(!ids.has(r.id)){ids.add(r.id);add.push(r);}if(token&&add.length)await api('https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values/Records:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:add.map(toRow)})});if(token)records=await readCloud();else{records=[...fresh,...add];localStorage.setItem(LOCAL,JSON.stringify(records));}render();refreshDetail();status(add.length+'개 행을 불러왔습니다. 기존 ID는 중복 추가하지 않았습니다.');}catch(e){status('불러오기 실패: '+e.message+' · 일부 저장되었을 수 있으니 새로고침 후 확인하세요.');}finally{setBusy(false);event.target.value='';}
};
initCameraScanner({onRead:code=>{$('#query-barcode').value=code;lookupUI.search();},onStatus:status});
setInterval(()=>{if(document.visibilityState==='visible')sync(false);},60000);window.addEventListener('storage',event=>{if(event.key===LOCAL&&!token){records=localRecords();render();refreshDetail();}});
render();accountUI();imagePreview();updateFormState();if(records.length)status('이 기기의 제품 '+library().length+'개와 테이스팅 '+records.filter(r=>!isProduct(r)).length+'회를 불러왔습니다.');
