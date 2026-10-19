/* skill.js — 練習、技能／法術列表（act_info.c do_practice / do_spells / do_slist） */
(function(R){
const C=R.C,P=R.POS,cmd=R.cmds,SK=R.SK;
const fmt=(s,n)=>R.padL(s,n);   /* C 的 %14s：靠右、以顯示寬度計 */
R.skillExpDesc=l=>[C.HIU+'新學乍練'+C.NOR,C.HIP+'略知一二'+C.NOR,C.HIR+'得心應手'+C.NOR,C.HIG+'神乎其技'+C.NOR,
  C.HIY+'超凡入聖'+C.NOR,C.HIC+'深不可測'+C.NOR,C.HIW+'天人合一'+C.NOR][l]||'BUG CHAR';

/* practice_skills 解析：空白分隔、'多字' 用引號、* 開頭需 qmark */
function pskList(psk){
  const out=[];let s=String(psk||'').replace(/\\n|\n/g,' ');
  while(s.trim()){const [w,r]=R.one_arg(s);s=r;if(w)out.push(w);}
  return out;
}
/* is_skname：-1 不會、0 會、1 要資格 */
function isSkname(str,psk){
  for(const n of pskList(psk)){const q=n[0]==='*',nm=q?n.slice(1):n;if(R.str_prefix(str,nm))return q?1:0;}
  return -1;
}
const tutorOf=(ch,name)=>ch.room.people.find(m=>!m.deleted&&m.npc&&m.act.has('PRACTICE')&&(name?R.is_name(name,m.name):m.psk));

cmd.practice=function(ch,argument){
  if(ch.npc)return;
  let money=ch.level*ch.level*20;if(ch.cls<5)money=Math.floor(money/2);
  const [arg1,rest]=R.one_arg(argument||''),[arg2]=R.one_arg(rest);
  if(!argument){
    const mob=tutorOf(ch);
    if(!mob||!mob.psk){R.send(ch,'你找不到導師。\n');return;}
    let buf='',col=0;
    for(let sn=0;sn<SK.length;sn++){
      if(R.skillReqLevel(ch,sn)===R.L_APP)continue;
      const can=isSkname(SK[sn].name,mob.psk)!==-1;
      buf+=C.HIW+(can?'+':' ')+C.NOR+fmt(SK[sn].cname,14)+'('+fmt(SK[sn].name,16)+') '+R.padL(R.getSkillPercent(ch,sn),3)+'% ';
      if(++col%2===0)buf+='\n';
    }
    if(col%3!==0)buf+='\n';
    buf+='你還有'+ch.practice+'點練習點數。\n練習的費用是'+money+'枚金幣。\n';
    R.send(ch,buf);return;
  }
  let mob,skarg=argument;
  if(!arg2){
    if(ch.level<3){R.send(ch,'你得要在三級以上才能練習(practice)，先去訓練(train)吧！\n');return;}
    if(!R.isAwake(ch)){R.send(ch,'是要在夢裡練習嗎？\n');return;}
    mob=ch.room.people.find(m=>!m.deleted&&m.npc&&m.act.has('PRACTICE'));
    if(!mob||!mob.psk){R.send(ch,'你找不到導師。\n');return;}
  }else{
    /* practice <技能> <導師> */
    skarg=arg1;
    mob=tutorOf(ch,arg2);
    if(!mob||!mob.psk){R.send(ch,'你找不到導師。\n');return;}   /* 推測：第三種用法沿用同樣檢查 */
    if(ch.level<3){R.send(ch,'你得要在三級以上才能練習(practice)，先去訓練(train)吧！\n');return;}
  }
  if(ch.practice<=0){R.send(ch,'你沒有練習點數了。\n');return;}
  if(money>ch.gold&&ch.cls>4){R.send(ch,'你付不起練習的費用。\n');return;}
  if(/^\s*['"]/.test(skarg))skarg=R.one_arg(skarg)[0];   /* 引號包住的多字技能名 */
  const sn=R.skillLookup(skarg);
  if(sn<0||ch.level<R.skillReqLevel(ch,sn)){R.send(ch,'你不能練習那個。\n');return;}
  switch(isSkname(skarg,mob.psk)){
    case -1:R.act('$n 說：對不起，我並不會那項技巧。',mob,null,ch,R.TO_VICT);return;
    case 1:if(!(ch.qmarks&&ch.qmarks[SK[sn].name])){R.act('$n 說：對不起，你還不夠資格學習這項技巧。',mob,null,ch,R.TO_VICT);return;}break;
  }
  const adept=R.skillMaxPercent(ch,sn);
  if(R.getSkillPercent(ch,sn)>=adept){R.send(ch,'你已經無法提升'+SK[sn].cname+'('+SK[sn].name+')的熟練度了。\n');return;}
  ch.practice--;
  if(ch.cls>4)ch.gold-=money;
  R.gainSkillPercent(ch,sn,R.intLearn(ch));
  if(R.getSkillPercent(ch,sn)<adept){
    R.act(C.CYN+'你練習了$t($T)。'+C.NOR,ch,SK[sn].cname,SK[sn].name,R.TO_CHAR);
    R.act(C.CYN+'$n練習了$t($T)。'+C.NOR,ch,SK[sn].cname,SK[sn].name,R.TO_ROOM);
  }else{
    R.act(C.CYN+'你現在是$t($T)的專家了。'+C.NOR,ch,SK[sn].cname,SK[sn].name,R.TO_CHAR);
    R.act(C.CYN+'$n現在是$t($T)的專家了。'+C.NOR,ch,SK[sn].cname,SK[sn].name,R.TO_ROOM);
  }
};

cmd.spells=function(ch){
  if(ch.npc){R.send(ch,'你不需要使用咒文。\n');return;}
  let buf='咒   文   列   表：\n',col=0;
  for(let sn=1;sn<SK.length;sn++){
    if(!SK[sn].fun||!R.getSkillPercent(ch,sn))continue;
    buf+=fmt(SK[sn].cname,15)+'('+fmt(SK[sn].name,17)+') '+R.padL(SK[sn].mana,3)+'點';
    if(++col%2===0)buf+='\n';
  }
  if(col%2!==0)buf+='\n';
  if(!col)buf+='（你還沒學會任何咒文。）\n';   /* 推測：原版此時只印標題 */
  R.send(ch,buf);
};

cmd.slist=function(ch,argument){
  const [arg]=R.one_arg(argument||'');let v=ch;
  if(arg){
    if(!(v=R.getCharWorld(ch,arg))){R.send(ch,'這裡沒有這個人。\n');return;}
    if(v!==ch&&!R.isImm(ch)){R.send(ch,'你不能看別人的資料。\n');return;}
  }
  if(v.npc){R.send(ch,'你不需要用到技能。\n');return;}
  let buf='你的職業可以用的技能如下：\n\n等級          技能/魔法名稱                   熟練度     技能等級  所需經驗\n\n';
  const maxL=v.level<R.L_APP?42:R.L_APP;
  for(let level=0;level<=maxL;level++){
    let first=true;
    for(let sn=1;sn<SK.length;sn++){
      const req=R.skillReqLevel(v,sn);
      if(req!==level&&!(level===0&&R.getSkillPercent(v,sn)&&req===R.L_APP))continue;
      if(req===R.L_APP&&level!==0)continue;
      buf+=first?'['+R.padL(level,2)+']  ':'      ';first=false;
      buf+=fmt(SK[sn].cname,16)+'('+fmt(SK[sn].name,25)+')  '+R.padL(R.getSkillPercent(v,sn),3)+'%/'+R.padL(R.skillMaxPercent(v,sn),3)+'%   '+R.padL(R.skillExpDesc(R.getSkillLevel(v,sn)),8)+(v.cls<R.WIZARD?' ':'  [ＭＡＸ]')+'\n';
    }
  }
  R.send(ch,buf);
};
})(ROC);
