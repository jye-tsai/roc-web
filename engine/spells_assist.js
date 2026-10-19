/* spells_assist.js — 輔助法術（spell_assist.c） */
(function(R){
const C=R.C,P=R.POS,W=R.world,SK=R.SK,M=R.MAGIC;

/* ---------- 本地小工具 ---------- */
const I=x=>Math.trunc(x);   /* C 整數除法 */
/* 物品等級（level>=1000）換算 sklv，C 各法術共用的那段 */
const objSklv=lv=>lv>=60?6:lv>=50?5:lv>=40?4:lv>=30?3:lv>=20?2:lv>=10?1:0;
/* pcdata->prime_attr：推測取 pc.prime_attr，否則用職業表的 prime */
function primeAttr(ch){
  if(ch.npc)return '';
  if(ch.pc&&ch.pc.prime_attr)return String(ch.pc.prime_attr).replace(/^APPLY_/,'');
  const k=R.CONST&&R.CONST.classes&&R.CONST.classes[ch.cls];
  return k&&k.prime?String(k.prime).replace(/^APPLY_/,''):'';
}
/* is_same_group：引擎沒有 group 欄位，用 leader 串（推測） */
function sameGroup(a,b){
  if(R.isSameGroup)return R.isSameGroup(a,b);
  if(!a||!b||a.deleted||b.deleted)return false;
  const la=a.leader||a,lb=b.leader||b;
  if(!a.npc&&!b.npc&&Math.abs(a.level-b.level)>5)return false;
  return la===lb;
}
/* WAIT_MAGIC_STATE（handler.c） */
function waitMagic(ch,delay){
  const nPerc=R.getSkillPercent(ch,R.gsn.spellcraft);
  if(nPerc>0){
    const nSklv=R.getSkillLevel(ch,R.gsn.spellcraft);
    delay-=I(delay*(nSklv+1)*(nSklv+4)*nPerc/10000);
    if(nSklv>5)delay--;
    delay=Math.max(0,delay);
  }
  ch.wait=Math.max(ch.wait||0,delay);
}
const trust=ch=>ch.level;   /* get_trust 簡化為 level */
const wisDiff=(ch,v)=>R.stat(ch,2)-R.stat(v,2);
const isFlying=ch=>ch.aff.has('FLYING');

/* armor / shield / stone skin 共用的數值 */
function acCalc(sn,level,ch){
  let sklv=R.getSkillLevel(ch,sn),nLevel=ch.level;
  if(level>=1000){nLevel=I(level/1000);sklv=objSklv(nLevel);}
  if(nLevel>42)nLevel=42;
  let nAcBonus=I(sklv*nLevel/2);
  let nSkBonus=0;
  if(sklv>0)nSkBonus+=4;
  if(sklv>1)nSkBonus+=8;
  if(sklv>2)nSkBonus+=8;
  if(sklv>3)nSkBonus+=8;
  if(sklv>4)nSkBonus+=6;
  if(sklv>5)nSkBonus+=6;
  if(sklv>=4)nAcBonus+=I(nLevel*(sklv-3)*(sklv-3)/2);
  if(nAcBonus<200)nAcBonus=I((nAcBonus+200)/2);
  return {sklv,nLevel,nAcBonus,nSkBonus};
}

R.SPELL.spell_armor=function(sn,level,ch,vo){
  const victim=vo;
  let {sklv,nLevel,nAcBonus,nSkBonus}=acCalc(sn,level,ch);
  const intArmor=R.skillLookup('armor'),intShield=R.skillLookup('shield'),intStone=R.skillLookup('stone skin');
  if(!ch.npc&&ch===vo&&primeAttr(ch)==='INT')nAcBonus+=I(nAcBonus/2);

  if(R.isAffected(victim,intArmor)){
    if(R.affectedValue(victim,intArmor,'SAVING_SPELL')===0){
      if(R.affectedValue(victim,sn,'AC')>-2-nAcBonus)R.affectStrip(victim,intArmor);
      else return;
    }else{
      if(sklv>3)R.affectStrip(victim,intArmor);
      else return;
    }
  }else if(R.isAffected(victim,intShield)){
    if(R.affectedValue(victim,intShield,'RMAGIC')!==0&&sklv<4)return;
    else R.affectStrip(victim,intShield);
  }else if(R.isAffected(victim,intStone)){
    if(R.affectedValue(victim,intStone,'RDAMAGE')!==0&&sklv<4)return;
    else R.affectStrip(victim,intStone);
  }

  const dur=10+I(nLevel/2)+sklv*4;
  R.affectToChar(victim,{type:sn,duration:dur,location:'AC',modifier:0-nAcBonus,bitvector:null});
  if(sklv>0){
    const self2=!ch.npc&&ch===vo&&(primeAttr(ch)==='INT'||primeAttr(ch)==='WIS');
    let m=I(nSkBonus/2);if(self2)m+=I(m/2);
    R.affectToChar(victim,{type:sn,duration:dur,location:'RDAMAGE',modifier:m,bitvector:null});
    m=I(nSkBonus/2);if(self2)m+=I(m/2);
    R.affectToChar(victim,{type:sn,duration:dur,location:'RMAGIC',modifier:m,bitvector:null});
  }
  if(ch!==victim)R.send(ch,'好的。\n');
  R.send(victim,'你感覺受到保護.\n');
};

R.SPELL.spell_bless=function(sn,level,ch,vo){
  const victim=vo;
  let sklv=R.getSkillLevel(ch,sn);
  if(level>=1000)sklv=objSklv(I(level/1000));
  if(victim.position===P.FIGHTING)return;
  const wis=R.stat(ch,2);
  const svSpell=-5-I((wis-10)/3)-sklv*2-I(sklv/2);
  const bsn=R.skillLookup('bless');
  if(R.isAffected(victim,bsn)){
    if(R.affectedValue(victim,sn,'SAVING_SPELL')>=svSpell)R.affectStrip(victim,bsn);
    else return;
  }
  const dur=1+sklv*3+I(ch.level/4);
  R.affectToChar(victim,{type:sn,duration:dur,location:'SAVING_SPELL',modifier:svSpell,bitvector:null});
  const sd=I(-1-(sklv+sklv*(1+sklv)*0.2));
  R.affectToChar(victim,{type:sn,duration:dur,location:'SAVING_SAINT',modifier:sd,bitvector:null});
  R.affectToChar(victim,{type:sn,duration:dur,location:'SAVING_DARK',modifier:sd,bitvector:null});
  if(sklv>3)R.affectToChar(victim,{type:sn,duration:dur,location:'SAVING_BREATH',modifier:-(sklv*4-8),bitvector:null});
  if(ch!==victim)R.send(ch,'好的。\n');
  R.send(victim,'你感覺受到祝福.\n');
};

R.SPELL.spell_control_weather=function(sn,level,ch,vo){
  const t=R.lc?R.lc(R.targetName||''):String(R.targetName||'').toLowerCase();
  const wx=R.weather;
  if(t==='better'){if(wx&&typeof wx.change==='number')wx.change+=R.dice(I(level/3)+R.getSkillLevel(ch,sn)*2,4);}
  else if(t==='worse'){if(wx&&typeof wx.change==='number')wx.change-=R.dice(I(level/3)+R.getSkillLevel(ch,sn)*2,4);}
  else R.send(ch,'你要讓天氣變好(better)或變差(worse)？\n');
  R.send(ch,C.HIC+'數個神秘的圖像文字出現在你眼前，它們的顏色變幻著，天氣似乎也因此而受到了影響。\n'+C.NOR);
  R.act(C.HIC+'當'+C.NOR+'$n'+C.HIC+'集中精神的同時，他面前浮現出奇異的圖像文字。'+C.NOR,ch,null,null,R.TO_ROOM);
};

/* detect 系列共用 */
function detectSpell(sn,ch,victim,raceAbil,bit,skName,msg){
  if(R.raceHas(victim,raceAbil)||victim.aff.has(bit)){
    const s=R.skillLookup(skName);
    if(R.isAffected(victim,s))R.affectStrip(victim,s);
    else return;
  }
  R.affectToChar(victim,{type:sn,duration:ch.level+R.getSkillLevel(ch,sn)*2,location:'NONE',modifier:0,bitvector:bit});
  if(ch!==victim)R.send(ch,'好的。\n');
  R.send(victim,msg);
  waitMagic(ch,8);
}
R.SPELL.spell_detect_evil=function(sn,level,ch,vo){detectSpell(sn,ch,vo,'DETECT_ALIGN','DETECT_EVIL','detect evil','你感覺到你能分辨邪惡的氣息了.\n');};
R.SPELL.spell_detect_hidden=function(sn,level,ch,vo){detectSpell(sn,ch,vo,'DETECT_HIDDEN','DETECT_HIDDEN','detect hidden','你開始提高警覺.\n');};
R.SPELL.spell_detect_invis=function(sn,level,ch,vo){detectSpell(sn,ch,vo,'DETECT_INVIS','DETECT_INVIS','detect invis','你感到雙眼一陣刺痛.\n');};
R.SPELL.spell_detect_magic=function(sn,level,ch,vo){detectSpell(sn,ch,vo,'DETECT_MAGIC','DETECT_MAGIC','detect magic','你感到你能分辨魔法的氣息了.\n');};

R.SPELL.spell_detect_poison=function(sn,level,ch,vo){
  const obj=vo;
  if(obj&&(obj.type==='DRINK_CON'||obj.type==='FOOD')){
    if((obj.values&&obj.values[3]||0)!==0)R.send(ch,'你聞到一股劇毒的氣味.\n');
    else R.send(ch,'嗯，看來十分可口.\n');
  }else R.send(ch,'那看起來並沒有含毒.\n');
  waitMagic(ch,8);
};

/* dispel magic：victim->special 的 ALY_xxx 保護 */
function alyProtected(v,type){
  const sp=f=>R.hasSpecial(v,f);
  return (type===R.skillLookup('sanctuary')&&sp('ALY_SAN'))||(type===R.gsn.invis&&sp('ALY_INVIS'))
    ||(type===R.gsn.hide&&sp('ALY_HIDE'))||(type===R.gsn.sneak&&sp('ALY_SNEAK'))
    ||(type===R.skillLookup('detect invis')&&sp('ALY_DI'))||(type===R.skillLookup('detect hidden')&&sp('ALY_DH'))
    ||(type===R.skillLookup('infravision')&&sp('ALY_INF'))||(type===R.skillLookup('barrier')&&sp('ALY_BAR'));
}
function alyBitProtected(v,bit){
  const sp=f=>R.hasSpecial(v,f);
  return (bit==='INVISIBLE'&&sp('ALY_INVIS'))||(bit==='DETECT_INVIS'&&sp('ALY_DI'))||(bit==='DETECT_HIDDEN'&&sp('ALY_DH'))
    ||(bit==='SANCTUARY'&&sp('ALY_SAN'))||(bit==='HIDE'&&sp('ALY_HIDE'))||(bit==='SNEAK'&&sp('ALY_SNEAK'))||(bit==='INFRARED'&&sp('ALY_INF'));
}
R.SPELL.spell_dispel_magic=function(sn,level,ch,vo){
  const victim=vo,g=R.gsn;
  if(R.hasSpecial(victim,'NO_DM'))return;
  const weakP=()=>R.pct()*100/R.weaknessPercent(victim,sn);

  if(!ch.npc&&(!victim.npc||(victim.aff.has('CHARM')&&sameGroup(ch,victim.master)))){
    /* Defensive spell - remove ALL effects */
    const notImm=trust(ch)<R.LEVEL_IMMORTAL;
    const deny=[[g.vampiric_bite,'你無法移去吸血鬼詛咒.\n'],[g.disease,'你無法移去疾病.\n'],[g.poison,'你無法移去劇毒.\n'],
      [g.paralyze,'你無法移去麻痺效應.\n'],[g.dark_containment,'你無法移去闇咒封鎖.\n'],[R.skillLookup('demon tremor'),'你無法驅趕心中盤據的惡魔.\n']];
    for(const paf of [...(victim.affects||[])]){
      if(paf.deleted)continue;
      if(paf.type===g.snare){R.send(ch,' 你無法移去陷阱.\n');continue;}
      if(paf.type===g.defensive)continue;
      if(paf.type===g.blood_thirsty)continue;
      if(paf.type===g.meditate){R.send(ch,'你無法移去冥思.\n');continue;}
      if(paf.type===g.lifeshare){R.send(ch,'你無法移去同生共死.\n');continue;}
      if(paf.type===g.nightstalk){R.send(ch,'你無法移去匿蹤.\n');continue;}
      if(paf.type===g.sprinkle_slash){R.send(ch,'你無法移除波紋劍氣的纏繞.\n');continue;}
      if(paf.type===g.resurrection){R.send(ch,'你無法移去復活效應.\n');continue;}
      const d=notImm&&deny.find(([t])=>t!==undefined&&t>=0&&paf.type===t);
      if(d){R.send(ch,d[1]);continue;}
      if(alyProtected(victim,paf.type))continue;
      if(paf.duration<0)continue;
      if(weakP()>(paf.duration-ch.level-(R.stat(ch,2)*2)-R.getSkillLevel(ch,sn)*6)){
        for(const t of [...victim.affects])if(!t.deleted&&t.type===paf.type)R.affectRemove(victim,t);
        /* 簡化：polymorph／morphing 的 dm_effect（種族還原）引擎無此機制 */
      }else{
        R.send(ch,'你失敗了！\n');
        continue;
      }
    }
    if(victim===ch){
      R.act('你除去了自己身上的法術效應.',ch,null,null,R.TO_CHAR);
      R.act('$n除去了自己身上的法術效應.',ch,null,null,R.TO_ROOM);
    }else{
      R.act('你除去了$N身上的法術效應.',ch,null,victim,R.TO_CHAR);
      R.act('$n除去了你身上的法術效應.',ch,null,victim,R.TO_VICT);
      R.act('$n除去了$N身上的法術效應.',ch,null,victim,R.TO_NOTVICT);
    }
    return;
  }

  /* Offensive spell */
  const failHit=()=>{
    R.send(ch,'你失敗了！\n');
    if((!victim.fighting||!sameGroup(ch,victim.fighting))&&R.bits(4)===1)R.multiHit(victim,ch);
  };
  const chance=min=>Math.max(min,R.savesSpell(R.pp(ch),victim)+(wisDiff(ch,victim)*4)-23+R.getSkillLevel(ch,sn)*2);
  for(const paf of [...(victim.affects||[])]){
    if(paf.deleted)continue;
    if(alyProtected(victim,paf.type))continue;
    if(R.isImm(ch)||chance(5)>weakP()){
      const k=SK[paf.type];
      R.send(victim,(k?k.off:'')+'\n');
      R.act("$n不再受到 '$t' 的作用影響.",victim,k?k.name:'',null,R.TO_ROOM);
      R.affectStrip(victim,paf.type);
      return;
    }else{failHit();return;}
  }
  if(victim.aff.size){
    /* 推測：C 依位元由低到高逐一判定，這裡依 Set 內順序 */
    for(const bit of [...victim.aff]){
      if(bit==='CHARM'&&victim.npc&&victim.act&&victim.act.has('PET'))continue;
      if(alyBitProtected(victim,bit))continue;
      if(R.isImm(ch)||chance(2)>weakP()){
        victim.aff.delete(bit);
        R.act('你除去了$N身上的法術效應.',ch,null,victim,R.TO_CHAR);
        R.act('$n除去了$N身上的法術效應.',ch,null,victim,R.TO_NOTVICT);
        break;
      }else{failHit();return;}
    }
  }
  /* 簡化：mprog_hurt_trigger、fall_effect（房間掉落）引擎無此機制 */
};

R.SPELL.spell_faerie_fog=function(sn,level,ch,vo){
  let sklv=R.getSkillLevel(ch,sn);
  if(level>=1000)sklv=objSklv(I(level/1000));
  R.send(ch,'你伸手一揮，招來了一陣紫色煙霧.\n');
  R.act('$n 伸手一揮，招來了一陣紫色煙霧.',ch,null,null,R.TO_ROOM);
  for(const ich of [...ch.room.people]){
    if(R.isImm(ich)&&ich.act&&ich.act.has('WIZINVIS'))continue;
    if(ich===ch||R.newSavesSpell(R.pp(ch),ich,M.WIND)+sklv*3<(R.pct()*103/R.weaknessPercent(ich,sn)))continue;
    R.affectStrip(ich,R.gsn.invis);
    R.affectStrip(ich,R.gsn.mass_invis);
    if(R.gsn.shadow!==undefined)R.affectStrip(ich,R.gsn.shadow);
    ich.aff.delete('HIDE');
    ich.aff.delete('INVISIBLE');
    if(!R.hasSpecial(ich,'ALY_SNEAK')){R.affectStrip(ich,R.gsn.sneak);ich.aff.delete('SNEAK');}
    if(sklv>5){R.affectStrip(ich,R.gsn.nightstalk);ich.aff.delete('NIGHTSTALK');}
    R.act('$n 的身影從煙霧中浮現！',ich,null,null,R.TO_ROOM);
    R.send(ich,'你被發現了！\n');
  }
};

R.SPELL.spell_fly=function(sn,level,ch,vo){
  const victim=vo;
  let sklv=R.getSkillLevel(ch,sn);
  if(level>=1000)sklv=objSklv(I(level/1000));
  let fly_dc=0;
  if(sklv>0)fly_dc-=6;
  if(sklv>1)fly_dc-=7;
  if(sklv>2)fly_dc-=8;
  if(sklv>3)fly_dc-=9;
  if(sklv>4)fly_dc-=8;
  if(sklv>5)fly_dc-=7;
  const fsn=R.skillLookup('fly');
  if(R.isAffected(victim,fsn)){
    if(R.affectedValue(victim,sn,'DODGE')<fly_dc)return;
    else R.affectStrip(victim,fsn);
  }
  const dur=ch.level+3+sklv*3;
  if(!isFlying(victim))R.affectToChar(victim,{type:sn,duration:dur,location:'NONE',modifier:0,bitvector:'FLYING'});
  if(sklv>0)R.affectToChar(victim,{type:sn,duration:dur,location:'DODGE',modifier:fly_dc,bitvector:null});
  R.send(victim,'你的雙腳漸漸升離了地面.\n');
  R.act('$n 的雙腳漸漸升離了地面.',victim,null,null,R.TO_ROOM);
  waitMagic(ch,8);
};

R.SPELL.spell_giant_strength=function(sn,level,ch,vo){
  const victim=vo;
  let sklv=R.getSkillLevel(ch,sn);
  if(level>=1000)sklv=objSklv(I(level/1000));
  const nPDBonus=Math.max(5,I((R.stat(ch,1)-5)/2)+sklv+I(sklv*sklv*sklv/4));
  const cm=R.skillLookup('combat mind'),gs=R.skillLookup('giant strength'),ac=R.skillLookup('adrenaline control');
  if(R.isAffected(victim,cm))R.affectStrip(victim,cm);
  if(R.isAffected(victim,gs)){
    if(R.affectedValue(victim,sn,'ADAMAGE')<=nPDBonus)R.affectStrip(victim,gs);
    else return;
  }
  if(R.isAffected(victim,ac))R.affectStrip(victim,ac);
  const dur=10+I(ch.level/2)+sklv*4;
  R.affectToChar(victim,{type:sn,duration:dur,location:'STR',modifier:1+I(sklv/3),bitvector:null});
  R.affectToChar(victim,{type:sn,duration:dur,location:'ADAMAGE',modifier:nPDBonus,bitvector:null});
  if(ch!==victim)R.send(ch,'好的。\n');
  R.send(victim,'你感到自己更強壯了.\n');
};

R.SPELL.spell_infravision=function(sn,level,ch,vo){
  const victim=vo;
  if(victim.aff.has('INFRARED')){
    const s=R.skillLookup('infravision');
    if(R.isAffected(victim,s))R.affectStrip(victim,s);
    else return;
  }
  R.affectToChar(victim,{type:sn,duration:2*ch.level+R.getSkillLevel(ch,sn)*6,location:'NONE',modifier:0,bitvector:'INFRARED'});
  /* 簡化：DEATH_PROG 判定，引擎無 mob prog，一律顯示 */
  R.send(victim,'你的雙眼閃爍著紅光.\n');
  R.act('$n 的雙眼閃爍著紅光.\n',ch,null,null,R.TO_ROOM);
  waitMagic(ch,8);
};

/* C 版 spell_invis 只對角色（物品隱形不在此函式） */
R.SPELL.spell_invis=function(sn,level,ch,vo){
  const victim=vo;
  if(!victim||!victim.aff)return;   /* 推測：防呆，C 原碼不處理物品 */
  if(victim.aff.has('INVISIBLE')){
    const s1=R.skillLookup('invis'),s2=R.skillLookup('mass invis');
    if(R.isAffected(victim,s1))R.affectStrip(victim,s1);
    else if(R.isAffected(victim,s2))R.affectStrip(victim,s2);
    else return;
  }
  R.act('$n 的身影逐漸消失.',victim,null,null,R.TO_ROOM);
  R.affectToChar(victim,{type:sn,duration:I(ch.level/2)+R.stat(ch,2)+R.getSkillLevel(ch,sn)*6,location:'NONE',modifier:0,bitvector:'INVISIBLE'});
  R.send(victim,'你的身影逐漸消失.\n');
  waitMagic(ch,8);
};

R.SPELL.spell_know_alignment=function(sn,level,ch,vo){
  const victim=vo,ap=victim.alignment;
  let msg;
  if(ap>899)msg='$N 周圍籠罩著潔白似雪的光芒.';
  else if(ap>749)msg='$N 是你道德上的典範.';
  else if(ap>499)msg='$N 看起來仁慈善良.';
  else if(ap>349)msg='$N 嚴守道德規模.';
  else if(ap>99)msg='$N 對人的態度和善.';
  else if(ap>-100)msg='$N 不受是非善惡的約束.';
  else if(ap>-350)msg='$N 的品德有些缺陷.';
  else if(ap>-500)msg='$N 連朋友都能出賣.';
  else if(ap>-750)msg='$N 眼中充斥暴厲之氣.';
  else if(ap>-900)msg='$N 看來想殺死你！';
  else msg='還是別在 $N 面前亂說話好了...否則可能有危險.';
  R.act(msg,ch,null,victim,R.TO_CHAR);
};

R.SPELL.spell_mass_invis=function(sn,level,ch,vo){
  const s1=R.skillLookup('invis'),s2=R.skillLookup('mass invis');
  for(const gch of [...ch.room.people]){
    if(!sameGroup(gch,ch))continue;
    if(gch.aff.has('INVISIBLE')){
      if(R.isAffected(gch,s1))R.affectStrip(gch,s1);
      else if(R.isAffected(gch,s2))R.affectStrip(gch,s2);
      else continue;
    }
    R.send(gch,'你的身影逐漸消失.\n');
    R.act('$n 的身影逐漸消失.',gch,null,null,R.TO_ROOM);
    R.affectToChar(gch,{type:sn,duration:I(ch.level/10)+R.stat(ch,2)+R.getSkillLevel(ch,sn)*4,location:'NONE',modifier:0,bitvector:'INVISIBLE'});
  }
  R.send(ch,'好的。\n');
  waitMagic(ch,24);
};

R.SPELL.spell_pass_door=function(sn,level,ch,vo){
  const victim=vo;
  let sklv=R.getSkillLevel(ch,sn);
  if(level>=1000)sklv=objSklv(I(level/1000));
  if(victim.aff.has('PASS_DOOR'))return;
  R.affectToChar(victim,{type:sn,duration:R.fuzzy(I(ch.level/4))+sklv*2,location:'NONE',modifier:0,bitvector:'PASS_DOOR'});
  R.send(victim,'你的身體漸漸變成半透明.\n');
  R.act('$n 的身體漸漸變成半透明.',victim,null,null,R.TO_ROOM);
};

R.SPELL.spell_protection=function(sn,level,ch,vo){
  const victim=vo;
  if(victim.aff.has('PROTECT')){
    const s=R.skillLookup('protection');
    if(R.isAffected(victim,s))R.affectStrip(victim,s);
    else return;
  }
  R.affectToChar(victim,{type:sn,duration:I(ch.level/2)+R.getSkillLevel(ch,sn)*2,location:'NONE',modifier:0,bitvector:'PROTECT'});
  if(ch!==victim)R.send(ch,'好的。\n');
  R.send(victim,'你的四周升起了神聖的保護力場.\n');
};

R.SPELL.spell_sanctuary=function(sn,level,ch,vo){
  const victim=vo;
  const sklv=R.getSkillLevel(ch,sn),div_sklv=R.getSkillLevel(ch,R.gsn.divine_light);
  const gsnSan=R.gsn.sanctuary!==undefined?R.gsn.sanctuary:R.skillLookup('sanctuary');
  const cast_total=1+(sklv+div_sklv)*2+I((sklv*sklv)/2)+I(ch.level/10);
  if(R.isAffected(victim,gsnSan)){
    const vch_total=0-(R.affectedValue(victim,gsnSan,'SAVING_SAINT')+R.affectedValue(victim,gsnSan,'SAVING_DARK'));
    if(cast_total<vch_total){R.send(ch,'他身上的聖光術比你施放的還強呢!\n');return;}
    else R.affectStrip(victim,gsnSan);
  }
  const nSvSaint=0-I(cast_total*(1000-ch.alignment)/2000);
  const nSvDark=0-I(cast_total*(1000+ch.alignment)/2000);
  const dur=1+sklv+I(ch.level/10);
  if(nSvSaint!==0){
    const bv=(victim.aff.has('SANCTUARY')||R.raceHas(victim,'SANCT'))?null:'SANCTUARY';
    R.affectToChar(victim,{type:sn,duration:dur,location:'SAVING_SAINT',modifier:nSvSaint,bitvector:bv});
  }
  if(nSvDark!==0){
    const bv=(victim.aff.has('SANCTUARY')||R.raceHas(victim,'SANCT'))?null:'SANCTUARY';
    R.affectToChar(victim,{type:sn,duration:dur,location:'SAVING_DARK',modifier:nSvDark,bitvector:bv});
  }
  R.send(victim,'一道白色聖光籠罩了你全身.\n');
  R.act('一道白色聖光籠罩了 $n.',victim,null,null,R.TO_ROOM);
};

R.SPELL.spell_shield=function(sn,level,ch,vo){
  const victim=vo;
  const {sklv,nLevel,nAcBonus,nSkBonus}=acCalc(sn,level,ch);
  const intArmor=R.skillLookup('armor'),intShield=R.skillLookup('shield'),intStone=R.skillLookup('stone skin');
  if(R.isAffected(victim,intShield)){
    if(R.affectedValue(victim,intArmor,'RMAGIC')===0){   /* C 原碼即查 intArmor */
      if(R.affectedValue(victim,sn,'AC')>-1-nAcBonus)R.affectStrip(victim,intShield);
      else return;
    }else{
      if(sklv>3)R.affectStrip(victim,intShield);
      else return;
    }
  }else if(R.isAffected(victim,intArmor)){
    if(R.affectedValue(victim,intArmor,'SAVING_SPELL')!==0&&sklv<4)return;
    else R.affectStrip(victim,intArmor);
  }else if(R.isAffected(victim,intStone)){
    if(R.affectedValue(victim,intStone,'RDAMAGE')!==0&&sklv<4)return;
    else R.affectStrip(victim,intStone);
  }
  const dur=10+I(nLevel/2)+sklv*4;
  R.affectToChar(victim,{type:sn,duration:dur,location:'AC',modifier:0-nAcBonus,bitvector:null});
  if(sklv>0){
    let m=nSkBonus;
    if(!ch.npc&&ch===vo&&(primeAttr(ch)==='INT'||primeAttr(ch)==='WIS'))m+=I(m/2);
    R.affectToChar(victim,{type:sn,duration:dur,location:'RMAGIC',modifier:m,bitvector:null});
  }
  R.send(victim,'一股力場環繞在你身旁.\n');
  R.act('一股力場環繞在 $n 身旁.',victim,null,null,R.TO_ROOM);
};

R.SPELL.spell_sober_up=function(sn,level,ch,vo){
  const victim=vo;
  if(victim.npc){R.send(ch,'只能對玩家施展！\n');return;}
  victim.pc.cond=victim.pc.cond||[0,0,0];
  const drunk=victim.pc.cond[0]||0;
  if(drunk<=0){R.send(ch,(victim===ch)?'你一點也沒醉。\n':'他看起來很清醒。\n');return;}
  victim.move=I((100*victim.move)/(100+drunk));
  victim.pc.cond[0]-=drunk;
  if(victim!==ch)R.send(ch,'好的.\n');
  R.send(victim,'你體內的酒精逐漸散去，你的神智也逐漸清楚了。\n');
  const wk=R.gsn.weaken!==undefined?R.gsn.weaken:R.skillLookup('weaken');
  if(!R.isAffected(victim,wk)){
    R.affectToChar(victim,{type:wk,duration:2+I(drunk/10),location:'STR',modifier:-2,bitvector:null});
    R.send(victim,C.HIU+'你突然覺得好虛弱！'+C.NOR+'\n');
  }
};

R.SPELL.spell_stone_skin=function(sn,level,ch,vo){
  const victim=vo;
  const {sklv,nLevel,nAcBonus,nSkBonus}=acCalc(sn,level,ch);
  const intArmor=R.skillLookup('armor'),intShield=R.skillLookup('shield'),intStone=R.skillLookup('stone skin');
  if(R.isAffected(victim,intStone)){
    if(R.affectedValue(victim,intArmor,'RDAMAGE')===0){   /* C 原碼即查 intArmor */
      if(R.affectedValue(victim,sn,'AC')>-1-nAcBonus)R.affectStrip(victim,intStone);
      else return;
    }else{
      if(sklv>3)R.affectStrip(victim,intStone);
      else return;
    }
  }else if(R.isAffected(victim,intArmor)){
    if(R.affectedValue(victim,intArmor,'SAVING_SPELL')!==0&&sklv<4)return;
    else R.affectStrip(victim,intArmor);
  }else if(R.isAffected(victim,intShield)){
    if(R.affectedValue(victim,intShield,'RMAGIC')!==0&&sklv<4)return;
    else R.affectStrip(victim,intShield);
  }
  const dur=10+I(nLevel/2)+sklv*4;
  R.affectToChar(victim,{type:sn,duration:dur,location:'AC',modifier:0-nAcBonus,bitvector:null});
  if(sklv>0){
    let m=nSkBonus;
    if(!ch.npc&&ch===vo&&(primeAttr(ch)==='INT'||primeAttr(ch)==='WIS'))m+=I(m/2);
    R.affectToChar(victim,{type:sn,duration:dur,location:'RDAMAGE',modifier:m,bitvector:null});
  }
  R.send(victim,'你的皮膚逐漸硬化.\n');
  R.act('$n 的皮膚逐漸硬化.',victim,null,null,R.TO_ROOM);
};
})(ROC);
