import {barcodeValue} from './lookup.mjs';
export function externalSearchLinks(value){const query=String(value).trim().slice(0,100);if(!query)return [];return [['Google 검색','https://www.google.com/search','q'],['네이버 검색','https://search.naver.com/search.naver','query'],['쿠팡 검색','https://www.coupang.com/np/search','q']].map(([label,base,key])=>{const url=new URL(base);url.searchParams.set(key,query);return {label,url:url.href};});}
export function gs1SearchUrl(value){const url=new URL('https://www.gs1.org/services/verified-by-gs1/results');url.searchParams.set('gtin',barcodeValue(value));return url.href;}
export function barcodeDatabaseLinks(code){try{return [{label:'GS1 바코드 조회',url:gs1SearchUrl(code)}];}catch{return [];}}
