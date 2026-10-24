/* map/build.js — 從 data/areas 算出全區地圖座標，輸出 map/map.json
   用法：node map/build.js
   - 原版資料沒有座標，只有「往哪個方向通到哪個房間」：從每區的起點房間 BFS，依方向推位置（北 y-1、東 x+1…），上下樓用 z。
   - 位置被佔走時往旁邊找最近的空格；同一區不相連的幾塊，各自排好再往右邊並排。
   - 每一層（z）各畫成一塊，同區的各層左右並排；世界總圖再依跨區出口的方向擺放各區，最後推開重疊的區域。 */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
global.ROC={A:[],loadArea(a){this.A.push(a);}};
eval(fs.readFileSync(path.join(root,'data/index.js'),'utf8'));
for(const a of ROC.AREAS)eval(fs.readFileSync(path.join(root,'data/areas',a.id+'.js'),'utf8'));

const DIRS=['north','east','south','west','up','down'];
const DV={north:[0,-1,0],east:[1,0,0],south:[0,1,0],west:[-1,0,0],up:[0,0,1],down:[0,0,-1]};
const REV={north:'south',south:'north',east:'west',west:'east',up:'down',down:'up'};
const SECT=['INSIDE','CITY','FIELD','FOREST','HILLS','MOUNTAIN','WATER_SWIM','WATER_NOSWIM','UNDERWATER','AIR','DESERT'];
const FLAG=['DARK','SAFE','NO_RECALL','PK','NO_MOB','INDOORS','UNDERGROUND','PRIVATE','PET_SHOP'];
const strip=s=>String(s||'').replace(/\x1b\[[0-9;]*m/g,'');

/* 全部房間 → 所屬區域 */
const R={},own={};
ROC.A.forEach((a,ai)=>{for(const [v,r] of Object.entries(a.rooms||{})){R[v]=r;own[v]=ai;}});
const mobP={},objP={};
const mobA={},objA={};
ROC.A.forEach((a,ai)=>{for(const v in a.mobiles||{}){mobP[v]=a.mobiles[v];mobA[v]=ai;}for(const v in a.objects||{}){objP[v]=a.objects[v];objA[v]=ai;}});

/* ---- 單一區域排版 ---- */
function layoutArea(ai){
  const a=ROC.A[ai],vs=Object.keys(a.rooms||{}).map(Number).sort((x,y)=>x-y);
  const pos={},occ=new Map(),key=(x,y,z)=>x+','+y+','+z;
  const comps=[];
  const start=[a.area.recall,...vs].filter(v=>own[v]===ai);
  const free=(x,y,z)=>{   /* 被佔了就往外一圈一圈找空格 */
    if(!occ.has(key(x,y,z)))return [x,y,z];
    for(let r=1;r<40;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
      if(!occ.has(key(x+dx,y+dy,z)))return [x+dx,y+dy,z];
    }
    return [x,y,z];
  };
  for(const s of start){
    if(pos[s])continue;
    const comp=[];const q=[s];
    const p0=free(0,0,0);pos[s]=p0;occ.set(key(...p0),s);comp.push(s);
    while(q.length){
      const v=q.shift(),[x,y,z]=pos[v];
      for(const d of DIRS){
        const e=(R[v].exits||{})[d];if(!e)continue;
        const t=e.to_room;if(own[t]!==ai||pos[t])continue;
        const [dx,dy,dz]=DV[d];
        const p=free(x+dx,y+dy,z+dz);pos[t]=p;occ.set(key(...p),t);comp.push(t);q.push(t);
      }
    }
    comps.push(comp);
    /* 之後的區塊各自從原點排，先清掉佔位，等等整塊平移 */
    if(comps.length===1)continue;
  }
  /* 把不相連的區塊往右並排（第一塊不動） */
  const bbox=list=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const v of list){const [x,y]=pos[v];x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return [x0,y0,x1,y1];};
  let right=bbox(comps[0])[2]+2;
  for(const c of comps.slice(1)){const [x0,y0]=bbox(c);const dx=right-x0,dy=-y0;for(const v of c){pos[v]=[pos[v][0]+dx,pos[v][1]+dy,pos[v][2]];}right=bbox(c)[2]+2;}
  /* 各層左右並排：z 大的在左（樓上），標上層名 */
  const zs=[...new Set(vs.map(v=>pos[v][2]))].sort((p,q)=>q-p);
  /* 各層換行排列，整區維持接近方形 */
  const blocks=zs.map(z=>{const list=vs.filter(v=>pos[v][2]===z),b=bbox(list);return {z,list,b,w:b[2]-b[0]+1,h:b[3]-b[1]+1};});
  const total=blocks.reduce((t,k)=>t+(k.w+3)*(k.h+3),0),maxW=Math.max(...blocks.map(k=>k.w),Math.ceil(Math.sqrt(total)*1.3));
  const floors=[];const out={};let ox=0,oy=0,rowH=0,W=1;
  for(const k of blocks){
    if(ox>0&&ox+k.w>maxW){ox=0;oy+=rowH+3;rowH=0;}
    for(const v of k.list)out[v]=[pos[v][0]-k.b[0]+ox,pos[v][1]-k.b[1]+oy];
    floors.push({z:k.z,x:ox,y:oy,w:k.w,h:k.h,n:k.list.length});
    W=Math.max(W,ox+k.w);ox+=k.w+3;rowH=Math.max(rowH,k.h);
  }
  const H=oy+rowH;
  return {pos:out,w:W,h:H,floors};
}

const areas=ROC.A.map((a,ai)=>{
  const L=layoutArea(ai);
  /* 建議等級：區內重生怪物等級的中位數 */
  const lv=[];for(const r of Object.values(a.rooms||{}))for(const m of (r.resets&&r.resets.mobiles)||[]){const p=mobP[m.vnum];if(p&&p.level)lv.push(p.level);}
  lv.sort((x,y)=>x-y);
  return {id:ROC.AREAS[ai].id,name:strip(a.area.name),lo:a.area.vnum_start,hi:a.area.vnum_end,recall:a.area.recall,
    lv:lv.length?lv[lv.length>>1]:0,lvMax:lv.length?lv[lv.length-1]:0,w:L.w,h:L.h,floors:L.floors,pos:L.pos,n:Object.keys(a.rooms||{}).length};
});

/* ---- 世界總圖：依跨區出口的方向擺放各區 ---- */
const links=new Map();   /* "a-b" → {a,b,dx,dy,n} */
for(const [v,r] of Object.entries(R))for(const [d,e] of Object.entries(r.exits||{})){
  const t=e.to_room;if(!R[t]||own[v]===own[t])continue;
  const a=own[v],b=own[t],k=a+'-'+b,[dx,dy,dz]=DV[d];
  const L=links.get(k)||{a,b,dx:0,dy:0,n:0};L.dx+=dx+(dz?0.6*dz:0);L.dy+=dy-(dz?0.6*dz:0);L.n++;links.set(k,L);
}
const GAP=9;
const ctr=areas.map(()=>null);
const home=own[3001]??0;
ctr[home]=[0,0];
const q=[home];
while(q.length){   /* BFS：鄰居放在連線方向上，距離＝兩區半徑和 */
  const a=q.shift();
  for(const L of links.values()){
    if(L.a!==a&&L.b!==a)continue;const fwd=L.a===a,b=fwd?L.b:L.a;if(ctr[b])continue;   /* 雙向都算：反向連線方向取反 */
    let dx=L.dx/L.n*(fwd?1:-1),dy=L.dy/L.n*(fwd?1:-1);const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;if(!dx&&!dy)dx=1;
    const d=(Math.hypot(areas[a].w,areas[a].h)+Math.hypot(areas[b].w,areas[b].h))/2+GAP;
    ctr[b]=[ctr[a][0]+dx*d,ctr[a][1]+dy*d];q.push(b);
  }
}
/* 推開重疊、連線的區域互相拉近 */
const lk=[...links.values()];
for(let it=0;it<600;it++){
  for(const L of lk){if(!ctr[L.a]||!ctr[L.b])continue;const [ax,ay]=ctr[L.a],[bx,by]=ctr[L.b];const k=0.002;ctr[L.b][0]-=(bx-ax)*k;ctr[L.b][1]-=(by-ay)*k;ctr[L.a][0]+=(bx-ax)*k;ctr[L.a][1]+=(by-ay)*k;}
  for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++){
    if(!ctr[i]||!ctr[j])continue;const A=areas[i],B=areas[j];
    const ox=(A.w+B.w)/2+GAP-Math.abs(ctr[i][0]-ctr[j][0]),oy=(A.h+B.h)/2+GAP-Math.abs(ctr[i][1]-ctr[j][1]);
    if(ox>0&&oy>0){
      if(ox<oy){const s=Math.sign(ctr[j][0]-ctr[i][0])||1;ctr[i][0]-=s*ox/2;ctr[j][0]+=s*ox/2;}
      else{const s=Math.sign(ctr[j][1]-ctr[i][1])||1;ctr[i][1]-=s*oy/2;ctr[j][1]+=s*oy/2;}
    }
  }
}
/* 跟主城不相連的區域：排在下方 */
let bx0=1e9,by1=-1e9,bx1=-1e9;
areas.forEach((A,i)=>{if(ctr[i]){bx0=Math.min(bx0,ctr[i][0]-A.w/2);bx1=Math.max(bx1,ctr[i][0]+A.w/2);by1=Math.max(by1,ctr[i][1]+A.h/2);}});
let cx=bx0,cy=by1+GAP*3,rowH=0;
areas.forEach((A,i)=>{if(ctr[i])return;if(cx+A.w>bx1&&cx>bx0){cx=bx0;cy+=rowH+GAP;rowH=0;}ctr[i]=[cx+A.w/2,cy+A.h/2];cx+=A.w+GAP;rowH=Math.max(rowH,A.h);A.isolated=true;});

/* ---- 輸出 ---- */
const rooms=[],idx={};
areas.forEach((A,ai)=>{A.x=Math.round(ctr[ai][0]-A.w/2);A.y=Math.round(ctr[ai][1]-A.h/2);});
for(const [v,r] of Object.entries(R)){
  const ai=own[v],A=areas[ai],p=A.pos[v];
  const fl=(r.flags||[]).reduce((s,f)=>FLAG.includes(f)?s|(1<<FLAG.indexOf(f)):s,0);
  /* 出口：[方向, 目標, 旗標(1門 2上鎖 4單向)] */
  const ex=[];
  for(const d of DIRS){const e=(r.exits||{})[d];if(!e||!R[e.to_room])continue;
    const lk=new Set(e.locks||[]),back=(R[e.to_room].exits||{})[REV[d]];
    ex.push([DIRS.indexOf(d),e.to_room,(lk.has('ISDOOR')?1:0)|(lk.has('LOCKED')?2:0)|(!back||back.to_room!=v?4:0)]);}
  idx[v]=rooms.length;
  rooms.push([+v,ai,A.x+p[0],A.y+p[1],strip(r.name),Math.max(0,SECT.indexOf(r.sector)),fl,ex]);
}
/* 怪物／物品索引：名字 → 出現的房間（重生資料） */
const mobs={},objs={};
const addO=(vn,room)=>{const p=objP[vn];if(!p)return;(objs[vn]=objs[vn]||[strip(p.short_description),p.level||0,p.item_type,[]])[3].push(room);};
for(const [v,r] of Object.entries(R)){
  const rs=r.resets;if(!rs)continue;
  for(const m of rs.mobiles||[]){const p=mobP[m.vnum];if(!p)continue;(mobs[m.vnum]=mobs[m.vnum]||[strip(p.short_description),p.level||0,[]])[2].push(+v);
    for(const e of [...(m.equipment||[]),...(m.inventory||[])])addO(e.vnum,+v);}
  for(const o of rs.objects||[])addO(o.vnum,+v);
}
for(const v in mobP)if(!mobs[v])mobs[v]=[strip(mobP[v].short_description),mobP[v].level||0,[]];
for(const v in objP)if(!objs[v])objs[v]=[strip(objP[v].short_description),objP[v].level||0,objP[v].item_type,[]];
for(const v in mobs)mobs[v].push(mobA[v]??-1);for(const v in objs)objs[v].push(objA[v]??-1);   /* 最後一欄：所屬區域 */
for(const m of Object.values(mobs))m[2]=[...new Set(m[2])];
for(const o of Object.values(objs))o[3]=[...new Set(o[3])];
const out={v:1,sect:SECT,flag:FLAG,
  areas:areas.map(A=>({id:A.id,name:A.name,x:A.x,y:A.y,w:A.w,h:A.h,lv:A.lv,lvMax:A.lvMax,n:A.n,recall:A.recall,iso:!!A.isolated,
    floors:A.floors.map(f=>[f.z,f.x,f.y,f.w,f.h])})),
  rooms,mobs,objs};
const js=JSON.stringify(out);
fs.writeFileSync(path.join(__dirname,'map.json'),js);
console.log('areas',areas.length,'rooms',rooms.length,'links',links.size,'isolated',areas.filter(a=>a.isolated).length,'size',(js.length/1e6).toFixed(2)+'MB');
