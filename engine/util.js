/* util.js — 共用工具、ANSI 色碼、常數（對應 ansi.h / merc.h） */
(function(R){
const E='\x1b[';
R.C={NOR:E+'0m',BLK:E+'30m',RED:E+'31m',GRN:E+'32m',YEL:E+'33m',BLU:E+'34m',PUR:E+'35m',CYN:E+'36m',WHT:E+'37m',
  HIB:E+'1;30m',HIR:E+'1;31m',HIG:E+'1;32m',HIY:E+'1;33m',HIU:E+'1;34m',HIP:E+'1;35m',HIC:E+'1;36m',HIW:E+'1;37m'};

R.ROOM_SCHOOL=3700; R.ROOM_TEMPLE=3001; R.ROOM_LIMBO=2;
R.OBJ={MACE:3700,DAGGER:3701,SWORD:3702,VEST:3703,SHIELD:3704,BANNER:3716,CLUB:3717,BOOK:3733};
R.MAX_LEVEL=47; R.L_APP=43; R.LEVEL_IMMORTAL=43; R.LEVEL_HERO=36;
R.POS={DEAD:0,MORTAL:1,INCAP:2,STUNNED:3,SLEEPING:4,PARALYZED:5,RESTING:6,FIGHTING:7,STANDING:8};
R.DIRS=['north','east','south','west','up','down'];
R.DIR_NAME=['北','東','南','西','上','下'];
R.REV_DIR=[2,3,0,1,5,4];
R.SECT=['INSIDE','CITY','FIELD','FOREST','HILLS','MOUNTAIN','WATER_SWIM','WATER_NOSWIM','UNDERWATER','AIR','DESERT'];
R.MOVE_LOSS=[1,2,2,3,4,6,4,1,5,10,6];
R.WEAR={NONE:-1,LIGHT:0,FINGER_L:1,FINGER_R:2,NECK_1:3,NECK_2:4,BODY:5,HEAD:6,LEGS:7,FEET:8,HANDS:9,ARMS:10,SHIELD:11,
  ABOUT:12,WAIST:13,WRIST_L:14,WRIST_R:15,WIELD:16,HOLD:17,WIELD_2:18,TWO_HAND:19,ARROW:20,FINGER_3:22,FINGER_4:23,RIDE:24,
  ARMS_2:25,HANDS_2:26,LEGS_2:27,FEET_2:28,AMMO:29};
R.WHERE_NAME=["< 光  源 > ","< 手  指 > ","< 手  指 > ","< 頸  部 > ","< 頸  部 > ","< 身  體 > ","< 頭  部 > ",
  "< 腿  部 > ","< 腳  部 > ","< 手  部 > ","< 手  臂 > ","< 盾  牌 > ","<圍繞身體> ","< 腰  部 > ","< 腕  部 > ",
  "< 腕  部 > ","<主要武器> ","< 手  握 > ","<次要武器> ","<雙手武器> ","< 背  掛 > ","","< 觸  手 > ","< 觸  手 > ",
  "< 騎  乘 > ","<次 手 臂> ","<次 手 部> ","<次 腿 部> ","<次 腳 部> ","< 彈  藥 > "];
/* 顯示順序：LEGS_2 接在 LEGS 後、FEET_2 接在 FEET 後 */
R.EQ_ORDER=[0,1,2,22,23,3,4,5,6,7,27,8,28,9,26,10,25,11,12,13,14,15,16,17,18,19,20,29,24];

R.rand=(a,b)=>{if(b<a)return a;return a+Math.floor(Math.random()*(b-a+1));};
R.pct=()=>R.rand(1,100);
R.bits=n=>Math.floor(Math.random()*(1<<n));
R.dice=(n,s)=>{let t=0;for(let i=0;i<n;i++)t+=R.rand(1,Math.max(1,s));return t;};
R.fuzzy=n=>{const b=R.bits(2);return b===0?n-1:b===3?n+1:n;};
R.urange=(a,b,c)=>b<a?a:b>c?c:b;
R.pick=a=>a[Math.floor(Math.random()*a.length)];

R.lc=s=>String(s||'').toLowerCase();
R.str_prefix=(a,b)=>!!a&&R.lc(b).startsWith(R.lc(a));   /* C 的 !str_prefix(a,b) 為真 */
R.is_name=(str,namelist)=>{
  if(!str)return false;
  const words=R.lc(namelist).split(/\s+/).filter(Boolean);
  return R.lc(str).split(/\s+/).filter(Boolean).every(p=>words.some(w=>w.startsWith(p)));
};
R.one_arg=s=>{
  s=String(s||'').replace(/^\s+/,'');
  let q=' ';if(s[0]==="'"||s[0]==='"'){q=s[0];s=s.slice(1);}
  const i=s.indexOf(q);
  if(i<0)return [q===' '?s.toLowerCase():s.toLowerCase(),''];
  return [s.slice(0,i).toLowerCase(),s.slice(i+1).replace(/^\s+/,'')];
};
R.num_arg=s=>{const m=/^(\d+)\.(.*)$/.exec(s);return m?[+m[1],m[2]]:[1,s];};
R.cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
R.strip=s=>String(s).replace(/\x1b\[[0-9;]*m/g,'');
R.width=s=>{let w=0;for(const ch of R.strip(s))w+=ch.charCodeAt(0)>0x2e80?2:1;return w;};
R.pad=(s,n)=>{s=String(s);const w=R.width(s);return w>=n?s:s+' '.repeat(n-w);};
R.padL=(s,n)=>{s=String(s);const w=R.width(s);return w>=n?s:' '.repeat(n-w)+s;};
R.nl=s=>String(s).replace(/\r/g,'');
/* 手機窄螢幕：原版文字在約 76 格處硬換行，畫面窄時會變成一長一短。
   R.cols 由介面依終端機寬度設定；窄的時候把同一段的硬換行接回去，交給畫面自己折行 */
R.narrow=()=>!!R.cols&&R.cols<70;
R.reflow=s=>{
  const L=String(s).split('\n'),out=[];
  for(const l of L){
    const p=out.length-1,prev=p>=0?out[p]:null;
    const join=prev!==null&&l&&!/^[\s　]/.test(l)&&R.width(prev.split('\n').pop())>=56&&!/ {3,}|[─│┌┐└┘═║]/.test(prev+l);
    if(join)out[p]=prev+l;else out.push(l);
  }
  return out.join('\n');
};
R.fit=s=>R.narrow()?R.reflow(s):s;
/* EXP_PER_LEVEL（merc.h） */
R.expPer=l=>l<28?1000:({28:1050,29:1100,30:1200,31:1300,32:1450,33:1600,34:1800,35:2100,36:4000,37:6300,38:12000,39:19200,40:28000})[l]||(l<43?29000:0);
/* 網頁版「簡易模式」：預設開啟，降低新手門檻；指令 easy 可關掉（act 加 HARDCORE＝照原版） */
R.EASY={gold:40000,prac:20,practiceLv:1,learnMul:2,levelPrac:2,expMul:1.5};
R.easy=ch=>!!ch&&!ch.npc&&!ch.act.has('HARDCORE');
R.expNext=ch=>R.expPer(ch.level)*(ch.level+1);
R.hash=async s=>{
  try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('roc:'+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  catch(e){let h=5381;for(const c of 'roc:'+s)h=((h*33)^c.charCodeAt(0))>>>0;return 'x'+h.toString(16);}
};
})(ROC);
