import {safeUrl} from './core.mjs';
import {barcodeValue,lookupQuery,importedFields} from './lookup.mjs';

export class WebProductLookup{
 constructor({endpoint='',getToken,fetcher=(url,options)=>globalThis.fetch(url,options)}){Object.assign(this,{endpoint,getToken,fetcher});this.cache=new Map();this.controller=null;this.sequence=0;}
 cancel(){this.sequence++;this.controller?.abort();this.controller=null;}
 async search(mode,value,context,refresh=false){
  const query=mode==='barcode'?barcodeValue(value):lookupQuery(value),key=mode+':'+query+JSON.stringify(context||{});
  this.cancel();const sequence=this.sequence,cached=this.cache.get(key);
  if(!refresh&&cached&&Date.now()-cached.time<600000)return cached.items;
  if(!safeUrl(this.endpoint))throw Error('웹 검색 연결 설정 전입니다. Tavily 연결 안내를 확인하세요.');
  const token=await this.getToken();if(sequence!==this.sequence)throw new DOMException('취소됨','AbortError');
  const controller=new AbortController();this.controller=controller;const timer=setTimeout(()=>controller.abort(),38000);
  try{
   const response=await this.fetcher(this.endpoint,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,query,token,...(context?{context}:{})}),signal:controller.signal});
   if(sequence!==this.sequence)throw new DOMException('취소됨','AbortError');
   if(!response.ok){const messages={400:'검색어가 올바르지 않습니다.',403:'검색 확인이 만료되었거나 사이트 설정이 맞지 않습니다. 다시 조회하세요.',429:'웹 검색 사용량에 도달했습니다. 잠시 후 다시 조회하세요.',503:'웹 검색 연결 설정을 확인해 주세요.',504:'웹 검색 응답이 늦습니다. 다시 조회하세요.'};throw Error(messages[response.status]||'웹 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 조회하세요.');}
   const data=await response.json();if(sequence!==this.sequence)throw new DOMException('취소됨','AbortError');
   if(!Array.isArray(data.items))throw Error('웹 검색 응답 형식이 올바르지 않습니다.');
   const items=data.items.slice(0,5).flatMap((item,index)=>{
    // 이전 서버가 무관한 결과를 반환해도 바코드 후보로 노출하지 않습니다.
    if(mode==='barcode'&&(item.record?.['바코드']!==query||item.barcodeMatch?.code!==query||item.barcodeMatch?.method!=='source-field'))return [];
    const source=safeUrl(item.record?.['제품정보출처']);if(!source)return [];
    const record={};for(const field of importedFields){const value=item.record?.[field];if(typeof value==='string')record[field]=value.slice(0,field==='원재료표기'?10000:2000);}
    for(const field of ['이미지URL','구매URL'])if(record[field])record[field]=safeUrl(record[field]);
    if(!record['제품명'])return [];
    const officialFields=[];
    if(Array.isArray(item.officialFields)){
     for(const field of ['원재료표기','용량']){
      if(!record[field]||!item.officialFields.includes(field))continue;
      const officialUrl=safeUrl(item.fieldSources?.[field]);
      if(!officialUrl)continue;
      if(record['공식몰상품고시URL']&&record['공식몰상품고시URL']!==officialUrl)continue;
      record['공식몰상품고시URL']=officialUrl;
      officialFields.push(field);
     }
    }
    record['제품정보출처']=source;record['제품정보조회일']=new Date().toISOString();
    return [{id:'web-'+index,source:'Tavily 웹 검색',record,officialFields,...(mode==='barcode'?{barcodeMatch:item.barcodeMatch}:{}),summary:String(item.summary||'').slice(0,500),warning:String(item.warning||'실제 제품과 용량을 확인하세요.').slice(0,300)}];
   });
   this.cache.set(key,{time:Date.now(),items});if(this.cache.size>20)this.cache.delete(this.cache.keys().next().value);return items;
  }catch(error){if(error.name==='AbortError'&&sequence===this.sequence)throw Error('웹 검색 응답 시간이 초과되었습니다. 다시 조회하세요.');if(error instanceof TypeError)throw Error('웹 검색에 연결하지 못했습니다. 인터넷과 중계 주소를 확인하세요.');throw error;}
  finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
 }
}

let turnstilePromise;
export function loadTurnstile(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(!turnstilePromise)turnstilePromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  const timer=setTimeout(()=>{script.remove();reject(Error('검색 확인 기능을 불러오지 못했습니다. 다시 조회하세요.'));},15000);
  script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):reject(Error('검색 확인 기능을 사용할 수 없습니다.'));};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('검색 확인 기능이 차단되었습니다. 인터넷과 브라우저 설정을 확인하세요.'));};document.head.append(script);
 }).catch(error=>{turnstilePromise=null;throw error;});return turnstilePromise;
}
