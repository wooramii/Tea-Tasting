import {externalSearchLinks} from './search-links.mjs';
import {safeUrl} from './core.mjs';
import {ProductLookup,barcodeValue,lookupQuery,localCandidates,importedFields,mergeProductInfo} from './lookup.mjs';

export function initProductLookup({form,getRecords,onDirty,onStatus}){
 const panel=document.getElementById('lookup-panel'),message=document.getElementById('lookup-status'),list=document.getElementById('lookup-results'),preview=document.getElementById('lookup-preview');
 const client=new ProductLookup();let request=0,lastMode='name',lastQuery='';
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const link=(label,url)=>{const a=node('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const field=key=>form.elements.namedItem(key);
 function close(){request++;client.cancel();panel.hidden=true;list.replaceChildren();preview.replaceChildren();panel.removeAttribute('aria-busy');}
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
   const current=Object.fromEntries(new FormData(form)),chosen=choices.filter(c=>c.checked).map(c=>c.dataset.field),merged=mergeProductInfo(current,candidate,chosen);
   if(!merged.applied.length){message.textContent='불러올 항목을 하나 이상 선택하세요.';return;}
   for(const key of [...merged.applied,'제품정보출처','제품정보조회일','제품정보반영항목'])if(field(key))field(key).value=merged.record[key]||'';
   const ingredients=field('원재료표기');if(ingredients){ingredients.style.height='auto';ingredients.style.height=Math.max(90,ingredients.scrollHeight)+'px';}
   onDirty();onStatus(merged.applied.length+'개 제품정보를 불러왔습니다. 분류와 실제 포장을 확인하고 테이스팅 저장을 누르세요.');close();document.getElementById('product-extra').open=true;field('제품명').focus();
  });apply.className='primary';actions.append(apply,button('후보 목록으로',()=>{preview.hidden=true;list.hidden=false;}));preview.append(actions);list.hidden=true;
 }
 function draw(items,{loading=false,failed=false}={}){list.replaceChildren();list.hidden=false;preview.hidden=true;for(const item of items){const b=button('',()=>choose(item)),r=item.record;b.className='lookup-candidate';b.append(node('strong',r['제품명']||'제품명 미등록'),node('small',[r['브랜드'],r['용량'],r['바코드']].filter(Boolean).join(' · ')),node('small',item.source));list.append(b);}if(!items.length&&!loading){list.append(node('p',failed?'외부 조회를 완료하지 못했습니다. 입력한 내용은 그대로 유지됩니다.':'내 기록과 Open Food Facts에서 찾지 못했습니다. 아래 사이트에서도 검색하거나 직접 입력하세요.','help'));}if(lastQuery){const searches=node('div',null,'external-searches');for(const item of externalSearchLinks(lastQuery))searches.append(link(item.label,item.url));list.append(searches,node('p','외부 검색화면을 새 탭으로 엽니다. 결과는 자동 입력되지 않으므로 확인 후 직접 기록하세요.','help'));}attribution(list);}
 async function search(mode){
  let query;try{query=mode==='barcode'?barcodeValue(field('바코드').value):lookupQuery(field('제품명').value);}catch(error){onStatus(error.message);field(mode==='barcode'?'바코드':'제품명').focus();return;}
  close();const current=++request;lastMode=mode;lastQuery=query;panel.hidden=false;panel.setAttribute('aria-busy','true');preview.hidden=true;
  const local=localCandidates(getRecords(),mode,query);draw(local,{loading:true});message.textContent=(local.length?'내 기록 '+local.length+'개 확인 · ':'')+'공개 제품정보 조회 중…';
  try{const remote=await client.search(mode,query);if(current!==request)return;const items=[...local,...remote];draw(items);message.textContent=items.length?items.length+'개 후보 · 제품을 선택해 확인하세요.':'조회 완료 · Open Food Facts 등록 제품 없음';}
  catch(error){if(current!==request||error.name==='AbortError')return;draw(local,{failed:true});message.textContent=error.message+(local.length?' 내 기록의 후보는 사용할 수 있습니다.':'');}
  finally{if(current===request)panel.removeAttribute('aria-busy');}
 }
 document.getElementById('lookup-name').onclick=()=>search('name');document.getElementById('lookup-barcode').onclick=()=>search('barcode');document.getElementById('close-lookup').onclick=close;
 form.addEventListener('input',event=>{if(['name','barcode'].includes(event.target.id)&&!panel.hidden)close();});
 return {search,close};
}
