/* db.js — 開機建索引、create_mobile / create_object、reset（對應 db.c） */
(function(R){
const W=R.world={rooms:{},mobs:{},objs:{},areas:[],chars:[],objects:[],players:[]};
const raceIdx=name=>{const i=R.CONST.races.findIndex(r=>R.lc(r.name)===R.lc(name));return i<0?0:i;};
const SEX={neutral:0,male:1,female:2};

R.bootDb=function(){
  for(const a of R.areaData){
    const area={id:a.area.file,name:a.area.name,recall:a.area.recall||R.ROOM_TEMPLE,lo:a.area.vnum_start,hi:a.area.vnum_end,
      rooms:[],age:R.rand(10,15),nplayer:0};
    W.areas.push(area);
    for(const [v,m] of Object.entries(a.mobiles||{})){m.vnum=+v;m.count=0;m.area=area;W.mobs[v]=m;}
    for(const [v,o] of Object.entries(a.objects||{})){o.vnum=+v;o.count=0;o.area=area;W.objs[v]=o;}
    for(const [v,r] of Object.entries(a.rooms||{})){
      const room={vnum:+v,name:r.name,desc:r.description||'',flags:new Set(r.flags||[]),
        sector:Math.max(0,R.SECT.indexOf(r.sector)),exits:[],people:[],contents:[],
        extra:r.extra_descriptions||[],area,resets:r.resets||null};
      for(const [dn,e] of Object.entries(r.exits||{})){
        const d=R.DIRS.indexOf(dn);if(d<0)continue;
        const locks=new Set(e.locks||[]);
        room.exits[d]={to:e.to_room,desc:e.description||'',kw:e.keywords||'',key:e.key,
          isdoor:locks.has('ISDOOR'),closed:locks.has('CLOSED'),locked:locks.has('LOCKED'),
          init:{closed:locks.has('CLOSED'),locked:locks.has('LOCKED')}};
      }
      W.rooms[v]=room;area.rooms.push(room);
    }
  }
  R.areaData=null;
  /* 屍體原型（OBJ_VNUM_CORPSE_NPC / PC） */
  for(const o of Object.values(W.objs)){
    if(o.item_type==='CORPSE_NPC'&&!W.corpseNpc&&/%s/.test(o.short_description))W.corpseNpc=o;
    if(o.item_type==='CORPSE_PC'&&!W.corpsePc)W.corpsePc=o;
  }
  for(const a of W.areas)R.resetArea(a);
};
R.getRoom=v=>W.rooms[v];

R.createMobile=function(p){
  const lv=R.fuzzy(p.level||1),L=Math.max(1,lv);
  const hp=(p.mod_hitplus||0)+R.rand(Math.floor(L*L/2),L*L)+(L>34?L*45:L*10);
  const race=raceIdx(p.race||'Human'),rc=R.CONST.races[race];
  let gold=p.gold||0;
  if(gold<0)gold=Math.floor(R.fuzzy(50)*R.fuzzy(L)*Math.max(Math.floor(L/9),1)*Math.max(Math.floor(L/20),1)*R.rand(rc.glow,rc.ghigh)/100);
  const mana=Math.max(50,Math.floor(hp/5));
  const ch={npc:true,proto:p,vnum:p.vnum,name:p.keywords,short:p.short_description,long:p.long_description||'',
    desc:p.description||'',level:L,sex:SEX[p.sex]??0,race,cls:0,act:new Set(p.act_flags||[]),aff:new Set(p.affected_flags||[]),
    hit:hp,max_hit:hp,mana,max_mana:mana,move:mana,max_move:mana,gold,exp:0,alignment:p.alignment||0,
    hitroll:(p.mod_hitroll||0)+Math.floor(L/2),damroll:(p.mod_damroll||0)+Math.floor(L/3),armor:100-L*8+(p.mod_ac||0),
    position:R.POS.STANDING,carrying:[],fighting:null,room:null,wait:0,shop:p.shop||null,
    affects:[],dodge:rc.dodge||0,pp:p.mod_pp||0,psk:p.practice_skills||''};
  p.count++;W.chars.push(ch);
  return ch;
};
const num=v=>parseInt(v,10)||0;
R.createObject=function(p,level){
  const L=level||p.level||1;
  const o={proto:p,vnum:p.vnum,name:p.keywords||'',short:p.short_description||'',long:p.long_description||'',
    type:p.item_type,extra:new Set(p.extra_flags||[]),wear:new Set(p.wear_flags||[]),values:(p.values||[]).map(num),
    weight:p.weight||0,cost:p.cost||R.fuzzy(4)*R.fuzzy(L)*R.fuzzy(L),level:p.level||L,limit:p.level_limited||0,
    wear_loc:-1,contains:[],carried_by:null,in_room:null,in_obj:null,timer:p.timer||0,applies:p.applies||[],
    extra_descr:p.extra_descriptions||[],material:p.material||''};
  p.count++;W.objects.push(o);
  return o;
};

R.resetRoom=function(room,fullAge){
  const rs=room.resets;if(!rs)return;
  for(const mr of rs.mobiles||[]){
    const p=W.mobs[mr.vnum];if(!p)continue;
    if(p.count>=(mr.limit||1))continue;
    const m=R.createMobile(p);
    R.charToRoom(m,room);
    const lv=R.urange(1,(p.level||1)-2,41);
    for(const e of mr.equipment||[]){
      const op=W.objs[e.vnum];if(!op)continue;
      const o=R.createObject(op,lv);R.objToChar(o,m);
      const loc=R.WEAR[e.wear_loc];
      if(loc!==undefined&&loc>=0&&!R.getEq(m,loc))R.equipChar(m,o,loc);
    }
    for(const e of mr.inventory||[]){
      const op=W.objs[e.vnum];if(!op)continue;
      const o=R.createObject(op,lv);if(m.shop)o.shopInv=true;R.objToChar(o,m);
    }
  }
  if(room.area.nplayer>0&&!fullAge)return;
  for(const orr of rs.objects||[]){
    const p=W.objs[orr.vnum];if(!p)continue;
    if(room.contents.some(o=>o.vnum===orr.vnum))continue;
    const o=R.createObject(p);R.objToRoom(o,room);
    for(const c of orr.contains||[]){const cp=W.objs[c.vnum];if(cp)R.objToObj(R.createObject(cp),o);}
  }
};
R.resetArea=function(a){
  for(const r of a.rooms){
    for(const e of r.exits)if(e&&e.isdoor){e.closed=e.init.closed;e.locked=e.init.locked;}
    R.resetRoom(r,a.nplayer===0);
  }
};
})(ROC);
