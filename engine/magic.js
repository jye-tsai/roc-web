/* magic.js — 技能表、affect、抗魔、施法核心（對應 magic.c / affect.c / handler.c 技能函式）
   法術本體在 spells_*.js，以 R.SPELL.spell_xxx=(sn,level,ch,vo)=>{} 註冊 */
(function(R){
const C=R.C,P=R.POS,cmd=R.cmds,W=R.world;
const SK=ROC.SKILLS;R.SK=SK;
R.SPELL=R.SPELL||{};
R.gsn={};
SK.forEach((s,i)=>{R.gsn[s.name.replace(/[ -]/g,'_')]=i;if(s.gsn)R.gsn[s.gsn]=i;});
R.MAGIC={SPELL:0,FIRE:1,COLD:2,WIND:3,EARTH:4,BREATH:5,LIGHTNING:6,SAINT:7,DARK:8,SPIRIT:9,ANCIENT:10,POISON:11,NATURE:12,GOOD:13,EVIL:14};
R.TAR={IGNORE:0,CHAR_OFFENSIVE:1,CHAR_DEFENSIVE:2,CHAR_SELF:3,OBJ_INV:4,OBJ:5,ARG:6};
const INT_LEARN=[3,5,7,8,9,10,11,12,13,15,17,19,22,25,28,31,34,37,40,44,49,55,60,70,85,99,99,99,99,99,99];
R.intLearn=ch=>INT_LEARN[R.urange(0,R.stat(ch,1),30)];
R.WIZARD=5;

/* ---------- skill_lookup（支援多字前綴：'magic mis' / 'm m'） ---------- */
R.skillLookup=function(name){
  name=R.lc(String(name||'').trim());if(!name)return -1;
  const a=name.split(/\s+/);
  for(let sn=0;sn<SK.length;sn++){
    const n=SK[sn].name;
    if(n[0]===name[0]&&n.startsWith(name))return sn;
    const b=n.split(' ');
    if(a.length===b.length&&a.every((w,i)=>b[i].startsWith(w)))return sn;
  }
  return -1;
};
R.skillName=sn=>SK[sn]?SK[sn].name:'';

/* ---------- learned：pc.learned[技能英文名] = sklv*1000 + percent ---------- */
const learned=ch=>{if(ch.npc)return null;ch.pc.learned=ch.pc.learned||{};return ch.pc.learned;};
R.getSkillLevel=function(ch,sn){
  if(!ch||sn<0)return 0;
  if(ch.npc){let l=ch.level>35?Math.floor((ch.level-35)/5):0;if(ch.proto&&(ch.proto.spec_flags||[]).includes('EXPERT'))l=Math.floor((l+7)/2);return Math.min(6,l);}   /* 推測：GetGeneralMobSklv 依註解版本 */
  if(ch.cls<R.WIZARD&&ch.level>29)return 2;
  return Math.min(6,Math.floor((learned(ch)[SK[sn].name]||0)/1000));
};
R.getSkillPercent=function(ch,sn){
  if(!ch||sn<1||!SK[sn])return 0;
  if(ch.npc)return 0;
  return (learned(ch)[SK[sn].name]||0)%1000;
};
R.skillReqLevel=(ch,sn)=>{if(ch.npc)return 0;const l=SK[sn].lv[ch.cls];return l?l[0]:R.L_APP;};
R.skillMaxPercent=(ch,sn)=>{if(ch.npc)return 0;const l=SK[sn].lv[ch.cls];return l?l[1]:0;};
R.gainSkillPercent=function(ch,sn,v){
  if(ch.npc)return 0;
  const mod=Math.min(R.skillMaxPercent(ch,sn),R.getSkillPercent(ch,sn)+v);
  learned(ch)[SK[sn].name]=mod+(ch.cls>=R.WIZARD?R.getSkillLevel(ch,sn)*1000:0);
  return mod;
};
/* 給 NPC 用的「會不會」：spec_cast 怪 / 戰技怪 */
R.knows=(ch,sn)=>ch.npc?true:R.getSkillPercent(ch,sn)>0;

/* ---------- 抗魔 ---------- */
R.svs=ch=>{if(!ch.svs){const b=ch.npc&&ch.proto?(ch.proto.mod_svs||0):0;ch.svs=Array(15).fill(b);}return ch.svs;};
R.isGood=ch=>ch.alignment>=350;R.isEvil=ch=>ch.alignment<=-350;R.isNeutral=ch=>!R.isGood(ch)&&!R.isEvil(ch);
const raceSvs=(ch,t)=>{const r=R.CONST.races[ch.race];return r&&r.svs&&r.svs[t]||0;};
R.getSvsType=function(ch,type){
  const s=R.svs(ch)[type]||0,M=R.MAGIC,wis=R.stat(ch,2),int=R.stat(ch,1);
  if(type===M.SAINT||type===M.DARK){
    const base=(ch.npc?s:15-wis+s)+raceSvs(ch,type);
    if(R.isGood(ch))return base+(type===M.SAINT?-10:10);
    if(R.isEvil(ch))return base+(type===M.SAINT?10:-10);
    return base+5;
  }
  if(type===M.POISON)return ch.npc?s:s+ch.level;
  return (ch.npc?s:30-int-wis+s)+raceSvs(ch,type);
};
R.getSvs=ch=>R.getSvsType(ch,0);
R.savesSpell=(pp,v)=>R.urange(15,100+R.urange(-250,R.getSvs(v)*2,400)+pp*3,500);
R.newSavesSpell=function(pp,v,type){
  const n=R.getSvsType(v,type);
  if(n<0)return Math.floor(v.npc?(100+pp*4)*2500/(2500+n*n):(100+pp*4)*1000/(1000+n*n));
  return Math.floor((100+pp*4)*(100+n*2)/100);
};
R.oldSavesSpell=function(pp,v,type){
  const n=R.getSvsType(v,type);
  if(n<0)return Math.floor(v.npc?(100+pp*3/2)*2000/(2000+n*n):(100+pp*3/2)*1000/(1000+n*n));
  return Math.floor((100+pp*3/2)*(100+n*2)/100);
};
R.newSavesTimer=(pp,v,type)=>120+R.urange(-120,R.getSvsType(v,type),200);
R.intEffect=ch=>{const i=R.stat(ch,1);return i>16?(200+(i-16)*(i-16))/200:(200-(16-i)*(16-i))/200;};
R.wisEffect=ch=>{const w=R.stat(ch,2);return (200+(w-16)*(w-16))/200;};   /* 原碼 <16 也是加號 */
R.pp=ch=>ch.npc?(ch.proto&&ch.proto.mod_pp||0):(ch.pp||0);
const weak=(v,sn)=>v.npc&&v.proto&&(v.proto.weaknesses||[]).find(w=>R.skillLookup(w.skill)===sn);
R.weaknessPercent=(v,sn)=>{const w=weak(v,sn);return w?w.percent:100;};
R.weaknessDamage=(v,sn)=>{const w=weak(v,sn);return w?w.damage:100;};
R.isPK=(ch,v)=>!v.npc&&!ch.npc;
R.addFollower=R.addFollower||function(ch,m){if(ch.master)return;ch.master=m;ch.leader=null;if(R.canSee(m,ch))R.act('$n開始跟隨你。',ch,null,m,R.TO_VICT);R.act('你開始跟隨$N。',ch,null,m,R.TO_CHAR);};
R.stopFollower=R.stopFollower||function(ch){const m=ch.master;if(!m)return;
  if(ch.aff.has('CHARM')){ch.aff.delete('CHARM');R.affectStrip(ch,R.gsn.charm_person);}
  if(ch.room&&m.room&&R.canSee(m,ch))R.act('$n停止跟隨你。',ch,null,m,R.TO_VICT);R.act('你停止跟隨$N。',ch,null,m,R.TO_CHAR);
  ch.master=null;ch.leader=null;};
R.hasSpecial=(ch,f)=>!!(ch.npc&&ch.proto&&(ch.proto.spec_flags||[]).includes(f));
R.raceHas=(ch,abil)=>false;   /* 種族能力位元尚未對照，先一律否（推測） */

/* ---------- affect ---------- */
R.APPLY={NONE:'NONE',STR:'STR',DEX:'DEX',INT:'INT',WIS:'WIS',CON:'CON',SEX:'SEX',MANA:'MANA',HIT:'HIT',MOVE:'MOVE',AC:'AC',
  HITROLL:'HITROLL',DAMROLL:'DAMROLL',SAVING_PARA:'SAVING_PARA',SAVING_LIFE:'SAVING_LIFE',SAVING_PETRI:'SAVING_PETRI',
  SAVING_BREATH:'SAVING_BREATH',SAVING_SPELL:'SAVING_SPELL',SAVING_ANCIENT:'SAVING_ANCIENT',SAVING_SPIRIT:'SAVING_SPIRIT',
  SAVING_FIRE:'SAVING_FIRE',SAVING_COLD:'SAVING_COLD',SAVING_LIGHTNING:'SAVING_LIGHTNING',SAVING_EARTH:'SAVING_EARTH',
  SAVING_WIND:'SAVING_WIND',SAVING_SAINT:'SAVING_SAINT',SAVING_DARK:'SAVING_DARK',SAVING_POISON:'SAVING_POISON',
  SAVING_ELEMENT:'SAVING_ELEMENT',SAVING_GOOD:'SAVING_GOOD',SAVING_EVIL:'SAVING_EVIL',DODGE:'DODGE',
  POWER_POTENTIAL:'POWER_POTENTIAL',RDAMAGE:'RDAMAGE',RMAGIC:'RMAGIC',ADAMAGE:'ADAMAGE',AMAGIC:'AMAGIC'};
const STATI={STR:0,INT:1,WIS:2,DEX:3,CON:4};
const SVLOC={SAVING_PARA:[0],SAVING_SPELL:[0],SAVING_PETRI:[4],SAVING_EARTH:[4],SAVING_GOOD:[7],SAVING_SAINT:[7],
  SAVING_EVIL:[8],SAVING_DARK:[8],SAVING_LIGHTNING:[6],SAVING_WIND:[3],SAVING_ANCIENT:[11],SAVING_POISON:[11],
  SAVING_ELEMENT:[1,3,2,4,6],SAVING_BREATH:[5],SAVING_FIRE:[1],SAVING_COLD:[2]};
R.affectModify=function(ch,af,fAdd){
  let mod=af.modifier||0;
  if(fAdd){if(af.bitvector)ch.aff.add(af.bitvector);}
  else{
    mod=-mod;
    if(af.bitvector&&!(ch.npc&&ch.proto&&(ch.proto.affected_flags||[]).includes(af.bitvector))
       &&!(ch.affects||[]).some(o=>o!==af&&!o.deleted&&o.bitvector===af.bitvector))ch.aff.delete(af.bitvector);
  }
  const L=af.location;
  if(L in STATI){ch.mod=ch.mod||[0,0,0,0,0];ch.mod[STATI[L]]+=mod;return;}
  if(SVLOC[L]){const s=R.svs(ch);for(const i of SVLOC[L])s[i]+=mod;return;}
  switch(L){
    case 'SEX':ch.sex+=mod;break;
    case 'MANA':ch.max_mana+=mod;break;
    case 'HIT':ch.max_hit+=mod;break;
    case 'MOVE':ch.max_move+=mod;break;
    case 'AC':ch.armor+=mod;break;
    case 'HITROLL':ch.hitroll=(ch.hitroll||0)+mod;break;
    case 'DAMROLL':ch.damroll=(ch.damroll||0)+mod;break;
    case 'DODGE':ch.dodge=(ch.dodge||0)+mod;break;
    case 'POWER_POTENTIAL':ch.pp=(ch.pp||0)+mod;break;
    default:break;
  }
};
R.affectToChar=function(ch,af){
  const a={type:af.type,duration:af.duration|0,location:af.location||'NONE',modifier:Math.trunc(af.modifier||0),bitvector:af.bitvector||null};
  ch.affects=ch.affects||[];ch.affects.unshift(a);
  R.affectModify(ch,a,true);
  return a;
};
R.affectRemove=function(ch,af){
  if(!ch.affects||af.deleted)return;
  if(af.type===R.gsn.sleep&&ch.position===P.SLEEPING)ch.position=P.STANDING;
  af.deleted=true;
  R.affectModify(ch,af,false);
  const i=ch.affects.indexOf(af);if(i>=0)ch.affects.splice(i,1);
};
R.affectStrip=(ch,sn)=>{for(const a of [...(ch.affects||[])])if(a.type===sn)R.affectRemove(ch,a);};
R.isAffected=(ch,sn)=>!!(ch.affects||[]).some(a=>!a.deleted&&a.type===sn);
R.IS_AFFECTED=(ch,bit)=>ch.aff.has(bit);
R.affectedValue=(ch,sn,loc)=>{const a=(ch.affects||[]).find(a=>!a.deleted&&a.type===sn&&a.location===loc);return a?a.modifier:0;};
R.affectJoin=function(ch,af){
  let org=-1;
  for(const o of ch.affects||[]){
    if(o.deleted||o.type!==af.type||o.location!==af.location)continue;
    if(ch.npc&&STATI[af.location]!==undefined&&o.modifier<0&&R.pct()<-o.modifier*8)return;
    org=o.duration;af={...af,duration:(af.duration|0)+o.duration,modifier:(af.modifier||0)+o.modifier};
    R.affectRemove(ch,o);break;
  }
  if(org<0||af.duration>=0)R.affectToChar(ch,af);
};
/* 每個 tick（char_update）遞減 */
R.affectTick=function(ch){
  if(!ch.affects||!ch.affects.length)return;
  for(const a of [...ch.affects]){
    if(a.deleted)continue;
    if(a.duration>0){a.duration--;continue;}
    if(a.duration<0)continue;
    R.affectRemove(ch,a);
    if(!R.isAffected(ch,a.type)&&a.type>0&&SK[a.type]&&SK[a.type].off&&!/^!.*!$/.test(SK[a.type].off))R.send(ch,SK[a.type].off+'\n');
  }
};

/* ---------- 法術傷害（magic_damage 簡化：保留 PC 加倍、半減、NPC 受傷係數、隱形/躲藏現形） ---------- */
const CEDMT=[[0,'無法傷害'],[3,'擦傷'],[6,'刮傷'],[10,'打中'],[16,'重創'],[24,'痛擊'],[40,'猛擊'],[60,'重擊'],[85,'擊傷'],
  [120,'重傷'],[160,'嚴重打傷'],[220,'粉碎性地擊中'],[300,'毀滅性地擊中'],[400,'殘酷地擊中'],[600,'恐怖地擊中'],[1e9,'致命地擊中']];   /* 推測：中文傷害級距，實際以 core.js damage 表為準 */
function tierOf(dam){
  const t=ROC.CORE&&ROC.CORE.damage;
  if(t&&t.length){for(const [m,s] of t)if(dam<=m)return s;return t[t.length-1][1];}
  for(const [m,s] of CEDMT)if(dam<=m)return s;
  return CEDMT[CEDMT.length-1][1];
}
R.spellDamMessage=function(ch,v,dam,sn){
  const atk=(SK[sn]&&(SK[sn].noun||SK[sn].cname))||'法術';
  const vp=dam<0?C.HIW+'沒有打中'+C.NOR:tierOf(dam);
  let y,t,r,s1,s2;
  if(dam<=40){y='你的'+atk+vp+'$N.';t='$n的'+atk+vp+'你 .';r='$n的'+atk+vp+'$N.';s1='你的'+atk+vp+'你 .';s2='$n的'+atk+vp+'$m .';}
  else if(dam<=220){y='你的'+atk+'讓$N'+vp+'!';t='$n的'+atk+'讓你 '+vp+'!';r='$n的'+atk+'讓$N'+vp+'!';s1='你的'+atk+'讓你自己 '+vp+'!';s2='$n的'+atk+'讓$m '+vp+'!';}
  else{y='你的'+atk+'打得$N'+vp+'!!!';t='$n的'+atk+'打得你 '+vp+'!!!';r='$n的'+atk+'打得$N'+vp+'!!!';s1='你的'+atk+'打得你自己 '+vp+'!!!';s2='$n的'+atk+'打得$m '+vp+'!!!';}
  const dd=ch.npc?'':' '+C.HIW+'('+Math.max(dam,0)+')'+C.NOR;
  if(v!==ch){R.act(y+dd,ch,null,v,R.TO_CHAR);R.act(t,ch,null,v,R.TO_VICT);R.act(r,ch,null,v,R.TO_NOTVICT);}
  else{R.act(s1+dd,ch,null,null,R.TO_CHAR);R.act(s2,ch,null,null,R.TO_ROOM);}
};
R.magicDamage=function(ch,v,dam,sn){
  if(!v||v.deleted||v.position===P.DEAD)return -1;
  if(ch.room!==v.room)return -1;
  dam=Math.floor(dam);
  if(!ch.npc){dam+=dam;if(R.getSkillPercent(ch,sn)<10)dam=Math.floor(dam*90/100);}
  if(v!==ch){
    if(ch.aff.has('INVISIBLE')&&!R.hasSpecial(ch,'ALY_INVIS')){R.affectStrip(ch,R.gsn.invis);R.affectStrip(ch,R.gsn.mass_invis);ch.aff.delete('INVISIBLE');R.act('$n 的身影漸漸浮現.',ch,null,null,R.TO_ROOM);}
    if(ch.aff.has('HIDE')&&!R.hasSpecial(ch,'ALY_HIDE')){ch.aff.delete('HIDE');R.act('$n 的身影漸漸浮現.',ch,null,null,R.TO_ROOM);}
    if(R.isSafe&&R.isSafe(ch,v))return -1;
    dam=Math.floor(dam/2);
    if(v.npc){
      if(!ch.npc&&ch.cls===R.WIZARD)dam=Math.floor(dam*4/5);
      else if(!ch.npc&&(ch.cls===6||ch.cls===8))dam=Math.floor(dam*3/4);   /* alchemist / sorcerer */
      else dam=Math.floor(dam/2);
      dam=Math.floor(dam*10/7);
    }
  }
  dam=Math.max(0,dam);
  if(v!==ch){R.setFighting(ch,v);R.setFighting(v,ch);}
  return R.damage(ch,v,dam,0,0,sn);
};

/* ---------- say_spell ---------- */
const SYL=[[' ',' '],['ar','abra'],['au','kada'],['bless','fido'],['blind','nose'],['bur','mosa'],['cu','judi'],['de','oculo'],
  ['en','unso'],['light','dies'],['lo','hi'],['mor','zak'],['move','sido'],['ness','lacri'],['ning','illa'],['per','duda'],
  ['ra','gru'],['re','candus'],['son','sabru'],['tect','infra'],['tri','cula'],['ven','nofo'],['a','a'],['b','b'],['c','q'],
  ['d','e'],['e','z'],['f','y'],['g','o'],['h','p'],['i','u'],['j','y'],['k','t'],['l','r'],['m','w'],['n','i'],['o','a'],
  ['p','s'],['q','d'],['r','f'],['s','g'],['t','h'],['u','j'],['v','z'],['w','x'],['x','n'],['y','l'],['z','k']];
function saySpell(ch,sn){
  const name=SK[sn].name;let g='';
  for(let i=0;i<name.length;){
    const s=SYL.find(([o])=>name.startsWith(o,i));
    if(s){g+=s[1];i+=s[0].length;}else i++;
  }
  const lv=R.getSkillLevel(ch,sn),col=lv===5?C.HIC:lv===6?C.HIW:'',nc=col?C.NOR:'';
  const same='$n口中喃喃念著咒文：「'+col+name+nc+'」',other='$n口中喃喃念著咒文：「'+col+g+nc+'」';
  for(const r of ch.room.people){
    if(r===ch)R.act('你口中喃喃念著咒文：「'+col+name+nc+'」',ch,null,null,R.TO_CHAR);
    else R.act((ch.cls===r.cls&&ch.npc===r.npc||R.isImm(r))?same:other,ch,null,r,R.TO_VICT);
  }
}

/* ---------- do_cast ---------- */
R.targetName='';
function locate(ch,sn,arg2,delayed){
  const s=SK[sn];let v=null,vo=null;
  switch(s.tar){
    case 6:vo=arg2;break;
    case 0:break;
    case 1:
      if(ch.room.flags.has('SAFE')){R.send(ch,'不行.\n');return null;}
      if(!arg2){
        if(!(v=ch.fighting)){R.send(ch,'你要把法術施在誰的身上?\n');return null;}
        if(!R.canSee(ch,v)&&R.bits(1)===1){R.send(ch,'你的法術落空了！\n');return null;}
      }else if(!(v=R.getCharRoom(ch,arg2))){R.send(ch,'喔喔, 你的目標現在不在這裡喔.\n');return null;}
      if(ch.aff.has('CHARM')&&ch.master===v){R.send(ch,'你不能對你的同伴這樣做!\n');return null;}
      if(v!==ch&&R.isSafe&&R.isSafe(ch,v))return null;
      vo=v;break;
    case 2:
      if(!arg2)v=ch;else if(!(v=R.getCharRoom(ch,arg2))){R.send(ch,'沒有你要的東西.\n');return null;}
      vo=v;break;
    case 3:
      if(arg2&&!R.is_name(arg2,ch.name)){R.send(ch,'你不能對其他人施用這個魔法!\n');return null;}
      vo=v=ch;break;
    case 5:
      if(!arg2){R.send(ch,'你要把法術施在什麼東西上？\n');return null;}
      if(!(vo=R.getObjHere(ch,arg2))){R.send(ch,'這裡沒有這樣東西.\n');return null;}
      break;
    case 4:
      if(!arg2){R.send(ch,'你要把法術施在什麼東西上？\n');return null;}
      if(!(vo=R.getObjCarry(ch,arg2))){R.send(ch,'你身上沒有這樣東西.\n');return null;}
      break;
  }
  return {v,vo};
}
function delayedCast(ch,sn,arg2,mana){
  if(ch.deleted||!ch.room)return;
  if(ch.aff.has('PARALYZED')){R.send(ch,'你痲痺了.\n');return;}
  const s=SK[sn];
  if(!ch.npc&&ch.mana<mana){R.send(ch,'你的法力不夠了.\n');return;}
  const t=locate(ch,sn,arg2,true);if(!t)return;
  let {v,vo}=t;
  ch.wait=Math.max(ch.wait,Math.max(2,s.beats));
  if(!ch.npc&&R.pct()>10+R.getSkillPercent(ch,sn)+5*R.getSkillLevel(ch,sn)){
    R.send(ch,'你沒有辦法集中精神.\n');ch.mana-=Math.floor(mana/2);return;
  }
  if(!ch.npc)ch.mana-=mana;
  if(v&&v.deleted)return;
  if(v&&s.tar===1&&R.hasSpecial(v,'ANTI_MAGIC')&&ch!==v&&ch.cls!==R.WIZARD){R.act('你的魔法對$N起不了作用，看來他可能是魔法免疫.',ch,null,v,R.TO_CHAR);return;}
  R.castSpell(sn,R.urange(1,ch.level,R.L_APP-1),ch,vo);
  if(s.tar===1&&v&&!v.deleted&&v!==ch&&v.master!==ch&&R.isAwake(v)&&v.room===ch.room&&!v.fighting&&v.position!==P.DEAD)R.multiHit(v,ch);
}
/* 直接呼叫法術函式（卷軸、藥水、法杖、spec_cast 也走這裡） */
R.castSpell=function(sn,level,ch,vo){
  const s=SK[sn],f=s&&s.fun&&R.SPELL[s.fun];
  if(!f){R.send(ch,C.YEL+'「'+(s?s.cname:'?')+'」的效果在網頁版還沒移植。'+C.NOR+'\n');return;}
  try{f(sn,level,ch,vo);}catch(e){console.error(s.fun,e);R.send(ch,C.RED+'（法術執行錯誤：'+s.fun+'）'+C.NOR+'\n');}
};
R.castQ=[];
R.magicPulse=function(){
  for(const q of [...R.castQ]){
    if(--q.t>0)continue;
    R.castQ.splice(R.castQ.indexOf(q),1);
    delayedCast(q.ch,q.sn,q.arg2,q.mana);
  }
};
cmd.cast=function(ch,argument){
  if(ch.deleted)return;
  if(ch.aff.has('PARALYZED')){R.send(ch,'你痲痺了.\n');return;}
  let [arg1,rest]=R.one_arg(argument||'');
  if(/^\d+$/.test(arg1)){
    if(!ch.npc&&R.pct()>R.getSkillPercent(ch,R.gsn.multicasting)){R.send(ch,'你的多重施法失敗了！\n');return;}
    [arg1,rest]=R.one_arg(rest);   /* 簡化：多重施法只施一次 */
  }
  R.targetName=(rest||'').trim();
  const [arg2]=R.one_arg(R.targetName);
  if(!arg1){R.send(ch,'你要施什麼法術啊?\n');return;}
  if(ch.npc&&ch.aff.has('CHARM'))return;
  const sn=R.skillLookup(arg1);
  if(sn<=0||(!ch.npc&&R.getSkillPercent(ch,sn)===0)){R.send(ch,'你還沒學會這個法術.\n');return;}
  const s=SK[sn];
  if(!ch.npc&&ch.position<s.pos){
    if(ch.fighting){
      if(ch.room.people.some(g=>g.fighting===ch)&&R.getSkillPercent(ch,R.gsn.concentration)+R.getSkillLevel(ch,R.gsn.concentration)*3<R.pct()+30){R.send(ch,'你無法專心.\n');return;}
    }else{R.send(ch,'你無力施法.\n');return;}
  }
  if(ch.aff.has('SEAL_MAGIC')&&!R.isImm(ch)){R.send(ch,'你周圍的力場阻絕了你的魔法！\n');return;}
  if(ch.aff.has('MUTE')){R.send(ch,'你的嘴唇在動, 但是卻發不出聲音!\n');return;}
  if(ch.room.flags.has('CONE_OF_SILENCE')){R.send(ch,'你正處在一個不准施法的地方!\n');return;}
  const mana=s.mana;
  if(!ch.npc){
    if(ch.max_mana+Math.floor(ch.max_mana/5)<mana||ch.mana<mana){R.send(ch,'你的法力不夠了.\n');return;}
  }
  if(!s.fun){R.send(ch,'你還沒學會這個法術.\n');return;}   /* spell_null：技能不能用 cast */
  if(!locate(ch,sn,arg2,false))return;
  const delay=s.beats?R.urange(1,s.beats/(4+(ch.npc?0:R.getSkillLevel(ch,R.gsn.spellcraft))),4):0;
  if(s.name!=='ventriloquate')saySpell(ch,sn);
  if(!delay){delayedCast(ch,sn,arg2,mana);return;}
  const pulses=Math.round(delay*12);   /* PULSE_CALL_OUT = 3 秒 */
  R.castQ.push({ch,sn,arg2,mana,t:pulses});
  ch.wait=Math.max(ch.wait,pulses);
};

/* ---------- 狀態顯示（affect 指令） ---------- */
const LOCNAME={STR:'力量',DEX:'敏捷',INT:'智力',WIS:'智慧',CON:'體質',HIT:'生命力',MANA:'法力',MOVE:'移動力',AC:'防禦力',
  HITROLL:'命中率',DAMROLL:'傷害力',DODGE:'閃避',SEX:'性別'};
cmd.affect=cmd.affects=function(ch){
  const list=(ch.affects||[]).filter(a=>!a.deleted);
  if(!list.length){R.send(ch,'你沒有受到任何法術的影響.\n');return;}
  let s='你受到以下法術的影響:\n';
  for(const a of list){
    const k=SK[a.type];
    s+='法術: '+C.HIC+R.pad((k?k.cname+'('+k.name+')':'?'),30)+C.NOR;
    if(ch.level>=10){
      if(a.location!=='NONE')s+=' 影響'+(LOCNAME[a.location]||a.location)+' '+(a.modifier>=0?'+':'')+a.modifier;
      s+=a.duration<0?' 永久':' 剩 '+a.duration+' 小時';
    }
    s+='\n';
  }
  R.send(ch,s);
};
})(ROC);
