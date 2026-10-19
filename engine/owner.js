/* 站長帳號：名字保留，只有知道站長密碼的人能登入，登入後固定為最高等級 imm。
 * 這裡只放 PBKDF2-SHA256 雜湊；hash 空白時，這個名字一律不能登入（保留）。
 * 由「設定站長密碼.cmd」產生，不要手改。 */
(function(R){
R.OWNER={name:'Jye',salt:'944e221e53756272f6301d0cb0eba173',iter:310000,hash:'72496691196464fbca13474a32015c5f8a43f4226b4faefe7cb1804c2d9c8439'};
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex=s=>new Uint8Array((s.match(/../g)||[]).map(x=>parseInt(x,16)));
R.isOwnerName=n=>!!R.OWNER&&R.lc(n)===R.lc(R.OWNER.name);
R.ownerCheck=async pw=>{
  const o=R.OWNER;if(!o||!o.hash||!pw)return false;
  try{
    const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
    const b=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(o.salt),iterations:o.iter},k,256);
    return hex(b)===o.hash;
  }catch(e){return false;}
};
})(ROC);
