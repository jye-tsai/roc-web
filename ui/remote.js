/* remote.js — 連線版：透過 Cloudflare Worker（relay/worker.js）把 WebSocket 轉成 telnet，連到實體 MUD 站台
   - telnet：處理 IAC 協商（ECHO 開關＝密碼不顯示、SGA），其他選項一律拒絕
   - 編碼：自動偵測 UTF-8／Big5（收到第一段非 ASCII 時判斷），也可以手動切換
   - 介面：沿用終端機與方向鍵；狀態列從提示列「<生命N魔法N移動N>」解析 */
(function(){
const $=id=>document.getElementById(id);
const ls={get:k=>{try{return localStorage.getItem(k);}catch(e){return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}}};
const DEFAULT_RELAY='';   /* 部署好 Worker 後填這裡，例如 wss://roc-relay.xxx.workers.dev */
const IAC=255,DONT=254,DO=253,WONT=252,WILL=251,SB=250,SE=240,GA=249,ECHO=1,SGA=3;

let ws=null,enc=ls.get('roc.enc')||'auto',dec=null,tstate=0,tcmd=0,closedByUser=false;
const ascii=new TextDecoder('latin1');

/* ---- 編碼 ---- */
function makeDecoder(){dec=enc==='auto'?null:new TextDecoder(enc==='big5'?'big5':'utf-8');}
function decode(bytes){
  if(!bytes.length)return '';
  if(enc==='auto'){
    if(!bytes.some(b=>b>=0x80))return ascii.decode(bytes);
    try{new TextDecoder('utf-8',{fatal:true}).decode(bytes,{stream:true});enc='utf8';}catch(e){enc='big5';}
    Term.write('\x1b[1;30m[編碼自動判斷為 '+(enc==='big5'?'Big5':'UTF-8')+'，可按「編碼」切換]\x1b[m\n');
    makeDecoder();
  }
  return dec.decode(bytes,{stream:true});
}
/* Big5 編碼表：第一次送出中文時，用瀏覽器內建的 Big5 解碼器反推 */
let big5Map=null;
function buildBig5(){
  big5Map=new Map();const d=new TextDecoder('big5');
  for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){
    if(b>0x7e&&b<0xa1)continue;
    const c=d.decode(new Uint8Array([a,b]));
    if(c.length===1&&c!=='�'&&!big5Map.has(c))big5Map.set(c,[a,b]);
  }
}
function encode(s){
  if(enc!=='big5')return new TextEncoder().encode(s);
  if(!big5Map)buildBig5();
  const out=[];
  for(const c of s){const k=c.charCodeAt(0);if(k<0x80)out.push(k);else{const m=big5Map.get(c);if(m)out.push(m[0],m[1]);else out.push(0x3f);}}
  return new Uint8Array(out);
}

/* ---- telnet ---- */
function reply(...b){if(ws&&ws.readyState===1)ws.send(new Uint8Array(b));}
function telnet(data){
  const text=[];
  for(const b of data){
    if(tstate===0){if(b===IAC)tstate=1;else text.push(b);}
    else if(tstate===1){
      if(b===IAC){text.push(255);tstate=0;}
      else if(b>=WILL&&b<=DONT){tcmd=b;tstate=2;}
      else if(b===SB)tstate=3;
      else tstate=0;   /* GA、NOP 等單一指令 */
    }else if(tstate===2){
      const opt=b;tstate=0;
      if(tcmd===WILL){
        if(opt===ECHO){Conn.echo(false);reply(IAC,DO,ECHO);}   /* 站台要幫我們回顯＝輸入密碼，輸入框改成不顯示 */
        else if(opt===SGA)reply(IAC,DO,SGA);
        else reply(IAC,DONT,opt);
      }else if(tcmd===WONT){if(opt===ECHO){Conn.echo(true);reply(IAC,DONT,ECHO);}}
      else if(tcmd===DO)reply(IAC,WONT,opt);
    }else if(tstate===3){if(b===IAC)tstate=4;}
    else if(tstate===4){tstate=b===SE?0:3;}
  }
  return new Uint8Array(text);
}

/* ---- 狀態列：從提示列解析 ---- */
const maxSeen={hp:0,mp:0,mv:0};
function bar(cls,label,v,max){
  const p=max>0?Math.max(0,Math.min(100,v/max*100)):0;
  return '<div class="sb '+cls+'"><i style="width:'+p.toFixed(1)+'%"></i><span><b class="lb">'+label+' </b>'+v+'</span></div>';
}
function parsePrompt(txt){
  const t=txt.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');
  const m=[...t.matchAll(/生命\s*(-?\d+)(?:\/(\d+))?\s*魔法\s*(-?\d+)(?:\/(\d+))?\s*移動\s*(-?\d+)(?:\/(\d+))?/g)].pop();
  if(!m)return;
  const hp=+m[1],mp=+m[3],mv=+m[5];
  /* 沒有上限就用看過的最大值當上限（只是畫血條的比例） */
  const H=+m[2]||(maxSeen.hp=Math.max(maxSeen.hp,hp)),M=+m[4]||(maxSeen.mp=Math.max(maxSeen.mp,mp)),V=+m[6]||(maxSeen.mv=Math.max(maxSeen.mv,mv));
  const el=$('stat');el.innerHTML=bar('hp','生命',hp,H)+bar('mp','魔法',mp,M)+bar('mv','移動',mv,V)+'<div class="si">連線中</div>';el.classList.add('on');
}

/* ---- 可點的字：括號裡的英文關鍵字 → 看；look xxx／help xxx → 直接送 ---- */
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function linkify(h){
  h=h.replace(/\b((?:look|help) [A-Za-z](?:[A-Za-z0-9']*[A-Za-z0-9])?)/gi,m=>'<u class="lk cmd" data-cmd="'+m.toLowerCase()+'">'+m+'</u>');
  h=h.replace(/\(([A-Za-z][A-Za-z' -]{1,30})\)/g,(m,kw)=>'(<u class="lk obj" data-look="'+esc(kw.split(/\s+/)[0].toLowerCase())+'">'+kw+'</u>)');
  return h;
}

/* ---- 連線 ---- */
function relayUrl(){
  const q=new URLSearchParams(location.search).get('relay');
  if(q){ls.set('roc.relay',q);return q;}
  return ls.get('roc.relay')||DEFAULT_RELAY;
}
function connect(){
  let url=relayUrl();
  if(!url){
    url=prompt('請輸入轉接器（Cloudflare Worker）網址，例如 wss://roc-relay.xxx.workers.dev');
    if(!url)return Term.write('\x1b[1;33m沒有轉接器網址，無法連線。\x1b[m\n');
    ls.set('roc.relay',url);
  }
  /* 網址整理：沒寫開頭就補 wss://、https→wss（手機常自動把第一個字母變大寫） */
  url=url.trim().replace(/\/+$/,'');
  if(/^https?:\/\//i.test(url))url=url.replace(/^http/i,'ws');else if(!/^wss?:\/\//i.test(url))url='wss://'+url;
  url=url.replace(/^wss?/i,m=>m.toLowerCase());
  Term.write('\x1b[1;30m連線到 '+url+' …\x1b[m\n');
  closedByUser=false;tstate=0;enc=ls.get('roc.enc')||'auto';makeDecoder();
  ws=new WebSocket(url);ws.binaryType='arraybuffer';
  ws.onopen=()=>{Term.write('\x1b[1;32m[已連上轉接器，等待站台回應…]\x1b[m\n');setState(true);};
  ws.onmessage=e=>{
    if(typeof e.data==='string'&&e.data.startsWith('\0relay:')){Term.write('\x1b[1;30m[轉接器] '+e.data.slice(7)+'\x1b[m\n');return;}
    const raw=typeof e.data==='string'?new TextEncoder().encode(e.data):new Uint8Array(e.data);
    const txt=decode(telnet(raw));
    if(txt){Term.write(txt);parsePrompt(txt);}
  };
  ws.onclose=e=>{setState(false);Term.write('\n\x1b[1;33m[連線中斷'+(e.reason?'：'+e.reason:'')+']\x1b[m\n');Conn.echo(true);};
  ws.onerror=()=>Term.write('\x1b[1;31m[連線錯誤：請確認轉接器網址，以及站台是否開著]\x1b[m\n');
}
function setState(on){
  $('choices').innerHTML=on?'':'<button data-r="connect" class="pri">重新連線</button><button data-r="relay">更換轉接器網址</button><button data-r="local">回單機版</button>';
  $('choices').classList.toggle('on',!on);
  document.body.classList.toggle('playing',on);
}

/* ---- 快捷鍵：連線版沒有遊戲內部狀態，放固定的常用指令 ---- */
const KEYS=[['物品','inventory'],['裝備','equipment'],['狀態','score'],['出口','exits'],['回城','recall'],['誰在','who'],
  ['休息','rest'],['站起','stand'],['逃跑','flee']];
function setupKeys(){
  const box=document.querySelector('#keys .cmds');
  box.innerHTML=KEYS.map(([l,c])=>'<button data-c="'+c+'">'+l+'</button>').join('');
  for(const b of document.querySelectorAll('#keys .dir button'))b.classList.remove('no','door');
}

window.Remote={start(){
  document.body.classList.add('remote');if($('loadbar'))$('loadbar').remove();
  for(const id of ['bBag','bExport','bImport','bSim'])if($(id))$(id).style.display='none';
  Term.linkify=linkify;
  Conn.onInput(line=>{if(ws&&ws.readyState===1)ws.send(encode(line+'\r\n'));else Term.write('\x1b[1;33m[尚未連線]\x1b[m\n');});
  setupKeys();
  $('term').addEventListener('click',e=>{
    const u=e.target.closest('.lk');if(!u)return;
    if(u.dataset.cmd)UI.send(u.dataset.cmd);else if(u.dataset.look)UI.send('look '+u.dataset.look);
  });
  $('choices').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.r==='connect')connect();
    if(b.dataset.r==='relay'){ls.set('roc.relay','');connect();}
    if(b.dataset.r==='local')location.href=location.pathname;
  });
  /* 輸入列加「編碼」按鈕：自動 → UTF-8 → Big5 */
  const eb=document.createElement('button');eb.className='tools';eb.textContent='編碼';
  eb.addEventListener('pointerdown',e=>e.preventDefault());
  $('bar').insertBefore(eb,$('bMore'));
  eb.onclick=()=>{
    const n={auto:'utf8',utf8:'big5',big5:'auto'}[ls.get('roc.enc')||'auto'];
    ls.set('roc.enc',n);enc=n;makeDecoder();
    Term.write('\x1b[1;30m[編碼改為 '+{auto:'自動',utf8:'UTF-8',big5:'Big5'}[n]+'，重新連線後完全生效]\x1b[m\n');
  };
  Term.write('\x1b[1;36m混沌幻世 連線版 —— 連到實體站台 roc.csie.org:5555\x1b[m\n');
  connect();
}};
})();
