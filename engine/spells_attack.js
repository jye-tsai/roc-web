/* spells_attack.js — 攻擊法術（magic.c / spell_flame / ice / lightning / light / dark） */
(function(R){
const C=R.C,P=R.POS,W=R.world,SK=R.SK,M=R.MAGIC;

/* ---------- 共用小工具 ---------- */
const T=Math.trunc;
const nr=(a,b)=>R.rand(T(a),T(b));                                  /* number_range(double→int) */
const sl=(ch,sn)=>(sn===undefined||sn===null||sn<0)?0:R.getSkillLevel(ch,sn);
const sp=(ch,sn)=>(sn===undefined||sn===null||sn<0)?0:R.getSkillPercent(ch,sn);
const gone=v=>!v||v.deleted||v.position===P.DEAD;
const wizInvis=v=>!v.npc&&v.act&&v.act.has('WIZINVIS');
const mystic=v=>v.aff.has('MYSTIC_ARMOR');
const svs=(ch,t)=>R.getSvsType(ch,t);                               /* NEW_GET_SVS */
const amdr=ch=>ch.amdr||0;                                          /* 簡化：引擎沒有 amdr／mdr 時視為 0 */
const mdr=ch=>ch.mdr||0;
const wisDiff=(a,b)=>R.stat(a,2)-R.stat(b,2);                       /* WIS_DIFF */
const isAffBit=(v,b)=>v.aff.has(b);
/* 種族能力位元（merc.h RACE_xxx 對 const.js races[].abil） */
const RB={FLY:4,DETECT_ALIGN:128,SANCT:2048,NO_POISON:16384,VAMPIRE:1048576,UNDEAD:8388608};
const raceHas=(ch,k)=>{if(R.raceHas&&R.raceHas(ch,k))return true;const r=R.CONST&&R.CONST.races&&R.CONST.races[ch.race];return !!(r&&((r.abil||0)&RB[k]));};
/* is_flying：簡化：坐騎（WEAR_RIDE 的 horse）略過 */
const isFlying=v=>v.aff.has('FLYING')||raceHas(v,'FLY');
/* is_same_group：簡化：引擎沒有 group 欄位，用 leader／master 推算 */
const leadOf=x=>x.leader||x.master||x;
function sameGroup(a,b){
  if(!a||!b||a.deleted||b.deleted)return false;
  if(a===b)return true;
  if(!a.npc&&!b.npc&&Math.abs(a.level-b.level)>5)return false;
  return leadOf(a)===leadOf(b);
}
/* IsPK 時 duration 減半之類 */
const isPK=(ch,v)=>R.isPK(ch,v);
const PK_DMG_DENOMINATOR=4;
/* WAIT_MAGIC_STATE：簡化：spellcraft 縮短延遲略過 */
const waitMagic=(ch,d)=>{ch.wait=Math.max(ch.wait||0,d);};
/* obj 施法（level>=1000）換算 sklv；A 表：2/10/22/40/61/90，B 表：10/20/30/40/50/60 */
const TA=[2,10,22,40,61,90],TB=[10,20,30,40,50,60];
function objSklv(objLv,tbl){let s=0;tbl.forEach((t,i)=>{if(objLv>=t)s=i+1;});return s;}
/* waste_dura（handler.c）：簡化：is_broken／indestructible 以耐久 <=0 推測 */
function wasteDura(o){
  if(!o)return;
  if(o.type==='ARMOR'&&(o.values[2]||0)<=0)return;          /* 推測 */
  if(o.type==='WEAPON'&&(o.values[0]||0)<=0)return;         /* 推測 */
  if(!o.extra.has('SPELL')&&R.bits(1)===1)return;
  if(o.extra.has('HUM')&&R.bits(2)!==1)return;
  if(o.type==='ARMOR')o.values[2]-=1;
  else if(o.type==='WEAPON')o.values[0]-=1;
}
/* disarm（fight.c）簡化版：體型、御劍術（swordmaster）、ACT_HARD_DIS、can_drop_obj 略過 */
function disarm(ch,v){
  if(!v.npc&&v.cls<4)return;
  let obj=R.getEq(v,16)||R.getEq(v,18)||R.getEq(v,19);
  if(!obj){R.send(ch,'你的目標並沒有裝備武器！\n');return;}
  if(ch.npc&&50>R.pct()){R.send(ch,'你無法擊落對手的武器。\n');return;}
  if(R.getEq(v,19)&&40>R.pct()){R.send(ch,'對方雙手緊握武器，你無法擊落對方的武器。\n');return;}
  if(v.npc&&R.hasSpecial(v,'NO_DISARM')){R.act('$N 高超的御劍術防止 $n 擊落$S武器！',ch,null,v,R.TO_NOTVICT);return;}
  if(obj.extra.has('NOREMOVE')){R.send(ch,'你無法擊落對方的武器。\n');return;}
  if(ch.npc&&!R.getEq(ch,16)&&!R.getEq(ch,18)&&!R.getEq(ch,19)){R.send(ch,'你必須先裝備武器。\n');return;}   /* 簡化：npc class 32(bloody) 略過 */
  R.act(C.HIY+'你擊落了 '+C.NOR+'$N'+C.HIY+' 的武器！'+C.NOR,ch,null,v,R.TO_CHAR);
  R.act('$n'+C.HIY+' 擊落了 '+C.NOR+'$N'+C.HIY+' 的武器！'+C.NOR,ch,null,v,R.TO_NOTVICT);
  R.act('$n'+C.HIY+' 擊落了你的武器 '+C.NOR+'$p'+C.HIY+' ！'+C.NOR,ch,obj,v,R.TO_VICT);
  R.unequipChar(v,obj);
  if(!v.npc&&!obj.extra.has('NODROP')){
    const i=v.carrying.indexOf(obj);if(i>=0)v.carrying.splice(i,1);
    obj.carried_by=null;R.objToRoom(obj,v.room);
  }
}
/* 聖光術額外減免（多個法術共用的判定段） */
function sanctBreak(v,type){
  if((v.aff.has('SANCTUARY')||raceHas(v,'SANCT'))&&R.pct()<(0-svs(v,type))){
    if(R.isAffected(v,R.gsn.sanctuary)&&R.pct()>T((0-svs(v,type))/2)){
      R.affectStrip(v,R.gsn.sanctuary);
      R.send(v,'你的聖光術被破壞了.\n');
    }
    return true;
  }
  return false;
}

/* ================= magic.c ================= */

/* ppl_spell_acid_blast */
function pplAcidBlast(sn,level,ch,v){
  let sklv=sl(ch,sn);
  let dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  if(!ch.npc&&sl(ch,sn)>0)dam=dam*(10+sl(ch,sn))/10;
  else if(ch.npc)dam*=1.4;
  if(sl(ch,sn)>2)dam*=1.08;
  if(sl(ch,sn)>3)dam*=1.08;
  if(sl(ch,sn)>4)dam*=1.08;
  if(sl(ch,sn)>5)dam*=1.08;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.EARTH)/100;
  dam=nr(dam*2.5,dam*3);
  if(dam>0){
    while(sklv-->0){
      for(let i=0;i<15;++i){
        const armor=R.getEq(v,R.rand(1,15));
        if(armor&&armor.type==='ARMOR'){wasteDura(armor);wasteDura(armor);wasteDura(armor);wasteDura(armor);break;}
      }
    }
  }
  R.magicDamage(ch,v,dam,sn);
}
R.SPELL.spell_acid_blast=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  if(!ch.npc){pplAcidBlast(sn,ch.level,ch,v);return;}
  let dam=T(R.dice(ch.level,10)*R.newSavesSpell(R.pp(ch),v,M.EARTH)/100);
  dam=T(dam*R.weaknessDamage(v,sn)/100);
  if(dam>0){
    for(let i=0;i<15;++i){
      const armor=R.getEq(v,R.rand(1,15));
      if(armor&&armor.type==='ARMOR'){for(let k=0;k<6;k++)wasteDura(armor);break;}
    }
  }
  R.magicDamage(ch,v,dam,sn);
};

/* cause 系列：無 stun 高燃費的純法術傷害 */
function causeBase(level,sklv){
  if(level>=1000){const o=T(level/1000);return {sklv:objSklv(o,TA),dam:T((40+o)/2)};}
  return {sklv,dam:T((40+level)/2)};
}
R.SPELL.spell_cause_light=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let {sklv,dam}=causeBase(level,sl(ch,sn));
  if(!ch.npc&&sklv>0)dam=dam*(20+sklv)/20;
  else if(ch.npc)dam=dam*1.1;
  dam=dam*R.wisEffect(ch);
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.SPELL)/100;
  if(!ch.npc)dam=nr(dam*1.5,dam*1.8);
  else dam=nr(dam,dam*1.2);
  R.magicDamage(ch,v,dam,sn);
};
R.SPELL.spell_cause_critical=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let {sklv,dam}=causeBase(level,sl(ch,sn));
  dam=dam*R.wisEffect(ch);
  if(!ch.npc&&sklv>0)dam=dam*(10+sklv)/10;
  else if(ch.npc)dam=dam*1.2;
  if(sklv>2)dam=dam*1.03;
  if(sklv>3)dam=dam*1.03;
  if(sklv>4)dam=dam*1.04;
  if(sklv>5)dam=dam*1.04;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.SPELL)/100;
  if(!ch.npc)dam=nr(dam*2.3,dam*2.4);
  else dam=nr(dam,dam*1.3);
  R.magicDamage(ch,v,dam,sn);
};
R.SPELL.spell_cause_serious=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let {sklv,dam}=causeBase(level,sl(ch,sn));
  dam=dam*R.wisEffect(ch);
  if(!ch.npc&&sklv>0)dam=dam*(9+sklv)/10;
  else if(ch.npc)dam=dam*1.1;
  if(sklv>2)dam=dam*1.02;
  if(sklv>3)dam=dam*1.02;
  if(sklv>4)dam=dam*1.03;
  if(sklv>5)dam=dam*1.03;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.SPELL)/100;
  if(!ch.npc)dam=nr(dam*1.9,dam*2.2);
  else dam=nr(dam,dam*1.2);
  R.magicDamage(ch,v,dam,sn);
};

R.SPELL.spell_earthquake=function(sn,level,ch,vo){
  let sklv=sl(ch,sn),chance=30,dam,objLv=level;
  if(sn===R.gsn.earthquake){
    R.send(ch,C.YEL+'你將力量送入大地，使附近的地面產生劇烈的震動！'+C.NOR+'\n');
    R.act('$n'+C.YEL+'催動魔力，一股震波自他腳下的地面往周圍擴散出去！'+C.NOR,ch,null,null,R.TO_ROOM);
  }
  if(sklv>5)ch.mana-=15;
  for(const vch of [...ch.room.people]){
    if(ch.deleted||!ch.room)break;
    if(ch===vch||vch.deleted||!vch.room)continue;
    if(wizInvis(vch))continue;
    if(isFlying(vch)&&!vch.aff.has('TARDY')&&sklv<5)continue;
    if(R.hasSpecial(vch,'ANTI_MAGIC')&&ch.cls!==R.WIZARD){
      R.act('你的魔法對$N起不了作用，看來他可能是魔法免疫.',ch,null,vch,R.TO_CHAR);
      continue;
    }
    if(vch.room===ch.room&&!sameGroup(ch,vch)){
      if(ch.npc){
        if(vch.fighting===ch||!vch.npc){
          dam=T((40+ch.level)/2);
          dam=dam*R.wisEffect(ch);
          dam=dam*(10+sklv)/10;
          if(sklv>2)dam=dam*1.03;
          if(sklv>3)dam=dam*1.03;
          if(sklv>4)dam=dam*1.03;
          if(sklv>5)dam=dam*1.03;
          dam=dam*R.newSavesSpell(R.pp(ch),vch,M.EARTH)/100;
          dam=nr(dam*1,dam*2);
          R.magicDamage(ch,vch,dam,sn);
        }
        continue;
      }else if((vch.fighting===ch&&!vch.npc)||(vch.npc&&!vch.aff.has('CHARM')&&!vch.aff.has('SUMMONED'))){
        dam=0;
        if(level>=1000){
          objLv=T(objLv/1000);   /* 原碼如此：obj_lv 在迴圈內重複 /1000 */
          sklv=objSklv(objLv,TB);
          dam=T((40+objLv)/2);
        }else dam=T((40+ch.level)/2);
        chance=30;
        dam=dam*R.wisEffect(ch);
        dam=dam*(10+sklv)/10;
        if(sklv>2)dam=dam*1.08;
        if(sklv>3)dam=dam*1.08;
        if(sklv>4)dam=dam*1.08;
        if(sklv>5)dam=dam*1.08;
        dam=dam*R.weaknessDamage(vch,sn)/100;
        dam=dam*R.newSavesSpell(R.pp(ch),vch,M.EARTH)/100;
        dam=nr(dam*2,dam*3);
        R.magicDamage(ch,vch,dam,sn);
        if(gone(vch)||ch.deleted)continue;

        chance=T(chance*R.wisEffect(ch));
        if(sklv>0)chance=T(chance*(10+sklv)/10);
        chance=T(chance*R.weaknessPercent(vch,sn)/100);
        chance=T(chance*R.newSavesSpell(R.pp(ch),vch,M.EARTH)/100);
        chance=Math.min(chance,50);

        /* 推測：原碼 IS_AFFECTED(vch, sn) 把 sn 當 bitvector 用，這裡改判 is_affected */
        if(R.isAffected(vch,sn)||R.hasSpecial(vch,'NO_PARA')||raceHas(vch,'NO_POISON')||R.pct()>chance||R.pct()>sp(ch,sn))
          continue;
        /* 簡化：check_qmark(vch,"earthquake_stun") 與加 qmark 略過（引擎無 qmark） */
        if(mystic(vch))continue;
        if(sklv>5){
          if(R.affectedValue(vch,sn,'DODGE')===0){   /* 原碼 !affected_value(...) > 0 */
            R.act('$N 突然動彈不得！',ch,null,vch,R.TO_CHAR);
            R.send(vch,'你全身一麻，突然動彈不得了！\n');
            R.act('$N 突然動彈不得！',ch,null,vch,R.TO_NOTVICT);
            waitMagic(vch,sklv*sklv*2);
          }
        }
      }
      continue;
    }
    if(vch.room&&ch.room&&vch.room.area===ch.room.area)
      R.send(vch,'你感到腳下的地面激烈地震動.\n');
  }
};

R.SPELL.spell_magic_missile=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let dam=0,times=0,Etimes=0,sklv=sl(ch,sn);
  if(level>=1000)sklv=objSklv(T(level/1000),TA);
  times=2;
  if(sklv>3)times=times+1;
  if(sklv>5)times=times+1;
  while(times){
    if(R.rand(1,5)<Etimes)return;
    if(ch.mana>20){ch.mana=ch.mana-20;Etimes+=1;}
    else return;
    dam=Math.min(ch.level,60);
    dam=nr(dam,dam*1.2);
    dam=T(dam+R.affectedValue(v,sn,'DODGE')*0.33);
    if(!ch.npc)dam=T(dam+R.pp(ch)*0.66);
    dam=T(dam*R.weaknessDamage(v,sn)*0.01);
    if(!mystic(v)){
      if(R.pct()<10+T(sklv*sklv/2)&&R.affectedValue(v,sn,'DODGE')<150){
        R.affectJoin(v,{type:sn,duration:1,bitvector:null,location:'DODGE',modifier:2});
        R.act(C.HIC+'你的魔法飛彈干擾著'+C.NOR+'$N'+C.HIC+'的行動。'+C.NOR,ch,null,v,R.TO_CHAR);
        R.act('$n'+C.HIC+'的魔法飛彈干擾著你的行動。'+C.NOR,ch,null,v,R.TO_VICT);
        R.act('$n'+C.HIC+'的魔法飛彈干擾著'+C.NOR+'$N'+C.HIC+'的行動。'+C.NOR,ch,null,v,R.TO_NOTVICT);
      }
    }
    if(!ch.npc&&!v.npc)dam*=R.rand(4,12);
    const chk=v.room;
    R.magicDamage(ch,v,dam,sn);   /* 原碼 magic__damage：不加 amdr，引擎統一走 magicDamage */
    if(gone(v)||v.room!==chk||v.room!==ch.room)return;
    times--;
  }
};

R.SPELL.spell_shocking_grasp=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let nSklv=sl(ch,sn),dam;
  if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.WIND)/100;
  if(!ch.npc)dam=nr(1+dam*nSklv*2/3,dam*(10+nSklv*4)/5);
  else dam=nr(1+dam*nSklv*4/5,dam*(48+nSklv*2)/8);
  if(isFlying(v))
    if(nSklv>0)dam=dam*(24+nSklv)/20;
  if(nSklv>2)dam=dam*1.05;
  if(nSklv>3)dam=dam*1.05;
  if(nSklv>4)dam=dam*1.05;
  if(nSklv>5)dam=dam*1.05;
  R.magicDamage(ch,v,dam,sn);
  if(gone(v)||ch.deleted||v.room!==ch.room)return;
  if(T((T(R.savesSpell(R.pp(ch),v)/2)+nSklv*2+wisDiff(ch,v))*R.weaknessPercent(v,sn)/97)>R.pct())
    disarm(ch,v);
};

R.SPELL.spell_whirlwind=function(sn,level,ch,vo){
  let nSklv=sl(ch,sn),dam,basic;
  if(sn===R.gsn.whirlwind){
    R.send(ch,C.HIG+'你舞動魔力，招來一股狂亂的風元素能量摧毀週遭一切敵人！\n'+C.NOR);
    R.act('$n '+C.HIG+'舞動魔力，招來一股狂亂的風元素能量摧毀週遭一切敵人！'+C.NOR,ch,null,null,R.TO_ROOM);
  }
  if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TB);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  basic=dam;
  for(const v of [...ch.room.people]){
    if(ch.deleted||!ch.room)break;
    if(v.deleted||v.room!==ch.room)continue;
    if(sameGroup(ch,v))continue;
    if(wizInvis(v))continue;
    if(R.hasSpecial(v,'ANTI_MAGIC')&&ch.cls!==R.WIZARD){
      R.act('你的魔法對$N起不了作用，看來他可能是魔法免疫.',ch,null,v,R.TO_CHAR);
      continue;
    }
    if(ch.npc){
      if(ch.aff.has('SUMMONED')||ch.master){
        if(v.fighting===ch.master||v.fighting===ch||(v.npc&&!v.aff.has('CHARM')&&!v.aff.has('SUMMONED'))){
          /* 簡化：IsSorGateMobWind（特定召喚風元素 vnum 只打戰鬥中的目標）略過，視為否 */
          dam=basic*R.weaknessDamage(v,sn)/100;
          dam=dam*R.newSavesSpell(R.pp(ch),v,M.WIND)/100;
          dam=nr(1,dam*(38+nSklv*2)/10);
          if(isFlying(v))dam=dam*(24+nSklv)/20;
          if(nSklv>2)dam=dam*1.08;
          if(nSklv>3)dam=dam*1.08;
          if(nSklv>4)dam=dam*1.08;
          if(nSklv>5)dam=dam*1.08;
          R.magicDamage(ch,v,dam,sn);
        }
      }else{
        if(v.fighting===ch||!v.npc){
          dam=basic*R.weaknessDamage(v,sn)/100;
          dam=dam*R.newSavesSpell(R.pp(ch),v,M.WIND)/100;
          dam=nr(1,dam*(38+nSklv*2)/10);
          if(isFlying(v))dam=dam*(24+nSklv)/20;
          if(nSklv>3)dam=dam*1.1;
          if(nSklv>4)dam=dam*1.1;
          if(nSklv>5)dam=dam*1.1;
          R.magicDamage(ch,v,dam,sn);
        }
      }
    }else if(v.fighting===ch||(v.npc&&!v.aff.has('CHARM')&&!v.aff.has('SUMMONED'))){
      dam=basic*R.weaknessDamage(v,sn)/100;
      dam=dam*R.newSavesSpell(R.pp(ch),v,M.WIND)/100;
      dam=nr(1+dam*nSklv*4/5,dam*(16+nSklv*4)/5);
      if(isFlying(v))dam=dam*(24+nSklv)/20;
      if(nSklv>3)dam=dam*1.1;
      if(nSklv>4)dam=dam*1.1;
      if(nSklv>5)dam=dam*1.1;
      R.magicDamage(ch,v,dam,sn);
    }
  }
};

/* ================= spell_flame.c ================= */

R.SPELL.spell_burning_hands=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let sklv=sl(ch,sn),dam;
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  if(sklv>0)dam=dam*(10+sklv)/10;
  if(sklv>2)dam*=1.08;
  if(sklv>3)dam*=1.08;
  if(sklv>4)dam*=1.08;
  if(sklv>5)dam*=1.08;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.FIRE)/100;
  if(!ch.npc)dam=nr(dam*2,dam*3.5);
  else dam=nr(dam*1,dam*1.75);
  R.magicDamage(ch,v,dam,sn);
  if(gone(v))return;
  const nBurnRate=R.weaknessPercent(v,sn)*(sklv*2+R.oldSavesSpell(T(R.pp(ch)/2),v,M.FIRE));
  if(!mystic(v)){
    if(nBurnRate>R.pct()*100){
      const nMaxSvfDecay=(sklv-4)*(sklv+4);
      if(sklv>4&&R.affectedValue(v,sn,'SAVING_FIRE')<nMaxSvfDecay){
        let duration=R.isAffected(v,sn)?0:2;
        if(isPK(ch,v))duration=T(duration/2);
        R.affectJoin(v,{type:sn,duration,bitvector:null,location:'SAVING_FIRE',modifier:(sklv-4)+(sklv-5)*2});
        R.act('$N'+C.HIR+'被火燄擊中，紫色的燄火瞬間纏繞在他的身上。'+C.NOR,ch,null,v,R.TO_CHAR);
        R.act(C.HIR+'黃色與紫色的焰火同時往你襲來！'+C.NOR,ch,null,v,R.TO_VICT);
        R.act('$N'+C.HIR+'被火燄擊中，紫色的燄火瞬間纏繞在他的身上。'+C.NOR,ch,null,v,R.TO_NOTVICT);
      }
    }
  }
};

R.SPELL.spell_fireball=function(sn,level,ch,vo){
  let victim=vo;const vch=vo;
  if(gone(victim))return;
  let time=0,sklv=sl(ch,sn),dam,objLv=level;
  if(level>=1000){objLv=T(objLv/1000);sklv=objSklv(objLv,TA);dam=T((40+objLv)/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  if(sklv>0)dam=dam*(10+sklv)/10;
  if(sklv>2)dam=dam*1.08;
  if(sklv>3)dam=dam*1.08;
  if(sklv>4)dam=dam*1.08;
  if(sklv>5)dam=dam*1.08;
  dam=dam*R.weaknessDamage(victim,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),victim,M.FIRE)/100;
  if(!ch.npc)dam=nr(dam*3,dam*4.5);
  else dam=nr(dam*1.5,dam*2.25);
  R.magicDamage(ch,victim,dam,sn);
  if(ch.deleted||!ch.room)return;

  const list=[...ch.room.people];
  for(let i=0;i<list.length&&time<=sklv;i++,time++){
    victim=list[i];
    if(victim.deleted||victim.room!==ch.room)continue;
    if(victim.fighting!==ch)continue;
    if(wizInvis(victim))continue;
    if(R.hasSpecial(victim,'ANTI_MAGIC')&&ch.cls!==R.WIZARD){
      R.act('你的魔法對$N起不了作用，看來他可能是魔法免疫.',ch,null,victim,R.TO_CHAR);
      continue;
    }
    if(victim===vch)continue;
    if(level>=1000){
      objLv=T(objLv/1000);   /* 原碼如此：obj_lv 再次 /1000 */
      sklv=objSklv(objLv,TA);
      dam=T((40+objLv)/2);
    }else dam=T((40+level)/2);
    dam=dam*R.intEffect(ch);
    if(sklv>0)dam=dam*(10+sklv)/10;
    if(sklv>2)dam=dam*1.08;
    if(sklv>3)dam=dam*1.08;
    if(sklv>4)dam=dam*1.08;
    if(sklv>5)dam=dam*1.08;
    dam=dam*R.weaknessDamage(victim,sn)/100;
    dam=dam*R.newSavesSpell(R.pp(ch),victim,M.FIRE)/100;
    if(!ch.npc)dam=nr(dam*1.5,dam*2);
    else dam=nr(dam*0.75,dam*1.5);
    R.magicDamage(ch,victim,dam,sn);
    if(ch.deleted||!ch.room)break;
  }
};

/* ================= spell_ice.c ================= */

const sky=()=>R.weather?R.weather.sky:0;
const SKY_RAINING=2,SKY_SNOWING=4,SKY_SNOWSTORM=5;

R.SPELL.spell_chill_touch=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let sklv=sl(ch,sn),dam;
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  if(sky()===SKY_SNOWING)dam=dam*1.05;
  if(sky()===SKY_SNOWSTORM)dam=dam*1.1;
  if(sklv>0)dam=dam*(10+sklv)/10;
  if(sklv>2)dam*=1.08;
  if(sklv>3)dam*=1.08;
  if(sklv>4)dam*=1.08;
  if(sklv>5)dam*=1.08;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.COLD)/100;
  if(!ch.npc)dam=nr(dam*2,dam*3);
  else dam=nr(dam*1,dam*1.5);
  R.magicDamage(ch,v,dam,sn);
  if(gone(v))return;
  if(!mystic(v)){
    if(sklv+R.oldSavesSpell(T(R.pp(ch)/2),v,M.COLD)>T(R.pct()*100/R.weaknessPercent(v,sn))){
      /* 簡化：get_damroll(victim, WEAR_WIELD) 以 victim.damroll 代替 */
      const ChillDR=T(((v.damroll||0)-R.affectedValue(v,sn,'DAMROLL'))/(16-sklv));
      if((ChillDR+R.affectedValue(v,sn,'DAMROLL'))>0){
        const duration=R.affectedValue(v,sn,'DAMROLL')<0?0:3;
        R.affectJoin(v,{type:sn,duration,bitvector:null,location:'DAMROLL',modifier:T(-ChillDR/2)});
        R.act(C.HIC+'白色的薄霜覆蓋住'+C.NOR+'$N'+C.HIC+'的每吋皮膚，令他的身體不斷顫抖。'+C.NOR,ch,null,v,R.TO_CHAR);
        R.act(C.HIC+'凍氣彷彿刺穿了你的皮肉，刺骨的寒意直衝腦門！'+C.NOR,ch,null,v,R.TO_VICT);
        R.act(C.HIC+'白色的薄霜覆蓋住'+C.NOR+'$N'+C.HIC+'的每吋皮膚，令他的身體不斷顫抖。'+C.NOR,ch,null,v,R.TO_NOTVICT);
      }
      if(sklv>4&&R.affectedValue(v,sn,'ADAMAGE')>0-(sklv-4)*25){
        const duration=R.affectedValue(v,sn,'ADAMAGE')<0?0:3;
        /* 簡化：APPLY_ADAMAGE 引擎目前無效果 */
        R.affectJoin(v,{type:sn,duration,bitvector:null,location:'ADAMAGE',modifier:-((sklv-4)*25)});
      }
    }
  }
};

R.SPELL.spell_colour_spray=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let sklv=sl(ch,sn),dam;
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  if(sky()===SKY_SNOWING)dam=dam*1.05;
  if(sky()===SKY_SNOWSTORM)dam=dam*1.1;
  if(sklv>0)dam=dam*(10+sklv)/10;
  if(sklv>2)dam=dam*1.08;
  if(sklv>3)dam=dam*1.08;
  if(sklv>4)dam=dam*1.08;
  if(sklv>5)dam=dam*1.08;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.COLD)/100;
  if(!ch.npc)dam=nr(dam*4,dam*4.5);
  else dam=nr(dam*1.5,dam*2.5);
  R.magicDamage(ch,v,dam,sn);
};

/* ================= spell_lightning.c ================= */

/* thunder strike */
R.SPELL.spell_electrostatic_bolt=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let sklv=sl(ch,sn),times=0+T(sklv/2),dam,exDam;
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);times=0+T(sklv/2);}
  else dam=T((40+level)/2);
  if(sklv>4)times+=1;
  dam=dam*R.intEffect(ch);
  if(ch.npc)dam+=ch.level*2;
  if(!ch.npc)dam=nr(dam*2.3,dam*2.5);
  else dam=nr(dam*1.8,dam*2);
  exDam=amdr(ch)-0.45*Math.max(amdr(ch)-40-sklv*5,0)-0.45*Math.max(amdr(ch)-50-sklv*5,0);
  dam+=exDam*1.2;
  dam*=1+0.15*sklv;
  if(sklv>2)dam=dam*1.03;
  if(sklv>3)dam=dam*1.03;
  if(sklv>4)dam=dam*1.02;
  if(sklv>5)dam=dam*1.02;
  let nSvT=svs(v,M.LIGHTNING);
  if(nSvT>=0)nSvT=Math.max(nSvT+T(R.pp(ch)/(13-sklv)),nSvT);
  else if(R.pp(ch)>0)nSvT=Math.min(nSvT+T(R.pp(ch)/(12-sklv)),0);
  if(nSvT>0)dam=dam*(60+nSvT)/60;
  else dam=dam*60/(60-nSvT);
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam-=mdr(v);
  dam=dam*R.oldSavesSpell(R.pp(ch),v,M.LIGHTNING)/100;

  const ppDebuff=(useNew,minSk,col)=>{
    if(mystic(v))return;
    const sv=useNew?R.newSavesSpell(R.pp(ch),v,M.LIGHTNING):R.oldSavesSpell(R.pp(ch),v,M.LIGHTNING);
    if(sklv*2+sv>T(R.pct()*100/R.weaknessPercent(v,sn))&&dam>0){
      if(sklv>=minSk&&R.affectedValue(v,sn,'POWER_POTENTIAL')>-sklv*2){
        const duration=R.affectedValue(v,sn,'POWER_POTENTIAL')<0?0:3;
        R.affectJoin(v,{type:sn,duration,bitvector:null,location:'POWER_POTENTIAL',modifier:-1-T(sklv/2)});
        R.act(C.HIW+'被雷光擊中的剎那，'+C.NOR+'$N'+col+'的眼神失去了焦點。'+C.NOR,ch,null,v,R.TO_CHAR);
        R.act(C.HIW+'閃電直擊你的腦門，一股難以言喻的暈眩感瞬間襲來！'+C.NOR,ch,null,v,R.TO_VICT);
        R.act(C.HIW+'被雷光擊中的剎那，'+C.NOR+'$N'+col+'的眼神失去了焦點。'+C.NOR,ch,null,v,R.TO_NOTVICT);
      }
    }
  };
  R.magicDamage(ch,v,dam,sn);
  if(!gone(v))ppDebuff(false,4,C.HIW);
  while(times-->0&&!gone(v)&&!ch.deleted&&v.room===ch.room){
    if(R.pct()>66-sklv*5){
      if(ch.mana>20)ch.mana-=20;
      else break;
      R.magicDamage(ch,v,dam,sn);
      if(!gone(v))ppDebuff(true,5,C.HIP);   /* 原碼第二段 sklv > 4、顏色 HIP */
    }
  }
};

R.SPELL.spell_lightning_bolt=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let sklv=sl(ch,sn),times=0+T(sklv/2)+T(sklv/3),dam,exMd;
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);times=0+T(sklv/2);}
  else dam=T((40+level)/2);
  dam=dam*R.intEffect(ch);
  if(ch.npc)dam+=ch.level*2;
  if(!ch.npc)dam=nr(dam*2.8,dam*3);
  else dam=nr(dam*2.1,dam*2.3);
  exMd=amdr(ch)-0.4*Math.max(amdr(ch)-50-sklv*5,0)-0.4*Math.max(amdr(ch)-80-sklv*5,0);
  dam+=exMd*1.5;
  dam*=1+0.15*sklv;
  if(sklv>2)dam=dam*1.045;
  if(sklv>3)dam=dam*1.045;
  if(sklv>4)dam=dam*1.035;
  if(sklv>5)dam=dam*1.035;
  if(dam<0)dam=0;
  let nSvT=svs(v,M.LIGHTNING);
  if(nSvT>=0)nSvT=Math.max(nSvT+T(R.pp(ch)/(11-sklv)),nSvT);
  else if(R.pp(ch)>0)nSvT=Math.min(nSvT+T(R.pp(ch)/(10-sklv)),0);
  if(nSvT>0)dam=dam*(60+T(nSvT/2))/60;
  else dam=dam*60/(60-nSvT);
  dam*=R.weaknessDamage(v,sn)*0.01;
  dam-=mdr(v);
  dam*=R.oldSavesSpell(R.pp(ch),v,M.LIGHTNING)*0.01;

  const chk=v.room;
  R.magicDamage(ch,v,dam,sn);
  if(sklv>4){
    if(!gone(v))R.magicDamage(ch,v,dam,sn);
    times-=1;
  }
  while(times-->0&&!gone(v)&&!ch.deleted&&v.room===ch.room&&v.room===chk){
    if(R.pct()>66-sklv*5){
      if(ch.mana>40)ch.mana-=40;
      else break;
      R.magicDamage(ch,v,dam,sn);
    }
  }
};

/* ================= spell_light.c ================= */

R.SPELL.spell_dispel_evil=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let sklv=sl(ch,sn),dam;
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  let aliDiff=0;
  if(v)aliDiff=ch.alignment-v.alignment;
  if(!ch.npc&&R.isEvil(ch)){R.send(ch,'你的心靈無法凝聚神聖的力量.\n');return;}
  if(!ch.npc&&R.isNeutral(ch))dam/=3;
  if(R.isGood(v)){
    R.act('一股神聖的力量籠罩了 $N.',ch,null,v,R.TO_ROOM);
    R.act('$N 看來完全不受影響.',ch,null,v,R.TO_CHAR);
    return;
  }
  dam=dam*R.wisEffect(ch);
  if(raceHas(ch,'DETECT_ALIGN'))dam*=1+sl(ch,R.gsn.inborn_ability)*0.08;
  if(sklv>0)dam=dam*(10+sklv)/10;
  if(sklv>2)dam*=1.08;
  if(sklv>3)dam*=1.08;
  if(sklv>4)dam*=1.08;
  if(sklv>5)dam*=1.08;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.oldSavesSpell(R.pp(ch),v,M.SAINT)/60;
  if(!ch.npc)dam=nr(dam*2.5,dam*3.5);
  else dam=nr(dam*1,dam*2);
  dam+=T(aliDiff/10);
  R.magicDamage(ch,v,dam,sn);
};

const BISHOP=8;
const isUndead=v=>raceHas(v,'UNDEAD')||raceHas(v,'VAMPIRE')||v.aff.has('GHOUL')||R.isAffected(v,R.gsn.stone_form);

R.SPELL.spell_turn_undead=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let aliDiff=0,nSklv=sl(ch,sn),nChance=0,dam;
  const nCereSklv=sl(ch,R.gsn.burial_ceremony),nTurnSklv=sl(ch,R.gsn.turn_undead),nMassSklv=sl(ch,R.skillLookup('mass turn'));
  if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  if(v)aliDiff=ch.alignment-v.alignment;
  if(!ch.npc&&R.isEvil(ch)){R.send(ch,'你的心靈無法凝聚神聖的力量.\n');return;}
  if(!ch.npc&&R.isNeutral(ch))dam=dam/3;
  if(!ch.npc&&ch.cls===BISHOP)dam=Math.max(dam*R.intEffect(ch),dam*R.wisEffect(ch));
  else dam=dam*R.wisEffect(ch);
  if(raceHas(ch,'DETECT_ALIGN'))dam*=1+sl(ch,R.gsn.inborn_ability)*0.08;
  if(nSklv>0)dam=dam*(10+T(nSklv*(nSklv+4)/3))/10;
  if(nSklv>2)dam=dam*1.08;
  if(nSklv>3)dam=dam*1.08;
  if(nSklv>4)dam=dam*1.08;
  if(nSklv>5)dam=dam*1.08;
  dam=dam*(18+nCereSklv*2+nTurnSklv*2+nMassSklv*2)/18;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.SAINT)/100;
  if(!ch.npc)dam=nr(dam*2.25,dam*3.25);
  else dam=nr(dam*1.25,dam*1.75);
  dam+=T(aliDiff/10);

  if(isUndead(v)){
    if(!mystic(v)){
      nChance=nSklv*2+R.oldSavesSpell(R.pp(ch),v,M.SAINT);
      nChance=T(nChance*R.weaknessPercent(v,sn)/100);
      if(sanctBreak(v,M.SAINT))nChance=nChance+svs(v,M.SAINT)-svs(ch,M.SAINT);
      if(nChance>R.pct()){
        if(R.affectedValue(v,sn,'SAVING_SAINT')<nSklv*nSklv+nSklv*2+2){
          R.affectJoin(v,{type:sn,duration:2,bitvector:null,location:'SAVING_SAINT',modifier:T((nSklv*nSklv+nSklv*2+2)/5)});
          R.act(C.HIW+'你的神聖力量讓'+C.NOR+'$N'+C.HIW+'的邪惡氣息持續地削弱！'+C.NOR,ch,null,v,R.TO_CHAR);
          R.act('$n'+C.HIW+'的神聖力量讓你身上的邪惡氣息漸漸消散！'+C.NOR,ch,null,v,R.TO_VICT);
          R.act('$n'+C.HIW+'的神聖力量讓'+C.NOR+'$N'+C.HIW+'的邪惡氣息持續地削弱！'+C.NOR,ch,null,v,R.TO_NOTVICT);
        }
      }
    }
    const nRaceSklv=sl(v,R.gsn.inborn_ability);
    dam=T(dam*(100-T(nRaceSklv*(nRaceSklv+4)*2/3))/100);
    R.magicDamage(ch,v,dam,sn);   /* 原碼 magic__damage */
  }else{
    R.send(ch,'你只能超渡不死系生物.\n');
  }
};

/* sun flash（sun slash、virtual swords 也共用這支） */
R.SPELL.spell_sun_flash=function(sn,level,ch,vo){
  const G=R.gsn,sunFlash=G.sun_flash,isSlash=sn===G.sun_slash,isVS=sn===G.virtual_swords;
  let dam,nSklv=sl(ch,sn),nDmgRate=100,nWillFort=0,nChance=0;
  if(isSlash)nSklv=sl(ch,sunFlash);
  if(!ch.npc&&!isVS){
    if(R.isEvil(ch)||R.isNeutral(ch)){R.send(ch,'你的心靈無法凝聚神聖的力量.\n');return;}
  }
  if(ch.room.flags.has('SAFE')){R.send(ch,'這裡禁止戰鬥. \n');return;}
  if(ch.room.flags.has('INDOORS')&&!ch.npc&&!isVS){   /* !IS_OUTSIDE */
    if(R.pct()>40+(nSklv*nSklv+4))nDmgRate=75;
  }
  if(sky()>=SKY_RAINING&&!ch.npc&&!isVS){
    if(sky()!==SKY_RAINING||nSklv<6)nDmgRate=T(nDmgRate/2);
  }
  R.send(ch,'你藉著法力增幅陽光的亮度！\n');
  R.act('$n 雙手高舉大聲一喝，四周的光線突然耀眼得張不開眼睛！',ch,null,null,R.TO_ROOM);

  for(const vch of [...ch.room.people]){
    if(ch.deleted||!ch.room)break;
    if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TA);dam=T((40+o)/2);}
    else dam=T((40+level)/2);
    if(vch===ch||vch.deleted||vch.position===P.DEAD||vch.room!==ch.room)continue;
    if(wizInvis(vch))continue;
    if(R.hasSpecial(vch,'ANTI_MAGIC')&&ch.cls!==R.WIZARD){
      R.act('你的魔法對$N起不了作用，看來他可能是魔法免疫.',ch,null,vch,R.TO_CHAR);
      continue;
    }
    if(!vch.npc&&R.isAffected(vch,G.invoke)&&sl(vch,G.invoke)>3)continue;

    if(!sameGroup(ch,vch)&&((ch.npc&&(vch.fighting===ch||!vch.npc))||(!ch.npc&&(vch.fighting===ch||(vch.npc&&!vch.aff.has('CHARM')&&!vch.aff.has('SUMMONED')))))){
      if(R.affectedValue(vch,R.skillLookup('day of brightness'),'DOB_SAVING_FLASH')>R.pct()){
        R.send(vch,C.HIW+'水神的力量張出一面光鏡，守護你的視覺不受這波光爆的侵襲！'+C.NOR+'\n');
        continue;
      }
      nChance=R.newSavesSpell(R.pp(ch),vch,M.SAINT)+wisDiff(ch,vch)+nSklv*3;
      nChance=T(nChance*R.weaknessPercent(vch,sn)/100);
      if(sanctBreak(vch,M.SAINT))nChance=nChance+svs(vch,M.SAINT)-svs(ch,M.SAINT);

      if(nChance>(R.pct()+2)){
        dam=T(dam*R.wisEffect(ch));
        if(raceHas(ch,'DETECT_ALIGN'))dam=T(dam*(1+sl(ch,G.inborn_ability)*0.08));
        if(nSklv>0)dam=T(dam*(10+nSklv)/10);
        if(nSklv>2)dam=T(dam*1.08);
        if(nSklv>3)dam=T(dam*1.08);
        if(nSklv>4)dam=T(dam*1.08);
        if(nSklv>5)dam=T(dam*1.08);
        if(!ch.npc)dam=nr(dam*3,dam*4);
        else dam=nr(dam*2,dam*3);
        dam=T(dam*R.weaknessDamage(vch,sunFlash)/100);
        dam=T(dam*R.newSavesSpell(R.pp(ch),vch,M.SAINT)/100);
        dam=T(dam*nDmgRate/100);
        R.magicDamage(ch,vch,dam-mdr(vch),sunFlash);   /* 原碼 magic__damage */
        if(gone(vch)||ch.deleted)continue;

        if(vch.aff.has('BLIND')||R.hasSpecial(vch,'NO_BLIND')||R.pct()>T(nDmgRate*(10+nSklv)/20))
          continue;
        if(isSlash&&R.pct()>sl(ch,G.sun_slash)*10)continue;
        if(mystic(vch))continue;

        nWillFort=0;   /* 簡化：GetWillFortressEffect（意志堡壘）未移植，視為 0 */
        if(!isVS||R.pct()<50+nSklv*12-R.stat(vch,2)+nWillFort){
          let duration=1+T(nSklv/2);
          if(isSlash)duration=T(duration/2);
          R.affectToChar(vch,{type:sunFlash,duration,location:'HITROLL',modifier:-12-nSklv*4,bitvector:'BLIND'});
          R.act('$N '+C.HIG+'突然失去了視力!'+C.NOR,ch,null,vch,R.TO_CHAR);
          R.send(vch,'你的眼前一亮，世界都變黑了！\n');
          R.act('$N '+C.HIG+'突然失去了視力!'+C.NOR,ch,null,vch,R.TO_NOTVICT);
        }else if(isVS&&nWillFort<0){
          R.send(vch,C.HIC+'心靈的障壁使你免於受到幻術視覺的傷害'+C.NOR+'\n');
        }
      }else{
        R.magicDamage(ch,vch,0,sunFlash);
      }
    }
  }
};

R.SPELL.spell_flamestrike=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let dam,sklv=sl(ch,sn);
  if(level>=1000){const o=T(level/1000);sklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  if(sn===R.gsn.flaming_armor){
    /* 簡化：spell_flaming_armor_strike 屬其他檔案；有註冊才呼叫 */
    if(R.SPELL.spell_flaming_armor_strike)R.SPELL.spell_flaming_armor_strike(sn,level,ch,vo);
    return;
  }
  if(!ch.npc&&R.isEvil(ch)){R.send(ch,'你的心靈無法凝聚神聖的力量.\n');return;}
  dam=T(dam*R.wisEffect(ch));
  if(raceHas(ch,'DETECT_ALIGN'))dam=T(dam*(1+sl(ch,R.gsn.inborn_ability)*0.08));
  if(sklv>0)dam=T(dam*(10+sklv)/10);
  if(sklv>2)dam=T(dam*1.08);
  if(sklv>3)dam=T(dam*1.08);
  if(sklv>4)dam=T(dam*1.08);
  if(sklv>5)dam=T(dam*1.08);
  dam=T(dam*R.weaknessDamage(v,sn)/100);
  dam=T(dam*R.newSavesSpell(R.pp(ch),v,M.SAINT)/100);
  dam=dam-T(dam*(v.alignment-Math.min(2*amdr(ch),1000))/2000);
  if(!ch.npc)dam=nr(dam*2,dam*2.8);
  else dam=nr(dam,dam*1.2);
  R.magicDamage(ch,v,dam,sn);
};

/* ================= spell_dark.c ================= */

R.SPELL.spell_dark_containment=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let aliDiff=0,nSklv=sl(ch,sn),dam,nChance=0;
  if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  if(v)aliDiff=v.alignment-ch.alignment;
  if(!ch.npc&&R.isGood(ch)){R.send(ch,'你的心靈無法凝聚邪惡的力量.\n');return;}
  if(!ch.npc&&R.isNeutral(ch))dam=dam/2;
  dam=dam*R.wisEffect(ch);
  if(raceHas(ch,'DETECT_ALIGN'))dam*=1+sl(ch,R.gsn.inborn_ability)*0.08;
  if(nSklv>0)dam=dam*(12+T(nSklv*(nSklv+4)/3))/10;
  if(nSklv>2)dam=dam*1.08;
  if(nSklv>3)dam=dam*1.08;
  if(nSklv>4)dam=dam*1.08;
  if(nSklv>5)dam=dam*1.08;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.DARK)/100;
  if(!ch.npc)dam=nr(dam*2.1,dam*2.3);
  else dam=nr(dam*1.25,dam*1.75);
  dam+=T(aliDiff/10);

  if(!mystic(v)){
    nChance=5+T(aliDiff/100);
    nChance=nChance+svs(v,M.DARK)-svs(ch,M.DARK);
    nChance=T((nChance*(36+nSklv*nSklv))/36);
    if(raceHas(ch,'DETECT_ALIGN')){const ib=sl(ch,R.gsn.inborn_ability);nChance=T((nChance*(120+ib*ib))/120);}
    if(isUndead(v))nChance=T(nChance/3);
    nChance=T(nChance*R.weaknessPercent(v,sn)/100);
    if(sanctBreak(v,M.DARK))nChance=T(nChance/2);
    if(nChance>R.pct()&&!R.isAffected(v,R.gsn.dark_containment)){
      R.affectToChar(v,{type:sn,duration:1,bitvector:'CURSE',location:'SAVING_DARK',modifier:1+nSklv*4});
      R.act(C.HIB+'你的邪氣化為枷鎖朝著'+C.NOR+'$N'+C.HIB+'的身體攀附而上。'+C.NOR,ch,null,v,R.TO_CHAR);
      R.act(C.HIB+'一條條的邪氣枷鎖逐漸勒緊你的身驅。'+C.NOR,ch,null,v,R.TO_VICT);
      R.act('$n'+C.HIB+'的邪氣化為枷鎖朝著'+C.NOR+'$N'+C.HIB+'的身體攀附而上。'+C.NOR,ch,null,v,R.TO_NOTVICT);
    }
  }
  R.magicDamage(ch,v,dam,sn);
};

R.SPELL.spell_harm=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let nSklv=sl(ch,sn),dam;
  if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  if(!ch.npc&&R.isGood(ch)){R.send(ch,'你的心靈無法凝聚邪惡的力量.\n');return;}
  dam=dam*R.wisEffect(ch);
  if(raceHas(ch,'DETECT_ALIGN'))dam*=1+sl(ch,R.gsn.inborn_ability)*0.08;
  if(nSklv>0)dam=dam*(10+nSklv)/10;
  if(nSklv>2)dam=dam*1.08;
  if(nSklv>3)dam=dam*1.08;
  if(nSklv>4)dam=dam*1.08;
  if(nSklv>5)dam=dam*1.09;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.DARK)/100;
  dam=dam+dam*(v.alignment+Math.min(2*amdr(ch),1000))/2000;
  if(!ch.npc)dam=nr(dam*2.2,dam*3.2);
  else dam=nr(dam,dam*1.5);
  R.magicDamage(ch,v,dam,sn);
};

R.SPELL.spell_lifesteal=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let nSklv=sl(ch,sn),dam;
  const isNeu=!ch.npc&&R.isNeutral(ch);
  if(level>=1000){const o=T(level/1000);nSklv=objSklv(o,TA);dam=T((40+o)/2);}
  else dam=T((40+level)/2);
  if(!ch.npc&&R.isGood(ch)){R.send(ch,'你的心靈無法凝聚邪惡的力量.\n');return;}
  dam=dam*R.wisEffect(ch);
  if(raceHas(ch,'DETECT_ALIGN'))dam*=1+sl(ch,R.gsn.inborn_ability)*0.08;
  if(nSklv>0)dam=dam*(10+nSklv)/10;
  if(nSklv>2)dam=dam*1.08;
  if(nSklv>3)dam=dam*1.07;
  if(nSklv>4)dam=dam*1.06;
  if(nSklv>5)dam=dam*1.05;
  dam=dam*R.weaknessDamage(v,sn)/100;
  dam=dam*R.newSavesSpell(R.pp(ch),v,M.DARK)/100;
  if(!ch.npc)dam=nr(dam*3.5,dam*4.5);
  else dam=nr(dam*1.5,dam*2.5);
  if(v.hit<0)dam=R.urange(0,dam,v.hit);
  /* 傷害後 v 可能已死，先記下聖光術判定所需的狀態 */
  const vSanct=(v.aff.has('SANCTUARY')||raceHas(v,'SANCT'))&&svs(ch,M.DARK)>svs(v,M.DARK);
  R.magicDamage(ch,v,dam,sn);
  if(ch.deleted)return;
  if(ch.aff.has('NO_HEAL'))return;
  if(dam<0){
    R.send(ch,'他的生氣凝而不散，你的生命反而被牽引出去！\n');
    ch.hit+=dam;
  }else{
    if(vSanct)dam=(dam*2)/3;
    if(!isNeu)ch.hit=T(ch.hit+dam*(1+nSklv*nSklv)/74);
    else ch.hit=T(ch.hit+dam*(1+nSklv*nSklv)/50);
  }
  ch.hit=Math.min(ch.hit,ch.max_hit+T(ch.max_hit/4));
};

/* Drain XP, MANA, HP. Caster gains HP, XP. */
R.SPELL.spell_energy_drain=function(sn,level,ch,vo){
  const v=vo;if(gone(v))return;
  let nDamage,nHpDmg,nMpDmg,nMvDmg,nSklv=sl(ch,sn);
  if(level>=1000)nSklv=objSklv(T(level/1000),TA);
  if(R.savesSpell(R.pp(ch),v)<T(R.pct()*100/R.weaknessPercent(v,sn))){
    R.send(ch,'什麼也沒發生。\n');
    return;
  }
  ch.alignment=Math.max(-1000,ch.alignment-8);
  if(v.level<=10){
    nHpDmg=ch.hit+1;
  }else{
    nDamage=R.dice(5+T(nSklv/3),T(ch.level*(100+nSklv*(nSklv+4))/100));
    nDamage=T(nDamage*R.newSavesSpell(R.pp(ch),v,M.DARK)/100);
    nDamage=T(nDamage*R.weaknessDamage(v,sn)/100);
    if(nSklv>2)nDamage=T(nDamage*1.08);
    if(nSklv>3)nDamage=T(nDamage*1.08);
    if(nSklv>4)nDamage=T(nDamage*1.08);
    if(nSklv>5)nDamage=T(nDamage*1.08);
    if(raceHas(v,'UNDEAD')||v.aff.has('GHOUL'))nDamage=T(nDamage/3)-v.level*3;
    if(raceHas(ch,'DETECT_ALIGN'))nDamage=nDamage*(1+T(sl(ch,R.gsn.inborn_ability)/20));

    const con=R.stat(v,4),wis=R.stat(v,2),dex=R.stat(v,3),cInt=R.stat(ch,1);
    nHpDmg=T(nDamage*(40-con)/20);
    nMpDmg=T((nDamage+amdr(ch))*(40-wis)/20);
    nMvDmg=T((nDamage+amdr(ch))*(40-dex)/20);
    nMpDmg=T(nMpDmg*R.rand(5,8+nSklv*2)/100);
    nMvDmg=T(nMvDmg*R.rand(10,22+nSklv*3)/100);
    nMpDmg-=mdr(v);
    nMvDmg-=mdr(v);
    if(isPK(ch,v)){nMpDmg=T(nMpDmg/PK_DMG_DENOMINATOR);nMvDmg=T(nMvDmg/PK_DMG_DENOMINATOR);}
    if(!mystic(v)){
      if(nMpDmg<0){
        if(R.pct()<wis+R.pp(v)){
          nMpDmg=T(nMpDmg*R.newSavesSpell(R.pp(v),ch,M.DARK)/80);
          ch.mana+=nMpDmg;
          v.mana=Math.min(v.mana-nMpDmg,T(v.max_mana*11/10));
          R.send(ch,'魔力反噬！\n');
          R.send(v,'你因魔力反噬從對手那裡獲得一些魔力補充！\n');
        }
      }else if(R.pct()<nSklv*5+cInt-wis){
        if(nMpDmg>v.mana)nMpDmg=v.mana;
        v.mana-=nMpDmg;
        if(R.pct()<cInt+T(R.pp(ch)/2)){
          ch.mana+=T(nMpDmg*(nSklv+10)/10);
          ch.mana=Math.min(ch.mana,T(ch.max_mana*11/10));
          R.send(ch,'你從對手那裡獲得一些魔力補充。\n');
        }
        R.send(v,'你的法力向外流失！\n');
      }
      if(nMvDmg<0){
        if(R.pct()<dex+R.pp(v)){
          nMvDmg=T(nMvDmg*R.newSavesSpell(R.pp(v),ch,M.DARK)/80);
          ch.move+=nMvDmg;
          v.move=Math.min(v.move-nMvDmg,T(v.max_move*11/10));
          R.send(ch,'體力反噬！\n');
          R.send(v,'你因體力反噬從對手那裡獲得一些體力補充！\n');
        }
      }else if(R.pct()<nSklv*5+cInt-dex){
        if(nMvDmg>v.move)nMvDmg=v.move;
        v.move-=nMvDmg;
        if(R.pct()<cInt+T(R.pp(ch)/2)){
          ch.move+=T(nMvDmg*(nSklv+10)/10);
          ch.move=Math.min(ch.move,T(ch.max_move*11/10));
          R.send(ch,'你從對手那裡獲得一些體力補充。\n');
        }
        R.send(v,'你的體力向外流失！\n');
      }
      if(nHpDmg>0&&R.pct()<nSklv*5+cInt-con*2&&!ch.aff.has('NO_HEAL')){
        if(!ch.npc&&!v.npc)ch.hit+=T(nHpDmg*(nSklv+10)/100);
        else ch.hit+=T(nHpDmg*(nSklv+10)/30);
        R.send(ch,'你從對手那裡獲得一些生命力補充。\n');
        ch.hit=Math.min(ch.hit,ch.max_hit*2);
      }
    }
  }
  R.magicDamage(ch,v,nHpDmg,sn);
  /* 簡化：align_effect(ch)（陣營變動後的裝備排斥）未移植 */
};

})(ROC);
