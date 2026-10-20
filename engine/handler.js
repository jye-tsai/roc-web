/* handler.js — 角色／物品移動、裝備、搜尋（對應 handler.c） */
(function(R){
const W=R.world;
const rm=(a,x)=>{const i=a.indexOf(x);if(i>=0)a.splice(i,1);};

R.charFromRoom=ch=>{if(!ch.room)return;rm(ch.room.people,ch);if(!ch.npc)ch.room.area.nplayer--;ch.room=null;};
R.charToRoom=(ch,room)=>{
  if(!room)room=R.getRoom(R.ROOM_TEMPLE);
  if(ch.room)R.charFromRoom(ch);
  ch.room=room;room.people.unshift(ch);
  if(!ch.npc){room.area.nplayer++;}
};
R.objFrom=o=>{
  if(o.carried_by){const c=o.carried_by;if(o.wear_loc>=0)R.unequipChar(c,o);rm(c.carrying,o);o.carried_by=null;}
  if(o.in_room){rm(o.in_room.contents,o);o.in_room=null;}
  if(o.in_obj){rm(o.in_obj.contains,o);o.in_obj=null;}
};
R.objToChar=(o,ch)=>{R.objFrom(o);ch.carrying.unshift(o);o.carried_by=ch;};
R.objToRoom=(o,room)=>{R.objFrom(o);room.contents.unshift(o);o.in_room=room;};
R.objToObj=(o,c)=>{R.objFrom(o);c.contains.unshift(o);o.in_obj=c;};
R.extractObj=o=>{R.objFrom(o);for(const c of [...o.contains])R.extractObj(c);rm(W.objects,o);o.proto.count--;o.deleted=true;};
R.extractChar=(ch,fPull)=>{
  R.stopFighting(ch,true);
  if(ch.group&&R.removeMember)R.removeMember(ch);
  for(const o of [...ch.carrying])R.extractObj(o);
  R.charFromRoom(ch);
  if(ch.npc){rm(W.chars,ch);ch.proto.count--;ch.deleted=true;}
  else if(!fPull)R.charToRoom(ch,R.getRoom(R.ROOM_TEMPLE));
};

R.getEq=(ch,loc)=>ch.carrying.find(o=>o.wear_loc===loc)||null;
R.applyMod=(ch,o,sign)=>{
  for(const a of o.applies||[]){
    const v=(a.value||0)*sign;
    switch(a.type){
      case 'HITROLL':ch.hitroll=(ch.hitroll||0)+v;break;
      case 'DAMROLL':ch.damroll=(ch.damroll||0)+v;break;
      case 'AC':ch.armor+=v;break;
      case 'HIT':ch.max_hit+=v;break;
      case 'MANA':ch.max_mana+=v;break;
      case 'MOVE':ch.max_move+=v;break;
      case 'STR':case 'INT':case 'WIS':case 'DEX':case 'CON':
        ch.mod=ch.mod||[0,0,0,0,0];ch.mod[['STR','INT','WIS','DEX','CON'].indexOf(a.type)]+=v;break;
    }
  }
  if(o.type==='ARMOR'){ch.armor-=(o.values[0]||0)*sign;}
};
R.equipChar=(ch,o,loc)=>{o.wear_loc=loc;R.applyMod(ch,o,1);};
R.unequipChar=(ch,o)=>{if(o.wear_loc<0)return;R.applyMod(ch,o,-1);o.wear_loc=-1;};

R.stat=(ch,i)=>{
  if(ch.npc)return R.urange(3,13+Math.floor(ch.level/5)+((ch.mod&&ch.mod[i])||0),30);
  const r=R.CONST.races[ch.race];
  return R.urange(3,(ch.perm[i]||13)+(r?r.mods[i]:0)+((ch.mod&&ch.mod[i])||0),30);
};
R.canCarryN=ch=>ch.npc?1000:21+2*R.stat(ch,3)+Math.floor(ch.level/2);
R.canCarryW=ch=>ch.npc?100000:R.stat(ch,0)*15+ch.level*10+50;  /* 推測：原式依 str_app 表 */
R.carryN=ch=>ch.carrying.filter(o=>o.wear_loc<0).length;
R.objWeight=o=>o.weight+o.contains.reduce((s,c)=>s+R.objWeight(c),0);
R.carryW=ch=>ch.carrying.reduce((s,o)=>s+R.objWeight(o),0);

R.isImm=ch=>!ch.npc&&ch.level>=R.LEVEL_IMMORTAL;
R.isAwake=ch=>ch.position>R.POS.SLEEPING;
R.roomDark=room=>{
  if(room.people.some(p=>{const l=R.getEq(p,0);return l&&l.type==='LIGHT';}))return false;
  if(room.flags.has('DARK'))return true;
  if(room.sector===0||room.sector===1||room.flags.has('INDOORS'))return false;
  return R.weather&&(R.weather.sunlight===2||R.weather.sunlight===3);
};
R.canSee=(ch,v)=>{
  if(ch===v)return true;
  if(v.wizinvis&&!R.isImm(ch))return false;
  if(R.isImm(ch)||(!ch.npc&&ch.act.has('HOLYLIGHT')))return true;
  if(ch.aff.has('BLIND'))return false;
  if(v.aff.has('INVISIBLE')&&!ch.aff.has('DETECT_INVIS'))return false;
  if(v.aff.has('HIDE')&&!ch.aff.has('DETECT_HIDDEN')&&!v.fighting)return false;
  return true;
};
R.canSeeObj=(ch,o)=>true;
R.PERS=(ch,looker)=>!R.canSee(looker,ch)?'某人':ch.npc?ch.short:ch.name;

const find=(list,arg,ch,test)=>{
  const [n,name]=R.num_arg(arg);let c=0;
  for(const x of list){if(test&&!test(x))continue;if(R.is_name(name,x.name)&&++c===n)return x;}
  return null;
};
R.getCharRoom=(ch,arg)=>{if(arg==='self'||arg==='me')return ch;return find(ch.room.people,arg,ch,v=>R.canSee(ch,v));};
R.getCharWorld=(ch,arg)=>R.getCharRoom(ch,arg)||find(W.players,arg,ch)||find(W.chars,arg,ch,v=>v.room);
R.getObjList=(ch,arg,list)=>find(list,arg,ch);
R.getObjCarry=(ch,arg)=>find(ch.carrying,arg,ch,o=>o.wear_loc<0);
R.getObjWear=(ch,arg)=>find(ch.carrying,arg,ch,o=>o.wear_loc>=0);
R.getObjHere=(ch,arg)=>find(ch.room.contents,arg,ch)||R.getObjCarry(ch,arg)||R.getObjWear(ch,arg);

/* 武器類型（value[3]）→ 攻擊名稱 */
R.attackName=ch=>{
  const w=R.getEq(ch,16)||R.getEq(ch,19);
  if(w&&w.type==='WEAPON'){const a=R.CORE.attacks[w.values[3]];if(a)return a;}
  const r=R.CONST.races[ch.race];return r?r.dmg:'空手一擊';
};
})(ROC);
