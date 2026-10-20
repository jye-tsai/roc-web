/* group.js — 組隊、銀行與常用指令
   對應 act_comm.c（do_group／do_show_group_info／do_split／do_gtell／do_bug）、handler.c（add_member／remove_member／clear_member）、
   act_obj.c（do_deposit／do_withdraw／do_fill）、act_info.c（do_compare／do_where／do_report／do_whois／do_afk／do_autosac／do_auto／do_description） */
(function(R){
const cmd=R.cmds,C=R.C,W=R.world;
const say=(ch,s)=>R.send(ch,s+'\n');

/* ---------- 隊伍：ch.group={leader,name,members:[]} ---------- */
R.isSameGroup=function(a,b){
  if(!a||!b||a.deleted||b.deleted)return false;
  if(!a.group)return a===b;
  if(!a.npc&&!b.npc&&Math.abs(a.level-b.level)>5)return false;
  return a.group===b.group;
};
function addMember(ch,m){const g=ch.group;if(!g||ch===m||m.group)return;m.group=g;g.members.unshift(m);}
function clearMember(ch){const g=ch.group;if(!g)return;for(const m of g.members)m.group=null;g.members=[];g.leader=null;}
function removeMember(m){
  const g=m.group;if(!g)return;
  if(m===g.leader){clearMember(m);return;}
  g.members=g.members.filter(x=>x!==m);m.group=null;
}
R.removeMember=removeMember;
const CLS=(v,ch)=>v.npc?'非玩者':(R.CONST.classes[v.cls]||{})[ch.act.has('CHINESE')?'cwho':'who']||'';
const statC=(a,b)=>a*4<b?C.HIR:a*2<b?C.HIY:C.HIG;
/* do_show_group_info：手機上一人兩行（原版一行約 80 格會折行） */
function showGroup(ch,arg){
  const L=ch.group?ch.group.leader:ch;
  let s='\n'+(L.group?L.group.name:R.PERS(ch,ch)+'的隊伍')+C.NOR+'：\n';
  let ms=W.chars.concat(W.players).filter((v,i,a)=>a.indexOf(v)===i&&!v.deleted&&R.isSameGroup(v,ch));
  const key={l:'level',h:'max_hit',m:'max_mana',v:'max_move',c:'cls'}[arg[1]];
  if(key&&/^[-+]/.test(arg))ms.sort((a,b)=>arg[0]==='-'?a[key]-b[key]:b[key]-a[key]);
  if(arg==='+r')ms=ms.filter(v=>v.room===ch.room);
  if(arg==='-r')ms=ms.filter(v=>v.room!==ch.room);
  for(const v of ms){
    const here=v.room===ch.room;
    s+=(here?'':C.CYN)+'['+R.pad(String(v.level),3)+R.pad(CLS(v,ch),6)+'] '+C.NOR+(R.canSee(ch,v)?R.strip(R.PERS(v,ch)):'不明人物')+(ch.group&&v===L?C.HIY+' (隊長)'+C.NOR:'')+'\n';
    s+='    生命 '+statC(v.hit,v.max_hit)+v.hit+C.NOR+'/'+v.max_hit+'  魔法 '+statC(v.mana,v.max_mana)+v.mana+C.NOR+'/'+v.max_mana
      +'  移動 '+statC(v.move,v.max_move)+v.move+C.NOR+'/'+v.max_move+'\n';
  }
  R.send(ch,s);
}
cmd.group=function(ch,argument){
  const [arg,rest]=R.one_arg(argument||'');const [arg1]=R.one_arg(rest||'');
  if(!arg||/^[-+][lhmvc]$|^-k$|^[-+]r$|^-p$/.test(arg)){showGroup(ch,arg||'');return;}
  if(arg==='form'){
    if(ch.group){say(ch,'你已經有隊伍了。');return;}
    const name=(rest||'').trim()||R.PERS(ch,ch)+'的隊伍';
    if(R.width(name)>30){say(ch,'你的隊名太長了。');return;}
    ch.group={leader:ch,name,members:[ch]};
    R.act(C.CYN+'你成立了一支冒險隊伍。'+C.NOR,ch,null,null,R.TO_CHAR);
    R.act(C.CYN+'$n成立了一支冒險隊伍。'+C.NOR,ch,null,null,R.TO_ROOM);return;
  }
  if(!ch.group){say(ch,'你並沒有在隊伍中。');return;}
  const g=ch.group;
  if(arg==='leave'){
    R.act(C.CYN+'$N脫離了你的隊伍。'+C.NOR,g.leader,null,ch,R.TO_CHAR);
    R.act(C.CYN+'你脫離了$n的隊伍。'+C.NOR,g.leader,null,ch,R.TO_VICT);
    removeMember(ch);return;
  }
  if(ch!==g.leader){say(ch,'只有一隊之長才可以這麼做。');return;}
  if(arg==='disband'){
    R.act(C.CYN+'你解散了隊伍。'+C.NOR,ch,null,null,R.TO_CHAR);R.act(C.CYN+'$n解散了隊伍。'+C.NOR,ch,null,null,R.TO_ROOM);
    clearMember(ch);return;
  }
  if(arg==='transfer'){
    const v=R.getCharRoom(ch,arg1);
    if(!v||v.npc){say(ch,C.YEL+'他不在這兒。'+C.NOR);return;}
    if(v===ch){say(ch,'你已經是隊長了。');return;}
    if(!R.isSameGroup(ch,v)){say(ch,'先收他入隊吧。');return;}
    R.act(C.CYN+'你把隊長之職交接給$N。'+C.NOR,ch,null,v,R.TO_CHAR);R.act(C.CYN+'$n把隊長之職交接給你。'+C.NOR,ch,null,v,R.TO_VICT);
    R.act(C.CYN+'$n把隊長之職交接給$N。'+C.NOR,ch,null,v,R.TO_NOTVICT);
    g.leader=v;return;
  }
  if(arg==='*'){
    const v=R.getCharRoom(ch,arg1);
    if(!v){say(ch,C.YEL+'他不在這兒。'+C.NOR);return;}
    if(!v.group||v!==v.group.leader){say(ch,'他並不是一隊之長。');return;}
    if(v.master!==ch&&ch!==v){R.act(C.YEL+'$N並沒有跟隨你。'+C.NOR,ch,null,v,R.TO_CHAR);return;}
    if(R.isSameGroup(ch,v))return;
    const old=v.group;for(const m of old.members){m.group=g;g.members.unshift(m);}old.members=[];old.leader=null;
    R.act(C.CYN+'你併吞了$N的隊伍。'+C.NOR,ch,null,v,R.TO_CHAR);R.act(C.CYN+'$n併吞了你的隊伍。'+C.NOR,ch,null,v,R.TO_VICT);
    R.act(C.CYN+'$n併吞了$N的隊伍。'+C.NOR,ch,null,v,R.TO_NOTVICT);return;
  }
  const join=v=>{addMember(ch,v);
    R.act(C.CYN+'$N加入你的隊伍。'+C.NOR,ch,null,v,R.TO_CHAR);R.act(C.CYN+'你加入$n的隊伍。'+C.NOR,ch,null,v,R.TO_VICT);
    R.act(C.CYN+'$N加入$n的隊伍。'+C.NOR,ch,null,v,R.TO_NOTVICT);};
  if(arg==='all'){for(const v of [...ch.room.people])if(!v.group&&v.master===ch&&v!==ch)join(v);return;}
  if(arg==='+'){
    const v=R.getCharRoom(ch,arg1);
    if(!v){say(ch,C.YEL+'他不在這兒。'+C.NOR);return;}
    if(v===ch){say(ch,C.YEL+'找個別的隊友比較實際點。'+C.NOR);return;}
    if(v.master!==ch){R.act(C.YEL+'$N並沒有跟隨你。'+C.NOR,ch,null,v,R.TO_CHAR);return;}
    if(v.group)return;   /* 原版 add_member 只記 bug log */
    join(v);return;
  }
  if(arg==='-'){
    const v=R.getCharRoom(ch,arg1);
    if(!v){say(ch,C.YEL+'他不在這兒。'+C.NOR);return;}
    if(v===ch){say(ch,C.YEL+'請使用group leave。'+C.NOR);return;}
    if(!R.isSameGroup(v,ch)){say(ch,'他不在你的隊伍裡。');return;}
    removeMember(v);
    R.act(C.CYN+'你把$N移出你的隊伍。'+C.NOR,ch,null,v,R.TO_CHAR);R.act(C.CYN+'$n把你移出$s隊伍。'+C.NOR,ch,null,v,R.TO_VICT);
    R.act(C.CYN+'$n把$N移出$s隊伍。'+C.NOR,ch,null,v,R.TO_NOTVICT);return;
  }
};
cmd.split=function(ch,argument){
  const [arg]=R.one_arg(argument||'');
  if(!arg){say(ch,C.YEL+'分配多少錢？'+C.NOR);return;}
  const amount=parseInt(arg,10)||0;
  if(amount<0){say(ch,C.YEL+'你的隊友不會想要這樣的。'+C.NOR);return;}
  if(amount===0){say(ch,C.YEL+'你拿出了零塊錢，但是沒有人注意到。'+C.NOR);return;}
  if(ch.gold<amount){say(ch,C.YEL+'你沒有那麼多金幣。'+C.NOR);return;}
  const ms=ch.room.people.filter(g=>!g.deleted&&R.isSameGroup(g,ch)&&!g.npc);
  if(ms.length<2)return;
  const share=Math.floor(amount/ms.length),extra=amount%ms.length;
  if(!share){say(ch,C.YEL+'別打擾人家，小氣鬼。'+C.NOR);return;}
  ch.gold+=share+extra-amount;
  say(ch,C.CYN+'你分出了'+amount+'枚金幣。你自己分到了'+(share+extra)+'枚金幣。'+C.NOR);
  for(const g of ms)if(g!==ch){R.act(C.CYN+'$n分出了'+amount+'枚金幣。你分到了'+share+'枚金幣。'+C.NOR,ch,null,g,R.TO_VICT);g.gold+=share;}
};
cmd.gtell=function(ch,argument){
  const a=(argument||'').trim();
  if(!a){say(ch,C.YEL+'要告訴你的隊友什麼？'+C.NOR);return;}
  if(ch.aff.has('MUTE')||ch.room.flags.has('CONE_OF_SILENCE')){say(ch,C.YEL+'你的嘴唇在動，但是沒有聲音跑出來。'+C.NOR);return;}
  const s=C.HIG+R.PERS(ch,ch)+'向隊友說「'+a+'」。'+C.NOR;
  for(const g of W.chars.concat(W.players))if(R.isSameGroup(g,ch)&&g.room&&!g.room.flags.has('CONE_OF_SILENCE'))say(g,s);
};
cmd[';']=cmd.gtell;

/* ---------- 銀行 ---------- */
const banker=ch=>ch.room.people.find(v=>v.npc&&v.act&&v.act.has('BANKER'));
const MAXI=2147483647;
cmd.deposit=function(ch,argument){
  const vch=banker(ch),[arg]=R.one_arg(argument||'');
  if(!/^\d+$/.test(arg||'')){say(ch,'請明確說出一個數字。');return;}
  const n=+arg;
  if(n<1){say(ch,'請至少存一元。');return;}
  if(!vch){say(ch,'你找不到人幫你存錢。');return;}
  if(n>ch.gold){say(ch,'喔！你身上沒那麼多錢。');return;}
  if(n>MAXI-ch.bank){say(ch,'你的戶頭存不了這麼多錢。');return;}
  ch.gold-=n;ch.bank+=n;
  R.act('$N向你一鞠躬說：謝謝您的光臨，大陸連鎖銀行永遠竭誠為您服務。',ch,null,vch,R.TO_CHAR);
  R.act('$N向$n一鞠躬說：謝謝您的光臨，大陸連鎖銀行永遠竭誠為您服務。',ch,null,vch,R.TO_ROOM);
};
cmd.withdraw=function(ch,argument){
  const vch=banker(ch),[arg]=R.one_arg(argument||'');
  if(!/^\d+$/.test(arg||'')){say(ch,'請明確說出一個數字。');return;}
  const n=+arg;
  if(n<1){say(ch,'請至少領一元。');return;}
  if(!vch){say(ch,'你找不到人幫你提錢。');return;}
  if(n>ch.bank){say(ch,'搶劫啊？你哪來那麼多錢？');return;}
  if(n>MAXI-ch.gold){say(ch,'你的身上帶不了這麼多錢。');return;}
  ch.gold+=n;ch.bank-=n;
  R.act('$N向你一鞠躬說：這是您的金幣，請點收。謝謝您的光臨。',ch,null,vch,R.TO_CHAR);
  R.act('$N向$n一鞠躬說：這是您的金幣，請點收。謝謝您的光臨。',ch,null,vch,R.TO_ROOM);
};

/* ---------- 常用指令 ---------- */
cmd.compare=function(ch,argument){
  const [a1,rest]=R.one_arg(argument||''),[a2]=R.one_arg(rest||'');
  if(!a1){say(ch,C.YEL+'要比較什麼跟什麼？'+C.NOR);return;}
  const o1=R.getObjCarry(ch,a1);
  if(!o1){say(ch,C.YEL+'你沒有那樣東西。'+C.NOR);return;}
  const share=(x,y)=>[...x.wear].some(f=>f!=='TAKE'&&y.wear.has(f));
  let o2;
  if(!a2){
    o2=ch.carrying.find(o=>o.wear_loc>=0&&R.canSeeObj(ch,o)&&o.type===o1.type&&share(o1,o));
    if(!o2){say(ch,C.YEL+'你沒有穿著可以拿來做為比較的東西。'+C.NOR);return;}
  }else if(!(o2=R.getObjCarry(ch,a2))){
    o2=R.getObjWear(ch,a2);
    if(!o2){say(ch,C.YEL+'你沒有那樣東西。'+C.NOR);return;}
    if(!share(o1,o2)){say(ch,C.YEL+'這不是可以拿來比較的東西。'+C.NOR);return;}
  }
  let msg=null,v1=0,v2=0;
  const val=(o,i)=>+(o.values[i]||0);
  if(o1===o2)msg=C.YEL+'你把$p和它自己拿來比較。它們看起來差不多是一樣的。'+C.NOR;
  else if(o1.type!==o2.type)msg=C.YEL+'你不能拿$P來跟$p比較。'+C.NOR;
  else if(o1.type==='ARMOR'){v1=val(o1,0);v2=val(o2,0);}
  else if(o1.type==='WEAPON'){v1=val(o1,1)+val(o1,2);v2=val(o2,1)+val(o2,2);}
  else msg=C.YEL+'$p和$P不能拿來比較。'+C.NOR;
  if(!msg){
    const eq=o2.wear_loc>=0?'（裝備在身上的）':'';
    msg=C.CYN+(v1===v2?'$p和$P'+eq+'看起來差不多是一樣的。':v1>v2?'$p看起來比$P'+eq+'要來得好。':'$p看起來比$P'+eq+'還來得爛。')+C.NOR;
  }
  R.act(msg,ch,o1,o2,R.TO_CHAR);
};
cmd.where=function(ch,argument){
  if(ch.aff.has('BLIND')&&!R.isImm(ch)){say(ch,'你什麼也看不見！');return;}
  const [arg]=R.one_arg(argument||'');
  if(!arg){
    let s=C.CYN+'在你附近的有：'+C.NOR+'\n',found=false;
    for(const v of W.players)if(v.playing&&v.room&&v.room.area===ch.room.area&&R.canSee(ch,v)){found=true;s+=R.pad(R.PERS(v,ch),18)+' '+v.room.name+'\n';}
    R.send(ch,found?s:s+C.YEL+'無'+C.NOR+'\n');return;
  }
  for(const v of W.players.concat(W.chars)){
    if(!v.room||v.aff.has('HIDE')||v.aff.has('SNEAK'))continue;
    if(v.room.area===ch.room.area&&R.canSee(ch,v)&&R.lc(v.name).split(/\s+/).some(w=>R.str_prefix(arg,w))){
      R.send(ch,R.pad(R.PERS(v,ch),28)+' '+v.room.name+'\n');return;}
  }
  R.act(C.YEL+'你找不到什麼$T。'+C.NOR,ch,null,arg,R.TO_CHAR);
};
cmd.report=function(ch){
  const st=ch.hit+'/'+ch.max_hit+'點生命力、'+ch.mana+'/'+ch.max_mana+'點魔法力、'+ch.move+'/'+ch.max_move+'點移動力、'+ch.exp+'點經驗值。';
  say(ch,C.CYN+'你的狀態：'+st+C.NOR);
  R.act(C.CYN+'$n報告狀態：'+st+C.NOR,ch,null,null,R.TO_ROOM);
};
cmd.whois=function(ch,argument){
  const [n]=R.one_arg(argument||'');
  if(!n){say(ch,C.YEL+'使用方法：whois <name>'+C.NOR);return;}
  let s='';
  for(const w of W.players){
    if(!w.playing||!R.canSee(ch,w)||!R.str_prefix(n,w.name))continue;
    const k=R.CONST.classes[w.cls]||{},r=R.CONST.races[w.race]||{};
    const afk=w.act.has('AFK')?'('+C.HIP+'發呆'+C.NOR+')':'';
    s+=R.isImm(w)?'(        '+C.HIW+'天神'+C.NOR+'        )'+afk+w.name+' '+(w.pc.title||'')+'\n'
      :'('+R.padL(String(w.level),2)+' '+(k.cname||'')+' '+R.pad(r.cname||'',6)+'('+R.pad(r.name||'',8)+'))'+afk+w.name+' '+(w.pc.title||'')+'\n';
  }
  R.send(ch,s||C.YEL+'沒有人合你的條件。'+C.NOR+'\n');
};
cmd.afk=function(ch){
  if(ch.npc)return;
  if(ch.act.has('AFK')){ch.act.delete('AFK');say(ch,C.CYN+'你回到了傳說中。'+C.NOR);R.act(C.CYN+'$n回到了傳說中。'+C.NOR,ch,null,ch,R.TO_ROOM);}
  else{ch.act.add('AFK');say(ch,C.CYN+'你暫時離開傳說。'+C.NOR);R.act(C.CYN+'$n暫時離開傳說。'+C.NOR,ch,null,ch,R.TO_ROOM);}
};
cmd.auto=ch=>cmd.config(ch,'');
cmd.description=function(ch,argument){
  if(ch.npc||ch.aff.has('CHARM'))return;
  let a=argument||'';
  if(a.trim()){
    let buf='';a=a.replace(/~/g,'-');
    if(a[0]==='+'){buf=ch.pc.description||'';a=a.slice(1).trimStart();}
    if(R.width(buf)+R.width(a)>=500){say(ch,C.YEL+'描述太長了。'+C.NOR);return;}
    ch.pc.description=buf+a+'\n';
  }
  R.send(ch,'你的描述是：\n'+(ch.pc.description||'（無）。\n'));
};
cmd.fill=function(ch,argument){
  if(ch.aff.has('BLIND')){say(ch,'你什麼也看不見！');return;}
  const [arg,rest]=R.one_arg(argument||''),[arg1]=R.one_arg(rest||'');
  if(!arg){say(ch,'Fill 什麼？');return;}
  const o=R.getObjCarry(ch,arg);
  if(!o){say(ch,'你身上沒有這樣東西.');return;}
  let f;
  if(!arg1){f=ch.room.contents.find(x=>x.type==='FOUNTAIN');if(!f){say(ch,'這裡沒有水源！');return;}}
  else{f=R.getObjList(ch,arg1,ch.room.contents);if(!f){R.act('這裡沒有 $T.',ch,null,arg1,R.TO_CHAR);return;}if(f.type!=='FOUNTAIN'){say(ch,'這東西不是水源!');return;}}
  if(o.type!=='DRINK_CON'){say(ch,'那樣東西不能裝水.');return;}
  const v=o.values,fv=f.values;
  if((+v[0]||0)<1||+v[1]===-1){say(ch,'這樣東西裝不了水.');return;}
  if((+fv[1]||0)<1){say(ch,'這個水源乾涸了.');return;}
  if(+v[1]>=+v[0]){say(ch,'那已經裝滿了.');return;}
  R.act('你把 $p 倒光。',ch,o,null,R.TO_CHAR);R.act('你重新裝滿 $p.',ch,o,null,R.TO_CHAR);
  v[2]=fv[2];v[1]=Math.min(+v[0],+fv[1]);v[3]=fv[3];fv[1]=+fv[1]-v[1];
  R.MP&&R.MP.objAct(ch,o,'fill');R.MP&&R.MP.objAct(ch,f,'filled');
};
cmd.wizlist=ch=>cmd.help(ch,'wizlist');
/* bug／idea／typo：原版寫進伺服器檔案，網頁版存在這台裝置的 localStorage（roc.report） */
const report=ch=>(ch2,a)=>{
  if(!(a||'').trim()){say(ch2,C.YEL+'作者們用懷疑的眼神看著你。'+C.NOR);return;}
  try{const k='roc.report',l=JSON.parse(localStorage.getItem(k)||'[]');l.push({t:ch,who:ch2.name,room:ch2.room&&ch2.room.vnum,msg:a.trim(),at:new Date().toISOString()});localStorage.setItem(k,JSON.stringify(l.slice(-200)));}catch(e){}
  say(ch2,C.CYN+'沒問題。謝謝你。'+C.NOR);
};
cmd.bug=report('bug');cmd.idea=report('idea');cmd.typo=report('typo');
})(ROC);
