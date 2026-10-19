/* sim.js — 單機模擬：假線上玩家（who 名單、頻道閒聊、tell 回覆）。按「模擬」鈕開關 */
(function(R){
const C=R.C,W=R.world;
const NAMES=['Arthas','Bluefox','Cindy','Dragonfly','Echo','Faust','Gandalf','Hikari','Ivy','Jaguar','Kuro','Luna','Merlin','Nami','Orion','Pikachu','Quinn','Raiden','Sakura','Tiger','Ursa','Vega','Wolfy','Xena','Yuki','Zero'];
const CN=['阿飛','小藍','辛蒂','蜻蜓','回音','浮士德','甘道夫','光','常春藤','美洲豹','小黑','月兒','梅林','娜美','獵戶','皮卡','奎茵','雷電','櫻','老虎','小熊','織女','狼仔','西娜','雪','零'];
const CHAT={
  chat:['有人要組隊去打骷髏嗎？','新手村的老師好兇 XD','今天幻世好熱鬧','誰有多的麵包可以分我一點','剛剛被怪打趴了...屍體還在那','學院的訓練場怎麼走？','掛網中，有事 tell','哈哈哈哈','練功好累喔','有人知道神殿在哪嗎','晚安各位～','我升級了！！','這把劍好帥，哪裡打的？','有沒有牧師可以幫忙補血'],
  question:['請問要怎麼存檔？','新手要先練什麼？','怎麼看自己的裝備？','錢不夠買東西怎麼辦','recall 是什麼？','要怎麼換職業？'],
  answer:['打 save 就可以存檔囉','先在學院附近打小怪就好','eq 看裝備、i 看背包','把用不到的東西拿去 sell','recall 可以回城，戰鬥中用會扣經驗','到二十級以後去公會找師父'],
  music:['♪ 混沌之中我獨自前行 ♪','♪ 月光照在幻世的城牆上 ♪','點一首給今天被我殺掉的哥布林 ♪','♪ 冒險者之歌 ♪'],
  rumor:['聽說北方的山裡有龍出沒...','有人在墓園看到會走路的骷髏','聽說某個商人在偷偷賣神器','據說神殿底下有密道'],
  auction:['拍賣 長劍 一把，起標 100 金','收購 治療藥水，價錢好談','拍賣 皮甲，有興趣 tell 我'],
};
const REPLY=['嗯？找我嗎','我在練功，等一下喔','哈囉～','好啊','你也是新手嗎？','我現在在學院附近','掛網中 zzZ','加油！','我也不知道耶 XD'];
const sims=[];
function init(){
  if(sims.length)return;
  const races=R.CONST.races.filter(r=>r.abil!==undefined).slice(0,15),cls=R.CONST.classes;
  const n=R.rand(6,12),pool=NAMES.map((n,i)=>i).sort(()=>Math.random()-.5).slice(0,n);
  for(const i of pool){
    const lv=Math.random()<.2?R.rand(36,42):R.rand(1,35);
    const c=cls[R.rand(0,4)];
    sims.push({sim:true,name:NAMES[i],cname:CN[i],level:lv,race:R.rand(0,races.length-1),cls:cls.indexOf(c),
      title:'- '+(((ROC.CORE.titles||{})[c.cname]||[])[Math.min(lv,41)]||'冒險者'),idle:R.rand(0,20)});
  }
}
R.Sim={
  who(){init();return sims;},
  tick(){
    if(!R.simOn)return;init();
    for(const s of sims){s.idle=Math.max(0,s.idle+R.rand(-3,3));if(s.level<35&&R.pct()<5)s.level++;}
    if(R.pct()<10&&sims.length<16){const i=R.rand(0,NAMES.length-1);if(!sims.some(s=>s.name===NAMES[i])){const lv=R.rand(1,30);sims.push({sim:true,name:NAMES[i],cname:CN[i],level:lv,race:0,cls:R.rand(0,4),title:'- 冒險者',idle:0});R.chatAll(C.HIY+'【系統】'+NAMES[i]+' 進入了混沌幻世。');}}
    else if(R.pct()<8&&sims.length>4){const s=sims.splice(R.rand(0,sims.length-1),1)[0];R.chatAll(C.HIY+'【系統】'+s.name+' 離開了混沌幻世。');}
  },
  pulse(){
    if(!R.simOn||!W.players.some(p=>p.playing))return;
    if(Math.random()>1/160)return;   /* 平均約 40 秒一句 */
    init();
    const s=R.pick(sims);if(!s)return;
    const ch=R.pick(['chat','chat','chat','question','answer','music','rumor','auction']);
    const [verb,col]=R.CHANNELS[ch];const msg=R.pick(CHAT[ch]);
    for(const p of W.players){
      if(!p.playing||p.act.has('NO_'+ch.toUpperCase())||!R.isAwake(p))continue;
      if(ch==='rumor')R.send(p,col+verb+'有人說：「'+msg+col+'」'+C.NOR+'\n');
      else R.send(p,col+verb+s.cname+'('+s.name+')'+col+'：「'+msg+col+'」'+C.NOR+'\n');
    }
  },
  onChannel(ch,name,a){
    if(!R.simOn||!/^(chat|question)$/.test(name)||R.pct()>60)return;
    init();
    setTimeout(()=>{
      const s=R.pick(sims);if(!s)return;
      const k=name==='question'?'answer':'chat',[verb,col]=R.CHANNELS[k];
      const msg=name==='question'?R.pick(CHAT.answer):R.pick(['+1','哈哈','真的假的','同意','我也是！','嗨 '+ch.name+'～','歡迎歡迎']);
      for(const p of W.players)if(p.playing&&R.isAwake(p)){R.send(p,col+verb+s.cname+'('+s.name+')'+col+'：「'+msg+col+'」'+C.NOR+'\n');}
      R.flushAll();
    },R.rand(2000,6000));
  },
  tell(ch,n,msg){
    if(!R.simOn)return false;init();
    const s=sims.find(x=>R.str_prefix(n,R.lc(x.name)));if(!s)return false;
    R.send(ch,C.HIY+'你告訴 '+s.cname+'('+s.name+')「'+msg+'」'+C.NOR+'\n');
    ch.reply={sim:true,name:s.name};
    setTimeout(()=>{R.send(ch,s.cname+'('+s.name+')'+C.HIY+'告訴你「'+R.pick(REPLY)+'」'+C.NOR+'\n');R.flushAll();},R.rand(1500,5000));
    return true;
  },
};
})(ROC);
