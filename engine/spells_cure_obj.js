/* spells_cure_obj.js — 治療與物品法術（spell_cure.c / spell_obj.c） */
(function(R){
const C=R.C,P=R.POS,W=R.world,SK=R.SK,M=R.MAGIC;

/* ---------- 常數（parameters.h / const.c） ---------- */
const BISHOP=8;
const PPL_HP_MULTIPLYER=2;
const OBJ_VNUM_MUSHROOM=20,OBJ_VNUM_LIGHT_BALL=21,OBJ_VNUM_SPRING=22,OBJ_VNUM_POWER_GEM=23;
const LIQ_WATER=0,SKY_RAINING=2;
/* liq_table：[中文名, 英文名] */
const LIQ=[['清水','water'],['啤酒','beer'],['酒','wine'],['麥酒','ale'],['黑麥酒','dark-ale'],
  ['威士忌','whisky'],['檸檬水','lemonade'],['烈酒','firebreather'],['當地特產','local speciality'],['青草汁','slime mold juice'],
  ['牛奶','milk'],['茶','tea'],['咖啡','coffee'],['血','blood'],['鹽水','salt water'],
  ['可樂','cola'],['珍珠奶茶','bubble milk tea'],['奶茶','milk tea'],['綠茶','green tea'],['紅茶','black tea'],
  ['可爾必斯','calpis'],['濃湯','soup'],['柳橙汁','orange juice'],['甜湯','sweet soup'],['冰砂','ice'],
  ['椰子汁','coconut juice'],['粥水','porridge'],['果汁','juice'],['乳製飲品','dairy beverage'],['青草茶','grass tea']];
const LIQ_MAX=LIQ.length;

/* ---------- 小工具 ---------- */
const trunc=Math.trunc;
/* 物品施法（level>=1000）換算 sklv（治療系） */
function objSklv(level,sklv){
  if(level<1000)return sklv;
  const lv=trunc(level/1000);sklv=0;
  if(lv>=10)sklv=1;if(lv>=20)sklv=2;if(lv>=30)sklv=3;if(lv>=40)sklv=4;if(lv>=50)sklv=5;if(lv>=60)sklv=6;
  return sklv;
}
/* WAIT_MAGIC_STATE（handler.c）；WAIT_STATE 取大值（推測） */
function waitMagic(ch,delay){
  const nPerc=R.getSkillPercent(ch,R.gsn.spellcraft);
  if(nPerc>0){
    const n=R.getSkillLevel(ch,R.gsn.spellcraft);
    delay-=trunc(delay*(n+1)*(n+4)*nPerc/10000);
    if(n>5)delay--;
    delay=Math.max(0,delay);
  }
  ch.wait=Math.max(ch.wait||0,delay);
}
/* LifeShareHeal（spell_cure.c） */
function lifeShareHeal(ch,heal){
  heal=trunc(heal);
  if(!R.isAffected(ch,R.gsn.lifeshare))return heal;
  const lch=ch.linking;   /* 簡化：引擎若無 linking 欄位則不分配 */
  if(!lch)return heal;
  if(ch.room!==lch.room)return heal;
  heal=heal-trunc(heal/5);
  lch.hit=Math.min(lch.max_hit,lch.hit+trunc(heal/5));
  R.send(lch,'微弱的暖流充斥著你的身體.\n');
  return heal;
}
/* 陣營修正（Keric）；fBishop=true 時主教不受負面影響 */
function alignHeal(ch,v,heal,fBishop,fInt){
  if(ch.npc)return heal;
  const f=x=>fInt?trunc(x):x;
  const bishopOk=fBishop&&ch.cls===BISHOP;
  if(R.isGood(ch)){
    if(R.isGood(v))heal=f(heal*5/4);
    else if(R.isEvil(v)&&!bishopOk)heal=f(heal*3/4);
  }else if(R.isNeutral(ch)){
    if(R.isNeutral(v))heal=f(heal*5/4);
  }else{
    if(R.isEvil(v))heal=f(heal*5/4);
    else if(R.isGood(v)&&!bishopOk)heal=f(heal*3/4);
  }
  return heal;
}
/* 黑暗封閉／無法治癒檢查；回傳 true 表示擋下 */
function noHeal(ch,v,name){
  if(R.isAffected(v,R.gsn.dark_containment)){
    if(ch!==v)R.send(ch,'你的'+name+'對他不起作用。\n');
    R.send(v,'一股邪惡力場阻絕了外界的治癒魔法。\n');
    return true;
  }
  if(v.aff.has('NO_HEAL')){
    if(ch!==v)R.send(ch,'你的'+name+'對他不起作用。\n');
    R.send(v,'你的身體無法受到治癒。\n');
    return true;
  }
  return false;
}
/* wis／pp／sklv 效果（spell_heal／double_heal 共用） */
function healBase(ch,sklv){
  let heal=20+trunc(ch.level*7/4);
  const wis=R.stat(ch,2);
  if(wis>16)heal+=heal*(wis-16)*(wis-16)/200;
  else heal-=heal*(16-wis)*(16-wis)/200;
  if(!ch.npc)heal=heal*(100+((ch.pp>0)?ch.pp*2:0))/100;
  if(sklv>0)heal=heal*(10+sklv)/10;
  if(sklv===5)heal=heal+50;
  else if(sklv===6)heal=heal+100;
  if(heal<50)heal=50;
  return heal;
}
const skillByName=s=>{
  if(s===undefined||s===null||s==='')return -1;
  if(typeof s==='number')return s>=0&&s<SK.length?s:-1;
  if(/^-?\d+$/.test(String(s))){const n=+s;return n>=0&&n<SK.length?n:-1;}
  const i=SK.findIndex(k=>k.name===s);return i>=0?i:R.skillLookup(s);
};
const isProto=(o,vnum)=>o.proto&&o.proto===W.objs[vnum];

/* ======================= spell_cure.c ======================= */

R.SPELL.spell_cure_blindness=function(sn,level,ch,vo){
  const v=vo;let fCured=false;
  if(R.isAffected(v,R.gsn.blindness)){R.affectStrip(v,R.gsn.blindness);fCured=true;}
  const sf=R.skillLookup('sun flash');
  if(sf>=0&&R.isAffected(v,sf)){R.affectStrip(v,sf);fCured=true;}
  if(!fCured)return;
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你的眼前一亮，你又能看見東西了！\n');
};

R.SPELL.spell_cure_critical=function(sn,level,ch,vo){
  const v=vo;
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  if(noHeal(ch,v,'高級治療術'))return;
  let heal=40+Math.max(trunc((3+trunc(sklv/2))*v.max_hit/100),70*(1+trunc(sklv/6)));
  heal=alignHeal(ch,v,heal,true,true);
  heal=lifeShareHeal(v,heal);
  v.hit=Math.min(v.hit+heal,v.max_hit);
  v.move=Math.min(v.move+trunc(heal/2),v.max_move);
  R.updatePos(v);
  if(!ch.npc&&ch.cls===BISHOP&&!R.isAffected(v,sn)&&!v.aff.has('CONTINUE_CURE')){
    /* 簡化：CONTINUE_CURE 持續治療效果需 update 端支援，這裡只掛上 affect */
    R.affectToChar(v,{type:sn,duration:sklv*2+5,modifier:0,location:'NONE',bitvector:'CONTINUE_CURE'});
  }
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你覺得好多了。\n');
};

R.SPELL.spell_cure_light=function(sn,level,ch,vo){
  const v=vo;
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  if(noHeal(ch,v,'初級治療術'))return;
  let heal=20+Math.max(trunc((1+trunc(sklv/2))*v.max_hit/100),50*(1+trunc(sklv/6)));
  heal=alignHeal(ch,v,heal,true,true);
  heal=lifeShareHeal(v,heal);
  v.hit=Math.min(v.hit+heal,v.max_hit);
  v.move=Math.min(v.move+trunc(heal/2),v.max_move);
  R.updatePos(v);
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你覺得好一點了。\n');
};

R.SPELL.spell_cure_disease=function(sn,level,ch,vo){
  const v=vo;
  if(!R.isAffected(v,R.gsn.disease))return;
  R.affectStrip(v,R.gsn.disease);
  R.send(ch,'好的。\n');
  R.send(v,'一陣清爽的感覺充滿你全身.\n');
  R.act('$N 看來好多了.',ch,null,v,R.TO_NOTVICT);
};

R.SPELL.spell_cure_poison=function(sn,level,ch,vo){
  const v=vo,g=R.gsn;
  if(!R.isAffected(v,g.poison)&&!R.isAffected(v,g.venomous_strike)&&!R.isAffected(v,g.gas_breath))return;
  R.affectStrip(v,g.poison);
  R.affectStrip(v,g.venomous_strike);
  if(R.isAffected(v,g.gas_breath)){
    const sp=R.affectedValue(v,g.gas_breath,'SAVING_POISON');
    if(sp>0){
      const noPoison=R.raceHas(v,'NO_POISON')||R.hasSpecial(v,'NO_POISON');
      R.affectJoin(v,{type:g.gas_breath,duration:0,location:'SAVING_POISON',
        bitvector:noPoison?null:'POISON',modifier:0-50-trunc(sp/2)});
    }
    if(R.affectedValue(v,g.gas_breath,'SAVING_POISON')<=0)R.affectStrip(v,g.gas_breath);
  }
  R.send(ch,'好的。\n');
  R.send(v,'一陣清新的感覺充滿你全身.\n');
  R.act('$N 看來好多了.',ch,null,v,R.TO_NOTVICT);
};

R.SPELL.spell_cure_serious=function(sn,level,ch,vo){
  const v=vo;
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  if(noHeal(ch,v,'中級治療術'))return;
  let heal=30+Math.max(trunc((2+trunc(sklv/2))*v.max_hit/100),60*(1+trunc(sklv/6)));
  heal=alignHeal(ch,v,heal,true,true);
  heal=lifeShareHeal(v,heal);
  v.hit=Math.min(v.hit+heal,v.max_hit);
  v.move=Math.min(v.move+trunc(heal/2),v.max_move);
  R.updatePos(v);
  R.send(v,'你覺得好多了。\n');
  if(ch!==v)R.send(ch,'好的。\n');
};

R.SPELL.spell_heal=function(sn,level,ch,vo){
  const v=vo;
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  if(noHeal(ch,v,'治療術'))return;
  let heal=healBase(ch,sklv);
  heal=alignHeal(ch,v,heal,true,false);
  heal*=PPL_HP_MULTIPLYER;
  heal=lifeShareHeal(v,heal);
  v.hit=Math.min(v.hit+heal,v.max_hit);
  R.updatePos(v);
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'一股暖流充斥著你的身體.\n');
};

R.SPELL.spell_double_heal=function(sn,level,ch,vo){
  const v=vo;
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  if(noHeal(ch,v,'雙重治療術'))return;
  let heal=healBase(ch,sklv);
  heal*=2;
  heal=alignHeal(ch,v,heal,false,false);   /* 原碼 double heal 主教也受陣營影響 */
  heal*=PPL_HP_MULTIPLYER;
  heal=lifeShareHeal(v,heal);
  v.hit=Math.min(v.hit+heal,v.max_hit);
  R.updatePos(v);
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'一股強大的暖流充斥著你的身體.\n');
};

R.SPELL.spell_full_heal=function(sn,level,ch,vo){
  const v=vo;
  if(noHeal(ch,v,'完全治癒術'))return;
  v.hit=v.max_hit;
  R.updatePos(v);
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你身上所受的傷回復了！\n');
  waitMagic(ch,12-R.getSkillLevel(ch,sn)*2);
};

R.SPELL.spell_double_refresh=function(sn,level,ch,vo){
  const v=vo;
  let heal=100+trunc(ch.level*15/4);
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  const wis=R.stat(ch,2);
  if(wis>16)heal+=heal*(wis-16)*(wis-16)/200;
  else heal-=heal*(16-wis)*(16-wis)/200;
  if(sklv>0)heal=heal*(10+sklv)/10;
  if(sklv===5)heal+=80;
  else if(sklv===6)heal+=200;
  if(!ch.npc)heal=heal*(100+((ch.pp>0)?ch.pp:0))/100;
  if(sklv>5)heal+=(ch.pp||0);
  heal*=PPL_HP_MULTIPLYER;
  v.move=trunc(Math.min(v.move+heal,v.max_move));
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你的體力逐漸回復了。\n');
};

R.SPELL.spell_refresh=function(sn,level,ch,vo){
  const v=vo;
  let heal=20+ch.level;
  const sklv=objSklv(level,R.getSkillLevel(ch,sn));
  const wis=R.stat(ch,2);
  if(wis>16)heal+=heal*(wis-16)*(wis-16)/200;
  else heal-=heal*(16-wis)*(16-wis)/200;
  if(sklv>0)heal=heal*(10+sklv)/10;
  if(sklv===5)heal+=20;
  else if(sklv===6)heal+=50;
  if(!ch.npc)heal=heal*(100+((ch.pp>0)?ch.pp:0))/100;
  heal*=PPL_HP_MULTIPLYER;
  v.move=trunc(Math.min(v.move+heal,v.max_move));
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你覺得沒有那麼累了。\n');
};

R.SPELL.spell_full_refresh=function(sn,level,ch,vo){
  const v=vo;
  const lv=R.getSkillLevel(ch,sn);
  v.move=v.max_move;
  ch.mana+=lv*4+(lv-3)*2;
  if(ch!==v)R.send(ch,'好的。\n');
  R.send(v,'你的疲倦一掃而空，全身煥然一新。\n');
  waitMagic(ch,24-lv*2);
};

/* ======================= spell_obj.c ======================= */

R.SPELL.spell_continual_light=function(sn,level,ch,vo){
  let sklv=R.getSkillLevel(ch,sn);
  const proto=W.objs[OBJ_VNUM_LIGHT_BALL];
  if(!proto){R.send(ch,'你失敗了.\n');return;}   /* 簡化：原型不存在 */
  let count=ch.room.contents.filter(o=>o.proto===proto).length;
  if(count>=100){R.send(ch,'你失敗了.\n');return;}
  sklv=sklv+1;
  for(;sklv>0;--sklv){
    if(count>=100)break;
    const light=R.createObject(proto,0);
    light.values[2]=(light.values[2]||0)+(1+sklv)*4;
    R.objToRoom(light,ch.room);
    R.act('你伸手一指，變出了$p.',ch,light,null,R.TO_CHAR);
    R.act('$n 伸手一指，變出了$p.',ch,light,null,R.TO_ROOM);
    count=count+1;
  }
  waitMagic(ch,6-sklv);
};

R.SPELL.spell_create_food=function(sn,level,ch,vo){
  const proto=W.objs[OBJ_VNUM_MUSHROOM];
  if(!proto){R.send(ch,'你失敗了.\n');return;}   /* 簡化：原型不存在 */
  const count=ch.room.contents.filter(o=>o.proto===proto).length;
  if(count>=50){R.send(ch,'你失敗了.\n');return;}
  let type;
  if(ch.level<20)type=0;
  else if(ch.level<30)type=R.bits(1);
  else if(ch.level<37)type=R.bits(2);
  else type=R.rand(0,6);
  const m=R.createObject(proto,0),L=ch.level;
  const set=(n,s,v0)=>{m.name=n;m.short=s;m.long=s;m.values[0]=v0;};
  switch(type){
    case 1:set('carrot magic','魔法紅蘿蔔(magic carrot)',5+trunc(L/2));break;
    case 2:set('manto magic','魔法饅頭(magic manto)',5+L);break;
    case 3:set('wing chicken-wing magic','魔法烤雞翅(magic chicken wing)',5+L+trunc(L/2));break;
    case 4:set('steak magic','魔法烤牛排(magic steak)',5+L+L);break;
    case 5:set('chicken full-chicken magic','魔法手扒雞(magic full chicken)',5+L+trunc(L/2)+L);break;
    case 6:set('pig roast-pig magic','魔法烤乳豬(magic roast pig)',5+L+L+L);break;
    default:m.values[0]=5+trunc(L/4);break;
  }
  const sk=R.getSkillLevel(ch,sn);
  m.values[2]=(m.values[2]||0)+sk*12;
  m.timer=2+trunc(sk/3);
  R.objToRoom(m,ch.room);
  R.act('$p 突然出現在你面前.',ch,m,null,R.TO_CHAR);
  R.act('$p 突然出現在你面前.',ch,m,null,R.TO_ROOM);
};

R.SPELL.spell_create_spring=function(sn,level,ch,vo){
  const arg=(typeof vo==='string'?vo:R.targetName)||'';
  let sklv=R.getSkillLevel(ch,sn);
  const proto=W.objs[OBJ_VNUM_SPRING];
  if(!proto){R.send(ch,'你失敗了.\n');return;}   /* 簡化：原型不存在 */
  const count=ch.room.contents.filter(o=>o.proto===proto).length;
  if(count>=5){R.send(ch,'你失敗了.\n');return;}
  const make=liq=>{
    const s=R.createObject(proto,0);
    s.timer=2+sklv;
    s.values[2]=liq;
    if(s.values[2]!==0){
      const l=LIQ[s.values[2]]||LIQ[0];
      s.name=l[1]+' spring';
      s.short='魔法'+l[0]+'泉('+l[1]+' spring)';
      s.long=s.short;
      s.wear.add('TAKE');
    }
    R.objToRoom(s,ch.room);
    R.act('地面突然裂開，流出了一道$p.',ch,s,null,R.TO_CHAR);
    R.act('地面突然裂開，流出了一道$p.',ch,s,null,R.TO_ROOM);
  };
  if(sklv<6||!arg){
    sklv=Math.min(sklv,6);
    make(R.rand(0,Math.min(LIQ_MAX-1,sklv*3-1)));   /* 原碼上限 LIQ_MAX，夾在表內 */
    return;
  }
  for(let i=0;i<LIQ_MAX;i++){
    if(R.str_prefix(arg,LIQ[i][1])){make(i);return;}
  }
  R.send(ch,'沒有這種泉喔！\n');
};

R.SPELL.spell_create_water=function(sn,level,ch,vo){
  const o=vo;
  if(o.type!=='DRINK_CON'){R.send(ch,'那樣東西不能裝水.\n');return;}
  if(o.values[2]!==LIQ_WATER&&o.values[1]!==0){R.send(ch,'那裡面已經有別種液體了.\n');return;}
  const sky=R.weather?R.weather.sky:0;
  const water=Math.min(level*(sky>=SKY_RAINING?4:2),(o.values[0]||0)-(o.values[1]||0));
  if(water>0){
    o.values[2]=LIQ_WATER;
    o.values[1]=(o.values[1]||0)+water;
    if(!R.is_name('water',o.name))o.name=o.name+' water';
    R.act('$p 現在裝滿了.',ch,o,null,R.TO_CHAR);
  }
};

/* --- identify 用的名稱表（Misc/chinese.c、handler.c） --- */
const C_ITEM={LIGHT:'光源',SCROLL:'卷軸',WAND:'魔杖',STAFF:'法杖',WEAPON:'武器',TREASURE:'寶藏',ARMOR:'裝甲',POTION:'藥劑',
  FURNITURE:'家俱',TRASH:'垃圾',CONTAINER:'容器',DRINK_CON:'飲水容器',KEY:'鑰匙',FOOD:'食物',MONEY:'錢幣',BOAT:'船隻',
  CORPSE_NPC:'NPC屍體',CORPSE_PC:'玩者屍體',FOUNTAIN:'泉水',PILL:'藥丸',ARROW:'弓矢',DART:'暗器',HORSE:'坐騎',AMMO:'彈藥'};
/* item_type_name 英文（推測：除 drink_con 外即類型小寫） */
const E_ITEM=t=>({DRINK_CON:'drink container',CORPSE_NPC:'npc corpse',CORPSE_PC:'pc corpse'})[t]||R.lc(t);
const C_EXTRA=[['GLOW','發光'],['HUM','低鳴'],['DARK','闇黑'],['LOCK','上鎖'],['EVIL','邪惡'],['INVIS','隱形'],['MAGIC','魔力'],
  ['NODROP','無法丟棄'],['BLESS','祝福'],['ANTI_GOOD','反善良'],['ANTI_EVIL','反邪惡'],['ANTI_NEUTRAL','反中立'],
  ['NOREMOVE','無法移除'],['INVENTORY','物品'],['POISONED','劇毒'],['VAMPIRE_BANE','BANE'],['HOLY','神聖'],['NOSAVE','無法儲存'],
  ['UNIQUE','獨一無二'],['LORE','單一'],['NOSAC','無法奉獻'],['PERSONAL','個人專用'],['RECOVER','毀損修復'],
  ['NO_MALE','男性禁用'],['NO_FEMALE','女性禁用'],['NO_NEUTRAL','中性禁用'],['SPECIAL','職業限制'],['SPELL','附魔']];
const cExtraBitName=set=>{
  const a=C_EXTRA.filter(([k])=>set.has(k)||(k==='NOSAC'&&set.has('NO_SAC'))).map(([,n])=>n);
  return a.length?a.join(' '):'無';
};
const APPLY_NUM=['NONE','STR','DEX','INT','WIS','CON','SEX','CLASS','LEVEL','AGE','HEIGHT','WEIGHT','MANA','HIT','MOVE','GOLD','EXP',
  'AC','HITROLL','DAMROLL','SAVING_PARA','SAVING_LIFE','SAVING_PETRI','SAVING_BREATH','SAVING_SPELL','SAVING_ANCIENT','SAVING_SPIRIT',
  'SAVING_FIRE','SAVING_COLD','SAVING_LIGHTNING','SAVING_EARTH','SAVING_WIND','SAVING_SAINT','SAVING_DARK','SAVING_POISON',
  'SAVING_ELEMENT','SAVING_GOOD','SAVING_EVIL','RACE','DODGE','POWER_POTENTIAL','RDAMAGE','RMAGIC','ADAMAGE','AMAGIC','GPHYSICAL',
  'GMAGIC','DOB_SAVING_FLASH','SAVING_ILLUSION','ACTION_ABILITY','WEAPON_SPELL','WEAPON_WIND','WEAPON_FIRE','WEAPON_COLD',
  'WEAPON_EARTH','WEAPON_LIGHTNING','WEAPON_SAINT','WEAPON_DARK','MAGIC_IMMUNE','TOXICITY_POISON','DAMAGE_COUNT','SHOOT_HITROLL',
  'SHOOT_DAMROLL','SHOOT_ADAMAGE'];
const C_LOC={NONE:'無',STR:'力量',DEX:'敏捷',INT:'智力',WIS:'智慧',CON:'體質',SEX:'性別',CLASS:'職業',LEVEL:'級別',AGE:'年齡',
  HEIGHT:'體型',WEIGHT:'負重',MANA:'法力',HIT:'生命力',MOVE:'移動力',GOLD:'金錢',EXP:'經驗值',AC:'防禦力',HITROLL:'命中率',
  DAMROLL:'傷害力',SAVING_PARA:'麻痺回避率',SAVING_LIFE:'生命回避率',SAVING_PETRI:'石化回避率',SAVING_BREATH:'龍息回避率',
  SAVING_SPELL:'法術回避率',RACE:'種族',POWER_POTENTIAL:'魔法潛力',DODGE:'閃避率',RDAMAGE:'抗物理傷害',RMAGIC:'抗魔法傷害',
  ADAMAGE:'物理傷害力',AMAGIC:'魔法傷害力',SAVING_ANCIENT:'上古法術回避率',SAVING_SPIRIT:'靈魂法術回避率',
  SAVING_FIRE:'火炎法術回避率',SAVING_COLD:'寒冷法術回避率',SAVING_LIGHTNING:'閃電法術回避率',SAVING_EARTH:'大地法術回避率',
  SAVING_WIND:'風法術回避率',SAVING_SAINT:'神聖法術回避率',SAVING_DARK:'黑暗法術回避率',SAVING_POISON:'劇毒傷害',
  SAVING_ELEMENT:'元素回避率',SAVING_GOOD:'善良法術回避率',SAVING_EVIL:'邪惡法術回避率',DOB_SAVING_FLASH:'光爆抵抗力',
  SAVING_ILLUSION:'幻術回避率',ACTION_ABILITY:'行動力',WEAPON_SPELL:'法術屬性傷害',WEAPON_WIND:'風屬性傷害',
  WEAPON_FIRE:'火屬性傷害',WEAPON_COLD:'水屬性傷害',WEAPON_EARTH:'地屬性傷害',WEAPON_LIGHTNING:'雷屬性傷害',
  WEAPON_SAINT:'聖屬性傷害',WEAPON_DARK:'暗屬性傷害',MAGIC_IMMUNE:'魔法減免',TOXICITY_POISON:'毒性強度',
  DAMAGE_COUNT:'累計傷害值',SHOOT_HITROLL:'射擊命中率',SHOOT_DAMROLL:'射擊傷害力',SHOOT_ADAMAGE:'射擊物理傷害力'};
/* 資料檔 apply 名稱 → C APPLY 名（REDUCE_* 對應 R* 為推測） */
const locKey=t=>{
  if(typeof t==='number')return APPLY_NUM[t]||'';
  t=String(t||'').replace(/^APPLY_/,'');
  return ({REDUCE_DAMAGE:'RDAMAGE',REDUCE_MAGIC:'RMAGIC'})[t]||t;
};
const cLocName=t=>C_LOC[locKey(t)]||'<不明>';
const WEAR_NAMES=[['WEAR_ABOUT',' 圍繞身體'],['WEAR_ARMS',' 手臂'],['WEAR_BODY',' 身體'],['ARROW',' 背掛'],['WEAR_FEET',' 腳部'],
  ['WEAR_HANDS',' 手部'],['WEAR_FINGER',' 手指 觸手'],['WEAR_HEAD',' 頭部'],['HOLD',' 手握'],['WEAR_LEGS',' 腿部'],
  ['WEAR_NECK',' 頸部'],['WEAR_SHIELD',' 盾牌'],['TWO_HAND',' 雙手武器'],['WEAR_WAIST',' 腰部'],['WIELD',' 武器'],
  ['WEAR_WRIST',' 腕部'],['WEAR_AMMO',' 彈藥']];
const CLASS_NAMES=[['MAGE','魔法師'],['CLERIC','牧師'],['THIEF','妙賊'],['WARRIOR','戰士'],['BARBARIAN','野蠻人'],['WIZARD','巫師'],
  ['ALCHEMIST','鍊金師'],['SAVANT','賢者'],['BISHOP','主教'],['ASSASSIN','刺客'],['RANGER','游俠'],['NINJA','忍者'],['KNIGHT','騎士'],
  ['SWORDSMAN','劍客'],['MONK','僧侶'],['SHAMAN','巫醫'],['SORCERER','幻法師'],['LORD','領主'],['WARLORD','戰王'],['MARTIALMAN','狂戰士']];
const RACE_NAMES=[['HUMAN','人類'],['ELF','精靈'],['DWARF','矮人'],['ORC','獸人'],['FAIRY','妖精'],['GNOME','地精'],['HOBBIT','賀比特'],
  ['DROW','暗黑精靈'],['VAMPIRE','吸血鬼'],['BEHOLDER','眼魔'],['LIZARDMAN','蜥蜴人'],['WEREWOLF','狼人'],['MUMMY','木乃伊'],
  ['GARGOYLE','石像鬼'],['CENTAUR','人馬']];
const HP_EVENT={HP_WEAR:'裝備觸發隱藏力量',HP_FIGHT:'命中觸發隱藏力量',HP_WEAPON:'命中觸發隱藏力量',HP_BLOCK:'格擋觸發隱藏力量',
  HP_ARROW:'射擊觸發隱藏力量',HP_REMOVE:'隱藏力量',HP_DART:'投擲觸發隱藏力量'};
const n0=x=>{const n=parseInt(x,10);return isNaN(n)?0:n;};

R.SPELL.spell_identify=function(sn,level,ch,vo){
  const o=vo,p=o.proto||{},v=o.values||[],send=s=>R.send(ch,s);
  let sklv=R.getSkillLevel(ch,sn);
  if(level>=1000){
    const lv=trunc(level/1000);sklv=0;
    if(lv>=2)sklv=1;if(lv>=10)sklv=2;if(lv>=22)sklv=3;if(lv>=40)sklv=4;if(lv>=61)sklv=5;if(lv>=90)sklv=6;
    level=lv+sklv;
  }else level+=sklv;

  send('物品名稱: '+o.short+'   物品形式: '+(C_ITEM[o.type]||'<不明>')+'('+E_ITEM(o.type)+')\n物品狀態: '+cExtraBitName(o.extra)+'.\n');

  if(p.vnum===OBJ_VNUM_POWER_GEM)send('魔力回復量: '+v[0]+' - '+v[1]+' 點.\n');

  if(o.type==='CONTAINER'){
    if(v[3]>0)send('容量: '+v[0]+', 減重比率: '+(100-v[3])+'%.\n');
    else if(v[3]<0)send('容量: '+v[0]+', 減少物品數: '+(0-v[3])+'件.\n');
    else send('容量: '+v[0]+'\n');
  }
  if(o.type==='DRINK_CON'||o.type==='FOUNTAIN'){
    const isCon=o.type==='DRINK_CON';
    if(v[2]>=LIQ_MAX||v[2]<0)v[2]=0;
    send((isCon?'容量: ':'泉水規模: ')+(v[0]>0?v[0]:0)+', ');
    send((isCon?'盛裝量: ':'殘存量: ')+(v[1]>0?v[1]:v[1]===-1?'∞':0)+', ');
    send('種類: '+LIQ[v[2]][0]+'.\n');
  }
  if(o.type==='FOOD'){
    if(v[1]>0&&v[1]<=49)send('飽足度: '+v[0]+', 食物加成: '+cLocName(v[1])+' '+v[2]+' 點.\n');
    else send('飽足度: '+v[0]+'.\n');
  }
  if(o.type==='ARMOR'&&o.wear&&o.wear.size){
    send('裝備位置：');
    for(const [k,n] of WEAR_NAMES)if(o.wear.has(k))send(n);
    send('\n');
  }
  /* 簡化：材質用資料檔材質名（引擎未載入材質表），max_level 無對應欄位 */
  send('材質: '+(o.material||'')+'  重量: '+o.weight+'  價值: '+o.cost+'  等級: '+o.level+'\n');

  const pv=p.values||[];
  const spellTxt=i=>{const s=skillByName(pv[i]!==undefined?pv[i]:v[i]);return s>=0?" '"+SK[s].cname+'('+SK[s].name+")'":'';};
  switch(o.type){
    case 'PILL':case 'SCROLL':case 'POTION':
      send('附有等級 '+v[0]+' 的法術:'+spellTxt(1)+spellTxt(2)+spellTxt(3)+'.\n');
      break;
    case 'WAND':case 'STAFF':
      send('尚有 '+v[2]+'/'+v[1]+' 次效用，等級： '+v[0]+spellTxt(3)+'.\n');
      break;
    case 'WEAPON':
      if(v[3]===16)
        send('武器傷害力: '+v[1]+' - '+v[2]+' (平均 '+trunc((v[1]+v[2])/2)+').\n射擊精準度: '+(v[1]*2)+' - '+(v[2]*2)+' (平均 '+(v[1]+v[2])+').\n');
      else
        send('武器傷害力: '+v[1]+' - '+v[2]+' (平均 '+trunc((v[1]+v[2])/2)+').\n');
      /* 簡化：耐用度（durability）引擎未實作 */
      break;
    case 'ARROW':
      send('箭支傷害力: '+v[1]+' - '+v[2]+' (平均 '+trunc((v[1]+v[2])/2)+'+'+v[3]+').');
      send(v[0]>0?'\n箭矢數: '+v[0]+' 支.\n':v[0]===-1?'\n箭矢數: ∞ 支.\n':'\n箭矢數: 0 支.\n');
      break;
    case 'DART':
      /* 原碼暗器傷害那行 sprintf 後被覆蓋未送出，照搬 */
      send(v[0]>0?'\n暗器數: '+v[0]+' 件.\n':v[0]===-1?'\n暗器數: ∞ 件.\n':'\n暗器數: 0 件.\n');
      break;
    case 'AMMO':
      send('彈藥殺傷力: '+trunc(v[1]*19/20)+' - '+trunc(v[1]*20/19)+' (平均 '+v[1]+').');
      if(v[3]>0&&v[3]<SK.length)send(' 附有等級 '+v[2]+' 的法術:'+spellTxt(3));
      send(v[0]>0?'\n彈藥數: '+v[0]+' 發.\n':v[0]===-1?'\n彈藥數: ∞ 發.\n':'\n彈藥數: 0 發.\n');
      break;
    case 'ARMOR':
      send('護甲防衛力(AC): '+v[0]+'.\n');
      /* 簡化：耐用度（durability）引擎未實作 */
      break;
  }

  const souv=p.souvenir|0;
  if(souv&1)send('備註: 此物品為紀念品\n');
  if(souv&2)send('Mob 專用物品\n');
  if(souv&4)send('備註: 此物品為特殊珍藏品\n');

  for(const a of o.applies||[]){
    const loc=locKey(a.type);let mod=n0(a.value!==undefined?a.value:a.degree);
    if(loc==='NONE'||!loc||mod===0)continue;
    if(loc==='HIT'||loc==='MANA'||loc==='MOVE')mod*=PPL_HP_MULTIPLYER;
    if(a.duration>0)send('影響 '+cLocName(a.type)+' '+mod+' 點. 尚有 '+a.duration+' 小時的效用.\n');
    else send('影響 '+cLocName(a.type)+' '+mod+' 點.\n');
  }
  /* 簡化：物品動態 affect（obj->affected）、材質 affect／職業／種族限制、隱藏力量使用限制 引擎未載入 */

  const permit=(pm,list,allowTxt,denyTxt)=>{
    if(!pm||!pm.list)return;
    const s=new Set(pm.list.map(x=>String(x).toUpperCase()));
    send(pm.type==='DENY'?denyTxt:allowTxt);
    for(const [k,n] of list)if(s.has(k))send(n+' ');
    send('\n');
  };
  permit(p.permit_classes,CLASS_NAMES,'專用職業：','禁用職業：');
  permit(p.permit_races,RACE_NAMES,'專用種族：','種族限制：');

  if(level>R.L_APP-2){
    const vr=p.race_combat||[];
    if(vr.length){
      send('對種族加成：\n');
      for(const r of vr){
        const rc=(R.CONST.races||[]).find(x=>R.lc(x.name)===R.lc(r.race));
        const nm=rc?((rc.cname||rc.name)+'('+rc.name+')'):String(r.race);
        send(R.pad(nm,19));
        const hq=n0(r.hr_mod_q),hp=n0(r.hr_mod_p),dq=n0(r.dr_mod_q),dp=n0(r.dr_mod_p);
        send(hq>0?'命中率 '+C.HIC+hq+C.NOR+' 點，':hq<0?'命中率 '+C.HIR+hq+C.NOR+' 點，':'命中率 '+hq+' 點，');
        send(hp>100?'百分比 '+C.HIC+hp+'%'+C.NOR+'；':hp<100?'百分比 '+C.HIR+hp+'%'+C.NOR+'；':'百分比 '+hp+'%；');
        send(dq>0?'傷害力 '+C.HIC+dq+C.NOR+' 點，':dq<0?'傷害力 '+C.HIR+dq+C.NOR+' 點，':'傷害力 '+dq+' 點，');
        send(dp>100?'百分比 '+C.HIC+dp+'%'+C.NOR+'。\n':dp<100?'百分比 '+C.HIR+dp+'%'+C.NOR+'。\n':'百分比 '+dp+'%。\n');
      }
    }
  }

  if(level>R.L_APP-1){
    if(o.timer>0)send('物品尚可使用 '+o.timer+' 小時\n');
    else send('物品無時間限制\n');
  }

  const hps=p.hidden_powers||[];
  if(hps.length){
    if(R.isImm(ch)||level>R.L_APP){
      for(const h of hps)
        send((HP_EVENT[h.event]||'隱藏力量')+': '+(h.level|0)+' 級的 '+h.spell+', 機率 '+(h.percent|0)+'%\n');
    }else send('你隱隱感到有股魔力藏在其中，卻又說不出是什麼力量。');
  }
};

R.SPELL.spell_locate_object=function(sn,level,ch,vo){
  const sklv=R.getSkillLevel(ch,sn);
  const maxcount=trunc(level/2)+2*(sklv*sklv)+8;
  if(ch.npc)return;
  const target=R.targetName||(typeof vo==='string'?vo:'');
  let buf1='',found=false,count=0,countBuf=0;
  for(const obj of W.objects){
    if(count>maxcount)break;
    if(obj.deleted||!R.canSeeObj(ch,obj)||!R.is_name(target,obj.name))continue;
    let inObj=obj;while(inObj.in_obj)inObj=inObj.in_obj;
    let buf;
    if(inObj.carried_by){
      const cb=inObj.carried_by;
      if(!R.canSee(ch,cb))continue;
      found=true;++count;++countBuf;
      if(sklv>=5)buf=obj.short+' 由 '+R.PERS(cb,ch)+' 攜帶 位於 '+(cb.room&&cb.room.area?cb.room.area.name:'')+'.\n';
      else buf=obj.short+' 由 '+R.PERS(cb,ch)+' 攜帶.\n';
    }else{
      found=true;++count;++countBuf;
      const rm=inObj.in_room;
      if(sklv>=5)buf=obj.short+' 擺在 '+(!rm?'某處':rm.name)+' '+(!rm?'':'位於')+' '+(!rm?'':rm.area.name)+'.\n';
      else buf=obj.short+' 擺在 '+(!rm?'某處':rm.name)+'.\n';
    }
    buf1+=R.cap(buf);
    if(countBuf>=80){countBuf=0;R.send(ch,buf1);buf1='';}
  }
  if(found)R.send(ch,buf1);
  else R.send(ch,'世界上沒有這樣東西.\n');
};

R.SPELL.spell_remove_curse=function(sn,level,ch,vo){
  const v=vo;let yesno=0;
  if(!v.npc||v.aff.has('CHARM')||v.aff.has('SUMMONED')){
    for(const o of [...v.carrying]){
      if(o.wear_loc<0||o.wear_loc>=30)continue;
      if(o.extra.has('NOREMOVE')){   /* 簡化：horse 物品判定略過 */
        R.unequipChar(v,o);
        if(o.extra.has('PERSONAL'))R.objToChar(o,v);
        else R.objToRoom(o,v.room);
        R.act('你丟下 $p.',v,o,null,R.TO_CHAR);
        R.act('$n 丟下 $p.',v,o,null,R.TO_ROOM);
        yesno=1;
      }
    }
  }
  if(R.isAffected(v,R.gsn.curse)){
    R.affectStrip(v,R.gsn.curse);
    R.send(v,'你覺得好多了.\n');
    yesno=1;
  }
  if(ch!==v&&yesno)R.send(ch,'好的。\n');
};

/* room_is_private 簡化：只看 PRIVATE（2 人）／SOLITARY（1 人），不算體型 */
function roomIsPrivate(room){
  const n=room.people.filter(r=>!r.deleted&&!R.isImm(r)).length;
  if(room.flags.has('PRIVATE')&&n>=2)return true;
  if(room.flags.has('SOLITARY')&&n>=1)return true;
  return false;
}

R.SPELL.spell_summon=function(sn,level,ch,vo){
  const v=R.getCharWorld(ch,R.targetName||(typeof vo==='string'?vo:''));
  if(!v){R.send(ch,'你失敗了.\n');return;}
  if(!v.room||roomIsPrivate(ch.room)||v.room.area!==ch.room.area||v.room.flags.has('SAFE')
     ||v.room.flags.has('SUMMON_BIT')||ch.room.flags.has('SUMMON_BIT')){R.send(ch,'你失敗了.\n');return;}
  const sk=R.getSkillLevel(ch,sn);
  if(v===ch||!v.room||(!v.npc&&!v.conn)||(sk<5&&v.aff.has('CURSE'))||v.level>ch.level+sk||v.fighting){
    R.send(ch,'你失敗了.\n');return;
  }
  if(v.npc){R.send(ch,'你失敗了.\n');return;}
  R.act('$n 突然從你面前消失.',v,null,null,R.TO_ROOM);
  /* 簡化：room_leave / room_enter 程式觸發略過 */
  R.charFromRoom(v);
  R.charToRoom(v,ch.room);
  R.act('$n 召喚了你！',ch,null,v,R.TO_VICT);
  R.act('$n 突然出現在這裡.',v,null,null,R.TO_ROOM);
  R.cmds.look(v,'auto');
};

R.SPELL.spell_teleport=function(sn,level,ch,vo){
  const TIMES_LIMIT=500;
  const v=vo;
  if(!v||!v.room||!v.conn||v.room.flags.has('NO_RECALL')||v.room.flags.has('NO_TELEPORT_OUT')
     ||(!ch.npc&&v.fighting)
     ||(v!==ch&&(R.newSavesSpell(R.pp(ch),v,M.WIND)+R.getSkillLevel(ch,sn)<trunc(R.pct()*100/R.weaknessPercent(v,sn))))){
    R.send(ch,'你失敗了.\n');return;
  }
  /* 簡化：拍賣中角色不可傳送的判定略過（引擎無拍賣） */
  const keys=Object.keys(W.rooms);
  const recall=v.room.area.recall;
  let room=null,times;
  for(times=0;times<TIMES_LIMIT;times++){
    const r=W.rooms[keys[R.rand(0,keys.length-1)]];
    if(!r)continue;
    if(r.area.recall!==recall)continue;
    /* 簡化：AREA_CHANGED/BUILDING/CLAN 區域旗標引擎無資料 */
    if(!r.flags.has('PRIVATE')&&!r.flags.has('NO_TELEPORT_IN')){room=r;break;}
  }
  if(times===TIMES_LIMIT||!room){R.send(ch,'這個空間似乎沒有可以讓你著陸的地方!\n');return;}
  if(R.lc(ch.room.area.id)==='immhall'){R.send(ch,'這個空間似乎沒有可以讓你著陸的地方!\n');return;}   /* 推測：area identity 以檔名代 */
  if(v.fighting)R.stopFighting(v,true);
  R.act('$n 的身影逐漸消失.',v,null,null,R.TO_ROOM);
  R.send(v,'你被強迫傳送到另一個空間！\n');
  R.charFromRoom(v);
  R.charToRoom(v,room);
  R.act('$n 的身影逐漸出現.',v,null,null,R.TO_ROOM);
  R.cmds.look(v,'auto');
  /* 簡化：room_enter / greet_prog 觸發略過 */
};

R.SPELL.spell_remove_nodrop=function(sn,level,ch,vo){
  const o=vo;
  if(!o.extra.has('NODROP')){R.send(ch,'沒有什麼值得描述的事發生.\n');return;}
  o.extra.add('REMOVE_NODROP');
  R.act('一道金色的光芒籠罩著$p.',ch,o,null,R.TO_CHAR);
  R.act('一道金色的光芒籠罩著$p.',ch,o,null,R.TO_ROOM);
};
})(ROC);
