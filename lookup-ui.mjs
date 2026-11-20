import {externalSearchLinks,barcodeDatabaseLinks} from './search-links.mjs';
import {WebProductLookup,loadTurnstile} from './web-product.mjs';
import {safeUrl} from './core.mjs';
import {ProductLookup,barcodeValue,lookupQuery,localCandidates,importedFields,mergeProductInfo} from './lookup.mjs';

export function initProductLookup({form,getRecords,onDirty,onStatus,webConfig=window.TEA_WEB_SEARCH||{},loadChallenge=loadTurnstile,webFetch,publicClient=new ProductLookup()}){
 const panel=document.getElementById('lookup-panel'),message=document.getElementById('lookup-status'),list=document.getElementById('lookup-results'),preview=document.getElementById('lookup-preview');
 const client=publicClient;let request=0,lastMode='name',lastQuery='',visibleItems=[],widget=null,challenge=null,rejectChallenge=null;
 const web=new WebProductLookup({endpoint:webConfig.endpoint,getToken:tokenForSearch,...(webFetch?{fetcher:webFetch}:{})});
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const link=(label,url)=>{const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const field=key=>form.elements.namedItem(key);
 function clearChallenge(){rejectChallenge?.(new DOMException('취소됨','AbortError'));rejectChallenge=null;if(widget!=null){challenge?.remove(widget);widget=null;}}
 function close(){request++;client.cancel();web.cancel();clearChallenge();panel.hidden=true;list.replaceChildren();preview.replaceChildren();panel.removeAttribute('aria-busy');}
 async function tokenForSearch(){
  const current=request;message.textContent='웹 검색을 위한 확인 중입니다. 필요한 경우 아래 확인을 완료하세요.';
  challenge=await loadChallenge();if(current!==request)throw new DOMException('취소됨','AbortError');
  const container=node('div');container.className='web-challenge';list.append(container);
  return new Promise((resolve,reject)=>{
   rejectChallenge=reject;const finish=(error,token)=>{rejectChallenge=null;if(widget!=null){challenge.remove(widget);widget=null;}container.remove();error?reject(error):resolve(token);};
   widget=challenge.render(container,{sitekey:webConfig.siteKey,action:'tea_search',language:'ko',size:'compact',callback:token=>finish(null,token),'error-callback':()=>finish(Error('검색 확인이 실패했습니다. 다시 조회하세요.')),'expired-callback':()=>finish(Error('검색 확인이 만료되었습니다. 다시 조회하세요.')),'timeout-callback':()=>finish(Error('검색 확인 시간이 지났습니다. 다시 조회하세요.'))});
  });
 }
 function applyCandidate(candidate,chosen){
  const merged=mergeProductInfo(Object.fromEntries(new FormData(form)),candidate,chosen);
  if(!merged.applied.length){message.textContent='불러올 항목을 하나 이상 선택하세요.';return;}
  for(const key of [...merged.applied,'제품정보출처','제품정보조회일','제품정보반영항목'])if(field(key))field(key).value=merged.record[key]||'';
  const ingredients=field('원재료표기');if(ingredients){ingredients.style.height='auto';ingredients.style.height=Math.max(90,ingredients.scrollHeight)+'px';}
  onDirty();onStatus(merged.applied.length+'개 제품정보를 입력했습니다. 실제 제품과 용량을 확인하고 테이스팅 저장을 누르세요.');close();document.getElementById('product-extra').open=true;field('제품명').focus();
 }
 function attribution(parent){const p=node('p',null,'lookup-source');p.append('출처: ',link('Open Food Facts','https://world.openfoodfacts.org/'),' · ',link('ODbL / DbCL','https://world.openfoodfacts.org/terms-of-use'),' · ',link('이미지 CC BY-SA','https://creativecommons.org/licenses/by-sa/3.0/'));parent.append(p);}
 function choose(candidate){
  preview.replaceChildren();preview.hidden=false;
  preview.append(node('h3','불러올 제품정보 확인'),node('p','선택한 항목은 기존 제품정보를 바꿉니다. 날짜·관능평가·테이스팅 노트·측정값은 유지됩니다.','help'));
  if(safeUrl(candidate.record['이미지URL'])){const img=node('img');img.src=safeUrl(candidate.record['이미지URL']);img.alt=(candidate.record['제품명']||'후보 제품')+' 이미지';img.referrerPolicy='no-referrer';img.className='lookup-preview-image';img.onerror=()=>img.replaceWith(node('p','제품 이미지를 불러오지 못했습니다.','help'));preview.append(img);}
  const choices=[];
  for(const key of importedFields){const value=candidate.record[key];if(!value||!field(key))continue;const label=node('label',null,'lookup-choice'),check=node('input');check.type='checkbox';check.checked=true;check.dataset.field=key;check.setAttribute('aria-label',key+' 불러오기');const text=node('span',key+': '+(value.length>500?value.slice(0,500)+'…':value));const current=field(key).value;if(current&&current!==value)text.append(node('small','현재 입력: '+current.slice(0,120),'lookup-current'));label.append(check,text);preview.append(label);choices.push(check);}
  if(safeUrl(candidate.record['제품정보출처']))preview.append(link('제품정보 원문 보기',safeUrl(candidate.record['제품정보출처'])));
  if(candidate.source==='Open Food Facts')attribution(preview);
  const actions=node('div',null,'toolbar'),apply=button('선택 정보 불러오기',()=>{
   applyCandidate(candidate,choices.filter(c=>c.checked).map(c=>c.dataset.field));
  });apply.className='primary';actions.append(apply,button('후보 목록으로',()=>{preview.hidden=true;list.hidden=false;}));preview.append(actions);list.hidden=true;
 }
 function draw(items,{loading=false,failed=false}={}){
  visibleItems=items;list.replaceChildren();list.hidden=false;preview.hidden=true;
  for(const item of items){const r=item.record,isWeb=item.source==='Tavily 웹 검색';
   const b=button('',()=>isWeb?applyCandidate(item,importedFields.filter(k=>r[k]&&field(k)&&(!field(k).value||['제품명','브랜드','바코드','용량'].includes(k)))):choose(item));b.className='lookup-candidate';
   b.append(node('strong',r['제품명']||'제품명 미등록'),node('small',[r['브랜드'],r['용량'],r['바코드']].filter(Boolean).join(' · ')),node('small',item.source));
   if(isWeb){if(item.summary)b.append(node('small',item.summary));b.append(node('small',item.warning),node('small','이 후보 선택 · 제품명과 표시된 정보 자동 입력'));}list.append(b);if(isWeb)list.append(link('후보 원문 확인',r['제품정보출처']));
  }
  if(!items.length&&!loading)list.append(node('p',failed?'외부 조회를 완료하지 못했습니다. 입력한 내용은 그대로 유지됩니다.':lastMode==='barcode'?'일치 제품 없음 · 입력한 바코드와 일치하는 정보가 확인된 제품만 표시합니다. 제품명으로 다시 검색하거나 직접 입력하세요.':'등록 제품이 없습니다. 웹 검색이나 직접 입력을 이용하세요.','help'));
  if(lastQuery){const more=button('웹에서도 제품 찾기',()=>searchWeb());more.disabled=loading;list.append(more);
   if(!webConfig.endpoint||!webConfig.siteKey)list.append(link('Tavily 연결 설정 안내','tavily-setup.html'));
   if(lastMode==='barcode'){const databases=node('div',null,'external-searches');for(const item of barcodeDatabaseLinks(lastQuery))databases.append(link(item.label,item.url));list.append(databases,node('p','바코드 전용 DB도 미등록 제품은 없을 수 있습니다. GS1은 번호를 직접 입력하며 제품정보 대신 사업자 정보만 나올 수 있습니다.','help'));}
   const searches=node('div',null,'external-searches');for(const item of externalSearchLinks(lastQuery).sort((a,b)=>(a.label==='Google 검색'?-1:0)-(b.label==='Google 검색'?-1:0)))searches.append(link(item.label,item.url));list.append(searches,node('p','위 바로가기는 외부 검색화면을 엽니다. Tavily는 Google과 다른 검색 결과를 제공하며, 웹 후보를 선택하면 표시된 정보가 자동 입력됩니다.','help'));
  }if(items.some(item=>item.source==='Open Food Facts'))attribution(list);
 }
 async function searchWeb(){
  if(!webConfig.endpoint||!webConfig.siteKey){message.textContent='웹 검색 연결 설정 전입니다. 아래 Tavily 연결 설정 안내를 따라 주세요.';return;}
  clearChallenge();web.cancel();const current=++request,base=visibleItems.filter(x=>x.source!=='Tavily 웹 검색');
  draw(base,{loading:true});panel.setAttribute('aria-busy','true');message.textContent='웹에서 제품 후보를 찾고 있습니다…';
  try{const found=await web.search(lastMode,lastQuery);if(current!==request)return;draw([...base,...found]);message.textContent=lastMode==='barcode'?(found.length?'바코드 일치 '+found.length+'개 웹 후보 · 제품명·포장을 확인하고 선택하세요.':'웹 검색에서 바코드 일치 제품을 찾지 못했습니다. 제품명으로 검색하거나 직접 입력하세요.'):(found.length?'웹 검색 '+found.length+'개 후보 · 실제 제품을 확인하고 후보를 누르면 자동 입력됩니다.':'웹 검색에서도 후보를 찾지 못했습니다. 제품명을 추가하거나 직접 입력하세요.');}
  catch(error){if(current!==request||error.name==='AbortError')return;draw(base,{failed:true});message.textContent=error.message;}
  finally{if(current===request)panel.removeAttribute('aria-busy');}
 }
 async function search(mode){
  let query;try{query=mode==='barcode'?barcodeValue(field('바코드').value):lookupQuery(field('제품명').value);}catch(error){onStatus(error.message);field(mode==='barcode'?'바코드':'제품명').focus();return;}
  close();const current=++request;lastMode=mode;lastQuery=query;panel.hidden=false;panel.setAttribute('aria-busy','true');preview.hidden=true;
  const local=localCandidates(getRecords(),mode,query);draw(local,{loading:true});message.textContent=(local.length?'내 기록 '+local.length+'개 확인 · ':'')+'공개 제품정보 조회 중…';
  try{const remote=await client.search(mode,query);if(current!==request)return;const items=[...local,...remote];draw(items);message.textContent=items.length?items.length+'개 후보 · 제품을 선택해 확인하세요.':'조회 완료 · Open Food Facts 등록 제품 없음';if(!items.length&&webConfig.endpoint&&webConfig.siteKey)await searchWeb();}
  catch(error){if(current!==request||error.name==='AbortError')return;draw(local,{failed:true});message.textContent=error.message+(local.length?' 내 기록의 후보는 사용할 수 있습니다.':'');}
  finally{if(current===request)panel.removeAttribute('aria-busy');}
 }
 document.getElementById('lookup-name').onclick=()=>search('name');document.getElementById('lookup-barcode').onclick=()=>search('barcode');document.getElementById('close-lookup').onclick=close;
 form.addEventListener('input',event=>{if(['name','barcode'].includes(event.target.id)&&!panel.hidden)close();});
 return {search,close};
}
