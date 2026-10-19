/* update.js — 遊戲脈動：時間天氣、回復、怪物遊蕩、物品腐爛、區域重置（對應 update.c）
   簡化：PULSE 250ms；violence=3 秒、mobile=4 秒、tick=30 秒、area=60 秒；回復量為近似值 */
(function(R){
const C=R.C,P=R.POS,W=R.world,TW=ROC.CORE.timeweather;
R.bootTime=new Date();
R.time={hour:R.rand(0,23),day:R.rand(0,34),month:R.rand(0,16),year:R.rand(500,600)};
R.weather={sky:0,sunlight:0,mmhg:1000,change:0};
(function(){const h=R.time.hour;R.weather.sunlight=h<5?3:h<6?1:h<19?0:h<20?2:3;})();

const outdoorsAwake=s=>{for(const p of W.players)if(p.playing&&R.isAwake(p)&&p.room&&!p.room.flags.has('INDOORS')&&p.room.sector!==0)R.send(p,s+'\n');};
function weatherUpdate(){
  const t=R.time,w=R.weather;
  if(++t.hour===24){t.hour=0;t.day++;}
  if(t.day>=35){t.day=0;t.month++;}
  if(t.month>=17){t.month=0;t.year++;}
  switch(t.hour){
    case 5:w.sunlight=1;outdoorsAwake(C.HIY+TW[0]+C.NOR);break;
    case 7:w.sunlight=0;outdoorsAwake(TW[1]);break;
    case 19:w.sunlight=2;outdoorsAwake(C.HIR+TW[2]+C.NOR);break;
    case 20:w.sunlight=3;outdoorsAwake(C.HIB+TW[3]+C.NOR);break;
  }
  /* 氣壓模型（簡化自 weather_update） */
  const diff=t.month>=9&&t.month<=16?(w.mmhg>985?-2:2):(w.mmhg>1015?-2:2);
  w.change+=diff*R.dice(1,4)+R.dice(2,6)-R.dice(2,6);
  w.change=R.urange(-12,w.change,12);
  w.mmhg=R.urange(960,w.mmhg+w.change,1040);
  const winter=t.month<=2||t.month>=15;
  switch(w.sky){
    case 0:if(w.mmhg<990||(w.mmhg<1010&&R.bits(2)===0)){outdoorsAwake(TW[4]);w.sky=1;}break;
    case 1:if(w.mmhg<970||(w.mmhg<990&&R.bits(2)===0)){outdoorsAwake(winter?TW[6]:TW[5]);w.sky=winter?4:2;}
           else if(w.mmhg>1030&&R.bits(2)===0){outdoorsAwake(TW[8]);w.sky=0;}break;
    case 2:if(w.mmhg<970&&R.bits(2)===0){outdoorsAwake(C.HIW+TW[9]+C.NOR);w.sky=3;}
           else if(w.mmhg>1030||(w.mmhg>1010&&R.bits(2)===0)){outdoorsAwake(TW[8]);w.sky=1;}break;
    case 3:if(w.mmhg>1010||(w.mmhg>990&&R.bits(2)===0)){outdoorsAwake(TW[10]);w.sky=2;}break;
    case 4:if(w.mmhg<970&&R.bits(2)===0){outdoorsAwake(C.HIW+TW[11]+C.NOR);w.sky=5;}
           else if(w.mmhg>1010){outdoorsAwake(TW[8]);w.sky=1;}break;
    case 5:if(w.mmhg>990){outdoorsAwake(TW[12]);w.sky=4;}break;
  }
}

function gain(ch,kind){
  let g;
  const L=Math.max(1,ch.level);
  if(kind==='hit')g=ch.npc?L*2:Math.max(3,Math.floor(L/2)+R.stat(ch,4)-8);
  else if(kind==='mana')g=ch.npc?L:Math.max(3,Math.floor(L/2)+Math.floor((R.stat(ch,1)+R.stat(ch,2))/3));
  else g=ch.npc?L:Math.max(5,L+R.stat(ch,3));
  switch(ch.position){case P.SLEEPING:g*=3;break;case P.RESTING:g*=2;break;case P.FIGHTING:g=Math.floor(g/3);break;}
  if(ch.room&&ch.room.flags.has('HEAL'))g*=2;
  return g;
}
function charUpdate(){
  for(const ch of W.chars.concat(W.players)){
    if(ch.deleted||!ch.room)continue;
    if(ch.position>=P.STUNNED){
      if(ch.hit<ch.max_hit)ch.hit=Math.min(ch.max_hit,ch.hit+gain(ch,'hit'));
      if(ch.mana<ch.max_mana)ch.mana=Math.min(ch.max_mana,ch.mana+gain(ch,'mana'));
      if(ch.move<ch.max_move)ch.move=Math.min(ch.max_move,ch.move+gain(ch,'move'));
    }
    if(ch.position===P.STUNNED)R.updatePos(ch);
    R.affectTick&&R.affectTick(ch);
    if(!ch.npc&&ch.playing){
      ch.played=(ch.played||0)+30;
      if(ch.position===P.MORTAL||ch.position===P.INCAP){R.damage(ch,ch,1,1,1);}
    }
  }
}
function objUpdate(){
  for(const o of [...W.objects]){
    if(o.deleted||!o.timer||o.timer<=0)continue;
    if(--o.timer>0)continue;
    const msg=/CORPSE/.test(o.type)?'$p 腐爛成一堆塵土。':o.type==='FOOD'?'$p 腐敗了。':'$p 消失了。';   /* 推測 */
    if(o.carried_by)R.act(msg,o.carried_by,o,null,R.TO_CHAR);
    else if(o.in_room&&o.in_room.people.length){const p=o.in_room.people[0];R.act(msg,p,o,null,R.TO_ROOM);R.act(msg,p,o,null,R.TO_CHAR);}
    if(o.in_room&&/CORPSE/.test(o.type))for(const c of [...o.contains])R.objToRoom(c,o.in_room);
    R.extractObj(o);
  }
}
function mobileUpdate(){
  for(const m of [...W.chars]){
    if(m.deleted||!m.room||m.fighting||!R.isAwake(m)||m.aff.has('CHARM'))continue;
    if(m.wait>0)continue;
    const room=m.room;
    if(!room.area.nplayer)continue;
    /* 撿東西 */
    if(m.act.has('SCAVENGER')&&room.contents.length&&R.bits(2)===0){
      let best=null;for(const o of room.contents)if(o.wear.has('TAKE')&&!/CORPSE/.test(o.type)&&(!best||o.cost>best.cost))best=o;
      if(best){R.objToChar(best,m);R.act('$n 拿起 $p.',m,best,null,R.TO_ROOM);}
    }
    /* 主動攻擊 */
    if(m.act.has('AGGRESSIVE')){
      const v=room.people.find(p=>!p.npc&&p.playing&&!R.isImm(p)&&R.canSee(m,p)&&p.level<m.level+15);
      if(v&&!room.flags.has('SAFE')){R.multiHit(m,v);continue;}
    }
    /* 遊蕩 */
    if(m.act.has('SENTINEL')||m.shop||R.bits(3)!==0)continue;
    const d=R.bits(5);if(d>5)continue;
    const e=room.exits[d],to=e&&R.getRoom(e.to);
    if(!to||e.closed||to.flags.has('NO_MOB')||(m.act.has('STAY_AREA')&&to.area!==room.area))continue;
    if(to.flags.has('SAFE')&&m.act.has('AGGRESSIVE'))continue;
    R.moveChar(m,d);
  }
}
function areaUpdate(){
  for(const a of W.areas){
    a.age++;
    if((a.nplayer===0&&a.age>=3)||a.age>=15){
      R.resetArea(a);a.age=R.rand(0,3);
      for(const r of a.rooms)for(const p of r.people)if(!p.npc&&p.playing&&R.isAwake(p))R.send(p,C.HIB+'你聽見遠處傳來沙沙的聲響。'+C.NOR+'\n');   /* 推測：區域重置提示 */
    }
  }
}

let pulse=0,pv=12,pm=16,pt=120,pa=240,ps=1200;
R.pulse=function(){
  pulse++;
  try{
    for(const p of W.players)if(p.wait>0)p.wait--;
    for(const m of W.chars)if(m.wait>0)m.wait--;
    if(--pv<=0){pv=12;R.violenceUpdate();}
    if(--pm<=0){pm=16;mobileUpdate();}
    if(--pt<=0){pt=R.rand(100,140);weatherUpdate();charUpdate();objUpdate();R.Sim&&R.Sim.tick&&R.Sim.tick();}
    if(--pa<=0){pa=240;areaUpdate();}
    if(--ps<=0){ps=1200;for(const p of W.players)if(p.playing&&p.level>=2)R.Save.save(p);}
    R.Sim&&R.Sim.pulse&&R.Sim.pulse();
    R.magicPulse&&R.magicPulse();
    R.runQueued&&R.runQueued();
  }catch(e){console.error(e);}
  R.flushAll();
};
R.startUpdate=function(){if(R._timer)return;R._timer=setInterval(R.pulse,250);};
})(ROC);
