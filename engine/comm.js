/* comm.js — 說話、頻道、社交動作、存檔離線、設定（對應 act_comm.c） */
(function(R){
const C=R.C,P=R.POS,cmd=R.cmds,W=R.world;

R.chatAll=function(s,exclude){for(const p of W.players)if(p.playing&&p!==exclude)R.send(p,s+C.NOR+'\n');};

cmd.say=function(ch,a){
  a=(a||'').trim();
  if(!a){R.send(ch,'要說什麼？\n');return;}
  R.act('$n'+C.HIG+'說著「$T」'+C.NOR,ch,null,a,R.TO_ROOM);
  R.act(C.HIG+'你說「$T」'+C.NOR,ch,null,a,R.TO_CHAR);
  /* 讓 NPC 對打招呼有點反應（簡化，原版靠 mob program） */
  R.MP&&R.MP.say(ch,a);
  if(/^(hi|hello|你好|嗨|哈囉)/i.test(a))for(const m of ch.room.people)if(m.npc&&m!==ch&&R.isAwake(m)&&R.pct()<40){R.act('$n對$N點點頭。',m,null,ch,R.TO_NOTVICT);R.act('$n對你點點頭。',m,null,ch,R.TO_VICT);break;}
};
const CH={chat:['【閒聊】',C.HIC,0],music:['【心情點播】',C.WHT,0],question:['【新手發問】',C.HIG,0],answer:['【老手回答】',C.HIG,0],
  auction:['【拍賣】',C.HIY,0],shout:['喊叫',C.HIY,1],yell:['吶喊',C.HIY,2],rumor:['【幻世謠傳】',C.HIP,3],
  herotalk:['【英雄茶館】',C.HIG,4],immtalk:['【神諭】',C.HIR,5]};
R.CHANNELS=CH;
R.talkChannel=function(ch,a,name){
  const [verb,col,kind]=CH[name];
  a=(a||'').trim();
  if(!a){R.send(ch,'要說什麼？\n');return;}
  if(kind===4&&ch.level<R.LEVEL_HERO&&!R.isImm(ch)){R.send(ch,'什麼？\n');return;}
  if(kind===5&&!R.isImm(ch)){R.send(ch,'什麼？\n');return;}
  if(ch.act.has('NO_'+name.toUpperCase())){R.send(ch,'你關掉了這個頻道。\n');return;}
  if(kind===1||kind===2)R.send(ch,col+'你'+verb+'：「'+a+col+'」'+C.NOR+'\n');
  else R.send(ch,col+verb+'你說：「'+a+col+'」'+C.NOR+'\n');
  for(const p of W.players){
    if(p===ch||!p.playing||p.act.has('NO_'+name.toUpperCase()))continue;
    if(name==='chat'&&p.level<3)continue;
    if(kind===2&&p.room.area!==ch.room.area)continue;
    if(kind===4&&p.level<R.LEVEL_HERO)continue;
    if(kind===5&&!R.isImm(p))continue;
    if(!R.isAwake(p)&&kind!==5)continue;
    if(kind===3)R.send(p,col+verb+'有人說：「'+a+col+'」'+C.NOR+'\n');   /* 推測：謠傳隱藏說話者 */
    else if(kind===1||kind===2)R.act(col+'$n'+col+verb+'著：「$t'+col+'」'+C.NOR,ch,a,p,R.TO_VICT);
    else R.act(col+verb+'$n'+col+'：「$t'+col+'」'+C.NOR,ch,a,p,R.TO_VICT);
  }
  R.Sim&&R.Sim.onChannel&&R.Sim.onChannel(ch,name,a);
};
Object.keys(CH).forEach(n=>{cmd[n]=(ch,a)=>R.talkChannel(ch,a,n);});
cmd.channels=function(ch,a){
  const [arg]=R.one_arg(a);
  if(!arg){
    let s='頻道狀態：\n';
    for(const n of Object.keys(CH))s+='  '+R.pad(n,10)+(ch.act.has('NO_'+n.toUpperCase())?C.HIR+'關'+C.NOR:C.HIG+'開'+C.NOR)+'\n';
    R.send(ch,s+'用 channels +chat / -chat 開關頻道。\n');return;
  }
  const on=arg[0]==='+',n=arg.slice(1);
  if(!CH[n]||(arg[0]!=='+'&&arg[0]!=='-')){R.send(ch,'要開關哪個頻道？\n');return;}
  if(on)ch.act.delete('NO_'+n.toUpperCase());else ch.act.add('NO_'+n.toUpperCase());
  R.send(ch,'好的。\n');
};
cmd.tell=function(ch,a){
  const [n,rest]=R.one_arg(a);const msg=(rest||'').trim();
  if(!n||!msg){R.send(ch,'要告訴誰什麼事？\n');return;}
  const v=W.players.find(p=>p.playing&&R.str_prefix(n,R.lc(p.name)))||R.getCharWorld(ch,n);
  if(!v||(v.npc&&v.room!==ch.room)){
    if(R.Sim&&R.Sim.tell&&R.Sim.tell(ch,n,msg))return;
    R.send(ch,'他不在這兒。\n');return;
  }
  if(v===ch){R.send(ch,'你對著自己喃喃自語。\n');return;}
  if(!R.isAwake(v)){R.act('$E聽不到你的聲音。',ch,null,v,R.TO_CHAR);return;}
  R.act(C.HIY+'你告訴 $N「$t」'+C.NOR,ch,msg,v,R.TO_CHAR);
  R.act('$n'+C.HIY+'告訴你「$t」'+C.NOR,ch,msg,v,R.TO_VICT);
  v.reply=ch;
};
cmd.reply=function(ch,a){
  const v=ch.reply;if(!v||v.deleted){R.send(ch,'他不在這兒。\n');return;}
  if(v.sim){R.Sim.tell(ch,v.name,a);return;}
  cmd.tell(ch,R.lc(v.name)+' '+a);
};
cmd.emote=function(ch,a){
  a=(a||'').trim();
  if(!a){R.send(ch,'表達什麼情感？\n');return;}
  if(!/[。.!！?？]$/.test(a))a+='。';
  R.act('$n'+C.NOR+'$T',ch,null,a,R.TO_ROOM);R.act('$n'+C.NOR+'$T',ch,null,a,R.TO_CHAR);
};
R.doSocial=function(ch,name,a){
  const s=R.CONST.socials.find(x=>x[0]===name);if(!s)return false;
  if(ch.position===P.SLEEPING){R.send(ch,'你正在睡夢中，請先 wake 起來。\n');return true;}
  const [arg]=R.one_arg(a||'');
  if(!arg){if(s[2])R.act(s[2],ch,null,null,R.TO_ROOM);if(s[1])R.act(s[1],ch,null,null,R.TO_CHAR);return true;}
  const v=R.getCharRoom(ch,arg);
  if(!v){R.send(ch,'這裡沒有這個人。\n');return true;}
  if(v===ch){if(s[7])R.act(s[7],ch,null,v,R.TO_ROOM);if(s[6])R.act(s[6],ch,null,v,R.TO_CHAR);return true;}
  if(s[4])R.act(s[4],ch,null,v,R.TO_NOTVICT);if(s[3])R.act(s[3],ch,null,v,R.TO_CHAR);if(s[5])R.act(s[5],ch,null,v,R.TO_VICT);
  if(!ch.npc&&v.npc&&!v.aff.has('CHARM')&&R.isAwake(v)){
    if(!R.canSee(v,ch)){R.send(ch,'他看不到你！\n');return true;}
    if(R.MP&&R.MP.social(ch,v,name))return true;
  }
  /* NPC 回應（對應原版 social 的 npc 反應） */
  if(v.npc&&R.isAwake(v)&&!v.fighting&&R.pct()<50){
    const r=R.CONST.socials.filter(x=>x[3]&&/smile|nod|bow|wave|grin|hug|poke|slap|laugh/.test(x[0]));
    if(r.length){const x=R.pick(r);R.act(x[4],v,null,ch,R.TO_NOTVICT);R.act(x[3],v,null,ch,R.TO_CHAR);R.act(x[5],v,null,ch,R.TO_VICT);}
  }
  return true;
};
cmd.socials=function(ch){
  let s='',i=0;
  const per=R.cols?Math.max(2,Math.min(6,Math.floor(R.cols/13))):6;
  for(const x of R.CONST.socials){s+=R.pad(x[0],13);if(++i%per===0)s+='\n';}
  R.send(ch,s+'\n');
};

cmd.save=function(ch){
  if(ch.npc)return;
  if(ch.level<2){R.send(ch,'你最少要到第二級以上才能存檔。\n');return;}
  R.Save.save(ch);R.send(ch,'存檔完畢。\n');   /* 簡化：原版限旅店存檔，網頁版不限 */
};
cmd.quit=function(ch){
  if(ch.npc)return;
  if(ch.position===P.FIGHTING){R.send(ch,'不行！你還在打鬥。\n');return;}
  if(ch.position<P.STUNNED){R.send(ch,'你還沒「死」哪。\n');return;}
  R.send(ch,C.HIC+'謝謝光臨混沌幻世，期待您的再次光臨。'+C.NOR+'\n');   /* 推測：離線告別字串 */
  R.act('$n離開了這個遊戲。',ch,null,null,R.TO_ROOM);
  R.Save.save(ch);
  R.logout(ch);
};
cmd.prompt=function(ch,a){
  a=(a||'').trim();
  if(!a){ch.act.has('PROMPT')?ch.act.delete('PROMPT'):ch.act.add('PROMPT');R.send(ch,ch.act.has('PROMPT')?'你會看到提示列。\n':'你不會看到提示列。\n');return;}
  ch.pc.prompt=a==='all'||a==='default'?'<生命%h魔法%m移動%v> ':a;R.send(ch,'好的。\n');
};
cmd.title=function(ch,a){
  a=(a||'').trim();if(!a){R.send(ch,'要改成什麼稱號？\n');return;}
  ch.pc.title=(a[0]==='-'||a[0]===','?'':'- ')+a.slice(0,40);R.send(ch,'好的。\n');
};
const TOG={autoexit:'AUTOEXIT',autogold:'AUTOGOLD',autoloot:'AUTOLOOT',autosac:'AUTOSAC',combine:'COMBINE',blank:'BLANK',brief:'BRIEF',compact:'COMPACT'};
Object.entries(TOG).forEach(([n,f])=>{cmd[n]=ch=>{if(ch.act.has(f)){ch.act.delete(f);R.send(ch,n+' 關閉。\n');}else{ch.act.add(f);R.send(ch,n+' 開啟。\n');}};});
cmd.easy=function(ch){
  if(ch.npc)return;
  if(ch.act.has('HARDCORE')){ch.act.delete('HARDCORE');R.send(ch,C.HIG+'簡易模式開啟：'+C.NOR+'一級就能練技能、練習效果兩倍、升級練習點兩倍、經驗 1.5 倍。\n');}
  else{ch.act.add('HARDCORE');R.send(ch,C.HIY+'簡易模式關閉：'+C.NOR+'改回原版規則。\n');}
};
cmd.config=function(ch){
  let s='[ 設定 ]\n  '+R.pad('easy',10)+(R.easy(ch)?C.HIG+'開'+C.NOR+' （簡易模式）':C.HIR+'關'+C.NOR+' （原版規則）')+'\n';
  for(const [n,f] of Object.entries(TOG))s+='  '+R.pad(n,10)+(ch.act.has(f)?C.HIG+'開'+C.NOR:C.HIR+'關'+C.NOR)+'\n';
  R.send(ch,s);
};
cmd.password=async function(ch,a){
  const [o,r]=R.one_arg(a||'');const [n]=R.one_arg(r);
  if(!o||!n){R.send(ch,'語法：password <舊密碼> <新密碼>\n');return;}
  if(await R.hash(ch.name+o)!==ch.pc.pwd){R.send(ch,'密碼錯誤。\n');R.flush(ch,true);return;}
  if(n.length<5){R.send(ch,'新密碼至少要五個字元。\n');R.flush(ch,true);return;}
  ch.pc.pwd=await R.hash(ch.name+n);R.Save.save(ch);R.send(ch,'好的。\n');R.flush(ch,true);
};
cmd.delete=function(ch,a){
  if((a||'').trim()!=='confirm'){R.send(ch,'這會永久刪除你的角色！確定請打 delete confirm\n');return;}
  R.Save.remove(ch.name);R.send(ch,'角色已刪除。再會了，旅人。\n');ch.noSave=true;R.logout(ch);
};
})(ROC);
