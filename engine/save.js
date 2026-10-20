/* save.js — 角色存檔（對應 save.c）。
 * 用「開始遊戲.cmd」開（http://127.0.0.1）→ 存進 ROC網頁\\player\\名字.json；直接雙擊 index.html（file://）→ 存在瀏覽器 localStorage。 */
(function(R){
const KEY='roc.player.';
const Store=R.Store={mode:'local',cache:{},
  async init(){
    if(location.protocol!=='http:')return;
    try{
      const r=await fetch('/api/players',{cache:'no-store'});if(!r.ok)return;
      Store.cache=await r.json();Store.mode='folder';
      /* 第一次改用資料夾：把瀏覽器裡舊的存檔搬過去 */
      for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
        if(k.startsWith(KEY)&&!Store.cache[k.slice(KEY.length)]){const d=JSON.parse(localStorage.getItem(k));Store.put(k.slice(KEY.length),d);}}
    }catch(e){}
  },
  get(n){return Store.mode==='folder'?(Store.cache[n]||null):JSON.parse(localStorage.getItem(KEY+n)||'null');},
  put(n,d){
    if(Store.mode!=='folder'){localStorage.setItem(KEY+n,JSON.stringify(d));return;}
    Store.cache[n]=d;
    fetch('/api/player/'+n,{method:'PUT',body:JSON.stringify(d,null,1),keepalive:true}).catch(()=>{});
  },
  del(n){if(Store.mode==='folder'){delete Store.cache[n];fetch('/api/player/'+n,{method:'DELETE'}).catch(()=>{});}else localStorage.removeItem(KEY+n);},
  all(){if(Store.mode==='folder')return {...Store.cache};
    const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(KEY))o[k.slice(KEY.length)]=JSON.parse(localStorage.getItem(k));}return o;}
};
const objOut=o=>({v:o.vnum,w:o.wear_loc,t:o.timer||undefined,c:o.contains.length?o.contains.map(objOut):undefined,
  s:o.proto.item_type==='MONEY'?o.values:undefined});
function objIn(d){
  const p=R.world.objs[d.v];if(!p)return null;
  const o=R.createObject(p);if(d.t)o.timer=d.t;if(d.s)o.values=d.s;
  for(const c of d.c||[]){const x=objIn(c);if(x)R.objToObj(x,o);}
  o._w=d.w;return o;
}
R.newPlayer=function(name){
  return {npc:false,name,pc:{pwd:'',title:'',prompt:'',cond:[0,100,100],learned:{}},level:0,sex:1,race:0,cls:0,
    perm:[13,13,13,13,13],mod:[0,0,0,0,0],act:new Set(['BLANK','COMBINE','PROMPT','AUTOEXIT','COMBAT','CHINESE','AUTOGOLD']),
    aff:new Set(),hit:20,max_hit:20,mana:100,max_mana:100,move:100,max_move:100,gold:0,bank:0,exp:0,alignment:0,
    hitroll:0,damroll:0,armor:100,practice:21,position:R.POS.STANDING,carrying:[],fighting:null,room:null,wait:0,
    played:0,logon:Date.now(),wimpy:0,affects:[],dodge:0,pp:0};
};
R.Save={
  exists:name=>Store.get(R.lc(name))!==null,
  save(ch){
    if(ch.npc||ch.level<1)return;
    const d={name:ch.name,pwd:ch.pc.pwd,title:ch.pc.title,prompt:ch.pc.prompt,level:ch.level,sex:ch.sex,race:ch.race,cls:ch.cls,
      perm:ch.perm,hit:ch.hit,max_hit:ch.max_hit-0,mana:ch.mana,max_mana:ch.max_mana,move:ch.move,max_move:ch.max_move,
      gold:ch.gold,bank:ch.bank,exp:ch.exp,alignment:ch.alignment,practice:ch.practice,
      played:ch.played+Math.floor((Date.now()-ch.logon)/1000),act:[...ch.act],
      room:ch.room?(ch.room.flags.has('NO_SAVE')?R.ROOM_TEMPLE:ch.room.vnum):R.ROOM_TEMPLE,
      objs:ch.carrying.map(objOut),saved:Date.now(),learned:ch.pc.learned||{},desc:ch.pc.description||undefined,ob:ch.pc.ownerBoost||undefined,
      qmarks:R.MP?R.MP.qSave(ch):undefined,resp:ch.resp||undefined,skexp:ch.skexp||undefined,
      affects:(ch.affects||[]).filter(a=>!a.deleted).map(a=>({s:R.skillName(a.type),d:a.duration,l:a.location,m:a.modifier,b:a.bitvector}))};
    /* 裝備加成先卸再存，基礎值才正確 */
    const eq=ch.carrying.filter(o=>o.wear_loc>=0);
    const afs=(ch.affects||[]).filter(a=>!a.deleted);
    for(const o of eq)R.applyMod(ch,o,-1);
    for(const a of afs)R.affectModify(ch,a,false);
    Object.assign(d,{max_hit:ch.max_hit,max_mana:ch.max_mana,max_move:ch.max_move});
    for(const a of afs)R.affectModify(ch,a,true);
    for(const o of eq)R.applyMod(ch,o,1);
    Store.put(R.lc(ch.name),d);
  },
  load(name){
    const d=Store.get(R.lc(name));if(!d)return null;
    const ch=R.newPlayer(d.name);
    for(const k of ['level','sex','race','cls','perm','hit','max_hit','mana','max_mana','move','max_move','gold','bank','exp','alignment','practice','played'])
      if(d[k]!==undefined)ch[k]=d[k];
    ch.pc.pwd=d.pwd;ch.pc.title=d.title||'';ch.pc.prompt=d.prompt||'';ch.act=new Set(d.act||[...ch.act]);
    ch.savedRoom=d.room;
    for(const od of [...(d.objs||[])].reverse()){
      const o=objIn(od);if(!o)continue;R.objToChar(o,ch);
      if(od.w>=0)R.equipChar(ch,o,od.w);
    }
    ch.pc.learned=d.learned||{};if(d.desc)ch.pc.description=d.desc;if(d.ob)ch.pc.ownerBoost=d.ob;
    if(R.MP)R.MP.qLoad(ch,d.qmarks);ch.resp=d.resp||0;ch.skexp=d.skexp||0;
    for(const a of d.affects||[]){const sn=R.skillLookup(a.s);if(sn>0)R.affectToChar(ch,{type:sn,duration:a.d,location:a.l,modifier:a.m,bitvector:a.b});}
    return ch;
  },
  remove:name=>Store.del(R.lc(name)),
  exportAll(){
    for(const p of R.world.players)if(p.playing)R.Save.save(p);
    const out={};for(const [n,d] of Object.entries(Store.all()))out[KEY+n]=d;
    const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='ROC存檔_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  },
  importAll(text){
    try{const d=JSON.parse(text);let n=0;
      for(const [k,v] of Object.entries(d))if(k.startsWith(KEY)){Store.put(k.slice(KEY.length),v);n++;}
      Term.write('\x1b[1;32m[系統] 匯入 '+n+' 個角色存檔。\x1b[m\n');
    }catch(e){Term.write('\x1b[1;31m[系統] 匯入失敗：'+e.message+'\x1b[m\n');}
  }
};
})(ROC);
