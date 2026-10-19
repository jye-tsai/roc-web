/* act.js — 輸出緩衝、act()、提示列（對應 comm.c act / bust_a_prompt） */
(function(R){
const W=R.world;
R.TO_ROOM=0;R.TO_NOTVICT=1;R.TO_VICT=2;R.TO_CHAR=3;
const HE=['它','他','她'],HIS=['它的','他的','她的'];

R.send=(ch,s)=>{if(!ch||!ch.conn)return;ch.outbuf=(ch.outbuf||'')+R.nl(s);};
R.sendAll=s=>{for(const p of W.players)if(p.playing)R.send(p,s);};

R.act=function(fmt,ch,a1,a2,type){
  if(!fmt||!ch||!ch.room)return;
  let list=ch.room.people;
  if(type===R.TO_VICT){if(!a2||!a2.room)return;list=a2.room.people;}
  for(const to of [...list]){
    if(!to.conn&&!(to.npc&&to.proto&&to.proto.programs))continue;
    if(!to.conn)continue;
    if(!R.isAwake(to))continue;
    if(type===R.TO_CHAR&&to!==ch)continue;
    if(type===R.TO_VICT&&(to!==a2||to===ch))continue;
    if(type===R.TO_ROOM&&to===ch)continue;
    if(type===R.TO_NOTVICT&&(to===ch||to===a2))continue;
    const s=fmt.replace(/\$(.)/g,(m,c)=>{
      switch(c){
        case 't':return String(a1??'');
        case 'T':return String(a2??'');
        case 'n':return R.PERS(ch,to);
        case 'N':return R.PERS(a2,to);
        case 'e':case 'm':return HE[R.urange(0,ch.sex,2)];
        case 'E':case 'M':return HE[R.urange(0,a2.sex,2)];
        case 's':return HIS[R.urange(0,ch.sex,2)];
        case 'S':return HIS[R.urange(0,a2.sex,2)];
        case 'p':return a1&&R.canSeeObj(to,a1)?a1.short:'不明物品';
        case 'P':return a2&&R.canSeeObj(to,a2)?a2.short:'不明物品';
        case 'd':return !a2?'門':R.one_arg(String(a2))[0]||'門';
        case '$':return '$';
      }
      return ' <@@@> ';
    });
    R.send(to,R.cap(s)+'\n');
  }
};

R.prompt=function(ch){
  const p=ch.pc.prompt;
  if(!p)return '\n\n';
  return p.replace(/%(.)/g,(m,c)=>{
    switch(c){
      case 'h':{const col=ch.hit>ch.max_hit*3/4?'':ch.hit>ch.max_hit/2?'\x1b[m\x1b[1;36m':ch.hit>ch.max_hit/4?'\x1b[m\x1b[1;33m':'\x1b[m\x1b[1;31m';return col+ch.hit+'\x1b[m';}
      case 'H':return ch.max_hit;case 'm':return ch.mana;case 'M':return ch.max_mana;
      case 'v':return ch.move;case 'V':return ch.max_move;case 'x':return ch.exp;case 'l':return ch.level;
      case 'X':return R.expNext(ch)-ch.exp;case 'g':return ch.gold;case 'w':return ch.wait||'';
      case 'a':case 'A':return ch.alignment>=350?'善良':ch.alignment<=-350?'邪惡':'中立';
      case 'r':return ch.room?ch.room.name:' ';
      case 'R':return R.isImm(ch)&&ch.room?ch.room.vnum:' ';
      case 'z':return R.isImm(ch)&&ch.room?ch.room.area.name:' ';
      case 't':return (R.time.hour%24)+'時';
      case '%':return '%';
    }
    return ' ';
  });
};

/* 每個 pulse 與每個指令後送出緩衝；比照原版：非指令觸發的輸出前面先換行 */
R.flush=function(ch,fCommand){
  if(!ch.conn||!ch.outbuf)return;
  let s=ch.outbuf;ch.outbuf='';
  if(!fCommand&&ch.playing)s='\n'+s;
  if(ch.playing)s+='\n'+R.prompt(ch);
  ch.conn.send(s);
};
R.flushAll=()=>{for(const p of W.players)R.flush(p,false);};
})(ROC);
