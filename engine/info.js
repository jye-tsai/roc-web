/* info.js — look / exits / score / who / help / time / weather / inventory / equipment（對應 act_info.c） */
(function(R){
const C=R.C,W=R.world,P=R.POS,cmd=R.cmds={};
R.cmds=cmd;

function fmtObj(o,ch,fShort){
  let s='';
  if(o.proto.souvenir)s+='('+C.HIW+'紀念'+C.NOR+')';
  if(o.extra.has('INVIS'))s+='('+C.YEL+'隱形'+C.NOR+')';
  if(o.extra.has('GLOW'))s+='('+C.HIY+'發光'+C.NOR+')';
  if(o.extra.has('HUM'))s+='('+C.HIP+'低鳴'+C.NOR+')';
  s+=fShort?o.short:(o.long||'').replace(/\n+$/,'');
  return s;
}
R.fmtObj=fmtObj;
function showList(list,ch,fShort,fShowNothing){
  const out=[],cnt=[];
  for(const o of list){
    if(o.wear_loc>=0)continue;
    const d=fmtObj(o,ch,fShort);if(!d)continue;
    const i=out.indexOf(d);if(i>=0){cnt[i]++;continue;}
    out.push(d);cnt.push(1);
  }
  let s='';
  out.forEach((d,i)=>{s+=(cnt[i]>1?'('+String(cnt[i]).padStart(2)+')':'    ')+d+'\n';});
  if(fShowNothing&&!out.length)s+='    什麼都沒有。\n';
  return s;
}
R.showList=showList;
const POS_TXT=['死了！！','受了致命傷。','失去行動能力了。','昏倒在地。','在這裡睡覺。','動彈不得。','在這裡休息。',null,'站在這兒。'];
function charTags(v,ch){
  const a=v.aff;let s='';
  if(a.has('INVISIBLE'))s+='('+C.YEL+'隱形'+C.NOR+')';
  if(a.has('HIDE'))s+='('+C.HIB+'藏匿'+C.NOR+')';
  if(a.has('CHARM'))s+='('+C.HIP+(v.act.has('PET')?'寵物':'迷失')+C.NOR+')';
  if(a.has('PASS_DOOR'))s+='('+C.CYN+'半透明'+C.NOR+')';
  if(a.has('FAERIE_FIRE'))s+='('+C.HIP+'紫霧'+C.NOR+')';
  if(a.has('TARDY'))s+='('+C.HIY+'黃霧'+C.NOR+')';
  if(R.isEvil&&R.isEvil(v)&&ch.aff.has('DETECT_EVIL'))s+='('+C.HIR+'邪氣'+C.NOR+')';
  if(a.has('SANCTUARY'))s+='('+C.HIW+'聖光'+C.NOR+')';
  return s;
}
R.charTags=charTags;
function showChar0(v,ch){
  let s=charTags(v,ch);
  if(v.npc&&v.position===P.STANDING&&v.long&&!v.fighting)return s+v.long.replace(/\n+$/,'')+'\n';
  s+=R.PERS(v,ch);
  if(!v.npc&&v.pc.title)s+=' '+v.pc.title+' ';
  if(v.position===P.FIGHTING||v.fighting){
    s+='正在這裡和';
    s+=!v.fighting?'空氣':v.fighting===ch?'你':v.fighting.room===v.room?R.PERS(v.fighting,ch):'某個已經離開的人';
    s+='打架。';
  }else s+=POS_TXT[v.position]||'站在這兒。';
  return s+'\n';
}
R.healthLine=(v,ch)=>{
  const p=v.max_hit>0?Math.floor(v.hit*100/v.max_hit):-1;
  const t=p>=100?[C.HIG,'健康狀況良好。']:p>=90?[C.HIG,'受了輕微的擦傷。']:p>=80?[C.HIG,'身上有一點小瘀血。']:
    p>=70?[C.HIY,'身上有一些傷痕。']:p>=60?[C.HIY,'受了小傷。']:p>=50?[C.HIY,'看來狀況並不太好。']:
    p>=40?[C.HIR,'傷痕累累。']:p>=30?[C.HIR,'渾身是血。']:p>=20?[C.HIR,'受了十分嚴重的傷，隨時都可能暈倒。']:
    p>=10?[C.RED,'已經可以看到死神對他微笑。']:[C.RED,'已是進氣少，出氣多，眼看就要死去。'];
  return R.cap(R.PERS(v,ch))+t[0]+t[1]+C.NOR;
};
function showChar1(v,ch){
  if(v!==ch){R.act(C.CYN+'$n仔細打量著你。'+C.NOR,ch,null,v,R.TO_VICT);R.act('$n仔細打量著$N。',ch,null,v,R.TO_NOTVICT);}
  const r=R.CONST.races[v.race]||{cname:'?',name:'?'};
  let s=R.PERS(v,ch)+' - '+r.cname+'('+r.name+'):\n';
  /* 玩家的 desc 是連線物件，不是描述文字 */
  const ds=v.npc?v.desc:v.pc&&v.pc.description;
  s+=typeof ds==='string'&&ds?ds.replace(/\n+$/,'')+'\n':['它','他','她'][v.sex]+'看起來沒有什麼特色。\n';
  s+=R.healthLine(v,ch)+'\n';
  const eq=R.EQ_ORDER.map(l=>R.getEq(v,l)).filter(Boolean);
  if(eq.length){s+='\n'+['它','他','她'][v.sex]+'身上穿著：\n';for(const o of eq)s+=R.WHERE_NAME[o.wear_loc]+fmtObj(o,ch,true)+'\n';}
  R.send(ch,s);
}
function exitsLine(ch,auto){
  const r=ch.room;let s='',found=false;
  if(auto){
    s='['+C.HIW+'出口'+C.NOR+':';
    r.exits.forEach((e,d)=>{if(e&&R.getRoom(e.to)&&!e.closed){found=true;s+=' '+C.HIC+R.DIRS[d]+C.NOR;}});
    return s+(found?'':' '+C.HIC+'無'+C.NOR)+']\n';
  }
  s=C.HIW+'明顯的出口'+C.NOR+':\n';
  r.exits.forEach((e,d)=>{const t=e&&R.getRoom(e.to);if(t&&!e.closed){found=true;
    s+=R.pad(R.cap(R.DIRS[d]),5)+' － '+(R.roomDark(t)?'這邊太暗了':t.name)+'\n';}});
  return s+(found?'':C.HIC+'無'+C.NOR+'。\n');
}
R.lookRoom=function(ch,arg){
  const r=ch.room;let s='';
  if(R.isImm(ch))s+='['+C.HIY+r.vnum+C.NOR+'] ';
  s+=r.name+' - ';
  if(ch.act.has('AUTOEXIT'))s+=exitsLine(ch,true);else s+='\n';
  if(!arg||!ch.act.has('BRIEF'))s+='    '+r.desc.replace(/\n+$/,'')+'\n';
  const people=r.people.filter(v=>v!==ch&&R.canSee(ch,v));
  if(people.length){s+='\n';for(const v of people)s+=showChar0(v,ch);}
  if(r.contents.length){s+='\n'+showList(r.contents,ch,false,false);}
  R.send(ch,s);
};
cmd.look=function(ch,a){
  if(ch.position<P.SLEEPING){R.send(ch,C.YEL+'你只能看到星星而已！多美麗啊！'+C.NOR+'\n');return;}
  if(ch.position===P.SLEEPING){R.send(ch,C.YEL+'你只能看到夢境而已！Zzz...'+C.NOR+'\n');return;}
  let [a1,rest]=R.one_arg(a);const [a2]=R.one_arg(rest);
  if(!R.isImm(ch)&&R.roomDark(ch.room)&&a1!=='in'){R.send(ch,'一片漆黑....\n');for(const v of ch.room.people)if(v!==ch)R.send(ch,showChar0(v,ch));return;}
  if(!a1||a1==='auto'){R.lookRoom(ch,a1);return;}
  if(a1==='in'){
    if(!a2){R.send(ch,C.YEL+'要往什麼裡面看？'+C.NOR+'\n');return;}
    const o=R.getObjHere(ch,a2);
    if(!o){R.send(ch,C.YEL+'你在這裡沒看到那玩意兒。'+C.NOR+'\n');return;}
    if(o.type==='DRINK_CON'){
      if(o.values[1]<=0){R.send(ch,C.CYN+'那是空的。'+C.NOR+'\n');return;}
      R.send(ch,'那裡面有'+(o.values[1]<o.values[0]/4?'不到一半的':o.values[1]<3*o.values[0]/4?'大約一半的':'超過一半的')+'液體。\n');return;
    }
    if(!/CONTAINER|CORPSE_NPC|CORPSE_PC/.test(o.type)){R.send(ch,C.YEL+'那不是個容器。'+C.NOR+'\n');return;}
    if(o.type==='CONTAINER'&&(o.values[1]&4)){R.send(ch,C.YEL+'它是關著的。'+C.NOR+'\n');return;}
    R.act('$p裡面有：',ch,o,null,R.TO_CHAR);R.send(ch,showList(o.contains,ch,true,true));return;
  }
  const v=R.getCharRoom(ch,a1);if(v){showChar1(v,ch);return;}
  const [n,nm]=R.num_arg(a1);let c=0;
  for(const o of [...ch.carrying,...ch.room.contents]){
    for(const e of o.extra_descr)if(R.is_name(nm,e.keywords)&&++c===n){R.send(ch,e.description);return;}
    if(R.is_name(nm,o.name)&&++c===n){
      let s=o.short+(o.material?' - '+o.material:'')+'\n';
      const ed=o.extra_descr.find(e=>R.is_name(o.name.split(' ')[0],e.keywords));
      s+=ed?ed.description:(o.long||'')+'\n';
      R.send(ch,s);return;
    }
  }
  for(const e of ch.room.extra)if(R.is_name(nm,e.keywords)){R.send(ch,e.description);return;}
  const d=R.dirIndex(a1);
  if(d<0){R.send(ch,C.YEL+'你在這裡沒看到那玩意兒。'+C.NOR+'\n');return;}
  const e=ch.room.exits[d];
  if(!e){R.send(ch,C.YEL+'那裡沒什麼特別的東西。'+C.NOR+'\n');return;}
  R.send(ch,e.desc||'你沒看到什麼特別的。\n');
  if(e.isdoor&&e.kw){const k=e.kw.split(' ')[0];R.send(ch,C.CYN+R.cap(k)+(e.closed?'關了。':'是開著的。')+C.NOR+'\n');}
};
cmd.examine=(ch,a)=>{if(!a){R.send(ch,'要檢查什麼？\n');return;}cmd.look(ch,a);const o=R.getObjHere(ch,a);if(o&&/CONTAINER|CORPSE/.test(o.type))cmd.look(ch,'in '+a);};
cmd.exits=(ch,a)=>R.send(ch,exitsLine(ch,a==='auto'));
R.dirIndex=a=>{const m={n:0,north:0,e:1,east:1,s:2,south:2,w:3,west:3,u:4,up:4,d:5,down:5};return a in m?m[a]:-1;};

cmd.inventory=ch=>R.send(ch,'你身上帶著有：\n\n'+showList(ch.carrying,ch,true,true));
cmd.equipment=ch=>{
  let s='你身上裝備著：\n',f=false;
  for(const l of R.EQ_ORDER){const o=R.getEq(ch,l);if(!o)continue;f=true;s+=R.WHERE_NAME[l]+fmtObj(o,ch,true)+'\n';}
  if(!f)s+='    什麼都沒有。\n';
  R.send(ch,s);
};

const gift=(c,m)=>c>=m?C.HIW:c>=m-3?C.HIC:C.NOR;
const sc=(a,b)=>a>=b?C.HIW:a>=b*3/4?C.HIG:a>=b/2?C.HIY:C.HIR;
cmd.score=function(ch){
  const r=R.CONST.races[ch.race],k=R.CONST.classes[ch.cls];
  let s='\n'+C.HIW+'▁▁▂▂▃▃▄▄▅▅▆▆▇▇█ '+C.HIC+'傳 '+C.HIP+'說 '+C.HIR+'中 '+C.HIY+'的 '+C.HIU+'一 '+C.HIG+'頁'+C.HIW+' █▇▇▆▆▅▅▄▄▃▃▂▂▁▁'+C.NOR+'\n';
  s+=C.HIW+C.HIY+ch.name+C.NOR+', '+C.NOR+''+C.NOR+' '+ch.pc.title+'\n\n';
  const age=17+Math.floor((ch.played+(Date.now()-ch.logon)/1000)/72000);
  s+='你是一個 '+C.HIC+age+C.NOR+' 歲的 '+C.HIY+ch.level+C.NOR+' 級'+C.CYN+(ch.sex===1?'男':ch.sex===2?'女':'中')+C.NOR+'性'+C.HIW+r.cname+k.cname+C.NOR+
    '('+r.name+' '+k.name+') - (上線'+C.HIC+' '+Math.floor((ch.played+(Date.now()-ch.logon)/1000)/3600)+' '+C.NOR+'小時)\n';
  s+='你現在沒有加入幫派。'+C.HIW+'你是個無名小卒。'+C.NOR+'\n';
  s+='你的功勳：'+C.HIG+'0'+C.NOR+'  '+C.HIC+'你還沒建立任何戰功。'+C.NOR+'\n';
  const N=['力量','智力','智慧','敏捷','體質'];
  s+=N.map((n,i)=>n+': '+gift(R.stat(ch,i),25)+R.stat(ch,i)+C.HIW+'/25'+C.NOR).join('  ')+'  體型: '+C.HIY+(r.size||3)+C.NOR+'\n';
  s+='生命力: '+sc(ch.hit,ch.max_hit)+ch.hit+C.NOR+'/'+C.HIG+ch.max_hit+C.NOR+'    魔法力: '+sc(ch.mana,ch.max_mana)+ch.mana+C.NOR+'/'+C.HIG+ch.max_mana+C.NOR+
    '    移動力: '+sc(ch.move,ch.max_move)+ch.move+C.NOR+'/'+C.HIG+ch.max_move+C.NOR+'\n';
  s+='經驗值：'+(ch.exp>=R.expNext(ch)?C.CYN:C.HIC)+ch.exp+C.NOR+'/'+C.HIG+(ch.level>=R.LEVEL_IMMORTAL-1?'MAX':R.expNext(ch))+C.NOR+'   練習點數: '+C.HIG+ch.practice+C.NOR+'\n';
  if(ch.level>=10)s+='陣營：'+ch.alignment+C.NOR+'  ';
  const al=ch.alignment;
  s+=(al>799?C.HIC+'你有如天使般善良。':al>599?C.HIW+'你的品德有如聖人般公正。':al>315?C.HIG+'你奉公守法，行事正義。':al>149?'你對人還算仁慈。':
      al>-150?'你謹守中立本分。':al>-300?'你有一點卑鄙。':al>-600?C.HIP+'你目無法紀，行為邪惡。':al>-800?C.HIR+'你是個十惡不赦的惡魔。':C.RED+'你為眾人所詛咒，簡直就是撒旦的走狗。')+C.NOR+'\n\n';
  const ps={0:'你'+C.RED+'死'+C.NOR+'了！！',1:'你'+C.HIR+'受了致命'+C.NOR+'傷。',2:'你'+C.HIB+'失去行動能力'+C.NOR+'了。',3:'你'+C.HIB+'不省人事'+C.NOR+'了。',
    4:'你在睡覺。',5:'你動彈不得。',6:'你在休息。',7:'你正在戰鬥。',8:'你正站著。'};
  s+=ps[ch.position]+'\n';
  s+='物品: '+R.carryN(ch)+'/'+R.canCarryN(ch)+'   負重: '+R.carryW(ch)+'/'+R.canCarryW(ch)+' 公斤  金錢: '+C.HIY+ch.gold+C.NOR+' 元  存款: '+ch.bank+' 元\n';
  s+='Autoexit: '+(ch.act.has('AUTOEXIT')?'是':'否')+'   Autoloot: '+(ch.act.has('AUTOLOOT')?'是':'否')+'   Autogold: '+(ch.act.has('AUTOGOLD')?'是':'否')+'\n';
  s+='命中率：'+C.HIC+(ch.hitroll||0)+C.NOR+' 點   傷害力：'+C.HIC+(ch.damroll||0)+C.NOR+' 點   護甲防衛力：'+C.HIC+ch.armor+C.NOR+' 點\n';
  R.send(ch,s);
};

cmd.who=function(ch){
  const list=[...W.players.filter(p=>p.playing),...(R.simOn&&R.Sim?R.Sim.who():[])];
  let s=C.HIW+'【混沌幻世】目前在線上的玩家：'+C.NOR+'\n'+C.HIB+'─'.repeat(38)+C.NOR+'\n';
  for(const p of list){
    const k=R.CONST.classes[p.cls]||{cwho:'??'};
    s+='['+R.padL(p.level,2)+' '+R.pad(k.cwho||k.cname,6)+'] '+p.name+(p.pc&&p.pc.title?' '+p.pc.title:p.title?' '+p.title:'')+'\n';
  }
  s+=C.HIB+'─'.repeat(38)+C.NOR+'\n共有 '+C.HIY+list.length+C.NOR+' 位玩家在線上。\n';
  R.send(ch,s);
};

cmd.help=function(ch,a){
  a=(a||'').replace(/^['"]+|['"]+$/g,'')||'summary';
  const ok=R.CORE.helps.filter(h=>h.level<=ch.level),A=a.toUpperCase();
  let hits=ok.filter(h=>h.keywords.toUpperCase().split(/\s+/).includes(A)||h.keywords.toUpperCase()===A);
  if(!hits.length)hits=ok.filter(h=>R.is_name(a,h.keywords)).slice(0,1);
  if(!hits.length){R.send(ch,C.YEL+'沒有關於這個字的說明喔！'+C.NOR+'\n');return;}
  R.send(ch,hits.map(h=>(h.level>=0&&a!=='imotd'?h.keywords+'\n':'')+String(h.text).replace(/^\./,'')).join('\n'+'-'.repeat(76)+'\n\n'));
};

const DAY=['月','風','蒼','雷','自由','聖神','星'];
const MON=['冬','冬狼','霜之巨人','遠古','大戰','春','自然','荒廢','龍','太陽','暑氣','巫術','暗影','幽冥','長夜','黑暗','大惡魔'];
cmd.time=function(ch){
  const t=R.time,d=t.day+1,suf=d>4&&d<20?'th':d%10===1?'st':d%10===2?'nd':d%10===3?'rd':'th';
  R.send(ch,C.CYN+'現在是'+t.hour+'時，'+DAY[d%7]+'之日，'+d+suf+'，'+MON[t.month]+'之月。'+C.NOR+'\n'+
    '混沌幻世啟動於 '+R.bootTime.toLocaleString()+'\n系統時間是     '+new Date().toLocaleString()+'\n');
};
cmd.weather=function(ch){
  if(ch.room.flags.has('INDOORS')||ch.room.sector===0){R.send(ch,C.YEL+'在這裡你觀察不出天空的變化.'+C.NOR+'\n');return;}
  const sky=['萬里無雲','多雲','降著小雨','打著閃電下著暴雨','飄著小雪','刮起陣陣暴風雪'][R.weather.sky];
  const m=R.time.month,wind=m<=4?'有北方凜冽的寒風吹過':m<=8?'有東方溫暖的和風吹過':m<=12?'有南方潮濕的熱風吹過':'有西方清爽的涼風吹過';
  R.send(ch,'天空'+sky+', 而且'+wind+'.\n');
};
})(ROC);
