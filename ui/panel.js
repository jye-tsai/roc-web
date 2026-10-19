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
  return '<div class="sb '+cls+'"><i style="width:'+p.toFixed(1)+'%"></i><span><b class="lb">'+label+' </b>'+v+'/'+max+'</span></div>';
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
  if(h!==lastStat){el.innerHTML=h;el.classList.add('on');el.classList.toggle('fight',!!(f&&f.room===ch.room));lastStat=h;}
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
/* 畫面上出現過的 (英文關鍵字)：NPC 的話題多半這樣提示，例如「報酬(reward)」 */
const seenKw=new Set();
/* NPC 劇本裡的話題 → 按鈕要送的字（'p 片語' 去掉 p，多個關鍵字取第一個） */
function topicWords(v){
  if(!R.MP)return [];
  return R.MP.topics(v).map(a=>{a=a.trim();return /^p\s/i.test(a)?a.slice(2).trim():a.split(/\s+/)[0];}).filter((w,i,arr)=>w&&arr.indexOf(w)===i);
}
function talkButtons(ch,v,r){
  if(!R.MP||!R.MP.canTalk(v))return '';
  let h=btn('交談','talk '+r,'pri');
  const all=topicWords(v);
  /* 只列出你看過提示的話題，加上常見的是／否，避免直接爆雷 */
  for(const w of all)if(seenKw.has(R.lc(w))||/^(yes|no|ok)$/i.test(w))h+=btn('問「'+esc(w)+'」','talk '+r+' '+w,'pri');
  if(all.length)h+=btnFill('問其他…','talk '+r+' ');
  return h;
}
/* 依關鍵字判斷種類，用來上色：怪物、玩家、物品、其他 */
let kwIndex=null;
function kwKind(kw){
  const k=R.lc(kw.trim());
  if(!kwIndex){
    kwIndex={};
    const add=(s,t)=>{const re=/\(([A-Za-z][A-Za-z0-9'\- ]{0,40})\)/g;let m;while((m=re.exec(R.strip(s||''))))if(!kwIndex[R.lc(m[1])])kwIndex[R.lc(m[1])]=t;};
    for(const p of Object.values(R.world.mobs||{}))add(p.short_description,'mob');
    for(const p of Object.values(R.world.objs||{}))add(p.short_description,'obj');
  }
  const ch=me(),tag='('+k+')',has=s=>R.lc(R.strip(s||'')).includes(tag);
  if(ch&&ch.room){
    const w=k.split(/\s+/)[0];
    for(const v of ch.room.people)if(has(R.PERS(v,ch))||(!v.npc&&R.lc(v.name)===k)||(v.npc&&R.is_name(w,v.name)))return v.npc?'mob':'pc';
    if([...ch.room.contents,...ch.carrying].some(o=>has(o.short)||R.is_name(w,o.name)))return 'obj';
    if(ch.room.extra.some(e=>R.is_name(k.split(/\s+/)[0],e.keywords||'')))return 'ex';
  }
  if(R.world.players.some(p=>p.playing&&R.lc(p.name)===k))return 'pc';
  if(R.Sim&&R.simOn&&R.Sim.who().some(s=>R.lc(s.name)===k))return 'pc';
  return kwIndex[k]||'';
}
function linkify(t){
  if(!/[A-Za-z]/.test(t))return t;
  /* 只有方向字的片段（[出口: south up] 的彩色部分） */
  if(new RegExp('^\\s*('+DIRW+')(\\s+('+DIRW+'))*\\s*$','i').test(t))
    return t.replace(new RegExp('\\b('+DIRW+')\\b','gi'),'<u class="lk cmd" data-cmd="$1">$1</u>');
  /* exits 列表：North  - 某某地方 */
  t=t.replace(/^(North|South|East|West|Up|Down)(?=\s+-)/gm,m=>'<u class="lk cmd" data-cmd="'+m.toLowerCase()+'">'+m+'</u>');
  /* 文字裡的指令提示：look sign / help newbie */
  t=t.replace(/\b((?:look|help) [A-Za-z](?:[A-Za-z']*[A-Za-z])?)/gi,m=>'<u class="lk cmd" data-cmd="'+m.toLowerCase()+'">'+m+'</u>');
  /* 中文名(english keyword) */
  t=t.replace(/([^\s()<>\[\]，。、：:；;「」]{0,8})\(([A-Za-z][A-Za-z0-9'\- ]{0,40})\)/g,
    (m,pre,kw)=>{for(const w of R.lc(kw.trim()).split(/\s+/))seenKw.add(w);seenKw.add(R.lc(kw.trim()));return '<u class="lk '+kwKind(kw)+'" data-kw="'+kw.replace(/"/g,'')+'">'+pre+'('+kw+')</u>';});
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
    const w0=k.split(/\s+/)[0];
    let pv=ch.room.people.filter(v=>R.canSee(ch,v)&&(has(R.PERS(v,ch))||(!v.npc&&R.lc(v.name)===k)));
    if(!pv.length)pv=ch.room.people.filter(v=>v!==ch&&R.canSee(ch,v)&&R.is_name(w0,v.name));
    for(const v of pv){
      const r=v===ch?'self':refChar(ch,v);if(!r)continue;
      h+='<div class="pt">'+esc(R.strip(R.PERS(v,ch)))+(v.npc?' <small>Lv'+v.level+'</small>':'')+'</div><div class="pa">'+btn('看','look '+r);
      if(v!==ch){
        if(v.npc)h+=btn('評估','consider '+r);
        if(v.npc&&v!==f)h+=btn('攻擊','kill '+r,'warn');
        if(v.shop)h+=btn('商品','list','pri');
        if(v.npc)h+=talkButtons(ch,v,r);
        if(v.psk)h+=btn('學技能','practice','pri');
        if(v.npc&&v.act&&v.act.has('TRAIN'))h+='</div><div class="pt">訓練 <small>練習點 '+ch.practice+'・金 '+ch.gold+'</small></div><div class="pa">'+btn('可練項目','train','pri')
          +[['str','力量'],['int','智能'],['wis','智慧'],['dex','敏捷'],['con','體質'],['hp','生命'],['mana','魔法'],['move','移動'],['practice','練習點']].map(([a,n])=>btn(n,'train '+a)).join('')
          +[['hp-r','生命'],['mana-r','魔法'],['move-r','移動'],['practice-r','練習點']].map(([a,n])=>btn('盡量'+n,'train '+a)).join('');
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
    let objs=[...ch.room.contents,...ch.carrying].filter(o=>has(o.short));
    if(!objs.length&&!pv.length)objs=[...ch.room.contents,...ch.carrying].filter(o=>R.is_name(w0,o.name));
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
    /* 不是人也不是東西：可能是 NPC 提示的話題 */
    if(!h){
      for(const v of ch.room.people.filter(v=>v.npc&&R.canSee(ch,v)&&R.MP&&R.MP.canTalk(v))){
        const w=topicWords(v).find(w=>R.lc(w)===k||R.lc(w)===k.split(/\s+/)[0]);
        const r=refChar(ch,v);if(!w||!r)continue;
        h+='<div class="pt">話題「'+esc(w)+'」</div><div class="pa">'+btn('問 '+esc(R.strip(R.PERS(v,ch))),'talk '+r+' '+w,'pri')+'</div>';
      }
    }
    if(!h&&kwKind(k)==='pc'){const n=R.cap(k);h='<div class="pt">'+esc(label)+' <small>玩家</small></div><div class="pa">'+btnFill('密語 '+esc(n)+'…','tell '+n+' ')+btn('線上玩家','who')+'</div>';}
    if(!h){const w=k.split(/\s+/)[0];h='<div class="pt">'+esc(label)+'</div><div class="pa">'+btn('看','look '+w)+btn('說明','help '+w)+'</div>';}
  }
  pop.querySelector('.pb').innerHTML=h;
  pop.classList.add('on');
}
function killMenu(){
  const ch=me();if(!ch||!ch.room)return;
  const ms=ch.room.people.filter(v=>v!==ch&&v.npc&&R.canSee(ch,v));
  let h='<div class="pt">要攻擊誰？</div><div class="pa">';
  h+=ms.map(v=>{const r=refChar(ch,v);return r?btn(esc(R.strip(R.PERS(v,ch)))+' <small>Lv'+v.level+'</small>','kill '+r,'warn')+btn('評估','consider '+r):'';}).join('')||'<span class="hint">這裡沒有可以攻擊的對象。</span>';
  $('pop').querySelector('.pb').innerHTML=h+'</div>';$('pop').classList.add('on');
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
      if(names.length)h='<span class="hint">選擇角色，或在下方輸入新名字：</span>'+names.map(n=>'<button data-raw="'+esc(n)+'" class="pri">'+(R.remember.get(n)?'⚡':'')+esc(n)+'</button>').join('')
        +(R.remember.any()?'<button data-act="forget"><small>忘掉記住的密碼</small></button>':'');
      else h='<span class="hint">在下方輸入英文名字（3~12 個字母）建立新角色</span>';
      break;}
    case 'GET_OLD_PASSWORD':case 'OWNER_PASSWORD':case 'GET_NEW_PASSWORD':case 'CONFIRM_NEW_PASSWORD':
      h='<span class="hint">在下方輸入密碼（至少 5 個字）</span>'
        +(st==='OWNER_PASSWORD'||st==='GET_NEW_PASSWORD'?'':'<button data-act="rem">'+(d.remember===false?'☐':'☑')+' 記住密碼</button>');break;
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

/* ---- 房間／物品劇本的特殊指令（room_command、obj_command） ---- */
function specialButtons(ch,x){
  const ps=(x.progs||(x.proto&&x.proto.programs)||[]).filter(p=>p.trigger==='room_command'||p.trigger==='obj_command');
  const seen=new Set();let h='';
  for(const p of ps){
    const a=String(p.argument||'').trim().split(/\s+/);if(!a[0])continue;
    const isObj=!x.progs&&!x.npc;
    const c=a[1]&&a[1]!=='default'?a[0]+' '+a[1]:a[0]+(isObj?' '+String(x.name||'').split(/\s+/)[0]:'');
    if(seen.has(c))continue;seen.add(c);
    h+=btn(esc(c),c);
  }
  return h;
}
/* ---- 門與容器 ---- */
const DIR_CN=['北','東','南','西','上','下'];
const hasKey=(ch,k)=>k!=null&&k>0&&ch.carrying.some(o=>o.vnum===k);
function doorButtons(ch){
  let h='';
  ch.room.exits.forEach((e,d)=>{
    if(!e||!e.isdoor)return;
    const kw=R.strip(e.kw||'').split(/\s+/)[0]||'門',dir=R.DIRS[d];
    h+='<div class="it"><div class="ih"><span class="sl">'+DIR_CN[d]+'邊</span><span class="nm">'+esc(kw)
      +' <small>'+(e.locked?'鎖著':e.closed?'關著':'開著')+'</small></span></div><div class="ia">';
    if(e.closed&&!e.locked)h+=btn('打開','open '+dir,'pri');
    if(!e.closed)h+=btn('關上','close '+dir)+btn('走過去',dir,'pri');
    if(e.closed&&e.locked){if(hasKey(ch,e.key)||R.isImm(ch))h+=btn('開鎖','unlock '+dir,'pri');
      if(pctOf(ch,R.gsn.pick_lock))h+=btn('撬鎖','pick '+dir);}
    if(e.closed&&!e.locked&&(hasKey(ch,e.key)||R.isImm(ch)))h+=btn('鎖上','lock '+dir);
    if(e.closed&&R.cmds.bash&&pctOf(ch,R.skillLookup('bash door')))h+=btn('撞開','bashdoor '+dir,'warn');
    h+='</div></div>';
  });
  return h;
}
/* 容器的開關鎖按鈕（values[1]：1 可關、4 關著、8 鎖著；values[2] 鑰匙） */
function containerButtons(ch,o,r){
  if(o.type!=='CONTAINER'||!r)return '';
  const v=o.values[1]|0;let h='';
  if(v&4){if(v&8){if(hasKey(ch,o.values[2]))h+=btn('開鎖','unlock '+r,'pri');if(pctOf(ch,R.gsn.pick_lock))h+=btn('撬鎖','pick '+r);}
    else h+=btn('打開','open '+r,'pri')+(hasKey(ch,o.values[2])?btn('鎖上','lock '+r):'');}
  else if(v&1)h+=btn('關上','close '+r);
  return h;
}
/* ---- 商店 ---- */
function shopSection(ch){
  const k=ch.room.people.find(v=>v.npc&&v.shop);if(!k)return '';
  const items=k.carrying.filter(o=>o.wear_loc<0);
  let h='<div class="sec">商店：'+esc(R.strip(R.PERS(k,ch)))+'</div>';
  if(!items.length)return h+'<div class="hint pad">本店目前缺貨。</div>';
  items.forEach((o,i)=>{
    const c=Math.floor(o.cost*k.shop.profit_buy/100),key='buy:'+i,open=openKey===key;
    h+='<div class="it'+(open?' open':'')+'"><div class="ih" data-k="'+key+'"><span class="nm'+(tooHigh(ch,o)||ch.gold<c?' hi':'')+'">'+esc(nm(o))+'</span>'
      +'<span class="tg">'+c+' 金'+(o.level>1?' · Lv'+o.level:'')+'</span></div>'
      +(open?'<div class="ia">'+btn('買一個','buy '+(i+1),'pri')+(o.shopInv?btn('買五個','buy 5 '+(i+1)):'')+'</div>':'')+'</div>';
  });
  return h;
}

/* ---- 指令總表：所有能打的指令都能點；參數用選的 ---- */
/* 參數種類：''不用 / char 房間裡的人 / npc / pc 線上玩家 / inv 身上物品 / wear 穿著的 / here 這裡的物品 / room 地上 /
   door 門或容器 / dir 方向 / text 自己打字 */
const CMD_CAT=[
 ['移動',[['recall','回城'],['rest','休息'],['sleep','睡覺'],['wake','醒來'],['stand','站起'],['scan','掃描四周'],['exits','出口'],['follow','跟隨','char'],['follow self','停止跟隨'],['track','追蹤','text'],['hunt','獵殺','char']]],
 ['資訊',[['look','看四周'],['look','看人物／物品','char'],['examine','檢查物品','here'],['consider','評估對手','npc'],['score','狀態'],['affect','身上法術'],
   ['inventory','物品'],['equipment','裝備'],['who','線上玩家'],['time','時間'],['weather','天氣'],['spells','法術列表'],['slist','技能表'],
   ['areas','區域列表'],['commands','指令列表'],['socials','社交動作列表'],['help','說明','text'],['credits','製作群']]],
 ['物品',[['get all','撿全部'],['get','撿起','room'],['drop','丟掉','inv'],['give','給…','inv'],['wear all','全部穿上'],['wear','穿上','inv'],['remove','脫下','wear'],
   ['remove all','全部脫下'],['eat','吃','inv'],['drink','喝','here'],['quaff','喝藥水','inv'],['recite','念卷軸','inv'],['zap','使用魔杖'],['brandish','揮舞法杖'],
   ['sacrifice','獻祭','room'],['open','打開','door'],['close','關上','door'],['unlock','開鎖','door'],['lock','上鎖','door'],['pick','撬鎖','door'],
   ['list','商店商品'],['sell','賣','inv'],['value','估價','inv']]],
 ['戰鬥',[['kill','攻擊','npc'],['murder','攻擊玩家','char'],['flee','逃跑'],['rescue','解救','char'],['backstab','背刺','npc'],['kick','飛腿'],['bashhead','頭部猛擊'],
   ['disarm','擊落武器'],['berserk','全力猛攻'],['frenzy','狂暴攻擊'],['bashdoor','撞門','dir'],['hide','藏匿'],['sneak','潛行'],['peek','窺視','char'],
   ['steal','偷竊','text'],['wimpy','設定逃跑血量','text']]],
 ['溝通',[['talk','和 NPC 交談','npc'],['say','說話','text'],['chat','閒聊頻道','text'],['question','新手發問','text'],['answer','老手回答','text'],['music','心情點播','text'],
   ['auction','拍賣','text'],['shout','喊叫','text'],['yell','吶喊','text'],['rumor','謠言','text'],['emote','動作','text'],['tell','密語','pc'],['reply','回覆密語','text'],['dice','擲骰子','text']]],
 ['設定',[['save','存檔'],['practice','學技能'],['train','訓練屬性'],['config','設定一覽'],['channels','頻道設定'],['autoexit','自動顯示出口'],['autogold','自動撿錢'],['autoloot','自動撿屍體'],
   ['combine','合併物品'],['blank','空行'],['brief','簡短描述'],['compact','精簡模式'],['prompt','提示列格式','text'],['title','稱號','text'],['password','改密碼','text'],['quit','離開遊戲','warn']]],
];
const cmdOk=(ch,w)=>{const c=w.split(' ')[0];const e=R.CONST.cmds.find(x=>x[0]===c);
  if(e){const lv=typeof e[3]==='number'?e[3]:99;if(lv>ch.level&&!R.isImm(ch))return false;return !!(R.cmds[e[1].replace(/^do_/,'')]||R.cmds[c]);}
  return !!R.cmds[c];};
/* 技能類指令只在學會時顯示 */
const NEED_SKILL={backstab:'backstab',kick:'kick',bashhead:'bashhead',disarm:'disarm',berserk:'berserk',frenzy:'frenzy',hide:'hide',
  sneak:'sneak',peek:'peek',steal:'steal',rescue:'rescue',hunt:'hunt',track:'track',pick:'pick lock',bashdoor:'bash door'};
function argChoices(ch,c,kind){
  const people=ch.room.people.filter(v=>v!==ch&&R.canSee(ch,v));
  const P=(list)=>list.map(v=>{const r=refChar(ch,v);return r?btn(esc(R.strip(R.PERS(v,ch))),c+' '+r,'pri'):'';}).join('')||'<div class="hint">這裡沒有適合的對象。</div>';
  const O=(list,f)=>group(list).map(({o,n})=>{const r=f(o);return r?btn(esc(nm(o))+(n>1?' ×'+n:''),c+' '+r,'pri'):'';}).join('')||'<div class="hint">沒有適合的物品。</div>';
  switch(kind){
    case 'char':return P(people);
    case 'npc':return P(people.filter(v=>v.npc));
    case 'pc':return R.world.players.filter(p=>p.playing&&p!==ch).map(p=>btnFill(esc(p.name),c+' '+p.name+' ')).join('')
      +btnFill('輸入名字…',c+' ')+(R.Sim?'':'');
    case 'inv':return c==='give'?O(ch.carrying.filter(o=>o.wear_loc<0),o=>null)+'<div class="hint">請到「物品」分頁點物品 → 給…</div>':O(ch.carrying.filter(o=>o.wear_loc<0),o=>refCarry(ch,o));
    case 'wear':return O(ch.carrying.filter(o=>o.wear_loc>=0),o=>refWear(ch,o));
    case 'here':return O([...ch.room.contents,...ch.carrying],o=>refHere(ch,o));
    case 'room':return O(ch.room.contents,o=>refRoom(ch,o));
    case 'dir':return R.DIRS.map((d,i)=>ch.room.exits[i]?btn(DIR_CN[i],c+' '+d,'pri'):'').join('');
    case 'door':{
      let h=R.DIRS.map((d,i)=>{const e=ch.room.exits[i];return e&&e.isdoor?btn(DIR_CN[i]+'邊的'+esc(R.strip(e.kw||'門').split(/\s+/)[0]),c+' '+d,'pri'):'';}).join('');
      h+=O([...ch.carrying,...ch.room.contents].filter(o=>o.type==='CONTAINER'&&(o.values[1]&1)),o=>refHere(ch,o));
      return h;}
  }
  return '';
}
let cmdFilter='';
function renderCmds(ch){
  let h='<div class="top"><span class="hint">所有能用的指令；有 ▸ 的要再選對象</span></div>';
  for(const [cat,list] of CMD_CAT){
    let rows='';
    for(const [c,label,kind] of list){
      if(!cmdOk(ch,c))continue;
      const sk=NEED_SKILL[c.split(' ')[0]];if(sk&&!R.isImm(ch)&&!pctOf(ch,R.skillLookup(sk)))continue;
      const k='cmd:'+c+':'+label,open=openKey===k;
      if(!kind||kind==='warn'){rows+=btn(esc(label),c,kind==='warn'?'warn':'');continue;}
      if(kind==='text'){rows+=btnFill(esc(label)+' ✎',c+' ');continue;}
      rows+='<button data-k="'+esc(k)+'" class="'+(open?'cur':'')+'">'+esc(label)+' ▸</button>';
      if(open)rows+='<div class="argrow">'+argChoices(ch,c,kind)+'</div>';
    }
    if(rows)h+='<div class="sec">'+cat+'</div><div class="grid">'+rows+'</div>';
  }
  /* 社交動作 */
  const so=R.CONST.socials;
  const sk='soc',open=openKey&&openKey.startsWith('soc:');
  h+='<div class="sec">社交動作（'+so.length+'）</div><div class="grid soc">';
  for(const x of so){
    const k='soc:'+x[0],isOpen=openKey===k;
    h+='<button data-k="'+esc(k)+'" title="'+esc(R.strip(x[1]||''))+'"'+(isOpen?' class="cur"':'')+'>'+esc(x[0])+'</button>';
    if(isOpen){
      h+='<div class="argrow"><div class="hint">'+esc(R.strip(x[1]||''))+'</div>'+btn('做','​'+x[0],'pri');
      if(x[3])h+=ch.room.people.filter(v=>v!==ch&&R.canSee(ch,v)).map(v=>{const r=refChar(ch,v);return r?btn('對 '+esc(R.strip(R.PERS(v,ch))),x[0]+' '+r):'';}).join('');
      h+='</div>';
    }
  }
  h+='</div>';
  if(R.isImm(ch)){
    h+='<div class="sec">站長指令</div><div class="grid">';
    for(const c of R.CONST.cmds){const lv=typeof c[3]==='number'?c[3]:99;if(lv<36)continue;if(!cmdOk(ch,c[0])||/^[^a-z]/.test(c[0]))continue;h+=btnFill(esc(c[0])+' ✎',c[0]+' ');}
    h+='</div>';
  }
  return h;
}

/* ---- 戰鬥模式：打架時快捷鍵自動換成戰鬥用的 ---- */
/* ---- 平常模式：固定 4 顆，其他按鈕「遇到才出現」 ---- */
const kwOf=v=>{const m=R.strip(R.PERS(v,me())).match(/\(([^()]+)\)\s*$/);return m?m[1]:R.lc(v.name).split(' ')[0];};
function normalKeys(ch){
  const bs=[['物品','@inv',''],['狀態','score',''],['技能','@sk',''],['指令…','@cmd','']];
  if(!ch||!ch.room)return bs;
  const home=R.getRoom(ch.room.area.recall)||R.getRoom(R.ROOM_TEMPLE);
  if(ch.room!==home)bs.push(['回城','recall','']);
  const P=R.POS,pos=ch.position;
  if(pos===P.SLEEPING)bs.push(['醒來','wake','ctx']);
  else if(pos<P.STANDING&&pos>P.SLEEPING)bs.push(['站起','stand','ctx']);
  const npcs=ch.room.people.filter(v=>v!==ch&&v.npc&&R.canSee(ch,v));
  for(const v of npcs){
    if(v.shop&&!bs.some(b=>b[1]==='list'))bs.push(['商店','list','ctx']);
    if(v.act&&v.act.has('TRAIN')&&!bs.some(b=>b[0]==='訓練'))bs.push(['訓練','@ctx:'+kwOf(v),'ctx']);
    if(v.psk&&!bs.some(b=>b[1]==='practice'))bs.push(['學技能','practice','ctx']);
  }
  const talk=npcs.find(v=>R.MP&&R.MP.canTalk(v));
  if(talk)bs.push(['交談','@ctx:'+kwOf(talk),'ctx']);
  if(npcs.some(v=>!v.shop&&!(v.act&&v.act.has('TRAIN'))&&!v.psk))bs.push(['攻擊…','@kill','']);
  if(ch.room.contents.some(o=>R.canSeeObj(ch,o))||(ch.room.progs||[]).some(p=>/command/.test(p.trigger)))bs.push(['地上','@room','']);   /* 地上物品或房間特殊指令 */
  const doors=ch.room.exits.map((e,d)=>e&&e.isdoor&&e.closed?d:-1).filter(d=>d>=0);
  for(const d of doors.slice(0,2))bs.push([(ch.room.exits[d].locked?'開鎖':'開門')+R.DIR_NAME[d],(ch.room.exits[d].locked?'unlock ':'open ')+R.DIRS[d],'ctx']);
  if(pos>=P.STANDING&&!ch.fighting&&(ch.hit<ch.max_hit*0.5||ch.move<ch.max_move*0.3))bs.push(['休息','rest','ctx']);
  else if(pos===P.RESTING&&ch.hit>=ch.max_hit&&ch.move>=ch.max_move&&ch.mana>=ch.max_mana)bs.push(['睡覺','sleep','']);
  return bs.slice(0,9);
}
function renderDir(ch){
  for(const b of document.querySelectorAll('#keys .dir button[data-d]')){
    const e=ch&&ch.room&&ch.room.exits[+b.dataset.d];
    b.classList.toggle('no',!!ch&&!!ch.room&&!e);
    b.classList.toggle('door',!!(e&&e.closed));
  }
}
const keyBtn=([l,c,cls])=>c[0]==='@'
  ?(c.startsWith('@ctx:')?'<button data-ctx="'+esc(c.slice(5))+'" class="'+cls+'">'+esc(l)+'</button>':'<button data-ui="'+c.slice(1)+'"'+(cls?' class="'+cls+'"':'')+'>'+esc(l)+'</button>')
  :'<button data-c="'+esc(c)+'"'+(cls?' class="'+cls+'"':'')+'>'+esc(l)+'</button>';
let combatSig='';
function renderCombatKeys(){
  const box=document.querySelector('#keys .cmds');if(!box)return;
  const ch=me(),f=ch&&ch.fighting&&ch.fighting.room===ch.room;
  renderDir(ch);
  if(!f){
    const bs=normalKeys(ch),sig='N'+bs.map(b=>b.join('|')).join(';');
    if(sig!==combatSig){combatSig=sig;box.classList.remove('combat');box.innerHTML=bs.map(keyBtn).join('');}
    return;}
  const bs=[['逃跑','flee','warn'],['回城','recall','warn']];
  const {sp,act}=learnedList(ch);
  for(const sn of act){const s=SK()[sn],[c,mode]=SKILL_CMD[s.name];if(['fight','none'].includes(mode)&&!['hide','sneak'].includes(s.name))bs.push([s.cname,c,'']);}
  for(const sn of [...sp].reverse()){const s=SK()[sn];if(s.tar===1&&bs.length<11)bs.push([s.cname,castCmd(sn),ch.mana<s.mana?'dis':'sp']);}
  const heals=sp.filter(sn=>/cure|heal/.test(SK()[sn].name)).slice(-1);
  for(const sn of heals)bs.push([SK()[sn].cname,castCmd(sn),ch.mana<SK()[sn].mana?'dis':'heal']);
  for(const {o,n} of group(ch.carrying.filter(o=>o.wear_loc<0&&ITEM_USE[o.type]&&o.type!=='FOOD'))){
    if(bs.length>=15)break;const r=refCarry(ch,o);if(r)bs.push([nm(o).replace(/\(.*\)$/,'')+'×'+n,ITEM_USE[o.type][0]+' '+r,'heal']);}
  bs.push(['狀態','score',''],['技能…','@sk','']);
  const sig=bs.map(b=>b.join('|')).join(';');
  if(sig===combatSig)return;
  combatSig=sig;box.classList.add('combat');
  box.innerHTML=bs.map(keyBtn).join('');
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
  a+=containerButtons(ch,o,refHere(ch,o));
  a+=specialButtons(ch,o);
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
  const doors=doorButtons(ch);if(doors)h+='<div class="sec">門</div>'+doors;
  const sp=specialButtons(ch,ch.room);if(sp)h+='<div class="sec">這裡可以做的事</div><div class="grid">'+sp+'</div>';
  h+=shopSection(ch);
  if(list.length&&(doors||shopHere(ch)))h+='<div class="sec">地上</div>';
  if(!list.length)return h+(doors||shopHere(ch)?'':'<div class="hint pad">地上什麼都沒有。</div>');
  for(const {o,n} of group(list)){
    h+=row(ch,o,n,esc(TYPE[o.type]||''),()=>{
      const r=refRoom(ch,o),rh=refHere(ch,o);let a='';
      if(r&&o.wear.has('TAKE'))a+=btn('撿起','get '+r,'pri');
      a+=containerButtons(ch,o,rh);
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
  body.innerHTML=tab==='inv'?renderInv(ch):tab==='eq'?renderEq(ch):tab==='sk'?renderSkills(ch):tab==='cmd'?renderCmds(ch):renderRoom(ch);
  body.scrollTop=st;
}
function openSheet(t){
  if(t==='kill'){killMenu();return;}
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
    if(b.dataset.k&&b.tagName==='BUTTON'){openKey=openKey===b.dataset.k?null:b.dataset.k;renderSheet();return;}
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
    if(b.dataset.c){giveFor=putFor=null;send(b.dataset.c.replace(/^\u200b/,''));}
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
  chs.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.act){const d=Conn.desc;
      if(b.dataset.act==='rem'&&d)d.remember=d.remember===false;
      if(b.dataset.act==='forget')R.remember.clear();
      lastCh='';renderChoices();return;}
    if(b.dataset.raw!==undefined)window.UI.raw(b.dataset.raw);});
  Term.linkify=linkify;
  const pe=$('pins');
  pe.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
  pe.addEventListener('click',e=>{const b=e.target.closest('button');const ch=me();if(!b||!ch)return;const p=getPins(ch)[+b.dataset.i];if(p)runPin(ch,p);});
  /* 有新輸出時更新（同一個畫格只算一次） */
  let q=false;
  const w=Term.write;
  Term.write=function(s){w.call(Term,s);if(!q){q=true;requestAnimationFrame(()=>{q=false;renderStat();renderPins();renderChoices();renderCombatKeys();renderSheet();});}};
  setInterval(()=>{renderStat();renderPins();renderCombatKeys();},1000);
}
window.UIPanel={open:openSheet,close:closeSheet,init,ctx:kw=>ctxMenu(kw,kw)};
})(ROC);
