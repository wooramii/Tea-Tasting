import {externalSearchLinks,barcodeDatabaseLinks,gs1SearchUrl} from './search-links.mjs';
import {WebProductLookup,loadTurnstile} from './web-product.mjs';
import {safeUrl} from './core.mjs';
import {ProductLookup,barcodeValue,combinedLookup,localCandidates,importedFields} from './lookup.mjs';

export function initProductLookup({form,queryForm,getRecords,onApply,onStatus,webConfig=window.TEA_WEB_SEARCH||{},loadChallenge=loadTurnstile,webFetch,publicClient=new ProductLookup()}){
 const panel=document.getElementById('lookup-panel'),message=document.getElementById('lookup-status'),list=document.getElementById('lookup-results');
 let request=0,last=null,visibleItems=[],widget=null,challenge=null,rejectChallenge=null,challengeTimer=null,applying=false,chosenId='';
 const web=new WebProductLookup({endpoint:webConfig.endpoint,getToken:tokenForSearch,...(webFetch?{fetcher:webFetch}:{})});
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const link=(label,url)=>{const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const field=key=>queryForm.elements.namedItem(key);
 const fieldLabel=key=>({'이미지URL':'대표사진','구매URL':'판매 링크','원재료표기':'원재료명'}[key]||key);
 const canSearchWeb=()=>Boolean(webConfig.endpoint&&webConfig.siteKey);
 function clearChallenge(){clearTimeout(challengeTimer);rejectChallenge?.(new DOMException('취소됨','AbortError'));rejectChallenge=null;if(widget!=null){challenge?.remove(widget);widget=null;}}
 function close(){chosenId='';request++;publicClient.cancel();web.cancel();clearChallenge();panel.hidden=true;list.replaceChildren();panel.removeAttribute('aria-busy');}
 async function tokenForSearch(){
  const current=request;message.textContent='웹 검색을 위한 확인 중입니다. 필요한 경우 아래 확인을 완료하세요.';
  challenge=await loadChallenge();if(current!==request)throw new DOMException('취소됨','AbortError');
  const container=node('div');container.className='web-challenge';list.append(container);
  return new Promise((resolve,reject)=>{
   rejectChallenge=reject;const finish=(error,token)=>{clearTimeout(challengeTimer);rejectChallenge=null;if(widget!=null){challenge.remove(widget);widget=null;}container.remove();error?reject(error):resolve(token);};
   challengeTimer=setTimeout(()=>finish(Error('검색 확인이 오래 걸립니다. 웹 검색을 다시 누르거나 확인 기능 차단 여부를 확인하세요.')),30000);
   widget=challenge.render(container,{sitekey:webConfig.siteKey,action:'tea_search',language:'ko',size:'compact',callback:token=>finish(null,token),'error-callback':()=>finish(Error('검색 확인이 실패했습니다. 다시 조회하세요.')),'expired-callback':()=>finish(Error('검색 확인이 만료되었습니다. 다시 조회하세요.')),'timeout-callback':()=>finish(Error('검색 확인 시간이 지났습니다. 다시 조회하세요.'))});
  });
 }
 async function choose(candidate){
  if(applying)return;applying=true;
  try{
   const r={...candidate.record};
   if(candidate.source!=='내 기록'){
    const officialFields=candidate.officialFields||[];
    r['제품정보반영항목']=importedFields.filter(k=>r[k]).map(k=>fieldLabel(k)+(officialFields.includes(k)?' (공식몰)':'')).join(', ');
   }
   const accepted=await onApply({...candidate,record:r});if(accepted){chosenId=candidate.id;message.textContent='제품정보를 채웠습니다. 가운데 내용을 확인하고 저장하세요.';list.querySelectorAll('[data-candidate-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.candidateId===candidate.id)));}
  }finally{applying=false;}
 }
 function attribution(parent){const p=node('p',null,'lookup-source');p.append('출처: ',link('Open Food Facts','https://world.openfoodfacts.org/'),' · ',link('ODbL / DbCL','https://world.openfoodfacts.org/terms-of-use'),' · ',link('이미지 CC BY-SA','https://creativecommons.org/licenses/by-sa/3.0/'));parent.append(p);}
 function draw(items,{loading=false,failed=false,webLoading=false}={}){
  visibleItems=items;list.replaceChildren();
  for(const item of items){const r=item.record,b=button('',()=>choose(item));b.className='lookup-candidate';b.dataset.candidateId=item.id;b.setAttribute('aria-pressed',String(item.id===chosenId));
   if(safeUrl(r['이미지URL'])){const img=node('img');img.src=safeUrl(r['이미지URL']);img.alt='';img.referrerPolicy='no-referrer';img.className='candidate-image';img.onerror=()=>img.remove();b.append(img);}
   b.append(node('strong',r['제품명']||'제품명 미등록'),node('small',[r['브랜드'],r['용량'],r['바코드']].filter(Boolean).join(' · ')),node('small',item.source));
   if(item.warning)b.append(node('small',item.warning));
   b.append(node('small','선택 시 자동 입력: '+importedFields.filter(k=>r[k]).map(fieldLabel).join(' · '),'candidate-fields'));
   if(item.officialFields?.length)b.append(node('small','공식몰 상품고시: '+item.officialFields.map(fieldLabel).join(' · ')));
   list.append(b);
   if(safeUrl(r['제품정보출처']))list.append(link('후보 원문 확인',safeUrl(r['제품정보출처'])));
   const officialUrl=safeUrl(r['공식몰상품고시URL']);
   if(officialUrl&&officialUrl!==safeUrl(r['제품정보출처']))list.append(' · ',link('공식몰 상품고시 확인',officialUrl));
  }
  if(!items.length&&!loading)list.append(node('p',failed?'외부 조회를 완료하지 못했습니다. 입력은 유지됩니다. 다시 조회하거나 직접 등록하세요.':last?.mode==='barcode'?'일치 제품 없음 · 입력한 바코드가 확인된 제품만 표시합니다. 번호를 확인하거나 바코드를 비우고 제품명으로 검색하세요.':'제품 후보가 없습니다. 검색어를 바꾸거나 직접 등록하세요.','help'));
  if(last){const more=button(webLoading?'웹에서 검색 중…':'웹에서도 제품 찾기',()=>searchWeb(true));more.disabled=webLoading;list.append(more);
   if(!canSearchWeb())list.append(link('Tavily 연결 설정 안내','tavily-setup.html'));
   if(last.mode==='barcode'){const databases=node('div',null,'external-searches');for(const item of barcodeDatabaseLinks(last.query))databases.append(link(item.label,item.url));list.append(databases,node('p','GS1 결과는 새 탭에서 확인합니다. 차곡에 자동 입력되지 않습니다.','help'));}
   const searches=node('div',null,'external-searches');for(const item of externalSearchLinks(last.mode==='barcode'?last.query:last.query))searches.append(link(item.label,item.url));list.append(searches,node('p','외부 검색 단추는 새 탭을 엽니다. 위 후보를 선택하면 확인된 제품정보가 자동 입력됩니다.','help'));
  }
  if(items.some(item=>item.source==='Open Food Facts'))attribution(list);
 }
 async function searchWeb(refresh=false){
  if(!last)return;
  if(!canSearchWeb()){message.textContent='웹 검색 연결 설정 전입니다. Tavily 연결 안내를 확인하세요.';return;}
  clearChallenge();publicClient.cancel();web.cancel();const current=++request,base=visibleItems.filter(x=>x.source!=='Tavily 웹 검색');
  draw(base,{loading:true,webLoading:true});panel.setAttribute('aria-busy','true');message.textContent='웹에서 제품 후보를 찾고 있습니다…';
  try{const found=await web.search(last.mode,last.query,last.context,refresh);if(current!==request)return;draw([...base,...found]);message.textContent=found.length?found.length+'개 웹 후보 · 실제 제품과 포장을 확인하고 선택하세요.':last.mode==='barcode'?'웹 검색에서 바코드 일치 제품을 찾지 못했습니다.':'웹 검색에서도 후보를 찾지 못했습니다. 검색어를 바꾸거나 직접 등록하세요.';}
  catch(error){if(current!==request||error.name==='AbortError')return;draw(base,{failed:true});message.textContent=error.message;}
  finally{if(current===request)panel.removeAttribute('aria-busy');}
 }
 async function search(){
  let query;try{query=combinedLookup(Object.fromEntries(new FormData(queryForm)));}catch(error){onStatus(error.message);field(field('바코드').value?'바코드':'제품명').focus();return;}
  close();const current=++request;last=query;panel.hidden=false;panel.setAttribute('aria-busy','true');
  const local=localCandidates(getRecords(),last.mode,last.query).filter(x=>!last.context.category||x.record['분류']===last.context.category);draw(local,{loading:true});message.textContent=(local.length?'내 기록 '+local.length+'개 · ':'')+'공개 제품정보 조회 중…';
  try{const remote=await publicClient.search(last.mode,last.query);if(current!==request)return;const items=[...local,...remote];draw(items);message.textContent=items.length?items.length+'개 후보 · 선택하면 제품정보를 채웁니다.':'Open Food Facts에 등록된 제품이 없습니다.';if(!items.length&&canSearchWeb())await searchWeb(false);}
  catch(error){if(current!==request||error.name==='AbortError')return;if(!local.length&&canSearchWeb()){await searchWeb(false);return;}draw(local,{failed:true});message.textContent=error.message+(local.length?' 내 기록의 후보는 사용할 수 있습니다.':' 아래 웹 검색을 이용하거나 다시 조회하세요.');}
  finally{if(current===request)panel.removeAttribute('aria-busy');}
 }
 queryForm.onsubmit=event=>{event.preventDefault();search();};document.getElementById('close-lookup').onclick=close;
 const copyButton=document.getElementById('copy-barcode');copyButton.onclick=async()=>{
  let code;try{code=barcodeValue(field('바코드').value);}catch(error){onStatus(error.message);field('바코드').focus();return;}
  copyButton.disabled=true;try{await navigator.clipboard.writeText(code);onStatus('바코드 '+code+'를 복사했습니다.');}catch{field('바코드').focus();field('바코드').select();onStatus('복사를 허용하지 않아 입력칸을 선택했습니다. Ctrl+C 또는 기기의 복사 메뉴를 사용하세요.');}finally{copyButton.disabled=false;}
 };
 document.getElementById('lookup-gs1').onclick=()=>{try{window.open(gs1SearchUrl(field('바코드').value),'_blank','noopener,noreferrer');onStatus('GS1에서 바코드를 확인하세요. 결과는 차곡에 자동 입력되지 않습니다.');}catch(error){onStatus(error.message);field('바코드').focus();}};
 for(const event of ['input','change'])queryForm.addEventListener(event,()=>{if(!panel.hidden)close();});
 return {search,close};
}
