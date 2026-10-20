/* interp.js — 指令解譯（對應 interp.c） */
(function(R){
const P=R.POS,cmd=R.cmds;
const POSMSG={0:'靜靜躺著吧，你已經死了.',1:'你的狀況太糟了.',2:'你的狀況太糟了.',3:'你頭昏眼花.',5:'你麻痺了.',
  4:'你正在睡夢中，請先 wake 起來。',6:"啊...你覺得有點懶散...(你必須先'站'起來)",7:'不行！  你還在戰鬥中！'};
const ALIAS={l:'look',i:'inventory',eq:'equipment',sc:'score',k:'kill',n:'north',e:'east',s:'south',w:'west',u:'up',d:'down',
  "'":'say','.':'chat',';':'gtell',',':'emote','sac':'sacrifice'};
const LV={L_HER:R.LEVEL_HERO,L_APP:R.L_APP};
const lvOf=v=>typeof v==='number'?v:(LV[v]??99);
/* 原版指令名稱 → JS 實作名稱 */
const FUN={do_look:'look',do_wear:'wear',do_cast:null};

R.queue=[];
R.runQueued=function(){
  for(const ch of R.world.players){
    if(!ch.playing||ch.wait>0||!ch.inq||!ch.inq.length)continue;
    R.interpret(ch,ch.inq.shift());R.flush(ch,true);
  }
};
R.interpret=function(ch,line){
  line=(line||'').replace(/^\s+/,'');
  if(!line)return;
  if(ch.wait>0&&!ch.npc){ch.inq=ch.inq||[];if(ch.inq.length<20)ch.inq.push(line);return;}
  let word,arg;
  if(!/^[a-z0-9]/i.test(line[0])&&ALIAS[line[0]]){word=ALIAS[line[0]];arg=line.slice(1).trim();}
  else{[word,arg]=R.one_arg(line);word=word.toLowerCase();arg=(arg||'').trim();if(ALIAS[word])word=ALIAS[word];}
  /* 原版指令表 */
  let fn=null,entry=null;
  for(const c of R.CONST.cmds){
    if(lvOf(c[3])>ch.level&&!R.isImm(ch))continue;
    if(!R.str_prefix(word,c[0]))continue;
    entry=c;break;
  }
  if(entry){
    const nm=entry[1].replace(/^do_/,'');
    fn=cmd[nm]||cmd[entry[0]];
    if(ch.position<entry[2]){R.send(ch,(POSMSG[ch.position]||'你辦不到.')+'\n');return;}
    /* room_mask：房間劇本可以攔下現有的指令（比對展開後的指令全名） */
    if(R.MP&&R.MP.mask(ch,entry[0],arg))return;
    if(!fn){R.send(ch,R.C.YEL+'「'+entry[0]+'」這個指令在網頁版還沒開放。'+R.C.NOR+'\n');return;}
    fn(ch,arg,entry[0]);return;
  }
  /* 不是現有指令：物品的 obj_command、房間的 room_command */
  if(R.MP&&R.MP.command(ch,word,arg))return;
  /* JS 額外指令（原表沒有的） */
  const extra=Object.keys(cmd).find(k=>R.str_prefix(word,k));
  if(extra){cmd[extra](ch,arg,extra);return;}
  /* 社交動作 */
  const so=R.CONST.socials.find(x=>R.str_prefix(word,x[0]));
  if(so&&R.doSocial(ch,so[0],arg))return;
  R.send(ch,'什麼？\n');
};

/* 補幾個原版常用但簡單的指令 */
cmd.commands=function(ch){
  let s='',i=0;
  for(const c of R.CONST.cmds){if(lvOf(c[3])>ch.level)continue;const ok=cmd[c[1].replace(/^do_/,'')]||cmd[c[0]];if(!ok)continue;s+=R.pad(c[0],13);if(++i%6===0)s+='\n';}
  R.send(ch,s+'\n');
};
cmd.areas=function(ch){
  let s='';for(const a of R.world.areas)s+=R.pad(a.name,40)+'\n';R.send(ch,s);
};
cmd.dice=function(ch,a){
  const n=Math.max(2,Math.min(1000,parseInt(a,10)||6)),r=R.rand(1,n);
  R.act(R.C.CYN+'【$n擲了'+n+'面的骰子-------------\n  結果是 '+r+' 點】'+R.C.NOR,ch,null,null,R.TO_ROOM);
  R.act(R.C.CYN+'【$n擲了'+n+'面的骰子-------------\n  結果是 '+r+' 點】'+R.C.NOR,ch,null,null,R.TO_CHAR);
};
cmd.credits=ch=>cmd.help(ch,'credits');
cmd.practice=cmd.practice||function(ch){R.send(ch,'你還有 '+ch.practice+' 次練習機會。（網頁版尚未開放技能系統）\n');};
cmd.scan=cmd.scan||function(ch){
  let s='';
  ch.room.exits.forEach((e,d)=>{if(!e||e.closed)return;const t=R.getRoom(e.to);if(!t)return;const ps=t.people.filter(p=>R.canSee(ch,p));if(ps.length)s+=R.DIR_NAME[d]+'邊：'+ps.map(p=>R.PERS(p,ch)).join('、')+'\n';});
  R.send(ch,s||'附近什麼都沒有。\n');
};
})(ROC);
