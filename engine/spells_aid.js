/* spells_aid.js — 減益法術（spell_aid.c / spell_psichic.c） */
(function(R){
const C=R.C,P=R.POS,W=R.world,SK=R.SK,M=R.MAGIC;
const T=Math.trunc;

/* ---------- 小工具（對應 C 的巨集／輔助函式） ---------- */
/* WAIT_MAGIC_STATE（handler.c）：spellcraft 縮短延遲 */
function waitMagicState(ch,delay){
  const nPerc=R.getSkillPercent(ch,R.gsn.spellcraft);
  if(nPerc>0){
    const nSklv=R.getSkillLevel(ch,R.gsn.spellcraft);
    delay-=T(delay*(nSklv+1)*(nSklv+4)*nPerc/10000);
    if(nSklv>5)delay--;
    delay=Math.max(0,delay);
  }
  ch.wait=Math.max(ch.wait||0,delay);
}
const PULSE_VIOLENCE=8;   /* 2 * PULSE_PER_SECOND(4) */
/* 物品施法（level >= 1000）換算 sklv */
function objSklv(objLv){
  let s=0;
  if(objLv>=2)s=1;if(objLv>=10)s=2;if(objLv>=22)s=3;if(objLv>=40)s=4;if(objLv>=61)s=5;if(objLv>=90)s=6;
  return s;
}
const intDiff=(ch,v)=>R.stat(ch,1)-R.stat(v,1);   /* INT_DIFF */
const raceIs=(v,name)=>{const r=R.CONST&&R.CONST.races&&R.CONST.races[v.race];return !!r&&r.name===name;};   /* victim->race == race_lookup(name) */
const invokeBlocks=(v,lv)=>R.gsn.invoke!==undefined&&R.isAffected(v,R.gsn.invoke)&&R.getSkillLevel(v,R.gsn.invoke)>lv;
/* GET_DODGE：簡化：不含負重、dex_app 防禦加成、忍者主屬性與 SorGate 召喚獸加成 */
const getDodge=v=>(v.dodge||0)+(R.isAwake(v)?0:100)+(v.npc?0:v.level*(-5))+(v.aff.has('FLYING')?-40:0);
/* GET_AC：簡化：不含種族天生 AC、武僧拳法與 AM 加成，直接取 armor */
const getAC=v=>v.armor;
/* get_damroll(victim, WEAR_WIELD)：簡化：不含 str_app 加成與副手武器修正，直接取 damroll */
const getDamroll=v=>v.damroll||0;

/* ---------- blindness ---------- */
R.SPELL.spell_blindness=function(sn,level,ch,v){
  const sklv=R.getSkillLevel(ch,sn);
  let chance=10;
  const intblind=R.skillLookup('blindness');
  const intSunflash=R.skillLookup('sun flash');

  if(R.isPK(ch,v))chance/=2;
  chance=chance*R.intEffect(ch);
  if(sklv>0)chance=chance*(10+1.5*sklv)*0.1;
  chance*=R.newSavesSpell(R.pp(ch),v,M.FIRE)*0.01;
  chance=Math.min(chance,chance+sklv);
  chance*=R.weaknessPercent(v,sn)*0.01;
  if(!ch.npc&&ch.level<31)chance+=40;

  if(R.hasSpecial(v,'NO_BLIND')||R.raceHas(v,'BEHOLDER')||invokeBlocks(v,2)||R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  if(v.aff.has('BLIND')){
    if(R.isAffected(v,intblind))R.affectStrip(v,intblind);
    else if(R.isAffected(v,intSunflash))R.affectStrip(v,intSunflash);
    else return;
  }

  let duration=1+sklv;
  if(R.isPK(ch,v))duration=T(duration/4);
  const modifier=(-4-sklv)*R.weaknessDamage(v,sn)*0.01;
  if(R.isPK(ch,v))duration=T(duration/2);
  R.affectToChar(v,{type:sn,duration,location:'HITROLL',modifier,bitvector:'BLIND'});

  R.act(C.HIR+'指間的火燄化成耀目的火光，刺中了'+C.NOR+'$N'+C.HIR+'的眼睛！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act(C.HIR+'眼前閃過異常明亮的火光，緊接而來的就是無盡的黑暗！'+C.NOR,ch,null,v,R.TO_VICT);
  R.act('$n'+C.HIR+'手中射出的火光命中了'+C.NOR+'$N'+C.HIR+'的眼睛！'+C.NOR,ch,null,v,R.TO_NOTVICT);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- seal magic ---------- */
R.SPELL.spell_seal_magic=function(sn,level,ch,v){
  const sklv=R.getSkillLevel(ch,sn);
  let chance=30;
  const intSeal=R.skillLookup('seal magic');

  if(R.isPK(ch,v))chance/=2;
  chance=chance*R.intEffect(ch);
  if(!ch.npc&&sklv>0)chance=chance*(10+sklv)*0.1;
  else if(ch.npc)chance=chance*1.4;
  if(sklv>4)chance=chance*1.1;
  chance=chance*R.newSavesSpell(R.pp(ch),v,M.EARTH)*0.01;
  chance=Math.min(chance,50+sklv*4);
  chance=chance*R.weaknessPercent(v,sn)*0.01;

  if(R.hasSpecial(v,'NO_SEALMAGIC')||R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  if(v.aff.has('SEAL_MAGIC')){
    if(R.isAffected(v,intSeal))R.affectStrip(v,intSeal);
    else return;
  }

  let duration=sklv;
  if(R.isPK(ch,v))duration=T(duration/4);
  R.affectToChar(v,{type:R.gsn.seal_magic,duration,location:'NONE',modifier:0,bitvector:'SEAL_MAGIC'});

  R.act(C.YEL+'高位大地精靈化身成為寫滿了咒文的束帶，圍住了$N'+C.YEL+'！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act(C.YEL+'數不清的束帶圍繞著你，上面的文字正侵入你的身體之中！'+C.NOR,ch,null,v,R.TO_VICT);
  R.act(C.YEL+'高位大地精靈化身成為寫滿了咒文的束帶，圍住了$N'+C.YEL+'！'+C.NOR,ch,null,v,R.TO_NOTVICT);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- charm person ---------- */
R.SPELL.spell_charm_person=function(sn,level,ch,v){
  const sklv=R.getSkillLevel(ch,sn);
  const L_SEN=45;   /* L_DIR - 1 = MAX_LEVEL(47) - 2 */

  if(v===ch){
    R.send(ch,'你覺得自己還不夠愛自己嗎？\n');
    return;
  }

  /* get_trust 以 level 代替（簡化：無 trust 欄位）；log_string 略過 */
  if(!ch.npc&&ch.level>=R.L_APP&&ch.level<L_SEN){
    R.send(ch,'以你的能力並不需要魅惑別的生物。\n');
    return;
  }

  if(R.isImm(v)){
    R.send(ch,'你的能力並不足以魅惑眼前的目標。\n');
    return;
  }

  if(R.isPK(ch,v)){
    if(!ch.act.has('REGISTER')&&(ch.room&&!ch.room.flags.has('PK'))){
      R.send(ch,'你並沒有參加 PK！\n');
      return;
    }
    if(R.isSafe(ch,v))return;
  }

  if(R.hasSpecial(v,'NO_CHARM')||(v.npc&&v.shop)){
    /* victim 沒有在戰鬥才會對目標作 multi_hit */
    if(!v.fighting)R.multiHit(v,ch);
    return;
  }

  if(v.aff.has('CHARM')||ch.aff.has('CHARM')||ch.level+R.getSkillLevel(ch,sn)<v.level
     ||R.savesSpell(R.pp(ch),v)<T(R.pct()*100/R.weaknessPercent(v,sn)))
    return;
  if(R.isPK(ch,v)&&R.savesSpell(R.pp(ch),v)<R.pct())return;

  if(v.master)R.stopFollower(v);

  R.addFollower(v,ch);
  /* C：(sklv > 1 ?: sklv * 2, 0) 是逗號運算式，結果恆為 0 */
  let duration=R.fuzzy(T(ch.level/4))+1+0;
  if(R.isPK(ch,v))duration=T(duration/8);
  R.affectToChar(v,{type:sn,duration,location:'INT',modifier:-2,bitvector:'CHARM'});
  if(v.position===P.FIGHTING)R.stopFighting(v,true);
  /* 簡化：roc_mob_charmed qmark（do_mpadd_qmark）略過 */

  R.send(ch,'好的。\n');
  R.act('$n 看起來真是太有魅力了。',ch,null,v,R.TO_VICT);
  waitMagicState(ch,24-sklv);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- curse ---------- */
R.SPELL.spell_curse=function(sn,level,ch,v){
  let sklv=R.getSkillLevel(ch,sn);
  let chance=50;
  let svseffect;
  const weakness=R.weaknessDamage(v,sn);

  if(R.isPK(ch,v))chance=T(chance/2);

  if(level>=1000){
    const objLv=T(level/1000);
    sklv=objSklv(objLv);
    svseffect=2+Math.max(0,objLv-40)+T(sklv*(sklv+4)/3);
  }else{
    svseffect=2+Math.max(0,level-36)+T(sklv*(sklv+4)/3);
  }
  if(ch.npc)svseffect=T(svseffect/2);

  chance=T(chance*R.intEffect(ch));
  if(sklv>0)chance=T(chance*(10+sklv)/10);
  if(sklv>3)chance=T(chance*1.1);
  chance=T(chance*R.newSavesSpell(R.pp(ch),v,M.DARK)*0.01);
  chance=Math.min(chance,75+sklv*4);
  chance=T(chance*R.weaknessPercent(v,sn)*0.01);
  if(ch.level<30)chance+=20;

  if(R.hasSpecial(v,'NO_CURSE')||R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  if(v.aff.has('CURSE')){
    if(R.isAffected(v,sn)){
      if(R.affectedValue(v,sn,'SAVING_SPELL')<=svseffect)R.affectStrip(v,sn);
      else return;
    }else return;
  }

  let duration=T((10+sklv*2)*R.newSavesTimer(R.pp(ch),v,M.SPELL)*0.01);
  if(R.isPK(ch,v))duration=T(duration/4);

  let modifier;
  if(sklv>3){
    const hreffect=-sklv*sklv;
    modifier=T(hreffect*weakness*0.01);
    if(ch.npc)modifier=T(modifier/2);
    R.affectToChar(v,{type:sn,duration,location:'HITROLL',modifier,bitvector:'CURSE'});
  }

  if(sklv>4){
    modifier=-((sklv-4)*10+(sklv-5)*5)*2;
    if(ch.npc)modifier=T(modifier/2);
    modifier=T(modifier*weakness*0.01);
    R.affectToChar(v,{type:sn,duration,location:'RMAGIC',modifier,bitvector:'CURSE'});   /* RMAGIC 引擎目前無效果 */
  }

  R.affectToChar(v,{type:sn,duration,location:'SAVING_SPELL',modifier:T(svseffect*weakness*0.01),bitvector:'CURSE'});
  R.affectToChar(v,{type:sn,duration,location:'SAVING_ELEMENT',modifier:T(svseffect*weakness*0.01),bitvector:'CURSE'});

  R.act(C.HIB+'一抹黑暗的烏影無聲無息地依附在'+C.NOR+'$N'+C.HIB+'背後！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act(C.HIB+'你心中突然閃過一絲不安，彷彿有某種東西在你身旁......'+C.NOR,ch,null,v,R.TO_VICT);
  R.act('$N'+C.HIB+'的背後隱約浮現出一團不明黑霧。'+C.NOR,ch,null,v,R.TO_NOTVICT);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- tardy ---------- */
R.SPELL.spell_tardy=function(sn,level,ch,v){
  let sklv=R.getSkillLevel(ch,sn);
  let chance=50;
  let effect;

  if(level>=1000){
    const objLv=T(level/1000);
    sklv=objSklv(objLv);
    effect=objLv+R.stat(ch,2)*(3+2*sklv);
  }else{
    effect=level+R.stat(ch,2)*(3+2*sklv);
  }

  if(R.isPK(ch,v))chance=T(chance/2);
  if(sklv>4)effect+=50;
  if(sklv>5)effect+=50;

  chance=T(chance*R.wisEffect(ch));
  if(sklv>0)chance=T(chance*(10+sklv)/10);
  if(sklv>3)chance=T(chance*1.1);
  chance=T(chance*R.newSavesSpell(R.pp(ch),v,M.WIND)*0.01);
  chance=Math.min(chance,75+sklv*4);
  chance=T(chance*R.weaknessPercent(v,sn)*0.01);
  if(!ch.npc&&ch.level<31)chance+=25;

  if(R.hasSpecial(v,'NO_TARDY')||R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  if(sklv>3||!v.aff.has('TARDY'))waitMagicState(v,PULSE_VIOLENCE);

  if(v.aff.has('TARDY')){
    const tardy=R.skillLookup('tardy');
    if(R.isAffected(v,tardy)){
      if(R.affectedValue(v,sn,'DODGE')<effect)R.affectStrip(v,tardy);
      else{
        R.act('$N身上已經遲緩術效果.',ch,null,v,R.TO_CHAR);
        return;
      }
    }else{
      R.act('$N身上已經遲緩術效果.',ch,null,v,R.TO_CHAR);
      return;
    }
  }

  effect+=Math.max(0,T(getDodge(v)/(sklv-11)));

  /* 修改作用時間 2020/11/06 */
  const duration=R.affectedValue(v,sn,'DODGE')<0?0:3;
  R.affectJoin(v,{type:sn,duration,location:'DODGE',modifier:T(effect*R.weaknessDamage(v,sn)*0.01),bitvector:'TARDY'});

  R.act(C.HIY+'周圍的空氣在你的魔力影響下，形成了淡黃色的風之鎖鍊，縛住了'+C.NOR+'$N'+C.HIY+'！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act(C.HIY+'大量的風之鎖鍊從'+C.NOR+'$n'+C.HIY+'身旁往你火速延伸過來，縛住了你！'+C.NOR,ch,null,v,R.TO_VICT);
  R.act(C.HIY+'淡黃色的風之鎖鍊憑空出現在'+C.NOR+'$n'+C.HIY+'身旁，縛住了'+C.NOR+'$N'+C.HIY+'！'+C.NOR,ch,null,v,R.TO_NOTVICT);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- poison ---------- */
R.SPELL.spell_poison=function(sn,level,ch,v){
  let sklv=R.getSkillLevel(ch,sn);
  const nVenomSklv=R.getSkillLevel(ch,R.skillLookup('venomous strike'));
  let chance=50;

  if(level>=1000)sklv=objSklv(T(level/1000));

  if(R.isPK(ch,v))chance=T(chance/2);
  chance=T(chance*R.wisEffect(ch));
  if(sklv<nVenomSklv)sklv=nVenomSklv;
  if(sklv>0)chance=T(chance*(10+sklv)/10);
  if(sklv>3)chance=T(chance*1.1);
  chance=T(chance*R.weaknessPercent(v,sn)*0.01);
  chance=T(chance*R.newSavesSpell(R.pp(ch),v,M.SPELL)*0.01);
  if(!ch.npc&&ch.level<31)chance+=25;

  /* chance 判定 */
  if(R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  const gsnPoison=R.gsn.poison;
  const con=R.stat(v,4);
  const mkAf=()=>{
    let duration=Math.max(0,1+sklv-T(con/5));
    if(R.isPK(ch,v))duration=T(duration/4);
    return {type:gsnPoison,duration,location:'SAVING_POISON',
      modifier:T(T((14+sklv*6)*25/con)*R.weaknessDamage(v,gsnPoison)*0.01),bitvector:'POISON'};
  };

  /* 判定 no_poison（RACE_NO_POISON 種族位元：R.raceHas 目前恆為否） */
  if(R.raceHas(v,'NO_POISON')||R.hasSpecial(v,'NO_POISON')){
    /* 不死系（或 ghoul）上 aff_poison 數值 */
    if(R.raceHas(v,'UNDEAD')||v.aff.has('GHOUL')){
      if(R.affectedValue(v,gsnPoison,'SAVING_POISON')<(14+sklv*6)*10)R.affectJoin(v,mkAf());
      R.act(C.HIG+'毒素侵入'+C.NOR+'$N'+C.HIG+'的體內，但似乎不對他造成任何影響。'+C.NOR,ch,null,v,R.TO_CHAR);
      R.act(C.HIG+'毒素侵入你的體內，但不對你造成任何影響。'+C.NOR,ch,null,v,R.TO_VICT);
      R.act('$N'+C.HIG+'的身體被毒素侵入，但似乎不對他造成任何影響。'+C.NOR,ch,null,v,R.TO_NOTVICT);
    }else{
      R.send(ch,'你失敗了.\n');
      return;
    }
  }else{
    if(R.affectedValue(v,gsnPoison,'SAVING_POISON')<(14+sklv*6)*10)R.affectJoin(v,mkAf());

    R.act('$N'+C.HIG+'臉色略為泛青，毒素已經侵入了他的體內！'+C.NOR,ch,null,v,R.TO_CHAR);
    R.act(C.HIG+'噁心感與刺痛感同時襲來，你覺得相當地難受！'+C.NOR,ch,null,v,R.TO_VICT);
    R.act('$N'+C.HIG+'的身體顫抖了一下，表情變得有些苦澀！'+C.NOR,ch,null,v,R.TO_NOTVICT);
    /* 簡化：mprog_hurt_trigger 無 mob prog */
  }
};

/* ---------- sleep ---------- */
R.SPELL.spell_sleep=function(sn,level,ch,v){
  const sklv=R.getSkillLevel(ch,sn);
  let chance=R.savesSpell(R.pp(ch),v)+sklv+T(sklv/2);
  chance=T(chance*R.weaknessPercent(v,sn)/100);
  if(R.isPK(ch,v))chance=T(chance/2);

  if(v.aff.has('SLEEP')||ch.level<v.level-sklv||chance<R.pct()
     ||raceIs(v,'Vampire')||R.hasSpecial(v,'NO_SLEEP')||R.isImm(v)){
    R.send(ch,'你失敗了.\n');
    return;
  }

  let duration=T(ch.level/8)+intDiff(ch,v)+sklv;
  if(R.isPK(ch,v))duration=T(duration/8);
  R.affectJoin(v,{type:sn,duration,location:'NONE',modifier:0,bitvector:'SLEEP'});

  if(R.isAwake(v)){
    R.send(v,'一股睡意襲來..... zzzzzz.\n');
    if(v.position===P.FIGHTING)R.stopFighting(v,true);
    /* do_sleep(victim,"") */
    if(R.cmds&&R.cmds.sleep)R.cmds.sleep(v,'');
    v.position=P.SLEEPING;
  }

  waitMagicState(ch,12);
};

/* ---------- weaken ---------- */
R.SPELL.spell_weaken=function(sn,level,ch,v){
  let sklv=R.getSkillLevel(ch,sn);
  let chance=50;
  const intWeaken=R.skillLookup('weaken');

  if(level>=1000)sklv=objSklv(T(level/1000));

  if(R.isPK(ch,v))chance=T(chance/2);
  chance=T(chance*R.intEffect(ch));
  if(sklv>0)chance=T(chance*(10+sklv)/10);
  if(sklv>3)chance=T(chance*1.1);
  chance=T(chance*R.newSavesSpell(R.pp(ch),v,M.COLD)*0.01);
  chance=Math.min(chance,75+sklv*4);
  chance=T(chance*R.weaknessPercent(v,sn)*0.01);
  if(!ch.npc&&ch.level<31)chance+=25;

  if(invokeBlocks(v,2)||R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  const wd=R.weaknessDamage(v,sn);
  if(v.aff.has('WEAKEN')){
    if(R.isAffected(v,intWeaken)){
      if(sklv>2&&(R.affectedValue(v,sn,'DAMROLL')>T(getDamroll(v)/(sklv-11))*wd*0.01)){
        R.affectStrip(v,intWeaken);
      }else if(R.affectedValue(v,sn,'STR')>-1-T(sklv/3)){
        R.affectStrip(v,intWeaken);
      }else{
        R.act('$N身上已經有衰弱術效果.'+C.NOR,ch,null,v,R.TO_CHAR);
        return;
      }
    }else{
      R.act('$N身上已經有衰弱術效果.'+C.NOR,ch,null,v,R.TO_CHAR);
      return;
    }
  }

  /* 修改作用時間 2020/11/06 */
  let duration=R.affectedValue(v,sn,'STR')<0?0:3;
  R.affectToChar(v,{type:R.gsn.weaken,duration,location:'STR',modifier:T((-1-T(sklv/3))*wd*0.01),bitvector:'WEAKEN'});

  /* 新增降低 dr 2020/11/06 */
  if(sklv>2){
    duration=R.affectedValue(v,sn,'DAMROLL')<0?0:3;
    R.affectToChar(v,{type:R.gsn.weaken,duration,location:'DAMROLL',modifier:T(T(getDamroll(v)/(sklv-11))*wd*0.01),bitvector:'WEAKEN'});
  }

  if(sklv>3){
    duration=R.affectedValue(v,sn,'ADAMAGE')<0?0:3;
    R.affectToChar(v,{type:R.gsn.weaken,duration,location:'ADAMAGE',modifier:T(-(10+sklv*15)*wd*0.01),bitvector:'WEAKEN'});   /* ADAMAGE 引擎目前無效果 */
  }

  R.act('$N'+C.HIC+'皮膚冒出絲絲水氣，他看起來似乎變得比剛才來得虛弱！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act(C.HIC+'你感到汗流浹背，身體有點使不上力氣。'+C.NOR,ch,null,v,R.TO_VICT);
  R.act('$N'+C.HIC+'看起來汗流不止，臉色也變得蒼白了些。'+C.NOR,ch,null,v,R.TO_NOTVICT);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- faerie fire ---------- */
R.SPELL.spell_faerie_fire=function(sn,level,ch,v){
  let sklv=R.getSkillLevel(ch,sn);
  let chance=50;
  let effect;
  const intfaerie_fire=R.skillLookup('faerie fire');
  const pp=R.pp(ch);

  if(R.isPK(ch,v))chance=T(chance/2);

  const lv=level>=1000?T(level/1000):level;
  if(level>=1000)sklv=objSklv(lv);
  if(v.armor<0&&pp>0)effect=4*(lv+sklv)-T((v.armor*pp*sklv)/2200);
  else effect=4*(lv+sklv);

  chance=T(chance*R.intEffect(ch));
  if(sklv>0)chance=T(chance*(10+sklv)/10);
  if(sklv>3)chance=T(chance*1.1);
  chance=T(chance*R.newSavesSpell(pp,v,M.FIRE)*0.01);
  chance=Math.min(chance,75+sklv*4);
  chance=T(chance*R.weaknessPercent(v,sn)*0.01);
  if(!ch.npc&&ch.level<31)chance+=25;

  if(R.hasSpecial(v,'NO_FAEFIRE')||R.pct()>chance){
    R.send(ch,'你失敗了.\n');
    return;
  }

  if(v.aff.has('FAERIE_FIRE')){
    if(R.isAffected(v,intfaerie_fire)){
      if(R.affectedValue(v,sn,'AC')<effect)R.affectStrip(v,intfaerie_fire);
      else{
        R.act('$N身上已經有天使之火效果.'+C.NOR,ch,null,v,R.TO_CHAR);
        return;
      }
    }else{
      R.act('$N身上已經有天使之火效果.'+C.NOR,ch,null,v,R.TO_CHAR);
      return;
    }
  }

  effect+=Math.max(0,T(getAC(v)/(sklv-10)));

  const wd=R.weaknessDamage(v,sn);
  /* 修改作用時間 2020/11/06（C 原碼即以 ADAMAGE 判斷） */
  let duration=R.affectedValue(v,sn,'ADAMAGE')<0?0:3;
  R.affectJoin(v,{type:sn,duration,location:'AC',modifier:T(effect*wd*0.01),bitvector:'FAERIE_FIRE'});

  if(sklv>3&&!ch.npc){
    duration=R.affectedValue(v,sn,'ADAMAGE')<0?0:3;
    R.affectJoin(v,{type:sn,duration,location:'RDAMAGE',modifier:T((-8-sklv*7)*wd*0.01),bitvector:'FAERIE_FIRE'});   /* RDAMAGE 引擎目前無效果 */
  }else if(ch.npc){
    duration=R.affectedValue(v,sn,'ADAMAGE')<0?0:3;
    R.affectJoin(v,{type:sn,duration,location:'RDAMAGE',modifier:T((-10-sklv*15)*wd*0.01),bitvector:'FAERIE_FIRE'});
  }

  R.act(C.HIP+'你喚來神秘的力量，一片詭異的紫霧圍繞在'+C.NOR+'$N'+C.HIP+'身旁！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act(C.HIP+'$n'+C.HIP+'身旁冒出的怪異紫霧纏上了你！'+C.NOR,ch,null,v,R.TO_VICT);
  R.act('$n'+C.HIP+'召喚出暗紫色的霧氣，依附在'+C.NOR+'$N'+C.HIP+'的身上！'+C.NOR,ch,null,v,R.TO_NOTVICT);
  /* 簡化：mprog_hurt_trigger 無 mob prog */
};

/* ---------- ventriloquate（spell_psichic.c） ---------- */
R.SPELL.spell_ventriloquate=function(sn,level,ch,vo){
  const [speaker,rest]=R.one_arg(R.targetName||'');
  const text=rest||'';
  R.targetName=text;
  let buf1=speaker+' 說 \''+text+'\'.\n';
  const buf2='某人命令 '+speaker+' 說 \''+text+'\'.\n';
  buf1=buf1.charAt(0).toUpperCase()+buf1.slice(1);

  for(const vch of [...ch.room.people]){
    /* C 原碼 saves_spell() 回傳 15..500 恆為真，所以實際上一律送 buf2，照搬 */
    if(!R.is_name(speaker,vch.name))R.send(vch,R.savesSpell(R.pp(ch),vch)?buf2:buf1);
  }

  waitMagicState(ch,12);
};

})(ROC);
