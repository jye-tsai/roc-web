/* skills_cmd.js — 指令型技能（kick/backstab/rescue/disarm/sneak/hide/steal/…） */
(function(R){
const C=R.C,P=R.POS,W=R.world,SK=R.SK,cmd=R.cmds;

/* ── 共用 ───────────────────────────────────────────── */
const CL={THIEF:2,WARRIOR:3,BARBARIAN:4,ASSASSIN:9,NINJA:10,KNIGHT:11,SWORDSMAN:12,MONK:13,SHAMAN:14,LORD:16,RANGER:17,WARLORD:18,MARTIALMAN:19};
const STR=0,INT=1,WIS=2,DEX=3,CON=4;   /* 推測：R.stat 索引順序同 C 的 perm_stat */
const gs=(...names)=>{for(const n of names){const v=R.gsn[n];if(v!==undefined&&v>=0)return v;}return -1;};
const sl=(ch,sn)=>sn>=0?R.getSkillLevel(ch,sn):0;
const sp=(ch,sn)=>sn>=0?R.getSkillPercent(ch,sn):0;
const isAff=(ch,sn)=>sn>=0&&R.isAffected(ch,sn);
const beats=sn=>(SK[sn]&&SK[sn].beats)||0;
const wait=(ch,n)=>{ch.wait=Math.max(ch.wait||0,Math.max(0,n|0));};
const div=(a,b)=>Math.trunc(a/b);
const arg1=a=>R.one_arg(a||'')[0]||'';
const curr=(ch,i)=>R.stat(ch,i);
const raceOf=ch=>R.CONST.races[ch.race]||{};
const currSize=ch=>raceOf(ch).size||0;   /* 簡化：get_curr_size 以種族體型代替 */
const actHas=(ch,f)=>!!(ch.act&&ch.act.has&&ch.act.has(f));
const affHas=(ch,f)=>!!(ch.aff&&ch.aff.has(f));
const extraHas=(o,f)=>!!(o.extra&&o.extra.has&&o.extra.has(f));
const leaderOf=x=>{let l=x,n=0;while((l.leader||l.master)&&n++<20)l=l.leader||l.master;return l;};
const sameGroup=(a,b)=>R.isSameGroup?R.isSameGroup(a,b):(a===b||leaderOf(a)===leaderOf(b));
const stoneForm=ch=>isAff(ch,gs('stone_form'));

/* check_blind：看不見時給訊息 */
function checkBlind(ch){
  if(!ch.npc&&R.isImm(ch))return true;
  if(affHas(ch,'BLIND')){R.send(ch,'你什麼都看不到！\n');return false;}
  return true;
}
function thac0(ch){
  if(ch.npc)return 20-Math.floor(ch.level*30/42);
  const c=R.CONST.classes[ch.cls]||{thac0_00:18,thac0_42:0};
  return c.thac0_00+Math.floor((c.thac0_42-c.thac0_00)*ch.level/42);
}
/* one_hit(ch,victim,dt,wpn) 的近似：命中判定＋武器傷害＋技能倍率，訊息用技能名詞 */
function skillHit(ch,v,sn,loc,mod){
  if(!v||v.deleted||ch.deleted||v.room!==ch.room||v.position===P.DEAD)return -2;
  /* 簡化：命中只用 thac0／AC，未做 parry／dodge／block 與 critical */
  const ac=Math.max(-15,Math.floor((v.armor||0)/10)),roll=R.rand(0,19);
  if(R.isAwake(v)&&(roll===0||(roll!==19&&roll<thac0(ch)-(ch.hitroll||0)-ac))){R.damage(ch,v,-1,1,1,sn);return -1;}
  const w=R.getEq(ch,loc)||(loc===R.WEAR.WIELD?R.getEq(ch,R.WEAR.TWO_HAND):null);
  let d;
  if(w&&w.values&&w.values[1]>0&&w.values[2]>0)d=R.dice(w.values[1],w.values[2]);
  else if(ch.npc)d=R.rand(Math.floor(ch.level/2)+1,Math.floor(ch.level*3/2)+2);
  else d=R.rand(1,4)+Math.floor(ch.level/4);
  d+=ch.damroll||0;
  if(!R.isAwake(v))d*=2;
  if(mod)d=mod(d);
  d=div(d*R.weaknessDamage(v,sn),100);
  if((v.armor||0)<0)d-=Math.floor(-v.armor/20);
  d=Math.max(0,d);
  R.damage(ch,v,d,1,1,sn);
  return d;
}
/* find_door：只認方向字首（C 2021/11/23 版） */
function findDoor(ch,arg){
  let door=-1;
  for(let d=0;d<6;d++)if(R.str_prefix(arg,R.DIRS[d])){door=d;break;}
  if(door<0)return -1;
  const e=ch.room.exits[door];
  if(!e){R.send(ch,C.YEL+'哎呀，此路不通。'+C.NOR+'\n');return -2;}
  if(!e.isdoor){R.send(ch,C.YEL+'這方向你沒看到門。'+C.NOR+'\n');return -2;}
  return door;
}
const DIR_FANG=['北方','東方','南方','西方','上方','下方'];
function revExit(ch,door){
  const e=ch.room.exits[door],t=e&&R.getRoom(e.to);if(!t)return null;
  const r=t.exits[R.REV_DIR[door]];
  return r&&R.getRoom(r.to)===ch.room?{room:t,exit:r}:null;
}

/* ── kick（skill.c do_kick） ─────────────────────────── */
cmd.kick=function(ch,argument){
  const sn=R.gsn.kick,sklv=sl(ch,sn);
  if(!ch.npc&&sp(ch,sn)<=0){R.send(ch,'你不會飛踢，但如果想踢人屁股請用 kickass.\n');return;}
  if(ch.room.flags.has('SAFE')){R.send(ch,'這裡禁止戰鬥. \n');return;}
  if(!ch.npc&&!ch.fighting&&sklv<5){R.send(ch,'你並不是在戰鬥中.\n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  if(ch.npc&&(affHas(ch,'CHARM')||affHas(ch,'SUMMONED'))){R.send(ch,'什麼？\n');return;}
  if(!checkBlind(ch)&&sp(ch,gs('blind_fight'))<=R.pct())return;
  const arg=arg1(argument);let victim;
  if(arg){
    const vch=R.getCharRoom(ch,arg);
    /* 推測：C 以未初始化的 victim 比較，實際效果為狂暴中指定任何目標都被擋；此處以目前戰鬥目標比較 */
    if(isAff(ch,gs('berserk'))&&vch!==ch.fighting){R.send(ch,'你正殺得眼紅，只想打爛眼前的敵人！\n');return;}
    if(!vch){R.send(ch,'這裡沒有這個人.\n');return;}
    victim=vch;
  }else if(ch.fighting)victim=ch.fighting;
  else{R.send(ch,'你想對誰飛踢？\n');return;}
  if(victim===ch){if(cmd.kickass)cmd.kickass(ch,argument);return;}   /* 簡化：check_social kickass */
  const pwup=gs('powerup'),pw=isAff(ch,pwup)?sl(ch,pwup):0;
  const mv=90+pw*10;
  if(ch.move<mv){R.send(ch,'你太累了.\n');return;}
  const dex=curr(ch,DEX),wis=curr(ch,WIS),str=curr(ch,STR);
  let hit=ch.npc?(R.hasSpecial(ch,'EXPERT')?10:0)+ch.level+sklv*2:sp(ch,sn)+sklv;
  hit+=dex-curr(victim,DEX);   /* 推測：DEX_DIFF = 雙方敏捷差 */
  if(!victim.npc)hit-=sl(victim,gs('dodge'))+sl(victim,gs('fool_foe','fool'));   /* 簡化：無 autododge */
  const monk=(ch.cls===CL.MONK||ch.npc)?1:0;
  const edsn=gs('enhanced_damage'),ed=sl(ch,edsn);
  let dam=R.rand(ch.level-5,ch.level)+div(sklv*(sklv+4),2);
  if(R.pct()<sp(ch,edsn)+ed*2)dam=div(dam*(4+ed),3);
  dam+=div((ch.damroll||0)*(4+sklv)*(sklv+4+monk),100);   /* 簡化：無 apdr */
  dam=div(dam*(str+10),28);
  /* 簡化：無 PLR_FIST_FIGHT（fist_fight 加成） */
  if(pw)dam+=div(dam*(4+pw)*(4+pw),350);
  if(ch.npc)dam-=div(dam,3);   /* 簡化：無 npc class 32 */
  let bonus=div(dex+wis,2)+sklv*4;
  if(ch.npc)bonus=div(bonus,2);
  /* 簡化：無 blood thirsty、pdr */
  if(dam<0)dam=0;
  const old=dam;
  if(!ch.npc)ch.move-=mv;
  let ringout=false,door=0;
  const kickOnce=()=>{
    if(div(hit*R.weaknessPercent(victim,sn),100)>R.pct()){
      let d=R.rand(old,old*2);
      if(bonus>R.pct()){
        if(monk>0){door=R.rand(0,5);const e=ch.room.exits[door];if(e&&R.getRoom(e.to)&&!e.closed)ringout=true;}
        d*=2;
      }
      d=div(d*R.weaknessDamage(victim,sn),100);   /* 簡化：無 get_critical_damage */
      R.damage(ch,victim,d,1,1,sn);
      /* 簡化：靴子耐久、obj_hit、artifact 未實作 */
    }else R.spellDamMessage(ch,victim,-1,sn);
  };
  /* 簡化：Beholder／Centaur 種族追加飛踢未實作 */
  kickOnce();
  if(victim.deleted)return;
  let times=3;
  while(times--&&!victim.deleted&&victim.room===ch.room){
    if(ringout)break;
    if(ch.move<mv)break;
    if(ch.npc&&R.pct()>times*dex+div(ch.level,4))break;
    else if(R.pct()>times*dex*(1+monk)+sklv*2)break;
    if(!ch.npc)ch.move-=mv;
    kickOnce();
    if(victim.deleted)return;
  }
  /* 簡化：Lizardman 天生技未實作 */
  wait(ch,beats(sn)-div(sklv,2));
  if(ringout&&!victim.deleted&&victim.room===ch.room){
    if(isAff(victim,gs('defensive'))){R.send(victim,'你鋼鐵般的防禦，讓你避免遭受踢飛。\n');return;}
    if(div(str*(12+pw)-currSize(victim)*2,3)<R.pct())return;
    if(!victim.npc||!actHas(victim,'SENTINEL')){
      R.act('$n 被 $N 踢飛了！',victim,null,ch,R.TO_ROOM);
      R.send(victim,'你被踢飛了！\n');
      for(const rch of [...victim.room.people]){
        if(rch===victim||rch.fighting===victim){
          rch.fighting=null;rch.position=P.STANDING;
          if(isAff(rch,gs('berserk')))R.affectStrip(rch,gs('berserk'));
          R.updatePos(rch);
        }
      }
      R.moveChar(victim,door);
    }
  }
  if(!victim.deleted&&victim.fighting!==ch&&victim.room===ch.room)R.stopFighting(victim,false);
};

/* ── backstab（skill.c do_backstab；傷害倍率見 fight_hits.c） ── */
cmd.backstab=function(ch,argument){
  const sn=R.gsn.backstab;
  if(ch.npc&&(affHas(ch,'CHARM')||affHas(ch,'SUMMONED')))return;
  if(!ch.npc&&sp(ch,sn)===0){R.send(ch,'什麼？\n');return;}
  /* 簡化：無 autocombat */
  const arg=arg1(argument);
  if(!arg){R.send(ch,'背刺誰?\n');return;}
  const victim=R.getCharRoom(ch,arg);
  if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}
  if(victim===ch){R.send(ch,'你刺不到自己背後的要害.\n');return;}
  if(R.isSafe(ch,victim))return;
  const obj=R.getEq(ch,R.WEAR.WIELD)||R.getEq(ch,R.WEAR.TWO_HAND);
  if(!obj){R.send(ch,'主手武器必須裝備匕首類武器.\n');return;}
  if(!ch.npc&&obj.values[3]!==11){R.send(ch,'主手武器必須裝備匕首類武器.\n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  const bsl=sl(ch,sn),canBs=bsl>=4,bers=isAff(ch,gs('berserk'));
  let fightingBs=false;
  if(!ch.npc&&!ch.fighting&&victim.npc&&victim.fighting){
    if(canBs&&(ch.cls===CL.ASSASSIN||ch.cls===CL.NINJA||ch.cls===CL.RANGER))R.send(ch,'你偷偷摸摸地從暗處背刺！\n');
    else{R.send(ch,'你掌握不住敵人的節奏，偷襲不到戰鬥中的目標.\n');return;}
  }
  if(!ch.npc&&ch.fighting&&victim.npc){
    const at=sl(ch,gs('assassination','ass'))+sl(ch,gs('tricky_pacing'));
    if(at<4){R.send(ch,'你掌握不住敵人的節奏，偷襲不到戰鬥中的目標.\n');return;}
    if(victim.fighting&&!canBs){R.send(ch,'你掌握不住敵人的節奏，偷襲不到戰鬥中的目標.\n');return;}
    const h=R.time?R.time.hour:12;
    if(h>6&&h<18){
      if(ch.cls===CL.ASSASSIN){if(!bers&&at<6){R.send(ch,'白天視線良好，敵人察覺到你的意圖.\n');return;}}
      else{R.send(ch,'白天視線良好，敵人察覺到你的意圖.\n');return;}
    }
    if(ch.move<300){R.send(ch,'你的體力無法完成戰鬥背刺的動作.\n');return;}
    ch.move-=300;
    R.send(ch,bers?'你憑著野性的直覺，掌握住敵人攻擊的節奏，再度展開背刺攻擊.\n':'你倏地欺身於對手背後，再度展開背刺攻擊.\n');
    fightingBs=true;
  }else if(ch.move>bsl*20)ch.move-=bsl*20;
  else R.send(ch,'你太累了.\n');
  /* 簡化：check_killer（PK 旗標） */
  const bsMod=d=>ch.cls===CL.ASSASSIN?Math.floor(d+d*(1+bsl*1.5)):d+d*(1+bsl);
  let stun=0;
  if(!R.isAwake(victim)||ch.npc||affHas(ch,'DARK_RAID')||R.pct()<sp(ch,sn)+bsl*3){
    if(ch.npc||R.canSee(ch,victim)){
      const d=skillHit(ch,victim,sn,R.WEAR.WIELD,bsMod);
      if(d>=0)stun+=4;else if(d===-1)stun+=2;
    }
    const o2=R.getEq(ch,R.WEAR.WIELD_2),isdual=!!(o2&&o2.values[3]===11);
    if(!ch.npc&&!victim.deleted&&victim.room===ch.room&&R.canSee(ch,victim)&&
       (ch.cls===CL.NINJA||ch.cls===CL.ASSASSIN||ch.cls===CL.RANGER||ch.cls===CL.THIEF)){
      let chance=div(sp(ch,sn),10);
      /* 簡化：無 autocombat critical、prime_attr／snd_attr 加成 */
      const dsn=gs('dual');
      if(isdual)chance+=5*sl(ch,dsn)+div(sp(ch,dsn),10);
      chance+=bsl*6;
      if(fightingBs)chance=div(chance,2);
      if(ch.move<10+bsl*5)chance=0;
      if(affHas(ch,'DARK_RAID')||R.pct()<div(chance*R.weaknessPercent(victim,sn),100)){
        const d=skillHit(ch,victim,sn,isdual?R.WEAR.WIELD_2:R.WEAR.WIELD,bsMod);
        if(d>=0)stun+=2;if(d===-1)stun+=1;
        ch.move-=10+bsl*5;
      }
    }
    /* 簡化：Lizardman 天生技 */
    if(fightingBs)wait(ch,div(stun*3,2));
    else{wait(victim,stun);wait(ch,stun);}
  }else{
    wait(ch,beats(sn)*2);
    R.damage(ch,victim,-1,1,1,sn);
  }
  if(!victim.deleted&&victim.fighting!==ch&&victim.room===ch.room)R.stopFighting(victim,false);
};

/* ── berserk（skill.c do_berserk） ───────────────────── */
cmd.berserk=function(ch){
  const sn=gs('berserk'),sklv=sl(ch,sn);
  if(sn<0||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,'什麼？\n');return;}
  if(!ch.fighting){R.send(ch,'你並沒有在戰鬥.\n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  if(R.isAffected(ch,sn))return;
  R.send(ch,'你猛烈揮舞著武器，血水四散飛濺!\n\n');
  R.send(ch,'鮮血的滋味真好，血腥讓你發狂!\n\n');
  const bonus=ch.npc?div(ch.level,2):div(sp(ch,sn),10)+sklv+7;
  R.affectToChar(ch,{type:sn,duration:-1,location:'DAMROLL',modifier:bonus,bitvector:'NONE'});
  R.affectToChar(ch,{type:sn,duration:-1,location:'RDAMAGE',modifier:-3*bonus,bitvector:'NONE'});   /* 簡化：RDAMAGE 引擎無效果 */
  if(sklv>5)R.affectToChar(ch,{type:sn,duration:-1,location:'ADAMAGE',modifier:50,bitvector:'NONE'});   /* 簡化：ADAMAGE 引擎無效果 */
  R.affectToChar(ch,{type:sn,duration:-1,location:'DODGE',modifier:bonus*9,bitvector:'NONE'});
  if(sklv>4)R.affectJoin(ch,{type:sn,duration:-1,location:'DAMROLL',modifier:sklv*sklv-20,bitvector:'NONE'});
  R.send(ch,'你不顧一切，全力猛攻!\n\n');
  R.act('$n 殺得發狂!',ch,null,null,R.TO_ROOM);
};

/* ── hunt（skill.c do_hunt：同房間鎖定獵殺目標） ─────── */
function startHunt(ch,v){
  if(ch.hunting&&ch.hunting!==v&&!ch.hunting.deleted)R.act('$N 停止獵殺你。',ch.hunting,null,ch,R.TO_CHAR);
  ch.hunting=v;   /* 簡化：C 的 hunted 串列只記 ch.hunting */
  R.act('你開始獵殺 $N!\n',ch,null,v,R.TO_CHAR);
  R.act('$n 開始獵殺你！\n',ch,null,v,R.TO_VICT);
}
cmd.hunt=function(ch,argument){
  const sn=gs('hunt');
  if(sn<0||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,'什麼？\n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  const arg=arg1(argument);
  if(!ch.fighting){
    if(!arg){
      if(ch.hunting){
        const v=ch.hunting;
        R.act('你停止獵殺 $N.\n',ch,null,v,R.TO_CHAR);
        if(v.room===ch.room)R.act('$n 停止獵殺你.\n',ch,null,v,R.TO_VICT);
        ch.hunting=null;
      }else R.send(ch,'獵殺誰？\n');
      return;
    }
    const v=R.getCharRoom(ch,arg);
    if(!v){R.send(ch,'這裡沒有這個人.\n');return;}
    if(v===ch)return;
    if(!checkBlind(ch))return;
    if(R.isSafe(ch,v))return;
    if(ch.npc||R.pct()<sp(ch,sn)){startHunt(ch,v);R.multiHit(ch,v);}
    else{R.multiHit(v,ch);wait(ch,ch.cls===CL.KNIGHT?2:beats(sn));R.send(ch,'你失敗了！\n');}
    return;
  }
  const victim=ch.fighting;
  if(arg){
    const v=R.getCharRoom(ch,arg);
    if(!v){R.send(ch,'這裡沒有這個人.\n');return;}
    if(v!==victim&&!ch.npc){R.send(ch,'你正和別人打得火熱呢！\n');return;}
  }
  if(ch.hunting===victim){R.send(ch,'你已經在獵殺他了.\n');return;}
  startHunt(ch,victim);
};

/* ── track（skill.c do_track） ───────────────────────── */
/* 簡化：C 由移動程式自動跟蹤 ch->tracking；此處額外以 BFS（同區域、最多 40 房）提示第一步方向 */
function firstStep(from,to){
  if(!from||!to||from===to)return -1;
  const seen=new Set([from]),q=[];
  from.exits.forEach((e,d)=>{const t=e&&!e.closed&&R.getRoom(e.to);if(t&&!seen.has(t)){seen.add(t);q.push([t,d]);}});
  while(q.length&&seen.size<=40){
    const [r,d0]=q.shift();if(r===to)return d0;
    r.exits.forEach(e=>{const t=e&&!e.closed&&R.getRoom(e.to);if(t&&!seen.has(t)&&t.area===from.area){seen.add(t);q.push([t,d0]);}});
  }
  return -1;
}
R.trackStep=firstStep;
function showTrackDir(ch,v){
  const d=firstStep(ch.room,v.room);
  if(d>=0)R.send(ch,'你發現足跡往'+DIR_FANG[d]+'延伸。\n');   /* 推測：網頁版提示訊息，C 無此句 */
}
cmd.track=function(ch,argument){
  const sn=gs('track');
  const arg=arg1(argument);
  const findV=a=>R.getCharWorld(ch,a);   /* 推測：C 以 get_char_world 找目標 */
  {
    if(!arg){
      if(ch.tracking){R.act('你停止對 $N 的追蹤。\n',ch,null,ch.tracking,R.TO_CHAR);ch.tracking=null;}
      else R.send(ch,'你想要追蹤誰？\n');
      return;
    }
    const v=findV(arg);
    if(!v||!v.room){R.send(ch,'你找不到他。\n');return;}
    if(v===ch){
      if(ch.tracking){R.act('你停止對 $N 的追蹤。\n',ch,null,ch.tracking,R.TO_CHAR);ch.tracking=null;return;}
      R.send(ch,'你不需要跟蹤自己。\n');return;
    }
    if(ch.fighting&&v!==ch.fighting){R.send(ch,'你正和別人打得火熱呢！\n');return;}
    if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
    if(ch.npc||sn<0||R.pct()>sp(ch,sn)){R.send(ch,'你的經驗不夠，看不出對方的意向。\n');return;}
    wait(ch,beats(sn));
    ch.tracking=v;
    R.act('你開始追蹤 $N!\n',ch,null,v,R.TO_CHAR);
    showTrackDir(ch,v);
  }
};

/* ── frenzy（skill.c do_frenzy） ─────────────────────── */
cmd.frenzy=function(ch,argument){
  const sn=gs('frenzy'),sklv=sl(ch,sn);
  if(sn<0||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,'什麼？\n');return;}
  if(!ch.fighting){R.send(ch,'你並沒有在戰鬥.\n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  if(!ch.npc){
    if(ch.cls!==CL.MARTIALMAN&&ch.hit*4<ch.max_hit){R.send(ch,'你的體力不夠了.\n');return;}
    if(ch.move<150){R.send(ch,'你的體力不夠了.\n');return;}
  }
  let chance=ch.cls===CL.SHAMAN||ch.cls===CL.WARLORD?5:ch.cls===CL.MARTIALMAN?0:10;
  chance+=5;   /* 推測：prime_attr≠CON 時 +5，引擎無主屬性一律加 */
  if(!ch.npc&&R.pct()+chance>sp(ch,sn)){R.send(ch,'你失敗了！\n');return;}
  let victim=ch.fighting;
  const arg=arg1(argument);
  if(arg){
    const v=R.getCharRoom(ch,arg);
    if(!v){R.send(ch,'這裡沒有這個人.\n');return;}
    if(v!==victim){R.send(ch,'你正在和別人作戰。\n');return;}
  }
  R.send(ch,'你全身熱血沸騰!!!\n\n');
  R.act('$n 雙眼發紅，爆喝一聲向 $N 展開猛烈攻擊！',ch,null,victim,R.TO_NOTVICT);
  R.act('$n 雙眼發紅，爆喝一聲向你展開無情的攻擊！',ch,null,victim,R.TO_VICT);
  let extra=(ch.npc?9:div(sp(ch,sn),11))+div(sklv,2);
  if(ch.cls===CL.MARTIALMAN)extra+=3;
  const cost=()=>{
    if(ch.npc)return;   /* 推測：消耗只算 PC */
    switch(ch.cls){
      case CL.MARTIALMAN:ch.hit-=20-div(sklv,3);break;
      case CL.SHAMAN:ch.hit-=10;ch.move-=10;break;
      case CL.WARLORD:ch.hit-=15;ch.move-=5;break;
      case CL.RANGER:ch.hit-=10;ch.move-=20;break;
      default:ch.hit-=20-div(sklv,3);ch.move-=15-div(sklv,3);
    }
  };
  let i=0;
  if(sklv<4&&!ch.npc){
    for(i=0;i<4+extra;i++){
      if(victim.deleted||victim.room!==ch.room||victim.position===P.DEAD)break;
      skillHit(ch,victim,sn,R.WEAR.WIELD);
      cost();
      if(ch.move<0||ch.hit< -sklv*4)break;
    }
  }else{
    const k=sklv>=6?0:sklv>=5?1:2;
    const lv6hit=div(ch.max_hit,[150,180,225][k]);   /* 推測：PPL_HP_MULTIPLYER 視為 1 */
    let n;
    if(ch.npc)n=R.urange(4+extra,lv6hit,[20,15,10][k]);   /* 推測：C 的 NPC URANGE 式簡化 */
    else n=R.urange(5+extra,lv6hit,[24,18,12][k])+(ch.cls===CL.MARTIALMAN?3:0);
    for(i=0;i<n;i++){
      if(victim.deleted||victim.room!==ch.room||victim.position===P.DEAD)break;
      skillHit(ch,victim,sn,R.WEAR.WIELD);
      cost();
      if(ch.hit<0){ch.hit=1;break;}
      if(ch.move<0||(ch.wait||0)>299)break;
    }
  }
  wait(ch,beats(sn)+(ch.wait||0)+(ch.cls===CL.MARTIALMAN?div(i,2):i));
};

/* ── bashhead（skill.c do_bashhead；昏迷判定見 fight_hits.c） ── */
cmd.bashhead=function(ch,argument){
  const sn=gs('bashhead'),sklv=sl(ch,sn);
  if(sn<0||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,'什麼？\n');return;}
  if(!ch.npc&&!ch.fighting&&sklv<5){R.send(ch,'你並不是在戰鬥中.\n');return;}
  if(ch.room.flags.has('SAFE')){R.send(ch,'這裡禁止戰鬥. \n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  if(!ch.npc&&!R.getEq(ch,R.WEAR.WIELD)&&!R.getEq(ch,R.WEAR.TWO_HAND)&&!R.getEq(ch,R.WEAR.WIELD_2)){R.send(ch,'你至少必須拿把武器.\n');return;}
  if(!ch.npc&&ch.move<300){R.send(ch,'你覺得太累了.\n');return;}
  const arg=arg1(argument);let victim;
  if(arg){victim=R.getCharRoom(ch,arg);if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}}
  else if(ch.fighting)victim=ch.fighting;
  else{R.send(ch,'你想對誰頭部猛擊？\n');return;}
  if(victim===ch)return;
  if(R.isSafe(ch,victim))return;
  if(!ch.npc)ch.move-=250;
  const dexdiff=curr(ch,DEX)-curr(victim,DEX);
  const ok=ch.npc?ch.level>R.pct()+dexdiff:div((div(sp(ch,sn),2)+sklv*6)*R.weaknessPercent(victim,sn),100)>R.pct()+dexdiff;
  if(ok){
    const add=ch.npc?div((ch.damroll||0)*ch.level,200):div((ch.damroll||0)*sklv,15);
    ch.damroll=(ch.damroll||0)+add;
    const d=skillHit(ch,victim,sn,R.WEAR.WIELD);
    ch.damroll-=add;
    if(d>0&&!victim.deleted&&victim.position>P.STUNNED){
      let st=0;const bz=gs('berserk'),pu=gs('powerup');
      if(isAff(ch,bz)&&sl(ch,bz)>2)st+=sl(ch,bz)-2;
      if(isAff(ch,pu)&&sl(ch,pu)>2)st+=sl(ch,pu)-2;
      st+=(curr(ch,STR)-3)-div(curr(victim,CON),1+sklv);   /* 簡化：無 PLR_FIST_FIGHT 分支 */
      if(st>div(R.pct()*R.weaknessPercent(victim,sn),100)){
        victim.position=P.STUNNED;
        wait(victim,beats(sn));
        R.send(ch,'你對他的頭部猛擊，把他打暈了！\n');
        R.act('$n 往 $N 頭擊猛擊把他打暈了！',ch,null,victim,R.TO_ROOM);
        R.act('$n 朝你頭部狠狠猛擊，打得你天旋地轉！',ch,null,victim,R.TO_VICT);
      }
    }
  }else R.damage(ch,victim,-1,1,1,sn);
  if(!victim.deleted&&victim.fighting!==ch&&victim.room===ch.room)R.stopFighting(victim,false);
  wait(ch,10-sklv);
};

/* ── rescue（skill_defensive.c do_rescue） ───────────── */
cmd.rescue=function(ch,argument){
  const sn=R.gsn.rescue,sklv=sl(ch,sn);
  if(ch.npc&&affHas(ch,'CHARM')){R.send(ch,'什麼？\n');return;}
  if(stoneForm(ch)){R.send(ch,'你無法在石化狀態下使用技巧.\n');return;}
  if(isAff(ch,gs('berserk'))){R.send(ch,'你正殺得眼紅！\n');return;}
  const arg=arg1(argument);
  if(!arg){R.send(ch,'要解救誰?\n');return;}
  const victim=R.getCharRoom(ch,arg);
  if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}
  if(victim===ch){R.send(ch,'想自救？試試 flee 指令吧！\n');return;}
  if(ch.fighting===victim){R.send(ch,'一刀讓他解脫比較快.\n');return;}
  if(!victim.fighting){R.send(ch,'你只能解救戰鬥中的目標.\n');return;}
  if(!ch.npc&&!sameGroup(ch,victim)){R.send(ch,'你幹嘛這麼多事？\n');return;}
  if(!checkBlind(ch))return;
  let done=false;
  for(const fch of [...ch.room.people]){
    if(fch.deleted||fch.fighting!==victim)continue;
    if(!ch.npc){
      const need=200-sklv*20;
      if(ch.move<need){R.send(ch,'你太累了。\n');return;}
      ch.move-=need;
    }
    done=true;
    const fail=ch.npc?R.pct()>Math.min(85,sklv*12+div(ch.level,2)):R.pct()>(sp(ch,sn)-20)+sklv+div(sklv*sklv,2);
    if(fail){
      R.act('你試著解救$N，可惜失敗了。',ch,null,victim,R.TO_CHAR);
      R.act('$n試著解救$N，可惜失敗了。',ch,null,victim,R.TO_NOTVICT);
      R.act(C.HIG+'$n試著解救你，可惜失敗了。'+C.NOR,ch,null,victim,R.TO_VICT);
      continue;
    }
    R.act(C.HIG+'你解救了 $N！'+C.NOR,ch,null,victim,R.TO_CHAR);
    R.act(C.HIG+'$n 解救了 $N！'+C.NOR,ch,null,victim,R.TO_NOTVICT);
    R.act(C.HIG+'$n 解救了你！'+C.NOR,ch,null,victim,R.TO_VICT);
    R.stopFighting(fch,false);R.stopFighting(ch,false);
    R.setFighting(fch,ch);R.setFighting(ch,fch);
    /* 簡化：rescue 鎖定目標的 qmark 未實作 */
  }
  if(done)wait(ch,14-sklv*2);
};

/* ── disarm（skill_defensive.c do_disarm＋fight.c disarm()） ── */
function disarm(ch,victim){
  if(!victim.npc&&victim.cls<4)return;
  if(currSize(ch)-currSize(victim)< -2)return;
  const obj=R.getEq(victim,R.WEAR.WIELD)||R.getEq(victim,R.WEAR.WIELD_2)||R.getEq(victim,R.WEAR.TWO_HAND);
  if(!obj){R.send(ch,'你的目標並沒有裝備武器！\n');return;}
  if(ch.npc&&50>R.pct()){R.send(ch,'你無法擊落對手的武器。\n');return;}
  if(R.getEq(victim,R.WEAR.TWO_HAND)&&40>R.pct()){R.send(ch,'對方雙手緊握武器，你無法擊落對方的武器。\n');return;}
  const sm=gs('swordmaster'),bh=gs('barehand'),ds=R.gsn.disarm;
  if(!victim.npc&&sp(victim,sm)>0){
    const svl=sl(victim,sm),sw=victim.cls===CL.SWORDSMAN?svl*10:0;
    const c=ch.npc?div(sp(victim,sm),2)+svl*45+sw-ch.level-sl(ch,ds)*sl(ch,ds)
                  :div(sp(victim,sm),2)+svl*30+sw-sl(ch,bh)*3-sl(ch,ds)*3;
    if(c>R.pct()){
      R.act('$N 高超的御劍術防止 $n 擊落$S武器！',ch,null,victim,R.TO_NOTVICT);
      R.act('你高超的御劍術防止 $n 擊落你的武器！',ch,null,victim,R.TO_VICT);
      return;
    }
  }
  if(victim.npc&&(R.hasSpecial(victim,'NO_DISARM')||
     (actHas(ch,'HARD_DIS')&&victim.level-sl(ch,ds)*5-sl(ch,bh)*5>R.pct()))){
    R.act('$N 高超的御劍術防止 $n 擊落$S武器！',ch,null,victim,R.TO_NOTVICT);
    return;
  }
  if(extraHas(obj,'NOREMOVE')){R.send(ch,'你無法擊落對方的武器。\n');return;}
  R.act(C.HIY+'你擊落了 '+C.NOR+'$N'+C.HIY+' 的武器！'+C.NOR,ch,null,victim,R.TO_CHAR);
  R.act('$n'+C.HIY+' 擊落了 '+C.NOR+'$N'+C.HIY+' 的武器！'+C.NOR,ch,null,victim,R.TO_NOTVICT);
  R.act('$n'+C.HIY+' 擊落了你的武器 '+C.NOR+'$p'+C.HIY+' ！'+C.NOR,ch,obj,victim,R.TO_VICT);
  R.unequipChar(victim,obj);
  if(!(victim.npc||extraHas(obj,'NODROP')))R.objToRoom(obj,victim.room);
}
R.disarm=disarm;
cmd.disarm=function(ch,argument){
  const sn=R.gsn.disarm;
  if((ch.npc&&(affHas(ch,'CHARM')||affHas(ch,'SUMMONED')))||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,'你不懂得如何擊落別人的武器.\n');return;}
  const W_=R.WEAR;
  if(!R.getEq(ch,W_.WIELD)&&!R.getEq(ch,W_.WIELD_2)&&!R.getEq(ch,W_.TWO_HAND)){R.send(ch,'你得先拿把武器才行.\n');return;}
  if(!ch.fighting){R.send(ch,'你並沒有在戰鬥.\n');return;}
  const arg=arg1(argument);let victim=ch.fighting;
  if(arg){victim=R.getCharRoom(ch,arg);if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}}
  if(victim.fighting!==ch&&ch.fighting!==victim){R.act('$E 並沒有在和你戰鬥！',ch,null,victim,R.TO_CHAR);return;}
  if(!R.getEq(victim,W_.WIELD)&&!R.getEq(victim,W_.WIELD_2)&&!R.getEq(victim,W_.TWO_HAND)){R.send(ch,'你的目標並沒有裝備武器.\n');return;}
  let percent=R.pct()+(victim.level-ch.level)*2+sl(ch,sn)*2;
  percent=div(percent*R.weaknessPercent(victim,sn),100);
  if(!R.getEq(ch,W_.WIELD)&&!R.getEq(ch,W_.TWO_HAND))percent*=2;
  if(ch.npc){
    if(percent<R.pct()){disarm(ch,victim);wait(victim,beats(sn));}
  }else if(percent<div(sp(ch,sn)*2,3)){disarm(ch,victim);wait(victim,beats(sn));}
  else R.send(ch,'你失敗了.\n');
  wait(ch,beats(sn));
  /* 簡化：mprog_hurt_trigger */
};

/* ── sneak / hide（act_move.c） ──────────────────────── */
cmd.sneak=function(ch){
  const sn=R.gsn.sneak;
  if((ch.npc&&affHas(ch,'CHARM'))||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,C.YEL+'啥？'+C.NOR+'\n');return;}
  R.send(ch,C.CYN+'你試著悄悄地移動。'+C.NOR+'\n');
  R.affectStrip(ch,sn);
  if(ch.npc||R.pct()<sp(ch,sn))
    R.affectToChar(ch,{type:sn,duration:ch.level+sl(ch,sn)*3,location:'NONE',modifier:0,bitvector:'SNEAK'});
};
cmd.hide=function(ch){
  const sn=R.gsn.hide;
  if((ch.npc&&affHas(ch,'CHARM'))||(!ch.npc&&sp(ch,sn)===0)){R.send(ch,C.YEL+'啥？'+C.NOR+'\n');return;}
  if(affHas(ch,'HIDE')){ch.aff.delete('HIDE');R.send(ch,'你停止藏匿。\n');return;}
  if(ch.npc||R.pct()<sp(ch,sn)){ch.aff.add('HIDE');R.send(ch,C.CYN+'你藉著地形的掩護，躲藏起來。'+C.NOR+'\n');}
  else R.send(ch,C.CYN+'你失敗了。'+C.NOR+'\n');
};

/* ── pick（act_move.c do_pick） ──────────────────────── */
cmd.pick=function(ch,argument){
  const sn=gs('pick_lock'),arg=arg1(argument);
  if(!arg){R.send(ch,'要把什麼的鎖撬開？\n');return;}
  wait(ch,beats(sn));
  const skillFail=()=>!ch.npc&&R.pct()>sp(ch,sn);   /* 簡化：NPC 一律成功 */
  const door=findDoor(ch,arg);
  if(door>=0){
    const e=ch.room.exits[door],kw=e.kw||'門';
    if(!e.closed){R.send(ch,'這道門不是關著的。\n');return;}
    if(e.key==null||e.key<0){R.send(ch,'這道門沒有鎖，或是撬不開。\n');return;}
    if(!e.locked){R.send(ch,'這道門的鎖已經開了。\n');return;}
    for(const g of ch.room.people){
      if(g===ch||!g.npc||!R.isAwake(g)||!R.canSee(g,ch))continue;
      if(actHas(g,'PET')||affHas(g,'CHARM')||sameGroup(g,ch))continue;
      if(actHas(g,'SENTINEL')&&actHas(g,'STAY_AREA')){R.act('$N站得離這門鎖實在太近了。',ch,null,g,R.TO_CHAR);return;}
    }
    if(e.pickproof||skillFail()){   /* 簡化：引擎門資料無 PICKPROOF 旗標 */
      R.act('$n'+C.NOR+'試著撬開$d'+C.NOR+'的鎖，但失敗了。',ch,null,kw,R.TO_ROOM);
      R.send(ch,'你沒能成功。\n');return;
    }
    e.locked=false;
    R.send(ch,'※喀啦※\n');
    R.act('你把'+DIR_FANG[door]+'的$d'+C.NOR+'的鎖給撬開了。',ch,null,kw,R.TO_CHAR);
    R.act('$n'+C.NOR+'把'+DIR_FANG[door]+'的$d'+C.NOR+'的鎖給撬開了。',ch,null,kw,R.TO_ROOM);
    const rv=revExit(ch,door);if(rv)rv.exit.locked=false;
    return;
  }
  if(door<=-2)return;
  const obj=R.getObjHere(ch,arg);
  if(obj){
    if(obj.type!=='CONTAINER'){R.send(ch,'這東西不是個容器。\n');return;}
    const v1=obj.values[1]|0;
    if(!(v1&4)){R.send(ch,'這東西不是關著的。\n');return;}
    if(obj.values[2]<0){R.send(ch,'這東西的鎖打不開。\n');return;}
    if(!(v1&8)){R.send(ch,'這東西的鎖已經開了。\n');return;}
    if(v1&2){R.send(ch,'你沒能成功。\n');return;}   /* 推測：CONT_PICKPROOF = 2 */
    if(skillFail()){
      R.act('$n'+C.NOR+'試著撬開$p'+C.NOR+'的鎖，但失敗了。',ch,obj,null,R.TO_ROOM);
      R.send(ch,'你沒能成功。\n');return;
    }
    obj.values[1]=v1&~8;
    R.send(ch,'※喀啦※\n');
    R.act('$n'+C.NOR+'把$p'+C.NOR+'的鎖給撬開了。',ch,obj,null,R.TO_ROOM);
    return;
  }
  R.send(ch,'這裡沒有這種鎖。\n');
};

/* ── bash（act_move.c do_bash：撞門，指令字 bashdoor） ── */
cmd.bash=function(ch,argument){
  const sn=gs('bash','bash_door'),sklv=sl(ch,sn);
  if(!ch.room)return;
  if(ch.npc||sp(ch,sn)===0){R.send(ch,C.YEL+'你不是一個強到可以撞開門的戰士！'+C.NOR+'\n');return;}
  const arg=arg1(argument);
  if(!arg){R.send(ch,C.YEL+'要撞開什麼？'+C.NOR+'\n');return;}
  if(ch.fighting){R.send(ch,C.YEL+'你不能中斷你的打鬥。'+C.NOR+'\n');return;}
  if(ch.hit*3<ch.max_hit){R.send(ch,C.YEL+'你太虛弱了。'+C.NOR+'\n');return;}
  const door=findDoor(ch,arg);
  if(door>=0){
    const e=ch.room.exits[door],kw=e.kw||'門';
    if(!e.closed){R.send(ch,C.YEL+'冷靜點。那已經開了。'+C.NOR+'\n');return;}
    wait(ch,beats(sn));
    let chance=div(sp(ch,sn),2);
    if(e.locked)chance=div(chance,2);
    const str=curr(ch,STR);
    if(e.bashproof){   /* 簡化：引擎門資料無 BASHPROOF 旗標 */
      R.act(C.YEL+'砰！！你用力地往$d上撞，但是它動也不動。'+C.NOR,ch,null,kw,R.TO_CHAR);
      R.act(C.CYN+'砰！！！$n用力地往$d上撞，但是它依然屹立不搖。'+C.NOR,ch,null,kw,R.TO_ROOM);
      R.damage(ch,ch,div(ch.max_hit,3),1,1,sn);
    }else if(str+sklv*4>=20&&R.pct()<chance+4*(str+sklv*4-20)){
      e.closed=false;e.locked=false;e.bashed=true;
      R.act('劈哩啪啦！你把'+DIR_FANG[door]+'的$d'+C.NOR+'撞開了。',ch,null,kw,R.TO_CHAR);
      R.act('劈哩啪啦！$n'+C.NOR+'把'+DIR_FANG[door]+'的$d'+C.NOR+'撞開了。',ch,null,kw,R.TO_ROOM);
      R.damage(ch,ch,div(ch.max_hit,20),1,1,sn);
      const rv=revExit(ch,door);
      if(rv){
        rv.exit.closed=false;rv.exit.locked=false;rv.exit.bashed=true;
        const rkw=rv.exit.kw||'門';
        for(const rch of rv.room.people){
          if(rch.deleted)continue;
          R.act('劈哩啪啦！'+DIR_FANG[R.REV_DIR[door]]+'的$d'+C.NOR+'被撞開了。',rch,null,rkw,R.TO_CHAR);
        }
      }
      /* 簡化：rprog_trap_trigger */
    }else{
      R.act(C.YEL+'噢！你用力地往$d上撞，但是它動也不動。'+C.NOR,ch,null,kw,R.TO_CHAR);
      R.act(C.CYN+'$n用力地往$d上撞，但是它依然屹立不搖。'+C.NOR,ch,null,kw,R.TO_ROOM);
      R.damage(ch,ch,div(ch.max_hit,10),1,1,sn);
    }
  }
  if(door===-2){
    R.act(C.YEL+'噢！！你發瘋似的用力地往堅硬的表面撞去。'+C.NOR,ch,null,null,R.TO_CHAR);
    R.act(C.CYN+'噢！！$n發瘋似的用力地往堅硬的表面撞去。'+C.NOR,ch,null,null,R.TO_ROOM);
    R.damage(ch,ch,div(ch.max_hit,5),1,1,sn);
    return;
  }
  if(door<=-2)return;
  if(ch.deleted||ch.hit<=1||!ch.room)return;
  if(ch.room.flags.has('SAFE'))return;
  for(const g of [...ch.room.people]){
    if(g.deleted||!g.npc)continue;
    if(actHas(g,'PET')||affHas(g,'CHARM')||affHas(g,'SUMMONED'))continue;
    if(sameGroup(ch,g))continue;
    { const l=leaderOf(g);if(l!==g&&!l.npc)continue; }
    if(g.fighting)continue;
    if(R.isAwake(g)&&R.canSee(g,ch)&&actHas(g,'SENTINEL')&&actHas(g,'STAY_AREA')&&R.rand(0,3)>=2)R.multiHit(g,ch);
  }
};

/* ── steal（act_obj.c do_steal） ─────────────────────── */
cmd.steal=function(ch,argument){
  const sn=R.gsn.steal,sklv=sl(ch,sn);
  if(ch.npc||actHas(ch,'HORSE')){R.send(ch,'不行.\n');return;}
  let [a1,rest]=R.one_arg(argument||'');const a2=arg1(rest);
  if(!a1||!a2){R.send(ch,'從誰身上偷什麼?\n');return;}
  const victim=R.getCharRoom(ch,a2);
  if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}
  if(victim.npc&&actHas(victim,'HORSE')){R.send(ch,'你失敗了。\n');return;}
  if(victim===ch){R.send(ch,'你摸了摸自己的口袋.\n');return;}
  if(R.isSafe(ch,victim))return;
  let obj=null;
  wait(ch,beats(sn));
  let percent=div(ch.level*3,2);
  percent+=R.rand(-10,10);
  percent-=victim.level*2;
  percent+=sklv+div(sklv,2)+div(sklv,6)*4;
  if(!R.isAwake(victim))percent+=20;
  percent+=sp(ch,sn);
  if(affHas(ch,'SNEAK'))percent+=5;
  if(!R.canSee(ch,victim))percent+=10;
  percent=div(percent*R.weaknessPercent(victim,sn),100);
  const isGold=R.str_prefix(a1,'coins')||R.lc(a1)==='gold';
  if(isGold)percent=Math.trunc(percent*1.2);
  else{
    const [number,name]=R.num_arg(a1);let count=0;
    for(const o of victim.carrying){if(R.canSeeObj(ch,o)&&R.is_name(name,o.name)&&++count===number){obj=o;break;}}
    if(!obj){R.send(ch,'沒有這樣物品.\n');return;}
    if(obj.wear_loc<0){
      const ld=victim.level-ch.level;
      percent=Math.trunc(percent*(ld<3?.8:ld<8?.6:ld<15?.4:.2));
    }else percent=Math.trunc(percent*.05);
  }
  if(victim.npc&&victim.shop)percent=-1;
  const vamp=R.lc(raceOf(victim).name)==='vampire';
  if((!victim.npc&&((!actHas(victim,'KILLER')&&!actHas(victim,'THIEF')&&!actHas(victim,'REGISTER')&&!vamp)||ch.level-victim.level<5))||percent<R.pct()){
    R.send(ch,'糟糕，被發現了！\n');
    R.act('你發現 $n 想從你身上偷東西！\n',ch,null,victim,R.TO_VICT);
    R.act('$n 想從 $N 身上偷東西，但是被發現了！ \n',ch,null,victim,R.TO_NOTVICT);
    const buf=ch.name+' 是個可惡的小偷！';
    try{if(cmd.shout)cmd.shout(victim,buf);}catch(e){}
    if(victim.npc)R.multiHit(victim,ch);
    else{
      /* 簡化：無 PK 執照／registered 機制，視為未登記 */
      if(!actHas(ch,'THIEF')){ch.act.add('THIEF');R.send(ch,C.HIP+'***  你是個小偷！！ ***'+C.NOR+'\n');}
    }
    return;
  }
  if(isGold){
    const amount=div((victim.gold||0)*R.rand(1,10),20);
    if(amount<=0){R.send(ch,'你偷不到半毛錢.\n');return;}
    ch.gold+=amount;victim.gold-=amount;
    R.send(ch,'得手了！  你偷到了 '+C.HIY+amount+C.NOR+' 枚金幣.\n');
    return;
  }
  if((extraHas(obj,'NODROP')&&!R.isImm(ch))||extraHas(obj,'INVENTORY')||(obj.level||0)>ch.level){R.send(ch,'你摸到了，可是卻拿不走.\n');return;}
  if(R.carryN(ch)+1>R.canCarryN(ch)){R.send(ch,'你拿不下更多東西了.\n');return;}
  if(R.carryW(ch)+R.objWeight(obj)>R.canCarryW(ch)){R.send(ch,'你帶不動更多重量了.\n');return;}
  if(obj.wear_loc>=0){R.send(ch,'你摸到了，可是卻拿不走.\n');return;}
  R.send(ch,'得手了！\n');
  R.send(ch,'Ok.\n');
  R.objToChar(obj,ch);
  /* 簡化：oprog_act_trigger steal／steal_target */
};

/* ── scan（act_info.c do_scan / scan_print） ─────────── */
const SCAN_DIR=['北邊','東邊','南邊','西邊','上面','下面'],SCAN_FAR=['',' 不遠',' 較遠處'];
function scanPrint(ch,room,door,level){
  if(!room||R.roomDark(room))return;
  const sn=gs('scan');
  for(const pch of room.people){
    if(!ch.npc&&!R.isImm(ch)&&(R.pct()>Math.min(sp(ch,sn),95)||!R.canSee(ch,pch)))continue;
    R.act('$N 在你的 '+SCAN_DIR[door]+SCAN_FAR[level-1],ch,null,pch,R.TO_CHAR);
  }
}
cmd.scan=function(ch){
  const sn=gs('scan');
  if(!ch.npc&&R.lc(raceOf(ch).name)!=='hobbit'&&R.pct()>sp(ch,sn)){R.send(ch,'你失敗了!\n');return;}
  if(stoneForm(ch)){R.send(ch,'你在石化狀態下不能移動.\n');return;}
  if(affHas(ch,'HOLD')){
    R.send(ch,isAff(ch,gs('snare'))?'你被困在陷阱裡了！你不能移動！\n':'你的身體動彈不得！你不能移動！\n');return;
  }
  if(affHas(ch,'PARALYZED')){R.send(ch,'你因麻痺而動彈不得！\n');return;}
  for(let i=0;i<6;i++){
    let e=ch.room.exits[i];
    if(!e||e.closed)continue;
    let t=R.getRoom(e.to);scanPrint(ch,t,i,1);
    e=t&&t.exits[i];if(!e||e.closed)continue;
    t=R.getRoom(e.to);scanPrint(ch,t,i,2);
    e=t&&t.exits[i];if(!e||e.closed)continue;
    scanPrint(ch,R.getRoom(e.to),i,3);
  }
};

/* ── peek（C 無獨立指令，為 look 角色時的技能判定；網頁版另提供 peek 指令） ── */
cmd.peek=function(ch,argument){
  const sn=gs('peek');
  if(ch.npc||sp(ch,sn)===0){R.send(ch,'什麼？\n');return;}
  const arg=arg1(argument);
  if(!arg){R.send(ch,'你想偷看誰？\n');return;}   /* 推測 */
  const v=R.getCharRoom(ch,arg);
  if(!v){R.send(ch,'這裡沒有這個人.\n');return;}
  if(v===ch||R.pct()>=sp(ch,sn)){R.send(ch,'你失敗了。\n');return;}   /* 推測 */
  if(v.npc&&v.shop){R.send(ch,'\n一種奇怪的力量阻絕你的窺視！\n');return;}
  R.send(ch,R.showList(v.carrying,ch,true,true));
};
})(ROC);
