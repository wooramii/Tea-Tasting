import {safeUrl,productKey} from './core.mjs';

export const importedFields=['제품명','브랜드','바코드','용량','원재료표기','이미지URL','구매URL','판매가격','판매가격확인일'];
const fields=['code','product_name','product_name_ko','product_name_en','brands','quantity','ingredients_text','ingredients_text_ko','ingredients_text_en','image_front_url'];
const service='https://world.openfoodfacts.org';
const identity='Chagok/1.1 (https://wooramii.github.io/Tea-Tasting/)';

export function barcodeValue(value){
 const code=String(value).normalize('NFKC').replace(/[\s-]/g,'');
 if(!/^(?:\d{8}|\d{12,14})$/.test(code))throw Error('바코드는 숫자 8·12·13·14자리로 입력하세요.');
 let sum=0;for(let i=code.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(code[i])*weight;
 if((10-sum%10)%10!==Number(code.at(-1)))throw Error('바코드의 검증 숫자가 맞지 않습니다. 숫자를 다시 확인하세요.');
 return code;
}
export function lookupQuery(value){const query=String(value).normalize('NFKC').trim().replace(/\s+/g,' ');if(query.length<2||query.length>100)throw Error('제품명은 2~100자로 입력하세요. 브랜드명과 영문명을 함께 써도 좋습니다.');return query;}
export function combinedLookup(source){
 const context={name:String(source['제품명']||'').normalize('NFKC').trim(),brand:String(source['브랜드']||'').normalize('NFKC').trim(),category:String(source['분류']||'')};
 if(context.name.length>100||context.brand.length>100)throw Error('제품명과 브랜드는 각각 100자 이하로 입력하세요.');
 if(context.category&&!['티백','RTD','분말','잎차'].includes(context.category))throw Error('분류를 확인하세요.');
 if(String(source['바코드']||'').trim())return {mode:'barcode',query:barcodeValue(source['바코드']),context};
 if(!context.name&&!context.brand)throw Error('제품명·브랜드·바코드 중 하나를 입력하세요. 분류만으로는 제품을 찾기 어렵습니다.');
 return {mode:'name',query:lookupQuery([context.name,context.brand,context.category].filter(Boolean).join(' ')),context};
}
const clean=(value,max=1000)=>typeof value==='string'?value.trim().slice(0,max):'';
export function offCandidate(product,at=new Date().toISOString()){
 const code=clean(String(product.code??''),40);if(!/^\d{8,14}$/.test(code))return null;
 const record={'제품명':clean(product.product_name_ko||product.product_name||product.product_name_en,200),'브랜드':clean(product.brands,150),'바코드':code,'용량':clean(product.quantity),'원재료표기':clean(product.ingredients_text_ko||product.ingredients_text||product.ingredients_text_en,10000),'이미지URL':safeUrl(product.image_front_url),'제품정보출처':service+'/product/'+code,'제품정보조회일':at};
 return {id:'off-'+code,source:'Open Food Facts',record};
}
export function localCandidates(records,mode,query){
 const words=query.toLocaleLowerCase('ko-KR').split(/\s+/),found=new Map();
 for(const r of [...records].sort((a,b)=>String(b['테이스팅일']).localeCompare(String(a['테이스팅일'])))){
  const match=mode==='barcode'?String(r['바코드']).normalize('NFKC').replace(/[\s-]/g,'')===query:words.every(w=>(r['제품명']+' '+r['브랜드']+' '+r['분류']).normalize('NFKC').toLocaleLowerCase('ko-KR').includes(w));
  if(match&&!found.has(productKey(r)))found.set(productKey(r),{id:'local-'+r.id,source:'내 기록',record:r});
 }
 return [...found.values()].slice(0,8);
}
export function mergeProductInfo(current,candidate,chosen){
 const next={...current},applied=[];
 for(const key of importedFields){if(!chosen.includes(key)||!candidate.record[key])continue;const value=candidate.record[key];if(['이미지URL','구매URL'].includes(key)&&!safeUrl(value))continue;next[key]=value;applied.push(key);}
 if(applied.length){next['제품정보출처']=safeUrl(candidate.record['제품정보출처']);next['제품정보조회일']=candidate.record['제품정보조회일']||'';next['제품정보반영항목']=applied.join(', ');}
 return {record:next,applied};
}

export class ProductLookup{
 constructor(fetcher=(url,options)=>globalThis.fetch(url,options),clock=()=>Date.now()){this.fetcher=fetcher;this.clock=clock;this.cache=new Map();this.last={};this.controller=null;this.sequence=0;}
 cancel(){this.sequence++;this.controller?.abort();this.controller=null;}
 async search(mode,value){
  const query=mode==='barcode'?barcodeValue(value):lookupQuery(value),key=mode+':'+query;
  this.cancel();const sequence=this.sequence,cached=this.cache.get(key),now=this.clock();
  if(cached&&now-cached.time<600000)return cached.items;
  const gap=mode==='barcode'?4200:6200;
  if(this.last[mode]!=null&&now-this.last[mode]<gap)throw Error('연속 조회를 줄이기 위해 '+Math.ceil((gap-now+this.last[mode])/1000)+'초 후 다시 조회해 주세요.');
  // ponytail: 공식 일반검색은 아직 legacy endpoint. Search-a-licious가 안정화되면 교체합니다.
  const url=new URL(mode==='barcode'?'/api/v3/product/'+query+'.json':'/cgi/search.pl',service);
  url.searchParams.set('fields',fields.join(','));url.searchParams.set('User-Agent',identity);
  if(mode!=='barcode'){url.searchParams.set('search_terms',query);url.searchParams.set('search_simple','1');url.searchParams.set('action','process');url.searchParams.set('json','1');url.searchParams.set('page_size','8');}
  this.last[mode]=now;const controller=new AbortController();this.controller=controller;let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},20000);
  try{
   const response=await this.fetcher(url.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(sequence!==this.sequence)throw new DOMException('취소됨','AbortError');
   if(response.status===404&&mode==='barcode')return [];
   if(response.status===429)throw Error('공개 데이터베이스의 조회 한도에 도달했습니다. 잠시 후 다시 조회하세요.');
   if(!response.ok)throw Error('제품정보 서비스 응답 오류 ('+response.status+'). 잠시 후 다시 조회하거나 직접 입력하세요.');
   const data=await response.json();if(sequence!==this.sequence)throw new DOMException('취소됨','AbortError');
   const products=mode==='barcode'?(data.product?[data.product]:[]):data.products;
   if(!Array.isArray(products))throw Error('제품정보 응답 형식을 읽을 수 없습니다. 직접 입력하거나 나중에 다시 조회하세요.');
   const items=[],seen=new Set();for(const product of products){const item=offCandidate(product);if(item&&(mode!=='barcode'||item.record['바코드']===query)&&!seen.has(item.id)){seen.add(item.id);items.push(item);}}
   this.cache.set(key,{time:this.clock(),items:items.slice(0,8)});if(this.cache.size>50)this.cache.delete(this.cache.keys().next().value);
   return items.slice(0,8);
  }catch(error){if(timedOut)throw Error('조회 응답이 늦어 중단했습니다. 잠시 후 다시 조회하거나 직접 입력하세요.');if(error.name==='AbortError')throw error;if(error instanceof TypeError)throw Error('제품정보 서비스에 연결하지 못했습니다. 인터넷 연결을 확인하거나 직접 입력하세요.');throw error;}
  finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
 }
}
