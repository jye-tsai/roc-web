/* fight.js — 戰鬥（對應 fight.c / fight_msg.c）。命中、傷害、經驗公式為簡化版 */
(function(R){
const C=R.C,P=R.POS,cmd=R.cmds,W=R.world,CORE=ROC.CORE;

R.stopFighting=function(ch,fBoth){
  for(const f of W.chars.concat(W.players)){
    if(f===ch||(fBoth&&f.fighting===ch)){f.fighting=null;if(f.position===P.FIGHTING)f.position=P.STANDING;}
  }
};
function setFighting(ch,v){
  if(ch.fighting)return;
  ch.fighting=v;ch.position=P.FIGHTING;
  if(ch.aff.has('SLEEP'))ch.aff.delete('SLEEP');
}
R.setFighting=setFighting;
function isSafe(ch,v){
  if(ch.room.flags.has('SAFE')||v.room.flags.has('SAFE')){R.send(ch,'這裡禁止戰鬥。\n');return true;}
  if(v.npc&&v.shop){R.act('$N 是商店老闆，不可以殺。',ch,null,v,R.TO_CHAR);return true;}   /* 推測 */
  return false;
}
R.isSafe=isSafe;
function thac0(ch){
  if(ch.npc)return 20-Math.floor(ch.level*30/42);
  const c=R.CONST.classes[ch.cls]||{thac0_00:18,thac0_42:0};
  return c.thac0_00+Math.floor((c.thac0_42-c.thac0_00)*ch.level/42);
}
function weaponDam(ch){
  const w=R.getEq(ch,16)||R.getEq(ch,19);
  let d;
  if(w&&w.values[1]>0&&w.values[2]>0)d=R.dice(w.values[1],w.values[2]);
  else if(ch.npc)d=R.rand(Math.floor(ch.level/2)+1,Math.floor(ch.level*3/2)+2);
  else d=R.rand(1,4)+Math.floor(ch.level/4);
  d+=ch.damroll;
  if(w&&w.wear.has('TWO_HAND'))d=Math.floor(d*1.3);
  return Math.max(1,d);
}
/* multi_hit 的攻擊次數（fight_hits.c）：NPC 依等級，PC 依 second/third attack＋敏捷 */
function attackChance(ch,sn,m){const l=R.getSkillLevel(ch,sn);return l*(l+6)+Math.floor(R.getSkillPercent(ch,sn)/m);}
function nAttacks(ch){
  let c1,c2;
  if(ch.npc){c1=ch.level*4;c2=ch.level*2;}
  else{const dex=R.stat(ch,3);c1=attackChance(ch,R.gsn.second_attack,2)+Math.max(0,(dex-10)*2);c2=attackChance(ch,R.gsn.third_attack,2)+Math.max(0,(dex-12)*2);}
  let n=1;
  if(R.pct()<c1){n++;if(R.pct()<c2)n++;}
  if(ch.aff.has('HASTE'))n++;   /* 推測 */
  return n;
}
/* 防禦判定（fight_check.c，簡化：無 reposte／autocombat／fool／種族） */
function checkParry(ch,v,ld){
  if(!R.isAwake(v))return false;
  const wp=R.getEq(v,16)||R.getEq(v,19);let chance;
  if(v.npc){if(!wp)return false;chance=Math.min(R.hasSpecial(v,'EXPERT')?20:10,v.level-(R.hasSpecial(v,'EXPERT')?35:40));}
  else{const s=R.gsn.parry,l=R.getSkillLevel(v,s);if(!R.getSkillPercent(v,s)||!wp)return false;chance=Math.floor(R.getSkillPercent(v,s)/11)+Math.floor(l*l*2/3);}
  if(R.pct()>=chance-R.urange(-10,ld,30))return false;
  R.act('$N 架開了你的攻擊.',ch,null,v,R.TO_CHAR);R.act('你架開了 $n 的攻擊.',ch,null,v,R.TO_VICT);
  return true;
}
function checkDodge(ch,v,ld){
  if(!R.isAwake(v))return false;let chance;
  if(v.npc)chance=Math.min(R.hasSpecial(v,'EXPERT')?40:30,Math.floor(v.level/(R.hasSpecial(v,'EXPERT')?3:4))+Math.max(0,v.level-(R.hasSpecial(v,'EXPERT')?60:40)));
  else{
    const s=R.gsn.dodge,l=R.getSkillLevel(v,s);if(!R.getSkillPercent(v,s))return false;
    chance=Math.floor(R.getSkillPercent(v,s)/11)+Math.floor(l*l*2/3)+R.stat(v,3)-15;
    chance=Math.min(chance-Math.floor(ld/2),40+l*2);
    chance-=Math.min(0,Math.floor((v.dodge||0)*l*l/6000));
  }
  if(R.pct()>=chance)return false;
  R.act('$N 靈巧地閃避你的攻擊.',ch,null,v,R.TO_CHAR);R.act('你靈巧地閃避$n的攻擊.',ch,null,v,R.TO_VICT);
  return true;
}
function checkBlock(ch,v,ld){
  if(!R.isAwake(v))return false;
  const sh=R.getEq(v,11);if(!sh)return false;
  const w=sh.weight||0;let chance;
  if(v.npc)chance=Math.min(30,Math.floor((w+v.level)/3));
  else{const s=R.gsn.block,l=R.getSkillLevel(v,s),pc=R.getSkillPercent(v,s);if(!pc)return false;chance=Math.floor(l*(l+4)/2)+Math.floor(pc/6)+Math.floor(w/3);}
  if(R.urange(2+Math.floor(R.stat(v,0)/3),chance-Math.max(0,ld),60)<R.pct())return false;
  R.act('$N 用盾牌擋住你的攻擊.',ch,null,v,R.TO_CHAR);R.act('你用盾牌擋住 $n 的攻擊.',ch,null,v,R.TO_VICT);
  return true;
}
R.checkDefense=function(ch,v){const ld=ch.level-v.level;return checkParry(ch,v,ld)||checkDodge(ch,v,ld)||checkBlock(ch,v,ld);};

function damMessage(ch,v,dam,i,n){
  const atk=R.attackName(ch);let tier=CORE.damage[CORE.damage.length-1][1];
  for(const [m,t] of CORE.damage)if(dam<=m){tier=t;break;}
  const cnt=i+'/'+n;
  let y,t,r;
  if(dam<0){
    y='你的 '+cnt+' 次'+atk+'沒有打中$N.';t='$n的 '+cnt+' 次'+atk+'沒有打中你.';r='$n的 '+cnt+' 次'+atk+'沒有打中$N.';
  }else if(dam===0){
    y='你的 '+cnt+' 次'+atk+'無法傷害$N.';t='$n的 '+cnt+' 次'+atk+'無法傷害你.';r='$n的 '+cnt+' 次'+atk+'無法傷害$N.';
  }else if(dam<=24){
    y='你的 '+cnt+' 次'+atk+tier+'$N.';t='$n的 '+cnt+' 次'+atk+tier+'你.';r='$n的 '+cnt+' 次'+atk+tier+'$N.';
  }else if(dam<=230){
    y='你的 '+cnt+' 次'+atk+'讓$N'+tier+'!';t='$n的 '+cnt+' 次'+atk+'讓你'+tier+'!';r='$n的 '+cnt+' 次'+atk+'讓$N'+tier+'!';
  }else{
    y='你的 '+cnt+' 次'+atk+'打得$N'+tier+'.';t='$n的 '+cnt+' 次'+atk+'打得你'+tier+'.';r='$n的 '+cnt+' 次'+atk+'打得$N'+tier+'.';
  }
  const dd=ch.npc?'':' '+C.HIW+'('+Math.max(dam,0)+')'+C.NOR;
  R.act(y+dd,ch,null,v,R.TO_CHAR);R.act(t,ch,null,v,R.TO_VICT);R.act(r,ch,null,v,R.TO_NOTVICT);
}

function oneHit(ch,v,i,n){
  if(v.deleted||ch.deleted||v.room!==ch.room||ch.position<P.FIGHTING&&ch.position!==P.STANDING)return;
  const ac=Math.max(-15,Math.floor(v.armor/10));
  const roll=R.rand(0,19),need=thac0(ch)-ch.hitroll;
  if(roll===0||(roll!==19&&roll<need-ac)){damMessage(ch,v,-1,i,n);setFighting(ch,v);setFighting(v,ch);return;}
  if(R.checkDefense(ch,v)){setFighting(ch,v);setFighting(v,ch);return;}
  let dam=weaponDam(ch);
  if(!R.isAwake(v))dam*=2;
  /* enhanced damage（fight_hits.c 2900） */
  if(!ch.npc){const s=R.gsn.enhanced_damage,l=R.getSkillLevel(ch,s);if(R.getSkillPercent(ch,s)&&R.getSkillPercent(ch,s)+l*5>R.pct())dam=dam*2+Math.floor(dam*l/4);}
  if(v.armor<0)dam=Math.max(0,dam-Math.floor(-v.armor/20));
  damage(ch,v,dam,i,n);
}
R.multiHit=function(ch,v){
  const n=nAttacks(ch);
  for(let i=1;i<=n;i++){if(v.deleted||ch.fighting&&ch.fighting!==v)break;oneHit(ch,v,i,n);if(v.deleted||v.position===P.DEAD)break;}
};

function damage(ch,v,dam,i,n,sn){
  if(v.position===P.DEAD)return;
  if(v!==ch){
    setFighting(ch,v);setFighting(v,ch);
    if(v.position<P.FIGHTING&&v.position>P.STUNNED){v.position=P.FIGHTING;}
  }
  if(sn!==undefined&&sn>=0&&R.spellDamMessage)R.spellDamMessage(ch,v,dam,sn);else if(sn!==-2)damMessage(ch,v,dam,i,n);
  v.hit-=dam;
  if(!v.npc&&R.isImm(v)&&v.hit<1)v.hit=1;
  updatePos(v);
  switch(v.position){
    case P.MORTAL:R.act('$n受了致命傷，如果沒人幫忙的話會死。',v,null,null,R.TO_ROOM);R.send(v,'你受了致命傷，如果沒人幫忙的話會死。\n');break;
    case P.INCAP:R.act('$n失去行動能力了，如果沒人幫忙的話會慢慢死去。',v,null,null,R.TO_ROOM);R.send(v,'你失去行動能力了，如果沒人幫忙的話會慢慢死去。\n');break;
    case P.STUNNED:R.act('$n被打昏了，但可能會復原。',v,null,null,R.TO_ROOM);R.send(v,'你被打昏了，但可能會復原。\n');break;
    case P.DEAD:
      R.act(C.HIR+CORE.deathcry[1]+C.NOR,v,null,null,R.TO_ROOM);
      R.send(v,C.HIR+'你被殺死了！！'+C.NOR+'\n\n');break;
  }
  if(v.position===P.DEAD){
    if(R.MP){R.MP.death(v,ch);R.MP.kill(ch,v);if(v.deleted||!v.room)return;}
    if(!ch.npc&&v.npc)groupGain(ch,v);
    if(!v.npc&&ch!==v){R.sendAll&&R.chatAll&&R.chatAll(C.HIR+R.sprintf(CORE.deathnews[1],v.name,ch.short||ch.name)+C.NOR);}
    rawKill(ch,v);
    return;
  }
  if(v===ch)return;
  if(R.MP&&v.npc&&sn>=0)R.MP.hurt(v,ch,sn);
  if(v.deleted||!v.room)return;
  /* 怪物逃跑 */
  if(v.npc&&!v.act.has('SENTINEL')&&v.hit<Math.floor(v.max_hit/8)&&R.pct()<25&&v.wait===0)cmd.flee(v,'');
  if(!v.npc&&v.hit>0&&v.hit<=v.wimpy&&v.wait===0)cmd.flee(v,'');
}
R.damage=damage;
function updatePos(v){
  if(v.hit>0){if(v.position<=P.STUNNED)v.position=P.STANDING;return;}
  if(v.npc||v.hit<=-11){v.position=P.DEAD;return;}
  v.position=v.hit<=-6?P.MORTAL:v.hit<=-3?P.INCAP:P.STUNNED;
}
R.updatePos=updatePos;
R.sprintf=(f,...a)=>{let i=0;return f.replace(/%[sd]/g,()=>a[i++]??'');};

function makeCorpse(v){
  const p=v.npc?W.corpseNpc:W.corpsePc;if(!p)return null;
  const c=R.createObject(p,0);
  c.short=R.sprintf(p.short_description,v.short||v.name);
  c.long=R.sprintf(p.long_description||'',v.short||v.name);
  c.name=(p.keywords||'corpse')+' '+R.lc(v.npc?v.name:v.name);
  c.timer=v.npc?R.rand(4,8):R.rand(25,40);
  if(!v.npc)c.owner=v.name;
  if(v.gold>0&&v.npc){
    const m=W.objs[v.gold===1?2:3];
    if(m){const g=R.createObject(m);g.values[0]=v.gold;if(/%d/.test(g.short))g.short=g.short.replace('%d',v.gold);R.objToObj(g,c);}
    v.gold=0;
  }
  for(const o of [...v.carrying]){if(o.wear_loc>=0)R.unequipChar(v,o);if(o.extra.has('INVENTORY')){R.extractObj(o);continue;}R.objToObj(o,c);}
  R.objToRoom(c,v.room);
  return c;
}
function rawKill(ch,v){
  R.stopFighting(v,true);
  const room=v.room,corpse=makeCorpse(v);
  /* 隔壁房間的慘叫 */
  room.exits.forEach(e=>{const t=e&&R.getRoom(e.to);if(t&&t!==room)for(const p of t.people)if(!p.npc&&R.isAwake(p))R.send(p,CORE.deathcry[2]+'\n');});
  if(v.npc){
    R.extractChar(v);
    if(!ch.npc&&corpse){
      if(ch.act.has('AUTOGOLD')){const g=corpse.contains.find(o=>o.type==='MONEY');if(g)R.getObj(ch,g,corpse);}
      if(ch.act.has('AUTOLOOT'))for(const o of [...corpse.contains])R.getObj(ch,o,corpse);
    }
    return;
  }
  /* 玩家死亡 */
  R.charFromRoom(v);
  const temple=R.getRoom(R.ROOM_TEMPLE);
  R.charToRoom(v,temple);
  v.position=P.RESTING;v.hit=1;v.mana=Math.max(1,v.mana);v.move=Math.max(1,v.move);
  const lose=Math.floor(R.expPer(v.level)/2);
  if(v.level>1)v.exp=Math.max(R.expPer(v.level)*v.level,v.exp-lose);   /* 簡化：扣半級經驗、不掉級 */
  R.send(v,C.HIY+CORE.revive+C.NOR+'\n');
  R.cmds.look(v,'auto');
  R.Save&&R.Save.save(v);
}

function xpCompute(ch,v){
  const d=v.level-ch.level;
  let xp=d<=-10?1:d<=-5?Math.max(5,30+d*5):Math.floor(R.expPer(ch.level)*(0.12+0.04*Math.min(d,10))*Math.max(1,v.level)/Math.max(1,ch.level));
  xp=Math.max(1,xp);
  if(v.act.has('PET'))xp=0;
  return R.fuzzy(xp);   /* 簡化：原版 xp_compute 未完整移植 */
}
function groupGain(ch,v){
  const members=ch.room.people.filter(p=>!p.npc&&(p===ch||p.master===ch||ch.master===p||p.master&&p.master===ch.master));
  for(const p of members){
    let xp=Math.floor(xpCompute(p,v)/members.length)||1;
    R.send(p,'你得到 '+C.HIG+xp+C.NOR+' 點經驗.\n');
    gainExp(p,xp);
  }
}
function gainExp(ch,xp){
  if(ch.npc||ch.level>=R.LEVEL_HERO)return;
  ch.exp=Math.max(R.expPer(ch.level)*ch.level,ch.exp+xp);
  while(ch.level<R.LEVEL_HERO&&ch.exp>=R.expNext(ch)){
    ch.level++;
    R.send(ch,C.HIY+CORE.levelup+C.NOR+'\n');
    advanceLevel(ch);
  }
}
R.gainExp=gainExp;
function advanceLevel(ch){
  const c=R.CONST.classes[ch.cls]||{hpmin:8,hpmax:12,fmana:1};
  const con=R.stat(ch,4);
  const hp=Math.max(1,R.rand(c.hpmin,c.hpmax)+Math.floor((con-13)/2));
  const mn=c.fmana?R.rand(2,Math.max(2,Math.floor((R.stat(ch,1)+R.stat(ch,2))/4))):0;
  const mv=R.rand(4,Math.max(5,Math.floor((con+R.stat(ch,3))/5)));
  const pr=Math.max(1,Math.floor(R.stat(ch,2)/5));
  ch.max_hit+=hp;ch.max_mana+=mn;ch.max_move+=mv;ch.practice+=pr;
  ch.base=ch.base||{};
  R.send(ch,'你獲得了 '+hp+' 點生命，'+mn+' 點魔法，'+mv+' 點移動，'+pr+' 次練習。\n');   /* 推測：原版字串未擷取 */
  const t=CORE.titles&&CORE.titles[c.cname];
  if(t&&t.length)ch.pc.title='- '+t[Math.min(ch.level,t.length-1)];
  R.Save&&R.Save.save(ch);
}

/* ---- 指令 ---- */
cmd.kill=function(ch,a){
  const [arg]=R.one_arg(a);
  if(!arg){R.send(ch,'要殺誰？\n');return;}
  const v=R.getCharRoom(ch,arg);
  if(!v){R.send(ch,'這裡沒有這個人.\n');return;}
  if(v.room.flags.has('SAFE')){R.send(ch,'這裡禁止戰鬥。\n');return;}
  if(v===ch){R.send(ch,'請使用 MURDER ！\n');return;}
  if(!v.npc){R.send(ch,'請使用 MURDER.\n');return;}
  if(isSafe(ch,v))return;
  if(ch.position===P.FIGHTING){R.send(ch,'你已經在戰鬥中了！\n');return;}
  ch.wait=Math.max(ch.wait,1);
  R.multiHit(ch,v);
};
cmd.hit=cmd.kill;
cmd.murder=function(ch,a){
  const [arg]=R.one_arg(a);
  if(!arg){R.send(ch,'Murder 誰？\n');return;}
  const v=R.getCharRoom(ch,arg);
  if(!v){R.send(ch,'這裡沒有這個人.\n');return;}
  if(v===ch){R.send(ch,'自殺是罪惡的.\n');return;}
  if(isSafe(ch,v))return;
  if(ch.position===P.FIGHTING){R.send(ch,'你已經在戰鬥中了！\n');return;}
  R.multiHit(ch,v);
};
cmd.flee=function(ch){
  const v=ch.fighting;
  if(!v){if(ch.position===P.FIGHTING)ch.position=P.STANDING;R.send(ch,'你沒有在跟人打架.\n');return;}
  const from=ch.room;
  for(let t=0;t<6;t++){
    const d=R.rand(0,5),e=from.exits[d];
    if(!e||e.closed||!R.getRoom(e.to))continue;
    if(ch.npc&&R.getRoom(e.to).flags.has('NO_MOB'))continue;
    R.act('$n 逃走了！',ch,null,null,R.TO_ROOM);
    R.stopFighting(ch,true);
    if(!R.moveChar(ch,d,true)){continue;}
    if(!ch.npc){ch.exp=Math.max(0,ch.exp-25);R.send(ch,'你自戰鬥中逃跑，損失了 '+C.HIG+'25'+C.NOR+' 點經驗.\n');}
    return;
  }
  R.send(ch,'你沒法逃跑。\n');
};
cmd.consider=function(ch,a){
  const [arg]=R.one_arg(a);
  if(!arg){R.send(ch,'要考量殺誰？\n');return;}
  const v=R.getCharRoom(ch,arg);if(!v){R.send(ch,'他不在這兒。\n');return;}
  if(!v.npc){R.send(ch,'想當殺人犯？考慮這麼多幹嘛，幹下去(murder)就對了！\n');return;}
  const d=v.level-ch.level;
  const msg=d<=-20?C.HIG+'你不穿防具也可以空手做掉$N。':d<=-10?C.HIG+'$N不值得你去殺他。':d<=-5?C.HIG+'$N看起來很好解決。':
    d<=5?C.HIY+'棋逢敵手！':d<=10?C.HIY+'你需要一點運氣才能打敗$N':d<=20?C.HIR+'$N毫不留情地對你大笑。':C.HIR+'死神會感謝你的禮物。';
  R.act(msg+C.NOR,ch,null,v,R.TO_CHAR);
  const pr=v.sex===1?'他':v.sex===2?'她':'它',rc=R.CONST.races[v.race]||{size:3,dodge:0},sz=rc.size;
  const s=sz>=9?'的體型跟恐龍差不多大。':sz>=8?'的體型像一頭飛龍。':sz>=7?'的體型能與巨人媲美。':sz>=6?'的身體與巨魔差不多大。':sz>=5?'跟托斯馬克的雕像差不多大。':
    sz>=4?'比一般成年人高大一些。':sz>=3?'沒特別高大，與人類差不多。':sz>=2?'矮小的身體，像個半身人。':sz>=1?'如同小妖精一樣，嬌小玲瓏。':'似乎不存在半點質量，跟空氣差不多！';
  const g=(rc.dodge||0)-v.level*12;   /* 簡化：GET_DODGE 近似 */
  const m=g>=200?'行動起來根本像一塊岩石。':g>=0?'動作像緩慢而痛苦地爬行。':g>=-50?'動作比蝸牛快不了多少。':g>=-150?'動作終於學會走路。':g>=-300?'行動速度不錯。':
    g>=-500?'行動非常敏捷。':g>=-700?'動如脫兔，一洩千里。':g>=-950?'敏捷得就像一隻麋鹿。':g>=-1000?'速度快得你看不到。':'速度根本就像一陣旋風。';
  R.send(ch,pr+s+'\n'+pr+m+'\n');
};
cmd.wimpy=function(ch,a){
  const [arg]=R.one_arg(a);const w=arg?parseInt(arg,10):Math.floor(ch.max_hit/5);
  if(isNaN(w)||w<0){R.send(ch,'你的勇氣超越了你的智慧.\n');return;}
  if(w>ch.max_hit/2){R.send(ch,'這樣太懦弱了吧.\n');return;}
  ch.wimpy=w;R.send(ch,'當生命低於 '+w+' 點時你會自動逃跑.\n');
};

/* 戰鬥回合（每 PULSE_VIOLENCE） */
R.violenceUpdate=function(){
  for(const ch of W.chars.concat(W.players)){
    const v=ch.fighting;if(!v||ch.deleted)continue;
    if(v.deleted||v.room!==ch.room){R.stopFighting(ch,false);continue;}
    if(R.isAwake(ch)&&ch.position>=P.FIGHTING){R.multiHit(ch,v);if(R.MP&&!ch.deleted&&ch.fighting)R.MP.round(ch);}
    else if(ch.position<P.FIGHTING&&ch.position>P.STUNNED)ch.position=P.FIGHTING;
  }
};
/* 主動怪 */
R.aggrCheck=function(ch){
  if(ch.npc||R.isImm(ch)||ch.room.flags.has('SAFE'))return;
  for(const m of [...ch.room.people]){
    if(!m.npc||!m.act.has('AGGRESSIVE')||m.fighting||!R.isAwake(m)||m.aff.has('CHARM'))continue;
    if(m.act.has('WIMPY')&&R.isAwake(ch))continue;
    if(!R.canSee(m,ch)||ch.level>=m.level+15)continue;
    R.multiHit(m,ch);
    break;
  }
};
})(ROC);
