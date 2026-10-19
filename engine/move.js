/* move.js — 移動、門、recall、姿勢（對應 act_move.c） */
(function(R){
const C=R.C,P=R.POS,cmd=R.cmds;

R.moveChar=function(ch,door,fFlee){
  const from=ch.room,e=from.exits[door],to=e&&R.getRoom(e.to);
  if(!to){R.send(ch,'哎呀，此路不通。\n');return false;}
  if(e.closed&&!R.isImm(ch)){R.act('$d是關著的。',ch,null,e.kw,R.TO_CHAR);return false;}
  if(ch.npc){
    if(to.flags.has('NO_MOB'))return false;
  }else{
    if(R.carryN(ch)>R.canCarryN(ch)){R.send(ch,'你身上東西多得你動彈不得！\n');return false;}
    if(R.carryW(ch)>R.canCarryW(ch)){R.send(ch,'你身上東西重得你動彈不得！\n');return false;}
    if(to.sector===7&&!R.isImm(ch)&&!ch.carrying.some(o=>o.type==='BOAT')&&!ch.aff.has('FLYING')){R.send(ch,'你需要一艘船才能過去。\n');return false;}
    if(to.sector===9&&!R.isImm(ch)&&!ch.aff.has('FLYING')){R.send(ch,'你沒辦法飛上去。\n');return false;}
    let mv=R.MOVE_LOSS[Math.min(from.sector,10)]+R.MOVE_LOSS[Math.min(to.sector,10)];
    if(ch.aff.has('FLYING'))mv=Math.floor(mv/2);
    if(ch.move<mv&&!R.isImm(ch)){R.send(ch,'你太累了。\n');return false;}
    if(!R.isImm(ch))ch.move-=mv;
    ch.wait=Math.max(ch.wait,1);
  }
  const verb=to.sector===6||from.sector===6?'游去':'走去';
  if(!ch.wizinvis)R.act(C.GRN+'$n'+C.GRN+'往'+R.DIR_NAME[door]+verb+'。'+C.NOR,ch,null,null,R.TO_ROOM);
  R.charToRoom(ch,to);
  if(!ch.wizinvis)R.act('$n走了過來。',ch,null,null,R.TO_ROOM);   /* 推測：抵達訊息未在原始碼擷取 */
  if(!ch.npc)cmd.look(ch,'auto');
  /* 跟隨者 */
  for(const f of [...from.people])if(f.master===ch&&f.position===P.STANDING){R.act('你跟隨著$N。',f,null,ch,R.TO_CHAR);R.moveChar(f,door);}
  if(!ch.npc)R.aggrCheck&&R.aggrCheck(ch);
  return true;
};
R.DIRS.forEach((d,i)=>{cmd[d]=ch=>{if(ch.fighting){R.send(ch,'你正在戰鬥中！\n');return;}R.moveChar(ch,i);};});

function findDoor(ch,arg){
  let d=R.dirIndex(arg);
  if(d<0){
    d=ch.room.exits.findIndex(e=>e&&e.isdoor&&R.is_name(arg,e.kw));
    if(d<0){R.act('你看不到那個東西。',ch,null,arg,R.TO_CHAR);return -1;}
    return d;
  }
  const e=ch.room.exits[d];
  if(!e){R.send(ch,'那裡沒有出口。\n');return -1;}
  if(!e.isdoor){R.send(ch,'它不是門。\n');return -1;}
  return d;
}
function other(ch,d){const e=ch.room.exits[d],t=R.getRoom(e.to),b=t&&t.exits[R.REV_DIR[d]];return b&&b.to===ch.room.vnum?[t,b]:[null,null];}
const hasKey=(ch,k)=>ch.carrying.some(o=>o.vnum===k);
function doorCmd(name,fn){cmd[name]=(ch,a)=>{const [arg]=R.one_arg(a);if(!arg){R.send(ch,{open:'要打開什麼？',close:'要關上什麼？',lock:'要鎖上什麼？',unlock:'要打開什麼的鎖？'}[name]+'\n');return;}
  /* 容器 */
  const o=R.getObjHere(ch,arg);
  if(o&&R.dirIndex(arg)<0&&o.type==='CONTAINER'){containerCmd(name,ch,o);return;}
  const d=findDoor(ch,arg);if(d>=0)fn(ch,d,ch.room.exits[d]);};}
function containerCmd(name,ch,o){
  const v=o.values,CL=4,LK=8;
  if(name==='open'){if(!(v[1]&CL)){R.send(ch,'它已經打開了。\n');return;}if(v[1]&LK){R.send(ch,'它已經鎖上了。\n');return;}v[1]&=~CL;R.act('你打開了$p。',ch,o,null,R.TO_CHAR);R.act('$n打開了$p。',ch,o,null,R.TO_ROOM);}
  if(name==='close'){if(v[1]&CL){R.send(ch,'它已經關上了。\n');return;}v[1]|=CL;R.act('你關上了$p。',ch,o,null,R.TO_CHAR);R.act('$n關上了$p。',ch,o,null,R.TO_ROOM);}
  if(name==='lock'||name==='unlock'){if(v[2]<0){R.send(ch,'它沒有鎖。\n');return;}if(!hasKey(ch,v[2])){R.send(ch,'你沒有鑰匙。\n');return;}
    if(name==='lock')v[1]|=LK;else v[1]&=~LK;R.send(ch,name==='lock'?'*喀*\n':'*喀*\n');}
}
doorCmd('open',(ch,d,e)=>{
  if(!e.closed){R.send(ch,'它已經打開了。\n');return;}
  if(e.locked){R.send(ch,'它已經鎖上了。\n');return;}
  e.closed=false;R.act('你打開了$d。',ch,null,e.kw,R.TO_CHAR);R.act('$n打開了$d。',ch,null,e.kw,R.TO_ROOM);
  const [t,b]=other(ch,d);if(b)b.closed=false;
});
doorCmd('close',(ch,d,e)=>{
  if(e.closed){R.send(ch,'它已經關上了。\n');return;}
  e.closed=true;R.act('你關上了$d。',ch,null,e.kw,R.TO_CHAR);R.act('$n關上了$d。',ch,null,e.kw,R.TO_ROOM);
  const [t,b]=other(ch,d);if(b)b.closed=true;
});
doorCmd('lock',(ch,d,e)=>{
  if(!e.closed){R.send(ch,'它還沒關上。\n');return;}
  if(e.key<0||!e.key){R.send(ch,'它沒有鎖。\n');return;}
  if(!hasKey(ch,e.key)&&!R.isImm(ch)){R.send(ch,'你沒有鑰匙。\n');return;}
  if(e.locked){R.send(ch,'它已經鎖上了。\n');return;}
  e.locked=true;R.act('你鎖上了$d。',ch,null,e.kw,R.TO_CHAR);R.act('$n鎖上了$d。',ch,null,e.kw,R.TO_ROOM);
  const [t,b]=other(ch,d);if(b)b.locked=true;
});
doorCmd('unlock',(ch,d,e)=>{
  if(!e.closed){R.send(ch,'它沒有關上。\n');return;}
  if(e.key<0||!e.key){R.send(ch,'它沒有鎖。\n');return;}
  if(!hasKey(ch,e.key)&&!R.isImm(ch)){R.send(ch,'你沒有適當的鑰匙。\n');return;}
  if(!e.locked){R.send(ch,'它沒有鎖。\n');return;}
  e.locked=false;R.act('你打開了$d的鎖。',ch,null,e.kw,R.TO_CHAR);R.act('$n打開了$d的鎖。',ch,null,e.kw,R.TO_ROOM);
  const [t,b]=other(ch,d);if(b)b.locked=false;
});

cmd.recall=function(ch){
  const to=R.getRoom(ch.room.area.recall)||R.getRoom(R.ROOM_TEMPLE);
  R.act('$n祈求傳送！',ch,null,null,R.TO_ROOM);
  if(ch.room===to)return;
  if(ch.room.flags.has('NO_RECALL')){R.send(ch,'神遺棄了你。\n');return;}
  if(ch.fighting){
    if(R.pct()>50){R.send(ch,'你失敗了！\n');return;}
    const lose=50;ch.exp=Math.max(0,ch.exp-lose);R.send(ch,'你從戰鬥中回城！損失 '+lose+' 點經驗.\n');R.stopFighting(ch,true);
  }
  ch.move=Math.floor(ch.move/2);
  R.act('$n消失了。',ch,null,null,R.TO_ROOM);
  R.charToRoom(ch,to);
  R.act('$n忽然在這裡出現。',ch,null,null,R.TO_ROOM);
  cmd.look(ch,'auto');
};
cmd.stand=function(ch){
  switch(ch.position){
    case P.SLEEPING:ch.position=P.STANDING;R.send(ch,'你醒了並站了起來。\n');R.act('$n醒了並站了起來。',ch,null,null,R.TO_ROOM);break;
    case P.RESTING:ch.position=P.STANDING;R.send(ch,'你站了起來。\n');R.act('$n站了起來。',ch,null,null,R.TO_ROOM);break;
    case P.FIGHTING:R.send(ch,'你已經在戰鬥中了！\n');break;
    default:R.send(ch,'你已經是站著的了。\n');
  }
};
cmd.wake=(ch,a)=>{if(!a){cmd.stand(ch);return;}const v=R.getCharRoom(ch,a);if(!v){R.send(ch,'這裡沒有這個人。\n');return;}
  if(R.isAwake(v)){R.act('$N已經醒著了。',ch,null,v,R.TO_CHAR);return;}v.position=P.STANDING;R.act('你叫醒了$N。',ch,null,v,R.TO_CHAR);R.act('$n叫醒了你。',ch,null,v,R.TO_VICT);};
cmd.rest=function(ch){
  if(ch.position===P.RESTING){R.send(ch,'你已經坐著休息了。\n');return;}
  if(ch.position===P.FIGHTING){R.send(ch,'你正在戰鬥中！\n');return;}
  ch.position=P.RESTING;R.send(ch,'你坐下來休息。\n');R.act('$n坐下來休息。',ch,null,null,R.TO_ROOM);
};
cmd.sleep=function(ch){
  if(ch.position===P.SLEEPING){R.send(ch,'你已經在睡覺了。\n');return;}
  if(ch.position===P.FIGHTING){R.send(ch,'你正在戰鬥中！\n');return;}
  ch.position=P.SLEEPING;R.send(ch,'你躺下來睡覺。\n');R.act('$n躺下來睡覺。',ch,null,null,R.TO_ROOM);
};
cmd.follow=(ch,a)=>{
  const v=a&&R.getCharRoom(ch,a);if(!v){R.send(ch,'要跟隨誰？\n');return;}
  if(v===ch){if(ch.master){R.act('你停止跟隨$N。',ch,null,ch.master,R.TO_CHAR);ch.master=null;}else R.send(ch,'你已經在跟隨你自己了。\n');return;}
  ch.master=v;R.act('你開始跟隨$N。',ch,null,v,R.TO_CHAR);R.act('$n開始跟隨你。',ch,null,v,R.TO_VICT);
};
})(ROC);
