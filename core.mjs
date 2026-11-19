export const metrics = ['과일향','꽃향','허브향','로스팅 풍미','단맛','신맛','떫은맛'];
const legacyMetrics = ['시트러스','플로럴','과일','풀·허브','로스팅','단맛','산미','쓴맛','떫은맛','바디','향 지속성'];
export const legacyColumns = ['id','제품명','브랜드','분류','바코드','테이스팅일','가격_원','용량','블렌딩','추출조건','향미태그','테이스팅노트','개발참고','이미지URL','구매URL',...legacyMetrics,'기록시각'];
// 기존 시트 열 위치를 보존하고 새 열만 추가합니다.
export const rtdFields = ['Brix','pH','산도','산도기준'];
export const previousColumns = [...legacyColumns,...metrics.filter(k=>!legacyColumns.includes(k)),...rtdFields];
export const productInfoFields=['원재료표기','제품정보출처','제품정보조회일','제품정보반영항목'];
export const columns = [...previousColumns,...productInfoFields];
export function normalizeRecord(source){const r=Object.fromEntries(columns.map(k=>[k,String(source[k]??'')]));for(const [key,old] of Object.entries({'과일향':'과일','꽃향':'플로럴','허브향':'풀·허브','로스팅 풍미':'로스팅','신맛':'산미'}))if(source[key]==null)r[key]=String(source[old]??'');return r;}
export function validateRTD(r){if(r['분류']!=='RTD')return '';for(const [key,max] of [['Brix',100],['pH',14],['산도',100]]){const value=r[key];if(value!=null&&value!==''&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max))return key+' 값은 0~'+max+' 범위의 숫자로 입력하세요.';}if(r['산도']!==''&&r['산도']!=null&&!r['산도기준']?.trim())return '산도의 환산 기준을 입력하세요. 예: 구연산 환산 % (g/100mL)';return '';}
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());}
export function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function validate(r){if(!r['제품명']?.trim())return '제품명을 입력하세요.';if(!validDate(r['테이스팅일']))return '테이스팅 날짜를 확인하세요.';if(!['티백','RTD','분말','잎차'].includes(r['분류']))return '분류를 확인하세요.';if(r['가격_원']!==''&&(!Number.isFinite(Number(r['가격_원']))||Number(r['가격_원'])<0))return '가격은 0 이상 숫자로 입력하세요.';for(const m of metrics)if(r[m]!==''&&r[m]!=null&&(!Number.isInteger(Number(r[m]))||Number(r[m])<1||Number(r[m])>9))return m+'은 1~9점 또는 미평가로 입력하세요.';for(const k of ['이미지URL','구매URL','제품정보출처'])if(r[k]&&!safeUrl(r[k]))return k+'은 https 주소로 입력하세요.';return '';}
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}}
export function toRow(r){const normalized=normalizeRecord(r);return columns.map(k=>normalized[k]);}
export function fromRows(rows){if(!rows?.length)return [];const header=rows[0];if(![columns,previousColumns,legacyColumns].some(c=>JSON.stringify(header)===JSON.stringify(c)))throw Error('시트의 열 제목 또는 순서가 변경되었습니다. 원래대로 복원하세요.');const result=[],ids=new Set();for(let i=1;i<rows.length;i++){if(!rows[i].some(x=>x!==''))continue;const r=normalizeRecord(Object.fromEntries(header.map((k,j)=>[k,rows[i][j]??''])));const error=validate(r)||validateRTD(r);if(error||!r.id||ids.has(r.id))throw Error('시트 '+(i+1)+'행 확인: '+(error||'id는 비어 있지 않은 고유한 값이어야 합니다.'));ids.add(r.id);result.push(r);}return result;}
export function similarity(a,b){const keys=metrics.filter(k=>a[k]!==''&&a[k]!=null&&b[k]!==''&&b[k]!=null);if(!keys.length)return null;return {score:Math.round(100*(1-Math.sqrt(keys.reduce((sum,k)=>sum+(Number(a[k])-Number(b[k]))**2,0)/keys.length)/8)),count:keys.length};}
export function productKey(r){return r['바코드']?r['분류']+'|'+r['바코드']:r['분류']+'|'+r['브랜드'].trim().toLowerCase()+'|'+r['제품명'].trim().toLowerCase();}
export function sheetColumn(index){let result='';for(let n=index;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function schemaUpgrade(rows){
 fromRows(rows);
 if(!rows.length||JSON.stringify(rows[0])===JSON.stringify(columns))return null;
 const header=rows[0];
 return {header:[...columns],firstColumn:sheetColumn(header.length+1),values:rows.slice(1).map(row=>row.some(x=>x!=='')?toRow(Object.fromEntries(header.map((k,i)=>[k,row[i]??'']))).slice(header.length):Array(columns.length-header.length).fill(''))};
}

