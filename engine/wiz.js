/* wiz.js — 天神指令（對應 Act/act_wiz.c、fight.c do_slay、ssm.c do_ostat） */
(function(R){
const C=R.C,P=R.POS,W=R.world,cmd=R.cmds;

/* ── 共用 ───────────────────────────────────────────── */
const L_DIR=R.MAX_LEVEL-1,L_SEN=L_DIR-1,L_JUN=L_SEN-1;
const LV={L_HER:R.LEVEL_HERO,L_APP:R.L_APP};
const lvOf=v=>typeof v==='number'?v:(LV[v]??99);
const trust=ch=>ch.level;   /* 簡化：無 trust 欄位，以等級代替 get_trust */
const isNum=s=>/^-?\d+$/.test(String(s||''));
const isWizinvis=ch=>!ch.npc&&(!!ch.wizinvis||(ch.act&&ch.act.has('WIZINVIS')));
const alive=ch=>!ch.deleted&&(ch.npc?W.chars:W.players).includes(ch);
const allChars=()=>W.players.filter(p=>p.playing).concat(W.chars);

/* 讀檔後 act 裡有 WIZINVIS 但沒有 wizinvis 等級時補上；隱身等級比照 C 以等級比較 */
const baseCanSee=R.canSee;
R.canSee=function(ch,v){
  if(v&&!v.npc&&v.act&&v.act.has('WIZINVIS')&&!v.wizinvis)v.wizinvis=v.level;
  if(v&&ch&&ch!==v&&!v.npc&&v.wizinvis&&trust(ch)<v.wizinvis)return false;
  return baseCanSee(ch,v);
};

function getObjWorld(ch,arg){
  const o=R.getObjHere(ch,arg);if(o)return o;
  const [n,name]=R.num_arg(arg);let c=0;
  for(const x of W.objects){if(x.deleted)continue;if(R.is_name(name,x.name)&&++c===n)return x;}
  return null;
}
/* find_location */
function findLocation(ch,arg){
  if(isNum(arg))return R.getRoom(+arg)||null;
  const v=R.getCharWorld(ch,arg);if(v)return v.room||null;
  const o=getObjWorld(ch,arg);if(o)return o.in_room||null;
  return null;
}

/* ── echo / recho ───────────────────────────────────── */
cmd.echo=function(ch,argument){
  if(!argument){R.send(ch,'要 echo 什麼?\n');return;}
  R.sendAll(argument+'\n');
};
cmd.recho=function(ch,argument){
  if(!argument){R.send(ch,'要 recho 什麼?\n');return;}
  for(const p of W.players)if(p.playing&&p.room===ch.room){R.send(p,argument);R.send(p,'\n');}
};

/* ── transfer ───────────────────────────────────────── */
cmd.transfer=function(ch,argument){
  const [arg1,rest]=R.one_arg(argument);
  const [arg2]=R.one_arg(rest);
  if(!arg1){R.send(ch,'Transfer 誰(到那裡)?\n');return;}
  if(arg1==='all'){
    for(const p of [...W.players])
      if(p.playing&&p!==ch&&p.room&&R.canSee(ch,p))cmd.transfer(ch,p.name+' '+arg2);
    return;
  }
  let location,dir=-1;
  if(!arg2)location=ch.room;
  else{
    if(R.str_prefix(arg2,'up'))dir=4;
    else if(R.str_prefix(arg2,'down'))dir=5;
    else if(R.str_prefix(arg2,'north'))dir=0;
    else if(R.str_prefix(arg2,'east'))dir=1;
    else if(R.str_prefix(arg2,'south'))dir=2;
    else if(R.str_prefix(arg2,'west'))dir=3;
    if(dir===-1&&!(location=findLocation(ch,arg2))){R.send(ch,'沒有這個地點.\n');return;}
    if(dir!==-1){
      const e=ch.room.exits[dir];
      if(!e||!(location=R.getRoom(e.to)))return;
    }
  }
  const victim=R.getCharWorld(ch,arg1);
  if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}
  if(!victim.room){R.send(ch,'They are in limbo.\n');return;}
  if(trust(ch)<trust(victim)){R.send(ch,"You can't transfer your superior.\n");return;}
  if(victim.fighting)R.stopFighting(victim,true);
  R.act('天空中伸出一隻大手，把$n抓走了.',victim,null,null,R.TO_ROOM);
  R.charFromRoom(victim);
  R.charToRoom(victim,location);
  R.act('天空中伸出一隻大手，把$n丟在這裡.',victim,null,null,R.TO_ROOM);
  if(ch!==victim)R.act('$n移動了你的位置.',ch,null,victim,R.TO_VICT);
  cmd.look(victim,'auto');
  R.send(ch,'Ok.\n');
};

/* ── at / goto ──────────────────────────────────────── */
cmd.at=function(ch,argument){
  const [arg,rest]=R.one_arg(argument);
  if(!arg||!rest){R.send(ch,'At 那裡(做什麼)?\n');return;}
  const location=findLocation(ch,arg);
  if(!location){R.send(ch,'沒有這個地點.\n');return;}
  const original=ch.room;
  R.charFromRoom(ch);
  R.charToRoom(ch,location);
  R.interpret(ch,rest);   /* 簡化：若身上有 wait，指令會被排入佇列而在原房間執行 */
  if(alive(ch)){R.charFromRoom(ch);R.charToRoom(ch,original);}
};
cmd.goto=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Goto 那裡?\n');return;}
  const location=findLocation(ch,arg);
  if(!location){R.send(ch,'沒有這個地點.\n');return;}
  if(ch.fighting)R.stopFighting(ch,true);
  if(!isWizinvis(ch))
    R.act('$n $T',ch,null,(ch.pc&&ch.pc.bamfout)?ch.pc.bamfout:'的身影突然從你面前消失',R.TO_ROOM);
  R.charFromRoom(ch);
  R.charToRoom(ch,location);
  if(!isWizinvis(ch))
    R.act('$n $T',ch,null,(ch.pc&&ch.pc.bamfin)?ch.pc.bamfin:'突然出現在這裡',R.TO_ROOM);
  cmd.look(ch,'auto');
};

/* ── rstat ──────────────────────────────────────────── */
cmd.rstat=function(ch,argument){
  const [arg]=R.one_arg(argument);
  const location=!arg?ch.room:findLocation(ch,arg);
  if(!location){R.send(ch,'沒有這個地點.\n');return;}
  let s='名稱: ['+location.name+']\n所屬區域: '+location.area.name+'.\n';
  s+='Vnum: '+location.vnum+'.\tSector: '+location.sector+'.  Light: '+(R.roomDark(location)?0:1)+'.\n';   /* 簡化：Light 以是否黑暗表示 */
  s+='Room flags: '+([...location.flags].join(' ')||'none')+'.\nDescription:\n'+location.desc+(/\n$/.test(location.desc)?'':'\n');
  if(location.extra&&location.extra.length)
    s+="Extra description keywords: '"+location.extra.map(e=>e.keyword||e.keywords||'').join(' ')+"'.\n";
  s+='房內生物:  ';
  for(const p of location.people)if(R.canSee(ch,p))s+=', '+R.one_arg(p.name)[0];
  s+='.\n\n房內物品:   ';
  for(const o of location.contents)s+=', '+R.one_arg(o.name)[0];
  s+='.\n';
  for(let door=0;door<=5;door++){
    const e=location.exits[door];if(!e)continue;
    const info=(e.isdoor?1:0)|(e.closed?2:0)|(e.locked?4:0);   /* 推測：EX_ISDOOR=1、EX_CLOSED=2、EX_LOCKED=4 */
    s+=C.HIB+R.DIR_NAME[door]+C.NOR+' - 通往: '+(R.getRoom(e.to)?e.to:0)+'. Key: '+(e.key||0)+'.  Exit flags: '+info+'. Exit size: 0  \n';   /* 簡化：無 exit_size */
    s+='Keyword: '+(e.kw||'')+'.\n';
    s+='Description: '+(e.desc?e.desc+(/\n$/.test(e.desc)?'':'\n'):'(none).\n\n');
  }
  R.send(ch,s);
};

/* ── ostat（ssm.c） ─────────────────────────────────── */
cmd.ostat=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Ostat 什麼?\n');return;}
  const obj=getObjWorld(ch,arg);
  if(!obj){R.send(ch,'沒有這樣物品.\n');return;}
  const v=obj.values||[];
  let s='Name: ['+obj.name+']\n';
  if(obj.material)s+='Material: '+obj.material+'\n';
  s+='Vnum: '+obj.vnum+'.  Type: '+obj.type+'.\n';
  s+='Short description: '+obj.short+'.\nLong description: '+obj.long+'\n';
  s+='Wear bits: '+([...obj.wear].join(' ')||'none')+'.  Extra bits: '+([...obj.extra].join(' ')||'none')+'.\n';
  s+='Number: 1/1.  Weight: '+obj.weight+'/'+R.objWeight(obj)+'.\n';   /* 簡化：get_obj_number 以 1 計 */
  s+='Cost: '+obj.cost+'.  Timer: '+obj.timer+'.  Level: '+obj.level+'.\n';
  s+='In room: '+(obj.in_room?obj.in_room.vnum:0)+'.  In object: '+
    (obj.in_obj?obj.in_obj.short+'('+obj.in_obj.name+')':'（無）')+'.\t Carried by: '+
    (obj.carried_by?(obj.carried_by.short||obj.carried_by.name)+'('+obj.carried_by.name+')':'（無）')+'.\tWear_loc: '+obj.wear_loc+'.\n';
  s+='Values: '+[0,1,2,3,4].map(i=>v[i]||0).join(' ')+'.\n';
  if(obj.extra_descr&&obj.extra_descr.length)
    s+="Extra description keywords: '"+obj.extra_descr.map(e=>e.keyword||e.keywords||'').join(' ')+"'.\n";
  for(const a of obj.applies||[])s+='Affects '+a.type+' by '+(a.value||0)+'.\n';
  R.send(ch,s);
};

/* ── mstat ──────────────────────────────────────────── */
cmd.mstat=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Mstat 誰?\n');return;}
  const v=R.getCharWorld(ch,arg);
  if(!v){R.send(ch,"They aren't here.\n");return;}
  const race=R.CONST.races[v.race]||{name:'?',size:0};
  const cls=R.CONST.classes[v.cls]||{cname:'?'};
  let s='Name: ['+v.name+']\n';
  s+='種族: '+race.name+'\n';
  s+='Vnum: '+(v.npc?v.vnum:0)+'.  性別: '+(v.sex===1?'男':v.sex===2?'女':'中性')+'.\t位於: '+(v.room?v.room.vnum:0)+'.\n';
  s+='Str: '+R.stat(v,0)+'.  Int: '+R.stat(v,1)+'.  Wis: '+R.stat(v,2)+'.\t Dex: '+R.stat(v,3)+'.  Con: '+R.stat(v,4)+
    '.  Size: '+(race.size||0)+'(mod 0)   Exp '+v.exp+'.\n';
  s+='Hp: '+v.hit+'/'+v.max_hit+'.  Mana: '+v.mana+'/'+v.max_mana+'.  Move: '+v.move+'/'+v.max_move+'.  Practices: '+(v.practice||0)+'.\n';
  s+='Lv: '+v.level+'.  Class: '+(v.npc?'Mob':cls.cname)+'('+v.cls+').  Align: '+v.alignment+'.  AC: '+v.armor+'. DODGE: '+(v.dodge||0)+'.\n';
  if(R.getSvs)s+='SVS: '+R.getSvs(v)+'\n';   /* 簡化：未列各屬性抗性 */
  s+='P.P: '+(v.pp||0)+'. Gold: '+(v.gold||0)+'. Exp: '+v.exp+'.\n';
  s+='Wait: '+(v.wait||0)+'.\n';
  s+='Position: '+v.position+'.  Wimpy: '+(v.wimpy||0)+'.\n';
  s+='Hitroll: '+(v.hitroll||0)+'\tDamroll: '+(v.damroll||0)+'.\n';
  s+='Fighting: '+(v.fighting?v.fighting.name:'(none)')+'.\n';
  if(!v.npc&&v.pc&&v.pc.cond){
    const c=v.pc.cond;
    s+='Thirst: '+(c[2]||0)+'.  Full: '+(c[1]||0)+'.\t Drunk: '+(c[0]||0)+'.  Saving throw: '+(R.getSvs?R.getSvs(v):0)+'.\n';   /* 推測：cond 索引同 C（DRUNK=0、FULL=1、THIRST=2） */
  }
  s+='Carry number: '+R.carryN(v)+'.  Carry weight: '+R.carryW(v)+'.\n';
  s+='Act: '+([...(v.act||[])].join(' ')||'none')+'.\n';
  s+='Master: '+(v.master?v.master.name:'<無>')+'.\tLeader: '+(v.leader?v.leader.name:'<無>')+'.  \nAffected by: '+([...(v.aff||[])].join(' ')||'none')+'.\n';
  s+='Short description: '+(v.short||'')+'.\nLong  description: '+(v.long?v.long+(/\n$/.test(v.long)?'':'\n'):'<無>.\n');
  if(!v.npc&&v.pc)s+='Title: ['+(v.pc.title||'')+']\n';
  if(v.npc&&v.psk)s+='Skills:'+v.psk+'\n';
  for(const a of v.affects||[]){
    if(a.deleted)continue;
    const sk=R.SK&&R.SK[a.type];
    s+="Spell: '"+(sk?sk.name:a.type)+"' modifies "+a.location+' by '+a.modifier+' for '+a.duration+' hours with bits '+(a.bitvector||'none')+'.\n';
  }
  R.send(ch,s);
};

/* ── mfind / ofind ──────────────────────────────────── */
function protoFind(ch,arg,list,sep){
  const fAll=arg==='all';let s='',found=false;
  for(const p of list.sort((a,b)=>a.vnum-b.vnum)){
    if(!fAll&&!R.is_name(arg,p.keywords||''))continue;
    found=true;
    s+='['+R.padL(p.vnum,5)+'] '+R.cap(p.short_description||'')+','+sep+'<'+(p.keywords||'')+'>\n';
  }
  if(!found){R.send(ch,'Nothing like that in hell, earth, or heaven.\n');return;}
  R.send(ch,s);
}
cmd.mfind=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Mfind whom?\n');return;}
  protoFind(ch,arg,Object.values(W.mobs),' ');
};
cmd.ofind=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Ofind what?\n');return;}
  protoFind(ch,arg,Object.values(W.objs),'');
};

/* ── mwhere / owhere ────────────────────────────────── */
const POS_TXT={[P.DEAD]:C.RED+'它已死了'+C.NOR,[P.MORTAL]:C.HIR+'受致命傷'+C.NOR,[P.INCAP]:C.HIB+'失去行動'+C.NOR,
  [P.STUNNED]:C.HIB+'不省人事'+C.NOR,[P.SLEEPING]:C.HIU+'它睡著了'+C.NOR,[P.RESTING]:C.HIG+'它在休息'+C.NOR,
  [P.STANDING]:C.HIB+'它在站著'+C.NOR,[P.FIGHTING]:C.HIY+'在戰鬥中'+C.NOR};
cmd.mwhere=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Mwhere whom?\n');return;}
  let s='',found=false;
  if(R.is_name(arg,'-a')){
    for(const to of W.players){
      if(!to.playing||!to.room||!to.conn)continue;
      found=true;
      s+='['+R.padL(to.level,5)+'] '+(POS_TXT[to.position]||'')+' '+(to.short||to.name)+' 位在 ['+R.padL(to.room.vnum,5)+'] '+to.room.name+'\n';
    }
  }else{
    for(const v of allChars()){
      if(!v.room||!R.is_name(arg,v.name))continue;
      found=true;
      s+='['+R.padL(v.npc?v.vnum:v.level,5)+'] '+(v.short||v.name)+', <'+v.name+'> 位在 ['+R.padL(v.room.vnum,5)+'] '+v.room.name+'\n';
    }
  }
  if(!found){R.act("You didn't find any $T.",ch,null,arg,R.TO_CHAR);return;}
  R.send(ch,s);
};
cmd.owhere=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Syntax:\towhere <object>.\n');return;}
  let s='',found=false,n=0;
  for(const obj of W.objects){
    if(obj.deleted||!R.canSeeObj(ch,obj)||!R.is_name(arg,obj.name))continue;
    found=true;
    let in_obj=obj;while(in_obj.in_obj)in_obj=in_obj.in_obj;
    ++n;
    let line;
    if(in_obj.carried_by){
      const c=in_obj.carried_by;
      if(!R.canSee(ch,c))continue;
      line='['+R.padL(n,2)+'] '+obj.short+', <'+obj.name+'> carried by '+R.PERS(c,ch)+' at ['+R.padL(c.room?c.room.vnum:0,4)+'].\n';
    }else{
      line='['+R.padL(n,2)+'] '+obj.short+', <'+obj.name+'> in '+(!in_obj.in_room?'某處':in_obj.in_room.name)+' at ['+R.padL(in_obj.in_room?in_obj.in_room.vnum:0,4)+'].\n';
    }
    s+=R.cap(line);
  }
  R.send(ch,s);
  if(!found)R.send(ch,'Nothing like that in hell, earth, or heaven.\n');
};

/* ── mload / oload / purge ──────────────────────────── */
cmd.mload=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg||!isNum(arg)){R.send(ch,'Syntax: mload <vnum>.\n');return;}
  const p=W.mobs[+arg];
  if(!p){R.send(ch,'No mob has that vnum.\n');return;}
  const victim=R.createMobile(p);
  R.charToRoom(victim,ch.room);   /* 簡化：無 mprog_repop_trigger */
  R.send(ch,'Ok.\n');
  R.act('$n 變出了 $N。',ch,null,victim,R.TO_ROOM);
  R.act('你 變出了 $N。',ch,null,victim,R.TO_CHAR);
};
cmd.oload=function(ch,argument){
  const [arg1,rest]=R.one_arg(argument);
  const [arg2]=R.one_arg(rest);
  if(!arg1||!isNum(arg1)){R.send(ch,'Syntax: oload <vnum> <level>.\n');return;}
  let level;
  if(!arg2||trust(ch)<L_SEN)level=trust(ch);
  else{
    if(!isNum(arg2)){R.send(ch,'Syntax: oload <vnum> <level>.\n');return;}
    level=+arg2;
    if(level<0||level>trust(ch)){R.send(ch,'Limited to your trust level.\n');return;}
  }
  const p=W.objs[+arg1];
  if(!p){R.send(ch,'No object has that vnum.\n');return;}
  const obj=R.createObject(p,level);
  if(obj.wear.has('TAKE'))R.objToChar(obj,ch);
  else R.objToRoom(obj,ch.room);
  R.act('$n 憑空一指，變出了 $p。',ch,obj,null,R.TO_ROOM);
  R.act('你憑空一指，變出了 $p。',ch,obj,null,R.TO_CHAR);
  R.send(ch,'Ok.\n');   /* 簡化：無 oprog_repop_trigger */
};
cmd.purge=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){
    for(const v of [...ch.room.people]){
      if(v.deleted)continue;
      if(v.npc&&v!==ch&&!v.act.has('HORSE')){
        if(v.master&&!v.master.npc&&v.act.has('PET'))continue;   /* 推測：IsSorGateMob（召喚物）以 PET＋玩家主人近似 */
        R.extractChar(v,true);
      }
    }
    for(const o of [...ch.room.contents]){if(!o.deleted)R.extractObj(o);}
    R.send(ch,'Ok.\n');
    R.act('$n purges the room!',ch,null,null,R.TO_ROOM);
    return;
  }
  const victim=R.getCharWorld(ch,arg);
  if(!victim){R.send(ch,"They aren't here.\n");return;}
  if(!victim.npc){R.send(ch,"Not on PC's.\n");return;}
  R.act('$n purges $N.',ch,null,victim,R.TO_NOTVICT);
  R.extractChar(victim,true);
};

/* ── slay ───────────────────────────────────────────── */
cmd.sla=function(ch){R.send(ch,'If you want to SLAY, spell it out.\n');};
cmd.slay=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(!arg){R.send(ch,'Slay whom?\n');return;}
  const victim=R.getCharRoom(ch,arg);
  if(!victim){R.send(ch,'這裡沒有這個人.\n');return;}
  if(ch===victim){R.send(ch,'Suicide is a mortal sin.\n');return;}
  if(!victim.npc&&victim.level>=ch.level){R.send(ch,'You failed.\n');return;}
  R.act('You slay $M in cold blood!',ch,null,victim,R.TO_CHAR);
  R.act('$n slays you in cold blood!',ch,null,victim,R.TO_VICT);
  R.act('$n slays $N in cold blood!',ch,null,victim,R.TO_NOTVICT);
  /* 簡化：raw_kill 未匯出，改用 damage(victim,victim) 造成致死傷害（不給經驗、不發死訊）；天神受害者會被保底 1 點 HP */
  R.damage(victim,victim,Math.max(0,victim.hit)+20,0,0,-2);
  if(!victim.deleted&&victim.position!==P.DEAD)R.stopFighting(victim,true);
};

/* ── restore / peace ────────────────────────────────── */
function restoreOne(ch,v){
  v.hit=v.max_hit;v.mana=v.max_mana;v.move=v.max_move;
  R.updatePos(v);
  R.act('$n has restored you.',ch,null,v,R.TO_VICT);
}
cmd.restore=function(ch,argument){
  const [arg]=R.one_arg(argument);
  if(trust(ch)<L_JUN||!arg){restoreOne(ch,ch);return;}
  if(arg==='all'){
    for(const v of allChars()){if(v.deleted)continue;restoreOne(ch,v);}
    R.send(ch,'Aww...how sweet :)...Done.\n');
    return;
  }
  const victim=R.getCharWorld(ch,arg);
  if(!victim){R.send(ch,"They aren't here.\n");return;}
  restoreOne(ch,victim);
  R.send(ch,'Ok.\n');
};
cmd.peace=function(ch){
  for(const r of [...ch.room.people])if(r.fighting)R.stopFighting(r,true);
  R.send(ch,'Ok.\n');
};

/* ── advance ────────────────────────────────────────── */
/* advance_level：同 fight.js 的升級公式（該函式未匯出） */
function advanceLevel(ch){
  const c=R.CONST.classes[ch.cls]||{hpmin:8,hpmax:12,fmana:1};
  const con=R.stat(ch,4);
  const hp=Math.max(1,R.rand(c.hpmin,c.hpmax)+Math.floor((con-13)/2));
  const mn=c.fmana?R.rand(2,Math.max(2,Math.floor((R.stat(ch,1)+R.stat(ch,2))/4))):0;
  const mv=R.rand(4,Math.max(5,Math.floor((con+R.stat(ch,3))/5)));
  const pr=Math.max(1,Math.floor(R.stat(ch,2)/5));
  ch.max_hit+=hp;ch.max_mana+=mn;ch.max_move+=mv;ch.practice=(ch.practice||0)+pr;
  R.send(ch,'你獲得了 '+hp+' 點生命，'+mn+' 點魔法，'+mv+' 點移動，'+pr+' 次練習。\n');   /* 推測：同 fight.js */
  const t=R.CORE&&R.CORE.titles&&R.CORE.titles[c.cname];
  if(t&&t.length&&ch.pc)ch.pc.title='- '+t[Math.min(ch.level,t.length-1)];
}
cmd.advance=function(ch,argument){
  const [arg1,rest]=R.one_arg(argument);
  const [arg2]=R.one_arg(rest);
  if(!arg1||!arg2||!isNum(arg2)){R.send(ch,'Syntax: advance <char> <level>.\n');return;}
  const victim=R.getCharRoom(ch,arg1);
  if(!victim){R.send(ch,'That player is not here.\n');return;}
  if(victim.npc){R.send(ch,"Not on NPC's.\n");return;}
  if(victim!==ch&&trust(victim)>=trust(ch)){R.send(ch,'Not on superior or peer.\n');return;}   /* 原版此處漏了 return，網頁版補上 */
  const level=+arg2;
  if(level<1||level>R.MAX_LEVEL){R.send(ch,'Advance within range 1 to '+R.MAX_LEVEL+'.\n');return;}
  if(level>=trust(ch)){R.send(ch,'Limited to your trust level.\n');return;}
  if(level<=victim.level){
    R.send(ch,"Lowering a player's level!\n");
    R.send(victim,'**** 你感到全身的力量逐漸離你遠去 ****\n');
    victim.level=1;
    victim.exp=R.expPer(1);
    victim.max_hit=10;victim.max_mana=100;victim.max_move=100;
    if(victim.pc)victim.pc.learned={};
    victim.practice=0;
    victim.hit=victim.max_hit;victim.mana=victim.max_mana;victim.move=victim.max_move;
    advanceLevel(victim);
  }else{
    R.send(ch,"Raising a player's level!\n");
    R.send(victim,'**** 你渾身充滿力量，快活地呼號著 ****\n');
  }
  for(let i=victim.level;i<level;i++){
    R.send(victim,'You raise a level!!  ');
    victim.level++;
    advanceLevel(victim);
  }
  victim.exp=R.expPer(victim.level-1)*Math.max(1,victim.level);
  R.Save&&R.Save.save(victim);
};

/* ── holylight / wizinvis（do_invis） ───────────────── */
cmd.holylight=function(ch){
  if(ch.npc)return;
  if(ch.act.has('HOLYLIGHT')){ch.act.delete('HOLYLIGHT');R.send(ch,'Holy light mode off.\n');}
  else{ch.act.add('HOLYLIGHT');R.send(ch,'Holy light mode on.\n');}
};
cmd.invis=function(ch,argument){
  if(ch.npc)return;
  const [arg]=R.one_arg(argument);
  const level=!arg?trust(ch):R.urange(1,parseInt(arg,10)||0,trust(ch));
  if(isWizinvis(ch)){
    if(!arg){
      ch.act.delete('WIZINVIS');ch.wizinvis=0;
      R.send(ch,'You slowly fade back into existence.\n');
      R.act('$n slowly fades into existence.',ch,null,null,R.TO_ROOM);
    }else{
      ch.wizinvis=level;
      R.send(ch,'You changed your wizinvis level.\n');
    }
  }else{
    /* 先送訊息再設旗標，讓旁人還看得到「$n」 */
    R.send(ch,'You slowly vanish into thin air.\n');
    R.act('$n slowly fades into thin air.',ch,null,null,R.TO_ROOM);
    ch.act.add('WIZINVIS');ch.wizinvis=level;   /* 簡化：C 以 qmark 記錄隱身等級，這裡用 ch.wizinvis */
  }
};

/* ── force ──────────────────────────────────────────── */
cmd.force=function(ch,argument){
  const [arg,rest]=R.one_arg(argument);
  if(!arg||!rest){R.send(ch,'Force whom to do what?\n');return;}
  for(const c of R.CONST.cmds){
    if(rest[0]===c[0][0]&&R.str_prefix(rest,c[0])&&lvOf(c[3])>trust(ch)){
      R.send(ch,"You can't even do that yourself!\n");return;
    }
  }
  if(arg==='all'){
    for(const v of [...W.players]){
      if(!v.playing||v.deleted)continue;
      if(trust(v)<trust(ch)){
        R.act("$n forces you to '$t'.",ch,rest,v,R.TO_VICT);
        R.interpret(v,rest);
      }
    }
  }else{
    const victim=R.getCharWorld(ch,arg);
    if(!victim){R.send(ch,"They aren't here.\n");return;}
    if(victim===ch){R.send(ch,'Aye aye, right away!\n');return;}
    if(trust(victim)>=trust(ch)){R.send(ch,'Do it yourself!\n');return;}
    R.act("$n forces you to '$t'.",ch,rest,victim,R.TO_VICT);
    R.interpret(victim,rest);
  }
  R.send(ch,'Ok.\n');
};

/* ── wizhelp / users ────────────────────────────────── */
cmd.wizhelp=function(ch){
  let s='',col=0;
  for(const c of R.CONST.cmds){
    const lv=lvOf(c[3]);
    if(lv<R.LEVEL_HERO||lv>trust(ch))continue;   /* 簡化：以等級代替 immskll 授權清單 */
    s+=R.pad(c[0],10);
    if(++col%8===0)s+='\n';
  }
  if(col%8!==0)s+='\n';
  R.send(ch,s);
};
cmd.users=function(ch,argument){
  const [arg]=R.one_arg(argument);
  const line=(i,p)=>'['+R.padL(i,3)+' '+R.padL(p.playing?0:1,2)+'] '+p.name+' web@localhost\n';   /* 簡化：無 descriptor／host，連線編號用清單序號 */
  if(arg&&arg!=='-s'){
    const v=R.getCharWorld(ch,arg);
    if(!v){R.send(ch,'沒有這個玩家.\n');return;}
    if(v.npc||!v.conn){R.send(ch,'它不是玩家角色，或是沒有 descriptor.\n');return;}
    R.send(ch,line(W.players.indexOf(v),v));
    return;
  }
  let s='',count=0;
  W.players.forEach((p,i)=>{if(p.conn&&R.canSee(ch,p)){count++;s+=line(i,p);}});
  s+=count+' user'+(count===1?'':'s')+'\n';
  R.send(ch,s);
};
})(ROC);
