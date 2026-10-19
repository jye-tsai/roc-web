/* train.js — 訓練屬性／生命／魔法／移動／練習點（對應 act_move.c do_train） */
(function(R){
const cmd=R.cmds,PPL=2;
const ATTR={str:[0,'力量','APPLY_STR'],int:[1,'智能','APPLY_INT'],wis:[2,'智慧','APPLY_WIS'],dex:[3,'敏捷','APPLY_DEX'],con:[4,'體質','APPLY_CON']};
const prime=ch=>(ch.pc&&ch.pc.prime_attr)||(R.CONST.classes[ch.cls]||{}).prime||'';
const snd=ch=>(ch.pc&&ch.pc.snd_attr)||'';
const hasLoc=(ch,loc)=>(ch.affects||[]).some(a=>!a.deleted&&String(a.location).replace(/^APPLY_/,'')===loc);
const raceIdx=n=>R.CONST.races.findIndex(r=>r.name===n);
/* 種族變異中不能練屬性 */
function morphed(ch){
  if(!R.isAffected(ch,R.gsn.werewolf)){if(hasLoc(ch,'RACE'))return true;}
  else if(ch.race!==raceIdx('Werewolf')&&ch.race!==raceIdx('Human'))return true;
  return ch.aff.has('POLYMORPH');
}
cmd.train=function(ch,argument){
  if(ch.npc||!ch.room)return;
  const mob=ch.room.people.find(m=>m.npc&&m.act&&m.act.has('TRAIN'));
  if(!mob){R.send(ch,R.C.YEL+'你找不到導師。'+R.C.NOR+'\n');return;}
  let arg=R.lc((argument||'').trim().split(/\s+/)[0]||'');
  if(!arg){R.send(ch,R.C.CYN+'你有'+ch.practice+'點練習點數。'+R.C.NOR+'\n');arg='foo';}
  let hp_f=30,mp_f=10,mv_f=10;
  const newbie=800,oldbie=600,L=ch.level;
  switch(prime(ch)){
    case 'APPLY_CON':hp_f+=30;mp_f+=5;mv_f+=15;break;
    case 'APPLY_STR':hp_f+=20;mv_f+=25;mp_f+=5;break;
    case 'APPLY_INT':hp_f-=10;mp_f+=45;mv_f+=15;break;
    case 'APPLY_DEX':mv_f+=35;mp_f+=5;hp_f+=10;break;
    case 'APPLY_WIS':mp_f+=35;hp_f-=5;mv_f+=20;break;
  }
  if(ch.cls>4){
    hp_f+=20;mp_f+=20;mv_f+=20;
    switch(snd(ch)){
      case 'APPLY_CON':hp_f+=10;mp_f+=2;mv_f+=3;break;
      case 'APPLY_STR':hp_f+=5;mp_f+=5;mv_f+=5;break;
      case 'APPLY_INT':hp_f+=2;mp_f+=11;mv_f+=2;break;
      case 'APPLY_DEX':hp_f+=4;mp_f+=3;mv_f+=8;break;
      case 'APPLY_WIS':hp_f+=3;mp_f+=8;mv_f+=4;break;
    }
  }
  hp_f*=PPL;mp_f*=PPL;mv_f*=PPL;
  const T=Math.trunc;
  let cost=5,money=L*L*100,times=0,bone=0,key=null,out='';
  const hp_b=T(L*hp_f/2),mp_b=T(L*mp_f/2),mv_b=T(L*mv_f/2);
  const old=ch.cls>4;
  const nHp=T((old?10000*(T(ch.max_hit/oldbie/2)+1):8000*(T(ch.max_hit/newbie/2)+1))/PPL);
  const nMn=T((old?15000*(T(ch.max_mana/oldbie)+1):12000*(T(ch.max_mana/newbie)+1))/PPL);
  const nMv=T((old?10000*(T(ch.max_move/oldbie)+1):8000*(T(ch.max_move/newbie)+1))/PPL);
  const expNeed=R.expPer(L-1)*L+5000;
  const mods=(R.CONST.races[ch.race]||{}).mods||[0,0,0,0,0];
  const base=arg.replace(/-r$/,'');
  if(ATTR[arg]){
    if(morphed(ch)){R.send(ch,'種族變異中不能訓練屬性。\n');return;}
    const [i,nm,ap]=ATTR[arg];
    if(prime(ch)===ap)cost=3;
    key=i;out=nm;
  }else if(base==='hp'||base==='mana'||base==='move'){
    const k={hp:['HIT','生命力','max_hit',hp_f,hp_b,5,nHp,'你現在的狀態無法提升生命力。'],
             mana:['MANA','魔法力','max_mana',mp_f,mp_b,3,nMn,'你現在的狀態無法提升魔力。'],
             move:['MOVE','移動力','max_move',mv_f,mv_b,3,nMv,'你現在的狀態無法提升移動力。']}[base];
    if(hasLoc(ch,k[0])){R.send(ch,k[7]+'\n');return;}
    if(ch[k[2]]>=L*k[3]){R.send(ch,'你的'+(base==='mana'?'魔力':k[1])+'已經超過上限了。先去升點等級吧。\n');return;}
    const scale=L*k[5]*PPL;
    cost=Math.max(1,ch[k[2]]>k[4]?T((ch[k[2]]-k[4])/scale)+1:1);
    money=k[6];bone=base==='move'?2:1;key=k[2];out=k[1];
    if(arg!==base)times=1;
  }else if(base==='practice'){
    cost=0;money=L*L*10;bone=1;key='practice';out='練習點';
    if(arg!==base)times=1;
  }else{
    let b=R.C.CYN+'你可以訓練:';
    if(!ch.aff.has('POLYMORPH'))
      for(const [n,[i]] of Object.entries(ATTR))if(ch.perm[i]<13+mods[i])b+=' '+n;
    const pr=ch.exp>expNeed,h=ch.max_hit<L*hp_f,m=ch.max_mana<L*mp_f,v=ch.max_move<L*mv_f;
    if(pr)b+=' practice';if(h)b+=' hp';if(m)b+=' mana';if(v)b+=' move';
    let s='';
    if(pr||h||m||v){
      s+=b+'.\n';b=R.C.CYN+'盡可能的去訓練:';
      if(pr)b+=' practice-r';if(h)b+=' hp-r';if(m)b+=' mana-r';if(v)b+=' move-r';
      s+=b+'.\n';
    }
    if(!b.endsWith(':')){
      if(!s)s+=b+'.\n';   /* 只有屬性可練時原版不印清單（buf 被覆寫前沒送出）；這裡照樣列出方便看 */
      s+='訓練一個屬性的費用是'+money+'枚金幣，\n';
      s+='生命力是'+nHp+'枚金幣。\n魔法力是'+nMn+'枚金幣。\n移動力是'+nMv+'枚金幣。\n';
      s+='練習點是'+(L*L*10)+'枚金幣。'+R.C.NOR+'\n';
    }else s+=R.C.NOR;
    R.send(ch,s);return;
  }
  if(bone===0&&!(ch.perm[key]<13+mods[key])){R.act(R.C.YEL+'你的$T已經到了上限了。'+R.C.NOR,ch,null,out,R.TO_CHAR);return;}
  const isPr=base==='practice';
  if(cost>ch.practice&&!isPr){R.send(ch,R.C.YEL+'你的練習點數不夠。'+R.C.NOR+'\n');return;}
  if(money>ch.gold){R.send(ch,R.C.YEL+'你的錢不夠了。'+R.C.NOR+'\n');return;}
  if(isPr&&ch.exp<expNeed){R.send(ch,R.C.YEL+'你的經驗不夠。'+R.C.NOR+'\n');return;}
  const cap={max_hit:L*hp_f,max_mana:L*mp_f,max_move:L*mv_f};
  const once=()=>{
    ch.practice-=cost;ch.gold-=money;if(cost<=0)ch.exp-=5000;
    if(bone===0)ch.perm[key]+=1;
    else if(key==='practice')ch.practice+=R.dice(1,2);
    else ch[key]+=R.dice(1,key==='max_move'?5:2)*PPL;
  };
  if(times>0){
    for(;times<=100;times++){
      if(cost>0&&cost>ch.practice)break;
      if(cost<=0&&ch.exp<expNeed)break;
      if(money>ch.gold)break;
      if(cap[key]!==undefined&&ch[key]>=cap[key]){ch.practice-=cost;ch.gold-=money;break;}   /* 原版：先扣費才檢查上限 */
      once();
    }
  }else once();
  const big=times>2?'大量':'';
  R.act(R.C.CYN+'你的$T'+big+'提升了！'+R.C.NOR,ch,null,out,R.TO_CHAR);
  R.act(R.C.CYN+'$n的$T'+big+'提升了！'+R.C.NOR,ch,null,out,R.TO_ROOM);
};
})(ROC);
