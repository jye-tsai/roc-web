/* mprog.js — NPC／房間／物品劇本（對應 mob_prog.c、room_prog、obj_prog）
   原始碼沒有一起移植，語意是依資料檔 18,855 段劇本的實際用法推斷，標「推測」的地方都是這樣來的。
   劇本語法：if／or／and／else／endif／break，條件 name(參數) 比較子 值；$n $i $I … 代換。 */
(function(R){
const C=R.C,W=R.world,P=R.POS,cmd=R.cmds;
const MP=R.MP={};
let warned={};
const warn=(k,m)=>{if(warned[k])return;warned[k]=1;console.warn('[劇本] '+m);};

/* ---------- 編譯：每段劇本切成行，快取在劇本物件上 ---------- */
function lines(p){
  if(!p._l)p._l=String(p.script||'').split('\n').map(s=>s.trim()).filter(Boolean);
  return p._l;
}
const progsOf=x=>!x?[]:x.npc?(x.proto&&x.proto.programs)||[]:x.progs?x.progs:(x.proto&&x.proto.programs)||[];

/* ---------- 情境 ---------- */
/* kind: mob／room／obj；self 是劇本主人；n 觸發者；o 物品；v 第二個人（受害者、對手）；b 記住的人 */
function mk(kind,self,n,o,v,extra){
  const c={kind,self,n:n||null,o:o||null,v:v||null,depth:0,...(extra||{})};
  if(kind==='mob'){c.mob=self;c.b=self.rembch||null;}
  if(kind==='obj'&&!c.o)c.o=self;
  return c;
}
function roomOf(c){
  if(c.at)return c.at;
  if(c.kind==='mob')return c.self.room;
  if(c.kind==='room')return c.self;
  const o=c.self;let x=o;
  while(x&&x.in_obj)x=x.in_obj;
  return x?(x.carried_by?x.carried_by.room:x.in_room):null;
}
const carrier=o=>{let x=o;while(x&&x.in_obj)x=x.in_obj;return x&&x.carried_by||null;};
function randPc(c){
  const r=roomOf(c);if(!r)return null;
  const ps=r.people.filter(p=>!p.npc&&p.playing&&(c.kind!=='mob'||R.canSee(c.self,p)));
  return ps.length?ps[R.rand(0,ps.length-1)]:null;
}
const nameOf=x=>!x?'某人':x.npc?String(x.name||'').split(/\s+/)[0]:x.name;
const shortOf=x=>!x?'某人':x.npc?x.short:x.name;
const oName=o=>o?String(o.name||'').split(/\s+/)[0]:'某物';

/* ---------- $ 代換 ---------- */
function varChar(c,ch){
  switch(ch){
    case 'n':case 'N':return c.n;
    case 'i':case 'I':return c.kind==='mob'?c.self:null;
    case 'r':case 'R':if(c.r===undefined)c.r=randPc(c);return c.r;
    case 'b':case 'B':return c.kind==='mob'?c.self.rembch||null:c.b||null;
    case 'v':case 'V':case 't':case 'T':return c.v;
  }
  return undefined;
}
function subst(s,c){
  return String(s).replace(/\$([a-zA-Z])/g,(m,k)=>{
    if(k==='o')return oName(c.o);
    if(k==='O')return c.o?c.o.short:'某物';
    if(k==='I'&&c.kind==='obj')return c.self.short;
    if(k==='I'&&c.kind==='room')return c.self.name;
    const x=varChar(c,k);
    if(x===undefined){
      if('eEmMsS'.includes(k)){const t=c.n;const he=!t?'它':t.sex===2?'她':t.sex===1?'他':'它';return he;}
      return m;
    }
    return k===k.toUpperCase()?shortOf(x):nameOf(x);
  });
}
/* 把 token 變成人物：$n、self、名字（- 當空白） */
function tokChar(t,c){
  if(!t)return null;
  if(t[0]==='$'&&t.length===2){const x=varChar(c,t[1]);return x===undefined?null:x;}
  if(t==='self')return c.kind==='mob'?c.self:null;
  const nm=t.replace(/-/g,' ');
  const r=roomOf(c);
  const live=x=>x&&!x.deleted&&x.room;
  if(r){const v=r.people.find(p=>R.is_name(nm,p.npc?p.name:p.name));if(live(v))return v;}
  const pl=W.players.find(p=>p.playing&&R.lc(p.name)===R.lc(nm));if(pl)return pl;
  const m=W.chars.find(p=>live(p)&&R.is_name(nm,p.name));
  return m||null;
}
function tokObj(t,c,list){
  if(!t)return null;
  if(t==='$o'||t==='$O')return c.o;
  if(t==='self'&&c.kind==='obj')return c.self;
  const nm=t.replace(/-/g,' ');
  const pool=list||[...(c.kind==='mob'?c.self.carrying:[]),...(roomOf(c)?roomOf(c).contents:[])];
  return pool.find(o=>R.is_name(nm,o.name))||null;
}

/* ---------- 任務標記（qmark） ---------- */
/* ch.qmarks[名稱]={t:timer(-1 永久),v:[v0,v1,v2],d:死亡時清除,s:存檔} */
const QF=['t','v0','v1','v2'];
function qGet(ch,name){return ch&&ch.qmarks&&ch.qmarks[name]||null;}
function qField(q,f){if(!q)return 0;if(f==='timer'||f==='t')return q.t;const i=+String(f).replace(/^v/,'');return q.v[i]|0;}
function qSet(q,f,val){if(f==='timer'||f==='t'){q.t=val;return;}if(f==='death'){q.d=!!val;return;}if(f==='save'){q.s=!!val;return;}const i=+String(f).replace(/^v/,'');if(i>=0&&i<3)q.v[i]=val;}
function qAdd(ch,name,a){
  if(!ch)return;ch.qmarks=ch.qmarks||{};
  if(ch.qmarks[name])return;   /* 推測：已存在就不覆蓋（劇本都先判斷 != 才 add） */
  const n=k=>parseInt(a[k],10)||0;
  ch.qmarks[name]={t:a[0]===undefined?-1:n(0),v:[n(1),n(2),n(3)],d:!!n(4),s:a[5]===undefined?true:!!n(5)};
}
function qMod(ch,name,f,op,val){
  const q=qGet(ch,name);if(!q)return;
  const cur=qField(q,f),v=parseInt(val,10)||0;
  let nv=cur;
  switch(op){case '=':nv=v;break;case '+':nv=cur+v;break;case '-':nv=cur-v;break;case '|':nv=bitOr(cur,v);break;
    case '&':nv=bitAnd(cur,v);break;case 'r':nv=R.rand(0,Math.max(0,v));break;   /* 推測：r = 隨機 */
    case '^':nv=bitXor(cur,v);break;}
  qSet(q,f,nv);
}
/* 位元運算（數值可能超過 32 位元） */
const bitAnd=(a,b)=>{let r=0,m=1;a=Math.floor(Math.abs(a));b=Math.floor(Math.abs(b));while(a>0&&b>0){if(a%2&&b%2)r+=m;a=Math.floor(a/2);b=Math.floor(b/2);m*=2;}return r;};
const bitOr=(a,b)=>a+b-bitAnd(a,b);
const bitXor=(a,b)=>a+b-2*bitAnd(a,b);
MP.qTick=function(ch){
  if(!ch.qmarks)return;
  for(const [k,q] of Object.entries(ch.qmarks)){if(q.t>0&&--q.t===0)delete ch.qmarks[k];}
};
MP.qDeath=function(ch){if(!ch.qmarks)return;for(const [k,q] of Object.entries(ch.qmarks))if(q.d)delete ch.qmarks[k];};
MP.qSave=ch=>{const o={};for(const [k,q] of Object.entries(ch.qmarks||{}))if(q.s)o[k]=[q.t,q.v[0],q.v[1],q.v[2],q.d?1:0];return o;};
MP.qLoad=(ch,d)=>{ch.qmarks={};for(const [k,a] of Object.entries(d||{}))ch.qmarks[k]={t:a[0],v:[a[1]|0,a[2]|0,a[3]|0],d:!!a[4],s:true};};

/* ---------- 狀態效果的位元 ↔ 名稱（Envy／ROC 的 AFF_*） ---------- */
const AFF_BITS={1:'BLIND',2:'INVISIBLE',4:'DETECT_EVIL',8:'DETECT_INVIS',16:'DETECT_MAGIC',32:'DETECT_HIDDEN',64:'HOLD',
  128:'SANCTUARY',256:'FAERIE_FIRE',512:'INFRARED',1024:'CURSE',2048:'CHANGE_SEX',4096:'POISON',8192:'PROTECT',16384:'POLYMORPH',
  32768:'SNEAK',65536:'HIDE',131072:'SLEEP',262144:'CHARM',524288:'FLYING',1048576:'PASS_DOOR',2097152:'WATERWALK',4194304:'SUMMONED',
  8388608:'MUTE',16777216:'SEAL_MAGIC',33554432:'VAMP_BITE',67108864:'GHOUL',134217728:'FLAMING',268435456:'PARALYZED',
  536870912:'TREMOR',1073741824:'WEAKEN',1099511627776:'TARDY'};
const bitName=b=>AFF_BITS[b]||('BIT_'+b);
function affBits(ch){
  let n=0;
  for(const [b,nm] of Object.entries(AFF_BITS))if(ch.aff.has(nm))n+=+b;
  for(const a of ch.aff)if(/^BIT_\d+$/.test(a))n+=+a.slice(4);
  return n;
}
/* APPLY_* 數字 → 引擎的 location 名稱（推測：25 以後是 ROC 自訂，對不上的就只套位元） */
const APPLY={1:'STR',2:'DEX',3:'INT',4:'WIS',5:'CON',6:'SEX',12:'MANA',13:'HIT',14:'MOVE',17:'AC',18:'HITROLL',19:'DAMROLL',
  20:'SAVING_PARA',23:'SAVING_BREATH',24:'SAVING_SPELL'};
const skillOf=s=>{s=String(s||'').replace(/^'|'$/g,'');if(/^\d+$/.test(s))return +s;return R.skillLookup(s);};

/* ---------- 比較 ---------- */
function cmp(a,op,b){
  if(typeof a==='string'||typeof b==='string'){
    a=R.lc(String(a));b=R.lc(String(b));
    if(op==='=='||op==='=')return a===b;
    if(op==='!=')return a!==b;
    return false;
  }
  a=+a||0;b=+b||0;
  switch(op){
    case '==':case '=':return a===b;case '!=':return a!==b;case '>':return a>b;case '<':return a<b;
    case '>=':return a>=b;case '<=':return a<=b;case '&':return bitAnd(a,b)!==0;case '!&':return bitAnd(a,b)===0;
    case '|':return bitOr(a,b)!==0;
  }
  return false;
}
const OPS=['==','!=','>=','<=','!&','>','<','&','|','='];
function splitOp(rest){
  rest=rest.trim();
  for(const o of OPS)if(rest.startsWith(o))return [o,rest.slice(o.length).trim()];
  return [null,rest];
}
/* 比較用的人物數值 */
const STAT={str:0,int:1,wis:2,dex:3,con:4};
function charNum(fn,x){
  switch(fn){
    case 'hitprcnt':case 'hitprcn':return x.max_hit>0?Math.floor(x.hit*100/x.max_hit):0;
    case 'manaprcnt':return x.max_mana>0?Math.floor(x.mana*100/x.max_mana):0;
    case 'moveprcnt':return x.max_move>0?Math.floor(x.move*100/x.max_move):0;
    case 'hpnum':return x.hit;case 'mpnum':return x.mana;case 'mvnum':return x.move;
    case 'hpmax':return x.max_hit;case 'mpmax':return x.max_mana;case 'mvmax':return x.max_move;
    case 'level':return x.level;case 'sex':return x.sex;case 'position':return x.position;case 'class':return x.cls;
    case 'goldamt':return x.gold;case 'exp':case 'realexp':return x.exp||0;case 'align':return x.alignment||0;
    case 'practice':return x.practice||0;case 'resp':return x.resp||0;case 'skexp':case 'skillexp':return x.skexp||0;
    case 'carrycount':case 'carrynum':return R.carryN?R.carryN(x):x.carrying.length;
    case 'maxcarrynum':return R.canCarryN?R.canCarryN(x):99;
    case 'maxweight':case 'canweight':return R.canCarryW?R.canCarryW(x):999;
    case 'weight':case 'pcweight':return R.carryW?R.carryW(x):0;
    case 'armor':return x.armor;case 'dodge':return x.dodge||0;case 'pp':return x.pp||0;
    case 'wp_hr':case 'wp2_hr':case 'hr':return x.hitroll||0;case 'wp_dr':case 'wp2_dr':case 'dr':case 'pdr':case 'apdr':return x.damroll||0;
    case 'mdr':case 'amdr':return 0;
    case 'fightvnum':return x.fighting&&x.fighting.npc?x.fighting.vnum:0;
    case 'isaffected':case 'is_affacted':return affBits(x);
    case 'is_autocombat':return 0;case 'ishorse':return 0;case 'isdrunk':return 0;case 'size':case 'race_size':case 'aff_size':return 3;
  }
  if(fn in STAT)return R.stat?R.stat(x,STAT[fn]):13;
  if(/^max_(str|int|wis|dex|con)$/.test(fn))return 25;
  if(/^sv_/.test(fn))return 0;
  return undefined;
}
function countIn(list,vnum){return list.filter(x=>!x.deleted&&x.vnum===vnum).length;}

/* ---------- 條件判斷 ---------- */
function ifcheck(expr,c){
  const m=/^(!?)\s*([a-zA-Z_0-9]+)\s*\(([^)]*)\)\s*(.*)$/.exec(expr.trim());
  if(!m){warn('if:'+expr,'看不懂的條件：'+expr);return false;}
  const [,neg,fn0,arg0,rest]=m;
  const fn=fn0.toLowerCase(),arg=arg0.trim();
  const r=evalCheck(fn,arg,rest,c);
  return neg?!r:r;
}
function evalCheck(fn,arg,rest,c){
  const [op,val]=splitOp(rest);
  const room=roomOf(c);
  const x=arg[0]==='$'||arg==='self'||/^[A-Za-z]/.test(arg)?tokChar(arg,c):null;
  const vtoks=val.split(/\s+/).filter(Boolean);
  const num=v=>parseInt(v,10)||0;
  /* 比較對象是人物（fightwith($i) == $n） */
  const cmpChar=(a)=>{const b=tokChar(vtoks[0],c);return op==='!='?a!==b:a===b;};
  switch(fn){
    case 'rand':case 'rnad':case 'ran':return R.pct()<=num(arg);
    case 'ispc':return !!x&&!x.npc;
    case 'isnpc':return !!x&&x.npc;
    case 'isgood':return !!x&&R.isGood(x);
    case 'isevil':return !!x&&R.isEvil(x);
    case 'isneutral':return !!x&&R.isNeutral(x);
    case 'isfight':case 'is_fight':return !!x&&!!x.fighting;
    case 'isimmort':return !!x&&!x.npc&&R.isImm(x);
    case 'ischarmed':return !!x&&x.aff.has('CHARM');
    case 'isfollow':return !!x&&!!x.master&&x.master.room===x.room;
    case 'isfly':return !!x&&x.aff.has('FLYING');
    case 'isgroup':return !!x&&!!(x.leader||x.master);
    case 'can_see':return !!x&&c.kind==='mob'&&R.canSee(c.self,x);
    case 'insameroom':return !!x&&!!room&&x.room===room;
    case 'being':return !!x;
    case 'notbeing':return !x;
    case 'rembch':return !!x&&c.kind==='mob'&&c.self.rembch===x;
    case 'fightwith':return !!x&&cmpChar(x.fighting||null);
    case 'followwith':return !!x&&cmpChar(x.master||null);
    case 'groupwith':return !!x&&cmpChar(x.leader||x.master||null);
    case 'is_qmark':{
      if(!x)return op==='!='||op==='!&';
      const name=vtoks[0];if(!name)return !!x.qmarks&&Object.keys(x.qmarks).length>0;
      const q=qGet(x,name);
      if(vtoks.length<2){return op==='!='?!q:!!q;}   /* 只問有沒有 */
      if(!q)return op==='!='||op==='!&';
      const n=num(vtoks[1]),f=QF[Math.floor(n/100000)]||'v0',v=n%100000;
      return cmp(qField(q,f),op,v);
    }
    case 'name':{const hit=!!x&&R.is_name((vtoks.join(' ')||'').replace(/-/g,' '),x.name);return op==='!='?!hit:hit;}
    case 'race':return !!x&&cmp(R.CONST.races[x.race]?R.CONST.races[x.race].name:'',op,vtoks[0]||'');
    case 'vnum':return !!x&&cmp(x.vnum||0,op,num(vtoks[0]));
    case 'area':{const a=x?x.room&&x.room.area:room&&room.area;return !!a&&cmp(a.id,op,vtoks[0]||'');}
    case 'inroom':return !!x&&!!x.room&&cmp(x.room.vnum,op,num(vtoks[0]));
    case 'is_equ_obj':case 'is_wear_obj':{if(!x)return op==='!=';const has=x.carrying.some(o=>o.wear_loc>=0&&o.vnum===num(vtoks[0]));return op==='!='?!has:has;}
    case 'is_inv_obj':{if(!x)return op==='!=';const has=x.carrying.some(o=>o.vnum===num(vtoks[0]));return op==='!='?!has:has;}
    case 'is_equ_loc':case 'is_wear_loc':{if(!x)return false;const has=x.carrying.some(o=>o.wear_loc===num(vtoks[0]));return op==='!='?!has:has;}
    case 'is_equip':{const o=tokObj(arg,c);return !!o&&o.wear_loc>=0;}
    case 'learned':return !!x&&cmp(R.getSkillPercent(x,num(vtoks[0])),op,num(vtoks[1]));
    case 'skexp_dif':return false;
    case 'primeattr':case 'sndattr':return false;
    /* 世界／房間計數 */
    case 'hour':return cmp(R.time.hour,op,num(vtoks[0]));
    case 'day':return cmp(R.time.day,op,num(vtoks[0]));
    case 'month':return cmp(R.time.month,op,num(vtoks[0]));
    case 'weather':return cmp(R.weather.sky,op,num(vtoks[0]));
    case 'pcnum':return cmp(room?room.people.filter(p=>!p.npc&&p.playing).length:0,op,num(vtoks[0]));
    case 'npcnum':return cmp(room?room.people.filter(p=>p.npc).length:0,op,num(vtoks[0]));
    case 'rnplayer':return cmp(room?room.people.filter(p=>!p.npc&&p.playing).length:0,op,num(vtoks[0]));
    case 'nplayer':case 'oplayer':return cmp(W.players.filter(p=>p.playing).length,op,num(vtoks[0]));
    case 'mobcount':{const p=W.mobs[num(arg)];return cmp(p?W.chars.filter(m=>!m.deleted&&m.room&&m.proto===p).length:0,op,num(vtoks[0]));}
    case 'rmobcount':return cmp(room?countIn(room.people,num(arg)):0,op,num(vtoks[0]));
    case 'amobcount':{const a=room&&room.area;return cmp(a?a.rooms.reduce((s,r)=>s+countIn(r.people,num(arg)),0):0,op,num(vtoks[0]));}
    case 'robjcount':case 'robjcount_a':return cmp(room?countIn(room.contents,num(arg)):0,op,num(vtoks[0]));
    case 'objcount':return cmp(W.objects.filter(o=>!o.deleted&&o.vnum===num(arg)).length,op,num(vtoks[0]));
    case 'aobjcount':case 'aobjcount_a':{const a=room&&room.area;return cmp(a?a.rooms.reduce((s,r)=>s+countIn(r.contents,num(arg)),0):0,op,num(vtoks[0]));}
    case 'mpcount':return false;
    case 'roomvalue':{const i=num(arg.replace('$',''));return cmp(room&&room.rv?room.rv[i]|0:0,op,num(vtoks[0]));}
    case 'roomtimer':{const i=num(arg.replace('$',''));return cmp(room&&room.rt?room.rt[i]|0:0,op,num(vtoks[0]));}
    case 'roomflag':return !!room&&cmp(0,op,num(vtoks[0]));
    case 'sector':return !!room&&cmp(room.sector,op,num(vtoks[0]));
    case 'isdark':return !!room&&!!R.roomDark&&R.roomDark(room);
    case 'islight':return !!room&&!(R.roomDark&&R.roomDark(room));
    case 'lightnum':return cmp(0,op,num(vtoks[0]));
    case 'hasdoor':{const e=room&&room.exits[num(arg)];return !!e;}
    case 'exitinfo':{const e=room&&room.exits[num(arg.replace('$',''))];if(!e)return cmp(0,op,num(vtoks[0]));
      const f=(e.isdoor?1:0)+(e.closed?2:0)+(e.locked?4:0);return cmp(f,op,num(vtoks[0]));}
    case 'roomchar':case 'rmax_char':return false;
    case 'groupsize':case 'group_num':case 'group_pcnum':return cmp(1,op,num(vtoks[0]));
    /* 物品 */
    case 'objtype':{const o=tokObj(arg,c);return !!o&&cmp(o.type,op,vtoks[0]||'');}
    case 'objval0':case 'objval1':case 'objval2':case 'objval3':{const o=tokObj(arg,c);return !!o&&cmp(o.values[+fn.slice(-1)]|0,op,num(vtoks[0]));}
    case 'objextra':case 'objflag':return false;
    case 'objweight':{const o=tokObj(arg,c);return !!o&&cmp(o.weight,op,num(vtoks[0]));}
    case 'material':{const o=tokObj(arg,c);return !!o&&cmp(o.material||'',op,vtoks[0]||'');}
    case 'level':if(arg==='$o'||arg==='$O'){const o=tokObj(arg,c);return !!o&&cmp(o.level,op,num(vtoks[0]));}break;
    case 'cancarry':return !!x&&(!R.canCarryN||R.carryN(x)<R.canCarryN(x));
    case 'mpnum':break;
  }
  if(x){const v=charNum(fn,x);if(v!==undefined)return cmp(v,op,num(vtoks[0]));}
  if(!x&&(arg[0]==='$'||arg==='self')&&charNum(fn,{aff:new Set(),carrying:[],armor:0,cls:0,position:0,sex:0,level:0,hit:0,max_hit:1,mana:0,max_mana:1,move:0,max_move:1,gold:0})!==undefined)return false;
  warn('fn:'+fn,'還沒支援的條件：'+fn+'('+arg+')');
  return false;
}

/* ---------- 執行 ---------- */
MP.run=function(p,c){
  const L=lines(p);
  if(++c.depth>12){warn('deep','劇本呼叫太深，停止');return;}
  const st=[];   /* {on:這層是否執行中, cond, parentOn} */
  const on=()=>st.length?st[st.length-1].on:true;
  for(let i=0;i<L.length;i++){
    const ln=L[i],w=ln.split(/\s+/)[0].toLowerCase();
    if(w==='if'){
      const parentOn=on();let cond=parentOn?ifcheck(ln.slice(2),c):false;
      while(i+1<L.length&&/^(or|and)\s/i.test(L[i+1])){
        i++;const l2=L[i],isOr=/^or/i.test(l2);
        if(parentOn)cond=isOr?(cond||ifcheck(l2.slice(2),c)):(cond&&ifcheck(l2.slice(3),c));
      }
      st.push({on:parentOn&&cond,cond,parentOn});continue;
    }
    if(w==='or'||w==='and')continue;
    if(w==='else'){const f=st[st.length-1];if(f)f.on=f.parentOn&&!f.cond;continue;}
    if(w==='endif'){st.pop();continue;}
    if(!on())continue;
    if(w==='break')return 'break';
    try{exec(ln,c);}catch(e){console.error('[劇本]',ln,e);}
    if(c.kind==='mob'&&(c.self.deleted||!c.self.room))return;
    if(c.kind==='obj'&&c.self.deleted)return;
  }
};

/* ---------- 延遲執行（callout） ---------- */
/* 推測：一個單位 = PULSE_CALL_OUT（3 秒，見 magic.js） */
const callQ=[];
MP.pulse=function(){
  if(!callQ.length)return;
  for(const q of [...callQ]){
    if(--q.t>0)continue;
    callQ.splice(callQ.indexOf(q),1);
    const c=q.c;
    if(c.kind==='mob'&&(c.self.deleted||!c.self.room))continue;
    if(c.kind==='obj'&&c.self.deleted)continue;
    try{exec(q.line,c);}catch(e){console.error('[劇本 callout]',q.line,e);}
  }
};

/* ---------- 指令 ---------- */
const sendRoom=(room,s,except)=>{if(!room)return;for(const p of room.people)if(p!==except&&!p.npc)R.send(p,s+C.NOR+'\n');};
function restAfter(ln,n){   /* 去掉前 n 個字 */
  let s=ln.trim();for(let i=0;i<n;i++){s=s.replace(/^\S+\s*/,'');}return s;
}
function exec(ln0,c){
  const ln=ln0.trim();
  const t=ln.split(/\s+/);
  let w=t[0].toLowerCase();
  if(ALIAS[w])w=ALIAS[w];
  let base=w.startsWith('mp')&&CMD[w.slice(2)]?w.slice(2):w;
  if(base==='c')base='cast';
  if(/^(mp|o|op)?forcer$/.test(w)){runForcer(ln,c);return;}
  const f=CMD[base];
  if(f){f(t,ln,c);return;}
  /* 其他的當成一般遊戲指令，由 NPC 本身執行 */
  if(c.kind==='mob'){R.interpret(c.self,subst(ln,c));return;}
  if(c.kind==='obj'&&(base==='cast')){objCast(t,c);return;}
  if(base==='say'){CMD.echo(t,ln,c);return;}   /* 房間／物品沒有嘴巴：當成 echo（推測） */
  warn('cmd:'+w,'還沒支援的劇本指令：'+w);
}
/* mpforcer here <cmd>／oforcer here <cmd>：交給房間（或物品自己）執行 */
function runForcer(ln,c){
  const t=ln.split(/\s+/),who=t[1]||'here',rest=restAfter(ln,2);
  if(who==='here'||who==='room'){const r=roomOf(c);if(!r)return;exec(rest,{...c,kind:'room',self:r,at:null});return;}
  if(who==='self'){exec(rest,c);return;}
  if(/^\d+$/.test(who)){const r=R.getRoom(+who);if(r)exec(rest,{...c,kind:'room',self:r,at:null});return;}
  const v=tokChar(who,c);if(v&&v.npc)exec(rest,{...c,kind:'mob',self:v,mob:v});
}
function objCast(t,c){
  /* cast 'fireball' $v 40 ／ cast 2 powerball $v 40 */
  let i=1;if(/^\d+$/.test(t[i])&&t[i+1])i++;
  let sp=t[i];if(sp&&sp[0]==="'"){let s=sp;while(!s.endsWith("'")&&i+1<t.length){i++;s+=' '+t[i];}sp=s.replace(/'/g,'');}
  const sn=R.skillLookup(sp);if(sn<=0)return;
  const v=tokChar(t[i+1],c)||c.v||c.n;
  const lv=parseInt(t[i+2],10)||(c.kind==='obj'?c.self.level:30)||30;
  const caster=c.kind==='obj'?carrier(c.self)||c.n:c.n;
  if(!caster||!caster.room)return;
  const s=R.SK[sn];const vo=[1,2,3].includes(s.tar)?v||caster:null;
  R.castSpell(sn,lv,caster,vo);
  if(s.tar===1&&v&&!v.deleted&&v!==caster&&v.room===caster.room&&!v.fighting&&v.position>P.DEAD)R.multiHit(v,caster);
}
function loadObj(t,c){
  const vnum=parseInt(t[1],10),p=W.objs[vnum];if(!p){warn('obj'+vnum,'沒有這個物品 '+vnum);return null;}
  let lv=0,to=null,mode='';
  for(const x of t.slice(2)){if(/^-?\d+$/.test(x))lv=+x;else if(x[0]==='$'||x==='self')to=tokChar(x,c);else mode=x;}
  const o=R.createObject(p,lv||undefined);
  MP.objRepop(o);
  if(mode==='floor'||(!to&&c.kind!=='mob')){const r=roomOf(c);if(r)R.objToRoom(o,r);else R.extractObj(o);return o;}
  if(mode==='target'&&to){R.objToChar(o,to);return o;}
  if(c.kind==='mob'){R.objToChar(o,c.self);return o;}
  const r=roomOf(c);if(r)R.objToRoom(o,r);
  return o;
}
function purge(t,ln,c){
  const a=t[1];const room=roomOf(c);
  if(!a){   /* 清空房間的 NPC 與物品（自己除外） */
    if(!room)return;
    for(const v of [...room.people])if(v.npc&&v!==c.self)R.extractChar(v);
    for(const o of [...room.contents])if(o!==c.self)R.extractObj(o);
    return;
  }
  if(a==='self'){if(c.kind==='mob'){c.self.rembch=null;R.extractChar(c.self);}else if(c.kind==='obj')R.extractObj(c.self);return;}
  if(a[0]==='$'&&t[2]){   /* purge $n 物品：拿走某人身上的東西 */
    const v=tokChar(a,c);if(!v)return;
    const o=tokObj(t[2],c,v.carrying);if(o)R.extractObj(o);return;
  }
  if(a==='$o'||a==='$O'){if(c.o&&!c.o.deleted)R.extractObj(c.o);return;}
  if(/^all\./.test(a)&&room){const nm=a.slice(4).replace(/-/g,' ');for(const o of [...room.contents])if(R.is_name(nm,o.name))R.extractObj(o);return;}
  const v=tokChar(a,c);
  if(v&&v.npc){v.rembch=null;R.extractChar(v);return;}
  const o=tokObj(a,c);if(o)R.extractObj(o);
}
function transfer(who,dest,c){
  const room=roomOf(c);
  const to=/^\d+$/.test(dest)?R.getRoom(+dest):(tokChar(dest,c)||{}).room;
  if(!to)return;
  let list=[];
  if(who==='all'||who==='pc')list=room?room.people.filter(p=>who==='all'||(!p.npc&&p.playing)):[];
  else{const v=tokChar(who,c);if(v)list=[v];}
  for(const v of [...list]){
    if(v.fighting)R.stopFighting(v,true);
    R.charFromRoom(v);R.charToRoom(v,to);
  }
}
/* modhmv 目標 XY.A B 旗標；X：0 生命 1 法力 2 移動；Y：1 扣定量 2 加定量 3 扣百分比 4 加百分比（推測） */
function modhmv(t,c){
  const who=t[1],spec=t[2]||'',m=/^(\d)(\d)\.(\d+)$/.exec(spec);if(!m)return;
  const st=+m[1],op=+m[2],a=+m[3],b=parseInt(t[3],10)||a;
  let list=[];const room=roomOf(c);
  if(who==='pc'||who==='all')list=room?room.people.filter(p=>who==='all'?true:(!p.npc&&p.playing)):[];
  else{const v=tokChar(who,c);if(v)list=[v];}
  for(const v of list){
    const [cur,max]=st===0?['hit','max_hit']:st===1?['mana','max_mana']:['move','max_move'];
    const amt=R.rand(Math.min(a,b),Math.max(a,b));
    let d=0;
    if(op===1||op===0)d=-amt;else if(op===2)d=amt;else if(op===3)d=-Math.floor(v[max]*amt/100);else if(op===4)d=Math.floor(v[max]*amt/100);
    v[cur]=Math.min(v[max],v[cur]+d);
    if(st===0){
      if(v.hit<=0&&d<0){
        if(v.npc||!R.isImm(v)){v.hit=Math.min(v.hit,-11);R.updatePos(v);if(v.position===P.DEAD)R.damage(v,v,0,0,0,-2);}
        else v.hit=1;
      }
    }else if(v[cur]<0)v[cur]=0;
  }
}
function addAffect(t,c){
  /* add_affect 目標 '法術' 等級 時間 位置 數值 位元 */
  let i=2,sp=t[2]||'';
  if(sp[0]==="'"){while(!sp.endsWith("'")&&i+1<t.length){i++;sp+=' '+t[i];}}
  const v=tokChar(t[1],c);if(!v)return;
  const sn=skillOf(sp);if(sn<=0)return;
  const dur=parseInt(t[i+2],10),loc=APPLY[parseInt(t[i+3],10)]||'NONE',mod=parseInt(t[i+4],10)||0,bv=parseInt(t[i+5],10)||0;
  R.affectToChar(v,{type:sn,duration:isNaN(dur)?10:dur<0?9999:dur,location:loc,modifier:loc==='NONE'?0:mod,bitvector:bv?bitName(bv):null});
}
function delAffect(t,c){
  const v=tokChar(t[1],c);if(!v)return;
  const sp=restAfter(t.join(' '),2).replace(/'/g,'');
  if(sp==='all'){for(const a of [...(v.affects||[])])R.affectRemove(v,a);return;}
  const sn=skillOf(sp);if(sn>0)R.affectStrip(v,sn);
}
function doorCmd(kind,t,c){
  const room=roomOf(c);if(!room)return;
  const d=parseInt(t[1],10);if(!(d>=0&&d<6))return;
  if(kind==='del'){room.exits[d]=null;return;}
  if(kind==='make'){
    /* makedoor 方向 描述 關鍵字 旗標 鑰匙 目的地 */
    const to=parseInt(t[t.length-1],10),key=parseInt(t[t.length-2],10),flags=parseInt(t[t.length-3],10)||0,kw=t[t.length-4]||'door';
    const desc=t.slice(2,t.length-4).join(' ');
    room.exits[d]={to,desc,kw,key:key||-1,isdoor:!!(flags&1),closed:!!(flags&2),locked:!!(flags&4),init:{closed:false,locked:false},temp:true};
    return;
  }
  /* setdoor 方向 欄位 值 */
  const e=room.exits[d];if(!e)return;
  const field=t[2],val=t.slice(3).join(' ');
  if(field==='vnum'||field==='to')e.to=+val;
  else if(field==='key')e.key=+val;
  else if(field==='desc')e.desc=val;
  else if(field==='keyword')e.kw=val;
  else if(field==='flag'||field==='flags'){const f=+val;e.isdoor=!!(f&1);e.closed=!!(f&2);e.locked=!!(f&4);}
}
function qTargets(tok,c,all){
  const v=tokChar(tok,c);if(!all)return v?[v]:[];
  /* *_all_qmark：目標跟他同一隊、在同一房間的玩家（推測） */
  if(!v)return [];
  const room=v.room;const lead=v.leader||v.master||v;
  const g=room?room.people.filter(p=>!p.npc&&(p===v||p===lead||p.leader===lead||p.master===lead)):[v];
  return g.length?g:[v];
}
const ALIAS={calluot:'callout',echoarond:'echoaround',echoaroun:'echoaround',echoround:'echoaround',opforcer:'oforcer',sunt:'stun',
  echotoarea:'echoarea',rpexp:'exp'};
const CMD={
  echo:(t,ln,c)=>sendRoom(roomOf(c),subst(restAfter(ln,1),c)),
  echoat:(t,ln,c)=>{const v=tokChar(t[1],c);if(v)R.send(v,subst(restAfter(ln,2),c)+C.NOR+'\n');},
  nonechoat:(t,ln,c)=>CMD.echoat(t,ln,c),
  echoaround:(t,ln,c)=>{const v=tokChar(t[1],c);if(v)sendRoom(v.room,subst(restAfter(ln,2),c),v);},
  nonechoaround:(t,ln,c)=>CMD.echoaround(t,ln,c),
  nonecho:(t,ln,c)=>CMD.echo(t,ln,c),
  echoarea:(t,ln,c)=>{const r=roomOf(c);if(!r)return;const s=subst(restAfter(ln,1),c);for(const p of W.players)if(p.playing&&p.room&&p.room.area===r.area)R.send(p,s+C.NOR+'\n');},
  transfergroup:(t,ln,c)=>{const v=tokChar(t[1],c);if(!v)return;for(const g of qTargets(t[1],c,true))transfer(g===v?t[1]:g.name,t[2],c);},
  echotoall:(t,ln,c)=>{const s=subst(restAfter(ln,1),c);for(const p of W.players)if(p.playing)R.send(p,s+C.NOR+'\n');},
  asound:(t,ln,c)=>{const r=roomOf(c);if(!r)return;const s=subst(restAfter(ln,1),c);
    r.exits.forEach(e=>{const to=e&&R.getRoom(e.to);if(to&&to!==r)sendRoom(to,s);});},
  log:()=>{},
  callout:(t,ln,c)=>{const n=parseInt(t[1],10)||1;callQ.push({t:n*12,c:{...c},line:restAfter(ln,2)});},
  call:(t,ln,c)=>callDefun(t[1],t.slice(2),c),
  rcall:(t,ln,c)=>{const r=roomOf(c);if(r)callDefun(t[1],t.slice(2),{...c,kind:'room',self:r});},
  nowait:(t,ln,c)=>{if(c.kind!=='mob')return;for(const q of R.castQ||[])if(q.ch===c.self)q.t=1;c.self.wait=0;},
  at:(t,ln,c)=>{
    const dest=t[1],rest=restAfter(ln,2);
    const to=/^\d+$/.test(dest)?R.getRoom(+dest):(tokChar(dest,c)||{}).room;
    if(c.kind==='mob'){
      const m=c.self,from=m.room;
      if(!to||to===from){exec(rest,c);return;}
      R.charFromRoom(m);R.charToRoom(m,to);
      try{exec(rest,c);}finally{if(!m.deleted&&m.room===to){R.charFromRoom(m);R.charToRoom(m,from);}}
      return;
    }
    exec(rest,{...c,at:to||roomOf(c),kind:c.kind==='obj'?'room':c.kind,self:c.kind==='obj'?(to||roomOf(c)):c.self});
  },
  goto:(t,ln,c)=>{if(c.kind!=='mob')return;const to=R.getRoom(+t[1])||(tokChar(t[1],c)||{}).room;if(to&&to!==c.self.room){R.stopFighting(c.self,true);R.charFromRoom(c.self);R.charToRoom(c.self,to);}
    else if(t[1]==='self')R.stopFighting(c.self,true);},
  transfer:(t,ln,c)=>transfer(t[1],t[2],c),
  teleport:(t,ln,c)=>{/* teleport vnum 起 迄 ／ teleport 起 迄：把觸發者送到範圍內隨機房間 */
    const a=t[1]==='vnum'?t.slice(2):t.slice(1);const lo=+a[0],hi=+a[1]||+a[0];if(!lo)return;
    let to=null;for(let k=0;k<10&&!to;k++)to=R.getRoom(R.rand(lo,hi));
    const v=c.n;if(to&&v&&v.room){if(v.fighting)R.stopFighting(v,true);R.charFromRoom(v);R.charToRoom(v,to);}},
  kill:(t,ln,c)=>{if(c.kind!=='mob')return;const v=tokChar(t[1],c);if(v&&v!==c.self&&v.room===c.self.room&&!c.self.fighting)R.multiHit(c.self,v);},
  force:(t,ln,c)=>{
    const who=t[1],rest=subst(restAfter(ln,2),c);
    const room=roomOf(c);
    const list=who==='all'||who==='pc'?(room?room.people.filter(p=>who==='all'?p!==c.self:!p.npc):[]):[tokChar(who,c)].filter(Boolean);
    for(const v of list){if(v.deleted||!v.room)continue;R.interpret(v,rest);R.flush(v,true);}
  },
  mload:(t,ln,c)=>{const p=W.mobs[+t[1]],r=roomOf(c);if(!p||!r){warn('mob'+t[1],'沒有這個怪物 '+t[1]);return;}
    const m=R.createMobile(p);R.charToRoom(m,r);MP.repop(m);},
  oload:(t,ln,c)=>loadObj(t,c),
  purge:purge,
  junk:(t,ln,c)=>{
    if(c.kind!=='mob')return;const m=c.self,a=t[1]||'';
    if(a==='all.coins'||a==='coins'){m.gold=0;return;}
    if(a==='$o'||a==='$O'){if(c.o&&!c.o.deleted&&c.o.carried_by===m)R.extractObj(c.o);return;}
    if(a==='all'){for(const o of [...m.carrying])R.extractObj(o);return;}
    if(a.startsWith('all.')){const nm=a.slice(4).replace(/-/g,' ');for(const o of [...m.carrying])if(R.is_name(nm,o.name))R.extractObj(o);return;}
    const o=tokObj(a,c,m.carrying);if(o)R.extractObj(o);
  },
  gold:(t,ln,c)=>{const v=tokChar(t[1],c);if(v)v.gold=Math.max(0,(v.gold||0)+(parseInt(t[2],10)||0));},
  exp:(t,ln,c)=>{const v=tokChar(t[1],c);if(v&&!v.npc&&R.gainExp)R.gainExp(v,parseInt(t[2],10)||0);},
  greward:(t,ln,c)=>{   /* greward exp $n 等級上限 數量（推測：+36 代表 36 級以上） */
    if(t[1]!=='exp')return;const v=tokChar(t[2],c);if(!v||v.npc)return;
    const lim=t[3]||'',amt=parseInt(t[4],10)||0;
    if(lim[0]==='+'?v.level<+lim.slice(1):v.level>+lim)return;
    if(R.gainExp)R.gainExp(v,amt);
  },
  skillexp:(t,ln,c)=>{const v=tokChar(t[1],c);if(v&&!v.npc){v.skexp=(v.skexp||0)+(parseInt(t[2],10)||0);R.send(v,C.HIC+'你獲得了 '+(parseInt(t[2],10)||0)+' 點技能經驗。'+C.NOR+'\n');}},
  resp:(t,ln,c)=>{const v=tokChar(t[1],c);if(v)v.resp=(v.resp||0)+(parseInt(t[2],10)||0);},
  merit:()=>{},get:()=>{},
  add_qmark:(t,ln,c)=>{for(const v of qTargets(t[1],c,false))qAdd(v,t[2],t.slice(3));},
  add_all_qmark:(t,ln,c)=>{for(const v of qTargets(t[1],c,true))qAdd(v,t[2],t.slice(3));},
  mod_qmark:(t,ln,c)=>{for(const v of qTargets(t[1],c,false))qMod(v,t[2],t[3],t[4],t[5]);},
  mod_all_qmark:(t,ln,c)=>{for(const v of qTargets(t[1],c,true))qMod(v,t[2],t[3],t[4],t[5]);},
  del_qmark:(t,ln,c)=>{for(const v of qTargets(t[1],c,false))if(v.qmarks)delete v.qmarks[t[2]];},
  del_all_qmark:(t,ln,c)=>{for(const v of qTargets(t[1],c,true))if(v.qmarks)delete v.qmarks[t[2]];},
  def_rembch:(t,ln,c)=>{if(c.kind==='mob')c.self.rembch=t[1]==='null-tar'?null:tokChar(t[1],c);},
  modhmv:(t,ln,c)=>modhmv(t,c),
  stun:(t,ln,c)=>{const v=tokChar(t[1],c);if(v)v.wait=Math.max(v.wait||0,Math.min(400,(parseInt(t[2],10)||1)*4));},
  add_affect:(t,ln,c)=>addAffect(t,c),
  del_affect:(t,ln,c)=>delAffect(t,c),
  dis_magic:(t,ln,c)=>delAffect(t,c),
  makedoor:(t,ln,c)=>doorCmd('make',t,c),
  setdoor:(t,ln,c)=>doorCmd('set',t,c),
  deldoor:(t,ln,c)=>doorCmd('del',t,c),
  modrvt:(t,ln,c)=>{   /* modrvt v0 = 1 ／ t0 + 30：房間數值與計時 */
    const r=roomOf(c);if(!r)return;const m=/^([vt])(\d)$/.exec(t[1]||'');if(!m)return;
    const arr=m[1]==='v'?(r.rv=r.rv||[0,0,0,0]):(r.rt=r.rt||[0,0,0,0]);const i=+m[2],v=parseInt(t[3],10)||0;
    switch(t[2]){case '=':arr[i]=v;break;case '+':arr[i]+=v;break;case '-':arr[i]-=v;break;case '|':arr[i]=bitOr(arr[i],v);break;case '&':arr[i]=bitAnd(arr[i],v);break;case 'r':arr[i]=R.rand(0,v);break;}
  },
  setroom:(t,ln,c)=>{   /* setroom desc N 文字（換新）／A 文字（接上） */
    const r=roomOf(c);if(!r||t[1]!=='desc')return;const s=restAfter(ln,3);
    if(t[2]==='N')r.desc=s+'\n';else r.desc=(r.desc||'')+s+'\n';
  },
  oset:(t,ln,c)=>{const o=c.kind==='obj'&&t[1]==='self'?c.self:tokObj(t[1],c);if(!o)return;
    const m=/^v(\d)$/.exec(t[2]||'');if(!m)return;const i=+m[1],v=parseInt(t[4],10)||0;
    switch(t[3]){case '=':o.values[i]=v;break;case '+':o.values[i]+=v;break;case '-':o.values[i]-=v;break;case '|':o.values[i]=bitOr(o.values[i],v);break;}},
  set_obj_affect:()=>{},remove_obj_affect:()=>{},modify_obj_affect:()=>{},opset_obj_affect:()=>{},opmodify_obj_affect:()=>{},opmodvt:()=>{},
  skilldrv:(t,ln,c)=>{   /* NPC 特殊攻擊：簡化成多打一輪 */
    if(c.kind!=='mob')return;const v=tokChar(t[2],c)||c.self.fighting;
    if(v&&v.room===c.self.room&&v.position>P.DEAD)R.multiHit(c.self,v);
  },
  modify:(t,ln,c)=>{if(c.kind!=='mob')return;const m=c.self,v=parseInt(t[3],10)||0,s=t[2]==='-'?-v:v;
    if(t[1]==='dr')m.damroll+=s;else if(t[1]==='hr')m.hitroll+=s;else if(t[1]==='ac')m.armor+=s;},
  group:()=>{},makehorse:()=>{},make_horse:()=>{},
  cast:(t,ln,c)=>{if(c.kind==='mob'){cmd.cast(c.self,subst(restAfter(ln,1),c));return;}objCast(t,c);},
  ogoto:(t,ln,c)=>{if(c.kind!=='obj')return;const to=R.getRoom(+t[1]);if(to&&!carrier(c.self)){R.objToRoom(c.self,to);}},
  oteleport:(t,ln,c)=>CMD.teleport(t,ln,c),
  oforce:(t,ln,c)=>CMD.force(t,ln,c),
};

/* ---------- defun 呼叫 ---------- */
function callDefun(name,args,c){
  if(!name)return;
  const owner=c.self;
  const trig=c.kind==='mob'?'defun_prog':c.kind==='room'?'room_defun':'obj_defun';
  const p=progsOf(owner).find(p=>p.trigger===trig&&p.argument===name);
  if(!p){warn('defun:'+name,'找不到 defun '+name);return;}
  const n=args[0]?tokChar(args[0],c):c.n;
  MP.run(p,{...c,n:n||c.n,depth:c.depth});
}

/* ---------- 觸發 ---------- */
/* kind：mob／room／obj；回傳是否有劇本被執行 */
function fire(kind,trig,self,n,ex,match){
  const ps=progsOf(self).filter(p=>p.trigger===trig);
  if(!ps.length)return false;
  let any=false;
  for(const p of ps){
    if(match&&!match(p.argument||''))continue;
    const c=mk(kind,self,n,ex.o,ex.v,ex.extra);
    MP.run(p,c);any=true;
    if(ex.once)break;
    if(kind==='mob'&&(self.deleted||!self.room))break;
  }
  return any;
}
MP.fire=fire;
const pctOk=a=>R.pct()<=(parseInt(String(a).split(/\s+/).pop(),10)||0);
const pctFirst=a=>R.pct()<=(parseInt(String(a).split(/\s+/)[0],10)||0);
const has=(x,trig)=>progsOf(x).some(p=>p.trigger===trig);
MP.has=has;

/* 話題比對：'p 片語' 要整句出現；否則任何一個關鍵字出現就算 */
function phrase(arg,text){
  arg=R.lc(arg.trim());text=R.lc(String(text||'').trim());
  if(arg.startsWith('p ')){return text.includes(arg.slice(2).trim());}
  const words=text.split(/\s+/).filter(Boolean);
  return arg.split(/\s+/).some(k=>k&&words.some(w=>w===k));
}
/* 玩家：talk <mob> [話題] */
MP.talk=function(ch,v,topic){
  topic=(topic||'').trim();
  if(!topic)return fire('mob','talk_prog',v,ch,{once:true},a=>R.lc(a)==='topic');
  return fire('mob','talk_prog',v,ch,{once:true},a=>R.lc(a)!=='topic'&&phrase(a,topic));
};
/* 這隻 NPC 可以談的話題（給介面列按鈕） */
MP.topics=function(v){
  const out=[];
  for(const p of progsOf(v))if(p.trigger==='talk_prog'){const a=String(p.argument||'').trim();if(a&&R.lc(a)!=='topic'&&!out.includes(a))out.push(a);}
  return out;
};
MP.canTalk=v=>has(v,'talk_prog');

/* 進房間：greet（看得見）、all_greet、entry_greet；房間 room_enter；物品不處理 */
MP.enter=function(ch,from,dir){
  const room=ch.room;if(!room)return;
  /* 房間 */
  const bit=dir>=0&&dir<6?(1<<R.REV_DIR[dir]):64;   /* 推測：位元代表從哪個方向進來 */
  if(has(room,'room_enter'))fire('room','room_enter',room,ch,{},a=>{const [b,pc]=String(a).split(/\s+/);return (bitAnd(+b||127,bit)!==0||+b===127)&&R.pct()<=(+pc||100);});
  if(!ch.room)return;
  if(ch.npc){
    if(has(ch,'entry_prog'))fire('mob','entry_prog',ch,null,{},pctOk);
    if(has(ch,'entry_greet_prog'))for(const p of [...room.people])if(!p.npc&&p.playing&&!ch.deleted)fire('mob','entry_greet_prog',ch,p,{},pctOk);
    return;
  }
  for(const m of [...room.people]){
    if(!m.npc||m===ch||m.deleted||m.fighting||!R.isAwake(m))continue;
    if(has(m,'all_greet_prog'))fire('mob','all_greet_prog',m,ch,{},pctOk);
    else if(R.canSee(m,ch)&&has(m,'greet_prog'))fire('mob','greet_prog',m,ch,{},pctOk);
    if(!ch.room||ch.room!==room)return;
  }
};
MP.leave=function(ch,room,dir){
  if(has(room,'room_leave')){
    const bit=dir>=0&&dir<6?(1<<dir):64;
    fire('room','room_leave',room,ch,{},a=>{const [b,pc]=String(a).split(/\s+/);return (bitAnd(+b||127,bit)!==0||+b===127)&&R.pct()<=(+pc||100);});
  }
};
/* 玩家輸入指令：房間 room_command／room_mask、身上物品 obj_command → 有對上就取代原本的指令 */
MP.command=function(ch,word,arg){
  if(!ch.room||ch.npc)return false;
  word=R.lc(word);arg=R.lc((arg||'').trim());
  const ok=a=>{
    const [cw,...rest]=R.lc(a).split(/\s+/);const want=rest.join(' ');
    if(!cw||!(cw===word||(word.length>=2&&cw.startsWith(word))))return false;   /* 推測：前綴也算 */
    if(!want||want==='default')return true;
    const ar=arg.split(/\s+/)[0]||'';
    return want.split(/\s+/).some(k=>k===arg||(ar&&k.startsWith(ar)));
  };
  const room=ch.room;
  if(fire('room','room_mask',room,ch,{once:true},ok))return true;
  if(fire('room','room_command',room,ch,{once:true},ok))return true;
  for(const o of [...ch.carrying,...room.contents]){
    if(has(o,'obj_command')&&fire('obj','obj_command',o,ch,{once:true,o},ok))return true;
  }
  return false;
};
MP.say=function(ch,text){
  const room=ch.room;if(!room||ch.npc)return;
  for(const m of [...room.people])if(m.npc&&m!==ch&&!m.deleted&&has(m,'speech_prog'))fire('mob','speech_prog',m,ch,{once:true},a=>phrase(a,text));
};
MP.social=function(ch,v,name){   /* act_prog：對 NPC 做社交動作 */
  if(v&&v.npc&&has(v,'act_prog'))fire('mob','act_prog',v,ch,{once:true},a=>R.lc(a.trim())===R.lc(name));
};
MP.give=function(ch,v,o){
  if(!v.npc||!has(v,'give_prog'))return;
  fire('mob','give_prog',v,ch,{once:true,o},a=>{a=String(a).trim();if(/^\d+$/.test(a))return +a===o.vnum;return a==='all'||R.is_name(a.replace(/-/g,' '),o.name);});
};
MP.bribe=function(ch,v,amt){
  if(!v.npc||!has(v,'bribe_prog'))return;
  const ps=progsOf(v).filter(p=>p.trigger==='bribe_prog').sort((a,b)=>(+b.argument||0)-(+a.argument||0));
  const p=ps.find(p=>amt>=(+p.argument||0));if(p)MP.run(p,mk('mob',v,ch,null,null));
};
MP.objAct=function(ch,o,act){if(has(o,'obj_act'))fire('obj','obj_act',o,ch,{o},a=>R.lc(a.trim())===act);};
/* 戰鬥回合：fight_prog、hitprcnt_prog；身上物品 obj_fight */
MP.round=function(ch){
  const v=ch.fighting;if(!v)return;
  if(ch.npc){
    if(has(ch,'fight_prog'))fire('mob','fight_prog',ch,v,{once:true},pctOk);
    if(!ch.deleted&&ch.fighting&&has(ch,'hitprcnt_prog')){
      const hp=ch.max_hit>0?ch.hit*100/ch.max_hit:100;
      const p=progsOf(ch).find(p=>p.trigger==='hitprcnt_prog'&&hp<(+p.argument||0));
      if(p)MP.run(p,mk('mob',ch,v,null,null));
    }
  }else{
    for(const o of ch.carrying)if(o.wear_loc>=0&&has(o,'obj_fight')){fire('obj','obj_fight',o,ch,{o,v},pctOk);if(!ch.fighting)break;}
  }
};
MP.hurt=function(v,ch,sn){
  if(!v.npc||v===ch||!has(v,'hurt_prog'))return;
  fire('mob','hurt_prog',v,ch,{once:true},a=>+a===sn);
};
MP.death=function(v,killer){
  if(v.npc&&has(v,'death_prog'))fire('mob','death_prog',v,killer,{},pctOk);
  if(!v.npc)MP.qDeath(v);
};
MP.kill=function(killer,v){if(killer&&killer.npc&&has(killer,'kill_prog'))fire('mob','kill_prog',killer,v,{},pctOk);};
MP.repop=function(m){if(has(m,'repop_prog'))fire('mob','repop_prog',m,null,{},pctOk);};
MP.objRepop=function(o){if(has(o,'obj_repop'))fire('obj','obj_repop',o,null,{o},pctOk);};
/* 每 4 秒：rand_prog、room_rand、obj_rand（只在有玩家的區域） */
MP.randUpdate=function(){
  for(const m of [...W.chars]){
    if(m.deleted||!m.room||!m.room.area.nplayer||!has(m,'rand_prog'))continue;
    fire('mob','rand_prog',m,randPc(mk('mob',m)),{once:true},pctOk);
  }
  for(const p of W.players){
    if(!p.playing||!p.room)continue;
    const r=p.room;
    if(has(r,'room_rand')&&r._randPulse!==MP.tickNo){r._randPulse=MP.tickNo;fire('room','room_rand',r,randPc(mk('room',r)),{once:true},pctOk);}
    for(const o of [...p.carrying])if(has(o,'obj_rand'))fire('obj','obj_rand',o,p,{o},pctOk);
  }
  MP.tickNo=(MP.tickNo||0)+1;
};
/* 每個 tick：tick_prog、obj_tick、qmark 倒數、房間計時 */
MP.tick=function(){
  for(const m of [...W.chars])if(!m.deleted&&m.room&&has(m,'tick_prog'))fire('mob','tick_prog',m,randPc(mk('mob',m)),{once:true},pctOk);
  for(const o of [...W.objects])if(!o.deleted&&has(o,'obj_tick'))fire('obj','obj_tick',o,carrier(o),{o},pctOk);
  for(const ch of W.chars.concat(W.players))if(ch.qmarks)MP.qTick(ch);
  for(const r of Object.values(W.rooms))if(r.rt)for(let i=0;i<r.rt.length;i++)if(r.rt[i]>0)r.rt[i]--;
};
/* 每個遊戲小時：room_time */
MP.hour=function(){
  for(const r of MP.timeRooms||[])fire('room','room_time',r,randPc(mk('room',r)),{},pctOk);
};
MP.init=function(){
  MP.timeRooms=Object.values(W.rooms).filter(r=>has(r,'room_time'));
};

/* 穿脫物品：obj_act wear／remove（只在遊戲中，載入存檔時不觸發） */
const eqC=R.equipChar,uneqC=R.unequipChar;
R.equipChar=function(ch,o,loc){eqC(ch,o,loc);if(ch.playing&&!ch.npc)MP.objAct(ch,o,'wear');};
R.unequipChar=function(ch,o){const w=o.wear_loc>=0;uneqC(ch,o);if(w&&ch.playing&&!ch.npc&&!o.deleted)MP.objAct(ch,o,'remove');};

/* ---------- talk 指令 ---------- */
cmd.talk=function(ch,a){
  const [who,rest]=R.one_arg(a||'');
  if(!who){R.send(ch,'要和誰交談？\n');return;}
  const v=R.getCharRoom(ch,who);
  if(!v){R.send(ch,'這裡沒有這個人。\n');return;}
  if(v===ch){R.send(ch,'你自言自語了一番。\n');return;}
  if(!v.npc){R.send(ch,'想和玩家說話請用 say 或 tell。\n');return;}
  if(!R.isAwake(v)){R.act('$N 正在睡覺，沒辦法回答你。',ch,null,v,R.TO_CHAR);return;}
  const topic=(rest||'').trim();
  R.act(topic?'你問$N關於「'+topic+'」的事。':'你向$N打聽消息。',ch,null,v,R.TO_CHAR);
  R.act(topic?'$n問$N關於「'+topic+'」的事。':'$n向$N打聽消息。',ch,null,v,R.TO_NOTVICT);
  if(!MP.talk(ch,v,topic))R.act(topic?'$N似乎聽不懂你在說什麼。':'$N看起來沒什麼話想跟你說。',ch,null,v,R.TO_CHAR);
};
})(ROC);
