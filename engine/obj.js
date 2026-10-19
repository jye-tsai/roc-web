/* obj.js — get/drop/give/put/wear/remove/商店/吃喝（對應 act_obj.c） */
(function(R){
const C=R.C,cmd=R.cmds,W=R.world;

function getObj(ch,o,cont){
  if(!o.wear.has('TAKE')&&!R.isImm(ch)){R.send(ch,'你無法拿起.\n');return;}
  if(R.carryN(ch)+1>R.canCarryN(ch)){R.act('$d: 你無法拿那麼多東西.',ch,null,o.name,R.TO_CHAR);return;}
  if(!cont&&R.carryW(ch)+R.objWeight(o)>R.canCarryW(ch)){R.act('$d: 你拿不動了.',ch,null,o.name,R.TO_CHAR);return;}
  if(cont){R.act('你從 $P 拿出 $p.',ch,o,cont,R.TO_CHAR);R.act('$n 從 $P 拿出 $p.',ch,o,cont,R.TO_ROOM);}
  else{R.act('你拿起 $p.',ch,o,cont,R.TO_CHAR);R.act('$n 拿起 $p.',ch,o,cont,R.TO_ROOM);}
  if(o.type==='MONEY'){
    const amt=Math.max(1,o.values[0]||1);ch.gold+=amt;R.extractObj(o);
    R.send(ch,'你拿出了 '+amt+' 枚金幣.\n');return;
  }
  R.objToChar(o,ch);
}
R.getObj=getObj;
cmd.get=function(ch,a){
  let [a1,r]=R.one_arg(a);let [a2]=R.one_arg(r);
  if(a2==='from'){[a2]=R.one_arg(R.one_arg(r)[1]);}
  if(!a1){R.send(ch,'要拿什麼?\n');return;}
  if(!a2){
    if(a1!=='all'&&!a1.startsWith('all.')){
      const o=R.getObjList(ch,a1,ch.room.contents);
      if(!o){R.act('這裡沒有 $T.',ch,null,a1,R.TO_CHAR);return;}
      getObj(ch,o,null);
    }else{
      const nm=a1.slice(4);let f=false;
      for(const o of [...ch.room.contents])if(!nm||R.is_name(nm,o.name)){f=true;getObj(ch,o,null);}
      if(!f)R.send(ch,nm?'這裡沒有 '+nm+'.\n':'這裡沒有任何物品.\n');
    }
    return;
  }
  if(a2==='all'||a2.startsWith('all.')){R.send(ch,'你不能這麼做.\n');return;}
  const c=R.getObjHere(ch,a2);
  if(!c){R.act('這裡沒有 $T.',ch,null,a2,R.TO_CHAR);return;}
  if(!/CONTAINER|CORPSE_NPC|CORPSE_PC/.test(c.type)){R.send(ch,'那不是個容器.\n');return;}
  if(c.type==='CONTAINER'&&(c.values[1]&4)){R.act('$d 是關著的.',ch,null,c.name,R.TO_CHAR);return;}
  if(a1!=='all'&&!a1.startsWith('all.')){
    const o=R.getObjList(ch,a1,c.contains);
    if(!o){R.act('$T 裡沒有這樣東西.',ch,null,a2,R.TO_CHAR);return;}
    getObj(ch,o,c);
  }else{
    const nm=a1.slice(4);let f=false;
    for(const o of [...c.contains])if(!nm||R.is_name(nm,o.name)){f=true;getObj(ch,o,c);}
    if(!f)R.act('$T 裡沒有這樣東西.',ch,null,a2,R.TO_CHAR);
  }
};
cmd.take=cmd.get;
function mkMoney(n){
  const p=W.objs[n===1?2:3];if(!p)return null;
  const o=R.createObject(p);o.values[0]=n;
  if(n>1&&/%d/.test(o.short))o.short=o.short.replace('%d',n);
  return o;
}
cmd.drop=function(ch,a){
  const [a1,r]=R.one_arg(a);
  if(!a1){R.send(ch,'幹啥?\n');return;}
  if(/^\d+$/.test(a1)){
    const n=+a1,[unit]=R.one_arg(r);
    if(!/^(coins?|gold|金幣)$/.test(unit)||n<=0){R.send(ch,'抱歉, 你不能這麼做.\n');return;}
    if(ch.gold<n){R.send(ch,'你沒有那麼多錢.\n');return;}
    ch.gold-=n;const o=mkMoney(n);if(o)R.objToRoom(o,ch.room);
    R.send(ch,'OK.\n');R.act('$n 丟下一些錢.',ch,null,null,R.TO_ROOM);return;
  }
  if(a1!=='all'&&!a1.startsWith('all.')){
    const o=R.getObjCarry(ch,a1);if(!o){R.send(ch,'你沒有那樣東西.\n');return;}
    R.objToRoom(o,ch.room);R.act('你丟下 $p.',ch,o,null,R.TO_CHAR);R.act('$n 丟下 $p.',ch,o,null,R.TO_ROOM);return;
  }
  const nm=a1.slice(4);let f=false;
  for(const o of ch.carrying.filter(o=>o.wear_loc<0))if(!nm||R.is_name(nm,o.name)){f=true;R.objToRoom(o,ch.room);R.act('你丟下 $p.',ch,o,null,R.TO_CHAR);R.act('$n 丟下 $p.',ch,o,null,R.TO_ROOM);}
  if(!f)R.send(ch,nm?'你身上沒有 '+nm+'.\n':'你身上沒半點東西.\n');
};
cmd.give=function(ch,a){
  let [a1,r]=R.one_arg(a);let [a2,r2]=R.one_arg(r);
  if(!a1||!a2){R.send(ch,'要把什麼給誰？\n');return;}
  if(/^\d+$/.test(a1)){
    const n=+a1;[a2]=R.one_arg(r2);const v=R.getCharRoom(ch,a2);
    if(!v){R.send(ch,'這裡沒有這個人。\n');return;}
    if(ch.gold<n||n<=0){R.send(ch,'你沒有那麼多錢.\n');return;}
    ch.gold-=n;v.gold+=n;R.act('你給了$N '+n+' 枚金幣.',ch,null,v,R.TO_CHAR);R.act('$n給了你 '+n+' 枚金幣.',ch,null,v,R.TO_VICT);R.act('$n給了$N一些金幣.',ch,null,v,R.TO_NOTVICT);return;
  }
  const o=R.getObjCarry(ch,a1);if(!o){R.send(ch,'你沒有那樣東西.\n');return;}
  const v=R.getCharRoom(ch,a2);if(!v){R.send(ch,'這裡沒有這個人。\n');return;}
  if(R.carryN(v)+1>R.canCarryN(v)){R.act('$N的手上已經拿滿東西了。',ch,null,v,R.TO_CHAR);return;}
  R.objToChar(o,v);
  R.act('你給了$N$p。',ch,o,v,R.TO_CHAR);R.act('$n給了你$p。',ch,o,v,R.TO_VICT);R.act('$n給了$N$p。',ch,o,v,R.TO_NOTVICT);
};
cmd.put=function(ch,a){
  let [a1,r]=R.one_arg(a);let [a2,r2]=R.one_arg(r);if(a2==='in'||a2==='into')[a2]=R.one_arg(r2);
  if(!a1||!a2){R.send(ch,'要把什麼放進哪裡？\n');return;}
  const c=R.getObjHere(ch,a2);if(!c){R.act('這裡沒有 $T.',ch,null,a2,R.TO_CHAR);return;}
  if(c.type!=='CONTAINER'){R.send(ch,'那不是個容器.\n');return;}
  if(c.values[1]&4){R.act('$d 是關著的.',ch,null,c.name,R.TO_CHAR);return;}
  const list=a1==='all'||a1.startsWith('all.')?ch.carrying.filter(o=>o.wear_loc<0&&o!==c&&(a1==='all'||R.is_name(a1.slice(4),o.name))):[R.getObjCarry(ch,a1)].filter(Boolean);
  if(!list.length){R.send(ch,'你沒有那樣東西.\n');return;}
  for(const o of list){
    if(o===c){R.send(ch,'你不能把東西放進它自己裡面.\n');continue;}
    if(R.objWeight(c)+R.objWeight(o)>(c.values[0]||100)){R.send(ch,'放不下了.\n');break;}
    R.objToObj(o,c);R.act('你把 $p 放入 $P.',ch,o,c,R.TO_CHAR);R.act('$n 把 $p 放入 $P.',ch,o,c,R.TO_ROOM);
  }
};

/* ---- 裝備 ---- */
const RIDE='WEAR_RIDE';
function wearObj(ch,o,fReplace,place){
  if(o.level>ch.level&&!R.isImm(ch)){
    R.send(ch,'你必須到等級 '+o.level+' 才能使用'+o.short+'.\n');
    R.act('$n 試著穿上 $p, 可惜看來經驗不足.',ch,o,null,R.TO_ROOM);return;
  }
  const w=o.wear,rm=loc=>R.removeObj(ch,loc,fReplace),eq=l=>R.getEq(ch,l);
  const msg=(you,them)=>{R.act(you,ch,o,null,R.TO_CHAR);R.act(them,ch,o,null,R.TO_ROOM);};
  const want=f=>w.has(f)&&(!place||place===f);
  if(o.type==='LIGHT'&&!place){if(!rm(0))return;msg('你點亮了 $p 並且用手握住它.','$n 點亮了 $p 並且用手握住它.');R.equipChar(ch,o,0);return;}
  if(want('WEAR_FINGER')){
    for(const l of [1,2])if(!eq(l)){msg('你戴上 $p.','$n 戴上 $p.');R.equipChar(ch,o,l);return;}
    if(fReplace&&rm(1)){msg('你戴上 $p.','$n 戴上 $p.');R.equipChar(ch,o,1);return;}
    R.send(ch,'你已經戴滿兩只戒指了.\n');return;
  }
  if(want('WEAR_NECK')){
    for(const l of [3,4])if(!eq(l)){msg('你 穿戴上 $p.','$n 穿戴上 $p.');R.equipChar(ch,o,l);return;}
    if(fReplace&&rm(3)){msg('你 穿戴上 $p.','$n 穿戴上 $p.');R.equipChar(ch,o,3);return;}
    R.send(ch,'你的頸子上穿戴不下更多東西了.\n');return;
  }
  const single=[['WEAR_BODY',5,'你穿上 $p.','$n 穿上 $p.'],['WEAR_HEAD',6,'你戴上 $p.','$n 戴上 $p.'],['WEAR_LEGS',7,'你穿上 $p.','$n 穿上 $p.',27,'你的腿已經穿滿腿甲了.'],
    ['WEAR_FEET',8,'你穿上 $p.','$n 穿上 $p.',28,'你的腳已經穿滿靴子了.'],['WEAR_HANDS',9,'你戴上 $p.','$n 戴上 $p.',26,'你的手已經戴滿手套了.'],
    ['WEAR_ARMS',10,'你戴上 $p.','$n 戴上 $p.',25,'你的手臂已經穿滿了.'],['WEAR_ABOUT',12,'你披上 $p.','$n 披上 $p.'],['WEAR_WAIST',13,'你繫上 $p.','$n 繫上 $p.'],
    ['WEAR_WRIST',14,'你戴上 $p.','$n 戴上 $p.',15,'你雙手手腕都戴著東西.'],['WEAR_SHIELD',11,'你拿起 $p 作為盾牌.','$n 拿起 $p 作為盾牌.']];
  for(const [f,l,y,t,l2,full] of single){
    if(!want(f))continue;
    if(f==='WEAR_SHIELD'&&eq(19)){R.send(ch,'你雙手握著雙手武器，無法再拿盾牌.\n');return;}
    if(!eq(l)){msg(y,t);R.equipChar(ch,o,l);return;}
    if(l2!==undefined&&!eq(l2)&&!(l2>=25&&l2<=28&&!ch.extraLimbs)){msg(y,t);R.equipChar(ch,o,l2);return;}
    if(fReplace&&rm(l)){msg(y,t);R.equipChar(ch,o,l);return;}
    if(full&&!fReplace)R.send(ch,full+'\n');
    return;
  }
  if(want('WIELD')){
    if(eq(19)&&!rm(19))return;
    if(!eq(16)){msg('你裝備 $p 作武器.','$n 裝備 $p 作武器.');R.equipChar(ch,o,16);return;}
    if(fReplace&&rm(16)){msg('你裝備 $p 作武器.','$n 裝備 $p 作武器.');R.equipChar(ch,o,16);return;}
    R.send(ch,'你雙手都握著武器了.\n');return;
  }
  if(want('HOLD')){
    if(eq(19)&&!rm(19))return;
    if(!rm(17))return;msg('你握住 $p.','$n 握住 $p.');R.equipChar(ch,o,17);return;
  }
  if(want('TWO_HAND')){
    if(!rm(16)||!rm(11)||!rm(17)||!rm(18)||!rm(19))return;
    msg('你用雙手握住 $p.','$n 用雙手握住 $p.');R.equipChar(ch,o,19);return;
  }
  if(want('ARROW')){if(!rm(20))return;msg('你把 $p 斜掛在背上.','$n 把 $p 斜掛在背上.');R.equipChar(ch,o,20);return;}
  if(fReplace)R.send(ch,'你無法穿戴、裝備或握著這樣東西.\n');
}
R.removeObj=function(ch,loc,fReplace){
  const o=R.getEq(ch,loc);if(!o)return true;
  if(!fReplace)return false;
  if(o.extra.has('NOREMOVE')&&!R.isImm(ch)){R.act('你無法脫下 $p.',ch,o,null,R.TO_CHAR);return false;}
  R.unequipChar(ch,o);
  R.act('$n 脫下 $p.',ch,o,null,R.TO_ROOM);R.act('你脫下 $p.',ch,o,null,R.TO_CHAR);
  return true;
};
const WEAR_TABLE=[['about','WEAR_ABOUT'],['arm','WEAR_ARMS'],['arrow','ARROW'],['body','WEAR_BODY'],['feet','WEAR_FEET'],['finger','WEAR_FINGER'],
  ['hand','WEAR_HANDS'],['head','WEAR_HEAD'],['hold','HOLD'],['leg','WEAR_LEGS'],['neck','WEAR_NECK'],['shield','WEAR_SHIELD'],
  ['twohand','TWO_HAND'],['waist','WEAR_WAIST'],['weapon','WIELD'],['wrist','WEAR_WRIST']];
cmd.wear=function(ch,a){
  const [a1,r]=R.one_arg(a);const [pl]=R.one_arg(r);
  let place=null;if(pl){const t=WEAR_TABLE.find(([n])=>R.str_prefix(pl,n));if(t)place=t[1];}
  if(!a1){R.send(ch,'要裝備什麼？\n');return;}
  const ww=R.CONST.races[ch.race].abil&4096;
  if(a1==='all'){for(const o of ch.carrying.filter(o=>o.wear_loc<0)){if(o.wear.has('WIELD')&&!ww)continue;wearObj(ch,o,false,null);}return;}
  const o=R.getObjCarry(ch,a1);if(!o){R.send(ch,'你身上沒有這樣東西.\n');return;}
  if(o.wear.has('WIELD')&&!ww){R.send(ch,'你無法裝備武器.\n');return;}
  wearObj(ch,o,true,place);
};
cmd.wield=(ch,a)=>{const [a1]=R.one_arg(a);cmd.wear(ch,a1?a1+' weapon':'');};
cmd.hold=(ch,a)=>{const [a1]=R.one_arg(a);cmd.wear(ch,a1?a1+' hold':'');};
cmd.remove=function(ch,a){
  const [a1]=R.one_arg(a);
  if(!a1){R.send(ch,'要脫下什麼？\n');return;}
  if(a1==='all'){for(const o of ch.carrying.filter(o=>o.wear_loc>=0&&o.wear_loc!==24))R.removeObj(ch,o.wear_loc,true);return;}
  const o=R.getObjWear(ch,a1);if(!o){R.send(ch,'你身上沒有這樣東西.\n');return;}
  R.removeObj(ch,o.wear_loc,true);
};
cmd.sacrifice=function(ch,a){
  const [a1]=R.one_arg(a);
  if(!a1||a1===R.lc(ch.name)){R.act('$n 向眾神獻上自己, 但祂們婉拒了.',ch,null,null,R.TO_ROOM);R.send(ch,'眾神感謝你的好意, 但祂們婉拒了.\n');return;}
  const o=R.getObjList(ch,a1,ch.room.contents);if(!o){R.send(ch,'這裡沒有那樣東西.\n');return;}
  if(!o.wear.has('TAKE')||o.type==='CORPSE_PC'){R.act('$p 不是適當的祭品.',ch,o,null,R.TO_CHAR);return;}
  R.send(ch,'眾神賜給你一枚金幣作為你的奉獻.\n');ch.gold++;
  R.act('$n 將 $p 獻給眾神.',ch,o,null,R.TO_ROOM);R.extractObj(o);
};

/* ---- 吃喝 ---- */
cmd.eat=function(ch,a){
  const [a1]=R.one_arg(a);if(!a1){R.send(ch,'要吃什麼？\n');return;}
  const o=R.getObjCarry(ch,a1);if(!o){R.send(ch,'你沒有那樣東西.\n');return;}
  if(!/FOOD|PILL/.test(o.type)&&!R.isImm(ch)){R.send(ch,'那不能吃.\n');return;}
  R.act('你吃下 $p.',ch,o,null,R.TO_CHAR);R.act('$n 吃下 $p.',ch,o,null,R.TO_ROOM);
  ch.pc.cond[1]=Math.min(100,ch.pc.cond[1]+(o.values[0]||5)*2);
  R.extractObj(o);
};
cmd.drink=function(ch,a){
  const [a1]=R.one_arg(a);
  let o=a1?R.getObjHere(ch,a1):ch.room.contents.find(x=>x.type==='FOUNTAIN');
  if(!o){R.send(ch,a1?'你找不到它.\n':'要喝什麼？\n');return;}
  if(o.type!=='FOUNTAIN'&&o.type!=='DRINK_CON'){R.send(ch,'你不能從那裡喝水.\n');return;}
  if(o.type==='DRINK_CON'){if(o.values[1]<=0){R.send(ch,'它已經空了.\n');return;}o.values[1]--;}
  R.act('你從 $p 喝了一些東西.',ch,o,null,R.TO_CHAR);R.act('$n 從 $p 喝了一些東西.',ch,o,null,R.TO_ROOM);
  ch.pc.cond[2]=Math.min(100,ch.pc.cond[2]+10);
};

/* ---- 商店 ---- */
function keeper(ch){
  const k=ch.room.people.find(v=>v.npc&&v.shop);
  if(!k){R.send(ch,'這裡買不到東西.\n');return null;}
  const h=R.time.hour;
  if(h<k.shop.open_hour){R.act('$n 說「抱歉, 還沒開店喔.」',k,null,ch,R.TO_VICT);return null;}
  if(h>k.shop.close_hour){R.act('$n 說「抱歉, 打烊了, 明天請早.」',k,null,ch,R.TO_VICT);return null;}
  return k;
}
function cost(k,o,fBuy){
  if(!o||o.cost<=0)return 0;
  if(fBuy)return Math.floor(o.cost*k.shop.profit_buy/100);
  if(!k.shop.buy_types.includes(o.type))return 0;
  return Math.floor(o.cost*k.shop.profit_sell/100);
}
const forSale=k=>k.carrying.filter(o=>o.wear_loc<0);
cmd.list=function(ch,a){
  const k=keeper(ch);if(!k)return;
  const [arg]=R.one_arg(a);let s='',i=0;
  for(const o of forSale(k)){
    i++;const c=cost(k,o,true);
    if(!arg||arg==='all'||R.is_name(arg,o.name)){if(!s)s='[編號   Lv  價 錢 ] 物 品 名 稱\n';s+='['+String(i).padStart(4)+'   '+String(o.level).padStart(2)+' '+String(c).padStart(7)+'] '+R.cap(o.short)+'.\n';}
  }
  R.send(ch,s||(arg?'他不賣那樣東西.\n':'抱歉，本店目前缺貨.\n'));
};
cmd.buy=function(ch,a){
  let [a1,r]=R.one_arg(a);if(!a1){R.send(ch,'要買什麼？\n');return;}
  const k=keeper(ch);if(!k)return;
  let n=1;if(/^\d+$/.test(a1)&&r){n=+a1;[a1]=R.one_arg(r);}
  const items=forSale(k);
  const o=/^\d+$/.test(a1)?items[+a1-1]:R.getObjList(k,a1,items);
  if(!o){R.act('$n'+C.HIG+'告訴你「我沒有賣那樣東西。」'+C.NOR,k,null,ch,R.TO_VICT);return;}
  const c=cost(k,o,true);
  if(n<1||n>50){R.send(ch,'要買多少？\n');return;}
  if(ch.gold<c*n){R.act('$n'+C.HIG+'告訴你「你身上沒有足夠的錢。」'+C.NOR,k,o,ch,R.TO_VICT);return;}
  if(o.level>ch.level){R.act('$n'+C.HIG+'告訴你「你還不能使用 $p。」'+C.NOR,k,o,ch,R.TO_VICT);return;}
  if(R.carryN(ch)+n>R.canCarryN(ch)){R.send(ch,'你無法再拿動更多東西了.\n');return;}
  if(!o.shopInv&&n>1){R.act('$n'+C.HIG+'告訴你「抱歉, $p 只剩下一個了。」'+C.NOR,k,o,ch,R.TO_VICT);return;}
  ch.gold-=c*n;k.gold+=c*n;
  for(let i=0;i<n;i++){const b=o.shopInv?R.createObject(o.proto,o.level):o;R.objToChar(b,ch);}
  if(n===1){R.act('你買下 $p.',ch,o,null,R.TO_CHAR);R.act('$n 買下 $p.',ch,o,null,R.TO_ROOM);}
  else{R.act('你買下 '+n+' * $p.',ch,o,null,R.TO_CHAR);R.act('$n 買下 '+n+' * $p.',ch,o,null,R.TO_ROOM);}
};
cmd.sell=function(ch,a){
  const [a1]=R.one_arg(a);if(!a1){R.send(ch,'要賣什麼?\n');return;}
  const k=keeper(ch);if(!k)return;
  const o=R.getObjCarry(ch,a1);if(!o){R.act("$n 告訴你, '你沒有那樣東西'.",k,null,ch,R.TO_VICT);return;}
  const c=cost(k,o,false);
  if(c<=0){R.act('$n 搖搖頭，看來對 $p 一點興趣也沒有.',k,o,ch,R.TO_VICT);return;}
  R.act('$n 賣掉 $p.',ch,o,null,R.TO_ROOM);
  R.act('你以 '+c+' 枚金幣的價錢賣掉了 $p.',ch,o,null,R.TO_CHAR);
  ch.gold+=c;R.objToChar(o,k);
};
cmd.value=function(ch,a){
  const [a1]=R.one_arg(a);if(!a1){R.send(ch,'要為什麼估價?\n');return;}
  const k=keeper(ch);if(!k)return;
  const o=R.getObjCarry(ch,a1);if(!o){R.act("$n 告訴你, '你沒有那樣東西'.",k,null,ch,R.TO_VICT);return;}
  const c=cost(k,o,false);
  if(c<=0){R.act('$n 搖搖頭，看來對 $p 一點興趣也沒有.',k,o,ch,R.TO_VICT);return;}
  R.act("$n 告訴你, '我願意出 "+c+" 枚金幣的價錢買下 $p'.",k,o,ch,R.TO_VICT);
};
})(ROC);
