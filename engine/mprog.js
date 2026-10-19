/* mprog.js — NPC／房間／物品劇本（對應 MobProg/mob_prog.c、mob_commands.c、RoomProg/room_prog.c、room_commands.c、
   ObjProg/obj_prog.c、obj_commands.c）。
   跟原版一樣：先把 $ 變數代換成文字，再把整行交給 NPC／房間／物品各自的指令表執行。
   指令表沒有的指令，房間和物品直接忽略；NPC 則當一般遊戲指令執行（say、cast、bow…）。 */
(function(R){
const C=R.C,W=R.world,P=R.POS,cmd=R.cmds;
const MP=R.MP={};
let warned={};
const warn=(k,m)=>{if(warned[k])return;warned[k]=1;console.warn('[劇本] '+m);};

/* ---------- 劇本 ---------- */
function lines(p){
  if(!p._l)p._l=String(p.script||'').split('\n').map(s=>s.trim()).filter(Boolean);
  return p._l;
}
const progsOf=x=>!x?[]:x.npc?(x.proto&&x.proto.programs)||[]:x.progs?x.progs:(x.proto&&x.proto.programs)||[];
const firstArg=s=>R.lc(String(s||'').trim().split(/\s+/)[0]||'');
const atoi=s=>parseInt(s,10)||0;
const isNum=s=>/^-?\d+$/.test(String(s||''));

/* ---------- 找人、找東西（handler.c：先比完全相同的字，再比開頭） ---------- */
function nameHit(arg,namelist,pfx){
  const a=R.lc(arg),words=R.lc(namelist||'').split(/\s+/).filter(Boolean);
  if(!a)return false;
  if(!pfx)return R.lc(namelist||'')===a||words.includes(a);
  return words.some(w=>w.startsWith(a));
}
function numArg(s){const m=/^(\d+)\.(.*)$/.exec(s||'');return m?[+m[1],m[2]]:[1,s||''];}
function findIn(list,arg,test){
  const [n,nm]=numArg(arg);if(!nm||R.lc(nm)==='someone')return null;
  let c=0;
  for(const pfx of [false,true])for(const x of list){if(x.deleted||(test&&!test(x)))continue;if(nameHit(nm,x.name,pfx)&&++c===n)return x;}
  return null;
}
const charRoomOf=(viewer,arg)=>{   /* get_char_room：看得到的 */
  if(!viewer||!viewer.room)return null;
  if(R.lc(arg)==='self')return viewer;
  return findIn(viewer.room.people,arg,v=>R.canSee(viewer,v));
};
const charWorldOf=(viewer,arg)=>charRoomOf(viewer,arg)||findIn(W.players.filter(p=>p.playing),arg)||findIn(W.chars.filter(m=>m.room),arg);
const roomFindChar=(room,arg)=>room?findIn(room.people,arg,v=>v.npc||!v.wizinvis):null;   /* room_find_char */
const worldFindChar=arg=>findIn(W.players.filter(p=>p.playing),arg)||findIn(W.chars.filter(m=>m.room),arg);
const objCarry=(ch,arg)=>{if(!ch)return null;if(isNum(arg)){const v=+arg;return ch.carrying.find(o=>o.wear_loc<0&&o.vnum===v)||null;}
  const [n,nm]=numArg(arg);let c=0;for(const o of ch.carrying)if(o.wear_loc<0&&nameHit(nm,o.name,true)&&++c===n)return o;return null;};
const objWear=(ch,arg)=>{if(!ch)return null;if(isNum(arg)){const v=+arg;return ch.carrying.find(o=>o.wear_loc>=0&&o.vnum===v)||null;}
  const [n,nm]=numArg(arg);let c=0;for(const o of ch.carrying)if(o.wear_loc>=0&&nameHit(nm,o.name,true)&&++c===n)return o;return null;};
const objHere=(ch,arg)=>ch&&ch.room?(findIn(ch.room.contents,arg)||objCarry(ch,arg)||objWear(ch,arg)):null;
const sameGroup=(a,b)=>{const la=a.leader||a.master||a,lb=b.leader||b.master||b;return la===lb;};
const isImmort=x=>!x.npc&&R.isImm(x);

/* ---------- 情境 ---------- */
/* kind：mob／room／obj；self 劇本主人；actor 觸發者；obj 物品；vo 第二對象（人或物）；rndm 隨機玩家 */
function roomOf(c){
  if(c.kind==='mob')return c.self.room;
  if(c.kind==='room')return c.self;
  return objRoom(c.self);
}
function objRoom(o){let x=o;while(x&&x.in_obj)x=x.in_obj;return x?(x.carried_by?x.carried_by.room:x.in_room):null;}
const carrierOf=o=>{let x=o;while(x&&x.in_obj)x=x.in_obj;return x&&x.carried_by||null;};
const rembOf=c=>c.kind==='mob'?c.self.rembch:c.kind==='room'?c.self.rrembch:c.self.orembch;
function pickRndm(c){
  const r=roomOf(c);if(!r)return null;
  const ps=r.people.filter(v=>!v.deleted&&!v.npc&&(c.kind==='mob'?R.canSee(c.self,v):c.kind==='obj'&&c.self.carried_by?R.canSee(c.self.carried_by,v):!v.wizinvis));
  return ps.length?ps[R.rand(0,ps.length-1)]:null;
}
function mkCtx(kind,self,actor,obj,vo){
  const c={kind,self,actor:actor||null,obj:obj||(kind==='obj'?self:null),vo:vo||null,depth:0};
  c.rndm=pickRndm(c);
  return c;
}

/* ---------- $ 代換（mprog_translate／rprog_translate／oprog_translate） ---------- */
const HE=['它','他','她'],HIM=['它','他','她'],HIS=['它的','他的','她的'];
const nm1=x=>{const n=String(x.name||'').split(/\s+/)[0]||'';return x.npc?n:R.cap(n);};
const sd=x=>x.npc?x.short:(x.short||x.name);
function translate(k,c){
  const kind=c.kind,mob=kind==='mob'?c.self:null,actor=c.actor,rndm=c.rndm,remb=rembOf(c);
  const vict=c.vo&&c.vo.room!==undefined&&c.vo.carrying?c.vo:null,vobj=c.vo&&c.vo.wear_loc!==undefined?c.vo:null;
  const see=x=>!x?false:mob?R.canSee(mob,x):(x.npc||!x.wizinvis);
  const pr=(x,f)=>x&&see(x)?f(x):'someone';
  if(kind==='obj'){
    const o=c.self,car=carrierOf(o);
    switch(k){
      case 'o':return actor&&o?nm1(o).toLowerCase():'something';
      case 'O':return actor&&o?o.short:'something';
      case 'i':return pr(car,nm1);case 'I':return pr(car,sd);
      case 'v':return car&&actor&&actor.fighting?pr(actor.fighting,nm1):'someone';
      case 'V':return car&&actor&&actor.fighting?pr(actor.fighting,sd):'someone';
    }
  }
  if(kind==='room'&&'iIvVtToOpP'.includes(k))return 'someone';
  switch(k){
    case 'i':return mob?nm1(mob):'someone';
    case 'I':return mob?mob.short:'someone';
    case 'n':return pr(actor,nm1);case 'N':return pr(actor,sd);
    case 'b':return pr(remb,nm1);case 'B':return pr(remb,sd);
    case 't':return pr(vict,nm1);case 'T':return pr(vict,x=>x.npc?x.short:x.name+' '+(x.pc&&x.pc.title||''));
    case 'r':return rndm&&see(rndm)&&!rndm.wizinvis?nm1(rndm):'someone';
    case 'R':return rndm&&see(rndm)&&!rndm.wizinvis?sd(rndm):'someone';
    case 'v':return mob&&mob.fighting?pr(mob.fighting,nm1):'someone';
    case 'V':return mob&&mob.fighting?pr(mob.fighting,sd):'someone';
    case 'e':return actor?(see(actor)?HE[actor.sex]||'它':'someone'):'';
    case 'm':return actor?(see(actor)?HIM[actor.sex]||'它':'someone'):'';
    case 's':return actor?(see(actor)?HIS[actor.sex]||'它的':"someone's"):'';
    case 'E':return vict?(see(vict)?HE[vict.sex]:'someone'):'';
    case 'M':return vict?(see(vict)?HIM[vict.sex]:'someone'):'';
    case 'S':return vict?(see(vict)?HIS[vict.sex]:"someone's"):'';
    case 'j':return mob?HE[mob.sex]:'';case 'k':return mob?HIM[mob.sex]:'';case 'l':return mob?HIS[mob.sex]:'';
    case 'J':return rndm?HE[rndm.sex]:'';case 'K':return rndm?HIM[rndm.sex]:'';case 'L':return rndm?HIS[rndm.sex]:'';
    case 'o':return c.obj?nm1(c.obj).toLowerCase():'';case 'O':return c.obj?c.obj.short:'';
    case 'p':return vobj?nm1(vobj).toLowerCase():'';case 'P':return vobj?vobj.short:'';
    case 'a':case 'A':return '';
    case '$':return '$';
  }
  return '';
}
const subst=(s,c)=>String(s).replace(/\$([a-zA-Z$])/g,(m,k)=>translate(k,c));

/* ---------- 任務標記（qmark） ---------- */
/* ch.qmarks[名稱]={t:timer(-1 永久),v:[v0,v1,v2],d:fDeath,s:fSave} */
const qGet=(ch,name)=>ch&&ch.qmarks&&ch.qmarks[name]||null;
function qAdd(target,t){   /* do_add_qmark：名稱 timer v0 v1 v2 fDeath fSave，沒寫的 timer=-1、fDeath=真、fSave=假 */
  const name=t[0];if(!target||!name||qGet(target,name))return;
  const n=(i,d)=>t[i]!==undefined&&isNum(t[i])?+t[i]:d;
  target.qmarks=target.qmarks||{};
  target.qmarks[name]={t:n(1,-1),v:[n(2,0),n(3,0),n(4,0)],d:t[5]!==undefined&&isNum(t[5])?+t[5]!==0:true,s:t[6]!==undefined&&isNum(t[6])?+t[6]!==0:false};
}
/* qmark_opr：+ - & | r(清除位元) = */
function qopr(l,op,r){
  switch(op){case '+':return l+r;case '-':return l-r;case '&':return bitAnd(l,r);case '|':return bitOr(l,r);case 'r':return l-bitAnd(l,r);case '=':return r;}
  return l;
}
function qMod(target,t){   /* 名稱 欄位 運算 值 */
  const q=qGet(target,t[0]);if(!q||!t[1]||!t[2]||t[3]===undefined)return;
  const v=atoi(t[3]);
  switch(t[1]){
    case 'timer':q.t=qopr(q.t,t[2],v);break;
    case 'v0':q.v[0]=qopr(q.v[0],t[2],v);break;case 'v1':q.v[1]=qopr(q.v[1],t[2],v);break;case 'v2':q.v[2]=qopr(q.v[2],t[2],v);break;
    case 'death':q.d=!!qopr(q.d?1:0,t[2],v);break;case 'save':q.s=!!qopr(q.s?1:0,t[2],v);break;
  }
}
function qDel(target,name){if(target&&target.qmarks)delete target.qmarks[name];}
MP.qTick=function(ch){if(!ch.qmarks)return;for(const [k,q] of Object.entries(ch.qmarks))if(q.t>0&&--q.t===0)delete ch.qmarks[k];};
MP.qDeath=function(ch){if(!ch.qmarks)return;for(const [k,q] of Object.entries(ch.qmarks))if(q.d)delete ch.qmarks[k];};
MP.qSave=ch=>{const o={};for(const [k,q] of Object.entries(ch.qmarks||{}))if(q.s)o[k]=[q.t,q.v[0],q.v[1],q.v[2],q.d?1:0];return o;};
MP.qLoad=(ch,d)=>{ch.qmarks={};for(const [k,a] of Object.entries(d||{}))ch.qmarks[k]={t:a[0],v:[a[1]|0,a[2]|0,a[3]|0],d:!!a[4],s:true};};
MP.qHas=(ch,name)=>!!qGet(ch,name);

/* ---------- 位元（狀態可以超過 32 位元） ---------- */
const bitAnd=(a,b)=>{let r=0,m=1;a=Math.floor(Math.abs(a));b=Math.floor(Math.abs(b));while(a>0&&b>0){if(a%2&&b%2)r+=m;a=Math.floor(a/2);b=Math.floor(b/2);m*=2;}return r;};
const bitOr=(a,b)=>a+b-bitAnd(a,b);
/* parameters.h 的 AFF_* */
const AFF_NAMES=['BLIND','INVISIBLE','DETECT_EVIL','DETECT_INVIS','DETECT_MAGIC','DETECT_HIDDEN','HOLD','SANCTUARY','FAERIE_FIRE',
  'INFRARED','CURSE','CHANGE_SEX','POISON','PROTECT','POLYMORPH','SNEAK','HIDE','SLEEP','CHARM','FLYING','PASS_DOOR','WATERWALK',
  'SUMMONED','MUTE','SEAL_MAGIC','VAMP_BITE','GHOUL','FLAMING','PARALYZED','CRAZY','WEAKEN','NIGHTSTALK','DARK_RAID','MANA_SHIELD',
  'GILLS','TARDY','MYSTIC_MIRROR','MYSTIC_ARMOR','CAST_ACC','CONTINUE_CURE','DISEASE','FEAR','RIDE','BATTLE','NO_HEAL'];
const affBits=ch=>{let n=0;AFF_NAMES.forEach((a,i)=>{if(ch.aff.has(a))n+=2**i;});return n;};
/* 一個位元數字 → 名稱（多個位元就取最低的那個） */
const bitName=b=>{b=Math.floor(+b||0);if(b<=0)return null;for(let i=0;i<AFF_NAMES.length;i++)if(Math.floor(b/2**i)%2)return AFF_NAMES[i];return null;};
MP.AFF_NAMES=AFF_NAMES;
/* parameters.h 的 APPLY_* */
const APPLY=['NONE','STR','DEX','INT','WIS','CON','SEX','CLASS','LEVEL','AGE','HEIGHT','WEIGHT','MANA','HIT','MOVE','GOLD','EXP','AC',
  'HITROLL','DAMROLL','SAVING_PARA','SAVING_LIFE','SAVING_PETRI','SAVING_BREATH','SAVING_SPELL','SAVING_ANCIENT','SAVING_SPIRIT',
  'SAVING_FIRE','SAVING_COLD','SAVING_LIGHTNING','SAVING_EARTH','SAVING_WIND','SAVING_SAINT','SAVING_DARK','SAVING_POISON',
  'SAVING_ELEMENT','SAVING_GOOD','SAVING_EVIL','RACE','DODGE','POWER_POTENTIAL','RDAMAGE','RMAGIC','ADAMAGE','AMAGIC','GPHYSICAL','GMAGIC',
  'DOB_SAVING_FLASH','SAVING_ILLUSION','ACTION_ABILITY','WEAPON_SPELL','WEAPON_WIND','WEAPON_FIRE','WEAPON_COLD','WEAPON_EARTH',
  'WEAPON_LIGHTNING','WEAPON_SAINT','WEAPON_DARK','MAGIC_IMMUNE','TOXICITY_POISON','DAMAGE_COUNT','SHOOT_HITROLL','SHOOT_DAMROLL','SHOOT_ADAMAGE'];
const skillLookup=s=>{s=String(s||'').replace(/^'|'$/g,'');return isNum(s)?+s:R.skillLookup(s);};

/* ---------- 條件判斷（mprog_do_ifchck） ---------- */
function veval(l,op,r){
  switch(op){case '==':return l===r;case '!=':return l!==r;case '>':return l>r;case '<':return l<r;
    case '<=':case '=<':return l<=r;case '>=':case '=>':return l>=r;case '&':return bitAnd(l,r)!==0;case '|':return bitOr(l,r)!==0;case '!&':return bitAnd(l,r)===0;}
  return false;
}
function seval(l,op,r){
  l=R.lc(String(l||''));r=R.lc(String(r||''));
  switch(op){case '==':return l===r;case '!=':return l!==r;case '/':return l.includes(r);case '!/':return !l.includes(r);}
  return false;
}
/* 解析「名稱 ( 參數 ) 比較子 值」：括號內與名稱的空白都去掉，比較子是開頭的符號 */
function parseIf(s){
  s=s.trim();const lp=s.indexOf('('),rp=s.indexOf(')',lp);
  if(lp<0||rp<0)return null;
  const fn=s.slice(0,lp).replace(/\s+/g,'').toLowerCase(),arg=s.slice(lp+1,rp).replace(/\s+/g,'');
  let rest=s.slice(rp+1).trim(),op='',val='';
  if(rest){const m=/^([^\sA-Za-z0-9]+)\s*(.*)$/.exec(rest);if(m){op=m[1];val=m[2].trim();}else val=rest;}
  return {fn,arg,op,val};
}
/* $ 參數對應的人物；回傳 undefined 表示「錯誤」（原版回 -1，整個條件當成不成立） */
function ifVar(arg,c){
  const mob=c.kind==='mob'?c.self:null,actor=c.actor,obj=c.kind==='obj'?c.self:c.obj;
  const vict=c.vo&&c.vo.carrying?c.vo:null;
  switch(arg[1]){
    case 'i':return mob||undefined;
    case 'n':return actor||undefined;
    case 'v':return mob&&mob.fighting?mob.fighting:(obj&&carrierOf(obj)&&actor&&actor.fighting)?actor.fighting:undefined;
    case 't':return vict||undefined;
    case 'r':return c.rndm||undefined;
    case 'b':return rembOf(c)||undefined;
  }
  return undefined;
}
function ifChar(arg,c){   /* $x 或名字 */
  if(arg[0]==='$')return ifVar(arg,c);
  const mob=c.kind==='mob'?c.self:null,room=roomOf(c);
  const v=mob?charWorldOf(mob,arg):(roomFindChar(room,arg)||worldFindChar(arg));
  return v||undefined;
}
const objOf=(arg,c)=>arg==='$o'?(c.kind==='obj'?c.self:c.obj):arg==='$p'?(c.vo&&c.vo.wear_loc!==undefined?c.vo:null):null;
const stat=(x,i)=>R.stat?R.stat(x,i):13;
const CHARNUM={
  hitprcnt:x=>x.max_hit>0?Math.trunc(100*x.hit/x.max_hit):0,hitprcn:x=>x.max_hit>0?Math.trunc(100*x.hit/x.max_hit):0,
  manaprcnt:x=>x.max_mana>0?Math.trunc(100*x.mana/x.max_mana):0,moveprcnt:x=>x.max_move>0?Math.trunc(100*x.move/x.max_move):0,
  align:x=>x.alignment||0,hpnum:x=>x.hit,hpmax:x=>x.max_hit,mpnum:x=>x.mana,mpmax:x=>x.max_mana,mvnum:x=>x.move,mvmax:x=>x.max_move,
  weight:x=>R.carryW?R.carryW(x):0,carrynum:x=>R.carryN?R.carryN(x):x.carrying.length,
  maxweight:x=>R.canCarryW?R.canCarryW(x):999,maxcarrynum:x=>R.canCarryN?R.canCarryN(x):99,
  cancarry:x=>(R.canCarryN?R.canCarryN(x):99)-(R.carryN?R.carryN(x):0),canweight:x=>(R.canCarryW?R.canCarryW(x):999)-(R.carryW?R.carryW(x):0),
  realexp:x=>x.exp||0,exp:x=>x.exp||0,skexp:x=>x.skexp||0,skexp_dif:x=>0,sex:x=>x.sex,position:x=>x.position,is_autocombat:x=>0,
  size:x=>3,race_size:x=>3,aff_size:x=>0,dex:x=>stat(x,3),int:x=>stat(x,1),wis:x=>stat(x,2),con:x=>stat(x,4),str:x=>stat(x,0),
  max_str:x=>25,max_int:x=>25,max_wis:x=>25,max_dex:x=>25,max_con:x=>25,
  level:x=>x.level,class:x=>x.cls,goldamt:x=>x.gold||0,practice:x=>x.practice||0,resp:x=>x.resp||0,
  number:x=>x.npc?x.vnum:0,vnum:x=>x.npc?x.vnum:0,primeattr:x=>0,sndattr:x=>0,
  pp:x=>x.pp||0,apdr:x=>0,pdr:x=>0,amdr:x=>0,mdr:x=>0,armor:x=>x.armor||0,dodge:x=>x.dodge||0,
  wp_dr:x=>x.damroll||0,wp_hr:x=>x.hitroll||0,wp2_dr:x=>x.damroll||0,wp2_hr:x=>x.hitroll||0,
  sv_spell:x=>0,sv_wind:x=>0,sv_fire:x=>0,sv_cold:x=>0,sv_earth:x=>0,sv_breath:x=>0,sv_poison:x=>0,sv_lightning:x=>0,sv_saint:x=>0,sv_dark:x=>0,
  fightvnum:x=>x.fighting&&x.fighting.npc?x.fighting.vnum:0,
};
const CHARBOOL={
  ispc:x=>!x.npc,isnpc:x=>x.npc,isgood:x=>R.isGood(x),isevil:x=>R.isEvil(x),isneutral:x=>R.isNeutral(x),isfight:x=>!!x.fighting,
  is_fight:x=>!!x.fighting,isdrunk:x=>false,isfly:x=>x.aff.has('FLYING'),isimmort:x=>isImmort(x),ischarmed:x=>x.aff.has('CHARM'),
  isfollow:x=>!!x.master&&x.master.room===x.room,isgroup:x=>!!(x.leader||x.master),ishorse:x=>false,
};
function ifcheck(expr,c){
  const p=parseIf(expr);if(!p){warn('if:'+expr,'看不懂的條件：'+expr);return false;}
  let neg=false,fn=p.fn;if(fn[0]==='!'){neg=true;fn=fn.slice(1);}
  const r=evalIf(fn,p.arg,p.op,p.val,c);
  if(r===undefined)return false;   /* 原版錯誤回 -1：條件不成立（加 ! 也一樣） */
  return neg?!r:!!r;
}
function evalIf(fn,arg,op,val,c){
  const mob=c.kind==='mob'?c.self:null,actor=c.actor,obj=c.kind==='obj'?c.self:c.obj,room=roomOf(c);
  const vt=val.split(/\s+/).filter(Boolean),rv=atoi(val);
  if(fn==='rand'||fn==='rnad'||fn==='ran')return R.pct()<=atoi(arg);
  if(fn in CHARBOOL){
    if(arg==='$i'&&fn==='ispc')return false;if(arg==='$i'&&fn==='isnpc')return true;
    const x=ifChar(arg,c);return x===undefined?undefined:CHARBOOL[fn](x);
  }
  if(fn==='is_affected'){const x=ifChar(arg,c);return x===undefined?undefined:bitAnd(affBits(x),atoi(arg))!==0;}
  if(fn in CHARNUM&&!(fn==='level'&&arg==='$o')&&!((fn==='number'||fn==='vnum')&&(arg==='$o'||arg==='$p'))){
    const x=ifChar(arg,c);if(x===undefined)return undefined;
    if(fn==='resp'&&x.npc)return undefined;
    return veval(CHARNUM[fn](x),op,rv);
  }
  switch(fn){
    case 'level':{const o=objOf(arg,c);return o?veval(o.level,op,rv):undefined;}
    case 'number':case 'vnum':{const o=objOf(arg,c);return o?veval(o.vnum,op,rv):undefined;}
    case 'pcweight':return veval(0,op,rv);
    case 'inroom':{
      if(arg==='$o'){const r=objRoom(obj);return r?veval(r.vnum,op,rv):undefined;}
      const x=ifChar(arg,c);return x&&x.room?veval(x.room.vnum,op,rv):undefined;
    }
    case 'objtype':{const o=objOf(arg,c);return o?seval(o.type,op,vt[0]):undefined;}
    case 'is_equip':{const o=objOf(arg,c);return !!o&&o.wear_loc>=0;}
    case 'is_equ_loc':{const o=objOf(arg,c);return o?veval(o.wear_loc,op,rv):undefined;}
    case 'objweight':{const o=objOf(arg,c);return o?veval(o.weight,op,rv):undefined;}
    case 'objflag':{const o=objOf(arg,c);return o?veval(0,op,rv):undefined;}
    case 'objval0':case 'objval1':case 'objval2':case 'objval3':{const o=objOf(arg,c);return o?veval(o.values[+fn.slice(-1)]|0,op,rv):undefined;}
    case 'objextra':return veval(0,op,rv);
    case 'roomvnum':{const x=arg==='$o'?null:ifChar(arg,c);const r=x?x.room:objRoom(obj);return r?veval(r.vnum,op,rv):undefined;}
    case 'material':{const o=objOf(arg,c);return o?seval(o.material||'',op,vt[0]):undefined;}
    case 'sector':return room?veval(room.sector,op,rv):undefined;
    case 'name':{
      if(arg==='$o'||arg==='$p'){const o=objOf(arg,c);return o?seval(o.name,op,val):undefined;}
      const x=ifChar(arg,c);return x===undefined?undefined:seval(x.name,op,val);
    }
    case 'hour':return veval(R.time.hour,op,rv);
    case 'day':return veval(R.time.day,op,rv);
    case 'month':return veval(R.time.month,op,rv);
    case 'weather':return veval(R.weather.sky,op,rv);
    case 'nplayer':{const x=arg&&arg!=='$'?ifChar(arg,c):(mob||actor);const r=x&&x.room||room;return r?veval(r.area.nplayer,op,rv):undefined;}
    case 'oplayer':{const r=objRoom(obj)||room;return r?veval(r.area.nplayer,op,rv):undefined;}
    case 'rnplayer':return room?veval(room.area.nplayer,op,rv):undefined;
    case 'pcnum':case 'npcnum':case 'roomchar':{
      const r=arg.length>1?R.getRoom(atoi(arg.slice(1))):room;if(!r)return undefined;
      const n=r.people.filter(v=>fn==='pcnum'?!v.npc&&!isImmort(v):fn==='npcnum'?v.npc:true).length;
      return veval(n,op,rv);
    }
    case 'rmax_char':return veval(0,op,rv);
    case 'rmobcount':return room?veval(room.people.filter(v=>v.npc&&!v.deleted&&v.vnum===atoi(arg)).length,op,rv):false;
    case 'amobcount':return room?veval(W.chars.filter(v=>!v.deleted&&v.room&&v.room.area===room.area&&v.vnum===atoi(arg)).length,op,rv):false;
    case 'mobcount':return veval(W.chars.filter(v=>!v.deleted&&v.vnum===atoi(arg)).length,op,rv);
    case 'robjcount':case 'robjcount_a':return room?veval(room.contents.filter(o=>!o.deleted&&o.vnum===atoi(arg)).length,op,rv):false;
    case 'aobjcount':case 'aobjcount_a':return room?veval(W.objects.filter(o=>!o.deleted&&o.vnum===atoi(arg)&&objRoom(o)&&objRoom(o).area===room.area).length,op,rv):false;
    case 'objcount':return veval(W.objects.filter(o=>!o.deleted&&o.vnum===atoi(arg)).length,op,rv);
    case 'insameroom':{
      if(arg[0]==='$'){if(arg[1]==='i'||arg[1]==='n')return true;const x=ifVar(arg,c);return x&&mob?mob.room===x.room:undefined;}
      return mob?!!charRoomOf(mob,arg):!!roomFindChar(room,arg);
    }
    case 'being':case 'notbeing':{
      let has;
      if(arg[0]==='$'){
        if(arg[1]==='i'||arg[1]==='n')has=true;
        else if(arg[1]==='v'){has=!!(mob?mob.fighting:actor&&actor.fighting);}
        else if(arg[1]==='r'){if(!c.rndm)return undefined;has=true;}
        else if(arg[1]==='b')has=!!rembOf(c);
        else return undefined;
      }else has=!!(mob?charWorldOf(mob,arg):(roomFindChar(room,arg)||worldFindChar(arg)));
      return fn==='being'?has:!has;
    }
    case 'can_see':{if(!mob)return true;const x=ifChar(arg,c);return x===undefined?undefined:R.canSee(mob,x);}
    case 'fightwith':{
      const who=arg[0]==='$'?ifVar(arg,c):ifChar(arg,c);if(!who)return undefined;
      if(vt[0]&&vt[0][0]==='$'){const t=ifVar(vt[0],c);return op==='=='?!!t&&who.fighting===t:!(t&&who.fighting===t);}
      return who.fighting?seval(who.fighting.name,op,val):false;
    }
    case 'followwith':{const x=ifChar(arg,c);return x&&x.master?seval(x.master.name,op,val):false;}
    case 'groupwith':{const x=ifChar(arg,c);const l=x&&(x.leader||x.master);return l?seval(l.name,op,val):false;}
    case 'skillexp':case 'learned':{
      const x=ifChar(arg,c);if(x===undefined)return undefined;
      const sn=atoi(vt[0]),want=atoi(vt[1]);
      return veval(fn==='learned'?R.getSkillPercent(x,sn):R.getSkillLevel(x,sn),op,want);
    }
    case 'groupsize':case 'group_num':case 'group_pcnum':{const x=ifChar(arg,c);return x?veval(1,op,rv):false;}
    case 'is_qmark':{
      const x=ifChar(arg,c);if(x===undefined)return undefined;
      const q=qGet(x,vt[0]);
      if(!q)return op==='!=';
      if(vt.length<2)return op!=='!=';
      const mv=atoi(vt[1]);
      if(mv<=10)return veval(q.d?1:0,op,0);
      if(mv<20)return veval(q.d?1:0,op,1);
      if(mv===20)return veval(q.s?1:0,op,0);
      if(mv<30)return veval(q.s?1:0,op,1);
      if(mv<2000)return veval(q.t,op,mv-1000);
      if(mv<200000)return veval(q.v[0],op,mv-100000);
      if(mv<300000)return veval(q.v[1],op,mv-200000);
      return veval(q.v[2],op,mv-300000);
    }
    case 'is_inv_obj':case 'is_equ_obj':case 'is_wear_obj':{
      const x=ifChar(arg,c);if(!x)return undefined;
      const has=!!(fn==='is_inv_obj'?objCarry(x,vt[0]):objWear(x,vt[0]));
      return op==='=='?has:!has;
    }
    case 'is_wear_loc':{const x=ifChar(arg,c);if(!x)return undefined;const has=x.carrying.some(o=>o.wear_loc===atoi(vt[0]));return op==='=='?has:!has;}
    case 'carrycount':{const x=ifChar(arg,c);if(!x)return undefined;return veval(x.carrying.filter(o=>o.vnum===atoi(vt[0])).length,op,atoi(vt[1]));}
    case 'race':{const x=ifChar(arg,c);if(x===undefined)return undefined;const r=R.CONST.races[x.race];return seval(r?r.name:'',op,vt[0]);}
    case 'rembch':{
      const remb=rembOf(c);
      if(arg[0]==='$'){if(arg[1]==='b')return !!remb;const x=ifVar(arg,c);return x===undefined?undefined:!!remb&&remb.name===x.name;}
      const x=ifChar(arg,c);return x===undefined?undefined:!!remb&&remb.name===x.name;
    }
    case 'area':{const x=arg[0]==='$'?ifVar(arg,c):ifChar(arg,c);const r=x&&x.room;return r?seval(r.area.id,op,vt[0]):undefined;}
    case 'roomvalue':{
      let r=room,i=arg[1];
      const m=/^\$n(\d+)v([01])$/.exec(arg);if(m){r=R.getRoom(+m[1]);i=m[2];}
      if(!r||!r.progs||!r.progs.length)return undefined;
      const st=rstate(r);return veval(i==='0'?st.v0:st.v1,op,rv);
    }
    case 'roomtimer':{if(!room||!room.progs||!room.progs.length)return undefined;const st=rstate(room);return veval(st.t[atoi(arg.replace('$',''))]|0,op,rv);}
    case 'roomflag':return room?veval(0,op,rv):undefined;
    case 'lightnum':return room?veval(0,op,rv):undefined;
    case 'islight':return !!room&&!(R.roomDark&&R.roomDark(room));
    case 'isdark':return !!room&&!!(R.roomDark&&R.roomDark(room));
    case 'hasdoor':{const r=room;return !!(r&&r.exits[atoi(arg)]);}
    case 'exitinfo':{const e=room&&room.exits[atoi(arg.replace('$',''))];if(!e)return undefined;return veval(exitInfo(e),op,rv);}
    case 'isaffected':case 'is_affacted':{
      const x=ifChar(arg,c);if(x===undefined)return undefined;
      if(isNum(val))return veval(affBits(x),op,+val);
      const sn=R.skillLookup(val);return (x.affects||[]).some(a=>!a.deleted&&a.type===sn);
    }
  }
  warn('fn:'+fn,'還沒支援的條件：'+fn+'('+arg+')');
  return undefined;
}
/* 出口旗標（EX_ISDOOR 1、CLOSED 2、LOCKED 4、BASHPROOF 16、PICKPROOF 32、PASSPROOF 64） */
const exitInfo=e=>(e.isdoor?1:0)+(e.closed?2:0)+(e.locked?4:0)+(e.bashproof?16:0)+(e.pickproof?32:0)+(e.passproof?64:0);
function setExitInfo(e,f){e.isdoor=!!(f&1);e.closed=!!(f&2);e.locked=!!(f&4);e.bashproof=!!(f&16);e.pickproof=!!(f&32);e.passproof=!!(f&64);}
/* 房間的劇本數值：原版存在房間第一段劇本上（v0、v1、timer[0]、timer[1]） */
const rstate=r=>r._rv||(r._rv={v0:0,v1:0,t:[0,0]});

/* ---------- 執行（mprog_driver／mprog_process_if） ---------- */
function drive(p,c){
  if(c.kind==='mob'){
    const m=c.self;
    if(!m.room||m.deleted)return;
    if(m.aff.has('CHARM')&&!(m.act.has('PET')&&!m.aff.has('SUMMONED')))return;
  }
  /* 防止劇本互相呼叫沒完沒了（原版靠 C 的堆疊撐著） */
  if((MP._nest||0)>=64){warn('nest','劇本巢狀呼叫超過 64 層，停止');return;}
  MP._nest=(MP._nest||0)+1;
  try{runLines(lines(p),c);}finally{MP._nest--;}
}
function runLines(L,c){
  if(++c.depth>16){warn('deep','劇本呼叫太深，停止');return;}
  const st=[];
  const on=()=>st.length?st[st.length-1].on:true;
  for(let i=0;i<L.length;i++){
    const ln=L[i],w=ln.split(/\s+/)[0].toLowerCase();
    if(w==='if'){
      const parentOn=on();let cond=parentOn?ifcheck(ln.slice(2),c):false;
      while(i+1<L.length&&/^or(\s|$)/i.test(L[i+1])){i++;if(parentOn&&!cond)cond=ifcheck(L[i].slice(2),c);}
      st.push({on:parentOn&&cond,cond,parentOn});continue;
    }
    if(w==='else'){const f=st[st.length-1];if(f)f.on=f.parentOn&&!f.cond;continue;}
    if(w==='endif'){st.pop();continue;}
    if(!on())continue;
    if(w==='break')return;
    if(c.kind==='mob'){if(c.self.deleted||!c.self.room)return;c.self.wait=0;}
    if(c.kind==='obj'&&c.self.deleted)return;
    if(c.actor&&c.actor.deleted)return;
    try{interp(c,subst(ln,c));}catch(e){console.error('[劇本]',ln,e);}
  }
}
/* 依情境分派一行已代換過的指令 */
function interp(c,line){
  line=line.trim();if(!line)return;
  const [w0]=line.split(/\s+/),w=R.lc(w0),rest=line.slice(w0.length).trim();
  if(c.kind==='mob'){
    const f=MOBCMD[w];
    if(f){f(c.self,rest,c);return;}
    R.interpret(c.self,line);
    return;
  }
  const tbl=c.kind==='room'?RCMD:OCMD;
  const name=tbl.order.find(n=>n.startsWith(w));
  if(!name)return;   /* 指令表沒有：原版只記 bug log */
  tbl.fn[name](c.self,c.actor,rest,c);
}
MP.interpMob=(m,line)=>{const c=mkCtx('mob',m,null);interp(c,line);};
MP._test=(kind,self,actor,p)=>drive(p,mkCtx(kind,self,actor));   /* 測試用：直接跑一段劇本 */

/* ---------- 延遲執行（call_out：PULSE_CALL_OUT 3 秒一次） ---------- */
const callQ=[];
let callPulse=12;
MP.pulse=function(){
  if(--callPulse>0)return;
  callPulse=12;
  for(const q of [...callQ]){
    if(--q.t>0)continue;
    callQ.splice(callQ.indexOf(q),1);
    if(q.mob){if(q.mob.deleted||!q.mob.room||q.mob.aff.has('CHARM'))continue;try{interp(mkCtx('mob',q.mob,null),q.cmd);}catch(e){console.error(e);}}
    else if(q.room){try{interp(mkCtx('room',q.room,null),q.cmd);}catch(e){console.error(e);}}
  }
  for(const p of W.players)p.forced=false;
};

/* ---------- 共用動作 ---------- */
const sendTo=(ch,s,nl)=>R.send(ch,s+C.NOR+(nl===false?'':'\n'));
function actRoom(room,s,except,except2,nl){if(!room)return;for(const p of room.people)if(p!==except&&p!==except2&&!p.npc&&R.isAwake(p))sendTo(p,s,nl);}
function moveTo(v,to,enter){   /* char_from_room／char_to_room，加上 room_leave(8)、room_enter(6)、greet */
  if(!v||!to||!v.room)return;
  const from=v.room;
  if(R.MP.hasT(from,'room_leave'))MP.leave(v,from,8);
  if(v.deleted||v.room!==from)return;
  R.charFromRoom(v);R.charToRoom(v,to);
  if(R.MP.hasT(to,'room_enter'))MP.roomEnter(v,to,6);
  if(enter&&v.position>P.DEAD&&!v.deleted)MP.arrival(v,true);
  else if(v.position>P.DEAD&&!v.deleted)greet(v);
}
function loadObj(vnum,level){
  const p=W.objs[vnum];if(!p){warn('obj'+vnum,'沒有這個物品 '+vnum);return null;}
  return R.createObject(p,level||undefined);
}
const fuzzy=n=>R.fuzzy?R.fuzzy(n):n;
const L_IMM=R.LEVEL_IMMORTAL||43;
function msgGain(v,what,amt,up,down){sendTo(v,'你的'+what+(amt<0?down:up)+'了 '+Math.abs(amt)+(what==='金錢'?' 元！':' 點！'));}
function gainExp(v,n){if(v&&!v.npc&&R.gainExp)R.gainExp(v,n);}
function modhmv(room,arg,spec,type,group){   /* do_modhmv：XY.N；X 0 生命 1 法力 2 移動，Y 1 扣定量 2 加定量 3/4 依目前值 5/6 依最大值 */
  if(!room||!arg||!spec)return;
  const hmv=+spec[0],con=+spec[1],num=atoi(spec.slice(3));
  const tp=atoi(type),h=tp%10;
  const list=room.people.filter(v=>{
    if(v.deleted)return false;
    if(group)return group.includes(v);
    if(arg==='pc')return !v.npc;if(arg==='npc')return v.npc;if(arg==='all')return true;
    return nameHit(arg,v.name,false)&&!(v.wizinvis&&!v.npc);
  });
  for(const v of list){
    const [cur,max]=hmv===0?['hit','max_hit']:hmv===1?['mana','max_mana']:['move','max_move'];
    let dam;
    switch(con){case 1:dam=-num;break;case 2:dam=num;break;case 3:dam=-Math.trunc(v[cur]*num/100);break;case 4:dam=Math.trunc(v[cur]*num/100);break;
      case 5:dam=-Math.trunc(v[max]*num/100);break;case 6:dam=Math.trunc(v[max]*num/100);break;default:return;}
    if(h===1&&v.aff.has('SANCTUARY'))dam=Math.trunc(dam/2);
    const cap=v[max]+Math.trunc(v[max]/10);
    if(hmv===0){
      v.hit=v.hit+dam;
      v.hit=(v.npc||isImmort(v))?Math.max(1,Math.min(v.hit,cap)):Math.max(-20,Math.min(v.hit,cap));
      R.updatePos(v);
      switch(v.position){
        case P.MORTAL:sendTo(v,'你受了極嚴重的傷，如果再不治療，很快就會死去.');actRoom(v.room,sd(v)+' 受了極嚴重的傷，如果再不治療，很快就會死去.',v);break;
        case P.INCAP:sendTo(v,'你因傷重而無法行動，如果得不到治療，就只有等死了.');actRoom(v.room,sd(v)+' 因傷重而無法行動，如果得不到治療，就只有等死了.',v);break;
        case P.STUNNED:sendTo(v,'你昏倒了，過一會也許會回復.');actRoom(v.room,sd(v)+' 昏倒了，過一會也許會回復.',v);break;
        case P.DEAD:sendTo(v,'你死了！\n');actRoom(v.room,sd(v)+' 死了！',v);R.damage(v,v,0,0,0,-2);break;
        default:
          if(dam+Math.trunc(v.max_hit/4)<0)sendTo(v,C.HIY+'天哪! 痛死人了!');
          if(v.hit<v.max_hit/4)sendTo(v,C.HIR+'你正在噴血!');
      }
    }else{v[cur]=Math.max(-100,Math.min(v[cur]+dam,cap));}
  }
}
function addAffect(target,t){   /* 目標 '法術' 等級 時間 位置 數值 位元 */
  if(!target)return;
  const sn=skillLookup(t[0]);if(sn<0)return;
  const level=atoi(t[1]);
  if(level<=0&&R.isAffected(target,sn))return;
  const af={type:sn,duration:atoi(t[2]),location:APPLY[atoi(t[3])]||'NONE',modifier:atoi(t[4]),bitvector:bitName(t[5])};
  if(R.affectJoin)R.affectJoin(target,af);else R.affectToChar(target,af);
}
function delAffect(target,what){
  if(!target)return;
  what=String(what||'').replace(/^'|'$/g,'');
  if(R.lc(what)==='all'){for(const a of [...(target.affects||[])])R.affectStrip(target,a.type);return;}
  if(R.lc(what)==='random'){for(const a of [...(target.affects||[])])if(R.pct()<25)R.affectStrip(target,a.type);return;}
  if(isNum(what)){const b=bitName(what);for(const a of [...(target.affects||[])])if(a.bitvector===b)R.affectRemove(target,a);return;}
  const sn=R.skillLookup(what);if(sn>0)R.affectStrip(target,sn);
}
/* 參數切字（one_argument：支援單引號） */
function args(s){
  const out=[];s=String(s||'').trim();
  while(s){
    if(s[0]==="'"){const j=s.indexOf("'",1);out.push(j<0?s.slice(1):s.slice(1,j));s=(j<0?'':s.slice(j+1)).trim();continue;}
    const m=/^(\S+)\s*/.exec(s);out.push(m[1]);s=s.slice(m[0].length);
  }
  return out;
}
const restOf=(s,n)=>{s=String(s||'').trim();for(let i=0;i<n;i++)s=s.replace(/^('[^']*'|\S+)\s*/,'');return s;};
function dirOf(a){a=R.lc(a||'');for(const [i,d] of R.DIRS.entries())if(a&&d.startsWith(a))return i;return -1;}
function findLocation(viewer,arg){
  if(isNum(arg))return R.getRoom(+arg)||null;
  const v=viewer?charWorldOf(viewer,arg):worldFindChar(arg);if(v)return v.room;
  return null;
}
function purgeRoom(room,except){for(const v of [...room.people])if(v.npc&&v!==except&&!v.deleted)R.extractChar(v);for(const o of [...room.contents])R.extractObj(o);}

/* do_mpgreward／do_rgreward：類型 對象 等級 數值；同隊、同房間的玩家都拿到（等級正數＝至少，負數＝至多） */
function greward(a,find){
  const [type,ppl,level,value]=args(a);if((!isNum(level)&&level!=='basic')||!isNum(value))return;
  const victim=find(ppl);if(!victim||!victim.room)return;
    const lv=+level||0,v=+value;
    for(const g of victim.room.people){
      if(g.npc||!sameGroup(victim,g))continue;
      if(!((level==='basic'&&g.cls<5)||(lv<0&&g.level+lv<1)||(lv>0&&g.level-lv>-1)))continue;
      if(type==='exp'){gainExp(g,v);msgGain(g,'經驗值',v,'增加','減少');}
      else if(type==='skexp'){g.skexp=(g.skexp||0)+v;msgGain(g,'技能經驗值',v,'增加','減少');}
      else if(type==='gold'){g.gold+=v;msgGain(g,'金錢',v,'增加','減少');}
      else if(type==='resp'){g.resp=(g.resp||0)+v;msgGain(g,'威望',v,'提高','下降');}
      else if(type==='align'){let d=v;if(g.alignment+d>1000)d=1000-g.alignment;if(g.alignment+d<-1000)d=-1000-g.alignment;g.alignment+=d;msgGain(g,'陣營',d,'上升','下降');}
    }
  }

/* ---------- NPC 指令（mob_commands.c） ---------- */
const npcOnly=f=>(m,a,c)=>{if(m.npc)f(m,a,c);};
const MOBCMD={
  mpasound:(m,a)=>{if(!a||!m.room)return;m.room.exits.forEach(e=>{const to=e&&R.getRoom(e.to);if(to&&to!==m.room)actRoom(to,a);});},
  mpkill:(m,a)=>{const v=charRoomOf(m,args(a)[0]);if(!v||v===m)return;if(v.room.flags.has('SAFE'))return;if(m.aff.has('CHARM')&&m.master===v)return;R.multiHit(m,v);},
  mpjunk:npcOnly((m,a)=>{
    const t=args(a)[0];if(!t)return;
    if(t!=='all'&&!t.startsWith('all.')){let o=objWear(m,t);if(o){R.unequipChar(m,o);R.extractObj(o);return;}o=objCarry(m,t);if(o)R.extractObj(o);return;}
    if(t==='all.coins'||t==='coins'){m.gold=0;return;}
    for(const o of [...m.carrying])if(t.length===3||nameHit(t.slice(4),o.name,false)){if(o.wear_loc>=0)R.unequipChar(m,o);R.extractObj(o);}
  }),
  mpechoaround:npcOnly((m,a)=>{const t=args(a)[0];const v=charRoomOf(m,t);if(v)actRoom(m.room,restOf(a,1),m,v);}),
  mpechoat:npcOnly((m,a)=>{const t=args(a)[0];const s=restOf(a,1);if(!s)return;const v=charRoomOf(m,t);if(v)sendTo(v,s);}),
  mpecho:(m,a)=>{if(a)actRoom(m.room,a,m);},
  mpechotoall:(m,a)=>{if(!a)return;for(const p of W.players)if(p.playing&&p.room!==m.room)R.send(p,'\n'+a+C.NOR+'\n');},
  mpnonechoaround:npcOnly((m,a)=>{const v=charRoomOf(m,args(a)[0]);if(v)actRoom(m.room,restOf(a,1),m,v,false);}),
  mpnonechoat:npcOnly((m,a)=>{const v=charRoomOf(m,args(a)[0]);const s=restOf(a,1);if(v&&s)sendTo(v,s,false);}),
  mpnonecho:(m,a)=>{if(a)actRoom(m.room,a,m,null,false);},
  mpnowait:(m)=>{m.wait=0;for(const q of R.castQ||[])if(q.ch===m)q.t=1;},
  mpmload:(m,a)=>{const v=args(a)[0];if(!isNum(v))return;const p=W.mobs[+v];if(!p){warn('mob'+v,'沒有這個怪物 '+v);return;}
    const t=R.createMobile(p);R.charToRoom(t,m.room);MP.repop(t);},
  mpoload:(m,a)=>{   /* vnum [等級|floor] ／ vnum 等級 floor ／ vnum 目標 target ／ vnum 目標 等級|viclv|standard target|floor */
    const [a1,a2,a3,a4]=args(a);if(!isNum(a1))return;
    let lv=Math.min(fuzzy(L_IMM-3),m.level),o;
    if(a3===undefined){
      if(isNum(a2))lv=+a2;o=loadObj(+a1,lv);if(!o)return;
      if(a2==='floor')R.objToRoom(o,m.room);else R.objToChar(o,m);
      MP.objRepop(o);return;
    }
    if(a4===undefined){
      if(a3==='floor'){lv=isNum(a2)?+a2:fuzzy(m.level-1);o=loadObj(+a1,lv);if(!o)return;R.objToRoom(o,m.room);MP.objRepop(o);return;}
      if(a3==='target'){const v=charRoomOf(m,a2);if(!v)return;o=loadObj(+a1,lv);if(!o)return;R.objToChar(o,v);MP.objRepop(o);}
      return;
    }
    const v=charRoomOf(m,a2);if(!v)return;
    lv=isNum(a3)?+a3:a3==='viclv'?v.level:a3==='standard'?Math.min(fuzzy(L_IMM-3),fuzzy(m.level-1)):lv;
    o=loadObj(+a1,lv);if(!o)return;
    if(a4==='target')R.objToChar(o,v);else if(a4==='floor')R.objToRoom(o,m.room);else R.objToChar(o,m);
    MP.objRepop(o);
  },
  mppurge:(m,a)=>{
    const t=args(a);
    if(!t[0]){purgeRoom(m.room,m);return;}
    if(t[1]===undefined){
      if(t[0]!=='all'&&!t[0].startsWith('all.')){
        const v=charRoomOf(m,t[0]);
        if(!v){const o=objHere(m,t[0]);if(o)R.extractObj(o);return;}
        if(!v.npc)return;
        if(v===m)m.rembch=null;
        R.extractChar(v);return;
      }
      for(const o of [...m.carrying])if(o.wear_loc<0&&(t[0].length===3||nameHit(t[0].slice(4),o.name,false)))R.extractObj(o);
      return;
    }
    const v=charRoomOf(m,t[0]);if(!v)return;
    if(isNum(t[2])){const vn=+t[2];for(const o of [...v.carrying])if(o.vnum===vn&&(t[1].startsWith('vnum')||o.wear_loc<0))R.extractObj(o);return;}
    if(t[1]!=='all'&&!t[1].startsWith('all.')){for(const o of [...v.carrying])if(nameHit(t[1],o.name,false))R.extractObj(o);return;}
    for(const o of [...v.carrying])if(o.wear_loc<0&&(t[1].length===3||nameHit(t[1].slice(4),o.name,false)))R.extractObj(o);
  },
  mpgoto:(m,a)=>{const to=findLocation(m,args(a)[0]);if(!to)return;if(m.fighting)R.stopFighting(m,true);R.charFromRoom(m);R.charToRoom(m,to);},
  mpat:(m,a,c)=>{
    const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;
    const to=isNum(t)?R.getRoom(+t):(charWorldOf(m,t)||{}).room;if(!to)return;
    const from=m.room,pos=m.position,f=m.fighting;
    m.position=P.STANDING;R.charFromRoom(m);R.charToRoom(m,to);
    try{interp(c&&c.kind==='mob'?c:mkCtx('mob',m,null),rest);}
    finally{if(!m.deleted){if(m.room)R.charFromRoom(m);R.charToRoom(m,from);m.fighting=f;m.position=pos;R.updatePos(m);}}
  },
  mptransfer:(m,a)=>{
    const [t1,t2]=args(a);if(!t1)return;
    let to=m.room;
    if(t2){const d=dirOf(t2);if(d>=0){const e=m.room.exits[d];to=e&&R.getRoom(e.to);}else to=findLocation(m,t2);if(!to||to===m.room)return;}
    if(t1==='pc'||t1==='all'){for(const v of [...m.room.people])if(v!==m&&R.canSee(m,v)&&(t1==='all'||!v.npc))moveTo(v,to);return;}
    const v=charWorldOf(m,t1);if(v&&v.room)moveTo(v,to);
  },
  mpteleport:npcOnly((m,a)=>{
    const t=args(a);let to=null;const rnd=f=>{const rs=Object.values(W.rooms).filter(f);return rs.length?rs[R.rand(0,rs.length-1)]:null;};
    switch(t[0]){
      case undefined:return;
      case 'all':case 'noclan':to=rnd(()=>true);break;
      case 'recall1':to=rnd(r=>r.area.recall===3001);break;case 'recall2':to=rnd(r=>r.area.recall===4580);break;case 'recall3':to=rnd(r=>r.area.recall===14229);break;
      case 'area':to=rnd(r=>r.area===m.room.area);break;
      case 'vnum':{const lo=atoi(t[1]),hi=atoi(t[2]);if(!lo||lo>hi)return;to=rnd(r=>r.vnum>=lo&&r.vnum<=hi);break;}
      case 'self':to=m.room;break;
      default:to=findLocation(m,t[0]);
    }
    if(!to)return;
    if(m.fighting)R.stopFighting(m,true);
    moveTo(m,to,true);
  }),
  mpforce:(m,a)=>{
    const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;
    if(t==='all'){for(const v of [...m.room.people])if(v!==m&&!v.deleted&&v.level<m.level&&R.canSee(m,v)){v.forced=true;R.interpret(v,rest);R.flush(v,true);}return;}
    const v=charRoomOf(m,t);if(!v||v===m)return;v.forced=true;R.interpret(v,rest);R.flush(v,true);
  },
  mpforcer:(m,a)=>{const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;const room=t==='here'?m.room:isNum(t)?R.getRoom(+t):null;if(room)interp({...mkCtx('room',room,m)},rest);},
  mpcallout:npcOnly((m,a)=>{const t=args(a)[0];if(!isNum(t)||+t<1)return;callQ.push({mob:m,t:+t,cmd:restOf(a,1)});}),
  mpcall:npcOnly((m,a)=>{
    const [fun,who,pct]=args(a);if(!fun)return;
    if(who==='all'||who==='pc'||who==='npc'){for(const v of [...m.room.people])if(v!==m&&!v.deleted&&R.canSee(m,v)&&(who==='all'||(who==='pc'?!v.npc:v.npc)))MP.defun(m,fun,v);return;}
    const v=charRoomOf(m,who);if(!v)return;
    const per=isNum(pct)?Math.max(0,Math.min(100,+pct)):100;
    if(per===100||R.pct()<per)MP.defun(m,fun,v);
  }),
  mplog:()=>{},
  mpdef_rembch:(m,a)=>{const t=args(a)[0];if(!t)return;if(t==='null-tar'){m.rembch=null;return;}const v=charRoomOf(m,t);if(v)m.rembch=v;},
  mpdis_magic:(m,a)=>{const [t,what]=args(a);const v=t==='self'?m:charRoomOf(m,t);delAffect(v,what);},
  mpgreward:(m,a)=>greward(a,ppl=>charRoomOf(m,ppl)),

  mpgroup:()=>{},
  mpadd_qmark:npcOnly((m,a)=>{const t=args(a);qAdd(t[0]==='self'?m:charRoomOf(m,t[0]),t.slice(1));}),
  add_qmark:(m,a)=>{const t=args(a);qAdd(t[0]==='self'?m:charRoomOf(m,t[0]),t.slice(1));},
  mpdel_qmark:npcOnly((m,a)=>{const t=args(a);qDel(t[0]==='self'?m:charRoomOf(m,t[0]),t[1]);}),
  mpmod_qmark:npcOnly((m,a)=>{const t=args(a);qMod(t[0]==='self'?m:charRoomOf(m,t[0]),t.slice(1));}),
  mod_qmark:()=>{},del_qmark:()=>{},   /* 原版 NPC 用這兩個沒有作用 */
  mpadd_all_qmark:npcOnly((m,a)=>{const t=args(a);const l=t[0]==='self'?m:charRoomOf(m,t[0]);if(!l)return;for(const v of [...l.room.people])if(sameGroup(l,v))qAdd(v,t.slice(1));}),
  mpmod_all_qmark:npcOnly((m,a)=>{const t=args(a);const l=t[0]==='self'?m:charRoomOf(m,t[0]);if(!l)return;for(const v of [...l.room.people])if(sameGroup(l,v))qMod(v,t.slice(1));}),
  mpdel_all_qmark:npcOnly((m,a)=>{const t=args(a);const l=t[0]==='self'?m:charRoomOf(m,t[0]);if(!l)return;for(const v of [...l.room.people])if(sameGroup(l,v))qDel(v,t[1]);}),
  mpgold:(m,a)=>{const [t,n]=args(a);const v=charWorldOf(m,t);if(!v||!isNum(n))return;const x=+n;v.gold=(v.gold||0)+x;
    if(x>=0){sendTo(v,m.short+' 給你 '+x+' 金幣。');actRoom(m.room,m.short+' 給了 '+sd(v)+' 一些金幣。',m,v);}
    else{sendTo(v,m.short+' 拿走你 '+(-x)+' 金幣。');actRoom(m.room,m.short+' 拿走了 '+sd(v)+' 一些金幣。',m,v);}},
  mpmerit:()=>{},
  mpskillexp:(m,a)=>{const [t,n]=args(a);const v=charRoomOf(m,t);if(!v||!isNum(n))return;const x=+n;sendTo(v,x>0?'你得到 '+x+' 點技能經驗。':'你失去 '+Math.abs(x)+' 點技能經驗。');v.skexp=(v.skexp||0)+x;},
  mpexp:(m,a)=>{const [t,n]=args(a);const v=charWorldOf(m,t);if(!v||!isNum(n))return;let x=+n;
    if(x<=0&&v.exp<Math.abs(x))x=1000-v.exp;sendTo(v,x>0?'你得到 '+x+' 點經驗。':'你失去 '+Math.abs(x)+' 點經驗。');gainExp(v,x);},
  mppractice:(m,a)=>{const [t,n]=args(a);const v=charWorldOf(m,t);if(!v||v.npc||!isNum(n))return;const x=+n;v.practice=(v.practice||0)+x;
    sendTo(v,x>0?'你的練習點數提升了 '+x+' 點。':'你的練習點數降低 '+Math.abs(x)+' 點。');},
  mpcexp:()=>{},
  mpalign:(m,a)=>{const [t,n]=args(a);const v=charWorldOf(m,t);if(!v||v.npc||!isNum(n))return;const x=+n;v.alignment=Math.max(-1000,Math.min(1000,v.alignment+x));
    if(x<1000&&x>-1000)sendTo(v,x>0?'你的陣營提升了 '+x+' 點。':'你的陣營降低 '+Math.abs(x)+' 點。');},
  mpresp:(m,a)=>{const [t,n]=args(a);const v=charWorldOf(m,t);if(!v||v.npc||!isNum(n))return;const x=+n;v.resp=(v.resp||0)+x;
    sendTo(v,x>0?'你的威望提升了 '+x+' 點。':'你的威望降低 '+Math.abs(x)+' 點。');},
  mpget:()=>{},mpmake_horse:()=>{},mpstun:()=>{},mptrip:()=>{},mpdesc:()=>{},mpmset:()=>{},
  mpset_obj_affect:()=>{},mpremove_obj_affect:()=>{},mpmodify_obj_affect:()=>{},mpforceo:()=>{},
  mpmodify:(m,a)=>{const [what,op,val]=args(a);const v=atoi(val),s=op==='-'?-v:op==='+'?v:0;
    if(what==='dr')m.damroll+=s;else if(what==='hr')m.hitroll+=s;else if(what==='ac')m.armor+=s;},
  /* 怪物特殊攻擊（skill.c 的 skilldrv 很長，簡化成多打一輪） */
  skilldrv:(m,a)=>{const t=args(a);const v=(t[1]&&charRoomOf(m,t[1]))||m.fighting;if(v&&v.room===m.room&&v.position>P.DEAD)R.multiHit(m,v);},
  self_skill:()=>{},selfskill:()=>{},self_magic:()=>{},
};

/* ---------- 房間指令（room_commands.c；表的順序決定縮寫） ---------- */
const rRoom=(room,a)=>roomFindChar(room,a);
const RCMD={order:['echo','echoat','echoaround','nonechoat','nonechoaround','echotoall','echotoarea','modrvt','modhmv','modhmvgroup','at',
  'cast','callout','rcall','oload','mload','add_affect','del_affect','force','transfer','transfergroup','wtransfer','wtransfergroup',
  'makedoor','deldoor','setdoor','purge','log','def_rembch','add_qmark','rpexp','rpgold','rpresp','rpalign','rpskillexp','rpmerit',
  'rppractice','greward','add_all_qmark','del_qmark','del_all_qmark','mod_qmark','mod_all_qmark','stun','setroom'],fn:{}};
const RF=RCMD.fn;
RF.echo=(room,ch,a)=>{if(a)actRoom(room,a);};
RF.echoat=(room,ch,a)=>{const v=rRoom(room,args(a)[0]);const s=restOf(a,1);if(v&&s)sendTo(v,s);};
RF.echoaround=(room,ch,a)=>{const v=rRoom(room,args(a)[0]);if(v)actRoom(room,restOf(a,1),v);};
RF.nonechoat=(room,ch,a)=>{const v=rRoom(room,args(a)[0]);const s=restOf(a,1);if(v&&s)sendTo(v,s,false);};
RF.nonechoaround=(room,ch,a)=>{const v=rRoom(room,args(a)[0]);if(v)actRoom(room,restOf(a,1),v,null,false);};
RF.echotoall=(room,ch,a)=>{for(const p of W.players)if(p.playing)sendTo(p,a);};
RF.echotoarea=(room,ch,a)=>{for(const p of W.players)if(p.playing&&p.room&&p.room.area===room.area)sendTo(p,a);};
RF.modrvt=(room,ch,a)=>{
  let t=args(a);if(!t[0]||t.length<2)return;
  if(!/^[vtdxcsp]/.test(t[0])&&t[0]!=='self'){room=R.getRoom(atoi(t[0]));if(!room)return;t=t.slice(1);}
  const [what,op,val]=t,v=atoi(val),st=rstate(room);
  switch(what[0]){
    case 'v':if(!room.progs||!room.progs.length)return;if(what[1]==='0')st.v0=qopr(st.v0,op,v);else st.v1=qopr(st.v1,op,v);break;
    case 't':if(!room.progs||!room.progs.length)return;if(what[1]==='0'||what[1]==='i')st.t[0]=qopr(st.t[0],op,v);else if(what[1]==='1')st.t[1]=qopr(st.t[1],op,v);break;
    case 'd':{const e=room.exits[atoi(what.slice(1))];if(e)setExitInfo(e,qopr(exitInfo(e),op,v));break;}
  }
};
RF.modhmv=(room,ch,a)=>{const t=args(a);if(t.length<3)return;modhmv(room,t[0],t[1],t[3]);};
RF.modhmvgroup=(room,ch,a)=>{const t=args(a);const l=rRoom(room,t[0]);if(!l)return;modhmv(room,'all',t[1],t[3],room.people.filter(v=>sameGroup(l,v)));};
RF.at=(room,ch,a,c)=>{const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;const to=isNum(t)?R.getRoom(+t):(worldFindChar(t)||{}).room;if(!to)return;interp({...c,kind:'room',self:to},rest);};
RF.cast=(room,ch,a)=>{
  const t=args(a);let times=1,sp,vn,lv;
  if(isNum(t[0])){times=+t[0];[,sp,vn,lv]=t;}else [sp,vn,lv]=t;
  const v=rRoom(room,vn);if(!v)return;const sn=R.skillLookup(sp);if(sn<=0)return;
  const level=lv==='viclv'?v.level:isNum(lv)?+lv:null;if(level===null)return;
  while(times--&&!v.deleted)R.castSpell(sn,level,v,v);
};
RF.callout=(room,ch,a)=>{const t=args(a)[0];if(!isNum(t)||+t<1)return;callQ.push({room,t:+t,cmd:restOf(a,1)});};
RF.rcall=(room,ch,a)=>{
  const [fun,who,pct]=args(a);if(!fun)return;
  if(who==='all'||who==='pc'||who==='npc'){for(const v of [...room.people])if(!v.deleted&&(who==='all'||(who==='pc'?!v.npc:v.npc)))MP.rdefun(room,fun,v);return;}
  const v=rRoom(room,who);if(!v)return;
  const per=isNum(pct)?Math.max(0,Math.min(100,+pct)):100;
  if(per===100||R.pct()<per)MP.rdefun(room,fun,v);
};
RF.oload=(room,ch,a)=>{   /* vnum 等級|viclv [target|floor|目標 [target]] */
  const [a1,a2,a3,a4]=args(a);if(!isNum(a1)||!a2)return;
  let target=null,site=0;
  if(a3==='target')site=1;else if(a3&&a3!=='floor'){target=rRoom(room,a3);if(!target)return;if(a4==='target')site=1;}
  let level;
  if(isNum(a2))level=+a2;else{if(!target)return;level=a2==='viclv'?target.level:fuzzy(target.level-1);}
  level=Math.min(fuzzy(L_IMM-3),level);
  const o=loadObj(+a1,level);if(!o)return;
  if(o.wear.has('TAKE')&&site===1){if(!target){R.extractObj(o);return;}R.objToChar(o,target);MP.objRepop(o);return;}
  R.objToRoom(o,room);MP.objRepop(o);
};
RF.mload=(room,ch,a)=>{const v=args(a)[0];if(!isNum(v))return;const p=W.mobs[+v];if(!p){warn('mob'+v,'沒有這個怪物 '+v);return;}const m=R.createMobile(p);R.charToRoom(m,room);MP.repop(m);};
RF.add_affect=(room,ch,a)=>{const t=args(a);if(t.length<7)return;addAffect(rRoom(room,t[0]),t.slice(1));};
RF.del_affect=(room,ch,a)=>{
  const t=args(a);if(t.length<2)return;
  const list=t[0]==='all'?room.people:t[0]==='pc'?room.people.filter(v=>!v.npc):t[0]==='npc'?room.people.filter(v=>v.npc):[rRoom(room,t[0])].filter(Boolean);
  for(const v of [...list])delAffect(v,t[1]);
};
RF.force=(room,ch,a,c)=>{
  const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;
  if(t==='all'){for(const v of [...room.people])if(!v.deleted){v.forced=true;R.interpret(v,rest);R.flush(v,true);}return;}
  if(isNum(t)){const to=R.getRoom(+t);if(to)interp({...c,kind:'room',self:to},rest);return;}
  const v=rRoom(room,t);if(!v)return;v.forced=true;R.interpret(v,rest);R.flush(v,true);
};
function rDest(room,a2){
  const d=a2==='here'?100:dirOf(a2);
  if(d===100)return room;
  if(d>=0){const e=room.exits[d];return e&&R.getRoom(e.to);}
  return isNum(a2)?R.getRoom(+a2):null;
}
RF.transfer=(room,ch,a)=>{
  const [a1,a2]=args(a);if(!a1||!a2)return;const to=rDest(room,a2);if(!to)return;
  if(a1==='obj'){for(const o of [...room.contents])R.objToRoom(o,to);return;}
  if(a1==='all'||a1==='pc'||a1==='npc'){for(const v of [...room.people])if(a1==='all'||(a1==='pc'?!v.npc:v.npc))moveTo(v,to);return;}
  const v=rRoom(room,a1);if(v)moveTo(v,to);
};
RF.transfergroup=(room,ch,a)=>{const [a1,a2]=args(a);if(!a1||!a2)return;const to=rDest(room,a2);if(!to)return;const l=rRoom(room,a1);if(!l)return;
  for(const v of [...l.room.people])if(sameGroup(l,v))moveTo(v,to);};
RF.wtransfer=RF.transfer;RF.wtransfergroup=RF.transfergroup;
RF.makedoor=(room,ch,a)=>{   /* 方向 描述 關鍵字 旗標 鑰匙 目的地 */
  const t=args(a);const d=atoi(t[0]);if(!isNum(t[0])||d<0||d>5||room.exits[d])return;
  if(t.length<6||!isNum(t[3])||!isNum(t[4])||!isNum(t[5]))return;
  const f=+t[3];
  room.exits[d]={to:+t[5],desc:t[1],kw:t[2],key:+t[4],isdoor:f>0,closed:false,locked:false,pickproof:[2,4,6,8].includes(f),
    passproof:[3,4,7,8].includes(f),bashproof:[5,6,7,8].includes(f),init:{closed:false,locked:false},temp:true};
};
RF.deldoor=(room,ch,a)=>{const d=atoi(args(a)[0]);if(d>=0&&d<6)room.exits[d]=null;};
RF.setdoor=(room,ch,a)=>{
  const [dd,what,val]=args(a);const e=room.exits[atoi(dd)];if(!e||!isNum(val))return;
  if(what==='vnum')e.to=+val;else if(what==='key')e.key=+val;
  else if(what==='flags'){const f=+val;e.isdoor=f>0;e.pickproof=[2,4,6,8].includes(f);e.passproof=[3,4,7,8].includes(f);e.bashproof=[5,6,7,8].includes(f);}
};
RF.purge=(room,ch,a)=>{
  const t=args(a),x=t[0]||'';
  if(!x||x==='all'){purgeRoom(room,null);return;}
  if(x.startsWith('all.')){const n=x.slice(4);for(const v of [...room.people])if(v.npc&&nameHit(n,v.name,false))R.extractChar(v);for(const o of [...room.contents])if(nameHit(n,o.name,false))R.extractObj(o);return;}
  if(x==='allmob'){for(const v of [...room.people])if(v.npc)R.extractChar(v);return;}
  if(x.startsWith('allmob.')){const n=x.slice(7);for(const v of [...room.people])if(v.npc&&nameHit(n,v.name,false))R.extractChar(v);return;}
  if(x==='allobj'){for(const o of [...room.contents])R.extractObj(o);return;}
  if(x.startsWith('allobj.')){const n=x.slice(7);for(const o of [...room.contents])if(nameHit(n,o.name,false))R.extractObj(o);return;}
  if(x.startsWith('mob.')){const v=findIn(room.people,x.slice(4),v=>v.npc);if(v)R.extractChar(v);return;}
  if(x.startsWith('obj.')){const o=findIn(room.contents,x.slice(4));if(o)R.extractObj(o);return;}
  const v=rRoom(room,x);
  if(v&&t[1]){const o=objCarry(v,t[1])||objWear(v,t[1]);if(o)R.extractObj(o);return;}
  if(v&&v.npc){R.extractChar(v);return;}
  const o=findIn(room.contents,x);if(o)R.extractObj(o);
};
RF.log=()=>{};
RF.def_rembch=(room,ch,a)=>{const t=args(a)[0];if(!t)return;if(t==='null-tar'){room.rrembch=null;return;}const v=worldFindChar(t);if(v)room.rrembch=v;};
RF.add_qmark=(room,ch,a)=>{const t=args(a);qAdd(rRoom(room,t[0]),t.slice(1));};
RF.del_qmark=(room,ch,a)=>{const t=args(a);qDel(rRoom(room,t[0]),t[1]);};
RF.mod_qmark=(room,ch,a)=>{const t=args(a);qMod(rRoom(room,t[0]),t.slice(1));};
const rGroup=(room,n)=>{const l=rRoom(room,n);return l?l.room.people.filter(v=>sameGroup(l,v)):[];};
RF.add_all_qmark=(room,ch,a)=>{const t=args(a);for(const v of rGroup(room,t[0]))qAdd(v,t.slice(1));};
RF.del_all_qmark=(room,ch,a)=>{const t=args(a);for(const v of rGroup(room,t[0]))qDel(v,t[1]);};
RF.mod_all_qmark=(room,ch,a)=>{const t=args(a);for(const v of rGroup(room,t[0]))qMod(v,t.slice(1));};
const rpNum=(f)=>(room,ch,a)=>{const [t,n]=args(a);const v=rRoom(room,t)||worldFindChar(t);if(v&&isNum(n))f(v,+n);};
RF.rpexp=rpNum((v,x)=>{sendTo(v,x>0?'你得到 '+x+' 點經驗。':'你失去 '+Math.abs(x)+' 點經驗。');gainExp(v,x);});
RF.rpgold=rpNum((v,x)=>{v.gold=(v.gold||0)+x;});
RF.rpresp=rpNum((v,x)=>{if(v.npc)return;v.resp=(v.resp||0)+x;sendTo(v,x>0?'你的威望提升了 '+x+' 點。':'你的威望降低 '+Math.abs(x)+' 點。');});
RF.rpalign=rpNum((v,x)=>{if(v.npc)return;v.alignment=Math.max(-1000,Math.min(1000,v.alignment+x));});
RF.rpskillexp=rpNum((v,x)=>{v.skexp=(v.skexp||0)+x;sendTo(v,x>0?'你得到 '+x+' 點技能經驗。':'你失去 '+Math.abs(x)+' 點技能經驗。');});
RF.rpmerit=()=>{};
RF.rppractice=rpNum((v,x)=>{if(v.npc)return;v.practice=(v.practice||0)+x;});
RF.greward=(room,ch,a)=>greward(a,ppl=>rRoom(room,ppl));
RF.stun=(room,ch,a)=>{
  const [t,n]=args(a);if(!t||!isNum(n))return;const x=+n;
  if(t==='pc'||t==='npc'){for(const v of room.people)if(t==='pc'?!v.npc:v.npc)v.wait=(v.wait||0)+x;return;}
  const v=rRoom(room,t);if(v)v.wait=(v.wait||0)+x;
};
RF.setroom=(room,ch,a)=>{   /* setroom desc N 文字（換新）／A 文字（接上） */
  const t=args(a);if(t[0]!=='desc')return;const s=restOf(a,2);
  if(t[1]==='N')room.desc=s+'\n';else if(t[1]==='A')room.desc=(room.desc||'')+s+'\n';
};

/* ---------- 物品指令（obj_commands.c） ---------- */
const OCMD={order:['oset','echo','echoat','echoaround','echotoall','nonechoat','nonechoaround','oforce','modhmv','oforcer','add_affect',
  'del_affect','purge','oteleport','ogoto','odef_rembch','cast','opset_obj_affect','opremove_obj_affect','opmodify_obj_affect','opmodvt'],fn:{}};
const OF=OCMD.fn;
const oRoom=o=>objRoom(o);
OF.oset=(o,ch,a)=>{
  const [a1,a2,op,val]=args(a);if(!a1||!a2||val===undefined)return;
  const car=carrierOf(o);
  const x=a1==='self'?o:car?objHere(car,a1):findIn((oRoom(o)||{contents:[]}).contents,a1);if(!x)return;
  const m=/^v(\d)$/.exec(a2);if(!m)return;const i=+m[1];x.values[i]=qopr(x.values[i]|0,op,atoi(val));
};
OF.echo=(o,ch,a)=>{const r=oRoom(o);if(a)actRoom(r,a);};
OF.echoat=(o,ch,a)=>{const v=roomFindChar(oRoom(o),args(a)[0]);const s=restOf(a,1);if(v&&s)sendTo(v,s);};
OF.echoaround=(o,ch,a)=>{const r=oRoom(o);const v=roomFindChar(r,args(a)[0]);if(v)actRoom(r,restOf(a,1),v);};
OF.echotoall=(o,ch,a)=>{for(const p of W.players)if(p.playing)sendTo(p,a);};
OF.nonechoat=(o,ch,a)=>{const v=roomFindChar(oRoom(o),args(a)[0]);const s=restOf(a,1);if(v&&s)sendTo(v,s,false);};
OF.nonechoaround=(o,ch,a)=>{const r=oRoom(o);const v=roomFindChar(r,args(a)[0]);if(v)actRoom(r,restOf(a,1),v,null,false);};
OF.oforce=(o,ch,a)=>{const r=oRoom(o);const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;
  const list=t==='all'?(r?r.people:[]):[roomFindChar(r,t)].filter(Boolean);for(const v of [...list]){v.forced=true;R.interpret(v,rest);R.flush(v,true);}};
OF.modhmv=(o,ch,a)=>{const t=args(a);if(t.length<3)return;modhmv(oRoom(o),t[0],t[1],t[3]);};
OF.oforcer=(o,ch,a,c)=>{const t=args(a)[0],rest=restOf(a,1);if(!t||!rest)return;const room=t==='here'?oRoom(o):isNum(t)?R.getRoom(+t):null;if(room)interp({...c,kind:'room',self:room},rest);};
OF.add_affect=(o,ch,a)=>{const t=args(a);if(t.length<7)return;addAffect(roomFindChar(oRoom(o),t[0]),t.slice(1));};
OF.del_affect=(o,ch,a)=>{const t=args(a);if(t.length<2)return;delAffect(roomFindChar(oRoom(o),t[0]),t[1]);};
OF.purge=(o,ch,a)=>{const t=args(a)[0];if(t==='self'){R.extractObj(o);return;}const car=carrierOf(o);if(!car||!car.room)return;RF.purge(car.room,ch,a);};
OF.oteleport=(o,ch,a)=>{
  const t=args(a);const rnd=f=>{const rs=Object.values(W.rooms).filter(f);return rs.length?rs[R.rand(0,rs.length-1)]:null;};
  let to=null;
  if(t[0]==='vnum'){const lo=atoi(t[1]),hi=atoi(t[2]);to=rnd(r=>r.vnum>=lo&&r.vnum<=hi);}
  else if(t[0]==='recall1')to=rnd(r=>r.area.recall===3001);else if(t[0])to=rnd(()=>true);
  if(to)R.objToRoom(o,to);
};
OF.ogoto=(o,ch,a)=>{
  const t=args(a)[0];if(!t)return;
  if(isNum(t)){const to=R.getRoom(+t);if(to)R.objToRoom(o,to);return;}
  if(t==='self'){if(ch&&ch.room)R.objToRoom(o,ch.room);return;}
  const v=worldFindChar(t);if(v)R.objToChar(o,v);
};
OF.odef_rembch=(o,ch,a)=>{const t=args(a)[0];if(!t)return;if(t==='null-tar'){o.orembch=null;return;}const v=worldFindChar(t);if(v)o.orembch=v;};
OF.cast=(o,ch,a)=>{
  const car=carrierOf(o);if(!car||!car.room)return;
  const t=args(a);let times=1,sp,vn,lv;
  if(isNum(t[0])){times=+t[0];[,sp,vn,lv]=t;}else [sp,vn,lv]=t;
  const v=charRoomOf(car,vn);if(!v)return;const sn=R.skillLookup(sp);if(sn<=0)return;
  const level=lv==='viclv'?v.level:isNum(lv)?+lv:null;if(level===null)return;
  const s=R.SK[sn];
  while(times--&&!v.deleted){
    R.castSpell(sn,level,car,v);
    if(s.tar===1&&v!==car&&!v.deleted&&v.room===car.room&&!v.fighting&&v.position>P.DEAD)R.multiHit(v,car);
  }
};
OF.opset_obj_affect=()=>{};OF.opremove_obj_affect=()=>{};OF.opmodify_obj_affect=()=>{};OF.opmodvt=()=>{};

/* ---------- defun ---------- */
MP.defun=function(mob,fun,actor){   /* mprog_defun_trigger：第一個參數相同的劇本 */
  const p=progsOf(mob).find(p=>firstArg(p.argument)===R.lc(fun));
  if(!p){warn('defun:'+fun,'找不到 defun '+fun);return;}
  drive(p,mkCtx('mob',mob,actor));
};
MP.rdefun=function(room,fun,actor){
  const p=(room.progs||[]).find(p=>p.trigger==='room_defun'&&firstArg(p.argument)===R.lc(fun));
  if(!p){warn('rdefun:'+fun,'找不到 room_defun '+fun);return;}
  drive(p,mkCtx('room',room,actor));
};

/* ---------- 觸發 ---------- */
const hasT=(x,trig)=>progsOf(x).some(p=>p.trigger===trig);
MP.has=hasT;MP.hasT=hasT;
const pctPass=a=>{const n=atoi(a);return n>=100||R.pct()<n;};
/* mprog_percent_check：每段符合的都各自擲一次 */
function percent(kind,self,actor,obj,vo,trig){
  for(const p of progsOf(self)){
    if(p.trigger!==trig)continue;
    if(!pctPass(p.argument))continue;
    drive(p,mkCtx(kind,self,actor,obj,vo));
    if(kind==='mob'&&(self.deleted||!self.room))return;
    if(kind==='obj'&&self.deleted)return;
  }
}
/* mprog_wordlist_check：'p 片語' 整句；否則每個關鍵字（前後要是空白或結尾） */
function wordHit(word,text){
  if(!word)return 0;let n=0,i=0;
  while((i=text.indexOf(word,i))>=0){
    const end=i+word.length;
    if((i===0||text[i-1]===' ')&&(end===text.length||' \n\r'.includes(text[end])))return 1;
    i++;
  }
  return n;
}
function wordlist(arg,text){
  arg=R.lc(String(arg||''));text=R.lc(String(text||''));
  if(arg.startsWith('p ')){return wordHit(arg.slice(2),text);}
  let n=0;for(const w of arg.split(/\s+/).filter(Boolean))n+=wordHit(w,text);
  return n;
}
/* talk <mob> [話題] */
MP.talk=function(ch,v,topic){
  topic=(topic||'').trim();
  if(!topic){for(const p of progsOf(v))if(firstArg(p.argument)==='topic')drive(p,mkCtx('mob',v,ch));return;}
  if(!R.canSee(v,ch)){R.send(ch,'他看不到你！\n');return;}
  for(const p of progsOf(v)){if(p.trigger!=='talk_prog')continue;const n=wordlist(p.argument,topic);for(let k=0;k<n;k++){drive(p,mkCtx('mob',v,ch));if(v.deleted)return;}}
};
MP.topics=function(v){
  const out=[];
  for(const p of progsOf(v))if(p.trigger==='talk_prog'){const a=String(p.argument||'').trim();if(a&&R.lc(a)!=='topic'&&!out.includes(a))out.push(a);}
  return out;
};
MP.canTalk=v=>hasT(v,'talk_prog');
/* 說話：同房間 NPC 的 speech_prog */
MP.say=function(ch,text){
  const room=ch.room;if(!room)return;
  for(const m of [...room.people]){
    if(!m.npc||m===ch||m.deleted)continue;
    for(const p of progsOf(m)){if(p.trigger!=='speech_prog')continue;const n=wordlist(p.argument,text);for(let k=0;k<n;k++)drive(p,mkCtx('mob',m,ch));}
  }
};
/* 社交動作對 NPC：act_prog（第一個參數相同的都跑） */
MP.social=function(ch,v,name){
  if(!v.npc||!hasT(v,'act_prog'))return false;
  let ran=false;
  for(const p of progsOf(v)){if(firstArg(p.argument)===R.lc(name)){ran=true;drive(p,mkCtx('mob',v,ch));}}
  return ran;
};
MP.give=function(ch,v,o){
  if(!v.npc||!hasT(v,'give_prog'))return;
  if(!R.canSee(v,ch)){R.send(ch,'他看不到你。\n');return;}
  for(const p of progsOf(v)){
    if(p.trigger!=='give_prog')continue;
    const a=String(p.argument||'').trim();
    if(R.lc(o.name)===R.lc(a)||o.vnum===atoi(a)||firstArg(a)==='all'){drive(p,mkCtx('mob',v,ch,o));break;}
  }
};
MP.bribe=function(ch,v,amt){
  if(!v.npc||!hasT(v,'bribe_prog'))return;
  if(!R.canSee(v,ch)){R.send(ch,'他看不到你。\n');return;}
  for(const p of progsOf(v))if(p.trigger==='bribe_prog'&&amt>=atoi(p.argument)){drive(p,mkCtx('mob',v,ch));break;}
};
/* 物品動作：obj_act（wear／remove／get／drop／put／look_in／examine…） */
MP.objAct=function(ch,o,act){
  if(!hasT(o,'obj_act'))return;
  for(const p of progsOf(o))if(firstArg(p.argument)===act)drive(p,mkCtx('obj',o,ch));
};
/* 進出房間 */
MP.roomEnter=function(ch,room,door){   /* rprog_entry_trigger：位元是「從哪邊進來」 */
  const BIT=[4,8,1,2,32,16,64];
  for(const p of room.progs||[]){
    if(p.trigger!=='room_enter')continue;
    const [b,pc]=String(p.argument||'').split(/\s+/);
    if(!(door>=0&&door<=6&&bitAnd(atoi(b),BIT[door])))continue;
    if(pctPass(pc)){drive(p,mkCtx('room',room,ch));break;}
  }
};
MP.leave=function(ch,room,door){   /* rprog_leave_trigger：位元是離開的方向（7 離線、8 被傳送） */
  for(const p of room.progs||[]){
    if(p.trigger!=='room_leave')continue;
    const [b,pc]=String(p.argument||'').split(/\s+/);
    if(!bitAnd(atoi(b),2**door))continue;
    if(pctPass(pc)){drive(p,mkCtx('room',room,ch));break;}
  }
};
function greet(ch){   /* old_mprog_greet_trigger：房間裡的 NPC 看到 ch 進來 */
  if(!ch.room||MP._greetDepth>=3)return;
  MP._greetDepth=(MP._greetDepth||0)+1;
  try{
    for(const m of [...ch.room.people]){
      if(!m.npc||m===ch||m.deleted||!m.room)continue;
      const free=!m.fighting||MP.qHas(m,'enable_fight_greet');
      if(free&&R.isAwake(m)&&R.canSee(m,ch)&&hasT(m,'greet_prog')&&!ch.aff.has('NIGHTSTALK'))percent('mob',m,ch,null,null,'greet_prog');
      else if(free&&R.isAwake(m)&&hasT(m,'all_greet_prog'))percent('mob',m,ch,null,null,'all_greet_prog');
      if(ch.deleted||!ch.room)break;
    }
  }finally{MP._greetDepth--;}
}
/* check_arrival：entry_prog、greet、entry_greet_prog（潛行的不觸發） */
MP.arrival=function(ch,force){
  if(!(force||!ch.aff.has('SNEAK'))||(!ch.npc&&ch.wizinvis))return;
  if(ch.npc&&hasT(ch,'entry_prog'))percent('mob',ch,null,null,null,'entry_prog');
  if(ch.deleted||!ch.room)return;
  greet(ch);
  if(ch.deleted||!ch.room)return;
  if(ch.npc&&hasT(ch,'entry_greet_prog'))for(const v of [...ch.room.people]){
    if(ch.deleted||!ch.room||ch.fighting)return;
    if(v===ch||v.deleted||!v.room||!R.canSee(ch,v))continue;
    percent('mob',ch,v,null,null,'entry_greet_prog');
  }
};
MP.enter=function(ch,from,dir){
  const room=ch.room;if(!room)return;
  if(hasT(room,'room_enter'))MP.roomEnter(ch,room,dir>=0&&dir<6?dir:6);
  if(ch.room===room&&!ch.deleted)MP.arrival(ch,false);
};
/* 玩家輸入：room_mask（打的是現有指令時）、obj_command／room_command（打的不是現有指令時） */
function cmdWordlist(progs,trig,word,arg,run){
  for(const p of progs){
    if(p.trigger!==trig)continue;
    const a=String(p.argument||'').trim().split(/\s+/);
    if(R.lc(a[0])!==R.lc(word))continue;
    if(wordlist(a.slice(1).join(' '),arg)){run(p);return true;}
  }
  return false;
}
function cmdDefault(progs,trig,word,run){
  for(const p of progs){
    if(p.trigger!==trig)continue;
    const a=String(p.argument||'').trim().split(/\s+/);
    if(R.lc(a[0])!==R.lc(word))continue;
    if(a[1]&&R.lc(a[1])==='default'){run(p);return true;}
  }
  return false;
}
MP.mask=function(ch,fullName,argument){   /* rprog_mask_trigger */
  const room=ch.room;if(!room)return false;
  if(ch.forced){ch.forced=false;return false;}
  if(!ch.npc&&ch.wizinvis)return false;
  if(!hasT(room,'room_mask'))return false;
  const word=R.lc(fullName),arg=R.lc((argument||'').trim().split(/\s+/)[0]||'');
  const run=p=>drive(p,mkCtx('room',room,ch));
  for(const p of room.progs){
    if(p.trigger!=='room_mask')continue;
    const a=String(p.argument||'').trim().split(/\s+/);
    if(word==='all'){run(p);return true;}
    if(R.lc(a[0])!==word)continue;
    if(a[1]&&R.lc(a[1])==='default'){run(p);return true;}
    if(a[1]&&R.lc(a[1]).startsWith('qmark:')){
      const q=qGet(ch,a[1].slice(6));
      if(!q){run(p);return true;}
      const cond=a[2]||'';if(!cond)return false;
      const m=/^(v[012])(==|!=|<=|=<|>=|=>|!&|>|<|&)(-?\d+)$/.exec(cond);if(!m){run(p);return true;}
      const cur=q.v[+m[1][1]];if(veval(cur,m[2],+m[3]))return false;
      run(p);return true;
    }
  }
  return cmdWordlist(room.progs,'room_mask',word,arg,run);
};
MP.command=function(ch,word,argument){   /* 不是現有指令時：物品 obj_command → 房間 room_command */
  if(!ch.room)return false;
  const room=ch.room;
  const [objName,...rest]=String(argument||'').trim().split(/\s+/);
  if(objName){
    const o=objHere(ch,objName);
    if(o&&hasT(o,'obj_command')){
      const final=rest.join(' ');
      const run=p=>drive(p,mkCtx('obj',o,ch));
      if(cmdWordlist(progsOf(o),'obj_command',word,(final.split(/\s+/)[0]||''),run))return true;
      if(cmdDefault(progsOf(o),'obj_command',word,run))return true;
    }
  }
  if(hasT(room,'room_command')){
    const run=p=>drive(p,mkCtx('room',room,ch));
    if(cmdWordlist(room.progs,'room_command',word,R.lc(objName||''),run))return true;
    if(cmdDefault(room.progs,'room_command',word,run))return true;
  }
  return false;
};
/* 戰鬥：每回合（wait 為 0 時）hitprcnt_prog 再 fight_prog；玩家身上物品 obj_fight */
MP.round=function(ch){
  const v=ch.fighting;if(!v)return;
  if(ch.npc){
    if(ch.wait>0)return;
    if(hasT(ch,'hitprcnt_prog')){
      const hp=ch.max_hit>0?Math.trunc(100*ch.hit/ch.max_hit):100;
      for(const p of progsOf(ch))if(p.trigger==='hitprcnt_prog'&&hp<atoi(p.argument)){drive(p,mkCtx('mob',ch,v));if(ch.deleted)return;}
    }
    if(!ch.deleted&&ch.fighting&&ch.hit>0&&ch.position!==P.DEAD&&hasT(ch,'fight_prog'))percent('mob',ch,v,null,null,'fight_prog');
  }
  for(const o of [...ch.carrying])if(!o.deleted&&hasT(o,'obj_fight')){percent('obj',o,ch,null,null,'obj_fight');if(!ch.fighting)break;}
};
MP.hurt=function(v,ch,dt){   /* mprog_hurt_trigger */
  if(!v.npc||!hasT(v,'hurt_prog'))return;
  const ELEM={314:'spell',315:'wind',316:'fire',317:'water',318:'earth',319:'lightning',320:'saint',321:'dark'};
  for(const p of progsOf(v)){
    if(p.trigger!=='hurt_prog')continue;
    const a=R.lc(String(p.argument||'').trim());
    if(!MP.qHas(v,'disable_hurt_element')&&ELEM[dt]){if(a===ELEM[dt]&&!MP.qHas(v,'disable_hurt_'+a))drive(p,mkCtx('mob',v,ch));}
    else if(dt===atoi(a)&&!MP.qHas(v,'disable_hurt_dt'))drive(p,mkCtx('mob',v,ch));
    if(v.deleted)return;
    if(!MP.qHas(v,'disable_hurt_all')){if(ELEM[dt])return;if(a==='all')drive(p,mkCtx('mob',v,ch));}
    if(v.deleted)return;
  }
};
MP.death=function(v,killer){   /* mprog_death_trigger：先清掉法術效果、hit 設成 -21，再跑 death_prog */
  if(!v.npc){MP.qDeath(v);return;}
  if(v.deleted||!hasT(v,'death_prog'))return;
  for(const a of [...(v.affects||[])])R.affectStrip(v,a.type);
  v.aff.add('NO_HEAL');v.hit=-21;
  percent('mob',v,killer,null,null,'death_prog');
};
MP.kill=function(killer,v){
  if(!killer)return;
  if(killer.npc&&hasT(killer,'kill_prog'))percent('mob',killer,v,null,null,'kill_prog');
  for(const o of [...(killer.carrying||[])])if(hasT(o,'obj_kill'))percent('obj',o,killer,null,null,'obj_kill');
};
MP.repop=function(m){if(hasT(m,'repop_prog'))percent('mob',m,null,null,null,'repop_prog');};
MP.objRepop=function(o){if(hasT(o,'obj_repop'))percent('obj',o,null,null,null,'obj_repop');};
/* mobile_update：rand_prog（有玩家的區域、站著、沒被魅惑）；room_rand（房間裡有人） */
MP.randUpdate=function(){
  for(const m of [...W.chars]){
    if(m.deleted||!m.room||!m.room.area.nplayer||m.position<P.STANDING||m.aff.has('CHARM')||!hasT(m,'rand_prog'))continue;
    percent('mob',m,null,null,null,'rand_prog');
  }
  for(const r of MP.randRooms||[])if(r.people.length)for(const p of r.progs)if(p.trigger==='room_rand'&&pctPass(p.argument))drive(p,mkCtx('room',r,null));
};
/* 每個 tick（一個遊戲小時）：tick_prog、obj_rand（被帶著）／obj_tick（在地上）、room_time、qmark 與房間計時 */
MP.tick=function(){
  for(const m of [...W.chars]){
    if(m.deleted||!m.room||!hasT(m,'tick_prog')||m.aff.has('SLEEP')||m.aff.has('CHARM'))continue;
    const ok=m.position===P.STANDING||(m.position===P.RESTING&&MP.qHas(m,'enable_rest_tick'))||(m.position===P.SLEEPING&&MP.qHas(m,'enable_sleep_tick'))||(m.position===P.FIGHTING&&MP.qHas(m,'enable_fight_tick'));
    if(ok)percent('mob',m,null,null,null,'tick_prog');
  }
  for(const o of [...W.objects]){
    if(o.deleted)continue;
    if(o.carried_by){if(hasT(o,'obj_rand'))percent('obj',o,o.carried_by,null,null,'obj_rand');}
    else if(o.in_room&&hasT(o,'obj_tick'))percent('obj',o,null,null,null,'obj_tick');
  }
  for(const ch of W.chars.concat(W.players))if(ch.qmarks)MP.qTick(ch);
  for(const r of MP.progRooms||[]){const st=r._rv;if(!st)continue;if(st.t[0]>0&&--st.t[0]===0){st.v0=0;st.v1=0;}if(st.t[1]>0)st.t[1]--;}
  for(const r of MP.timeRooms||[])for(const p of r.progs)if(p.trigger==='room_time'&&pctPass(p.argument))drive(p,mkCtx('room',r,null));
};
MP.hour=function(){};   /* room_time 在 tick 裡跑（原版 room_time 跟著 pulse_point） */
MP.init=function(){
  const rs=Object.values(W.rooms);
  MP.progRooms=rs.filter(r=>r.progs&&r.progs.length);
  MP.timeRooms=MP.progRooms.filter(r=>hasT(r,'room_time'));
  MP.randRooms=MP.progRooms.filter(r=>hasT(r,'room_rand'));
};

/* 穿脫物品：obj_act wear／remove（只在遊戲中，載入存檔時不觸發） */
const eqC=R.equipChar,uneqC=R.unequipChar;
R.equipChar=function(ch,o,loc){eqC(ch,o,loc);if(ch.playing&&!ch.npc)MP.objAct(ch,o,'wear');};
R.unequipChar=function(ch,o){const w=o.wear_loc>=0;uneqC(ch,o);if(w&&ch.playing&&!ch.npc&&!o.deleted)MP.objAct(ch,o,'remove');};

/* ---------- talk 指令（act_comm.c do_talk） ---------- */
cmd.talk=function(ch,a){
  const [who,rest]=R.one_arg(a||'');
  if(!who){R.send(ch,'要和誰交談？\n');return;}
  const v=R.getCharRoom(ch,who);
  if(!v){R.send(ch,'這裡沒有這個人。\n');return;}
  if(!v.npc){R.send(ch,'想和玩家說話請用 say 或 tell。\n');return;}
  if(!R.isAwake(v)){R.act('$E睡得很熟而聽不到你說什麼.',ch,null,v,R.TO_CHAR);return;}
  const topic=(rest||'').trim();
  if(topic){R.act("你和 $N 交談 '"+topic+"'.",ch,null,v,R.TO_CHAR);v.reply=ch;MP.talk(ch,v,topic);}
  else{R.act('你試著和 $N 交談....',ch,null,v,R.TO_CHAR);v.reply=ch;MP.talk(ch,v,'');}
};
})(ROC);
