/* nanny.js — 登入流程與開機（對應 comm.c nanny） */
(function(R){
const C=R.C,W=R.world,CORE=ROC.CORE;
const DEF_PROMPT='<生命%h魔法%m移動%v> ';
const PC_RACES=()=>R.CONST.races.map((r,i)=>[r,i]).filter(([r])=>r.abil&1);

function helpText(key){
  const h=CORE.helps.find(h=>R.is_name(key,h.keywords));
  return h?String(h.text).replace(/^\./,'')+'\n':'';
}

R.Desc=function(conn){
  this.conn=conn;this.state='GET_NAME';this.ch=null;this.tries=0;
};
R.Desc.prototype.out=function(s){this.conn.send(R.nl(s));};
/* 手機直向專用的精簡標題（寬度 30 格內），每次隨機一張 */
const CREDIT=[
'\x1b[1;30m Based on Envy 2.2',
' by Amenda & Zcecil',
' enhanced by Faraway, Coconet,',
'   WhisperWind / Keelar\x1b[0m'];
const MOBILE_GREETS=[
["\u001b[1;36m  ____     ___     ____ ", " |  _ \\   / _ \\   / ___|", " | |_) | | | | | | |    ", " |  _ <  | |_| | | |___ ", " |_| \\_\\  \\___/   \\____|\u001b[0m", "", "\u001b[1;33m   混   沌   幻   世\u001b[0m", "\u001b[0;36m  The Realm of Chaos\u001b[0m", ""],
["\u001b[1;33m +--------------------------+", " |\u001b[1;31m    *   混 沌 幻 世   *   \u001b[1;33m|", " |\u001b[0;37m     Realm  of  Chaos     \u001b[1;33m|", " +--------------------------+\u001b[0m", "\u001b[0;32m       /\\         /\\", "  /\\  /  \\  /\\   /  \\   /\\", " /  \\/    \\/  \\_/    \\_/  \\\u001b[0m", "\u001b[1;37m   ~ roc.csie.org:5555 ~\u001b[0m", ""],
["\u001b[1;37m        /\\", "        ||", "        ||    \u001b[1;33m混 沌 幻 世\u001b[1;37m", "        ||", "        ||    \u001b[0;36mRealm of Chaos\u001b[1;37m", "\u001b[1;33m  o=====[]=====o", "        ##", "        ##    \u001b[1;30msince 2001\u001b[1;33m", "        ()\u001b[0m", ""],
["\u001b[1;31m  |>>>                |>>>", "\u001b[0;37m  |                   |", " _|_  _   _   _   _  _|_", "|   ||_| |_| |_| |_||   |", "|      \u001b[1;33m混 沌 幻 世\u001b[0;37m      |", "|   \u001b[0;36mRealm   of   Chaos\u001b[0;37m  |", "|         ______        |", "|        |      |       |", "|________|______|_______|\u001b[0m", ""]
].map(a=>a.concat(CREDIT).join('\n'));
R.Desc.prototype.greet=function(){
  this.conn.send('\x1b[2J');
  /* 窄螢幕（手機直向）改用精簡版標題，原圖太寬縮小後難以辨識 */
  const narrow=typeof window!=='undefined'&&window.innerWidth<600;
  const art=narrow?R.pick(MOBILE_GREETS):R.pick(CORE.greetings).replace(/\n+$/,'');
  this.out('\x1b[8z'+art+'\x1b[9z\n\n');   /* 包成 ASCII 圖區塊，必要時自動縮放 */
  this.out('\x1b[1;32m[ jye 20261019 Revised Web Edition ]\x1b[0m\n\n');
  this.out('想要進入 混沌幻世 世界冒險的英雄名字是？');
};

function validName(n){
  if(!/^[A-Za-z]{3,12}$/.test(n))return false;
  if(/^(all|auto|immortal|self|someone|something|the|you|god)$/i.test(n))return false;
  if(Object.values(W.mobs).some(p=>R.is_name(n,p.keywords||'')&&R.lc(p.keywords).split(' ').includes(R.lc(n))))return false;
  return true;
}

/* 「記住密碼」：這台裝置存密碼雜湊，下次點角色直接進遊戲 */
const REM='roc.rem.';
R.remember={
  get(n){try{return localStorage.getItem(REM+R.lc(n));}catch(e){return null;}},
  set(n,h){try{localStorage.setItem(REM+R.lc(n),h);}catch(e){}},
  del(n){try{localStorage.removeItem(REM+R.lc(n));}catch(e){}},
  clear(){try{for(const k of Object.keys(localStorage))if(k.startsWith(REM))localStorage.removeItem(k);}catch(e){}},
  any(){try{return Object.keys(localStorage).some(k=>k.startsWith(REM));}catch(e){return false;}}
};
R.Desc.prototype.input=async function(line){
  const d=this,a=(line||'').trim();
  let ch=d.ch;
  switch(d.state){
  case 'GET_NAME':{
    if(!a){d.out('想要進入 混沌幻世 世界冒險的英雄名字是？');return;}
    const name=R.cap(R.lc(a));
    if(!validName(name)){
      if(++d.tries>=5){d.out('輸入角色名稱失敗太多次！\n');d.tries=0;}
      d.out('那是不合法的名字，請重新輸入\n您的名字(英文)：');return;
    }
    if(W.players.some(p=>p.playing&&R.lc(p.name)===R.lc(name))){d.out('現在線上有這個人的存在。\n請重新輸入名字：');return;}
    if(R.isOwnerName(name)){d.ownerName=name;d.out('密碼：');d.conn.echo(false);d.state='OWNER_PASSWORD';return;}
    if(R.Save.exists(name)){
      d.ch=R.Save.load(name);d.ch.conn=d.conn;
      if(d.ch.pc.pwd&&R.remember.get(name)===d.ch.pc.pwd){d.out('\x1b[1;30m（已記住密碼，直接登入）\x1b[0m\n');enterGame(d);return;}
      d.out('密碼：');d.conn.echo(false);d.state='GET_OLD_PASSWORD';return;
    }
    d.ch=R.newPlayer(name);d.ch.conn=d.conn;
    d.out('您沒輸入錯吧？是 '+name+' 嗎(Y/N)? ');d.state='CONFIRM_NEW_NAME';return;
  }
  case 'GET_OLD_PASSWORD':{
    d.out('\n');d.conn.echo(true);
    if(await R.hash(ch.name+a)!==ch.pc.pwd){R.remember.del(ch.name);d.out('密碼錯誤。\n請重新輸入您的名字：');d.ch=null;d.state='GET_NAME';return;}
    if(d.remember!==false)R.remember.set(ch.name,ch.pc.pwd);
    d.out(helpText('motd'));d.state='READ_MOTD';return;
  }
  case 'OWNER_PASSWORD':{
    d.out('\n');d.conn.echo(true);
    const name=d.ownerName;d.ownerName=null;
    if(!await R.ownerCheck(a)){d.out('這個名字已被保留。\n請重新輸入您的名字：');d.state='GET_NAME';return;}
    if(R.Save.exists(name)){
      d.ch=R.Save.load(name);d.ch.conn=d.conn;d.ch.pc.pwd=await R.hash(d.ch.name+a);
      d.out(helpText('motd'));d.state='READ_MOTD';return;
    }
    d.ch=R.newPlayer(name);d.ch.conn=d.conn;d.ch.pc.pwd=await R.hash(d.ch.name+a);
    d.out('站長帳號建立中。\n請按 Return 鍵繼續：\n');d.state='DISPLAY_RACE';return;
  }
  case 'CONFIRM_NEW_NAME':
    if(/^y/i.test(a)){d.out('這是一個新的角色。\n請為 '+ch.name+' 輸入一個密碼： ');d.conn.echo(false);d.state='GET_NEW_PASSWORD';}
    else if(/^n/i.test(a)){d.out('好吧，那麼再輸入一次：');d.ch=null;d.state='GET_NAME';}
    else d.out('請輸入 yes 或 no？');
    return;
  case 'GET_NEW_PASSWORD':
    d.out('\n');
    if(a.length<5){d.out('密碼至少要有五個英文字母或數字\n請重新輸入密碼： ');return;}
    if(/~/.test(a)){d.out('密碼中有不合法字元，請重新輸入.\nPassword: ');return;}
    ch.pc.pwd=await R.hash(ch.name+a);
    d.out('請再輸入一次密碼，以確定您沒記錯：');d.state='CONFIRM_NEW_PASSWORD';return;
  case 'CONFIRM_NEW_PASSWORD':
    d.out('\n');
    if(await R.hash(ch.name+a)!==ch.pc.pwd){d.out('前後兩次密碼不符\n請重新輸入密碼： ');d.state='GET_NEW_PASSWORD';return;}
    if(d.remember!==false)R.remember.set(ch.name,ch.pc.pwd);
    d.conn.echo(true);d.out('\n請按 Return 鍵繼續：\n');d.state='DISPLAY_RACE';return;
  case 'DISPLAY_RACE':{
    let s='請選擇一個種族：\n\n';
    for(const [r] of PC_RACES())s+='  '+r.cname+'('+r.name+')\n';
    d.out(s+'\n【請輸入種族英文名稱】：');d.state='GET_NEW_RACE';return;
  }
  case 'GET_NEW_RACE':{
    const f=a&&PC_RACES().find(([r])=>R.str_prefix(a,r.name));
    if(!f){d.out('那並不是一個種族。\n請輸入種族英文名稱？ ');return;}
    ch.race=f[1];
    d.out('\n'+helpText(f[0].name)+'您確定要選擇這個種族？(Y/N)  ');d.state='CONFIRM_NEW_RACE';return;
  }
  case 'CONFIRM_NEW_RACE':
    if(!/^y/i.test(a)){d.out('\n請按 Return 鍵繼續：\n');d.state='DISPLAY_RACE';return;}
    d.out('\n您的性別是？(M 為男性，F 為女性，N 為中性)? ');d.state='GET_NEW_SEX';return;
  case 'GET_NEW_SEX':{
    const sx={m:1,f:2,n:0}[R.lc(a[0]||'')];
    if(sx===undefined){d.out('不合法的性別，請輸入 M, F 或 N\n您的性別是? ');return;}
    ch.sex=sx;d.out('\n請按 Return 鍵繼續：\n');d.state='DISPLAY_CLASS';return;
  }
  case 'DISPLAY_CLASS':{
    let s='請選擇您的職業：\n\n';
    for(const c of R.CONST.classes.slice(0,5))s+='  '+c.cname+'('+c.who+')\n';
    d.out(s+'\n【請輸入職業英文名稱】：');d.state='GET_NEW_CLASS';return;
  }
  case 'GET_NEW_CLASS':{
    const i=a?R.CONST.classes.slice(0,5).findIndex(c=>R.str_prefix(a,c.who)||R.str_prefix(a,c.name)):-1;
    if(i<0){d.out('那並不是一個職業。\n您的職業是？ ');return;}
    ch.cls=i;
    d.out('\n'+helpText(['MAGE','CLERIC','THIEF','WARRIOR','BARBARIAN'][i])+'您確定要選擇這個職業嗎？(Y/N)');d.state='CONFIRM_CLASS';return;
  }
  case 'CONFIRM_CLASS':
    if(!/^y/i.test(a)){d.out('\n請按 Return 鍵繼續：\n');d.state='DISPLAY_CLASS';return;}
    d.out('\n'+helpText('motd'));d.state='READ_MOTD';return;
  case 'READ_MOTD':
    enterGame(d);return;
  case 'PLAYING':
    if(!ch||ch.deleted){d.state='GET_NAME';return;}
    R.interpret(ch,line);R.flush(ch,true);return;
  }
};

function enterGame(d){
  const ch=d.ch;
  d.state='PLAYING';
  if(R.isOwnerName(ch.name))ch.level=R.MAX_LEVEL;   /* 站長固定最高等級 */
  R.send(ch,'\n'+C.HIP+'歡迎來到這個神奇的幻想世界，希望您在這裡的冒險故事永遠....傳誦...'+C.NOR+'\n\n');
  let room;
  if(ch.level===0){
    const k=R.CONST.classes[ch.cls];
    const pi={APPLY_STR:0,APPLY_INT:1,APPLY_WIS:2,APPLY_DEX:3,APPLY_CON:4}[k.prime];
    if(pi!==undefined)ch.perm[pi]=16;
    ch.level=1;ch.exp=1000;
    ch.gold=10000+R.fuzzy(3)*R.fuzzy(4)*R.fuzzy(5)*10;
    ch.hit=ch.max_hit;ch.mana=ch.max_mana;ch.move=ch.max_move;
    const t=CORE.titles[k.cname];ch.pc.title='- '+(t&&t[1]||'');
    ch.pc.prompt=DEF_PROMPT;
    const give=(v,loc)=>{const p=W.objs[v];if(!p)return;const o=R.createObject(p,0);R.objToChar(o,ch);R.equipChar(ch,o,loc);};
    give(R.OBJ.BANNER,R.WEAR.LIGHT);give(R.OBJ.SHIELD,R.WEAR.SHIELD);give(R.OBJ.BOOK,R.WEAR.HOLD);
    if(!(R.CONST.races[ch.race].abil&131072)){give(R.OBJ.VEST,R.WEAR.BODY);give(k.weapon,R.WEAR.WIELD);}
    room=R.getRoom(R.ROOM_SCHOOL);
  }else room=R.getRoom(ch.savedRoom)||R.getRoom(R.ROOM_TEMPLE);
  if(!ch.pc.prompt)ch.pc.prompt=DEF_PROMPT;
  ch.logon=Date.now();ch.playing=true;
  W.players.push(ch);
  R.charToRoom(ch,room);
  R.act('$n 連線進入這個世界.',ch,null,null,R.TO_ROOM);
  for(const p of W.players)if(p!==ch&&p.playing)R.send(p,C.HIU+'【宣布】'+ch.name+' 進入了混沌幻世。'+C.NOR+'\n');   /* 推測：CHANNEL_SYSTEM 字串 */
  R.cmds.look(ch,'auto');
  if(ch.level===1&&ch.exp===1000)R.Save.save(ch);
  R.flush(ch,true);
}

R.logout=function(ch){
  ch.playing=false;
  R.stopFighting(ch,true);
  for(const o of [...ch.carrying])R.extractObj(o);
  if(ch.room)R.charFromRoom(ch);
  const i=W.players.indexOf(ch);if(i>=0)W.players.splice(i,1);
  R.flush(ch,true);
  const d=ch.desc;
  if(d){d.ch=null;d.state='GET_NAME';setTimeout(()=>{d.out('\n');d.greet();},800);}
};

R.boot=function(conn){
  /* 世界資料可能還在背景下載：先出登入畫面，第一次需要世界時才等它 */
  R.worldReady=Promise.resolve(R.areasReady).then(()=>{R.bootDb();R.startUpdate();});
  let ready=false;R.worldReady.then(()=>{ready=true;});
  const d=new R.Desc(conn);conn.desc=d;
  conn.onInput(async line=>{
    try{
      if(!ready){d.out('\x1b[1;30m（世界載入中，請稍候…）\x1b[0m\n');await R.worldReady;}
      await d.input(line);
      if(d.ch){d.ch.desc=d;if(d.state==='PLAYING')R.flush(d.ch,true);}
    }catch(e){console.error(e);conn.send('\x1b[1;31m[錯誤] '+e.message+'\x1b[m\n');}
  });
  d.greet();
  window.addEventListener('beforeunload',()=>{for(const p of W.players)if(p.playing&&!p.noSave)R.Save.save(p);});
};
})(ROC);
