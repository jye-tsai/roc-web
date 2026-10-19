/* panel.js — 手機點選介面：狀態血條、物品／裝備／地上面板（點東西 → 選動作，背後送出一般指令） */
(function(R){
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const me=()=>R.world&&R.world.players.find(p=>p.playing&&p.conn===window.Conn&&!p.deleted);
const send=c=>window.UI.send(c);

/* ---- 指令參數：找出能讓引擎選到「這一件」的 N.關鍵字 ---- */
function ref(o,finder){
  for(const kw of R.lc(o.name||'').split(/\s+/).filter(Boolean))
    for(let n=1;n<=60;n++){const x=finder(n+'.'+kw);if(x===o)return n===1?kw:n+'.'+kw;if(!x)break;}
  return null;
}
const refCarry=(ch,o)=>ref(o,a=>R.getObjCarry(ch,a));
const refWear=(ch,o)=>ref(o,a=>R.getObjWear(ch,a));
const refHere=(ch,o)=>ref(o,a=>R.getObjHere(ch,a));
const refRoom=(ch,o)=>ref(o,a=>R.getObjList(ch,a,ch.room.contents));
const refIn=(ch,o,c)=>ref(o,a=>R.getObjList(ch,a,c.contains));
const refChar=(ch,v)=>ref(v,a=>R.getCharRoom(ch,a));

const TYPE={LIGHT:'光源',SCROLL:'卷軸',WAND:'魔杖',STAFF:'法杖',WEAPON:'武器',TREASURE:'寶物',ARMOR:'防具',POTION:'藥水',
  FURNITURE:'家具',TRASH:'雜物',CONTAINER:'容器',DRINK_CON:'水袋',KEY:'鑰匙',FOOD:'食物',MONEY:'錢',BOAT:'船',
  CORPSE_NPC:'屍體',CORPSE_PC:'屍體',FOUNTAIN:'泉水',PILL:'藥丸',ARROW:'弓矢',DART:'暗器',HORSE:'坐騎',AMMO:'彈藥'};
const SLOT=[['WIELD','武器'],['TWO_HAND','雙手'],['HOLD','手握'],['WEAR_SHIELD','盾'],['WEAR_BODY','身體'],['WEAR_HEAD','頭'],
  ['WEAR_LEGS','腿'],['WEAR_FEET','腳'],['WEAR_HANDS','手'],['WEAR_ARMS','手臂'],['WEAR_ABOUT','披風'],['WEAR_WAIST','腰'],
  ['WEAR_WRIST','手腕'],['WEAR_FINGER','手指'],['WEAR_NECK','頸'],['ARROW','背掛']];
const slotOf=o=>o.type==='LIGHT'?'光源':(SLOT.find(([f])=>o.wear.has(f))||[])[1]||'';
/* 平常一定顯示的部位（其餘部位有穿才顯示） */
const BASE_SLOTS=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,20];
const shopHere=ch=>ch.room.people.some(v=>v.npc&&v.shop);
const tooHigh=(ch,o)=>o.level>ch.level&&!R.isImm(ch);
const nm=o=>R.strip(o.short||o.name||'?');

/* ---- 狀態列 ---- */
function bar(cls,label,v,max){
  const p=max>0?Math.max(0,Math.min(100,v/max*100)):0;
  return '<div class="sb '+cls+'"><i style="width:'+p.toFixed(1)+'%"></i><span>'+label+' '+v+'/'+max+'</span></div>';
}
let lastStat='';
function renderStat(){
  const el=$('stat'),ch=me();
  if(!ch||!ch.room){if(lastStat){el.innerHTML='';el.classList.remove('on');lastStat='';}return;}
  let h=bar('hp','生命',ch.hit,ch.max_hit)+bar('mp','魔法',ch.mana,ch.max_mana)+bar('mv','移動',ch.move,ch.max_move);
  const f=ch.fighting;
  h+='<div class="si">'+(f&&f.room===ch.room
    ?'<b>⚔ '+esc(R.strip(R.PERS(f,ch)))+'</b> '+(f.max_hit>0?Math.max(0,Math.round(f.hit/f.max_hit*100)):0)+'%'
    :'Lv'+ch.level+' · 金 '+ch.gold)+'</div>';
  if(h!==lastStat){el.innerHTML=h;el.classList.add('on');lastStat=h;}
}

/* ---- 面板 ---- */
let tab='inv',openKey=null,giveFor=null,putFor=null;
const keyOf=o=>o.vnum+'|'+o.short;
function btn(label,c,cls){return '<button data-c="'+esc(c)+'"'+(cls?' class="'+cls+'"':'')+'>'+label+'</button>';}
function btnFill(label,c){return '<button data-fill="'+esc(c)+'">'+label+'</button>';}

function invActions(ch,o){
  const r=refCarry(ch,o);if(!r)return '';
  let a='';
  if(o.type==='LIGHT'||slotOf(o))a+=btn(o.wear.has('WIELD')||o.wear.has('TWO_HAND')?'裝備':o.wear.has('HOLD')?'握住':'穿上','wear '+r,'pri');
  if(/FOOD|PILL/.test(o.type))a+=btn('吃','eat '+r,'pri');
  if(o.type==='DRINK_CON'){const rh=refHere(ch,o);if(rh)a+=btn('喝','drink '+rh,'pri');}
  if(/CONTAINER/.test(o.type))a+='<button data-put="'+esc(keyOf(o))+'">放東西進去…</button>';
  const rh=refHere(ch,o);if(rh)a+=btn('檢視','examine '+rh);
  a+='<button data-give="'+esc(keyOf(o))+'">給…</button>';
  const others=ch.carrying.filter(x=>x.wear_loc<0&&x!==o&&x.type==='CONTAINER');
  if(others.length&&o.type!=='CONTAINER')a+='<button data-into="'+esc(keyOf(o))+'">放進…</button>';
  if(shopHere(ch))a+=btn('估價','value '+r)+btn('賣掉','sell '+r);
  a+=btn('丟掉','drop '+r,'warn');
  return a;
}
function peoplePicker(ch,cmdFor){
  const ps=ch.room.people.filter(v=>v!==ch&&R.canSee(ch,v));
  if(!ps.length)return '<div class="hint">這裡沒有其他人。</div>';
  return ps.map(v=>{const r=refChar(ch,v);return r?btn(esc(R.strip(R.PERS(v,ch))),cmdFor(r)):'';}).join('');
}
function containerPicker(ch,o,r){
  const cs=ch.carrying.filter(x=>x.wear_loc<0&&x!==o&&x.type==='CONTAINER');
  return cs.map(c=>{const rc=refHere(ch,c);return rc?btn(esc(nm(c)),'put '+r+' '+rc):'';}).join('');
}
function group(list){
  const g=[];
  for(const o of list){const k=keyOf(o),e=g.find(x=>x.k===k);if(e)e.n++;else g.push({k,o,n:1});}
  return g;
}
function row(ch,o,n,extra,actions){
  const k=keyOf(o),open=openKey===k;
  return '<div class="it'+(open?' open':'')+'"><div class="ih" data-k="'+esc(k)+'">'
    +'<span class="nm'+(tooHigh(ch,o)?' hi':'')+'">'+esc(nm(o))+(n>1?' <em>×'+n+'</em>':'')+'</span>'
    +'<span class="tg">'+extra+'</span></div>'
    +(open?'<div class="ia">'+actions()+'</div>':'')+'</div>';
}
function renderInv(ch){
  const list=ch.carrying.filter(o=>o.wear_loc<0);
  let h='<div class="top">'+btn('全部穿上','wear all','pri')+'<span class="hint">身上 '+list.length+' 件 · 金幣 '+ch.gold+'</span></div>';
  if(!list.length)return h+'<div class="hint pad">你身上什麼都沒有。</div>';
  for(const {k,o,n} of group(list)){
    let tag=(TYPE[o.type]||'')+(slotOf(o)&&o.type!=='LIGHT'?'·'+slotOf(o):'');
    if(o.level>1)tag+=' Lv'+o.level;
    h+=row(ch,o,n,esc(tag),()=>{
      const r=refCarry(ch,o);
      if(giveFor===k)return '<div class="hint">要給誰？</div>'+peoplePicker(ch,v=>'give '+r+' '+v)+'<button data-back>取消</button>';
      if(putFor==='into:'+k)return '<div class="hint">放進哪個容器？</div>'+containerPicker(ch,o,r)+'<button data-back>取消</button>';
      if(putFor===k){
        const rc=refHere(ch,o),items=ch.carrying.filter(x=>x.wear_loc<0&&x!==o);
        return '<div class="hint">要放什麼進 '+esc(nm(o))+'？</div>'+items.map(x=>{const rx=refCarry(ch,x);return rx&&rc?btn(esc(nm(x)),'put '+rx+' '+rc):'';}).join('')+'<button data-back>取消</button>';
      }
      let a=invActions(ch,o);
      if(o.type==='CONTAINER'&&o.contains.length){
        const rc=refHere(ch,o);
        a+='<div class="sub"><div class="hint">裡面有：</div>'+group(o.contains).map(({o:x,n:m})=>{const rx=refIn(ch,x,o);
          return '<div class="subi"><span>'+esc(nm(x))+(m>1?' ×'+m:'')+'</span>'+(rx&&rc?btn('取出','get '+rx+' '+rc):'')+'</div>';}).join('')
          +(rc?btn('全部取出','get all '+rc):'')+'</div>';
      }
      return a;
    });
  }
  return h;
}
function renderEq(ch){
  const worn=ch.carrying.filter(o=>o.wear_loc>=0&&o.wear_loc!==24);
  let h='<div class="top">'+btn('全部脫下','remove all','warn')+'<span class="hint">裝備 '+worn.length+' 件</span></div>';
  for(const l of R.EQ_ORDER){
    const o=R.getEq(ch,l);
    if(!o&&!BASE_SLOTS.includes(l))continue;
    const where=R.WHERE_NAME[l].replace(/[<> ]/g,'');
    if(!o){h+='<div class="it empty"><div class="ih"><span class="sl">'+where+'</span><span class="nm">—</span></div></div>';continue;}
    const k=keyOf(o)+'@'+l,open=openKey===k;
    h+='<div class="it'+(open?' open':'')+'"><div class="ih" data-k="'+esc(k)+'"><span class="sl">'+where+'</span><span class="nm">'+esc(nm(o))+'</span></div>'
      +(open?'<div class="ia">'+(()=>{const r=refWear(ch,o),rh=refHere(ch,o);
        return (r?btn('脫下','remove '+r,'pri'):'')+(rh?btn('檢視','examine '+rh):'');})()+'</div>':'')+'</div>';
  }
  return h;
}
function renderRoom(ch){
  const list=ch.room.contents;
  let h='<div class="top">'+(list.length?btn('撿全部','get all','pri'):'')+'<span class="hint">'+esc(R.strip(ch.room.name||''))+'</span></div>';
  if(!list.length)return h+'<div class="hint pad">地上什麼都沒有。</div>';
  for(const {o,n} of group(list)){
    h+=row(ch,o,n,esc(TYPE[o.type]||''),()=>{
      const r=refRoom(ch,o),rh=refHere(ch,o);let a='';
      if(r&&o.wear.has('TAKE'))a+=btn('撿起','get '+r,'pri');
      if(r&&/CONTAINER|CORPSE/.test(o.type)&&o.contains.length)a+=btn('拿光裡面','get all '+r,'pri');
      if(o.type==='FOUNTAIN'&&rh)a+=btn('喝水','drink '+rh,'pri');
      if(rh)a+=btn('檢視','examine '+rh);
      if(r&&o.wear.has('TAKE')&&o.type!=='CORPSE_PC')a+=btn('獻祭','sacrifice '+r);
      return a;
    });
  }
  return h;
}
function renderSheet(){
  const sh=$('sheet');if(!sh.classList.contains('on'))return;
  const ch=me();
  for(const b of sh.querySelectorAll('.tabs button'))b.classList.toggle('cur',b.dataset.tab===tab);
  const body=sh.querySelector('.body');
  if(!ch||!ch.room){body.innerHTML='<div class="hint pad">進入遊戲後才能使用。</div>';return;}
  const st=body.scrollTop;
  body.innerHTML=tab==='inv'?renderInv(ch):tab==='eq'?renderEq(ch):renderRoom(ch);
  body.scrollTop=st;
}
function openSheet(t){
  const sh=$('sheet');
  if(sh.classList.contains('on')&&tab===t){closeSheet();return;}
  tab=t;openKey=giveFor=putFor=null;sh.classList.add('on');document.body.classList.add('sheet-on');renderSheet();
}
function closeSheet(){$('sheet').classList.remove('on');document.body.classList.remove('sheet-on');}

/* ---- 事件 ---- */
function init(){
  const sh=$('sheet');
  sh.addEventListener('click',e=>{
    const b=e.target.closest('button,.ih');if(!b)return;
    if(b.dataset.tab){tab=b.dataset.tab;openKey=giveFor=putFor=null;renderSheet();return;}
    if(b.dataset.close!==undefined){closeSheet();return;}
    if(b.classList.contains('ih')){if(!b.dataset.k)return;openKey=openKey===b.dataset.k?null:b.dataset.k;giveFor=putFor=null;renderSheet();return;}
    if(b.dataset.give){giveFor=b.dataset.give;renderSheet();return;}
    if(b.dataset.put){putFor=b.dataset.put;renderSheet();return;}
    if(b.dataset.into){putFor='into:'+b.dataset.into;renderSheet();return;}
    if(b.dataset.back!==undefined){giveFor=putFor=null;renderSheet();return;}
    if(b.dataset.fill){window.UI.fill(b.dataset.fill);return;}
    if(b.dataset.c){giveFor=putFor=null;send(b.dataset.c);}
  });
  for(const b of sh.querySelectorAll('button'))b.addEventListener('pointerdown',e=>e.preventDefault());
  /* 有新輸出時更新（同一個畫格只算一次） */
  let q=false;
  const w=Term.write;
  Term.write=function(s){w.call(Term,s);if(!q){q=true;requestAnimationFrame(()=>{q=false;renderStat();renderSheet();});}};
  setInterval(renderStat,1000);
}
window.UIPanel={open:openSheet,close:closeSheet,init};
})(ROC);
