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

/* ---- 技能／法術 ---- */
/* 主動技能 → 指令名稱、目標方式（none 直接用；fight 戰鬥中打對手、否則選人；char 選人；fill 填進輸入列自己補） */
const SKILL_CMD={kick:['kick','fight'],bashhead:['bashhead','fight'],disarm:['disarm','none'],berserk:['berserk','none'],
  frenzy:['frenzy','none'],hide:['hide','none'],sneak:['sneak','none'],backstab:['backstab','char'],rescue:['rescue','char'],
  peek:['peek','char'],hunt:['hunt','char'],track:['track','fill'],'bash door':['bash','fill'],'pick lock':['pick','fill'],steal:['steal','fill']};
const SK=()=>R.SK||[];
const pctOf=(ch,sn)=>R.getSkillPercent(ch,sn);
const spellArg=sn=>{const n=SK()[sn].name;return n.includes(' ')?"'"+n+"'":n;};
const castCmd=(sn,t)=>'cast '+spellArg(sn)+(t?' '+t:'');
function learnedList(ch){
  const sp=[],act=[],pas=[];
  SK().forEach((s,sn)=>{
    if(sn<1||!pctOf(ch,sn))return;
    if(s.fun)sp.push(sn);else if(SKILL_CMD[s.name]&&R.cmds[SKILL_CMD[s.name][0]])act.push(sn);else pas.push(sn);
  });
  const lv=sn=>R.skillReqLevel(ch,sn);
  for(const a of [sp,act,pas])a.sort((x,y)=>lv(x)-lv(y));
  return {sp,act,pas};
}
function targetsFor(ch,sn,isSpell){
  /* 回傳 [{label,cmd}] ；只有一個合理選擇時用來直接執行 */
  const s=SK()[sn],out=[],f=ch.fighting&&ch.fighting.room===ch.room?ch.fighting:null;
  const people=(self)=>ch.room.people.filter(v=>(self||v!==ch)&&R.canSee(ch,v));
  const mk=(v,c)=>{const r=v===ch?'self':refChar(ch,v);return r?{label:v===ch?'自己':R.strip(R.PERS(v,ch)),cmd:c(r)}:null;};
  if(isSpell){
    switch(s.tar){
      case 0:case 3:return [{label:'施放',cmd:castCmd(sn)}];
      case 1:{if(f)out.push({label:'⚔ '+R.strip(R.PERS(f,ch)),cmd:castCmd(sn)});
        for(const v of people(false))if(v!==f){const t=mk(v,r=>castCmd(sn,r));if(t)out.push(t);}return out;}
      case 2:{out.push({label:'自己',cmd:castCmd(sn)});
        for(const v of people(false)){const t=mk(v,r=>castCmd(sn,r));if(t)out.push(t);}return out;}
      case 4:case 5:{const list=s.tar===4?ch.carrying.filter(o=>o.wear_loc<0):[...ch.carrying,...ch.room.contents];
        for(const o of list){const r=s.tar===4?refCarry(ch,o):refHere(ch,o);if(r&&!out.some(x=>x.cmd===castCmd(sn,r)))out.push({label:nm(o),cmd:castCmd(sn,r)});}return out;}
      default:return [{label:'輸入目標…',fill:castCmd(sn)+' '}];
    }
  }
  const [c,mode]=SKILL_CMD[s.name];
  if(mode==='none')return [{label:'使用',cmd:c}];
  if(mode==='fill')return [{label:'輸入目標…',fill:c+' '}];
  if(mode==='fight'&&f)out.push({label:'⚔ '+R.strip(R.PERS(f,ch)),cmd:c});
  for(const v of people(false))if(!(mode==='fight'&&v===f)){const t=mk(v,r=>c+' '+r);if(t)out.push(t);}
  return out;
}
function targetButtons(ts){
  if(!ts.length)return '<div class="hint">這裡沒有可以用的目標。</div>';
  return ts.map(t=>t.fill!==undefined?btnFill(esc(t.label),t.fill):btn(esc(t.label),t.cmd,'pri')).join('');
}
function renderSkills(ch){
  const {sp,act,pas}=learnedList(ch);
  const pins=getPins(ch);
  let h='<div class="top"><span class="hint">點技能選目標；☆ 釘到快捷列</span></div>';
  const skRow=(sn,isSpell)=>{
    const s=SK()[sn],k='sk:'+sn,open=openKey===k,low=isSpell&&ch.mana<s.mana;
    const pinned=pins.some(p=>p.k==='s'&&p.n===s.name);
    return '<div class="it'+(open?' open':'')+'"><div class="ih" data-k="'+k+'">'
      +'<span class="nm'+(low?' hi':'')+'">'+esc(s.cname)+' <small>'+esc(s.name)+'</small></span>'
      +'<span class="tg">'+(isSpell?s.mana+'法 · ':'')+pctOf(ch,sn)+'%</span></div>'
      +(open?'<div class="ia">'+targetButtons(targetsFor(ch,sn,isSpell))
        +'<button data-pin="s|'+esc(s.name)+'" class="pin">'+(pinned?'★ 取消釘選':'☆ 釘到快捷列')+'</button></div>':'')+'</div>';
  };
  if(sp.length){h+='<div class="sec">法術</div>';for(const sn of sp)h+=skRow(sn,true);}
  if(act.length){h+='<div class="sec">技能</div>';for(const sn of act)h+=skRow(sn,false);}
  if(!sp.length&&!act.length)h+='<div class="hint pad">你還沒學會可以主動使用的技能或法術。到導師那裡用 practice 學習。</div>';
  if(pas.length)h+='<div class="sec">被動技能</div><div class="pas">'+pas.map(sn=>'<span>'+esc(SK()[sn].cname)+' '+pctOf(ch,sn)+'%</span>').join('')+'</div>';
  return h;
}

/* ---- 快捷列（釘選的技能／法術／藥水，每個角色各自記住） ---- */
const pinKey=ch=>'roc.pins.'+R.lc(ch.name);
function getPins(ch){try{return JSON.parse(localStorage.getItem(pinKey(ch))||'[]');}catch(e){return [];}}
function setPins(ch,a){try{localStorage.setItem(pinKey(ch),JSON.stringify(a));}catch(e){}}
function togglePin(ch,k,n,label){
  const a=getPins(ch),i=a.findIndex(p=>p.k===k&&p.n===n);
  if(i>=0)a.splice(i,1);else{if(a.length>=12)a.shift();a.push({k,n,label});}
  setPins(ch,a);renderPins(true);
}
/* 物品快捷：喝／吃／念（對自己） */
const ITEM_USE={POTION:['quaff','喝'],PILL:['eat','吃'],FOOD:['eat','吃'],SCROLL:['recite','念']};
function runPin(ch,p){
  if(p.k==='s'){
    const sn=SK().findIndex(s=>s.name===p.n);if(sn<1||!pctOf(ch,sn))return;
    const isSpell=!!SK()[sn].fun,ts=targetsFor(ch,sn,isSpell);
    const f=ch.fighting&&ch.fighting.room===ch.room;
    /* 戰鬥中的攻擊類、或只有一種用法 → 直接用；否則打開技能面板選目標 */
    const direct=ts.length===1&&ts[0].cmd||(f&&ts[0]&&ts[0].label.startsWith('⚔')&&ts[0].cmd)
      ||(isSpell&&SK()[sn].tar===2&&ts[0].cmd);
    if(direct){send(direct);return;}
    if(ts.length===1&&ts[0].fill!==undefined){window.UI.fill(ts[0].fill);return;}
    tab='sk';openKey='sk:'+sn;$('sheet').classList.add('on');document.body.classList.add('sheet-on');renderSheet();
    return;
  }
  if(p.k==='i'){
    const o=ch.carrying.find(x=>x.wear_loc<0&&x.vnum===p.v);
    if(!o){Term.write('\x1b[1;30m[身上沒有 '+p.label+' 了]\x1b[m\n');return;}
    const u=ITEM_USE[o.type],r=refCarry(ch,o);if(u&&r)send(u[0]+' '+r);
  }
}
let lastPins='';
function renderPins(force){
  const el=$('pins'),ch=me();
  const a=ch&&ch.room?getPins(ch):[];
  let h='';
  for(let i=0;i<a.length;i++){
    const p=a[i];let label=p.label,sub='',dis=false;
    if(p.k==='s'){const sn=SK().findIndex(s=>s.name===p.n);const s=SK()[sn];if(s){label=s.cname;if(s.fun){sub=s.mana+'';dis=ch.mana<s.mana;}}}
    else{const n=ch.carrying.filter(x=>x.wear_loc<0&&x.vnum===p.v).length;sub='×'+n;dis=!n;}
    h+='<button data-i="'+i+'"'+(dis?' class="dis"':'')+'>'+esc(label)+(sub?'<small>'+esc(sub)+'</small>':'')+'</button>';
  }
  if(!force&&h===lastPins)return;
  lastPins=h;el.innerHTML=h;el.classList.toggle('on',!!h);
}

/* ---- 畫面文字可以點：名字(keyword)、look xxx、出口方向 ---- */
const DIRW='north|south|east|west|up|down';
function linkify(t){
  if(!/[A-Za-z]/.test(t))return t;
  /* 只有方向字的片段（[出口: south up] 的彩色部分） */
  if(new RegExp('^\\s*('+DIRW+')(\\s+('+DIRW+'))*\\s*$','i').test(t))
    return t.replace(new RegExp('\\b('+DIRW+')\\b','gi'),'<u class="lk" data-cmd="$1">$1</u>');
  /* exits 列表：North  - 某某地方 */
  t=t.replace(/^(North|South|East|West|Up|Down)(?=\s+-)/gm,m=>'<u class="lk" data-cmd="'+m.toLowerCase()+'">'+m+'</u>');
  /* 文字裡的指令提示：look sign / help newbie */
  t=t.replace(/\b((?:look|help) [A-Za-z][A-Za-z']*)/g,'<u class="lk" data-cmd="$1">$1</u>');
  /* 中文名(english keyword) */
  t=t.replace(/([^\s()<>\[\]，。、：:；;「」]{0,8})\(([A-Za-z][A-Za-z0-9'\- ]{0,40})\)/g,
    (m,pre,kw)=>'<u class="lk" data-kw="'+kw.replace(/"/g,'')+'">'+pre+'('+kw+')</u>');
  return t;
}
/* look 指令找物品的順序（身上→地上，含額外描述），用來算 N.關鍵字 */
function lookFind(ch,arg){
  const [n,name]=R.num_arg(arg);let c=0;
  for(const o of [...ch.carrying,...ch.room.contents]){
    for(const e of o.extra_descr)if(R.is_name(name,e.keywords)&&++c===n)return null;
    if(R.is_name(name,o.name)&&++c===n)return o;
  }
  return null;
}
const refLook=(ch,o)=>ref(o,a=>lookFind(ch,a));
function ctxMenu(kw,label){
  const ch=me();
  const pop=$('pop'),k=R.lc(kw.trim()),tag='('+k+')';
  const has=s=>R.lc(R.strip(s||'')).includes(tag);
  let h='';
  if(!ch||!ch.room){
    h='<div class="hint">'+esc(label)+'</div>'+btn('說明 help '+esc(k.split(' ')[0]),'help '+k.split(' ')[0]);
  }else{
    const f=ch.fighting&&ch.fighting.room===ch.room?ch.fighting:null;
    /* 人物／怪物 */
    for(const v of ch.room.people.filter(v=>R.canSee(ch,v)&&(has(R.PERS(v,ch))||(!v.npc&&R.lc(v.name)===k)))){
      const r=v===ch?'self':refChar(ch,v);if(!r)continue;
      h+='<div class="pt">'+esc(R.strip(R.PERS(v,ch)))+(v.npc?' <small>Lv'+v.level+'</small>':'')+'</div><div class="pa">'+btn('看','look '+r);
      if(v!==ch){
        if(v.npc)h+=btn('評估','consider '+r);
        if(v.npc&&v!==f)h+=btn('攻擊','kill '+r,'warn');
        if(v.shop)h+=btn('商品','list','pri');
        if(v.psk)h+=btn('學技能','practice','pri');
        if(!v.npc)h+=btn('跟隨','follow '+r);
        const {sp,act}=learnedList(ch);
        for(const sn of [...sp,...act]){
          const s=SK()[sn],isSp=!!s.fun;
          if(isSp&&![1,2].includes(s.tar))continue;
          if(!isSp&&!['fight','char'].includes(SKILL_CMD[s.name][1]))continue;
          if(isSp&&s.tar===1&&!v.npc)continue;
          const c=isSp?castCmd(sn,v===f?'':r):SKILL_CMD[s.name][0]+(v===f&&SKILL_CMD[s.name][1]==='fight'?'':' '+r);
          h+=btn(esc(s.cname)+(isSp?'<small> '+s.mana+'</small>':''),c,isSp&&ch.mana<s.mana?'dis':'');
        }
      }
      h+='</div>';
    }
    /* 物品：地上、身上、裝備 */
    const objs=[...ch.room.contents,...ch.carrying].filter(o=>has(o.short));
    const seen=new Set();
    for(const o of objs){
      const where=o.carried_by===ch||ch.carrying.includes(o)?(o.wear_loc>=0?'eq':'inv'):'room';
      if(seen.has(where+keyOf(o)))continue;seen.add(where+keyOf(o));
      const rl=refLook(ch,o);
      h+='<div class="pt">'+esc(nm(o))+' <small>'+({room:'地上',inv:'身上',eq:'裝備中'})[where]+'</small></div><div class="pa">'+(rl?btn('看','look '+rl):'');
      if(where==='room'){const r=refRoom(ch,o);
        if(r&&o.wear.has('TAKE'))h+=btn('撿起','get '+r,'pri');
        if(r&&/CONTAINER|CORPSE/.test(o.type)&&o.contains.length)h+=btn('拿光裡面','get all '+r,'pri');
        if(o.type==='FOUNTAIN')h+=btn('喝水','drink '+(refHere(ch,o)||''),'pri');}
      else h+='<button data-open="'+where+'|'+esc(keyOf(o)+(where==='eq'?'@'+o.wear_loc:''))+'">更多動作…</button>';
      h+='</div>';
    }
    /* 其他（房間的額外描述、看不到的東西） */
    if(!h){const w=k.split(/\s+/)[0];h='<div class="pt">'+esc(label)+'</div><div class="pa">'+btn('看','look '+w)+btn('說明','help '+w)+'</div>';}
  }
  pop.querySelector('.pb').innerHTML=h;
  pop.classList.add('on');
}
function closePop(){$('pop').classList.remove('on');}

/* ---- 登入／建角：把要輸入的選項變成按鈕 ---- */
let lastCh='';
function renderChoices(){
  const el=$('choices'),d=window.Conn&&Conn.desc;
  const st=d?d.state:'';
  let h='';
  const yn='<button data-raw="y" class="pri">是 (Y)</button><button data-raw="n">否 (N)</button>';
  switch(st){
    case 'GET_NAME':{
      const names=Object.values(R.Store.all()).map(x=>x&&x.name).filter(Boolean).sort();
      if(names.length)h='<span class="hint">選擇角色，或在下方輸入新名字：</span>'+names.map(n=>'<button data-raw="'+esc(n)+'" class="pri">'+esc(n)+'</button>').join('');
      else h='<span class="hint">在下方輸入英文名字（3~12 個字母）建立新角色</span>';
      break;}
    case 'GET_OLD_PASSWORD':case 'OWNER_PASSWORD':case 'GET_NEW_PASSWORD':case 'CONFIRM_NEW_PASSWORD':
      h='<span class="hint">在下方輸入密碼（至少 5 個字）</span>';break;
    case 'CONFIRM_NEW_NAME':case 'CONFIRM_NEW_RACE':case 'CONFIRM_CLASS':h=yn;break;
    case 'DISPLAY_RACE':case 'DISPLAY_CLASS':case 'READ_MOTD':h='<button data-raw="" class="pri wide1">繼續 ▶</button>';break;
    case 'GET_NEW_RACE':
      h=R.CONST.races.filter(r=>r.abil&1).map(r=>'<button data-raw="'+esc(r.name)+'">'+esc(r.cname)+'<small>'+esc(r.name)+'</small></button>').join('');break;
    case 'GET_NEW_SEX':h='<button data-raw="m">男性</button><button data-raw="f">女性</button><button data-raw="n">中性</button>';break;
    case 'GET_NEW_CLASS':
      h=R.CONST.classes.slice(0,5).map(c=>'<button data-raw="'+esc(c.who)+'">'+esc(c.cname)+'<small>'+esc(c.who)+'</small></button>').join('');break;
  }
  document.body.classList.toggle('playing',st==='PLAYING');
  if(h===lastCh)return;
  lastCh=h;el.innerHTML=h;el.classList.toggle('on',!!h);
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
  if(o.type==='POTION')a+=btn('喝下','quaff '+r,'pri');
  if(o.type==='SCROLL'){a+=btn('念（自己）','recite '+r,'pri')+'<button data-recite="'+esc(keyOf(o))+'">對…念</button>';}
  if(ITEM_USE[o.type]){const pinned=getPins(ch).some(p=>p.k==='i'&&p.v===o.vnum);a+='<button data-pini="'+o.vnum+'" class="pin">'+(pinned?'★ 取消釘選':'☆ 釘到快捷列')+'</button>';}
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
      if(putFor==='recite:'+k){
        const ts=ch.room.people.filter(v=>R.canSee(ch,v)).map(v=>{const rv=v===ch?'self':refChar(ch,v);return rv?btn(esc(v===ch?'自己':R.strip(R.PERS(v,ch))),'recite '+r+' '+rv,'pri'):'';}).join('');
        return '<div class="hint">要對誰念？</div>'+ts+'<button data-back>取消</button>';
      }
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
        let u='';
        if(l===17&&o.type==='STAFF')u+=btn('揮舞','brandish','pri');
        if(l===17&&o.type==='WAND'){if(ch.fighting)u+=btn('指向對手','zap','pri');
          u+=ch.room.people.filter(v=>v!==ch&&R.canSee(ch,v)).map(v=>{const rv=refChar(ch,v);return rv?btn('指向 '+esc(R.strip(R.PERS(v,ch))),'zap '+rv):'';}).join('');}
        return u+(r?btn('脫下','remove '+r,'pri'):'')+(rh?btn('檢視','examine '+rh):'');})()+'</div>':'')+'</div>';
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
  body.innerHTML=tab==='inv'?renderInv(ch):tab==='eq'?renderEq(ch):tab==='sk'?renderSkills(ch):renderRoom(ch);
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
    if(b.dataset.open){const [w,k]=b.dataset.open.split('|');tab=w;openKey=k;giveFor=putFor=null;renderSheet();return;}
    if(b.dataset.recite){putFor='recite:'+b.dataset.recite;renderSheet();return;}
    if(b.dataset.pin){const ch=me();if(ch){const [k,n]=b.dataset.pin.split('|');togglePin(ch,k,n,n);renderSheet();}return;}
    if(b.dataset.pini){const ch=me();if(ch){const v=+b.dataset.pini,o=ch.carrying.find(x=>x.vnum===v);
      const a=getPins(ch),i=a.findIndex(p=>p.k==='i'&&p.v===v);if(i>=0)a.splice(i,1);else{if(a.length>=12)a.shift();a.push({k:'i',v,label:o?nm(o).replace(/\(.*\)$/,''):'物品'});}
      setPins(ch,a);renderPins(true);renderSheet();}return;}
    if(b.dataset.back!==undefined){giveFor=putFor=null;renderSheet();return;}
    if(b.dataset.fill){window.UI.fill(b.dataset.fill);return;}
    if(b.dataset.c){giveFor=putFor=null;send(b.dataset.c);}
  });
  sh.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  const pop=$('pop');
  pop.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  pop.addEventListener('click',e=>{
    if(e.target===pop||e.target.closest('[data-x]')){closePop();return;}
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.open){const [w,k]=b.dataset.open.split('|');closePop();openSheet(w);openKey=k;renderSheet();return;}
    if(b.dataset.c!==undefined){closePop();send(b.dataset.c);}
  });
  $('term').addEventListener('click',e=>{
    const u=e.target.closest('.lk');if(!u)return;
    e.stopPropagation();
    if(u.dataset.cmd){send(u.dataset.cmd);return;}
    if(u.dataset.kw)ctxMenu(u.dataset.kw,u.textContent);
  });
  const chs=$('choices');
  chs.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  chs.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b.dataset.raw!==undefined)window.UI.raw(b.dataset.raw);});
  Term.linkify=linkify;
  const pe=$('pins');
  pe.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  pe.addEventListener('click',e=>{const b=e.target.closest('button');const ch=me();if(!b||!ch)return;const p=getPins(ch)[+b.dataset.i];if(p)runPin(ch,p);});
  /* 有新輸出時更新（同一個畫格只算一次） */
  let q=false;
  const w=Term.write;
  Term.write=function(s){w.call(Term,s);if(!q){q=true;requestAnimationFrame(()=>{q=false;renderStat();renderPins();renderChoices();renderSheet();});}};
  setInterval(()=>{renderStat();renderPins();},1000);
}
window.UIPanel={open:openSheet,close:closeSheet,init};
})(ROC);
