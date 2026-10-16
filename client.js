/* ===== Server client: storage. Only in the server build (server/public/client.js), prepended before the game code.
   The game was written against localStorage. In the server build every "localStorage" in the game code is renamed to
   LS at build time, and LS sends account, character and shared data to the server instead:
   - characters and last slot (mapleish_cN, mapleish_last) -> this account's storage on the server (checked there)
   - chat, mail, site news/events, moderation (mapleish_chat, inbox_NAME, site, mod, audit) -> shared storage on the server
   - accounts (mapleish_accts) -> read-only view from the server (names and roles); admin role changes go to /api/role
   - everything else (saved ID, UI preferences) stays in this browser.
   Reads are synchronous from a cache filled before the game starts (window.__KV from /api/kv). Writes update the cache
   at once and reach the server shortly after; a save the server rejects is replaced by the server's last good copy. */
const LS=(()=>{const real=window.localStorage;let kv=window.__KV||{user:{},shared:{},accts:{}};
 const USER=/^mapleish_(c\d{1,2}|last)$/,SHARED=/^mapleish_(chat|mod|audit|site|rates|inbox_.+)$/;
 const timers={},pending={};
 const put=(scope,k)=>{const v=pending[scope+k];delete pending[scope+k];
  const body=JSON.stringify({value:v});/* keepalive (survives closing the page) only works up to 64 KB: a big save sent with it failed as "Cannot reach the server" */
  return fetch('/api/kv/'+scope+'/'+encodeURIComponent(k),{method:'PUT',credentials:'same-origin',keepalive:body.length<60000,headers:{'Content-Type':'application/json'},body})
   .then(async r=>{if(r.ok&&scope==='user'&&window.__saveOk)window.__saveOk();if(r.status===409){const j=await r.json();if(scope==='user'){if(j.kept==null)delete kv.user[k];else kv.user[k]=j.kept}
     window.__serverNote&&window.__serverNote('The server refused a save: '+j.error+' Your last good save was kept.')}
    else if(r.status===401)window.__serverNote&&window.__serverNote('You are logged out. Log in again to keep saving.')})
   .catch(()=>{window.__serverNote&&window.__serverNote('Cannot reach the server. Progress will save when it is back.');pending[scope+k]=v;setTimeout(()=>queue(scope,k),5000)})};
 /* at most one write per key every 4 s for characters (700 ms for chat/site), always with the newest value; this keeps
    the free database's daily write allowance for real play */
 const queue=(scope,k)=>{const id=scope+k;if(timers[id])return;timers[id]=setTimeout(()=>{delete timers[id];if(id in pending)put(scope,k)},scope==='user'?4000:700)};
 const flush=()=>{for(const id in timers){clearTimeout(timers[id]);delete timers[id];const scope=id.startsWith('user')?'user':'shared';const k=id.slice(scope.length);if((scope+k) in pending)put(scope,k)}};
 window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
 const S={
  getItem(k){if(k==='mapleish_accts')return JSON.stringify(kv.accts||{});
   if(USER.test(k))return k in kv.user?kv.user[k]:null;if(SHARED.test(k))return k in kv.shared?kv.shared[k]:null;try{return real.getItem(k)}catch(e){return null}},
  setItem(k,v){v=String(v);
   if(k==='mapleish_accts'){/* only role changes by an admin mean anything; the server checks */let n={};try{n=JSON.parse(v)||{}}catch(e){}
    for(const id in n){const was=(kv.accts[id]||{}).role||'player',now=n[id]&&n[id].role||'player';if(kv.accts[id]&&was!==now){kv.accts[id].role=now==='player'?undefined:now;
     fetch('/api/role',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,role:now})}).then(r=>r.json()).then(j=>{if(j.error&&window.__serverNote)window.__serverNote(j.error)})}}return}
   if(USER.test(k)){kv.user[k]=v;pending['user'+k]=v;return queue('user',k)}
   if(SHARED.test(k)){kv.shared[k]=v;pending['shared'+k]=v;return queue('shared',k)}
   try{real.setItem(k,v)}catch(e){}},
  removeItem(k){if(k==='mapleish_accts')return;
   if(k==='mapleish_sess'){fetch('/api/logout',{method:'POST',credentials:'same-origin'}).finally(()=>{try{real.removeItem('ml_token')}catch(e){}});kv={user:{},shared:kv.shared,accts:{},me:null};window.__KV=kv}
   if(USER.test(k)){delete kv.user[k];pending['user'+k]=null;return queue('user',k)}
   if(SHARED.test(k)){delete kv.shared[k];pending['shared'+k]=null;return queue('shared',k)}
   try{real.removeItem(k)}catch(e){}},
  key(i){try{return real.key(i)}catch(e){return null}},get length(){try{return real.length}catch(e){return 0}},
  /* after login/register: load this account's data */
  async reload(){const r=await fetch('/api/kv',{credentials:'same-origin'});kv=await r.json();window.__KV=kv;return kv}};
 return S})();


"use strict";
const EXP=[15,34,57,92,135,372,560,840,1242,1716,2360,3216,4200,5460,7050],MAXL=200;for(let i=EXP.length;i<MAXL;i++)EXP.push(Math.round(EXP[i-1]*1.07));
const ITEMS={
 apple:{n:'Apple',i:'🍎',heal:30},egg:{n:'Egg',i:'🥚',heal:50},
 red_potion:{n:'Red Potion',i:'🧪',heal:100,buy:50},
 snail_shell:{n:'Snail Shell',i:'🐚',sell:5},mushroom_spore:{n:'Mushroom Spore',i:'🍄',sell:8},
 pebble_chip:{n:'Pebble Chip',i:'🪨',sell:12},blue_snail_shell:{n:'Blue Snail Shell',i:'🔹',sell:7},red_snail_shell:{n:'Red Snail Shell',i:'🐚',sell:10},slime_bubble:{n:'Slime Bubble',i:'🟢',sell:12},orange_mushroom_cap:{n:'Orange Mushroom Cap',i:'🍄',sell:20},golem_core:{n:'Golem Core',i:'💠',sell:40},
 sword:{n:'Sword',i:'🗡️',w:1,watk:17,spd:720,mult:4.0,req:0,buy:50},
 hand_axe:{n:'Hand Axe',i:'🪓',w:1,watk:17,spd:720,mult:4.4,req:0,buy:50},
 wooden_club:{n:'Wooden Club',i:'🔨',w:1,watk:19,spd:750,mult:4.4,req:0,buy:50},
 long_sword:{n:'Long Sword',i:'⚔️',w:1,watk:27,spd:720,mult:4.0,req:10,buy:3000}};
const MON={
 snail:{n:'Snail',i:'🐌',lv:1,hp:8,exp:2,av:0,atk:[1,2],iv:1800,m:[1,4],e:'snail_shell'},
 blue_snail:{n:'Blue Snail',i:'🐌',lv:2,hp:15,exp:4,av:1,atk:[1,3],iv:1800,m:[2,6],e:'blue_snail_shell'},
 shroom:{n:'Shroom',i:'🍄',lv:3,hp:25,exp:6,av:2,atk:[4,7],iv:1800,m:[3,8],e:'mushroom_spore'},
 red_snail:{n:'Red Snail',i:'🐌',lv:4,hp:40,exp:8,av:3,atk:[6,9],iv:1800,m:[4,10],e:'red_snail_shell'},
 orange_mushroom:{n:'Orange Mushroom',i:'🍄',lv:6,hp:70,exp:15,av:5,atk:[9,13],iv:1700,m:[8,16],e:'orange_mushroom_cap'}};
const MAPS={
 mushroom_town:{n:'Mushroom Town',i:'🏘️',d:'Where every new explorer begins. Mushroom-roofed houses, a few friendly faces and a road east.',hint:'Tap someone below to talk to them. A ! means they have a quest for you. The road east opens after Todd\'s lesson.',town:1,npcs:['heena','sera','roger'],ret:'mushroom_town',ex:[['training_camp','Training Camp'],['a_split_road','Road east to Split Road','todd']]},
 training_camp:{n:'Training Camp',i:'⛺',d:'A fenced practice yard behind the town. Snails wander in, and Nina and Todd keep an eye on beginners.',hint:'Talk to Todd to learn hunting. Defeat Snails: press Start Combat, then tap the Attack slot.',need:4,mons:['snail'],npcs:['nina','todd'],ret:'mushroom_town',ex:[['mushroom_town','Back to Mushroom Town']]},
 a_split_road:{n:'A Split Road',i:'🪧',d:'The road forks here. Left leads to the Snail hunting grounds. Right leads to the fields and Amherst.',town:1,npcs:['maria'],ret:'mushroom_town',ex:[['mushroom_town','West to Mushroom Town'],['snail_hunting_ground_1','Left: Snail Hunting Ground I'],['field_west_of_amherst','Right: Field West of Amherst'],['tomato_field','Tomato Field'],['middle_forest_1','Hunting Ground Middle of the Forest I'],['atc_entrance','Entrance to the Adventurer Training Center']]},
 snail_hunting_ground_1:{n:'Snail Hunting Ground I',i:'🌾',d:'Snails and Blue Snails dot a flat, grassy field.',need:6,mons:['snail','blue_snail'],npcs:['sam'],ret:'mushroom_town',ex:[['a_split_road','Back to A Split Road'],['snail_hunting_ground_2','On to Snail Hunting Ground II']]},
 snail_hunting_ground_2:{n:'Snail Hunting Ground II',i:'🌿',d:'A larger field with more Snails and Blue Snails. The path winds on to the next field.',need:8,mons:['snail','blue_snail'],ret:'mushroom_town',ex:[['snail_hunting_ground_1','Back to Snail Hunting Ground I'],['snail_hunting_ground_3','On to Snail Hunting Ground III']]},
 field_west_of_amherst:{n:'Field West of Amherst',i:'🌻',d:'A wide field of mixed small monsters on the way to Amherst. A door leads to the Mushroom Garden.',need:8,mons:['snail','blue_snail','shroom','red_snail','orange_mushroom'],ret:'mushroom_town',ex:[['a_split_road','Back to A Split Road'],['mushroom_garden','Door to the Mushroom Garden'],['amherst','East to Amherst']]},
 mushroom_garden:{n:'Mushroom Garden',i:'🍄',d:'A walled garden full of mushrooms. A good place to find Orange Mushroom Caps.',need:6,mons:['shroom','orange_mushroom'],ret:'mushroom_town',ex:[['field_west_of_amherst','Back to the Field West of Amherst']]},
 amherst:{n:'Amherst',i:'🏡',d:'The island\'s main town, a short walk from the field. Shops, a quiz master and the town chief live here.',hint:'Sid sells weapons and potions. Lucas and Rain have quests.',town:1,shop:1,npcs:['lucas','rain','sid'],ret:'amherst',ex:[['field_west_of_amherst','West to the Field West of Amherst'],['field_east_of_amherst','East to the Field East of Amherst'],['snail_garden','Snail Garden'],['snail_field','Snail Field of Flowers'],['atc_entrance','Adventurer Training Center']]},
 field_east_of_amherst:{n:'Field East of Amherst',i:'🌳',d:'Snails, Blue Snails, Red Snails and Orange Mushrooms roam this field. The path continues to the port.',need:8,mons:['snail','blue_snail','red_snail','orange_mushroom'],ret:'amherst',ex:[['amherst','Back to Amherst'],['southperry','East to Southperry']]},
 southperry:{n:'Southperry',i:'⚓',d:'The island\'s port. Gulls, crates and a ferry that is not sailing in this test.',town:1,npcs:['biggs','vasily'],ret:'amherst',ex:[['field_east_of_amherst','West to the Field East of Amherst']]}};

ITEMS.tree_branch={n:'Tree Branch',i:'🌿',sell:8};
MON.slime={n:'Slime',i:'🟢',lv:6,hp:50,exp:10,av:4,atk:[7,11],iv:1800,m:[6,14],e:'slime_bubble'};
MON.stump={n:'Stump',i:'🪵',lv:4,hp:40,exp:8,av:2,atk:[6,10],iv:1900,m:[4,10],e:'tree_branch'};
const NM=(id,n,i,d,need,mons,ex,ret,art)=>{MAPS[id]={n,i,d,need,mons,ret,ex,art}};
NM('snail_hunting_ground_3','Snail Hunting Ground III','🌾','The last and widest of the Snail fields. A trail leads off into the forest.',8,['snail','blue_snail'],[['snail_hunting_ground_2','Back to Snail Hunting Ground II'],['dangerous_forest','On to the Dangerous Forest']],'mushroom_town',['#5fa84a','#3f8f3a']);
NM('dangerous_forest','Dangerous Forest','🌲','A shady forest crawling with Snails. It is only dangerous if you forget your Potions. The trail ends at Amherst.',8,['snail'],[['snail_hunting_ground_3','Back to Snail Hunting Ground III'],['amherst','Out of the forest to Amherst']],'mushroom_town',['#4f8f3a','#24531f','#3a6a8a',7]);
NM('tomato_field','Tomato Field','🍅','Rows of ripe tomatoes, and Snails who like them as much as you do.',6,['snail','blue_snail','red_snail'],[['a_split_road','Back to A Split Road']],'mushroom_town',['#7cbf5a','#d8432f']);
NM('middle_forest_1','Hunting Ground Middle of the Forest I','🌳','A thick forest with Blue Snails, Red Snails and wobbling Slimes.',8,['blue_snail','red_snail','slime'],[['a_split_road','Back to A Split Road'],['middle_forest_2','Deeper into the forest']],'mushroom_town',['#58a043','#2f6b2c','#5b97d1',6]);
NM('middle_forest_2','Hunting Ground Middle of the Forest II','🌳','Deeper in, the Orange Mushrooms outnumber everything else.',10,['blue_snail','red_snail','shroom','orange_mushroom'],[['middle_forest_1','Back to the Middle of the Forest I']],'mushroom_town',['#4c9439','#285f27','#4f84b8',6]);
NM('snail_garden','Snail Garden','🌷','A tidy garden just outside Amherst. Snails of every colour munch on the flowerbeds.',8,['snail','blue_snail','red_snail'],[['amherst','Back to Amherst']],'amherst',['#6fb552','#3f8f3a']);
NM('snail_field','Snail Field of Flowers','🌼','A bright meadow where Stumps and Slimes have joined the Snails.',10,['snail','blue_snail','red_snail','stump','slime'],[['amherst','Back to Amherst']],'amherst',['#8fd06a','#ff9ec4']);
NM('atc_entrance','Entrance to the Adventurer Training Center','🏫','Beginners gather here to train. Four training rooms lead off from the yard.',8,['shroom','blue_snail','orange_mushroom'],[['amherst','Back to Amherst'],['a_split_road','West to A Split Road'],['atc_1','Training Center 1'],['atc_2','Training Center 2'],['atc_3','Training Center 3'],['atc_4','Training Center 4']],'amherst',['#cdb67f','#8a6a3a','#8fb4d8',3]);
[['atc_1','Adventurer Training Center 1','stump'],['atc_2','Adventurer Training Center 2','red_snail'],['atc_3','Adventurer Training Center 3','slime'],['atc_4','Adventurer Training Center 4','orange_mushroom']].forEach(a=>NM(a[0],a[1],'🥋','A training room full of '+MON[a[2]].n+'s. Clear it to prove yourself.',10,[a[2]],[['atc_entrance','Back to the Training Center entrance']],'amherst',['#cdb67f','#8a6a3a','#8fb4d8',3]));
const _ta0=townArt;townArt=function(id){const r=_ta0(id),m=MAPS[id];if(r||!m||!m.art)return r;const a=m.art,n=a[3]||4,T=(x,y,z)=>'<rect x="'+(x-2)+'" y="'+y+'" width="4" height="'+z+'" fill="#7a5230"/><circle cx="'+x+'" cy="'+y+'" r="'+z*.9+'" fill="'+a[1]+'"/>';
 let b='<defs><linearGradient id="tsk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+(a[2]||'#5b97d1')+'"/><stop offset="1" stop-color="#d4ecfa"/></linearGradient></defs><rect width="320" height="130" fill="url(#tsk2)"/><circle cx="276" cy="24" r="13" fill="#fff0a6"/><ellipse cx="70" cy="28" rx="26" ry="8" fill="#fff" opacity=".85"/><path d="M0 88 Q80 62 160 84 T320 76 V130 H0Z" fill="'+a[0]+'"/><rect y="100" width="320" height="30" fill="'+a[0]+'"/>';
 for(let i=0;i<n;i++)b+=T(20+i*(280/Math.max(1,n-1)),68+(i%2)*8,13+(i%3)*2);
 m.mons.forEach((k,i)=>b+='<text x="'+(50+i*56)+'" y="122" font-size="22">'+MON[k].i+'</text>');
 return '<svg viewBox="0 0 320 130" role="img" aria-label="'+m.n+'" style="width:100%;display:block;border-radius:8px;margin-bottom:8px">'+b+'</svg>'};
const R=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
let lootOpen=false,seeking=false,seekAuto=false,autoSeek=false,autoT=0,selNpc=null,talk=null,cview=null,feat=null,P=null,ptab='use',sel=null,resetArm=false,inShop=false,enc=null,tab='play',lastAtk=0,lastPot=0,qEdit=false,qPick=null,lastRegen=Date.now(),logs=[],ltab='all',lastDR=0,lootAsk=false,autoLoot='kill';
let qtab='prog',qsel=null,qgive=null;
function newChar(name,st){return{name,lvl:1,exp:0,ap:0,str:st.str,dex:st.dex,int:st.int,luk:st.luk,hp:50,mp:5,maxHp:50,maxMp:5,mesos:0,map:'mushroom_west',q:{},qp:{},qk:0,sk:{three:0,rec:0,feet:0},sp:0,b:{},kills:0,cleared:{},weapon:'sword',eq:{},pq:['red_potion',null],inv:{red_potion:3}}}
function save(){if(!P)return;try{LS.setItem('mapleish_c'+SLOT,JSON.stringify(P));LS.setItem('mapleish_last',SLOT)}catch(e){}}
const OLD={"crawler_shell": "snail_shell", "moss_spore": "mushroom_spore", "azure_shell": "blue_snail_shell", "bark_chip": "red_snail_shell", "gel_blob": "slime_bubble", "boar_tusk": "orange_mushroom_cap", "training_blade": "sword", "longblade": "long_sword", "snail_hg1": "snail_hunting_ground_1", "snail_hg2": "snail_hunting_ground_2", "field_west": "field_west_of_amherst", "field_east": "field_east_of_amherst", "split_road": "a_split_road"};function migrate(){if(!P)return;if(!P.eq)P.eq={};if(OLD[P.map])P.map=OLD[P.map];if(OLD[P.weapon])P.weapon=OLD[P.weapon];for(const o of ['inv','cleared'])if(P[o])for(const k in OLD)if(k in P[o]){P[o][OLD[k]]=(P[o][OLD[k]]||0)+P[o][k];delete P[o][k]}}
function load(){try{const s=LS.getItem('mapleish_c'+SLOT);if(s)P=JSON.parse(s);migrate();if(P&&!MAPS[P.map])P.map='mushroom_town';if(P&&!P.qp){P.qp={};P.q={}}if(P&&P.inst)instReg();if(P)for(const k in P.inv)if(!ITEMS[k])delete P.inv[k];if(P&&!P.q){P.q={pest:'done'};P.qk=0}if(P&&!P.pq)P.pq=['red_potion',null];if(P&&!P.sk){P.sk={three:0,rec:0,feet:0};P.sp=Math.max(0,Math.min(9,P.lvl-1));P.b={}}}catch(e){}}
function log(t,c,k){logs.push([t,c||'',k||'gen']);if(logs.length>300)logs.shift()}
const FIST={n:'Bare Hands',i:'\u270A',w:1,watk:8,spd:800,mult:3.0,req:0};
/* Equipment your current class cannot use stays equipped but is greyed out: it adds no stats, defense or attack, and other players do not see it. */
function eqOk(id){const b=id&&(ITEMS[typeof baseOf==='function'?baseOf(id):id]||ITEMS[id]);if(!b)return false;const j=P&&P.job;
 if(b.pj&&!b.pj.includes(j||'beginner'))return false;
 if(!b.w)return true;
 if(b.rng==='claw')return j==='rogue';
 if(b.rng==='bow'||b.rng==='xbow')return j==='archer';
 if(b.mw)return j==='magician';
 if(b.rng==='gun'||b.ty==='gun'||b.ty==='knuckle')return j==='pirate';
 return true}
function publicGear(){const eq={};for(const k in(P.eq||{}))if(eqOk(P.eq[k]))eq[k]=P.eq[k];return{w:eqOk(P.weapon)?P.weapon:null,eq}}
const W=()=>(P&&P.weapon&&eqOk(P.weapon)?ITEMS[P.weapon]:null)||FIST;
let pop=null,skPage=0,shopTab='buy',shopSel=null,shopQty=1,viewPlayer=null,viewPEq=false,viewMe=false;
const DESC={apple:'A crisp, juicy apple.',egg:'A boiled egg. Filling and tasty.',red_potion:'A red potion that restores a good amount of HP.',sword:'A plain one-handed sword for beginners.',hand_axe:'A light one-handed axe that hits a little harder.',wooden_club:'A sturdy club with a slightly slower swing.',long_sword:'A well-made sword for seasoned adventurers.'};

const TIERS=[1,5,10,15,20],DEFB=[2,5,9,14,20],ACCB=[1,2,4,6,9],PRICE=[60,300,1200,4000,12000],MAT=['Cloth','Leather','Iron','Steel','Mithril'],AMAT=['Wooden','Copper','Silver','Gold','Crystal'];
const ARMOR=['Hat','Top','Bottom','Gloves','Shoes','Cape','Shield'],ACC=['Face','Eyes','Earring','Ring'],CATS=['Use','Weapons','Armor','Accessories'];
const GEAR=[['Hat','Cap','\u{1F9E2}',1,0],['Top','Tunic','\u{1F455}',1.5,0],['Bottom','Pants','\u{1F456}',1.2,0],['Gloves','Gloves','\u{1F9E4}',.5,0],['Shoes','Boots','\u{1F462}',.7,0],['Cape','Cape','\u{1F9E3}',.6,0],['Shield','Shield','\u{1F6E1}\uFE0F',1.2,0],
 ['Face','Mask','\u{1F3AD}',0,'luk'],['Eyes','Glasses','\u{1F453}',0,'dex'],['Earring','Earrings','\u{1F4FF}',0,'int'],['Ring','Ring','\u{1F48D}',0,'str']];
GEAR.forEach(g=>TIERS.forEach((lv,t)=>{const id=g[0].toLowerCase()+'_'+lv;
 ITEMS[id]={n:(g[4]?AMAT:MAT)[t]+' '+g[1],i:g[2],s:g[0],req:lv===1?0:lv,buy:Math.round(PRICE[t]*(g[4]?1.5:g[3]>1?1.5:1)),def:g[4]?0:Math.max(1,Math.round(DEFB[t]*g[3])),bon:g[4]?{[g[4]]:ACCB[t]}:null};
 DESC[id]=g[4]?'A '+AMAT[t].toLowerCase()+' '+g[1].toLowerCase()+' that sharpens your '+g[4].toUpperCase()+'.':'A '+MAT[t].toLowerCase()+' '+g[1].toLowerCase()+' that '+(lv>1?'suits adventurers of level '+lv+'.':'keeps new adventurers safe.')}));
[['broad_sword','Broadsword','\u2694\uFE0F',38,720,4.0,15,9000,'A broad, balanced blade.'],['knights_blade','Knight\'s Blade','\u2694\uFE0F',50,700,4.0,20,30000,'A sword fit for a knight.'],
 ['iron_axe','Iron Axe','\u{1FA93}',25,740,4.4,8,1500,'A well-forged iron axe.'],['war_axe','War Axe','\u{1FA93}',37,740,4.4,15,9000,'A heavy axe built for battle.'],['great_axe','Great Axe','\u{1FA93}',48,760,4.4,20,28000,'A massive two-bladed axe.'],
 ['spiked_club','Spiked Club','\u{1F528}',28,760,4.4,8,1500,'A club studded with iron spikes.'],['iron_mace','Iron Mace','\u{1F528}',40,760,4.4,15,9500,'A sturdy iron mace.'],['war_hammer','War Hammer','\u{1F528}',52,780,4.4,20,30000,'A crushing war hammer.']
].forEach(w=>{ITEMS[w[0]]={n:w[1],i:w[2],w:1,watk:w[3],spd:w[4],mult:w[5],req:w[6],buy:w[7]};DESC[w[0]]=w[8]});
/* Data-driven drops: Cosmic v83 tables (chance/1e6), quest-only and unsupported item kinds skipped. Set USE_DATA_DROPS=false for the old 55%/8% logic. */
const USE_DATA_DROPS=true;
const DROPS={"snail":{"m":[0.4,4,6],"i":[["snail_shell",0.6,1,1],["red_potion",0.02,1,1],["i4010000",0.009,1,1],["i4020000",0.009,1,1],["sword",0.0007,1,1]]},"blue_snail":{"m":[0.4,8,12],"i":[["blue_snail_shell",0.6,1,1],["red_potion",0.02,1,1],["i4020001",0.009,1,1],["i4010001",0.009,1,1],["i4030012",0.125,1,1],["i4020004",0.007,1,1],["i4010004",0.007,1,1]]},"shroom":{"m":[0.4,8,12],"i":[["mushroom_spore",0.6,1,1],["red_potion",0.02,1,1],["i4020002",0.009,1,1],["i4010002",0.009,1,1],["hand_axe",0.0007,1,1]]},"red_snail":{"m":[0.4,12,18],"i":[["red_snail_shell",0.6,1,1],["red_potion",0.02,1,1],["i4010004",0.009,1,1],["i4020004",0.009,1,1],["sword",0.0007,1,1]]},"orange_mushroom":{"m":[0.4,16,24],"i":[["orange_mushroom_cap",0.6,1,1],["red_potion",0.02,1,1],["i4010000",0.009,1,1],["i4020007",0.009,1,1],["i4030001",0.01,1,1]]}};
(function(){const N={"i4010000":{"n":"Bronze Ore","i":"⛏️","sell":100,"d":"The ore of a light and weak bronze."},"i4020000":{"n":"Garnet Ore","i":"⛏️","sell":150,"d":"The ore of a red jewel."},"i4020001":{"n":"Amethyst Ore","i":"⛏️","sell":150,"d":"The ore of a purple jewel."},"i4010001":{"n":"Steel Ore","i":"⛏️","sell":100,"d":"The ore of a tough steel"},"i4030012":{"n":"Monster Card","i":"🃏","sell":1,"d":"The monster cards needed for the game of Match Cards. Need to have plenty of cards."},"i4020004":{"n":"Opal Ore","i":"⛏️","sell":150,"d":"The ore of a jewel with many colors."},"i4010004":{"n":"Silver Ore","i":"⛏️","sell":150,"d":"The ore of a shiny silver"},"i4020002":{"n":"AquaMarine Ore","i":"⛏️","sell":150,"d":"The ore of a blue jewel."},"i4010002":{"n":"Mithril Ore","i":"⛏️","sell":150,"d":"The ore of a light, solid Mithril."},"i4020007":{"n":"Diamond Ore","i":"⛏️","sell":300,"d":"The ore of a jewel that's transparent."},"i4030001":{"n":"Omok Piece : Mushroom","i":"⚫","sell":1,"d":"A mushroom-shaped Omok piece to play Omok."}};for(const k in N){const x=N[k];ITEMS[k]={n:x.n,i:x.i,sell:x.sell};if(x.d)DESC[k]=x.d}})();
/* Ground loot: drops wait 5 minutes on the map where they fell, lootable outside combat. */
const DROP_MS=300000;
function addDrop(id,q){const g=P.gd||(P.gd=[]);
 P.gu=(P.gu||0)+1;
g.push({u:P.gu,id,q,map:P.map,exp:Date.now()+DROP_MS});if(id!=='meso')log('Dropped: '+ITEMS[id].n+(q>1?' x'+q:''),'good','items')}
function dropsHere(){const now=Date.now();return(P.gd||[]).filter(g=>!g.r&&g.map===P.map&&g.exp>now)}
function purgeDrops(){if(!P||!P.gd||!P.gd.length)return;const now=Date.now(),n=P.gd.length;P.gd=P.gd.filter(g=>{if(g.exp>now)return true;log('The '+ITEMS[g.id].n+(g.q>1?' x'+g.q:'')+' on the ground vanished.','','items');return false});if(P.gd.length!==n)save()}
function collectRun(){const run=P.gd.filter(g=>g.r);if(!run.length)return;P.gd=P.gd.filter(g=>!g.r);run.forEach(lootTake);log('Auto-hunt ended. Looted '+run.length+' drop'+(run.length>1?'s':'')+'.','good','items');save();render()}
function lootAskHtml(){return'<div class="intro"><div class="mcard"><div class="mh"><span class="mi">🎒</span><div><b>Auto-hunt loot style</b><div class="mute">How should drops be picked up?</div></div></div><p><b>After each kill</b>: every drop goes straight into your inventory.</p><p><b>At the end</b>: drops are held while you grind, then all looted when auto-hunt stops.</p><div class="ex"><button class="main" id="la_kill">After each kill</button><button class="main" id="la_end">At the end</button><button id="la_x">Cancel</button></div></div></div>'}
function lootTake(g){if(g.id==='meso'){P.mesos+=g.q;log('You pick up '+g.q+' mesos.','good','items');return}P.inv[g.id]=(P.inv[g.id]||0)+g.q;log('You pick up '+ITEMS[g.id].n+(g.q>1?' x'+g.q:'')+'.','good','items')}
function lootOne(u){purgeDrops();const i=(P.gd||[]).findIndex(g=>g.u===u&&g.map===P.map);if(i>=0){lootTake(P.gd.splice(i,1)[0]);save()}render()}
function lootAll(){purgeDrops();const mine=dropsHere();P.gd=(P.gd||[]).filter(g=>!mine.includes(g));mine.forEach(lootTake);save();render()}
function lootPanel(){const d=dropsHere(),now=Date.now();if(!d.length)return'';const t=g=>{const s=Math.max(0,Math.ceil((g.exp-now)/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
 const tg='<button id="lootTg" style="width:100%;display:flex;justify-content:space-between;align-items:center"><span>🎒 Loot ('+d.length+')</span><span>'+(lootOpen?'▾':'▸')+'</span></button>';
 if(!lootOpen)return'<div class="panel" id="loot" data-ln="'+d.length+'" style="padding:6px;margin-top:-4px">'+tg+'</div>';
 return'<div class="panel" id="loot" data-ln="'+d.length+'" style="padding:6px;margin-top:-4px">'+tg+'<div class="lgb" style="height:auto;max-height:180px;margin-top:6px;padding:0 4px">'+d.map(g=>'<div class="row" style="padding:3px 0;align-items:center"><span>'+ITEMS[g.id].i+' '+ITEMS[g.id].n+(g.q>1?' x'+g.q:'')+' <span class="mute" data-lx="'+g.u+'">'+t(g)+'</span></span><button data-lp="'+g.u+'" style="min-height:32px;padding:2px 12px">Loot</button></div>').join('')+'</div><div class="ex"><button class="main" id="lootall">Loot all</button></div></div>'}
function dropLoot(k,d){const t=DROPS[k];if(!USE_DATA_DROPS||!t){if(Math.random()<.55*dropRate()){addDrop(d.e,1)}if(Math.random()<.08*dropRate()){addDrop('red_potion',1)}return}
 for(const e of t.i){if(Math.random()<e[1]*dropRate()){const q=R(e[2],e[3]);addDrop(e[0],q)}}}
const slotOf=id=>ITEMS[id].w?'Weapon':ITEMS[id].s;
const eqOf=x=>x==='Weapon'?P.weapon:(P.eq||{})[x];
const gearSpd=()=>[P.weapon].concat(Object.values(P.eq||{})).filter(eqOk).reduce((a,id)=>a+((id&&ITEMS[id]&&ITEMS[id].x&&ITEMS[id].x.speed)||0),0);/* equipment Speed (v2.6) */
const gearBon=k=>[P.weapon].concat(Object.values(P.eq||{})).filter(eqOk).reduce((a,id)=>a+((ITEMS[id]&&ITEMS[id].bon&&ITEMS[id].bon[k])||0),0);
const eS=k=>P[k]+gearBon(k);
const defTotal=()=>Object.values(P.eq||{}).filter(eqOk).reduce((a,id)=>a+((ITEMS[id]&&ITEMS[id].def)||0),0)+((P.b&&P.b.iron>Date.now())?(P.b.ironv|0):0)+((P.b&&P.b.marm>Date.now())?(P.b.marmv|0):0)+(typeof seDef==='function'?seDef():0);/* seDef: 2nd job buffs (v3.2) */
const defRed=()=>{const d=defTotal();return Math.min(.7,d/(d+80))};
let shopConfirm=false,introOpen=false;
function equipItem(id){const it=ITEMS[id];if(!it||!(it.w||it.s)||!(P.inv[id]>0))return;if(P.lvl<it.req)return log('You need to be level '+it.req+' to use this.','bad','items');
 const sl=slotOf(id),cur=eqOf(sl);if(cur)P.inv[cur]=(P.inv[cur]||0)+1;P.inv[id]--;if(P.inv[id]<=0)delete P.inv[id];
 if(sl==='Weapon')P.weapon=id;else{P.eq=P.eq||{};P.eq[sl]=id}log('You equip the '+it.n+'.','good','items');save()}
function unequipItem(sl){const cur=eqOf(sl);if(!cur)return;P.inv[cur]=(P.inv[cur]||0)+1;log('You unequip the '+ITEMS[cur].n+'.','','items');if(sl==='Weapon')P.weapon=null;else delete P.eq[sl];save()}
const SLOTS=['Hat','Face','Eyes','Earring','Top','Cape','Weapon','Shield','Bottom','Gloves','Shoes','Ring'];
function eqDoll(){return '<div class="doll">'+SLOTS.map(x=>{const eid=eqOf(x);if(eid){const it=ITEMS[eid];return '<button class="eqs'+(eqOk(eid)?'':' off')+'" data-eqs="'+x+'"'+(eqOk(eid)?'':' title="Your class cannot use this item"')+'><span>'+it.i+'</span><small>'+it.n+'</small></button>'}return '<div class="emp"><small>'+x+'</small></div>'}).join('')+'</div>'}
function popHtml(){if(!pop)return '';const it=ITEMS[pop.id];if(!it){pop=null;return ''}const n=P.inv[pop.id]||0;let rows,btn='';
 if(it.w||it.s){rows=itemRows(pop.id).concat([['Owned',n]]);btn=pop.eq?'<button class="main" data-pa="unequip">Unequip</button>':'<button class="main" data-pa="equip"'+(P.lvl<it.req?' disabled':'')+'>Equip</button>'}
 else if(it.heal||it.mpheal||it.hpp||it.mpp){rows=[['Type','Consumable'],['Restores',[it.heal?it.heal+' HP':'',it.hpp?it.hpp+'% HP':'',it.mpheal?it.mpheal+' MP':'',it.mpp?it.mpp+'% MP':''].filter(Boolean).join(', ')],['Owned',n]];btn='<button class="main" data-pa="use">Use</button>'+[0,1].map(i=>'<button data-pa="s'+i+'">'+(P.pq[i]===pop.id?'Clear slot ':'Set slot ')+(i+1)+'</button>').join('')}
 else rows=[['Type','Etc'],['Sell price',it.sell+' mesos'],['Owned',n]];
 return '<div class="mcard"><div class="mh"><span class="mi">'+it.i+'</span><div><b>'+it.n+'</b><div class="mute">'+(DESC[pop.id]||'A monster drop. Sell it at a shop.')+'</div></div></div>'+rows.map(r=>'<div class="mr"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('')+(pop.eq&&!eqOk(pop.id)?'<div class="mute" style="margin-top:8px;color:#b0562f">Your class cannot use this item. It stays equipped but gives no bonuses, and other players cannot see it.</div>':'')+'<div class="ex" style="margin-top:10px">'+btn+'<button data-pa="close">Close</button></div></div>'}
const acc=()=>(eS('dex')*1.2+P.lvl*2+eS('luk')*.6+accBonus())/2.5+5;
const avoid=()=>Math.floor(eS('luk')/3)+Math.floor(eS('dex')/6)+5+avBonus();
function dmgRange(){const mx=wMax();return[Math.max(1,Math.floor(mx*.6)),Math.max(1,mx)]}
/* v3.2: EXP rate set by an admin (Admin menu -> EXP rate, 1-1000). Stored in the shared record mapleish_rates with the admin's scrolling notice. */
/* {exp: 1-1000, msg: the admin's scrolling notice} */
function worldCfg(){try{const o=JSON.parse(LS.getItem('mapleish_rates'));return o&&typeof o==='object'?o:{}}catch(e){return{}}}
/* Hot-time (admin scheduled EXP/drop boosts, up to 24): {name, exp, drop, date 'YYYY-MM-DD', time 'HH:MM' (California time),
   hours, repeat 'none'|'daily'|'weekly', on}. Times are compared as California wall-clock time. */
const pacWall=t=>{try{const o={};new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(t)).forEach(x=>o[x.type]=x.value);return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour%24,+o.minute)}catch(e){return t-7*3600e3}};
function hotState(h,now){/* -> {on:bool, ends:wall ms} */const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(h&&h.date||''),tm=/^(\d\d?):(\d\d)$/.exec(h&&h.time||'');if(!h||!h.on||!m||!tm)return{on:false};
 const s=Date.UTC(+m[1],+m[2]-1,+m[3],+tm[1],+tm[2]),len=Math.max(0,+h.hours||0)*3600e3,w=pacWall(now||Date.now()),per=h.repeat==='daily'?864e5:h.repeat==='weekly'?6048e5:0;
 let st=s;if(per&&w>=s)st=s+Math.floor((w-s)/per)*per;return w>=st&&w<st+len?{on:true,ends:st+len,wall:w}:{on:false}}
const hotList=()=>(Array.isArray(worldCfg().hot)?worldCfg().hot:[]).slice(0,24);
const hotNow=()=>hotList().filter(h=>hotState(h).on);
const clampR=v=>{v=Math.floor(+v);return v>=1&&v<=1000?v:1};
function expBase(){return clampR(worldCfg().exp)}function dropBase(){return clampR(worldCfg().drop)}
/* effective rates: the base rate times the biggest active hot-time boost */
function expRate(){return Math.min(100000,expBase()*hotNow().reduce((a,h)=>Math.max(a,clampR(h.exp)),1))}
function dropRate(){return Math.min(100000,dropBase()*hotNow().reduce((a,h)=>Math.max(a,clampR(h.drop)),1))}
const XR=x=>Math.round((x||0)*expRate());
function gain(x){if(P.lvl>=MAXL)return;x=XR(x);P.exp+=x;
 while(P.lvl<MAXL&&P.exp>=EXP[P.lvl-1]){P.exp-=EXP[P.lvl-1];P.lvl++;P.ap+=5;if(P.job)P.sp+=3;else if(P.lvl<=7)P.sp++;P.maxHp+=R(12,16)+(P.job==='swordsman'?4*((P.sk&&P.sk.mhp)|0):0);P.maxMp+=R(10,12)+(P.job==='magician'?2*((P.sk&&P.sk.mmp)|0):0);P.hp=P.maxHp;P.mp=P.maxMp;
  log('LEVEL UP! You are now level '+P.lvl+'. +5 AP'+(P.lvl<=10?', +1 SP':'')+'.','good');if(P.lvl==10)log('A new path opens at level 10. Job classes are coming soon.','good')}
 if(P.lvl>=MAXL)P.exp=0}
function seek(){const m=MAPS[P.map];if(m.town||enc)return;const k=m.mons[R(0,m.mons.length-1)],d=MON[k];
 enc={k,hp:d.hp,max:d.hp,gap:R(0,3),mv:Date.now()+mvT(d),next:Date.now()+d.iv+R(-200,200)};log('A '+d.n+' (Lv '+d.lv+') appears.','','combat')}
function attack(){if(!enc)return;const now=Date.now();if(now<atkReady()||now-lastMv<moveCd())return;if(enc.gap>wReach()){log('The '+MON[enc.k].n+' is out of reach.','','combat');return render()}lastAtk=now;const d=MON[enc.k];
 const ch=Math.min(1,Math.max(.35,.8+(acc()-d.av)/50));
 if(Math.random()>ch){log('You miss the '+d.n+'.','','combat');}else{const r=dmgRange(),x=critRoll(R(r[0],r[1]));enc.hp-=x;log('You '+hitVerb()+' the '+d.n+' for '+x+'.','hit','combat')}
 if(enc.hp<=0)win();render()}
/* Standing: lane gap 0-3 between you and the monster. Weapon reach defaults to 0 (melee). */
/* v2.6: monsters step by their own Speed from the data (v62: walk speed = 100 + speed %). A Speed 0 monster crosses one
   column every 2.4 s (v3.2; it was 1.4 s); a Snail (-65) about every 7 s. Old monsters without data keep the old pace. */
const MOB_STEP=2400;const mvT=d=>Math.round(MOB_STEP*100/Math.max(25,100+((d&&d.spd)|0)));/* v3.2: slower (2.4 s per column at Speed 0) and the same rule for monsters without data */
function hitVerb(){const n=W().n||'';if(/sword|blade/i.test(n))return Math.random()<.5?'stab':'swing at';if(/axe|club|mace|hammer/i.test(n))return 'swing at';return 'hit'}
let lastMv=0,lastDur=810;const atkReady=()=>lastAtk+lastDur;/* each action sets lastDur to its own time (52-v2.6-timing.js) */const moveCd=()=>Math.round(720*100/speed());/* steps are paced by Speed only (v2.6); attacks by the weapon/skill animation time */
function stand(dir){if(!enc)return;const now=Date.now(),mc=moveCd();if(now-lastAtk<mc||now-lastMv<mc)return;const d=MON[enc.k];
 if(dir<0){if(enc.gap<=0)return;lastMv=now;enc.gap--;log('You advance on the '+d.n+'.','','combat');if(enc.gap<=0)enc.next=now+d.iv}
 else{if(enc.gap>=3)return;lastMv=now;if(Math.random()<Math.min(.9,Math.max(.25,.5+(speed()-100)/100))){enc.gap++;enc.mv=now+mc*2+mvT(d);lastMv=now-Math.floor(mc/2);log('You back away from the '+d.n+'.','','combat')}else log('You stumble and fail to back away.','bad','combat')}
 render()}
function laneHtml(){const d=MON[enc.k];let c='';for(let i=0;i<5;i++){const me=i===0,mo=i===enc.gap+1;c+='<div style="flex:1;text-align:center;font-size:22px;padding:4px 0;border-left:'+(i?'1px dashed #b9c4d6':'0')+'">'+(me?'🧍':mo?d.i:'')+'</div>'}
 return '<div style="margin-top:8px"><div style="display:flex;background:rgba(120,140,180,.12);border-radius:8px">'+c+'</div><div class="mute" style="margin-top:4px">'+(enc.gap<=0?'Face to face':'Distance '+enc.gap)+' · reach '+wReach()+'</div></div>'}
function win(){const d=MON[enc.k],m=MAPS[P.map];for(const id in QD){const d=QD[id];if(P.q[id]==='active'&&d.type==='kill'&&d.mon===enc.k&&(P.qp[id]||0)<d.cnt)P.qp[id]=(P.qp[id]||0)+1;if(P.q[id]==='active'&&d.type==='kill'&&d.mk){const t=d.mk.find(x=>x[0]===enc.k);if(t){const kk=id+'|'+enc.k;if((P.qp[kk]||0)<t[1])P.qp[kk]=(P.qp[kk]||0)+1}}}const dm=USE_DATA_DROPS&&DROPS[enc.k]&&DROPS[enc.k].m,me=dm?(Math.random()<dm[0]?R(dm[1],dm[2]):0):R(d.m[0],d.m[1]);if(me)addDrop('meso',me);/* v3.5: mesos drop like items */
 log('The '+d.n+' falls. +'+XR(d.exp)+' EXP'+(me?' and drops '+me+' mesos.':'.'),'good','combat');gain(d.exp);
 dropLoot(enc.k,d);
 if(!isOpen(P.map)){P.kills++;if(P.kills>=needFor(m)){P.cleared[P.map]=1;P.kills=0;log(m.n+' cleared. The exits are open until you leave.','good','combat')}}
 window._dead=enc;enc=null;onKill();save()}
function potion(){useItem('red_potion')}
function die(){if(HC())return hcDie();const m=MAPS[P.map];log('You were defeated.','bad','combat');if(P.lvl>=10)P.exp=Math.max(0,P.exp-Math.floor(EXP[P.lvl-1]*.05));
 enc=null;P.b={};P.map=m.ret;autoSeek=false;seeking=false;clearTimeout(autoT);inShop=false;talk=null;selNpc=null;P.hp=Math.max(1,Math.floor(P.maxHp/2));P.kills=0;log('You wake in '+MAPS[P.map].n+' at half HP.','','combat');save()}
function flee(){if(!enc)return;if(Math.random()<.7){enc=null;autoSeek=false;seeking=false;log('You slip away safely.','','combat')}else{log('You couldn\'t get away!','bad','combat')}render()}
function go(to){if(enc||inShop||talk)return;const cur=MAPS[P.map];const gx=cur.ex.find(x=>x[0]===to);if(!gx||(gx[2]&&P.q[gx[2]]!=='done'))return;if(!cur.town&&!isOpen(P.map)&&to!==cur.ex[0][0]){return}
 log('You travel to '+MAPS[to].n+'.');P.map=to;P.kills=0;autoSeek=false;seeking=false;clearTimeout(autoT);selNpc=null;talk=null;save();render()}
function spend(s){if(P.ap<1)return;P.ap--;P[s]++;save();render()}
setInterval(()=>{if(!P)return;const now=Date.now();purgeDrops();if(!autoSeek&&P.gd&&P.gd.some(g=>g.r))collectRun();if(P.b.rec>now&&now>=recNext){recNext=now+2000;recFrac+=[24,48,72][P.sk.rec-1]/15;const rh=Math.floor(recFrac);recFrac-=rh;P.hp=Math.min(P.maxHp,P.hp+rh);if(!inShop)render()}const hb=P.b.rec>now||P.b.feet>now||P.b.iron>now||P.b.focus>now||P.b.dark>now||P.b.guard>now||P.b.marm>now;if((hb||hadBuff)&&now-lastBuffR>=1000){lastBuffR=now;hadBuff=hb;render()}
 mobsTick(now);
 if(tab==='play'&&now-lastDR>=1000){lastDR=now;const ds=dropsHere();const lo=document.getElementById('loot');if((lo?+lo.dataset.ln:0)!==ds.length&&!inShop&&!talk)render();else ds.forEach(g=>{const e=document.querySelector('[data-lx="'+g.u+'"]');if(e){const sc=Math.max(0,Math.ceil((g.exp-now)/1000));e.textContent=Math.floor(sc/60)+':'+String(sc%60).padStart(2,'0')}})}
 if(!enc&&now-lastRegen>=5000){lastRegen=now;if(P.hp<P.maxHp||P.mp<P.maxMp){P.hp=Math.min(P.maxHp,P.hp+Math.max(1,Math.floor(P.maxHp*.02)));P.mp=Math.min(P.maxMp,P.mp+Math.max(1,Math.floor(P.maxMp*.03)));if(!inShop)render()}}
 if(enc){const lm=Math.max(lastAtk,lastMv)+moveCd()-now;['adv','bk'].forEach(i=>{const e=document.getElementById(i);if(e)e.disabled=lm>0})}skTick(now);},100);
setInterval(()=>{if(P)save()},30000);
function resetChar(){if(!resetArm){resetArm=true;return render()}resetArm=false;P=null;scr='chars';delArm=false;pop=null;tab='play';feat=null;cview=null;introOpen=false;enc=null;inShop=false;talk=null;selNpc=null;logs=[];rollSt=null;try{LS.removeItem('mapleish_c'+SLOT)}catch(e){}render()}
const NPCS={
 heena:{n:'Heena',i:'👩',role:'Villager',hi:'Oh, hello! Welcome to Mushroom Town.',tip:['How do quests work?','People with a ! have a job for you. Take the quest, do the goal, then talk to the right person to hand it in. Open the Quests tab to see your log and choose which quests to track.']},
 sera:{n:'Sera',i:'🪞',role:'Villager',hi:'Hello, traveler. Heena mentioned you might stop by.'},
 roger:{n:'Roger',i:'🧓',role:'Teacher',hi:'Hey there! Want to learn how items work?',tip:['How do items work?','Open the Inventory tab to see items sorted by type. Tap one to inspect it, and press Use on a potion or food to restore HP, or set it to one of your two potion slots for quick use in a fight.']},
 nina:{n:'Nina',i:'👧',role:'Training Camp',hi:'Hi! Sen is so hungry, and I am not allowed to leave camp.'},
 todd:{n:'Todd',i:'🧑',role:'Hunter',hi:'Ready to learn how to hunt?',tip:['How do I fight?','Press Start Combat, then tap the Attack slot in your quickslots. Enemies strike back on their own timer, so watch your HP and drink a Red Potion when it runs low. You can always Flee.']},
 sam:{n:'Sam',i:'🧔',role:'Snail Hunting Ground',hi:'Plenty of Snails around. Good practice for a beginner.'},
 maria:{n:'Maria',i:'👩',role:'A Split Road',hi:'The road splits here. Left goes to the Snail grounds, right to the fields and Amherst.',tip:['How do I travel?','Use the map. In fields, forward exits unlock once you have defeated enough enemies, or right away if you are 25 levels above the toughest monster there. The unlock resets when you leave. Towns are always open.']},
 lucas:{n:'Lucas',i:'🎩',role:'Amherst town chief',hi:'Welcome to Amherst, the island\'s main town.'},
 rain:{n:'Rain',i:'🧒',role:'Quiz master',hi:'I love Maple quizzes! Care to test your knowledge?'},
 sid:{n:'Sid',i:'🧑',role:'Weapon seller',shop:1,hi:'Looking for a weapon? I have a few good ones. Potions too.'},
 biggs:{n:'Biggs',i:'🧑',role:'Collector',hi:'Southperry is the island\'s port. I collect items from travelers.'},
 vasily:{n:'Vasily',i:'⚓',role:'Ferry operator',hi:'The ferry to Victoria Island is not sailing in this test build.'}};
const QD={
 roger:{n:"Roger's Apple",giver:'roger',lvl:1,type:'use',give:{apple:1},rw:{exp:10},goal:'Eat the Apple he gives you (Inventory tab, Use).'},
 mirror:{n:"Borrowing Sera's Mirror",giver:'heena',turn:'sera',lvl:1,type:'talk',rw:{},goal:'Ask Sera, on the hill to the east, for Heena\'s mirror.'},
 mirror2:{n:'Bringing a Mirror to Heena',giver:'sera',turn:'heena',pre:'mirror',lvl:1,type:'talk',rw:{exp:1},goal:'Take the mirror back to Heena.'},
 nina:{n:'What Sen Wants to Eat',giver:'nina',turn:'sen',lvl:1,type:'talk',rw:{},goal:'Ask Nina\'s little brother Sen what he wants for dinner.'},
 nina2:{n:'Returning to Nina',giver:'sen',turn:'nina',pre:'nina',lvl:1,type:'talk',rw:{exp:3},goal:'Tell Nina that Sen wants mushroom soup.'},
 todd:{n:"Todd's How-to-Hunt",giver:'todd',turn:'peter',lvl:1,type:'collect',col:[['jr_sentinel_shellpiece',1]],rw:{exp:10},goal:'Defeat 1 Tutorial Jr. Sentinel, pick up its Jr. Sentinel Shellpiece and give it to Peter.'},
 sam:{n:"Sam's Suggestion",giver:'sam',turn:'mai',lvl:1,type:'kill',mon:'snail',cnt:10,rw:{exp:30},goal:'Defeat 10 Snails, then go and see Mai on A Split Road.'},
 letter:{n:'Letter for Lucas',giver:'maria',turn:'lucas',lvl:2,type:'talk',rw:{},goal:'Deliver Maria\'s letter to Lucas, the chief of Amherst.'},
 reply:{n:"Lucas's Reply",giver:'lucas',turn:'maria',pre:'letter',lvl:2,type:'talk',rw:{exp:10,rand:['brown_skullcap','green_skullcap','red_headband','black_headband','green_headband','yellow_headband','blue_headband']},goal:'Take Lucas\'s reply back to Maria on A Split Road.'},
 biggs:{n:"Biggs's Collection of Items",giver:'biggs',lvl:3,type:'collect',col:[['blue_snail_shell',30],['orange_mushroom_cap',10]],rw:{exp:30,rand:['razor','razor','fruit_knife']},goal:'Collect 30 Blue Snail Shells and 10 Orange Mushroom Caps.'},
 rain:{n:"Rain's Maple Quiz",giver:'rain',lvl:5,type:'quiz',rw:{},goal:'Answer 7 questions.'}};
const QUIZ=[['How do you travel from one map to the next?',['Tap an exit button on the Play tab','Press the Up arrow key','Double-click the ground','Type a command in chat'],0],['Which tab shows the items you are carrying?',['Cash','Quests','Inventory','Character'],2],['Where do you spend your Ability Points (AP)?',['Character tab','Inventory tab','Quests tab','Cash tab'],0],['How can you recover HP?',['Equip a hat','Use a Red Potion, an Apple or an Egg','Open the Quests tab','Give up a quest'],1],['Warriors, Bowmen, and Thieves must be at least level 10 to advance. What level must a Magician be to advance?',['Level 8','Level 10'],0],['Do you know how much AP you get with each level?',['1 point','2 points','5 points'],2],['This is important! You can only make the job advancement at Victoria Island, but you\'re currently on Maple Island. Where do you go to get a ride to Victoria Island?',['Southperry','Amherst','No way I can get there!'],0]],QX=[2,2,6,10,10,10,22];
const qAvail=id=>{const d=QD[id];return !P.q[id]&&P.lvl>=d.lvl&&(!d.max||P.lvl<d.max)&&(!d.pre||P.q[d.pre]==='done')};
function qReady(id){const d=QD[id],p=P.qp[id]||0;if(P.q[id]!=='active')return false;
 if(d.type==='kill')return d.mk?d.mk.every(x=>(P.qp[id+'|'+x[0]]||0)>=x[1]):p>=d.cnt;if(d.type==='collect')return d.col.every(c=>(P.inv[c[0]]||0)>=c[1]);
 if(d.type==='use')return p>=1;if(d.type==='quiz')return p>=7;return !d.via||p>=1}
function qProg(id){const d=QD[id],p=P.qp[id]||0;if(d.type==='kill')return d.mk?d.mk.map(x=>Math.min(P.qp[id+'|'+x[0]]||0,x[1])+'/'+x[1]+' '+MON[x[0]].n+'s').join(', '):p+'/'+d.cnt+' '+MON[d.mon].n+'s';
 if(d.type==='collect')return d.col.map(c=>Math.min(P.inv[c[0]]||0,c[1])+'/'+c[1]+' '+ITEMS[c[0]].n).join(', ');
 if(d.type==='quiz')return p+'/7 answered';return qReady(id)?'Ready to hand in':d.goal}
const QMAX=5;
function qLoc(n){for(const k in MAPS)if((MAPS[k].npcs||[]).includes(n))return MAPS[k].n;return ''}
function qTrk(){if(!P.trk)P.trk=Object.keys(QD).filter(i=>P.q[i]==='active').slice(0,QMAX);P.trk=P.trk.filter(i=>QD[i]&&P.q[i]==='active');return P.trk}
function qReadyN(){return Object.keys(QD).filter(i=>P.q[i]==='active'&&qReady(i)).length}
function tbd(n){return n?'<i class="tbd">'+n+'</i>':''}
function qObj(id){const d=QD[id],p=P.qp[id]||0,st=P.q[id],live=st==='active',dn=st==='done',o=[];
 const cv=(c,n)=>dn?n:live?Math.min(c,n):0;
 if(d.type==='kill'){if(d.mk)d.mk.forEach(x=>o.push({t:'Defeat '+MON[x[0]].n+'s',c:cv(P.qp[id+'|'+x[0]]||0,x[1]),n:x[1]}));else o.push({t:'Defeat '+MON[d.mon].n+'s',c:cv(p,d.cnt),n:d.cnt})}
 else if(d.type==='collect')d.col.forEach(c=>o.push({t:'Collect '+ITEMS[c[0]].n,c:cv(P.inv[c[0]]||0,c[1]),n:c[1]}));
 else if(d.type==='use'){const k=Object.keys(d.give||{})[0];o.push({t:'Use the '+(k?ITEMS[k].n:'item'),c:cv(p,1),n:1})}
 else if(d.type==='quiz')o.push({t:'Answer the questions correctly',c:cv(p,7),n:7});
 else if(d.via)o.push({t:'Talk to '+NPCS[d.via].n+(qLoc(d.via)?' ('+qLoc(d.via)+')':''),c:cv(p>=1?1:0,1),n:1});
 return o}
function qRew(id){const w=QD[id].rw||{},r=[];if(w.exp)r.push(['⭐',XR(w.exp)+' EXP']);if(w.mesos)r.push(['🪙',w.mesos+' mesos']);for(const k in w.items||{})r.push([ITEMS[k].i,w.items[k]+' '+ITEMS[k].n]);if(w.rand)r.push(['\uD83C\uDF81','One of: '+w.rand.map(k=>ITEMS[k].n).join(', ')]);return r}
function qTrack(id){const t=qTrk(),i=t.indexOf(id);if(i>=0)t.splice(i,1);else if(P.q[id]==='active'){if(t.length>=QMAX)log('You can only track '+QMAX+' quests at a time.','bad','quest');else t.push(id)}save();render()}
function qGiveUp(id){if(P.q[id]!=='active')return;const d=QD[id];delete P.q[id];if(d.type!=='quiz'&&d.type!=='use')P.qp[id]=0;qTrk();qgive=null;qtab='avail';qsel=id;log('Quest given up: '+d.n+'.','bad','quest');save();render()}
function qNpc(n){return '<span>'+NPCS[n].i+' <b>'+NPCS[n].n+'</b>'+(qLoc(n)?' <span class="mute">in '+qLoc(n)+'</span>':'')+'</span>'}
const qLine=(o,show)=>'<div class="qzo'+(show&&o.c>=o.n?' ok':'')+'">'+(show?(o.c>=o.n?'✔':'▫'):'▫')+' '+o.t+' <b>'+(show?o.c+'/'+o.n:(o.n>1?'×'+o.n:''))+'</b></div>';
function trackerHtml(){if(!Object.keys(QD).some(i=>P.q[i]==='active'))return '';const t=qTrk();
 let h='<div class="panel win"><div class="title">QUEST TRACKER ('+t.length+'/'+QMAX+')</div>';
 if(!t.length)h+='<div class="pad mute">Nothing is tracked. Open the Quests tab and press Track.</div>';
 t.forEach(i=>{const d=QD[i],rd=qReady(i),tn=d.turn||d.giver;
  h+='<button class="qzkq" data-qo="'+i+'"><b'+(rd?' class="good"':'')+'>'+d.n+(rd?' (Ready)':'')+'</b>'+qObj(i).map(o=>qLine(o,true)).join('')+(rd?'<div class="qzo go">➜ Talk to '+NPCS[tn].n+(qLoc(tn)?' ('+qLoc(tn)+')':'')+'</div>':'')+'</button>'});
 return h+'</div>'}
function qDetail(id){if(!id)return '<div class="qzd"><div class="mute">Select a quest to read about it.</div></div>';
 const d=QD[id],act=P.q[id]==='active',dn=P.q[id]==='done',rd=act&&qReady(id),tn=d.turn||d.giver,tk=qTrk().includes(id),rw=qRew(id),ob=qObj(id),show=act||dn;
 let h='<div class="qzd"><div class="qzt">'+d.n+'</div><div class="mute">Lv. '+d.lvl+' &middot; '+(dn?'Completed':rd?'Ready to complete':act?'In progress':'Available')+'</div>';
 h+='<div class="qzh">Quest Info</div><div class="qzo">'+d.goal+'</div>';
 h+='<div class="qzh">NPC</div><div class="qzo">Start: '+qNpc(d.giver)+'</div><div class="qzo">Complete: '+qNpc(tn)+'</div>';
 if(d.pre)h+='<div class="qzo'+(P.q[d.pre]==='done'?' ok':'')+'">Requires: '+QD[d.pre].n+'</div>';
 if(ob.length)h+='<div class="qzh">'+(show?'Objectives':'Requirements')+'</div>'+ob.map(o=>qLine(o,show)).join('');
 if(rd)h+='<div class="qzo go" style="margin-top:4px">➜ Talk to '+NPCS[tn].n+(qLoc(tn)?' in '+qLoc(tn):'')+' to complete.</div>';
 h+='<div class="qzh">Reward</div>'+(rw.length?rw.map(r=>'<div class="qzo">'+r[0]+' '+r[1]+'</div>').join(''):'<div class="qzo mute">None</div>');
 if(!act&&!dn)h+='<div class="mute" style="margin-top:8px">Talk to '+NPCS[d.giver].n+(qLoc(d.giver)?' in '+qLoc(d.giver):'')+' to start this quest.</div>';
 if(act){if(qgive===id)h+='<div class="note bad" style="margin:10px 0 0">Give up this quest?</div><div class="ex"><button class="main" data-qgy="'+id+'">Give up</button><button data-qgn="1">Cancel</button></div>';
  else h+='<div class="ex"><button class="'+(tk?'on':'')+'" data-qk="'+id+'">'+(tk?'★ Tracking':'☆ Track')+'</button><button data-qg="'+id+'">Give up</button></div>'}
 return h+'</div>'}
function questsPanel(){const ids=Object.keys(QD),L={avail:ids.filter(qAvail),prog:ids.filter(i=>P.q[i]==='active'),done:ids.filter(i=>P.q[i]==='done')},cur=L[qtab],tk=qTrk();
 if(!cur.includes(qsel))qsel=cur[0]||null;
 const lab={avail:'Available',prog:'In Progress',done:'Completed'},emp={avail:'No quests are available right now. Look for a ! above people, or gain a level.',prog:'You have no quests in progress.',done:'You have not completed any quests yet.'};
 const row=i=>{const d=QD[i],ic=qtab==='avail'?'💡':qtab==='done'?'✔️':qReady(i)?'❓':'📜';return '<button class="qzi'+(qsel===i?' sel':'')+'" data-qz="'+i+'"><span class="qzic">'+ic+'</span><span>'+d.n+'<small>Lv. '+d.lvl+'</small></span>'+(qtab==='prog'&&tk.includes(i)?'<span class="qzs" title="Tracked">★</span>':'')+'</button>'};
 return '<div class="panel win"><div class="title">QUEST</div><div class="tabs" style="padding:8px 8px 0;margin-bottom:0">'+['avail','prog','done'].map(t=>'<button class="'+(qtab===t?'on':'')+'" data-qt="'+t+'">'+lab[t]+' ('+L[t].length+')</button>').join('')+'</div><div class="qzw"><div class="qzl">'+(cur.length?cur.map(row).join(''):'<div class="pad mute">'+emp[qtab]+'</div>')+'</div>'+qDetail(qsel)+'</div></div>'}
function qAccept(id){const d=QD[id];P.q[id]='active';if(d.type==='quiz'||d.type==='use')P.qp[id]=P.qp[id]||0;else P.qp[id]=0;if(d.mk)d.mk.forEach(x=>P.qp[id+'|'+x[0]]=0);P.gv=P.gv||{};if(!P.gv[id]){for(const k in d.give||{})P.inv[k]=(P.inv[k]||0)+d.give[k];P.gv[id]=1}const t=qTrk();if(t.length<QMAX&&!t.includes(id))t.push(id);log('Quest accepted: '+d.n+'.','','quest');save();render()}
function qTurn(id){const d=QD[id];if(!qReady(id))return;if(d.type==='collect')d.col.forEach(c=>{P.inv[c[0]]-=c[1];if(P.inv[c[0]]<=0)delete P.inv[c[0]]});
 P.q[id]='done';const w=d.rw||{};if(w.mesos)P.mesos+=w.mesos;for(const k in w.items||{})P.inv[k]=(P.inv[k]||0)+w.items[k];if(w.rand){const rk=w.rand[R(0,w.rand.length-1)];P.inv[rk]=(P.inv[rk]||0)+1;log('You receive a '+ITEMS[rk].n+'.','good','quest')}
 log('Quest complete: '+d.n+(w.exp?'. +'+XR(w.exp)+' EXP':'')+(w.items?', '+Object.keys(w.items).map(k=>w.items[k]+' '+ITEMS[k].n).join(', '):'')+'.','good','quest');if(w.exp)gain(w.exp);save();render()}
function dlg(){const n=talk.npc,N=NPCS[n],pg=talk.page;
 if(pg==='tip')return{t:N.tip[1],ch:[['Back','main']]};
 if(pg==='qq'){const p=P.qp.rain||0,Q=QUIZ[p];return{t:'Question '+(p+1)+' of 7: '+Q[0],ch:Q[1].map((c,i)=>[c,'ans:'+i]).concat([['Not now','main']])}}
 const ch=[],notes=[];
 for(const id in QD){const d=QD[id],tn=d.turn||d.giver;
  if(qAvail(id)&&d.giver===n)ch.push(['Quest: '+d.n,'qa:'+id]);
  if(P.q[id]!=='active')continue;
  if(d.via===n&&!((P.qp[id]||0)>=1))ch.push([d.viaText,'qv:'+id]);
  else if(tn===n){if(qReady(id))ch.push(['Complete: '+d.n,'qt:'+id]);else if(d.type==='quiz')ch.push(['Answer a question','qq']);else notes.push(d.n+': '+qProg(id))}}
 if(N.tip)ch.push([N.tip[0],'tip']);if(N.shop)ch.push(['Open the shop','shop']);ch.push(['Goodbye','close']);
 return{t:N.hi+(notes.length?'<br><br><span class="mute">'+notes.join('<br>')+'</span>':''),ch}}
function dlgDo(k){if(k==='close'){talk=null;return render()}
 if(k==='shop'){talk=null;inShop=true;return render()}
 if(k.startsWith('qa:')){talk.page='main';return qAccept(k.slice(3))}
 if(k.startsWith('qt:')){talk.page='main';return qTurn(k.slice(3))}
 if(k.startsWith('qv:')){const id=k.slice(3);P.qp[id]=1;log(QD[id].viaLog,'good','quest');talk.page='main';save();return render()}
 if(k.startsWith('ans:')){const p=P.qp.rain||0,Q=QUIZ[p];if(+k.slice(4)===Q[2]){P.qp.rain=p+1;log('Correct! +'+XR(QX[p])+' EXP.','good','quest');gain(QX[p]);if(P.qp.rain>=7)talk.page='main'}else log('Not quite, give it another try.','bad','quest');save();return render()}
 talk.page=k;render()}
function dlgPanel(){const d=dlg(),N=NPCS[talk.npc];return '<div class="panel win"><div class="title">'+N.n.toUpperCase()+'</div><div class="pad"><div style="font-size:30px">'+N.i+'</div><div style="margin-top:6px">'+d.t+'</div></div><div class="pad" style="display:flex;flex-direction:column;gap:6px">'+d.ch.map(c=>'<button data-d="'+c[1]+'"'+(/^(qa|qt):/.test(c[1])?' class="main"':'')+'>'+c[0]+'</button>').join('')+'</div></div>'}
function npcBadge(id){let a=0,r=0;for(const q in QD){const d=QD[q];if(qAvail(q)&&d.giver===id)a=1;if(P.q[q]==='active'&&(((d.turn||d.giver)===id&&qReady(q))||(d.via===id&&!((P.qp[q]||0)>=1))))r=1}return r?'<span class="pill g">?</span>':a?'<span class="pill">!</span>':''}
function peoplePanel(){const m=MAPS[P.map];let h='<div class="panel"><h2>People</h2>'+m.npcs.map(id=>{const N=NPCS[id];
  return '<button class="npc'+(selNpc===id?' sel':'')+'" data-n="'+id+'"><span class="av">'+N.i+'</span><span style="flex:1">'+N.n+'<br><span class="mute">'+N.role+'</span></span>'+npcBadge(id)+'</button>'}).join('');
 return h+'</div>'}
function beginSeek(auto){if(enc||seeking)return;seeking=true;seekAuto=!!auto;clearTimeout(autoT);
 autoT=setTimeout(()=>{seeking=false;if(!P||enc)return;if(seekAuto&&!autoSeek)return render();const m2=MAPS[P.map];if(m2.town||talk){autoSeek=false;return render()}
  seek();render()},auto?600:500);render()}
function battlePanel(mode){const m=MAPS[P.map],r=dmgRange(),live=mode==='fight';let top;
 if(live){const d=MON[enc.k];top='<div class="row"><div><div class="big">'+d.i+'</div><b>'+d.n+'</b> <span class="mute">Lv '+d.lv+'</span></div><div class="mute">'+Math.max(0,enc.hp)+'/'+enc.max+' HP</div></div>'+bar('var(--hp)',enc.hp,enc.max)+laneHtml()}
 else if(mode==='seek')top='<div class="stc"><b>\u{1F50D} Seeking<span class="dots"></span></b><div class="bar" style="width:70%"><i class="scan"></i></div></div>'
 else top='<div class="stc"><button class="main" id="sk" style="width:70%">Start Combat</button><div class="mute">Damage with '+W().n+': '+r[0]+'-'+r[1]+'</div></div>';
 const dis=live?'':' disabled';
 return '<div class="panel"><div class="stage">'+top+'</div>'+quickBar()+'<div class="grid" style="margin-top:8px"><button id="adv"'+dis+'>Advance</button><button id="bk"'+dis+'>Back step</button><button id="fl"'+dis+'>Flee</button></div><div style="margin-top:8px;display:flex;justify-content:flex-end">'+autoBox()+'</div></div>'}
function seekingPanel(){return '<div class="panel"><div class="row"><b>🔍 Seeking<span class="dots"></span></b>'+autoBox()+'</div><div class="bar" style="margin-top:8px"><i class="scan"></i></div></div>'}
function autoBox(){return '<label style="display:flex;align-items:center;gap:6px;font:13px Maplestory,Arial,sans-serif;white-space:nowrap"><input type="checkbox" id="as" '+(autoSeek?'checked':'')+' style="width:24px;height:24px;padding:0;accent-color:#2f6fb8">Auto-hunt</label>'}
function useItem(id){const it=ITEMS[id],now=Date.now();if(!it||!(it.heal||it.mpheal||it.hpp||it.mpp)||!(P.inv[id]>0)||now-lastPot<1000)return;const rq=id==='apple'&&P.q.roger==='active';
 const hv=(it.heal||0)+Math.floor(P.maxHp*(it.hpp||0)/100),mv=(it.mpheal||0)+Math.floor(P.maxMp*(it.mpp||0)/100);
 if(!rq&&!(hv&&P.hp<P.maxHp)&&!(mv&&P.mp<P.maxMp))return;lastPot=now;P.inv[id]--;if(P.inv[id]<=0)delete P.inv[id];const h=Math.min(hv,P.maxHp-P.hp),g=Math.min(mv,P.maxMp-P.mp);P.hp+=h;P.mp+=g;log('You use '+it.n+'.'+(h?' +'+h+' HP.':'')+(g?' +'+g+' MP.':''),'good',enc?'combat':'items');if(rq)P.qp.roger=1;save();render()}
function usePot(i){const id=P.pq&&P.pq[i];if(!id)return;const it=ITEMS[id]||{},hpOnly=!(it.mpheal||it.mpp);if(hpOnly&&P.hp>=P.maxHp&&!(id==='apple'&&P.q.roger==='active'))return log('Your HP is already full.','','items'),render();if(!hpOnly&&!(it.heal||it.hpp)&&P.mp>=P.maxMp)return log('Your MP is already full.','','items'),render();useItem(id)}
function pqInner(i){const id=P.pq[i],it=id&&ITEMS[id],n=it?(P.inv[id]||0):0;return it?'<span class="qi">'+it.i+'</span><span class="qn">'+it.n.replace(' Potion','')+'</span><small>x'+n+'</small>':'<span class="qi">'+(qEdit?'+':'&middot;')+'</span><span class="qn">Potion '+(i+1)+'</span><small>Empty</small>'}
function pqBtn(i){const id=P.pq[i],it=id&&ITEMS[id],n=it?(P.inv[id]||0):0;const dis=!qEdit&&(!it||n<1);return '<button class="sk qk'+(qEdit?' qe':'')+(qPick&&qPick.t==='p'&&qPick.i===i?' qsel':'')+'" id="pq'+i+'"'+(dis?' disabled':'')+'>'+pqInner(i)+'</button>'}
function pqSet(i,id){if(id&&P.pq[1-i]===id)P.pq[1-i]=null;P.pq[i]=id||null;save()}
function pqClick(i){if(qEdit){qPick=(qPick&&qPick.t==='p'&&qPick.i===i)?null:{t:'p',i};return render()}usePot(i)}
let lastSk=0,cd={rec:0,feet:0},recNext=0,recFrac=0,lastBuffR=0,hadBuff=false;
const speed=()=>Math.min(140,100+gearSpd()+(typeof seSpeed==='function'?seSpeed():0)+(P.b.feet>Date.now()?[10,15,20][P.sk.feet-1]:0)+(P.b.dash>Date.now()?(P.b.dashv|0):0)-darkPen());
const needFor=m=>Math.max(1,Math.round(m.need*100/speed()));
const sk3cost=()=>[3,5,7][P.sk.three-1],sk3shell=()=>['snail_shell','blue_snail_shell','red_snail_shell'][P.sk.three-1];
const SK3R=2;/* Three Snails reach: usable from distance 0-2 */
function skThree(){if(!enc||!P.sk.three)return;const now=Date.now();if(now-lastSk<1500||now<atkReady()||now-lastMv<moveCd())return;
 if(enc.gap>SK3R){log('The '+MON[enc.k].n+' is too far for Three Snails.','','combat');return render()}
 if(P.mp<sk3cost())return log('You don\'t have enough MP for that.','bad','combat'),render();
 P.mp-=sk3cost();lastSk=now;lastAtk=now;const d=MON[enc.k];
 {const x=[10,25,40][P.sk.three-1];enc.hp-=x;log('Three Snails hits the '+d.n+' for '+x+'.','hit','combat')}
 if(enc.hp<=0)win();render()}
const recMp=()=>[5,10,15][P.sk.rec-1];
function skRec(){const now=Date.now();if(!P.sk.rec||now<cd.rec)return;if(P.mp<recMp())return log('You don\'t have enough MP for that.','bad','combat'),render();P.mp-=recMp();cd.rec=now+600000;P.b.rec=now+30000;recNext=now+2000;recFrac=0;log('Recovery: your wounds begin to close.','good','combat');save();render()}
const feetMp=()=>[4,7,10][P.sk.feet-1];
function skFeet(){const now=Date.now();if(!P.sk.feet||now<cd.feet)return;if(P.mp<feetMp())return log('You don\'t have enough MP for that.','bad','combat'),render();P.mp-=feetMp();cd.feet=now+900000;P.b.feet=now+[4,8,12][P.sk.feet-1]*1000;log('Nimble Feet: speed +'+[10,15,20][P.sk.feet-1]+' for '+[4,8,12][P.sk.feet-1]+' s.','good','combat');save();render()}
function spendSk(k){if(P.sp<1||P.sk[k]>=3)return;P.sk[k]++;P.sp--;save();render()}
function buffLine(){const now=Date.now(),a=[];if(P.b.feet>now)a.push('Nimble Feet '+Math.ceil((P.b.feet-now)/1000)+'s');if(P.b.iron>now)a.push('Iron Body '+Math.ceil((P.b.iron-now)/1000)+'s');if(P.b.focus>now)a.push('Focus '+Math.ceil((P.b.focus-now)/1000)+'s');if(P.b.dark>now)a.push('Dark Sight '+Math.ceil((P.b.dark-now)/1000)+'s');if(P.b.guard>now)a.push('Magic Guard '+Math.ceil((P.b.guard-now)/1000)+'s');if(P.b.marm>now)a.push('Magic Armor '+Math.ceil((P.b.marm-now)/1000)+'s');if(P.b.rec>now)a.push('Recovery '+Math.ceil((P.b.rec-now)/1000)+'s');return(a.length||speed()!==100)?'<div class="mute" style="margin-top:6px">Speed '+speed()+'%'+(a.length?' &middot; '+a.join(' &middot; '):'')+'</div>':''}
const NAV={mushroom_town:[9,27,'Town'],training_camp:[9,8,'Camp'],a_split_road:[26,27,'Split Road'],snail_hunting_ground_1:[26,46,'Snails I'],snail_hunting_ground_2:[26,65,'Snails II'],snail_hunting_ground_3:[43,84,'Snails III'],field_west_of_amherst:[43,27,'West Field'],mushroom_garden:[43,8,'Mush. Garden'],amherst:[60,27,'Amherst'],field_east_of_amherst:[77,27,'East Field'],southperry:[93,27,'Southperry'],dangerous_forest:[60,84,'Dang. Forest'],tomato_field:[26,8,'Tomatoes'],middle_forest_1:[43,46,'Forest I'],middle_forest_2:[43,65,'Forest II'],snail_garden:[60,8,'Snail Garden'],snail_field:[77,8,'Flowers'],atc_entrance:[77,46,'Training Ctr'],atc_1:[93,46,'ATC 1'],atc_2:[93,65,'ATC 2'],atc_3:[77,65,'ATC 3'],atc_4:[93,84,'ATC 4']};
let mapView='maple';
const ZONES=[['near','Personal map'],['maple','Maple Island'],['victoria','Victoria Island'],['ossyria','Orbis (Ossyria)'],['world','World']];
/* Preview zones: simplified overviews, not playable yet. Node = [x,y,label,icon,zoneToOpen]. */
const PV={victoria:{n:{southperry:[8,88,'Southperry','⚓','maple'],orbis:[18,10,'Orbis','☁️','ossyria'],lith:[14,64,'Lith Harbor','⚓'],henesys:[38,66,'Henesys','🏹'],ellinia:[30,34,'Ellinia','🌲'],perion:[62,34,'Perion','⛰️'],kerning:[86,60,'Kerning City','🗡️'],sleepy:[62,68,'Sleepywood','🌑']},e:[['southperry','lith'],['lith','henesys'],['henesys','ellinia'],['henesys','perion'],['henesys','sleepy'],['perion','sleepy'],['perion','kerning'],['ellinia','orbis']]},
 ossyria:{n:{ellinia:[10,52,'Ellinia','🌲','victoria'],orbis:[50,52,'Orbis','☁️'],el_nath:[50,14,'El Nath','❄️'],ludibrium:[86,26,'Ludibrium','🧸'],leafre:[88,66,'Leafre','🐲'],mu_lung:[30,88,'Mu Lung','🥋'],herb:[68,88,'Herb Town','🌿']},e:[['ellinia','orbis'],['orbis','el_nath'],['orbis','ludibrium'],['orbis','leafre'],['orbis','mu_lung'],['mu_lung','herb']]},
 world:{n:{maple:[16,60,'Maple Island','🍁','maple'],victoria:[50,34,'Victoria Island','🏝️','victoria'],ossyria:[84,60,'Orbis (Ossyria)','☁️','ossyria']},e:[['maple','victoria'],['victoria','ossyria']]}};
/* ===== Victoria Island ===== */
/* Items */
Object.assign(ITEMS,{
 orange_potion:{n:'Orange Potion',i:'🥤',heal:250,buy:160},
 white_potion:{n:'White Potion',i:'🍼',heal:500,buy:380},
 pig_head:{n:'Pig Head',i:'🐽',sell:25},
 pig_ribbon:{n:'Pig Ribbon',i:'🎀',sell:30},
 octopus_leg:{n:'Octopus Leg',i:'🦑',sell:35},
 stirge_wing:{n:'Stirge Wing',i:'🪽',sell:40},
 green_mushroom_cap:{n:'Green Mushroom Cap',i:'🍄',sell:45},
 horny_mushroom_cap:{n:'Horny Mushroom Cap',i:'🍄',sell:55},
 stump_bark:{n:'Stump Bark',i:'🪵',sell:60},
 evil_eye_tail:{n:'Evil Eye Tail',i:'👁️',sell:80}});
DESC.orange_potion='An orange potion that restores a lot of HP.';
DESC.white_potion='A white potion that restores a large amount of HP.';
/* Monsters */
Object.assign(MON,{
 pig:{n:'Pig',i:'🐷',lv:7,hp:90,exp:18,av:4,atk:[10,14],iv:1700,m:[10,22],e:'pig_head'},
 ribbon_pig:{n:'Ribbon Pig',i:'🐖',lv:8,hp:120,exp:24,av:5,atk:[12,16],iv:1700,m:[14,28],e:'pig_ribbon'},
 octopus:{n:'Octopus',i:'🐙',lv:9,hp:150,exp:30,av:6,atk:[13,18],iv:1700,m:[16,32],e:'octopus_leg'},
 stirge:{n:'Stirge',i:'🦇',lv:10,hp:130,exp:32,av:9,atk:[14,19],iv:1600,m:[18,34],e:'stirge_wing'},
 green_mushroom:{n:'Green Mushroom',i:'🍄',lv:12,hp:220,exp:48,av:7,atk:[16,22],iv:1800,m:[22,40],e:'green_mushroom_cap'},
 horny_mushroom:{n:'Horny Mushroom',i:'🍄',lv:13,hp:280,exp:60,av:8,atk:[18,25],iv:1800,m:[26,46],e:'horny_mushroom_cap'},
 axe_stump:{n:'Axe Stump',i:'🪓',lv:14,hp:340,exp:72,av:8,atk:[20,28],iv:1900,m:[30,52],e:'stump_bark'},
 evil_eye:{n:'Evil Eye',i:'👁️',lv:15,hp:400,exp:90,av:10,atk:[22,30],iv:1800,m:[34,60],e:'evil_eye_tail'}});
['pig','ribbon_pig','octopus','stirge','green_mushroom','horny_mushroom','axe_stump','evil_eye'].forEach(k=>{const d=MON[k];
 DROPS[k]={m:[.5,d.m[0],d.m[1]],i:[[d.e,.55,1,1],['red_potion',.04,1,1],['orange_potion',.015,1,1]]}});
/* Maps */
const TW=(id,n,i,d,npcs,ex,ret,o)=>{MAPS[id]=Object.assign({n,i,d,town:1,npcs,ex,ret},o||{})};
const GR=['hat','top','bottom','gloves','shoes'],ACN=['face','eyes','earring','ring'];
const tiers=(a,t)=>[].concat(...a.map(g=>t.map(l=>g+'_'+l)));
TW('lith_harbor','Lith Harbor','⚓','The gateway to Victoria Island. Ferries from Maple Island dock here, and a road leads east to Henesys.',['goldstein','mai','joel'],
 [['southperry','Ferry back to Southperry'],['pig_beach','Pig Beach'],['road_to_henesys','East to the Road to Henesys']],'lith_harbor',
 {shop:1,shopName:'Lith Harbor Store',shopList:['red_potion','orange_potion','sword','hand_axe','wooden_club','hat_1','top_1','bottom_1','shoes_1'],hint:'Mr. Goldstein has a job for you. Mai sells potions and basic gear.'});
NM('pig_beach','Pig Beach','🏖️','Pigs root through the sand while Octopuses lurk in the tide pools.',8,['pig','ribbon_pig','octopus'],[['lith_harbor','Back to Lith Harbor']],'lith_harbor',['#e8d3a0','#4fa548','#6fb7e8',3]);
NM('road_to_henesys','Road to Henesys','🛤️','A dusty road lined with hedges. Pigs and Orange Mushrooms wander across it.',8,['pig','ribbon_pig','orange_mushroom'],[['lith_harbor','Back to Lith Harbor'],['henesys','On to Henesys']],'lith_harbor',['#86c765','#3f8f3a','#5b97d1',5]);
TW('henesys','Henesys','🏹','A sunny town of green roofs and archery targets, at the heart of Victoria Island. Roads lead north to Ellinia and east to Perion.',['athena','pia'],
 [['road_to_henesys','West to the Road to Henesys'],['henesys_hunting_ground_1','Henesys Hunting Ground I'],['forest_path','North along the Forest Path to Ellinia'],['rocky_path','East along the Rocky Path to Perion']],'henesys',
 {shop:1,shopName:'Pia\'s Armor Shop',shopList:['red_potion','orange_potion','white_potion'].concat(tiers(GR,[1,5,10,15])),hint:'Pia sells armor. Athena Pierce has a quest.'});
NM('henesys_hunting_ground_1','Henesys Hunting Ground I','🌾','Open grassland just outside town, full of Pigs and Orange Mushrooms.',10,['pig','ribbon_pig','orange_mushroom'],[['henesys','Back to Henesys'],['henesys_hunting_ground_2','On to Hunting Ground II']],'henesys',['#7cbf5a','#3f8f3a','#5b97d1',5]);
NM('henesys_hunting_ground_2','Henesys Hunting Ground II','🌳','Tougher fields where Green Mushrooms have moved in.',10,['ribbon_pig','orange_mushroom','green_mushroom'],[['henesys_hunting_ground_1','Back to Hunting Ground I']],'henesys',['#6fb552','#2f7a2f','#5b97d1',5]);
NM('forest_path','Forest Path','🌲','A shady trail north of Henesys. Stumps, Green Mushrooms and Stirges lurk among the trees.',10,['stump','green_mushroom','stirge'],[['henesys','Back to Henesys'],['ellinia','On to Ellinia']],'henesys',['#4f8f3a','#24531f','#4f84b8',7]);
TW('ellinia','Ellinia','🌲','A town built into the branches of giant trees. Quiet, green and a little mysterious.',['grendel','mirin'],
 [['forest_path','South to the Forest Path'],['ellinia_forest','Ellinia Forest']],'ellinia',
 {shop:1,shopName:'Mirin\'s Accessories',shopList:['red_potion','orange_potion','white_potion'].concat(tiers(ACN,[1,5,10,15])),hint:'Mirin sells accessories. Grendel has a quest.'});
NM('ellinia_forest','Ellinia Forest','🌳','Deep woods behind the town where Horny Mushrooms and Stirges roam.',12,['green_mushroom','horny_mushroom','stirge'],[['ellinia','Back to Ellinia']],'ellinia',['#3f7f35','#1f4a22','#3a6a5a',8]);
NM('rocky_path','Rocky Path','🪨','A winding path of dry earth. Stumps and Axe Stumps guard the way east.',10,['stump','orange_mushroom','axe_stump'],[['henesys','Back to Henesys'],['perion','On to Perion']],'henesys',['#c9a26a','#6b8f3a','#e8b070',3]);
TW('perion','Perion','⛰️','A rugged town in the red mountains where warriors train.',['balrog','ruff'],
 [['rocky_path','West to the Rocky Path'],['rocky_mountain','Rocky Mountain'],['kerning_road','East to the Road to Kerning City']],'perion',
 {shop:1,shopName:'Ruff\'s Weapons',shopList:['red_potion','orange_potion','long_sword','iron_axe','spiked_club','broad_sword','war_axe','iron_mace'].concat(tiers(['cape','shield'],[5,10,15])),hint:'Ruff sells weapons and shields. Dances with Balrog has a quest.'});
NM('rocky_mountain','Rocky Mountain','🏔️','Steep red cliffs crawling with Stumps, Axe Stumps and Horny Mushrooms.',12,['stump','axe_stump','horny_mushroom'],[['perion','Back to Perion']],'perion',['#b98a52','#7a8f4a','#e8a05a',3]);
NM('kerning_road','Road to Kerning City','🛣️','A long road east. The trees thin out and the sky turns grey.',12,['stirge','horny_mushroom','axe_stump'],[['perion','Back to Perion'],['kerning_city','On to Kerning City']],'perion',['#8a8f6a','#4a6a3a','#8a7fb0',4]);
TW('kerning_city','Kerning City','🗡️','A dim, crowded city of pipes and rooftops, home of thieves.',['darklord','nella'],
 [['kerning_road','West to the Road to Kerning City'],['kerning_outskirts','Kerning Outskirts']],'kerning_city',
 {shop:1,shopName:'Nella\'s Potions',shopList:['red_potion','orange_potion','white_potion'],hint:'Nella sells potions. The Dark Lord has a quest.'});
NM('kerning_outskirts','Kerning Outskirts','🌫️','Foggy wasteland past the city walls. Evil Eyes watch from the dead trees.',12,['evil_eye','axe_stump','stirge'],[['kerning_city','Back to Kerning City']],'kerning_city',['#6a6f5a','#33503a','#5a4a8a',4]);
/* Ferry from Southperry */
MAPS.southperry.d='The island\'s port. Gulls, crates and a ferry bound for Victoria Island.';
MAPS.southperry.hint='Shanks sells passage to Victoria Island from level 7 (150 mesos).';
MAPS.southperry.ex.push(['lith_harbor','Ferry to Lith Harbor, Victoria Island','ferry']);
NPCS.vasily.hi='The ferry to Victoria Island is sailing! Adventurers of level 7 and up can ride for 150 mesos.';
/* NPCs */
Object.assign(NPCS,{
 goldstein:{n:'Mr. Goldstein',i:'🧔',role:'Harbor merchant',hi:'Welcome to Lith Harbor! Every adventurer on Victoria Island starts here.',tip:['Where do I go from here?','Head east along the road to Henesys. From Henesys you can go north to Ellinia or east through Perion to Kerning City. Clear a field to unlock the way onward.']},
 mai:{n:'Mai',i:'👩',role:'Harbor store',shop:1,hi:'Potions and basic gear, fresh off the boat!'},
 joel:{n:'Joel',i:'⚓',role:'Ferry operator',hi:'The ferry back to Maple Island sails any time. Just use the world map.'},
 athena:{n:'Athena Pierce',i:'🏹',role:'Bowman instructor',hi:'I teach archery here in Henesys. Bowmen are quick, sharp-eyed and deadly from a distance.'},
 pia:{n:'Pia',i:'👩',role:'Armor seller',shop:1,hi:'Hats, tunics, pants, gloves and boots. Everything a growing adventurer needs.'},
 grendel:{n:'Grendel the Really Old',i:'🧙',role:'Magician instructor',hi:'Hmm? Another young one visiting Ellinia. Mind the mushrooms, dear.'},
 mirin:{n:'Mirin',i:'🧝',role:'Accessory seller',shop:1,hi:'Masks, glasses, earrings and rings. A little sparkle goes a long way.'},
 balrog:{n:'Dances with Balrog',i:'💪',role:'Warrior instructor',hi:'Perion breeds the toughest warriors. Prove your strength.'},
 ruff:{n:'Ruff',i:'🔨',role:'Weapon smith',shop:1,hi:'Axes, maces, swords and shields. All forged right here.'},
 darklord:{n:'Dark Lord',i:'🥷',role:'Thief instructor',hi:'Quiet, now. Not everyone in Kerning City should know you are here.'},
 nella:{n:'Nella',i:'🧑',role:'Potion seller',shop:1,hi:'Stock up before you head out to the Outskirts.'}});
/* Quests */
Object.assign(QD,{
 ferry:{n:'Passage to Victoria Island',giver:'vasily',lvl:7,type:'talk',rw:{exp:0},goal:'Get a ferry ticket from Vasily.'},
 pigs:{n:'Pigs in the Harbor',giver:'goldstein',lvl:10,type:'kill',mon:'pig',cnt:15,rw:{exp:260,mesos:400},goal:'Defeat 15 Pigs.'},
 target:{n:'Athena\'s Target Practice',giver:'athena',lvl:10,type:'collect',col:[['pig_head',15]],rw:{exp:420,items:{orange_potion:5}},goal:'Collect 15 Pig Heads.'},
 soup:{n:'Grendel\'s Mushroom Soup',giver:'grendel',lvl:11,type:'collect',col:[['green_mushroom_cap',10],['stirge_wing',5]],rw:{exp:650,mesos:600},goal:'Collect 10 Green Mushroom Caps and 5 Stirge Wings.'},
 trial:{n:'Balrog\'s Trial',giver:'balrog',lvl:12,type:'kill',mon:'axe_stump',cnt:12,rw:{exp:900,items:{orange_potion:10}},goal:'Defeat 12 Axe Stumps.'},
 errand:{n:'The Dark Lord\'s Errand',giver:'darklord',lvl:13,type:'collect',col:[['evil_eye_tail',5]],rw:{exp:1200,mesos:1500},goal:'Collect 5 Evil Eye Tails.'}});
/* Accepting the ferry quest buys the ticket straight away */
const _qa=qAccept;qAccept=function(id){if(id==='ferry'){P.q.ferry='done';P.qp.ferry=1;log('Vasily stamps your ticket. The ferry to Victoria Island is open to you.','good','quest');save();return render()}return _qa(id)};
/* World map positions */
const VNAV={lith_harbor:[9,65,'Lith Harbor'],pig_beach:[9,84,'Pig Beach'],road_to_henesys:[26,65,'Road to Henesys'],henesys:[43,65,'Henesys'],henesys_hunting_ground_1:[43,84,'Hunting Gr. I'],henesys_hunting_ground_2:[60,84,'Hunting Gr. II'],forest_path:[43,46,'Forest Path'],ellinia:[43,27,'Ellinia'],ellinia_forest:[43,8,'Ellinia Forest'],rocky_path:[60,65,'Rocky Path'],perion:[77,65,'Perion'],rocky_mountain:[77,84,'Rocky Mtn'],kerning_road:[77,46,'Kerning Road'],kerning_city:[77,27,'Kerning City'],kerning_outskirts:[77,8,'Outskirts']};
Object.assign(NAV,VNAV);
const reg=k=>VNAV[k]?'victoria':'maple';
let _lr=null;
function syncView(){const r=reg(P.map);if(_lr!==r){_lr=r;if(mapView==='maple'||mapView==='victoria')mapView=r}}
function ferryStubs(pos,L,B){let ln='',nd='';const ic='\u26F4\uFE0F';
 if((mapView==='maple'||(mapView==='near'&&!pos.lith_harbor))&&pos.southperry){const sy=pos.southperry[1],f=[pos.southperry[0],sy-19>=4?sy-19:sy+19],here=P.map==='southperry',ok=here&&P.q.ferry==='done';
  ln+=L(pos.southperry,f,ok);
  nd+=ok?B('nd ok','vic',f[0],f[1],ic,'Victoria','Board the ferry to Lith Harbor on Victoria Island.',' data-g="lith_harbor"'):B('nd far','vic',f[0],f[1],ic,'Victoria',here?'Talk to Vasily for passage (level 7). Tap to look at the Victoria Island map.':'The ferry to Victoria Island. Tap to look at its map.',' data-z="victoria"')}
 if(mapView==='victoria'&&pos.lith_harbor){const a=pos.lith_harbor,f=[a[0],a[1]-19],here=P.map==='lith_harbor';
  ln+=L(a,f,here);
  nd+=here?B('nd ok','mpl',f[0],f[1],ic,'Maple Isl.','Take the ferry back to Southperry on Maple Island.',' data-g="southperry"'):B('nd far','mpl',f[0],f[1],ic,'Maple Isl.','The ferry to Maple Island. Tap to look at its map.',' data-z="maple"')}
 return[ln,nd]}
/* Town art */
const vSvg=(id,b)=>'<svg viewBox="0 0 320 130" role="img" aria-label="'+MAPS[id].n+'" style="width:100%;display:block;border-radius:8px;margin-bottom:8px">'+b+'</svg>';
const vSky=(n,a,b)=>'<defs><linearGradient id="'+n+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient></defs><rect width="320" height="130" fill="url(#'+n+')"/>';
const vHouse=(x,y,w,h,wall,roof)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+wall+'"/><polygon points="'+(x-4)+','+y+' '+(x+w/2)+','+(y-w*.45)+' '+(x+w+4)+','+y+'" fill="'+roof+'"/><rect x="'+(x+w*.14)+'" y="'+(y+h*.22)+'" width="'+w*.24+'" height="'+w*.24+'" fill="#ffe9a6"/><rect x="'+(x+w*.56)+'" y="'+(y+h*.4)+'" width="'+w*.26+'" height="'+h*.6+'" fill="#7a4a1f"/>';
const vTree=(x,y,r,c1,c2)=>'<rect x="'+(x-3)+'" y="'+y+'" width="6" height="'+r*1.1+'" fill="#7a5230"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+c1+'"/><circle cx="'+(x-r*.4)+'" cy="'+(y+r*.2)+'" r="'+r*.65+'" fill="'+c2+'"/>';
const vSun='<circle cx="276" cy="24" r="13" fill="#fff0a6"/>',vCloud='<ellipse cx="62" cy="26" rx="26" ry="8" fill="#fff" opacity=".85"/><ellipse cx="80" cy="22" rx="16" ry="7" fill="#fff" opacity=".85"/><ellipse cx="238" cy="38" rx="22" ry="6" fill="#fff" opacity=".8"/>';
const vWin=(x,y,cols,rows,gx,gy)=>{let s='';for(let i=0;i<cols;i++)for(let j=0;j<rows;j++)s+='<rect x="'+(x+i*gx)+'" y="'+(y+j*gy)+'" width="5" height="6" fill="'+((i+j)%3?'#ffe27a':'#5a5566')+'"/>';return s};
const V_ART={
 lith_harbor:()=>vSky('vs1','#4f9bd9','#d4ecfa')+vSun+'<path d="M120 34 q4 -5 8 0 q4 -5 8 0 M232 40 q4 -5 8 0 q4 -5 8 0" fill="none" stroke="#fff" stroke-width="1.5"/><rect y="76" width="320" height="54" fill="#3d86c6"/><path d="M0 84 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#9fd0f0" stroke-width="1.5"/><path d="M0 106 Q50 96 110 102 T200 104 V130 H0Z" fill="#ecd9a0"/>'+vHouse(16,66,40,34,'#ead7ab','#b5523b')+vHouse(66,72,30,28,'#ead7ab','#3f7fb0')+'<rect x="108" y="100" width="150" height="7" fill="#9b6b3a"/><g fill="#7a5230"><rect x="120" y="100" width="4" height="22"/><rect x="170" y="100" width="4" height="22"/><rect x="220" y="100" width="4" height="22"/></g><path d="M196 80 h66 l-9 16 h-48z" fill="#8a4b2a"/><rect x="226" y="40" width="3" height="42" fill="#6b4a2a"/><polygon points="229,42 256,76 229,76" fill="#f7f1df"/><polygon points="225,46 206,76 225,76" fill="#e8dfc6"/><rect x="108" y="92" width="10" height="9" fill="#b98a52"/><rect x="120" y="94" width="8" height="7" fill="#c99a62"/>',
 henesys:()=>vSky('vs2','#5b97d1','#d4ecfa')+vSun+vCloud+'<path d="M0 92 Q80 66 160 88 T320 80 V130 H0Z" fill="#86c765"/><path d="M0 108 Q90 96 170 106 T320 100 V130 H0Z" fill="#5fa84a"/><path d="M130 130 Q150 112 200 108 T320 105 V115 Q240 118 190 126 T170 130Z" fill="#e8d3a0"/>'+vTree(52,52,32,'#3f8f3a','#4fa548')+vHouse(104,76,36,30,'#f4e3b8','#4d9a3a')+vHouse(212,72,40,34,'#f4e3b8','#4d9a3a')+vHouse(272,80,30,26,'#f4e3b8','#e0a03a')+'<circle cx="190" cy="100" r="9" fill="#fff"/><circle cx="190" cy="100" r="6" fill="#e0503a"/><circle cx="190" cy="100" r="3" fill="#fff"/><rect x="188" y="108" width="4" height="10" fill="#7a5230"/>',
 ellinia:()=>vSky('vs3','#2f6a5a','#b8e0c8')+'<circle cx="270" cy="22" r="11" fill="#fff6c8" opacity=".9"/><rect y="104" width="320" height="26" fill="#3c7a3a"/><rect x="22" y="20" width="26" height="90" fill="#6b4a2a"/><rect x="156" y="14" width="30" height="96" fill="#6b4a2a"/><rect x="272" y="28" width="24" height="82" fill="#6b4a2a"/><circle cx="35" cy="20" r="36" fill="#2f6f35"/><circle cx="171" cy="14" r="40" fill="#24602c"/><circle cx="284" cy="28" r="32" fill="#2f6f35"/><circle cx="100" cy="30" r="26" fill="#3f8f3a"/><rect x="99" y="30" width="4" height="40" fill="#6b4a2a"/><rect x="164" y="56" width="14" height="18" fill="#ffe27a"/><rect x="30" y="64" width="10" height="14" fill="#ffe27a"/><rect x="278" y="70" width="10" height="14" fill="#ffe27a"/><path d="M60 100 Q110 90 150 102" stroke="#e8d3a0" stroke-width="6" fill="none"/><circle cx="84" cy="96" r="2" fill="#fff6a0"/><circle cx="224" cy="92" r="2" fill="#fff6a0"/><circle cx="240" cy="80" r="2" fill="#fff6a0"/>',
 perion:()=>vSky('vs4','#e8a05a','#fbe3b0')+'<circle cx="270" cy="26" r="14" fill="#fff0a6"/><polygon points="0,96 40,40 90,40 120,96" fill="#b5693a"/><polygon points="150,96 190,26 250,26 290,96" fill="#c9824a"/><polygon points="250,96 290,52 320,52 320,96" fill="#b5693a"/><rect y="96" width="320" height="34" fill="#d9a15c"/>'+vHouse(110,80,34,24,'#e8c488','#8a4b2a')+vHouse(206,82,30,22,'#e8c488','#8a4b2a')+'<rect x="60" y="82" width="4" height="22" fill="#4a7a3a"/><rect x="56" y="88" width="12" height="3" fill="#4a7a3a"/><rect x="176" y="86" width="4" height="18" fill="#4a7a3a"/><rect x="172" y="90" width="12" height="3" fill="#4a7a3a"/><rect x="262" y="70" width="2" height="34" fill="#6b4a2a"/><polygon points="264,70 280,76 264,82" fill="#d8432f"/>',
 kerning_city:()=>vSky('vs5','#3a2f5a','#a58bc8')+'<circle cx="40" cy="24" r="10" fill="#f4eed0" opacity=".9"/><rect x="8" y="46" width="44" height="64" fill="#4a4560"/><rect x="62" y="30" width="50" height="80" fill="#3d3852"/><rect x="124" y="54" width="40" height="56" fill="#524b6a"/><rect x="176" y="24" width="56" height="86" fill="#3d3852"/><rect x="244" y="42" width="60" height="68" fill="#4a4560"/>'+vWin(14,52,4,5,9,11)+vWin(70,38,5,6,9,11)+vWin(130,60,3,4,11,11)+vWin(184,32,5,6,10,11)+vWin(252,48,5,5,11,12)+'<rect y="108" width="320" height="22" fill="#5a5566"/><rect x="146" y="76" width="3" height="34" fill="#2a2638"/><circle cx="147" cy="74" r="5" fill="#ffe27a"/><rect x="230" y="70" width="3" height="40" fill="#2a2638"/><circle cx="231" cy="68" r="5" fill="#ffe27a"/>'};
const _ta1=townArt;townArt=function(id){return V_ART[id]?vSvg(id,V_ART[id]()):_ta1(id)};
function nearSet(){const d={};d[P.map]=0;const qu=[P.map];while(qu.length){const a=qu.shift();if(d[a]>=2)continue;const nb=new Set(MAPS[a].ex.map(e=>e[0]));for(const k in MAPS)if(MAPS[k].ex.some(e=>e[0]===a))nb.add(k);for(const b of nb)if(!(b in d)&&NAV[b]){d[b]=d[a]+1;qu.push(b)}}return d}
function worldMap(){syncView();const m=MAPS[P.map],ok=m.town||P.cleared[P.map];let ln='',nd='',cap='';
 const L=(a,b,on)=>'<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+(on?'#2f6fb8':'#9fb0c8')+'" stroke-width="'+(on?4:3)+'"'+(on?'':' stroke-dasharray="6 5"')+' vector-effect="non-scaling-stroke"/>';
 const B=(cls,k,x,y,ic,lb,why,attr)=>'<button class="'+cls+'"'+(attr||'')+' data-why="'+why.replace(/"/g,'&quot;')+'" style="left:'+x+'%;top:'+y+'%">'+ic+'<span>'+lb+'</span></button>';
 if(mapView==='near'||mapView==='maple'||mapView==='victoria'){
  const near=mapView==='near',keys=near?Object.keys(nearSet()):Object.keys(NAV).filter(k=>reg(k)===mapView),pos={};
  const xs=keys.map(k=>NAV[k][0]),ys=keys.map(k=>NAV[k][1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const sc=(v,lo,hi,a,b)=>hi===lo?50:a+(v-lo)/(hi-lo)*(b-a);
  keys.forEach(k=>pos[k]=near?[sc(NAV[k][0],x0,x1,9,91),sc(NAV[k][1],y0,y1,10,84)]:[NAV[k][0],NAV[k][1]]);
  const seen={};
  keys.forEach(a=>MAPS[a].ex.forEach(e=>{const b=e[0],kk=[a,b].sort().join();if(seen[kk]||!pos[b])return;seen[kk]=1;ln+=L(pos[a],pos[b],a===P.map||b===P.map)}));
  keys.forEach(k=>{const t=MAPS[k],c=pos[k];let cls='nd far',why=t.n+' is a few stops away from here.',attr='',ic=t.i;
   if(k===P.map){cls='nd here';why='You\'re in '+t.n+' right now.'}
   else{const i=m.ex.findIndex(e=>e[0]===k);if(i>=0){const e=m.ex[i],q=e[2]&&P.q[e[2]]!=='done',cl=!ok&&i>0;
    if(q||cl){cls='nd lock';ic='\u{1F512}';why=q?'The way to '+t.n+' opens once you finish "'+QD[e[2]].n+'".':'Defeat a few more monsters here before moving on ('+P.kills+'/'+needFor(m)+').'}
    else{cls='nd ok';attr=' data-g="'+k+'"';why='Head to '+t.n+'.'}}}
   nd+=B(cls,k,c[0],c[1],ic,NAV[k][2]+(t.town||!P.cleared[k]?'':' \u2713'),why,attr)});
  {const fs=ferryStubs(pos,L,B);ln+=fs[0];nd+=fs[1]}
  if(false){const sy=pos.southperry[1],f=[pos.southperry[0],sy-19>=4?sy-19:sy+19];ln+=L(pos.southperry,f,false);nd+=B('nd far','vic',f[0],f[1],'\u26F4\uFE0F','Victoria','The ferry to Victoria Island. Tap to look at its map.',' data-z="victoria"')}
 }else{const Z=PV[mapView],pos=Z.n,zn={};ZONES.forEach(z=>zn[z[0]]=z[1]);
  Z.e.forEach(e=>ln+=L(pos[e[0]],pos[e[1]],false));
  for(const k in pos){const t=pos[k],z=t[4];nd+=B('nd far'+(mapView==='world'&&k==='maple'?' here':''),k,t[0],t[1],t[3],t[2],z?'Take a look at the '+zn[z]+' map.':t[2]+' isn\'t open yet.',z?' data-z="'+z+'"':'')}
  cap=mapView==='world'?'':'Just a rough sketch of this region. You can\'t travel here yet.'}
 return '<div class="panel"><div class="row"><h2>'+(mapView==='world'?'World Map':(ZONES.find(z=>z[0]===mapView)||[0,'World Map'])[1])+'</h2></div><div class="seg ltb">'+ZONES.map(z=>'<button class="'+(z[0]===mapView?'on':'')+'" data-z="'+z[0]+'">'+z[1]+'</button>').join('')+'</div><div class="wm"><svg viewBox="0 0 100 100" preserveAspectRatio="none">'+ln+'</svg>'+nd+'</div><div class="mute" id="navcap" style="min-height:34px">'+cap+'</div></div>'}
const SHOPLIST=['red_potion','sword','hand_axe','wooden_club','long_sword'];
/* v3.2: each shop has its own prices from the data (as in v62); items without one use the item's price */
const buyPrice=k=>{const sp=P&&MAPS[P.map]&&MAPS[P.map].shopPrice;return(sp&&sp[k])||ITEMS[k].buy};
const sellVal=k=>ITEMS[k].sell||(ITEMS[k].buy?Math.floor(ITEMS[k].buy/2):0);
function itemRows(id,st){const it=ITEMS[id];if(it.w){const A=st?st[0]:eS('str'),B=st?st[1]:eS('dex'),Lk=st?st[3]:eS('luk'),mx=Math.floor((it.rng==='claw'?(Lk*it.mult+B)*(it.watk+15):it.rng?(B*it.mult+A)*it.watk:(it.dag&&!st&&P.job==='rogue')?(Lk*it.mult+A+B)*it.watk:(A*it.mult+B)*it.watk)/100);return [['Type',it.rng==='bow'?'Bow':it.rng==='xbow'?'Crossbow':it.rng==='claw'?'Claw':it.mw==='wand'?'Wand':it.mw==='staff'?'Staff':it.dag?'Dagger':'One-handed weapon'],['Weapon ATT','+'+it.watk],...(it.matk?[['Magic ATT','+'+it.matk]]:[]),['Attack cycle',it.spd+' ms'],[st?'Their damage':'Your damage',Math.max(1,Math.floor(mx*.6))+' ~ '+Math.max(1,mx)],['Required level',it.req||'None']]}
 if(it.s)return [['Type',it.s]].concat(it.def?[['Defense','+'+it.def]]:[],it.bon?Object.keys(it.bon).map(k=>[k.toUpperCase(),'+'+it.bon[k]]):[],[['Required level',it.req||'None']]);
 if(it.heal)return [['Type','Consumable'],['Restores',it.heal+' HP']];return [['Type','Etc']]}
function shopMax(){const it=ITEMS[shopSel];return shopTab==='buy'?Math.floor(P.mesos/buyPrice(shopSel)):(P.inv[shopSel]||0)}
function shopCard(){const id=shopSel,it=ITEMS[id],bm=shopTab==='buy',pr=bm?buyPrice(id):sellVal(id),mx=shopMax();shopQty=Math.max(1,Math.min(shopQty,Math.max(1,mx)));
 const lv=false,can=mx>0&&!lv,rows=itemRows(id).concat([[bm?'Price':'Sells for',pr+' mesos each'],['Owned',P.inv[id]||0]]);
 const mh=240+29*rows.length,box='<div class="mcard" style="display:flex;flex-direction:column;min-height:'+mh+'px">';
 if(shopConfirm){const n=shopQty,tot=pr*n,after=bm?P.mesos-tot:P.mesos+tot,r=(a,b)=>'<div class="mr"><span>'+a+'</span><b>'+b+'</b></div>';
  return box+'<div class="mh"><span class="mi">'+it.i+'</span><div><b>Confirm '+(bm?'purchase':'sale')+'</b><div class="mute">Please review before continuing.</div></div></div>'+r(bm?'Buying':'Selling',n+' \u00D7 '+it.n)+r('Price each',pr+' mesos')+r(bm?'Total cost':'You receive',tot+' mesos')+r('Your mesos',P.mesos+' \u2192 '+after)+'<div class="ex" style="margin-top:auto;padding-top:10px"><button class="main" id="scf">Confirm</button><button id="scn">Cancel</button></div></div>'}
 return box+'<div class="mh"><span class="mi">'+it.i+'</span><div><b>'+it.n+'</b><div class="mute">'+(DESC[id]||'A monster drop. Sell it at a shop.')+'</div></div></div>'+rows.map(r=>'<div class="mr"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('')+
 '<div class="row" style="margin-top:auto;padding-top:10px"><input id="sq" type="number" inputmode="numeric" min="1" max="'+Math.max(1,mx)+'" value="'+shopQty+'" style="width:90px;min-height:44px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit"><button id="smax">Max</button><span class="mute" id="stot" style="margin-left:auto">'+(bm?'Total: ':'You get: ')+pr*shopQty+' mesos</span></div>'+
 '<div class="ex" style="margin-top:8px"><button class="main" id="sdo"'+(can?'':' disabled')+'>'+(bm?'Buy':'Sell')+'</button><button id="sx">Close</button></div>'+(lv?'<div class="mute" style="margin-top:6px">You need to be level '+it.req+' to buy this.</div>':bm&&mx<1?'<div class="mute" style="margin-top:6px">Not enough mesos.</div>':'')+'</div>'}
const q0=(i,f)=>{const e=document.getElementById(i);if(e)e.onclick=f};
function shopPanel(){const items=shopTab==='buy'?(MAPS[P.map].shopList||SHOPLIST).map(k=>[k,0]):Object.keys(P.inv).filter(k=>ITEMS[k]&&sellVal(k)>0).map(k=>[k,P.inv[k]]);
 if(shopSel&&!items.some(e=>e[0]===shopSel))shopSel=null;if(!shopSel)shopConfirm=false;let g='';
 for(let i=0,N=Math.max(24,Math.ceil(items.length/4)*4);i<N;i++){const e=items[i];g+=e?'<button class="slot'+(shopSel===e[0]?' sel':'')+'" data-sh="'+e[0]+'" title="'+ITEMS[e[0]].n+'">'+ITEMS[e[0]].i+(e[1]>1?'<b class="qt">'+e[1]+'</b>':'')+'</button>':'<div class="slot empty"></div>'}
 return '<div class="panel"><div class="row"><h2>'+(MAPS[P.map].shopName||'Amherst General Store')+'</h2><span class="mute">'+P.mesos+' mesos</span></div><div class="tabs"><button class="'+(shopTab==='buy'?'on':'')+'" data-st="buy">Buy</button><button class="'+(shopTab==='sell'?'on':'')+'" data-st="sell">Sell</button></div>'+(shopSel?shopCard():'<div class="mute" style="margin-top:8px">'+(items.length?'':'You have nothing to sell.')+'</div>')+'<div class="ex" style="margin:6px 0"><button class="main" onclick="enchOpen()">📜 Enchanting</button></div><div class="inv">'+g+'</div><div class="ex"><button id="lv">Leave the shop</button></div></div>'}
function shopDo(){const id=shopSel,it=ITEMS[id];if(!id||!inShop)return;const n=Math.max(1,shopQty);
 if(shopTab==='buy'){if(it.req&&P.lvl<it.req)return;const c=buyPrice(id)*n;if(P.mesos<c)return log('You don\'t have enough mesos.','bad','items'),render();P.mesos-=c;P.inv[id]=(P.inv[id]||0)+n;log('Bought '+n+' '+it.n+' for '+c+' mesos.'+((it.w||it.s)?' Equip it from your inventory.':''),'good','items')}
 else{const k=Math.min(n,P.inv[id]||0);if(k<1)return;const gain=sellVal(id)*k;P.inv[id]-=k;if(P.inv[id]<=0)delete P.inv[id];P.mesos+=gain;log('Sold '+k+' '+it.n+' for '+gain+' mesos.','good','items')}
 shopQty=1;save();render()}
const PLAYERS=[];
function playersHere(){const slot=Math.floor(Date.now()/240000);return PLAYERS.filter((p,i)=>p.maps[(slot+i)%p.maps.length]===P.map)}
function meCard(){const g=publicGear();return{n:P.name,i:'🧑',lvl:P.lvl,g:'-',job:jobName(),st:[eS('str'),eS('dex'),eS('int'),eS('luk')],w:g.w,eq:g.eq}}
function profileCard(p){const gid=x=>x==='Weapon'?p.w:(p.eq||{})[x],r=(a,b)=>'<div class="mr"><span>'+a+'</span><b>'+b+'</b></div>',W2=ITEMS[p.w]||FIST,mx=Math.floor((p.st[0]*W2.mult+p.st[1])*W2.watk/100),df=Object.values(p.eq||{}).reduce((a,k)=>a+(ITEMS[k].def||0),0),vk=viewPEq&&gid(viewPEq);
 const eq='<div class="doll" style="padding:8px 0 0">'+SLOTS.map(x=>{const k=gid(x);return k?'<button class="eqs" data-pe="'+x+'"'+(viewPEq===x?' style="box-shadow:0 0 0 3px rgba(47,111,184,.35)"':'')+'><span>'+ITEMS[k].i+'</span><small>'+ITEMS[k].n+'</small></button>':'<div class="emp"><small>'+x+'</small></div>'}).join('')+'</div>';
 const det=vk?'<div style="border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:6px;background:#fff"><div class="mh"><span class="mi">'+ITEMS[vk].i+'</span><div><b>'+ITEMS[vk].n+'</b><div class="mute">'+(DESC[vk]||'')+'</div></div></div>'+itemRows(vk,p.st).map(q=>r(q[0],q[1])).join('')+'</div>':'';
 return '<div class="mcard"><div class="mh"><span class="mi">'+p.i+'</span><div><b>'+p.n+'</b><div class="mute">Lv '+p.lvl+' &middot; '+(p.job||'Beginner')+'</div></div></div>'+r('Level',p.lvl)+r('Guild',p.g)+r('STR',p.st[0])+r('DEX',p.st[1])+r('INT',p.st[2])+r('LUK',p.st[3])+r('Attack',Math.max(1,Math.floor(mx*.6))+' ~ '+Math.max(1,mx))+r('Defense',df)+'<div class="mute" style="margin-top:8px">Equipment'+''+'</div>'+det+eq+'<div class="ex" style="margin-top:10px"><button id="plx">Close</button></div></div>'}
function playersPanel(){const ps=playersHere();if(!ps.length){viewPlayer=null;return ''}if(viewPlayer&&!ps.some(p=>p.n===viewPlayer))viewPlayer=null;const v=ps.find(p=>p.n===viewPlayer);
 return '<div class="panel"><h2>Players Here</h2>'+(v?profileCard(v):'')+'<div class="ex">'+ps.map(p=>'<button data-pl="'+p.n+'"'+(viewPlayer===p.n?' class="on"':'')+'>'+p.i+' '+p.n+' <span class="mute">Lv '+p.lvl+'</span></button>').join('')+'</div></div>'}

function townArt(id){
 const T=(x,y,r)=>'<rect x="'+(x-2)+'" y="'+y+'" width="4" height="'+r*.9+'" fill="#7a5230"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#3f8f3a"/><circle cx="'+(x-r*.4)+'" cy="'+(y+r*.2)+'" r="'+r*.65+'" fill="#4fa548"/>',
 hs=(x,y,w,c)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+w*.7+'" fill="#f4e3b8"/><path d="M'+(x-w*.18)+' '+(y+2)+' Q'+(x+w/2)+' '+(y-w*.9)+' '+(x+w*1.18)+' '+(y+2)+'Z" fill="'+c+'"/><circle cx="'+(x+w*.3)+'" cy="'+(y-w*.2)+'" r="'+w*.08+'" fill="#fff"/><circle cx="'+(x+w*.65)+'" cy="'+(y-w*.36)+'" r="'+w*.1+'" fill="#fff"/><rect x="'+(x+w*.4)+'" y="'+(y+w*.3)+'" width="'+w*.2+'" height="'+w*.4+'" fill="#8a5a2b"/>',
 gh=(x,y,w,h,c)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="#ead7ab"/><polygon points="'+(x-4)+','+y+' '+(x+w/2)+','+(y-w*.45)+' '+(x+w+4)+','+y+'" fill="'+c+'"/><rect x="'+(x+w*.14)+'" y="'+(y+h*.22)+'" width="'+w*.24+'" height="'+w*.24+'" fill="#9cc7e8"/><rect x="'+(x+w*.56)+'" y="'+(y+h*.4)+'" width="'+w*.26+'" height="'+h*.6+'" fill="#8a5a2b"/>',
 gull=(x,y)=>'<path d="M'+x+' '+y+' q4 -5 8 0 q4 -5 8 0" fill="none" stroke="#fff" stroke-width="1.5"/>',
 sn=(x,y,k,c)=>'<ellipse cx="'+x+'" cy="'+(y+5*k)+'" rx="'+11*k+'" ry="'+4*k+'" fill="#f6c46a"/><circle cx="'+(x-2*k)+'" cy="'+y+'" r="'+6*k+'" fill="'+c+'"/><circle cx="'+(x-2*k)+'" cy="'+y+'" r="'+2.5*k+'" fill="none" stroke="#fff" stroke-width="'+k+'" opacity=".7"/><circle cx="'+(x+9*k)+'" cy="'+(y+2*k)+'" r="'+1.4*k+'" fill="#222"/>',
 mu=(x,y,r,c)=>'<rect x="'+(x-r*.28)+'" y="'+y+'" width="'+r*.56+'" height="'+r*.7+'" fill="#f4e3b8"/><path d="M'+(x-r)+' '+(y+2)+' Q'+x+' '+(y-r*1.5)+' '+(x+r)+' '+(y+2)+'Z" fill="'+c+'"/><circle cx="'+(x-r*.35)+'" cy="'+(y-r*.35)+'" r="'+r*.14+'" fill="#fff"/><circle cx="'+(x+r*.3)+'" cy="'+(y-r*.6)+'" r="'+r*.16+'" fill="#fff"/>',
 fl=(a,y0)=>a.map((x,i)=>'<circle cx="'+x+'" cy="'+(y0+(i%3)*5)+'" r="2.2" fill="'+['#ff9ec4','#ffe066','#fff'][i%3]+'"/>').join(''),
 hills='<path d="M0 90 Q80 64 160 86 T320 78 V130 H0Z" fill="#86c765"/>',
 sky='<defs><linearGradient id="tsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b97d1"/><stop offset="1" stop-color="#d4ecfa"/></linearGradient></defs><rect width="320" height="130" fill="url(#tsk)"/>',
 cloud='<ellipse cx="62" cy="26" rx="26" ry="8" fill="#fff" opacity=".85"/><ellipse cx="80" cy="22" rx="16" ry="7" fill="#fff" opacity=".85"/><ellipse cx="238" cy="38" rx="22" ry="6" fill="#fff" opacity=".8"/>',
 sun='<circle cx="276" cy="24" r="13" fill="#fff0a6"/>';let b='';
 if(id==='mushroom_town')b=sky+sun+cloud+'<path d="M0 92 Q70 62 140 88 T320 78 V130 H0Z" fill="#86c765"/><path d="M0 108 Q90 94 170 106 T320 98 V130 H0Z" fill="#5fa84a"/><path d="M150 130 Q158 112 205 106 T320 103 V113 Q245 116 196 124 T178 130Z" fill="#e8d3a0"/>'+T(22,80,15)+hs(40,84,34,'#e0503a')+hs(100,76,44,'#f08a24')+hs(196,84,30,'#d94a7a')+T(298,78,16)+'<path d="M232 108 q4 -10 8 0z" fill="#e0503a"/><rect x="235" y="108" width="3" height="5" fill="#f4e3b8"/>';
 else if(id==='a_split_road')b=sky+sun+cloud+'<path d="M0 84 Q80 58 160 80 T320 70 V130 H0Z" fill="#86c765"/><path d="M0 104 Q100 90 200 102 T320 96 V130 H0Z" fill="#5fa84a"/><path d="M130 130 L150 104 Q154 92 128 80 L102 66 L112 62 L146 80 Q164 90 170 100 Q180 88 206 76 L226 66 L234 70 L196 90 Q176 100 182 112 L196 130Z" fill="#e8d3a0"/>'+T(36,84,16)+T(66,92,12)+T(284,82,16)+T(302,92,11)+'<rect x="160" y="82" width="5" height="26" fill="#7a5230"/><polygon points="136,84 160,84 166,89 160,94 136,94" fill="#c98f4a"/><polygon points="188,98 166,98 160,103 166,108 188,108" fill="#d9a15c"/>';
 else if(id==='amherst')b=sky+sun+cloud+'<path d="M0 100 Q90 88 180 98 T320 92 V130 H0Z" fill="#6fb552"/><rect y="104" width="320" height="26" fill="#d9c79a"/>'+gh(22,66,44,38,'#b5523b')+gh(76,72,36,32,'#3f7fb0')+'<rect x="132" y="48" width="58" height="56" fill="#efe1bd"/><polygon points="128,48 161,22 194,48" fill="#a8452f"/><rect x="152" y="80" width="18" height="24" fill="#8a5a2b"/><rect x="141" y="58" width="12" height="12" fill="#9cc7e8"/><rect x="169" y="58" width="12" height="12" fill="#9cc7e8"/><rect x="160" y="8" width="2" height="16" fill="#6b4a2a"/><polygon points="162,8 176,12 162,16" fill="#e0503a"/>'+gh(210,70,38,34,'#c06a2a')+gh(262,64,42,40,'#4d8a4a')+'<g fill="#a8794a"><rect x="0" y="108" width="320" height="3"/></g>'+T(110,92,11);
 else if(id==='southperry')b=sky+sun+'<ellipse cx="62" cy="24" rx="24" ry="7" fill="#fff" opacity=".85"/>'+gull(120,34)+gull(150,26)+gull(232,40)+'<rect y="76" width="320" height="54" fill="#3d86c6"/><path d="M0 84 q10 -4 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" fill="none" stroke="#9fd0f0" stroke-width="1.5"/><path d="M0 108 Q60 96 130 104 T210 106 V130 H0Z" fill="#ecd9a0"/><rect x="120" y="100" width="150" height="7" fill="#9b6b3a"/><g fill="#7a5230"><rect x="132" y="100" width="4" height="22"/><rect x="176" y="100" width="4" height="22"/><rect x="220" y="100" width="4" height="22"/><rect x="262" y="100" width="4" height="22"/></g><path d="M210 82 h60 l-8 14 h-44z" fill="#8a4b2a"/><rect x="238" y="46" width="3" height="38" fill="#6b4a2a"/><polygon points="241,48 266,78 241,78" fill="#f7f1df"/><polygon points="237,52 220,78 237,78" fill="#e8dfc6"/><rect x="26" y="52" width="16" height="50" fill="#f3f3f3"/><polygon points="24,52 34,38 44,52" fill="#d84a3a"/><rect x="26" y="70" width="16" height="8" fill="#d84a3a"/><rect x="30" y="58" width="8" height="6" fill="#ffe27a"/><rect x="58" y="94" width="14" height="12" fill="#b98a52"/><rect x="72" y="98" width="12" height="8" fill="#a67a45"/>';
 else if(id==='training_camp')b=sky+sun+cloud+hills+'<path d="M0 104 Q100 92 200 102 T320 98 V130 H0Z" fill="#cdb67f"/>'+[...Array(13)].map((_,i)=>'<rect x="'+(6+i*26)+'" y="86" width="4" height="20" fill="#8a5a2b"/>').join('')+'<rect y="92" width="320" height="3" fill="#a8794a"/><polygon points="36,106 70,60 104,106" fill="#d9c08a"/><polygon points="62,106 70,80 78,106" fill="#8a6a3a"/><rect x="69" y="50" width="2" height="12" fill="#6b4a2a"/><polygon points="71,50 82,54 71,58" fill="#e0503a"/><rect x="170" y="78" width="5" height="30" fill="#7a5230"/><circle cx="172" cy="74" r="7" fill="#d9b36a"/><rect x="160" y="84" width="25" height="4" fill="#7a5230"/><circle cx="228" cy="86" r="12" fill="#fff"/><circle cx="228" cy="86" r="8" fill="#e0503a"/><circle cx="228" cy="86" r="4" fill="#fff"/><rect x="226" y="98" width="4" height="10" fill="#7a5230"/>'+sn(270,112,1,'#e0503a');
 else if(id==='snail_hunting_ground_1')b=sky+sun+cloud+hills+'<rect y="96" width="320" height="34" fill="#6fb552"/>'+T(26,78,14)+T(296,80,13)+fl([20,50,84,120,150,190,214,246,282,308],104)+sn(70,110,1,'#e0503a')+sn(160,114,1.1,'#3f8fe0')+sn(250,106,.9,'#e0503a');
 else if(id==='snail_hunting_ground_2')b=sky+sun+cloud+hills+'<rect y="96" width="320" height="34" fill="#68ae4d"/><rect x="292" y="66" width="28" height="64" fill="#8f8a78"/><rect x="292" y="66" width="28" height="6" fill="#a8a392"/>'+T(24,80,15)+fl([14,44,74,108,138,172,206,240,270],106)+sn(46,112,1,'#3f8fe0')+sn(104,106,.9,'#e0503a')+sn(150,116,1.1,'#e0503a')+sn(208,108,1,'#3f8fe0')+sn(256,114,1,'#e0503a');
 else if(id==='field_west_of_amherst')b=sky+sun+cloud+hills+'<rect y="98" width="320" height="32" fill="#7cbf5a"/><rect x="256" y="54" width="28" height="56" fill="#7a5230"/><circle cx="270" cy="48" r="32" fill="#3f8f3a"/><circle cx="252" cy="58" r="20" fill="#4fa548"/><rect x="264" y="86" width="12" height="24" rx="5" fill="#d9a15c"/>'+[24,58,92,126].map((x,i)=>'<rect x="'+x+'" y="'+(86+i%2*4)+'" width="2" height="22" fill="#4a8a3a"/><circle cx="'+(x+1)+'" cy="'+(84+i%2*4)+'" r="7" fill="#ffd23f"/><circle cx="'+(x+1)+'" cy="'+(84+i%2*4)+'" r="3" fill="#7a4a1a"/>').join('')+sn(168,112,1,'#e0503a')+mu(206,104,11,'#f08a24')+mu(226,110,9,'#d94a7a');
 else if(id==='mushroom_garden')b=sky+'<rect y="62" width="320" height="30" fill="#a9a59a"/>'+[...Array(10)].map((_,i)=>'<rect x="'+(i*32)+'" y="62" width="1.5" height="30" fill="#8d897d"/>').join('')+'<rect y="76" width="320" height="1.5" fill="#8d897d"/><rect y="90" width="320" height="40" fill="#5fa84a"/>'+T(16,52,16)+T(304,50,17)+fl([20,60,100,140,180,220,260,300],120)+mu(46,102,16,'#e0503a')+mu(104,106,22,'#f08a24')+mu(170,100,14,'#d94a7a')+mu(232,106,24,'#e0503a')+mu(292,102,15,'#f08a24');
 else if(id==='field_east_of_amherst')b=sky+sun+cloud+hills+'<rect x="226" y="76" width="94" height="14" fill="#3d86c6"/><rect x="268" y="56" width="2" height="22" fill="#6b4a2a"/><polygon points="270,58 286,76 270,76" fill="#f7f1df"/><rect y="98" width="320" height="32" fill="#7cbf5a"/><path d="M0 120 Q120 106 320 110 V120 Q150 122 0 130Z" fill="#e8d3a0"/>'+T(28,78,15)+T(120,84,12)+T(212,82,13)+sn(70,108,1,'#e0503a')+sn(168,112,1,'#3f8fe0')+mu(252,104,12,'#f08a24')+mu(300,108,10,'#f08a24');
 else return '';
 return '<svg viewBox="0 0 320 130" role="img" aria-label="'+MAPS[id].n+'" style="width:100%;display:block;border-radius:8px;margin-bottom:8px">'+b+'</svg>'}
function introHtml(){return '<div class="intro"><div class="mcard"><div class="mh"><span class="mi">\u{1F3DD}\uFE0F</span><div><b>Welcome to Maple Island</b><div class="mute">Your journey begins</div></div></div>'+
 '<p>Like every would-be adventurer in the Maple World, you have come to <b>Maple Island</b>, a small island off the great continent of Victoria Island, to learn the ropes before setting out into the wider world.</p>'+
 '<p>You are in <b>Mushroom Town</b>, a quiet village of mushroom-roofed houses. Heena, Sera and Roger are happy to help newcomers.</p>'+
 '<p><b>Your first steps</b></p><ol style="margin:0 0 8px 18px;padding:0"><li>Talk to <b>Roger</b> to learn about items.</li><li>Talk to <b>Todd</b> to learn how to fight.</li><li>Hunt Snails, take quests, and reach <b>level 7</b> (Magicians advance at 8, everyone else at 10). Then the ferry from Southperry takes you to Victoria Island.</li></ol>'+
 '<div class="ex" style="margin-top:10px"><button class="main" id="introgo" style="flex:1">Begin my journey</button></div></div></div>'}
const SKL={three:['🐌','Three Snails'],rec:['💖','Recovery'],feet:['👟','Nimble Feet']};
/* Quickslots: 8 skill slots (pages A/B). 'basic' is the normal attack, treated like a skill so it can be moved or swapped. */
function qsSync(){if(!Array.isArray(P.qs))P.qs=['basic'];P.qs=Array.from({length:8},(_,i)=>P.qs[i]||null);if(!Array.isArray(P.qseen))P.qseen=[];
 for(const k in SKL)if(P.sk[k]&&!P.qseen.includes(k)){P.qseen.push(k);if(!P.qs.includes(k)){const e=P.qs.indexOf(null);if(e>=0)P.qs[e]=k}}
 P.qs=P.qs.map(k=>(k==='basic'||(SKL[k]&&P.sk[k]))?k:null);
 if(!P.qs.includes('basic')){const e=P.qs.indexOf(null);P.qs[e>=0?e:0]='basic'}}
function qsSet(i,k){qsSync();const old=P.qs[i];if(k){const j=P.qs.indexOf(k);if(j>=0&&j!==i)P.qs[j]=old||null}P.qs[i]=k||null;qsSync();save()}
function qsUse(k){if(k==='basic')attack();else if(k==='three')skThree();else if(k==='rec')skRec();else if(k==='feet')skFeet()}
function qsInfo(k,now){const far=!!enc&&enc.gap>wReach(),t=v=>(v/1000).toFixed(1)+'s';
 if(!k)return{ic:qEdit?'+':'&middot;',nm:'Empty',sub:'',dis:true};
 if(k==='basic'){const l=Math.max(atkReady(),lastMv+moveCd())-now;return{ic:W().i||'\u2694\uFE0F',nm:'Attack',sub:!enc?'Basic':far?'Too far':l>0?t(l):'Ready',dis:!enc||far||l>0}}
 if(k==='three'){const l=Math.max(lastSk+1500,atkReady(),lastMv+moveCd())-now;return{ic:SKL.three[0],nm:'3 Snails',sub:enc&&l>0?t(l):sk3cost()+' MP',dis:!enc||l>0||P.mp<sk3cost()||enc.gap>SK3R}}
 if(k==='rec'){const l=cd.rec-now;return{ic:SKL.rec[0],nm:'Recovery',sub:l>0?Math.ceil(l/1000)+'s':recMp()+' MP',dis:l>0||P.mp<recMp()}}
 if(k==='feet'){const l=cd.feet-now;return{ic:SKL.feet[0],nm:'Nimble',sub:l>0?Math.ceil(l/1000)+'s':feetMp()+' MP',dis:l>0||P.mp<feetMp()}}
 return{ic:'',nm:'',sub:'',dis:true}}
function qsInner(f){return '<span class="qi">'+f.ic+'</span><span class="qn">'+f.nm+'</span><small>'+f.sub+'</small>'}
function qsBtn(i){const f=qsInfo(P.qs[i],Date.now());return '<button class="sk qk'+(qEdit?' qe':'')+(qPick&&qPick.t==='s'&&qPick.i===i?' qsel':'')+'" id="qs'+i+'" data-qs="'+i+'"'+(!qEdit&&f.dis?' disabled':'')+'>'+qsInner(f)+'</button>'}
function qPickHtml(){if(!qEdit||!qPick)return '';let o='',cur;
 if(qPick.t==='s'){cur=P.qs[qPick.i];const opts=['basic'].concat(Object.keys(SKL).filter(k=>P.sk[k]));
  o=opts.map(k=>'<button data-qpv="'+k+'"'+(cur===k?' class="cur"':'')+'>'+(k==='basic'?(W().i||'\u2694\uFE0F')+' Attack':SKL[k][0]+' '+SKL[k][1])+(cur===k?' \u2713':'')+'</button>').join('');
  if(cur!=='basic')o+='<button data-qpv="">Empty slot</button>'}
 else{cur=P.pq[qPick.i];const ids=Object.keys(ITEMS).filter(id=>(ITEMS[id].heal||ITEMS[id].mpheal||ITEMS[id].hpp||ITEMS[id].mpp)&&(P.inv[id]>0||id===cur));
  o=ids.map(id=>'<button data-qpv="'+id+'"'+(cur===id?' class="cur"':'')+'>'+ITEMS[id].i+' '+ITEMS[id].n+' x'+(P.inv[id]||0)+(cur===id?' \u2713':'')+'</button>').join('')+(ids.length?'':'<span class="mute">No potions in your bag.</span>')+(cur?'<button data-qpv="">Empty slot</button>':'')}
 return '<div class="qp"><div class="mute">'+(qPick.t==='s'?'Skill slot '+(skPage*4+(qPick.i%4)+1):'Potion slot '+(qPick.i+1))+': choose what goes here</div><div class="qpl">'+o+'</div></div>'}
function quickBar(){qsSync();let g='';for(let i=0;i<4;i++)g+=qsBtn(skPage*4+i);g+='<div class="qsp"></div>'+pqBtn(0)+pqBtn(1);
 return '<div class="row" style="margin-top:8px"><span class="mute">'+(qEdit?'Tap a slot to change it':'Quickslots')+'</span><span class="seg"><button class="'+(skPage?'':'on')+'" data-skp="0">A</button><button class="'+(skPage?'on':'')+'" data-skp="1">B</button><button class="'+(qEdit?'on':'')+'" data-qe="1">'+(qEdit?'Done':'Edit')+'</button></span></div><div class="qgrid">'+g+'</div>'+qPickHtml()}
function quickPanel(){return '<div class="panel">'+quickBar()+'</div>'}
function skTick(now){if(!P||!P.qs)return;for(let i=0;i<2;i++){const e=$('pq'+i);if(!e)continue;const id=P.pq[i],it=id&&ITEMS[id],n=it?(P.inv[id]||0):0;e.disabled=qEdit?false:(!it||n<1||lastPot+1000>now);const h=pqInner(i);if(e.innerHTML!==h)e.innerHTML=h}
 app.querySelectorAll('[data-qs]').forEach(e=>{const i=+e.dataset.qs,f=qsInfo(P.qs[i],now);e.disabled=qEdit?false:f.dis;const h=qsInner(f);if(e.innerHTML!==h)e.innerHTML=h})}
const SKD={
 three:{ic:'🐌',nm:'Three Snails',max:3,ty:'Active',d:'Hurls snails to attack monsters from long distance.',fx:n=>'Damage '+[10,25,40][n-1]+' (never misses). No shells needed',mp:n=>[3,5,7][n-1],cd:()=>'None',du:()=>'-'},
 rec:{ic:'💖',nm:'Recovery',max:3,ty:'Supportive',d:'Enables the user to recover HP constantly for 30 sec.',fx:n=>'Recover '+[24,48,72][n-1]+' HP in 30 sec',mp:n=>[5,10,15][n-1],cd:()=>'10 min',du:()=>'30 s'},
 feet:{ic:'👟',nm:'Nimble Feet',max:3,ty:'Supportive',d:'Enables the character to move around quickly for a short amount of time.',fx:n=>'Speed +'+[10,15,20][n-1]+' for '+[4,8,12][n-1]+' sec',mp:n=>[4,7,10][n-1],cd:()=>'15 min',du:n=>[4,8,12][n-1]+' s'}
};
const SKTABS=['Beginner','1st Job','2nd Job','3rd Job','4th Job'];
let skTab=0,skSel=null,skSeen=null;const skLab=x=>x===0?'Beginner':(x===1&&P.job?jobName():SKTABS[x]);
function skDetail(k){const d=SKD[k],n=P.sk[k]|0,l=Math.max(1,n),mpt=d.mp(l)+(n>0&&n<d.max&&d.mp(n+1)!==d.mp(l)?' → '+d.mp(n+1):'');
 return '<div class="panel" style="margin:4px 10px 8px"><div class="row"><h2>'+d.ic+' '+d.nm+'</h2><span class="pill b">Lv '+n+'/'+d.max+'</span></div><div class="mute">'+d.ty+' skill · Beginner</div><div style="margin:8px 0">'+d.d+'</div>'
 +(n>0?'<div><b>Current (Lv '+n+'):</b> '+d.fx(n)+'</div>':'<div class="mute">Not learned yet.</div>')
 +(n<d.max?'<div><b>Next (Lv '+(n+1)+'):</b> '+d.fx(n+1)+'</div>':'<div><b>Max level reached.</b></div>')
 +'<div class="mute" style="margin-top:6px">MP cost: '+mpt+' · Cooldown: '+d.cd(l)+' · Duration: '+d.du(l)+'</div>'
 +'<div class="ex" style="margin-top:8px"><button class="main" data-k="'+k+'" '+(P.sp&&n<d.max?'':'disabled')+'>Upgrade (1 SP)</button><button data-sks="">Close</button></div></div>'}
const FEAT=[['party','👥','Party'],['chat','💬','Chat'],['guild','🛡️','Guild'],['market','🏪','Free Market'],['family','🌳','Family'],['friends','🤝','Buddies'],['skills','✨','Skills'],['quests','📜','Quests'],['equip','🎽','Equipment'],['mail','✉️','Mail'],['cash','💎','Cash Shop'],['rank','🏆','Ranking'],['book','📖','Monster Book'],['pets','🐾','Pets'],['trade','🔁','Trade'],['events','🎉','Events'],['mini','🎲','Mini Games'],['settings','⚙️','System']];
const mr=(ic,t,sub,r)=>'<div class="mrow"><span class="av">'+ic+'</span><div style="flex:1"><div>'+t+'</div><div class="mute">'+sub+'</div></div>'+(r||'')+'</div>';
const dis=t=>'<button disabled>'+t+'</button>',chips=a=>'<div class="chips">'+a.map(dis).join('')+'</div>',pad=t=>'<div class="pad mute">'+t+'</div>';
function featBody(id){if(IRON()&&LOCKED.includes(id))return '<div class="pad">🔒 Ironmen can\'t use this.</div>';const nm=P.name.replace(/[<>&]/g,''),I=ITEMS;
 switch(id){
 case 'skills':{if(skSeen!==P.name){skSeen=P.name;skTab=P.job?1:0}const tb='<div class="tabs" style="padding:0 10px">'+SKTABS.map((t,x)=>'<button class="'+(skTab===x?'on':'')+'" style="font-size:11px;padding:10px 2px" data-skt="'+x+'">'+skLab(x)+'</button>').join('')+'</div>';
  const hd=pad('Class: <b>'+jobName()+'</b> &middot; Skill points: <b>'+P.sp+'</b>');
  if(skTab===1&&P.job)return tb+hd+warList();if(skTab>0)return tb+hd+'<div class="pad" style="text-align:center"><div style="font-size:40px">🔒</div><b>'+SKTABS[skTab]+' skills</b><div class="mute">You haven\'t advanced to the '+SKTABS[skTab].toLowerCase()+' yet. Job advancement is coming later.</div></div>';
  return tb+hd+Object.keys(SKD).map(k=>{const d=SKD[k],n=P.sk[k]|0,on=skSel===k;
   return '<div class="mrow" data-sks="'+k+'" style="cursor:pointer'+(on?';background:#fff3c4':'')+'"><span class="av">'+d.ic+'</span><div style="flex:1"><div>'+d.nm+' <span class="pill b">Lv '+n+'/'+d.max+'</span></div><div class="mute">'+d.fx(Math.max(1,n))+'</div></div><button class="plus" data-k="'+k+'" '+(P.sp&&n<d.max?'':'disabled')+'>+</button></div>'+(on?skDetail(k):'')}).join('')}
 case 'equip':return (pop?'<div style="padding:0 10px">'+popHtml()+'</div>':'')+eqDoll();
 case 'cash':return '<div class="doll">'+[['💎','Gem pack'],['🎨','Hair coupon'],['🐾','Pet egg'],['🛍️','Style box'],['⏱️','EXP coupon'],['📦','Slot expander'],['🎀','Cosmetic'],['💬','Megaphone']].map(x=>'<div>'+x[0]+'<small>'+x[1]+'</small></div>').join('')+'</div>'+pad('The Cash Shop now has its own tab.');
 case 'book':return '<div class="doll">'+Object.keys(MON).map(k=>'<div>'+MON[k].i+'<small>'+MON[k].n+'</small></div>').join('')+'</div>'+pad('Card collection and drop lists will show here.');
 case 'pets':return mr('🐶','Mini Dog','Lv 1 · Closeness 0/1','<span class="pill b">Preview</span>')+pad('Pets follow you, pick up loot and can be fed. Not in this test build.')+chips(['Feed','Rename','Equip']);
 case 'trade':return pad('Safe one-to-one trading with a confirm step.')+'<div class="doll">'+[1,2,3,4,5,6,7,8].map(()=>'<div>➕</div>').join('')+'</div>'+chips(['Mesos','Lock','Confirm','Cancel']);
 case 'events':return mr('🎉','Double EXP weekend','Coming soon','<span class="pill g">Soon</span>')+mr('🎃','Seasonal hunt','Coming soon','<span class="pill g">Soon</span>')+mr('📅','Daily check-in','Coming soon','<span class="pill g">Soon</span>');
 case 'mini':return mr('🃏','Match cards','Play with a friend','')+mr('⭕','Omok','Play with a friend','')+chips(['Create room','Join room']);
 case 'settings':return mr('🔊','Sound','On','')+mr('🌐','Language','English','')+mr('🔔','Notifications','Off','')+mr('🎨','Theme','Classic blue','')+pad('Sound, language, notifications and theme are previews and do not change anything yet.')+'<div class="pad ex"><button id="stchars">Character select</button><button id="stout">Log out</button></div>';
 }return ''}
const $=id=>document.getElementById(id),app=$('app');
function bar(c,v,m){return'<div class="bar"><i style="width:'+Math.max(0,Math.min(100,v/m*100))+'%;background:'+c+'"></i></div>'}
/* ===== GMS v62 style character creation: gender, face, hair, hair colour, skin, top, bottom, shoes, weapon ===== */
const LK={g:['Male','Female'],skin:[['Light','#f7d9bd'],['Tan','#e8b98c'],['Brown','#b97c52'],['Dark','#7a4a30']],
 hc:[['Black','#2b2b2b'],['Brown','#6b3f1f'],['Blonde','#e5c35a'],['Red','#b5382a'],['Blue','#3b6fc4'],['Green','#3f9a54'],['Pink','#e58bb5'],['White','#e8e8e8']],
 face:['Motivated Look','Perplexed Stare','Leisure Look','Smile','Surprised','Sleepy'],
 hair:[['Toben','Zeta','Rebel','Buzz Cut'],['Pigtails','Long Wavy','Bob','Ponytail']],
 top:[['White Undershirt','#f4f4f4'],['Undershirt','#e9e3d3'],['Grey Tank Top','#8c8f96'],['Red-Striped Top','#d65a4a']],
 bot:[['Blue Jean Shorts','#3d63a8'],['Brown Cotton Shorts','#8a6a44'],['Red Hwarang Pants','#b53a3a'],['Gray Cotton Shorts','#7a7f88']],
 shoe:[['Red Rubber Boots','#c43a3a'],['Leather Sandals','#b0875a'],['Yellow Rubber Boots','#e3c13a'],['Blue Rubber Boots','#3d6fc4']],
 wep:['sword','hand_axe','wooden_club']};
[['top','Top','top','👕'],['bot','Bottom','bottom','🩳'],['shoe','Shoes','shoes','🥾']].forEach(a=>LK[a[0]].forEach((x,i)=>{const id=a[2]+'_c'+i;ITEMS[id]={n:x[0],i:a[3],s:a[1],req:0,buy:20,def:1,bon:null};DESC[id]='Your starting '+x[0].toLowerCase()+', picked at character creation.'}));
let cc=null;const ccDef=()=>({g:0,face:0,hair:0,hc:0,skin:0,top:0,bot:0,shoe:0,wep:0});const ccReset=()=>{cc=ccDef()};
function ccAvatar(){const c=cc,sk=LK.skin[c.skin][1],hc=LK.hc[c.hc][1],tp=LK.top[c.top][1],bt=LK.bot[c.bot][1],sh=LK.shoe[c.shoe][1],hs=c.hair%4,m=c.face%3,W=ITEMS[LK.wep[c.wep]];
 return '<svg viewBox="0 0 90 110" style="width:120px;display:block;margin:6px auto"><rect x="0" y="0" width="90" height="110" rx="10" fill="#dff0fb"/>'+(hs===1||c.g&&hs!==3?'<rect x="26" y="18" width="30" height="38" rx="10" fill="'+hc+'"/>':'')+'<rect x="30" y="46" width="22" height="26" rx="4" fill="'+tp+'" stroke="#0003"/><rect x="30" y="72" width="22" height="14" fill="'+bt+'" stroke="#0003"/><rect x="31" y="86" width="7" height="9" fill="'+sk+'"/><rect x="44" y="86" width="7" height="9" fill="'+sk+'"/><rect x="29" y="95" width="10" height="7" rx="2" fill="'+sh+'"/><rect x="43" y="95" width="10" height="7" rx="2" fill="'+sh+'"/><rect x="21" y="48" width="8" height="20" rx="3" fill="'+sk+'"/><rect x="53" y="48" width="8" height="20" rx="3" fill="'+sk+'"/><circle cx="41" cy="32" r="14" fill="'+sk+'"/>'
 +(hs===3?'<circle cx="58" cy="26" r="6" fill="'+hc+'"/>':'')+(hs===1?'<polygon points="27,26 31,10 37,20 41,8 47,20 52,10 55,26" fill="'+hc+'"/>':'<path d="M27 30 Q28 14 41 14 Q54 14 55 30 Q41 22 27 30Z" fill="'+hc+'"/>')
 +'<circle cx="36" cy="33" r="1.8" fill="#222"/><circle cx="46" cy="33" r="1.8" fill="#222"/><path d="'+(m===0?'M37 40 H45':m===1?'M37 42 Q41 38 45 42':'M37 39 Q41 44 45 39')+'" stroke="#a33" fill="none" stroke-width="1.5"/><text x="63" y="66" font-size="16">'+W.i+'</text></svg>'}
function ccHtml(){if(!cc)ccReset();const row=(l,k,a)=>'<div class="mute" style="margin-top:6px">'+l+'</div><div class="seg ltb">'+a.map((x,i)=>'<button class="'+(cc[k]===i?'on':'')+'" data-cc="'+k+':'+i+'">'+x+'</button>').join('')+'</div>';
 return '<div class="mcard" style="margin:10px 0">'+ccAvatar()+row('Gender','g',LK.g)+row('Face','face',LK.face)+row('Hair','hair',LK.hair[cc.g])+row('Hair colour','hc',LK.hc.map(x=>x[0]))+row('Skin','skin',LK.skin.map(x=>x[0]))+row('Top','top',LK.top.map(x=>x[0]))+row('Bottom','bot',LK.bot.map(x=>x[0]))+row('Shoes','shoe',LK.shoe.map(x=>x[0]))+row('Weapon','wep',LK.wep.map(x=>ITEMS[x].n))+'</div>'}
const _nc=newChar;newChar=function(v,st){const p=_nc(v,st),c=cc||ccDef();p.look={g:LK.g[c.g],face:LK.face[c.face],hair:LK.hair[c.g][c.hair],hc:LK.hc[c.hc][0],skin:LK.skin[c.skin][0]};p.eq={Top:'top_c'+c.top,Bottom:'bottom_c'+c.bot,Shoes:'shoes_c'+c.shoe};p.weapon=LK.wep[c.wep];return p};
let rollSt=null;
function rollStats(){const o={str:4,dex:4,int:4,luk:4},k=['str','dex','int','luk'];for(let i=0;i<9;i++)o[k[R(0,3)]]++;return o}
function login(nm){if(!rollSt){rollSt=rollStats();ccReset()}
 app.innerHTML='<div class="scr"><div class="panel"><h2>Create your character</h2><div class="mute" style="margin-bottom:6px"><b>'+MODES[MODE()][0]+'</b>: '+MODES[MODE()][2]+' This can\'t be changed later.</div><input id="nm" maxlength="12" placeholder="Character name (4-12 letters or digits)">'+ccHtml()+'<div class="row" style="margin:12px 0">'+['str','dex','int','luk'].map(k=>'<div style="text-align:center"><div class="mute">'+k.toUpperCase()+'</div><div style="font-size:30px">'+rollSt[k]+'</div></div>').join('')+'</div>'+rollTips(rollSt)+'<div class="mute">Each stat rolls between 4 and 13 and the four always total 25. Roll again until you like them.</div></div><div class="foot"><button id="cback">Back</button><button id="roll">Roll dice</button><button class="main" id="go">Start</button></div></div>';
 if(nm)$('nm').value=nm;app.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>{const a=b.dataset.cc.split(':');cc[a[0]]=+a[1];if(a[0]==='g')cc.hair=0;login($('nm').value)});
 $('cback').onclick=()=>{scr='chars';render()};
 $('roll').onclick=()=>{const v=$('nm').value;rollSt=rollStats();login(v)};
 $('go').onclick=()=>{const v=$('nm').value.trim();if(!/^[A-Za-z0-9]{4,12}$/.test(v))return $('nm').style.borderColor='#d4553f';confirmNew(v,()=>{P=newChar(v,rollSt);scr='game';rollSt=null;tab='play';ptab='equip';feat=null;cview=null;pop=null;sel=null;inShop=false;talk=null;selNpc=null;viewPlayer=null;introOpen=true;log('Welcome, '+v+'. Talk to the guide to begin the tutorial.');save();render()})}}

/* ===== Maple Island database (artalemaplestory.com map list) ===== */
MON.pig={n:'Pig',i:'🐖',lv:7,hp:60,exp:12,av:4,atk:[8,12],iv:1700,m:[8,16],e:'pig_ribbon'};
ITEMS.pig_ribbon={n:'Pig Ribbon',i:'🎀',sell:10};
['a_split_road'].forEach(k=>{delete MAPS[k];delete NAV[k]});
const SM=(id,o)=>{MAPS[id]=Object.assign(MAPS[id]||{i:'🌿',need:8,mons:[],art:['#5fa84a','#3f8f3a']},o)};
const TN='mushroom_town',AM='amherst';
SM('mushroom_west',{n:'Mushroom Village West Entrance',i:'🌅',d:'The west gate of Mushroom Village, where new explorers arrive. Heena waits nearby.',hint:'Tap someone below to talk. A ! means they have a quest for you. The road runs east.',town:1,npcs:['heena','sera'],ret:'mushroom_west',ex:[[TN,'East to Mushroom Town']]});
SM(TN,{n:'Mushroom Town',d:'Mushroom-roofed houses and a friendly teacher. The village road continues east.',town:1,npcs:['roger'],ret:TN,ex:[['mushroom_west','West to the Village West Entrance'],['training_camp','East to Mushroom Town 2']]});
SM('training_camp',{n:'Mushroom Town 2',i:'🏘️',d:'The quiet east side of the village. Nina and Pio live here.',hint:'Nina and Pio have small jobs for beginners.',town:1,need:0,mons:[],npcs:['nina','pio'],ret:TN,ex:[[TN,'West to Mushroom Town'],['mushroom_east','East to the Village East Entrance']]});
SM('mushroom_east',{n:'Mushroom Village East Entrance',i:'🚪',d:'The east gate. Jr. Sentinel guards the road to the Small Forest.',town:1,npcs:['jr_sentinel'],ret:TN,ex:[['training_camp','West to Mushroom Town 2'],['snail_hunting_ground_1','On to Inside the Small Forest']]});
SM('snail_hunting_ground_1',{n:'Inside the Small Forest',d:'Snails crawl between the trees. Todd and Sam teach beginners here.',need:6,mons:['snail'],npcs:['todd','sam'],ret:TN,ex:[['mushroom_east','Back to the Village East Entrance'],['snail_hunting_ground_2','On to Snail Hunting Ground II']]});
SM('snail_hunting_ground_2',{ret:TN,mons:['snail','blue_snail'],ex:[['snail_hunting_ground_1','Back to Inside the Small Forest'],['snail_hunting_ground_3','On to Snail Hunting Ground III']]});
SM('snail_hunting_ground_3',{ret:TN,mons:['blue_snail','snail'],ex:[['snail_hunting_ground_2','Back to Snail Hunting Ground II'],['inside_dangerous_forest','On to Inside the Dangerous Forest']]});
SM('inside_dangerous_forest',{n:'Inside the Dangerous Forest',i:'🌲',d:'Shrooms hide in the shade. Keep a Potion handy.',need:8,mons:['shroom','blue_snail'],ret:TN,ex:[['snail_hunting_ground_3','Back to Snail Hunting Ground III'],['field_west_of_amherst','Out to the Field West of Amherst']],art:['#4f8f3a','#24531f','#3a6a8a',7]});
SM('field_west_of_amherst',{ret:TN,mons:['stump','shroom'],ex:[['inside_dangerous_forest','Back to Inside the Dangerous Forest'],['mushroom_garden','Door to Mushroom Garden 2'],['dangerous_forest','Danger sign: Dangerous Forest'],[AM,'East to Amherst']]});
SM('mushroom_garden',{n:'Mushroom Garden 2',ret:AM,mons:['shroom','orange_mushroom'],ex:[['field_west_of_amherst','Back to the Field West of Amherst']]});
SM('dangerous_forest',{n:'Dangerous Forest',d:'Orange Mushrooms crowd this shady forest.',ret:AM,mons:['orange_mushroom'],ex:[['field_west_of_amherst','Back to the Field West of Amherst']]});
SM(AM,{n:'Amherst',town:1,shop:1,npcs:['lucas','rain','sid'],ret:AM,ex:[['field_west_of_amherst','West to the Field West of Amherst'],['field_east_of_amherst','East to the Field East of Amherst'],['snail_garden','Snail Garden'],['tomato_field','Tomato Field'],['middle_forest_1','Hunting Ground Middle of the Forest I'],['snail_field','Small Field of Flowers'],['atc_entrance','Adventurer Training Center']]});
SM('snail_garden',{ret:AM,mons:['red_snail','snail'],ex:[[AM,'Back to Amherst']]});
SM('tomato_field',{ret:AM,mons:['red_snail','snail'],ex:[[AM,'Back to Amherst']]});
SM('middle_forest_1',{ret:AM,mons:['slime','blue_snail'],ex:[[AM,'Back to Amherst'],['middle_forest_2','Deeper into the forest']]});
SM('middle_forest_2',{ret:AM,mons:['pig','slime'],ex:[['middle_forest_1','Back to the Middle of the Forest I']]});
SM('snail_field',{n:'Small Field of Flowers',ret:AM,mons:['slime','snail'],ex:[[AM,'Back to Amherst']]});
SM('field_east_of_amherst',{ret:AM,mons:['pig','red_snail','orange_mushroom'],ex:[[AM,'Back to Amherst'],['inside_small_forest_2','On to Inside the Small Forest 2']]});
SM('inside_small_forest_2',{n:'Inside the Small Forest 2',i:'🌳',d:'Orange Mushrooms bounce along a shady trail toward the port.',need:8,mons:['orange_mushroom'],ret:AM,ex:[['field_east_of_amherst','Back to the Field East of Amherst'],['field_west_of_southperry','On to the Field West of Southperry']],art:['#6fb552','#3f8f3a']});
SM('field_west_of_southperry',{n:'The Field West of Southperry',i:'🌾',d:'An open field above the harbor, full of Orange Mushrooms and Pigs.',need:8,mons:['orange_mushroom','pig'],ret:AM,ex:[['inside_small_forest_2','Back to Inside the Small Forest 2'],['southperry','East to Southperry']],art:['#8fd06a','#5b97d1']});
SM('southperry',{npcs:['biggs','vasily','maplelite_admin'],ret:AM,ex:[['field_west_of_southperry','West to the Field West of Southperry']]});
SM('atc_entrance',{ret:AM,npcs:['mai'],mons:['shroom','blue_snail','orange_mushroom'],ex:[[AM,'Back to Amherst'],['atc_1','Training Center 1'],['atc_2','Training Center 2'],['atc_3','Training Center 3'],['atc_4','Training Center 4']]});
Object.assign(NAV,{mushroom_west:[8,10,'West Gate'],mushroom_town:[25,10,'Town'],training_camp:[42,10,'Town 2'],mushroom_east:[59,10,'East Gate'],snail_hunting_ground_1:[76,10,'Sm. Forest'],snail_hunting_ground_2:[93,10,'Snails II'],snail_hunting_ground_3:[93,27,'Snails III'],inside_dangerous_forest:[76,27,'In. Dang.'],field_west_of_amherst:[59,27,'West Field'],mushroom_garden:[42,27,'Garden 2'],dangerous_forest:[25,27,'Dang. Forest'],amherst:[59,44,'Amherst'],snail_garden:[42,44,'Snail Garden'],tomato_field:[25,44,'Tomatoes'],middle_forest_1:[42,61,'Forest I'],middle_forest_2:[25,61,'Forest II'],snail_field:[76,44,'Flowers'],field_east_of_amherst:[76,61,'East Field'],inside_small_forest_2:[93,61,'Sm. For. 2'],field_west_of_southperry:[93,78,'SP Field'],southperry:[76,78,'Southperry'],atc_entrance:[59,61,'Training Ctr'],atc_1:[42,78,'ATC 1'],atc_2:[25,78,'ATC 2'],atc_3:[8,78,'ATC 3'],atc_4:[8,61,'ATC 4']});
const _t2=townArt;townArt=function(id){if(id==='mushroom_west'||id==='mushroom_east')id=TN;return _t2(id)||''};
Object.assign(NPCS,{jr_sentinel:{n:'Jr. Sentinel',i:'💂',role:'Gate guard',hi:'Halt! ...Oh, a new explorer. Mind the Snails out there.'},pio:{n:'Pio',i:'🧑‍🔧',role:'Recycler',hi:'Nothing goes to waste around here!'},mai:{n:'Mai',i:'🥋',role:'Training Center instructor',hi:'Welcome to the Adventurer Training Center. Four rooms, four challenges.'},maplelite_admin:{n:'Maplelite Administrator',i:'🛡️',role:'Administrator',hi:'Welcome to Southperry. Enjoy your stay on Maple Island!'}});

/* ===== v62 Maple Island: Mai, Pio, Sen, Peter, hats, boxes ===== */
Object.assign(ITEMS,{jr_sentinel_shellpiece:{n:'Jr. Sentinel Shellpiece',i:'\uD83D\uDEE1\uFE0F',sell:1},rusty_screw:{n:'Rusty Screw',i:'\uD83D\uDD29',sell:1},old_wooden_board:{n:'Old Wooden Board',i:'\uD83E\uDEB5',sell:1},green_relaxer:{n:'The Relaxer',i:'\uD83E\uDE91',sell:1},
 fruit_knife:{n:'Fruit Knife',i:'\uD83D\uDD2A',w:1,watk:15,spd:600,mult:3.6,req:0,buy:50},razor:{n:'Razor',i:'\uD83D\uDD2A',w:1,watk:13,spd:600,mult:3.6,req:0,buy:50}});
DESC.jr_sentinel_shellpiece='A shell fragment dropped by a Tutorial Jr. Sentinel.';DESC.rusty_screw='A rusty screw from a broken wooden box.';DESC.old_wooden_board='A weathered board from a broken wooden box.';DESC.green_relaxer='A chair for resting. Sit and relax.';DESC.fruit_knife='A small knife meant for peeling fruit.';DESC.razor='A small, sharp razor blade.';
[['brown_skullcap','Brown Skullcap'],['green_skullcap','Green Skullcap'],['red_headband','Red Headband'],['black_headband','Black Headband'],['green_headband','Green Headband'],['yellow_headband','Yellow Headband'],['blue_headband','Blue Headband']].forEach(h=>{ITEMS[h[0]]={n:h[1],i:'\uD83E\uDDE2',s:'Hat',req:0,buy:20,def:1,bon:null};DESC[h[0]]='A simple hat, a thank-you gift from Lucas.'});
MON.tutorial_sentinel={n:'Tutorial Jr. Sentinel',i:'\uD83D\uDC82',lv:1,hp:4,exp:0,av:0,atk:[1,1],iv:2500,m:[0,0],e:'jr_sentinel_shellpiece'};
DROPS.tutorial_sentinel={m:[0,0,0],i:[['jr_sentinel_shellpiece',1,1,1]]};
Object.assign(QD,{
 mai1:{n:"Mai's Training",giver:'mai',lvl:3,max:7,pre:'sam',type:'kill',mk:[['snail',10],['blue_snail',10],['shroom',10]],rw:{exp:70},goal:'Defeat 10 Snails, 10 Blue Snails and 10 Shrooms. Only for adventurers under level 7.'},
 mai2:{n:"Mai's Final Training",giver:'mai',lvl:3,pre:'mai1',type:'kill',mon:'orange_mushroom',cnt:10,rw:{exp:150,mesos:300},goal:'Defeat 10 Orange Mushrooms. They do not wander the open road, so go through the portals to find them.'},
 pio:{n:"Pio's Collecting Recycled Goods",giver:'pio',lvl:5,type:'collect',col:[['rusty_screw',10],['old_wooden_board',10]],rw:{exp:100,mesos:100},goal:'Hit the wooden boxes around Amherst (3 hits each) for 10 Rusty Screws and 10 Old Wooden Boards.'},
 pio2:{n:'Pio and the Recycling',giver:'pio',turn:'pio',pre:'pio',lvl:5,type:'talk',rw:{items:{green_relaxer:1}},goal:'Talk to Pio again. He has a thank-you gift.'}});
Object.assign(NPCS,{sen:{n:'Sen',i:'\uD83D\uDC66',role:'Nina\'s brother',hi:'Ahh, soooo hungry! Where is my sister? I want mushroom soup!'},peter:{n:'Peter',i:'\uD83E\uDDD1',role:'Mushroom Town guide',hi:'Welcome to the east entrance. Todd has told me about you.'},
 mai_store:{n:'Mai',i:'\uD83D\uDC69',role:'Harbor store',shop:1,hi:'Potions and basic gear, fresh off the boat!'}});
Object.assign(NPCS.mai,{role:'Beginner trainer',hi:'You look like someone who needs my guidance. What you need more than anything right now is FOCUS.'});
Object.assign(NPCS.nina,{role:'Villager',hi:'What would be good for dinner?'});
Object.assign(NPCS.vasily,{n:'Shanks',role:'Ferry captain'});
MAPS.southperry.hint='Shanks sells passage to Victoria Island once you reach level 7 (Magicians advance at 8, everyone else at 10).';
MAPS.lith_harbor.npcs=MAPS.lith_harbor.npcs.map(x=>x==='mai'?'mai_store':x);
/* Maps: A Split Road returns as a town between Snails III and the Dangerous Forest; the east gate holds the Tutorial Jr. Sentinels. */
SM('a_split_road',{n:'A Split Road',i:'\uD83E\uDEA7',d:'The road forks here. Maria and Mai wait by the signpost. West leads back to the Snail fields, east into the forest and on to Amherst.',hint:'Maria has a letter for Lucas in Amherst. Sam sends beginners to Mai for training.',town:1,need:0,mons:[],npcs:['maria','mai'],ret:TN,ex:[['snail_hunting_ground_3','West to Snail Hunting Ground III'],['inside_dangerous_forest','East to Inside the Dangerous Forest']]});
NAV.a_split_road=[93,44,'Split Road'];
MAPS.snail_hunting_ground_3.ex=[['snail_hunting_ground_2','Back to Snail Hunting Ground II'],['a_split_road','On to A Split Road']];
MAPS.inside_dangerous_forest.ex=[['a_split_road','Back to A Split Road'],['field_west_of_amherst','Out to the Field West of Amherst']];
SM('mushroom_east',{town:0,need:3,mons:['tutorial_sentinel'],npcs:['todd','peter'],d:'The east gate of the village. Tutorial Jr. Sentinels, their power sealed away by Grendel, stand about so beginners can practise.',hint:'Talk to Todd to learn how to hunt, then show Peter your Shellpieces. Defeat a few Sentinels to open the road east.',ret:TN});
MAPS.mushroom_town.npcs=['roger','nina'];
SM('training_camp',{d:'The quiet east side of the village. Sen lives in the little house here.',hint:'Sen is hungry. Nina sent you to find out what he wants for dinner.',npcs:['sen']});
MAPS.snail_hunting_ground_1.npcs=['sam'];
MAPS.amherst.npcs=['lucas','rain','sid','pio'];
delete MAPS.atc_entrance.npcs;
/* Pio's quest: break wooden boxes in Amherst */
window._bh=0;function breakBox(){if(!P||P.map!==AM||P.q.pio!=='active'||P.dead)return;const now=Date.now();if(now-(window._bb||0)<400)return;window._bb=now;
 window._bh=(window._bh||0)+1;if(window._bh<3){log('You hit the wooden box. ('+window._bh+'/3)','mute','items');return render()}
 window._bh=0;const k=Math.random()<.5?'rusty_screw':'old_wooden_board';P.inv[k]=(P.inv[k]||0)+1;const m=Math.random()<.3?R(1,5):0;P.mesos+=m;log('The box breaks! +1 '+ITEMS[k].n+(m?', +'+m+' mesos':'')+'.','good','items');save();render()}
const _pp=peoplePanel;peoplePanel=function(){let h=_pp();if(P.map===AM&&P.q.pio==='active')h+='<div class="panel"><h2>Wooden Boxes</h2><div class="mute">Abandoned boxes are piled up around Amherst. Hit each box three times to break it open.</div><div class="ex"><button class="main" id="brkbox">\uD83D\uDCE6 Hit a wooden box</button></div></div>';return h};
PLAYERS.forEach(p=>{p.maps=p.maps.map(k=>k==='a_split_road'?'mushroom_east':k)});
/* ===== Death: tombstone for 30 s, revive in city or with a Wheel of Destiny ===== */
die=function(){if(HC())return hcDie();log('You were defeated.','bad','combat');enc=null;P.b={};autoSeek=false;seeking=false;clearTimeout(autoT);inShop=false;talk=null;selNpc=null;P.hp=0;P.kills=0;P.dead=Date.now()+30000;log('You are a tombstone for 30 seconds.','bad','combat');save()};
function revive(here){if(!P||!P.dead)return;
 if(here===2){if(!(P.cinv&&P.cinv.wheel>0))return;P.cinv.wheel--;P.hp=P.maxHp;log('Wheel of Destiny! You rise again with full HP.','good','combat')}
 else{const m=MAPS[P.map];if(P.lvl>=10&&!useCharm())P.exp=Math.max(0,P.exp-Math.floor(EXP[P.lvl-1]*.05));P.map=m.ret;P.hp=Math.max(1,Math.floor(P.maxHp/2));log('You wake in '+MAPS[P.map].n+' at half HP.','','combat')}
 P.dead=0;save();render()}
function tombHtml(){const c=MAPS[MAPS[P.map].ret];
 return '<div class="panel" style="text-align:center"><div style="font-size:64px">🪦</div><h2>You are a tombstone</h2><div class="mute">Rest in peace, '+P.name+'. You will wake in '+c.n+' in <b id="tombT">'+Math.max(0,Math.ceil((P.dead-Date.now())/1000))+'</b>s.</div><div class="ex" style="justify-content:center;margin-top:10px"><button class="main" onclick="revive(0)">Revive in '+c.n+'</button>'+(P.cinv&&P.cinv.wheel>0?'<button class="main" onclick="revive(2)">🎡 Wheel of Destiny ('+P.cinv.wheel+')</button>':'')+'</div></div>'}
/* ===== Activity log: All / Self / Map / Party / Guild ===== */
const logTab=l=>l[3]?ltab===l[2]:(ltab==='all'||(ltab==='self'?!['map','party','guild'].includes(l[2]):l[2]===ltab));
function refreshLog(){const b=document.querySelector('#log .lgb');if(!b)return;const v=logs.filter(logTab).slice(-40).reverse();b.innerHTML=v.length?v.map(l=>'<div class="'+l[1]+'">'+l[0].replace(/</g,'&lt;')+'</div>').join(''):'<div>Nothing here yet.</div>'}
let nextSim=0;const GCH=['Anyone up for Snails?','gl everyone!','Free Red Potions in Amherst!','brb, grinding.','Who wants to party later?'];
function simAct(){const now=Date.now();if(now<nextSim)return;nextSim=now+R(6000,12000);const ps=playersHere(),m=MAPS[P.map];
 if(ps.length&&Math.random()<.75){const p=ps[R(0,ps.length-1)];log(m.town||!m.mons||!m.mons.length?p.n+(Math.random()<.5?' is chatting nearby.':' bought a Red Potion.'):p.n+' defeated a '+MON[m.mons[R(0,m.mons.length-1)]].n+'.','','map')}
 if(Math.random()<.25){const g=PLAYERS.filter(p=>p.g==='Starter Island Crew'),p=g[R(0,g.length-1)];if(p)log('['+p.n+'] '+GCH[R(0,GCH.length-1)],'','guild')}
 refreshLog()}
setInterval(()=>{if(!P||scr!=='game')return;if(P.dead){const t=P.dead-Date.now();if(t<=0)return revive(0);const e=document.getElementById('tombT');if(e)e.textContent=Math.ceil(t/1000);return}simAct()},1000);
spendSk=function(k){if(P.sp<1||(P.sk[k]|0)>=3)return;P.sk[k]=(P.sk[k]|0)+1;P.sp--;save();render()};
/* ===== Players Here: steadier roster, pinned profile ===== */
let _vpm=null;
playersHere=function(){const slot=Math.floor(Date.now()/600000);return PLAYERS.filter((p,i)=>p.maps[(slot+i)%p.maps.length]===P.map)};
playersPanel=function(){if(viewPlayer&&_vpm&&_vpm!==P.map)viewPlayer=null;_vpm=P.map;let ps=playersHere();if(viewPlayer&&!ps.some(p=>p.n===viewPlayer)){const x=PLAYERS.find(p=>p.n===viewPlayer);if(x)ps=ps.concat([x]);else viewPlayer=null}if(!ps.length)return '';const v=ps.find(p=>p.n===viewPlayer);
 return '<div class="panel"><h2>Players Here</h2>'+(v?profileCard(v):'')+'<div class="ex">'+ps.map(p=>'<button data-pl="'+p.n+'"'+(viewPlayer===p.n?' class="on"':'')+'>'+p.i+' '+p.n+' <span class="mute">Lv '+p.lvl+'</span></button>').join('')+'</div></div>'};

/* ===== Cash Shop (v62 usable items only, no cosmetics) ===== */
const SKT={three:1,rec:1,feet:1};/* skill -> job tier. Beginner skills count as 1st job until job classes exist. */
const CASH=[
 ['ap_reset','🔄','AP Reset',2000,'Refunds every ability point you spent. Stats return to their starting values.'],
 ['sp1','📘','SP Reset (1st Job)',1500,'Refunds skill points spent on 1st job skills only. Your Beginner skills count as 1st job until job classes arrive.'],
 ['sp2','📗','SP Reset (2nd Job)',2000,'Refunds skill points spent on 2nd job skills only.'],
 ['sp3','📙','SP Reset (3rd Job)',2500,'Refunds skill points spent on 3rd job skills only.'],
 ['sp4','📕','SP Reset (4th Job)',3000,'Refunds skill points spent on 4th job skills only.'],
 ['exp2','✨','2x EXP Coupon (30 min)',1500,'Double EXP from every kill and quest for 30 minutes. Stacks time.'],
 ['drop2','🎁','2x Drop Coupon (30 min)',1500,'Monsters drop twice as often for 30 minutes. Stacks time.'],
 ['charm','🧿','Safety Charm',1500,'Used automatically the next time you revive in the city, so you lose no EXP.'],
 ['wheel','🎡','Wheel of Destiny',1000,'Appears on your tombstone. Revives you on the spot with full HP and no EXP loss.'],
 ['rock','🪨','Teleport Rock',1000,'Stand on a map to register it (5 slots), then warp back to any registered map in the same region. Not used up.'],
 ['vip','💠','VIP Teleport Rock',2500,'Register up to 10 maps and warp between regions. Not used up.'],
 ['mega','📢','Megaphone',600,'Broadcast a message to everyone on your map.'],
 ['smega','📣','Super Megaphone',1000,'Broadcast a message to every channel.']];
const ROCKS={rock:['Teleport Rock',5],vip:['VIP Teleport Rock',10]};
const _gain0=gain;gain=function(x){if(x>0&&P.lvl<MAXL)P.nx=(P.nx||0)+Math.max(1,Math.ceil(x/4));return _gain0(P.cb&&P.cb.exp2>Date.now()?x*2:x)};
const _dl0=dropLoot;dropLoot=function(k,d){_dl0(k,d);if(P.cb&&P.cb.drop2>Date.now())_dl0(k,d)};
const _nc2=newChar;newChar=function(v,st){const p=_nc2(v,st);p.nx=3000;p.cinv={};p.cb={};p.tr={rock:[],vip:[]};p.base={str:st.str,dex:st.dex,int:st.int,luk:st.luk};return p};
function cashInit(){if(P.nx==null)P.nx=3000;if(!P.cinv)P.cinv={};if(!P.cb)P.cb={};if(!P.tr)P.tr={rock:[],vip:[]};
 if(P.cinv.sp_reset){P.cinv.sp1=(P.cinv.sp1||0)+P.cinv.sp_reset;delete P.cinv.sp_reset}if(P.cinv.tele){P.cinv.rock=1;delete P.cinv.tele}}
function cashBuy(id){cashInit();const c=CASH.find(x=>x[0]===id);if(!c)return;if(ROCKS[id]&&P.cinv[id]>0){log('You already own a '+c[2]+'.','bad','items');return render()}if(P.nx<c[3]){log('Not enough NX.','bad','items');return render()}P.nx-=c[3];P.cinv[id]=ROCKS[id]?1:(P.cinv[id]||0)+1;log('Bought '+c[2]+' for '+c[3]+' NX.','good','items');save();render()}
function useCharm(){if(P.cinv&&P.cinv.charm>0){P.cinv.charm--;log('Your Safety Charm protected your EXP.','good','combat');return true}return false}
const rgn=k=>reg(k)==='victoria'?'Victoria Island':'Maple Island';
function cashReg(kind){cashInit();if(P.dead||!(P.cinv[kind]>0))return;const L=P.tr[kind];if(L.includes(P.map)){log('This map is already registered.','bad','items');return render()}if(L.length>=ROCKS[kind][1]){log('Your '+ROCKS[kind][0]+' is full. Delete a map first.','bad','items');return render()}L.push(P.map);log('Registered '+MAPS[P.map].n+' on your '+ROCKS[kind][0]+'.','good','items');save();render()}
function cashDel(kind,i){cashInit();const L=P.tr[kind];if(i<0||i>=L.length)return;log('Removed '+MAPS[L[i]].n+' from your '+ROCKS[kind][0]+'.','','items');L.splice(i,1);save();render()}
function cashTele(kind,i){cashInit();const id=(P.tr[kind]||[])[i];if(!id||!MAPS[id]||!(P.cinv[kind]>0))return;
 if(P.dead||enc||inShop||talk){log('You cannot teleport right now.','bad','items');return render()}
 if(id===P.map){log('You are already there.','bad','items');return render()}
 if(reg(id)==='maple'&&reg(P.map)!=='maple'){log('You cannot return to Maple Island.','bad','items');return render()}
 if(kind==='rock'&&reg(id)!==reg(P.map)){log('The Teleport Rock only works within the same region. A VIP Teleport Rock crosses regions.','bad','items');return render()}
 P.map=id;P.kills=0;autoSeek=false;seeking=false;clearTimeout(autoT);selNpc=null;talk=null;log('Your '+ROCKS[kind][0]+' takes you to '+MAPS[id].n+'.','good','items');save();render()}
function cashUse(id){cashInit();if(!(P.cinv[id]>0)||P.dead||ROCKS[id])return;const now=Date.now();let ok=true;
 if(id==='ap_reset'){const b=P.base||{str:4,dex:4,int:4,luk:4},k=['str','dex','int','luk'],r=k.reduce((a,x)=>a+P[x]-b[x],0);if(r<=0){ok=false;log('You have no spent ability points to reset.','bad','items')}else{k.forEach(x=>P[x]=b[x]);P.ap+=r;log('AP Reset: refunded '+r+' ability points.','good','items')}}
 else if(/^sp[1-4]$/.test(id)){const t=+id[2],ks=Object.keys(P.sk).filter(k=>(SKT[k]||1)===t),r=ks.reduce((a,k)=>a+(P.sk[k]|0),0);if(r<=0){ok=false;log('You have no spent '+['1st','2nd','3rd','4th'][t-1]+' job skill points to reset.','bad','items')}else{ks.forEach(k=>P.sk[k]=0);P.sp+=r;P.b={};log('SP Reset ('+['1st','2nd','3rd','4th'][t-1]+' Job): refunded '+r+' skill points.','good','items')}}
 else if(id==='exp2'||id==='drop2'){P.cb[id]=Math.max(now,P.cb[id]||0)+1800000;log((id==='exp2'?'2x EXP':'2x Drop')+' Coupon active.','good','items')}
 else if(id==='mega'||id==='smega'){const t=typeof prompt==='function'?prompt((id==='mega'?'Megaphone':'Super Megaphone')+' message:'):'';if(!t||!t.trim())ok=false;else{const m=t.trim().slice(0,60);if(id==='mega')log('📢 '+P.name+': '+m,'good','map');else{log('📣 [Super Megaphone] '+P.name+': '+m,'good','map');logs.push(['📣 [Super Megaphone] '+P.name+': '+m,'good','guild',1]);logs.push(['📣 [Super Megaphone] '+P.name+': '+m,'good','party',1])}}}
 else ok=false;
 if(ok)P.cinv[id]--;save();render()}
function rockHtml(kind){const L=P.tr[kind],cap=ROCKS[kind][1],full=L.length>=cap,here=L.includes(P.map),busy=P.dead||enc||inShop||talk;
 return '<div class="panel"><div class="row"><h2>'+ROCKS[kind][0]+'</h2><span class="mute">'+L.length+'/'+cap+' maps</span></div>'+(L.length?L.map((id,i)=>{const bad=busy||id===P.map||(kind==='rock'&&reg(id)!==reg(P.map));return '<div class="row" style="align-items:center;padding:4px 0"><span>📍 <b>'+MAPS[id].n+'</b> <span class="mute">'+rgn(id)+'</span></span><span><button '+(bad?'disabled':'class="main"')+' onclick="cashTele(\''+kind+'\','+i+')">Teleport</button> <button onclick="cashDel(\''+kind+'\','+i+')">✕</button></span></div>'}).join(''):'<div class="mute">No maps registered yet.</div>')
 +'<div class="ex" style="margin-top:8px"><button '+(full||here?'disabled':'class="main"')+' onclick="cashReg(\''+kind+'\')">Register this map ('+MAPS[P.map].n+')</button></div><div class="mute" style="margin-top:6px">'+(kind==='rock'?'Warps only within the same region.':'Warps to any region.')+' You must be standing on a map to register it.</div></div>'}
function cashHtml(){cashInit();const now=Date.now(),fx=[];if(P.cb.exp2>now)fx.push('2x EXP '+Math.ceil((P.cb.exp2-now)/60000)+' min');if(P.cb.drop2>now)fx.push('2x Drop '+Math.ceil((P.cb.drop2-now)/60000)+' min');
 const row=(c,r)=>'<div class="row" style="align-items:center;padding:6px 0;gap:8px"><span>'+c[1]+' <b>'+c[2]+'</b><div class="mute">'+c[4]+'</div></span>'+r+'</div>';
 const mine=CASH.filter(c=>P.cinv[c[0]]>0);
 return '<div class="panel"><div class="row"><h2>Cash Shop</h2><b>'+P.nx.toLocaleString()+' NX</b></div><div class="mute">Earn NX by hunting and questing. Only items that do something are sold here.'+(fx.length?'<br>Active: '+fx.join(' · '):'')+'</div></div>'
 +'<div class="panel"><h2>Buy</h2>'+CASH.map(c=>row(c,'<button '+(P.nx>=c[3]&&!(ROCKS[c[0]]&&P.cinv[c[0]]>0)?'class="main"':'disabled')+' onclick="cashBuy(\''+c[0]+'\')">'+(ROCKS[c[0]]&&P.cinv[c[0]]>0?'Owned':c[3].toLocaleString()+' NX')+'</button>')).join('')+'</div>'
 +'<div class="panel"><h2>My Cash Items</h2>'+(mine.length?mine.map(c=>row(c,ROCKS[c[0]]?'<span class="pill b">owned</span>':['charm','wheel'].includes(c[0])?'<span class="pill b">x'+P.cinv[c[0]]+' auto</span>':'<button class="main" onclick="cashUse(\''+c[0]+'\')">Use x'+P.cinv[c[0]]+'</button>')).join(''):'<div class="mute">Nothing yet.</div>')+'</div>'
 +(P.cinv.rock>0?rockHtml('rock'):'')+(P.cinv.vip>0?rockHtml('vip'):'')}

/* ===== Scrolls & Enchanting (v62 scroll families) ===== */
const LBL={watk:'W.ATK',matk:'M.ATK',def:'W.DEF',mdef:'M.DEF',hp:'MaxHP',str:'STR',dex:'DEX',int:'INT',luk:'LUK',jump:'Jump',speed:'Speed'};
const LIVE=['watk','def','str','dex','int','luk'];/* stats that change combat today */
const WT=[['oh_sword','One-Handed Sword'],['th_sword','Two-Handed Sword'],['oh_axe','One-Handed Axe'],['th_axe','Two-Handed Axe'],['oh_bw','One-Handed BW'],['th_bw','Two-Handed BW'],['dagger','Dagger'],['spear','Spear'],['polearm','Polearm'],['wand','Wand'],['staff','Staff'],['bow','Bow'],['crossbow','Crossbow'],['claw','Claw'],['knuckle','Knuckle'],['gun','Gun']];
const AF=[['helmet','Helmet',[['def'],['hp'],['dex']]],['top','Topwear',[['def'],['dex']]],['bottom','Bottomwear',[['def'],['dex']]],['overall','Overall Armor',[['def'],['dex']]],['gloves','Gloves',[['watk'],['dex']]],['shoes','Shoes',[['dex'],['jump'],['speed']]],['cape','Cape',[['mdef'],['def'],['str'],['int'],['dex'],['luk'],['hp']]],['shield','Shield',[['def'],['hp']]],['earring','Earring',[['int'],['dex'],['luk']]]];
const TYN={};WT.concat(AF).forEach(a=>TYN[a[0]]=a[1]);
const VAL={watk:[3,1],def:[5,2],mdef:[5,2],hp:[30,10],jump:[5,2],speed:[3,1]};/* default stat scrolls give 5 (10%) or 2 (60%) */
const SCR={};
const addS=(key,n,r,tg,st,kind)=>{SCR[key]={n,r,tg,st,kind:kind||'std'};ITEMS['sc_'+key]={n,i:'📜',sell:60,scr:key};DESC['sc_'+key]=n+'. Open Inventory, Enchanting to use it.'};
WT.forEach(w=>[[10,5],[60,2]].forEach(a=>{const m=w[0]==='wand'||w[0]==='staff'?'matk':'watk';addS(w[0]+'_att_'+a[0],'Scroll for '+w[1]+' for ATT '+a[0]+'%',a[0],w[0],{[m]:a[1]})}));
AF.forEach(f=>f[2].forEach(sd=>{const k=sd[0];[10,60].forEach((r,j)=>{const v=VAL[k]?VAL[k][j]:[5,2][j],st={[k]:v};if(k==='def'&&f[0]!=='cape'&&f[0]!=='shield')st.mdef=Math.ceil(v*.6);
 const lab=k==='def'?(f[0]==='cape'?'Weapon DEF':'DEF'):k==='mdef'?'Magic DEF':k==='watk'?'ATT':k==='hp'?'HP':k.toUpperCase();addS(f[0]+'_'+k+'_'+r,'Scroll for '+f[1]+' for '+lab+' '+r+'%',r,f[0],st)})}));
[1,3,5,20].forEach(r=>addS('clean_'+r,'Clean Slate Scroll '+r+'%',r,'any',{},'clean'));
addS('chaos','Chaos Scroll 60%',60,'any',{},'chaos');addS('goodness','Chaos Scroll of Goodness 50%',50,'any',{},'goodness');addS('white','White Scroll',100,'none',{},'white');
const baseSl=b=>(typeof TUC!=='undefined'&&TUC[b]!==undefined)?TUC[b]:ITEMS[b].w?7:({Hat:7,Top:7,Bottom:7,Gloves:5,Shoes:5,Cape:5,Shield:5,Earring:3})[ITEMS[b].s]||0;
const baseOf=id=>(P.inst&&P.inst[id])?P.inst[id].b:id;
const TABN={play:'Play',stats:'Character',pack:'Inventory',quests:'Quests',social:'Social',cash:'Cash',menu:'Menu'},TABI={play:'🗺️',stats:'🧍',pack:'🎒',quests:'📜',social:'💬',cash:'💎',menu:'☰'};
function tyOf(id){const b=baseOf(id),it=ITEMS[b];if(it.w){if(b==='great_axe')return'th_axe';if(/axe/i.test(b))return'oh_axe';if(/club|mace|hammer/i.test(b))return'oh_bw';if(it.mw)return it.mw;if(it.dag)return'dagger';if(it.rng==='claw')return'claw';if(/crossbow/i.test(b))return'crossbow';if(/bow/i.test(b))return'bow';return'oh_sword'}return({Hat:'helmet',Top:'top',Bottom:'bottom',Gloves:'gloves',Shoes:'shoes',Cape:'cape',Shield:'shield',Earring:'earring'})[it.s]||null}
const slotsOf=id=>P.inst&&P.inst[id]?P.inst[id].sl:baseSl(id);
function instBuild(id){const d=P.inst[id],b=ITEMS[d.b],st=d.st,it=Object.assign({},b),x={};
 if(b.w)it.watk=Math.max(0,b.watk+(st.watk||0));else it.def=Math.max(0,(b.def||0)+(st.def||0));
 const bon=Object.assign({},b.bon||{});['str','dex','int','luk'].forEach(k=>{if(st[k])bon[k]=Math.max(0,(bon[k]||0)+st[k]);if(bon[k]===0)delete bon[k]});it.bon=Object.keys(bon).length?bon:null;
 Object.assign(x,b.x||{});/* v3.4: keep the item's own extra stats; scrolls and drop variance add to them */
 ['matk','mdef','hp','mp','acc','eva','jump','speed'].forEach(k=>{if(k==='matk'&&b.w&&b.matk)return;if(st[k])x[k]=Math.max(0,(x[k]||0)+st[k]);if(x[k]===0)delete x[k]});if(b.w&&st.watk===undefined)it.watk=b.watk;
 if(b.w&&b.matk&&st.matk){it.matk=Math.max(0,b.matk+st.matk)}
 it.x=x;it.inst=1;it.sl=d.sl;it.n=b.n+(d.ok?' (+'+d.ok+')':'')+' ['+d.sl+']';ITEMS[id]=it;DESC[id]=(DESC[d.b]||'')+' Upgrade slots left: '+d.sl+'.'}
function instReg(){for(const id in (P.inst||{}))instBuild(id)}
function eff(id){const it=ITEMS[id],o={};if(it.w)o.watk=it.watk;if(it.def)o.def=it.def;if(it.bon)for(const k in it.bon)o[k]=it.bon[k];if(it.x)for(const k in it.x)o[k]=it.x[k];return o}
const _ir=itemRows;itemRows=function(id,st){const it=ITEMS[id];if(it&&it.scr){const d=SCR[it.scr];return[['Success rate',d.r+'%'],['Works on',d.kind==='white'?'Any scroll (protects slot)':d.tg==='any'?'Any equipment':TYN[d.tg]]].concat(Object.keys(d.st).map(k=>[LBL[k],'+'+d.st[k]]))}
 const r=_ir(id,st);if(it&&it.inst)return r.concat([['Upgrade slots left',it.sl]],Object.keys(it.x||{}).map(k=>[LBL[k],'+'+it.x[k]]));return r};
/* sources: monster drops, plus White Scroll and Clean Slate 20% in the Cash Shop */
const SW=[];Object.keys(SCR).forEach(k=>{const d=SCR[k],gt=['oh_sword','oh_axe','oh_bw','th_axe','helmet','top','bottom','gloves','shoes','cape','shield','earring','any','none'].includes(d.tg);if(!gt)return;SW.push([k,d.kind==='std'?(d.r>=60?8:2):.3])});
function rollScroll(){const T=SW.reduce((a,x)=>a+x[1],0);let r=Math.random()*T;for(const x of SW){r-=x[1];if(r<=0)return'sc_'+x[0]}return'sc_'+SW[0][0]}
const _dl1=dropLoot;dropLoot=function(k,d){_dl1(k,d);if(Math.random()<.04*dropRate())addDrop(rollScroll(),1)};
CASH.push(['sc_white','⚪','White Scroll',1500,'Add it to a scroll attempt. If the scroll fails, the upgrade slot is not used up.'],['sc_clean_20','🧽','Clean Slate Scroll 20%',1000,'Restores one upgrade slot lost to a failed scroll.']);
const _cb0=cashBuy;cashBuy=function(id){if(!id.startsWith('sc_'))return _cb0(id);const c=CASH.find(x=>x[0]===id);cashInit();if(P.nx<c[3]){log('Not enough NX.','bad','items');return render()}P.nx-=c[3];P.inv[id]=(P.inv[id]||0)+1;log('Bought '+c[2]+' for '+c[3]+' NX.','good','items');save();render()};
/* ---- Enchanting flow: equipment -> scroll -> confirm ---- */
let ench=null;
const canUse=(tid,sk)=>{const d=SCR[sk];if(d.kind==='white')return false;if(d.kind==='clean')return !!(P.inst&&P.inst[tid]&&P.inst[tid].lost>0);if(slotsOf(tid)<1)return false;return d.tg==='any'||d.tg===tyOf(tid)};
function enchOpen(){if(P.dead)return;P.inst=P.inst||{};ench={st:1};render()}
function enchClose(){ench=null;render()}
function enchBack(n){if(n===1){ench={st:1}}else{ench={st:2,tgt:ench.tgt}}render()}
function enchTargets(){const L=[];const eq=[['Weapon',P.weapon]].concat(Object.entries(P.eq||{}));eq.forEach(a=>{const id=a[1];if(id&&ITEMS[id]&&(ITEMS[id].w||ITEMS[id].s)&&(slotsOf(id)>0||(P.inst[id]&&P.inst[id].lost>0)))L.push({id,w:'eq',sl:a[0]})});
 for(const k in P.inv){const it=ITEMS[k];if(it&&(it.w||it.s)&&P.inv[k]>0&&(slotsOf(k)>0||(P.inst[k]&&P.inst[k].lost>0)))L.push({id:k,w:'inv'})}return L}
function enchPick(i){ench={st:2,tgt:enchTargets()[i]};render()}
function enchScr(sk){ench={st:3,tgt:ench.tgt,sk,white:false};render()}
function enchWhite(){ench.white=!ench.white;render()}
function mkInst(t){if(P.inst[t.id])return t.id;const id=t.id+'#'+(P.ic=(P.ic|0)+1);P.inst[id]={b:t.id,sl:baseSl(t.id),ok:0,lost:0,st:{}};
 if(t.w==='eq'){if(t.sl==='Weapon')P.weapon=id;else P.eq[t.sl]=id}else{P.inv[t.id]--;if(P.inv[t.id]<=0)delete P.inv[t.id];P.inv[id]=1}instBuild(id);return id}
function enchGo(){const e=ench,d=SCR[e.sk];if(!(P.inv['sc_'+e.sk]>0)||enc)return;const useW=e.white&&P.inv.sc_white>0&&d.kind!=='clean';
 const id=mkInst(e.tgt),ins=P.inst[id];P.inv['sc_'+e.sk]--;if(P.inv['sc_'+e.sk]<=0)delete P.inv['sc_'+e.sk];
 const ok=Math.random()*100<d.r;let msg;
 if(d.kind==='clean'){if(ok){ins.sl++;ins.lost--;msg='✨ The Clean Slate worked. One upgrade slot was restored.'}else msg='The Clean Slate scroll fizzled. Nothing changed.'}
 else if(ok){ins.sl--;
  if(d.kind==='std'){for(const k in d.st)ins.st[k]=(ins.st[k]||0)+d.st[k];ins.ok++;msg='✨ Success! '+Object.keys(d.st).map(k=>LBL[k]+' +'+d.st[k]).join(', ')+'.'}
  else{const cur=eff(id);const ch=[];for(const k in cur){if(cur[k]<=0)continue;let dl=d.kind==='chaos'?R(-5,5):R(1,5);if(cur[k]+dl<0)dl=-cur[k];if(dl){ins.st[k]=(ins.st[k]||0)+dl;ch.push(LBL[k]+' '+(dl>0?'+':'')+dl)}}ins.ok++;msg='🌀 The chaos settles. '+(ch.join(', ')||'No stat changed.')}}
 else{if(useW&&P.inv.sc_white>0){P.inv.sc_white--;if(P.inv.sc_white<=0)delete P.inv.sc_white;msg='💥 The scroll failed, but the White Scroll protected your upgrade slot.'}else{ins.sl--;ins.lost++;msg='💥 The scroll failed. The upgrade slot is used up.'}}
 instBuild(id);log('Enchanting '+ITEMS[id].n+': '+msg.replace(/^\S+\s/,''),ok?'good':'bad','items');save();ench={st:4,res:'<div style="font-size:15px">'+ITEMS[id].i+' <b>'+ITEMS[id].n+'</b></div><div style="margin-top:6px">'+msg+'</div>'};render()}
function enchHtml(){const e=ench,hd='<div class="row"><h2>📜 Enchanting</h2><button onclick="enchClose()">✕ Close</button></div>',bk=n=>'<button onclick="enchBack('+n+')">Back</button>';
 if(e.st===4)return '<div class="panel">'+hd+'<div class="mcard">'+e.res+'</div><div class="ex"><button class="main" onclick="enchBack(1)">Enchant more</button></div></div>';
 if(e.st===1){const L=enchTargets();return '<div class="panel">'+hd+'<div class="mute">Step 1: choose equipment to enchant.</div><div class="escr">'+(L.length?L.map((t,i)=>{const it=ITEMS[t.id];return '<button class="row" style="width:100%;align-items:center;margin:3px 0" onclick="enchPick('+i+')"><span>'+it.i+' <b>'+it.n+'</b></span><span class="mute">'+(t.w==='eq'?'Equipped':'Inventory')+' · '+slotsOf(t.id)+' slots</span></button>'}).join(''):'<div class="mute">No equipment with upgrade slots.</div>')+'</div></div>'}
 const t=e.tgt,it=ITEMS[t.id];
 if(e.st===2){const ks=Object.keys(P.inv).filter(k=>ITEMS[k]&&ITEMS[k].scr&&canUse(t.id,ITEMS[k].scr));return '<div class="panel">'+hd+'<div class="mute">Step 2: choose a scroll for '+it.i+' <b>'+it.n+'</b> ('+slotsOf(t.id)+' slots left).</div><div class="escr">'+(ks.length?ks.map(k=>{const d=SCR[ITEMS[k].scr];return '<button class="row" style="width:100%;align-items:center;margin:3px 0" onclick="enchScr(\''+ITEMS[k].scr+'\')"><span>📜 <b>'+ITEMS[k].n+'</b></span><span class="mute">'+d.r+'% · x'+P.inv[k]+'</span></button>'}).join(''):'<div class="mute">You have no compatible scrolls. Scrolls drop from monsters, and White Scrolls and Clean Slates are in the Cash Shop.</div>')+'</div><div class="ex">'+bk(1)+'</div></div>'}
 const d=SCR[e.sk],cur=eff(t.id),nw=Object.assign({},cur);let rows;
 if(d.kind==='std'){for(const k in d.st)nw[k]=(nw[k]||0)+d.st[k];rows=Object.keys(d.st).map(k=>[LBL[k],cur[k]||0,nw[k]])}
 else if(d.kind==='clean')rows=[['Upgrade slots',slotsOf(t.id),slotsOf(t.id)+1]];
 else rows=Object.keys(cur).filter(k=>cur[k]>0).map(k=>[LBL[k],cur[k],d.kind==='chaos'?'−5 to +5':'+1 to +5']);
 const wh=P.inv.sc_white|0,dm=d.kind==='clean'?'':(e.white&&wh?'The White Scroll will protect your slot.':'The upgrade slot is used up.');
 const live=Object.keys(d.st).some(k=>!LIVE.includes(k));
 return '<div class="panel">'+hd+'<div class="mute">Step 3: confirm.</div><div class="mcard"><div>'+it.i+' <b>'+it.n+'</b></div><div>📜 <b>'+ITEMS['sc_'+e.sk].n+'</b></div><div class="row"><span>Success chance</span><b>'+d.r+'%</b></div><div class="row"><span>Failure chance</span><b>'+(100-d.r)+'%</b></div><div class="row"><span>Item destroyed</span><b>0%</b></div><div class="mute">On failure: '+(d.kind==='clean'?'the scroll is used up.':'the scroll is used up. '+dm)+'</div>'
 +'<div class="mute" style="margin-top:6px">Stats</div>'+rows.map(r=>'<div class="row"><span>'+r[0]+'</span><b>'+r[1]+' → '+r[2]+'</b></div>').join('')+(live?'<div class="mute" style="margin-top:6px">Jump, Speed, MaxHP and M.DEF are recorded on the item but do not change combat yet.</div>':'')+'</div>'
 +(d.kind!=='clean'&&wh?'<div class="ex"><button class="'+(e.white?'on':'')+'" onclick="enchWhite()">⚪ White Scroll ('+wh+'): '+(e.white?'ON':'OFF')+'</button></div>':'')+'<div class="ex">'+bk(2)+'<button class="main" onclick="enchGo()">Use scroll</button></div></div>'}
function render(){if(scr!=='game'||!P)return flow();if(P.sk.rev!==undefined){P.sp+=P.sk.rev|0;delete P.sk.rev;delete P.revCd}cashInit();if(P.cm!==P.map){P.cleared={};P.cm=P.map}const m=MAPS[P.map],w=W(),r=dmgRange(),need=P.lvl<MAXL?EXP[P.lvl-1]:1;
 const gp=(v,m)=>Math.max(0,Math.min(100,v/m*100)),gg=(l,c,v,m)=>'<div class="g"><b>'+l+'</b><div class="gb"><i style="width:'+gp(v,m)+'%;background:'+c+'"></i><em>['+Math.max(0,v)+'/'+m+']</em></div></div>';
 const SB='<div class="sbar"><div class="lvb"><span class="lv">LV. '+P.lvl+(MODE()?' '+MODES[MODE()][1]:'')+'</span><b id="pn" title="'+MODES[MODE()][0]+'"></b></div><div class="gs">'+gg('HP','linear-gradient(#ff7a6a,#c8281e)',P.hp,P.maxHp)+gg('MP','linear-gradient(#6ab8ff,#1f64cc)',P.mp,P.maxMp)+'</div></div>';
 let h=SB;/* v3.5: the character box is always at the top */
 h+='<div class="tabs icontabs">'+['play','stats','pack','quests','social','cash','menu'].map(t=>/* v3.5: icon tabs, all the same size; the name shows on hover and to screen readers */'<button class="'+(tab===t?'on':'')+'" data-t="'+t+'" title="'+TABN[t]+'" aria-label="'+TABN[t]+'"><span class="tbi">'+TABI[t]+'</span>'+({stats:tbd(P.ap+P.sp),quests:tbd(qReadyN()),social:tbd(dmUnread())}[t]||'')+'</button>').join('')+'</div>';
 if(tab==='play'&&P.dead){h+=tombHtml()}else if(tab==='play'){
  h+='<div class="panel">'+townArt(P.map)+'<div class="row"><h2 class="mapname">'+m.i+' '+m.n+'</h2>'+(m.town?'':'<span class="mute">'+(P.cleared[P.map]?'Cleared':freeMove(m)?'Free passage':P.kills+'/'+needFor(m))+'</span>')+'</div><div class="mute">'+m.d+'</div>'+buffLine()+'</div>'
  ;const lp=(!inShop&&!talk)?lootPanel():'';
  if(enc)h+=battlePanel('fight')+lp;
  else if(seeking){h+=battlePanel('seek')+lp}else if(talk){/* v3.5: the dialogue opens right under the NPC, inside the People block */h+=(m.town?quickPanel():battlePanel('idle'))+lp;const dp=dlgPanel(),pp=m.npcs?peoplePanel():'',mk='data-n="'+talk.npc+'"',at=pp.indexOf(mk);if(at>=0){const end=pp.indexOf('</button>',at)+9;h+=pp.slice(0,end)+'<div class="dlginline">'+dp+'</div>'+pp.slice(end)}else h+=dp+pp}else if(m.shop&&inShop){h+=shopPanel()}else{h+=(m.town?quickPanel():battlePanel('idle'))+lp;if(m.npcs){h+=peoplePanel()}}
  h+=trackerHtml();
  if(!enc&&!inShop&&!talk){if(!seeking)h+=worldMap();h+=playersPanel()}
 }
 if(tab==='cash'){h+=cashHtml()}
 if(tab==='stats'){const L=(c,t)=>'<span class="lab '+c+'">'+t+'</span>',V=x=>'<span class="val">'+x+'</span>',rw=(c,t,x)=>'<div class="srow">'+L(c,t)+V(x)+'</div>';
  const sr=['str','dex','int','luk'].map(k=>'<div class="srow">'+L('gr',k.toUpperCase())+V(P[k]+(gearBon(k)?' <small>(+'+gearBon(k)+')</small>':''))+'<button class="qm" data-hp="'+k+'" aria-label="What is '+k.toUpperCase()+'?">?</button><button class="plus" data-s="'+k+'" '+(P.ap?'':'disabled')+'>+</button></div>'+helpBox(k)).join('');
  const apr='<div class="srow">'+L('nv','ABILITY POINT')+V(P.ap)+'</div>';
  if(cview&&cview!=='full'){const f=FEAT.find(x=>x[0]===cview);h+='<div class="panel win"><div class="title">'+f[2].toUpperCase()+'</div>'+''+featBody(cview)+'<div class="pad"><button id="cb">Back to character</button></div></div>'}
  else if(cview==='full'){
   h+='<div class="panel win"><div class="title">FULL STATS</div><div class="srow">'+L('pk','NAME')+'<span class="val" id="sn"></span></div>'+rw('pk','JOB',jobName())+rw('pk','LEVEL',P.lvl)+rw('pk','LOCATION',m.n)+rw('pk','HP',P.hp+' / '+P.maxHp)+rw('pk','MP',P.mp+' / '+P.maxMp)+rw('pk','EXP',P.lvl>=MAXL?'MAX':P.exp+' / '+need+' ('+Math.floor(P.exp/need*100)+'%)')+'<hr>'+sr+apr+'<hr>'+
   extraRows()+rw('bl','MESOS',P.mesos)+'<div class="pad"><button id="cb">Back to character</button></div></div>'}
  else{
   h+=charPanel()+'<div class="panel win"><div class="title">EQUIPMENT INVENTORY</div>'+(pop?'<div style="padding:0 10px">'+popHtml()+'</div>':'')+eqDoll()+'</div>'+
   '<div class="panel win"><div class="title">CHARACTER STAT</div><div class="srow">'+L('pk','NAME')+'<span class="val" id="sn"></span></div>'+rw('pk','JOB',jobName())+rw('pk','LEVEL',P.lvl)+rw('bl','ATTACK',r[0]+' ~ '+r[1])+rw('bl','WEAPON DEF.',defTotal())+rw('bl','MAGIC DEF.',mdefTotal())+'<hr>'+sr+apr+extraStats()+'</div>'+
   '<div class="panel win"><div class="title">MORE</div><div class="tiles">'+[['full','📋','Full stats'],['skills','✨','Skills'],['quests','📜','Quests'],['book','📖','Monster Book'],['family','🌳','Family'],['rank','🏆','Ranking']].map(f=>'<button class="tile" data-cv="'+f[0]+'"><span>'+f[1]+'</span>'+f[2]+(f[0]==='skills'&&P.sp?' ('+P.sp+')':'')+'</button>').join('')+'</div></div>'}}
 if(tab==='menu'){
  if(!feat)h+='<div class="panel win"><div class="title">MENU</div><div class="tiles">'+FEAT.map(f=>'<button class="tile" data-f="'+f[0]+'"'+(IRON()&&LOCKED.includes(f[0])?' disabled':'')+'><span>'+f[1]+'</span>'+f[2]+(IRON()&&LOCKED.includes(f[0])?' 🔒':'')+'</button>').join('')+'</div>'+(IRON()?'<div class="mute" style="padding:0 10px 10px">🔒 Ironmen can\'t trade with players or use the Free Market.</div>':'')+'</div>';
  else{const f=FEAT.find(x=>x[0]===feat);h+='<div class="panel win"><div class="title">'+f[2].toUpperCase()+'</div>'+''+featBody(feat)+'<div class="pad"><button id="fb">Back to menu</button></div></div>'}}
 if(tab==='quests')h+=questsPanel();
 if(tab==='social')h+=socialPanel();
 if(tab==='pack')h+=packHtml();
 {const xp=P.lvl>=MAXL?100:Math.min(100,P.exp/need*100);h+='<div class="xpb"><div class="xpi"><i style="width:'+xp+'%"></i><span>Lv '+P.lvl+' &nbsp; EXP '+(P.lvl>=MAXL?'MAX':P.exp+' / '+need+' ['+xp.toFixed(2)+'%]')+'</span></div></div>'}
 if(introOpen)h+=introHtml();
 if(lootAsk)h+=lootAskHtml();
 if(logs.length){const LT=[['all','All'],['self','Self'],['map','Map'],['party','Party'],['guild','Guild']],vis=logs.filter(logTab).slice(-40).reverse();
  h+='<div class="panel" id="log"><h2>Activity log</h2><div class="seg ltb">'+LT.map(t=>'<button class="'+(ltab===t[0]?'on':'')+'" data-lt="'+t[0]+'">'+t[1]+'</button>').join('')+'</div><div class="lgb">'+(vis.length?vis.map(l=>'<div class="'+l[1]+'">'+l[0].replace(/</g,'&lt;')+'</div>').join(''):'<div>Nothing here yet.</div>')+'</div></div>'}
 const _ql=app.querySelector('.qzl'),_qy=_ql?_ql.scrollTop:0;
 app.innerHTML=h;{const e=app.querySelector('.qzl');if(e)e.scrollTop=_qy}$('pn').textContent=P.name;{const sn=$('sn');if(sn)sn.textContent=P.name}
 app.querySelectorAll('[data-lp]').forEach(b=>b.onclick=()=>lootOne(+b.dataset.lp));{const e=$('lootall');if(e)e.onclick=lootAll}app.querySelectorAll('[data-lt]').forEach(b=>b.onclick=()=>{ltab=b.dataset.lt;render()});app.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;feat=null;cview=null;pop=null;qgive=null;render()});
 app.querySelectorAll('[data-qt]').forEach(b=>b.onclick=()=>{qtab=b.dataset.qt;qsel=null;qgive=null;render()});
 app.querySelectorAll('[data-qz]').forEach(b=>b.onclick=()=>{qsel=b.dataset.qz;qgive=null;render()});
 app.querySelectorAll('[data-qk]').forEach(b=>b.onclick=()=>qTrack(b.dataset.qk));
 app.querySelectorAll('[data-qg]').forEach(b=>b.onclick=()=>{qgive=b.dataset.qg;render()});
 app.querySelectorAll('[data-qgy]').forEach(b=>b.onclick=()=>qGiveUp(b.dataset.qgy));
 app.querySelectorAll('[data-qgn]').forEach(b=>b.onclick=()=>{qgive=null;render()});
 app.querySelectorAll('[data-qo]').forEach(b=>b.onclick=()=>{tab='quests';qtab='prog';qsel=b.dataset.qo;qgive=null;feat=null;cview=null;pop=null;render();window.scrollTo(0,0)});
 app.querySelectorAll('[data-pt]').forEach(b=>b.onclick=()=>{ptab=b.dataset.pt;sel=null;render()});app.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{pop={id:b.dataset.i,eq:b.dataset.e==='1'};render()});app.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{if(b.dataset.f==='quests'){tab='quests';feat=null;return render()}feat=b.dataset.f;render()});app.querySelectorAll('[data-k]').forEach(b=>b.onclick=e=>{e.stopPropagation();spendSk(b.dataset.k)});app.querySelectorAll('[data-skt]').forEach(b=>b.onclick=()=>{skTab=+b.dataset.skt;skSel=null;render()});app.querySelectorAll('[data-sks]').forEach(b=>b.onclick=()=>{const k=b.dataset.sks;skSel=(k&&skSel!==k)?k:null;render()});app.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>{if(b.dataset.cv==='quests'){tab='quests';cview=null;return render()}cview=b.dataset.cv;render()});app.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{selNpc=null;talk={npc:b.dataset.n,page:'main'};render()});app.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>dlgDo(b.dataset.d));app.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>go(b.dataset.g));
 app.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>spend(b.dataset.s));

 app.querySelectorAll('[data-why]').forEach(b=>{b.addEventListener('click',()=>{const c=$('navcap');if(c&&!b.dataset.g)c.textContent=b.dataset.why})});app.querySelectorAll('[data-sh]').forEach(b=>b.onclick=()=>{shopSel=b.dataset.sh;shopQty=1;shopConfirm=false;render()});
 
 app.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{shopTab=b.dataset.st;shopSel=null;shopQty=1;shopConfirm=false;render()});
 {const e=$('sq');if(e){e.oninput=()=>{const mx=Math.max(1,shopMax());let v=parseInt(e.value,10);if(isNaN(v)||v<1)v=1;if(v>mx){v=mx;e.value=mx}shopQty=v;const pr=shopTab==='buy'?buyPrice(shopSel):sellVal(shopSel),t=$('stot');if(t)t.textContent=(shopTab==='buy'?'Total: ':'You get: ')+pr*v+' mesos'};e.onblur=()=>{e.value=shopQty}}}
 q0('smax',()=>{shopQty=Math.max(1,shopMax());render()});q0('sdo',()=>{shopConfirm=true;render()});q0('scf',()=>{shopConfirm=false;shopDo()});q0('scn',()=>{shopConfirm=false;render()});q0('sx',()=>{shopSel=null;shopConfirm=false;render()});
 app.querySelectorAll('[data-pl]').forEach(b=>b.onclick=()=>{viewPlayer=viewPlayer===b.dataset.pl?null:b.dataset.pl;viewPEq=false;render()});
 {const wt=!!talk&&tab==='play';if(wt&&!window._wt)window.scrollTo(0,0);window._wt=wt}
 {const lk=introOpen?'hidden':'';document.documentElement.style.overflow=lk;document.body.style.overflow=lk}
 q0('introgo',()=>{introOpen=false;render()});q0('brkbox',breakBox);
 q0('plx',()=>{viewPlayer=null;viewMe=false;viewPEq=false;render()});q0('meview',()=>{viewMe=!viewMe;viewPEq=false;render()});
 app.querySelectorAll('[data-pe]').forEach(b=>b.onclick=()=>{viewPEq=viewPEq===b.dataset.pe?false:b.dataset.pe;render()});
 app.querySelectorAll('[data-skp]').forEach(b=>b.onclick=()=>{skPage=+b.dataset.skp;qPick=null;render()});
 app.querySelectorAll('[data-eqs]').forEach(b=>b.onclick=()=>{pop={id:eqOf(b.dataset.eqs),eq:true};render()});
 app.querySelectorAll('.mcard').forEach(c=>c.onclick=e=>e.stopPropagation());
 app.querySelectorAll('[data-pa]').forEach(b=>b.onclick=()=>{const a=b.dataset.pa,id=pop&&pop.id;if(a==='equip'){equipItem(id);pop=null}else if(a==='unequip'){unequipItem(slotOf(id));pop=null}else if(a==='use'){if(P.hp>=P.maxHp&&(ITEMS[id].heal||ITEMS[id].hpp)&&!(ITEMS[id].mpheal||ITEMS[id].mpp)&&!(id==='apple'&&P.q.roger==='active'))log('Your HP is already full.','','items');useItem(id);if(!(P.inv[id]>0))pop=null}else if(a==='s0'||a==='s1'){const i=+a[1],o=1-i;if(P.pq[i]===id)P.pq[i]=null;else{if(P.pq[o]===id)P.pq[o]=null;P.pq[i]=id}save()}else pop=null;render()});
 const q=(i,f)=>{const e=$(i);if(e)e.onclick=f};q('adv',()=>stand(-1));q('bk',()=>stand(1));q('pq0',()=>pqClick(0));q('pq1',()=>pqClick(1));q('fl',flee);q('sk',()=>beginSeek(false));{const e=$('as');if(e)e.onchange=()=>{if(e.checked){autoSeek=true;if(!enc&&!MAPS[P.map].town)return beginSeek(true);return render()}autoSeek=false;render()}}{const go=st=>{autoLoot=st;lootAsk=false;autoSeek=true;if(!enc&&!MAPS[P.map].town)return beginSeek(true);render()};q('la_kill',()=>go('kill'));q('la_end',()=>go('end'));q('la_x',()=>{lootAsk=false;render()})}app.querySelectorAll('[data-qs]').forEach(b=>b.onclick=()=>{const i=+b.dataset.qs;if(qEdit){qPick=(qPick&&qPick.t==='s'&&qPick.i===i)?null:{t:'s',i};return render()}qsUse(P.qs[i])});app.querySelectorAll('[data-qe]').forEach(b=>b.onclick=()=>{qEdit=!qEdit;qPick=null;render()});app.querySelectorAll('[data-qpv]').forEach(b=>b.onclick=()=>{const v=b.dataset.qpv||null;if(qPick){if(qPick.t==='s')qsSet(qPick.i,v);else pqSet(qPick.i,v)}qPick=null;render()});q('fb',()=>{feat=null;render()});q('cb',()=>{cview=null;render()});q('reset',resetChar);q('tochars',()=>leaveGame('chars'));q('stchars',()=>leaveGame('chars'));q('stout',()=>leaveGame('title'));{const e=$('mv');if(e)e.onchange=()=>{mapView=e.value;render()}}app.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{mapView=b.dataset.z;render()});q('lv',()=>{inShop=false;render()});q('lootTg',()=>{lootOpen=!lootOpen;render()})}
let scr='title',SLOT=0,wsel=0,chsel=1,cs=0,delArm=false;
let curUser='';const MYID=()=>curUser;
function slotData(i){try{return JSON.parse(LS.getItem('mapleish_c'+i))}catch(e){return null}}
const MODES=[['Normal','🌳','Standard rules.'],['Ironman','⚙️','Shops are open, but no trading or Free Market.'],['Hardcore','💀','One life. Dying deletes your character.'],['Hardcore Ironman','☠️','No trading or Free Market, and one life.']];
const LOCKED=['market','trade'];
const MODE=()=>0,IRON=()=>false,HC=()=>false;
const CLS=[['Warrior','⚔️','str','STR',35,'str','dex'],['Magician','🔮','int','INT',20,'int','luk'],['Bowman','🏹','dex','DEX',25,'dex','str'],['Thief','🗡️','dex','DEX',25,'luk','dex']];
function rollTips(r){const e=k=>r[k]-4,sc=CLS.map(c=>e(c[5])+e(c[6])/2-['str','dex','int','luk'].filter(k=>k!==c[5]&&k!==c[6]).reduce((a,k)=>a+e(k),0)/2),ST=sc.map(v=>Math.max(0,Math.min(5,Math.round(v/9*5)))),mx=Math.max(...ST),top=CLS.filter((c,i)=>ST[i]===mx).map(c=>c[0]).join(' / ');
 const head=mx>=4?'Strong roll for '+top+'.':mx>=3?'Solid roll for '+top+'.':'Even roll. Any path works, but you will spend a lot of AP.';
 return '<div class="tips"><b class="th">'+head+'</b><div class="mute" style="margin:2px 0 4px">Stats you can add: 5 AP per level, 45 AP by Level 10, when a new path opens. Stars reward your main stat and dock points for stats a class never uses.</div>'+CLS.map((c,i)=>{const need=Math.max(0,c[4]-r[c[2]]),st=ST[i];return '<div class="tr"><span class="tn">'+c[1]+' <b>'+c[0]+'</b> <span class="mute">'+c[5].toUpperCase()+'/'+c[6].toUpperCase()+'</span></span><span class="mute tm">'+c[3]+' '+c[4]+' · '+(need?need+' AP to go':'ready')+'</span><i class="fit">'+'★'.repeat(st)+'☆'.repeat(5-st)+'</i></div>'}).join('')+'</div>'}
/* NETWORK NOTES (this build is fully offline; everything below is a local stand-in):
 1. Accounts: need a server database. Passwords must be hashed server-side, never kept in the browser.
 2. Email confirmation: needs an email service to send the code or link. Here the code is shown on screen instead.
 3. Google login: needs a Google OAuth client ID and a backend that verifies the Google token.
 4. Forgot password: needs the same email service.
 5. Characters are saved per browser, not per account, until there is a server. */
const AC=()=>{try{return JSON.parse(LS.getItem('mapleish_accts'))||{}}catch(e){return{}}},saveAC=a=>{try{LS.setItem('mapleish_accts',JSON.stringify(a))}catch(e){}};
const lsGet=k=>{try{return LS.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{LS.setItem(k,v)}catch(e){}},lsDel=k=>{try{LS.removeItem(k)}catch(e){}};
async function sha(t){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return btoa(unescape(encodeURIComponent(t)))}}
let notice='',noticeBad=false,vUser='';const goTo=n=>{scr=n;render()},msg=(t,b)=>{notice=t;noticeBad=!!b},newCode=()=>String(Math.floor(100000+Math.random()*900000)),enter=(ids,btn)=>ids.forEach(i=>{const e=$(i);if(e)e.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();$(btn).click()}}}),noteHtml=(n,b)=>n?`<div class='note${b?' bad':''}'>${n}</div>`:'';
function loginScreen(){const n=notice,nb=noticeBad;notice='';const id=(lsGet('mapleish_id')||'').replace(/[^A-Za-z0-9]/g,''),spw=lsGet('mapleish_spw'),spu=lsGet('mapleish_spwu');
 app.innerHTML=`<div class='scr c'><div class='logo'><span>🍁</span>Maplelite<small>An offline Maple adventure</small></div><div class='panel lg'><h2>Log in</h2>${noteHtml(n,nb)}<label>ID<input id='aid' maxlength='12' autocomplete='username' placeholder='Enter your ID' value='${id}'></label><label>Password<input id='apw' type='password' autocomplete='current-password' placeholder='Enter your password'></label><div class='chk'><label><input type='checkbox' id='sid'${id?' checked':''}> Save ID</label><label><input type='checkbox' id='spwc'${spw&&spu===id?' checked':''}> Save password</label></div><div class='mute' id='lgmsg'></div><button class='wide gbtn' id='goog'><i>G</i> Sign in with Google</button><div class='links'><button class='lnk' id='forgot'>Forgot password?</button></div></div><div class='foot'><button id='reg'>Create account</button><button class='main' id='login'>Log in</button></div></div>`;
 const pw=$('apw'),m=t=>{const e=$('lgmsg');e.textContent=t;e.style.color='#d4443f'};
 if(spw&&id&&spu===id){pw.value='••••••••';pw.dataset.saved='1'}
 pw.oninput=()=>{delete pw.dataset.saved};enter(['aid','apw'],'login');
 $('login').onclick=async()=>{const v=$('aid').value.trim();if(!/^[A-Za-z0-9]{4,12}$/.test(v))return m('Enter an ID of 4-12 letters or digits.');if(!pw.value)return m('Enter a password.');
  const A=AC()[v];if(!A)return m('No account with that ID. Choose Create account.');
  const h=pw.dataset.saved&&lsGet('mapleish_spwu')===v?lsGet('mapleish_spw'):await sha(v+':'+pw.value);
  if(h!==A.h)return m('Wrong password.');
  if(!A.ok){vUser=v;msg('Your account is not confirmed yet. Enter the code from your confirmation email.');return goTo('verify')}
  if($('sid').checked)lsSet('mapleish_id',v);else lsDel('mapleish_id');
  if($('spwc').checked){lsSet('mapleish_spw',h);lsSet('mapleish_spwu',v)}else{lsDel('mapleish_spw');lsDel('mapleish_spwu')}
  curUser=v;lsSet('mapleish_sess',v);if(window.__wsFrom==='site')return window.__wsHome();goTo('chars')};
 $('goog').onclick=()=>m('Google sign-in needs a network connection and a Google OAuth client. It is not available in this offline build.');
 $('forgot').onclick=()=>m('Password reset needs email delivery, which is not available offline.');
 $('reg').onclick=()=>goTo('register')}
function regScreen(){const n=notice,nb=noticeBad;notice='';
 app.innerHTML=`<div class='scr'><div class='panel lg'><h2>Create account</h2>${noteHtml(n,nb)}<label>ID<input id='ru' maxlength='12' autocomplete='username' placeholder='4-12 letters or digits'></label><label>Email<input id='re' type='email' autocomplete='email' placeholder='you@example.com'></label><label>Password<input id='rp' type='password' autocomplete='new-password' placeholder='At least 8 characters'></label><label>Confirm password<input id='rp2' type='password' autocomplete='new-password'></label><div class='chk'><label><input type='checkbox' id='rt'> I agree to the Terms of Service and Privacy Policy</label></div><div class='mute' id='rmsg'>We will send a confirmation email. You can't log in until you confirm it.</div></div><div class='foot'><button id='rbk'>Back</button><button class='main' id='rgo'>Register</button></div></div>`;
 const m=t=>{const e=$('rmsg');e.textContent=t;e.style.color='#d4443f'};enter(['ru','re','rp','rp2'],'rgo');
 $('rbk').onclick=()=>goTo('title');
 $('rgo').onclick=async()=>{const u=$('ru').value.trim(),em=$('re').value.trim().toLowerCase(),p1=$('rp').value,a=AC();
  if(!/^[A-Za-z0-9]{4,12}$/.test(u))return m('ID must be 4-12 letters or digits.');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return m('Enter a valid email address.');
  if(p1.length<8)return m('Password must be at least 8 characters.');
  if(p1!==$('rp2').value)return m('Passwords do not match.');
  if(!$('rt').checked)return m('You must agree to the Terms of Service.');
  if(a[u])return m('That ID is taken.');
  if(Object.values(a).some(x=>x.email===em))return m('That email is already registered.');
  a[u]={email:em,h:await sha(u+':'+p1),ok:false,code:newCode()};saveAC(a);vUser=u;msg('Account created. Check your email for the confirmation code.');goTo('verify')}}
function verScreen(){const a=AC(),A=a[vUser];if(!A)return goTo('title');const n=notice,nb=noticeBad;notice='';
 app.innerHTML=`<div class='scr'><div class='panel lg'><h2>Confirm your email</h2>${noteHtml(n,nb)}<p style='margin:0 0 8px'>We sent a 6-digit code to <b>${A.email.replace(/^(.).*(@.*)$/,'$1***$2')}</b>. Enter it to activate your account.</p><div class='note'>Offline build: no email can be sent, so your code is shown here: <b>${A.code}</b></div><label>Confirmation code<input id='vc' inputmode='numeric' maxlength='6' autocomplete='one-time-code' placeholder='6 digits'></label><div class='mute' id='vmsg'></div></div><div class='foot'><button id='vbk'>Back</button><button id='vre'>Resend</button><button class='main' id='vgo'>Confirm</button></div></div>`;
 enter(['vc'],'vgo');$('vbk').onclick=()=>goTo('title');
 $('vre').onclick=()=>{A.code=newCode();saveAC(a);msg('A new code was sent.');goTo('verify')};
 $('vgo').onclick=()=>{if($('vc').value.trim()!==A.code){const e=$('vmsg');e.textContent='That code is not right.';e.style.color='#d4443f';return}A.ok=true;delete A.code;saveAC(a);lsSet('mapleish_id',vUser);msg('Account confirmed. You can log in now.');goTo('title')}}
function lastChar(){const L=lsGet('mapleish_last');if(L===null||L==='')return null;const c=slotData(+L);return c?{k:+L,c}:null}
function leaveGame(next){save();wsel=MODE();cs=SLOT-wsel*3;P=null;enc=null;talk=null;inShop=false;pop=null;logs=[];autoSeek=false;seeking=false;clearTimeout(autoT);introOpen=false;feat=null;cview=null;tab='play';scr=next;render()}
let fallen=null;
function confirmNew(v,ok){return ok();const M=MODES[MODE()];app.insertAdjacentHTML('beforeend',`<div class='intro' id='cfm'><div class='mcard'><h2>Create ${v}?</h2><p><b>Mode: ${M[1]} ${M[0]}</b><br>${M[2]}</p><p>⚠️ A character's mode is permanent. You can't change it later.</p><div class='ex'><button id='cfno'>Go back</button><button class='main' id='cfyes'>Create character</button></div></div></div>`);$('cfno').onclick=()=>$('cfm').remove();$('cfyes').onclick=ok}
function hcDie(){fallen={n:P.name,l:P.lvl};enc=null;autoSeek=false;seeking=false;clearTimeout(autoT);inShop=false;talk=null;selNpc=null;try{LS.removeItem('mapleish_c'+SLOT)}catch(e){}P=null;scr='fallen';render()}
function flow(){
 if((scr==='title'||scr==='register'||scr==='verify')&&lsGet('mapleish_sess')&&AC()[lsGet('mapleish_sess')]&&AC()[lsGet('mapleish_sess')].ok){curUser=lsGet('mapleish_sess');scr='chars'}
 if(scr==='create')return login();
 if(scr==='title')return loginScreen();
 if(scr==='register')return regScreen();
 if(scr==='verify')return verScreen();
 const tr=c=>`<div class='st4'>${['str','dex','int','luk'].map(k=>`<div><small>${k.toUpperCase()}</small><b>${c[k]}</b></div>`).join('')}</div>`,where=c=>MAPS[c.map]?MAPS[c.map].n:'Mushroom Town';
 let h='';
 if(scr==='fallen'){const M=MODES[MODE()];h=`<div class='scr c'><div class='panel hero'><h2>Fallen</h2><div class='avl dim'>🪦</div><div class='cn'>${fallen.n}</div><div class='mute'>${M[1]} ${M[0]} · Level ${fallen.l}</div><div class='mute'>Hardcore characters get one life.</div></div><div class='foot'><button class='main' id='fok'>Back to character select</button></div></div>`}
 else if(scr==='world'){const l=lastChar(),lm=l?MODES[Math.floor(l.k/3)]:null;
  h=`<div class='scr'>${l?`<div class='panel hero'><h2>Continue</h2><div class='avl'>🧙</div><div class='cn'>${l.c.name}</div><div class='mute'>${lm[1]} ${lm[0]} · Lv ${l.c.lvl} · ${where(l.c)}</div>${tr(l.c)}<div class='ex'><button class='main' id='cont'>Continue</button></div></div>`:''}<div class='panel'><div class='row'><h2>Select a mode</h2><span class='mute'>${MYID()}</span></div>${MODES.map((w,i)=>{const n=[3,3,1,1][i];let u=0;for(let k=0;k<n;k++)if(slotData(i*3+k))u++;return `<button class='wl${wsel===i?' on':''}' data-w='${i}'><span class='av'>${w[1]}</span><span class='wt'><b>${w[0]}</b><span class='mute'>${w[2]}</span></span><span class='mute'>${u}/${n}</span></button>`}).join('')}</div><div class='foot'><button id='wbk'>Log out</button><button class='main' id='wgo'>Select ${MODES[wsel][0]}</button></div></div>`}
 else{const n=6,M=MODES[0];wsel=0;if(cs>=n)cs=0;const c=slotData(cs);
  h=`<div class='scr'><div class='panel hero'><h2>Characters</h2>${c?`<div class='avl'>🧙</div><div class='cn'>${c.name}</div><div class='mute'>Lv ${c.lvl} · ${where(c)}</div>${tr(c)}<div class='ex'><button id='cdel'>${delArm?'Click again to delete':'Delete'}</button><button class='main' id='cstart'>Start game</button></div>`:`<div class='avl dim'>＋</div><div class='cn'>Empty slot</div><div class='mute'>Slot ${cs+1} of 6. Create a new adventurer.</div><div class='ex'><button class='main' id='cnew'>Create character</button></div>`}</div><div class='panel'><h2>Characters</h2><div class='slots'>${Array.from({length:n},(_,i)=>{const x=slotData(i);return `<button class='cs${cs===i?' on':''}' data-cs='${i}'><span>${x?'🧙':'＋'}</span><b>${x?x.name:'Empty'}</b><small>${x?'Lv '+x.lvl:'Open'}</small></button>`}).join('')}</div></div><div class='foot'><button id='cbk'>Log out</button></div></div>`}
 app.innerHTML=h;
 const q=(s,f)=>{const e=app.querySelector(s);if(e)e.onclick=f},go=n=>{scr=n;delArm=false;render()},enterGame=()=>{tab='play';ptab='equip';feat=null;cview=null;pop=null;enc=null;talk=null;selNpc=null;inShop=false;logs=[];introOpen=false;go('game')};
 q('#fok',()=>go('chars'));q('#wbk',()=>go('title'));q('#wgo',()=>{cs=0;go('chars')});q('#cbk',()=>{lsDel('mapleish_sess');curUser='';scr='title';window.__wsHome()});
 q('#cont',()=>{const l=lastChar();if(!l)return render();SLOT=l.k;wsel=Math.floor(l.k/3);cs=l.k%3;P=null;load();if(!P)return render();enterGame()});
 app.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{wsel=+b.dataset.w;cs=0;render()});
 app.querySelectorAll('[data-cs]').forEach(b=>b.onclick=()=>{cs=+b.dataset.cs;delArm=false;render()});
 q('#cnew',()=>{SLOT=cs;P=null;rollSt=null;go('create')});
 q('#cdel',()=>{if(!delArm){delArm=true;return render()}try{LS.removeItem('mapleish_c'+cs)}catch(e){}go('chars')});
 q('#cstart',()=>{SLOT=cs;P=null;load();if(!P)return render();enterGame()});
}
/* ===== Update: temporary map clears, Medal slot, no Training Center, geographic zoomable map ===== */
/* A map is passable if it is a town, was cleared since you arrived, or you out-level its toughest monster by 25+ (unless m.special). */
const maxLv=m=>Math.max(0,...(m.mons||[]).map(k=>MON[k]?MON[k].lv:0));
const freeMove=m=>!m.town&&!m.special&&(m.mons||[]).length>0&&P.lvl>=maxLv(m)+25;
/* v3.3: the beginner training at the Mushroom Town gates can be skipped from level 8 */
const TRAINING_MAPS=['mushroom_west','mushroom_town','training_camp','mushroom_east'];
const isOpen=id=>{const m=MAPS[id];return !!m&&(!!m.town||!!(P.cleared&&P.cleared[id])||freeMove(m)||(P.lvl>=8&&TRAINING_MAPS.includes(id)))};

/* Medal slot */
ITEMS.newbie_medal={n:'Newbie Medal',i:'🏅',s:'Medal',req:0,sell:1,def:0,bon:null,mhp:5,mmp:5};
DESC.newbie_medal='A basic medal given to hard-working newcomers. Max HP +5, Max MP +5.';
SLOTS.push('Medal');
QD.pio2.rw={items:{newbie_medal:1}};
QD.pio2.goal='Talk to Pio again. He has a thank-you medal for you.';
const medB=()=>{const id=(P.eq||{}).Medal,it=id&&eqOk(id)&&ITEMS[id];return it?[it.mhp||0,it.mmp||0]:[0,0]};
const medAdj=(a,b)=>{if(!a&&!b)return;P.maxHp=Math.max(1,P.maxHp+a);P.maxMp=Math.max(1,P.maxMp+b);P.hp=Math.min(P.hp,P.maxHp);P.mp=Math.min(P.mp,P.maxMp)};
const _eqI=equipItem;equipItem=function(id){const a=medB();_eqI(id);const b=medB();medAdj(b[0]-a[0],b[1]-a[1])};
const _unI=unequipItem;unequipItem=function(sl){const a=medB();_unI(sl);const b=medB();medAdj(b[0]-a[0],b[1]-a[1])};
const _ir2=itemRows;itemRows=function(id,st){const r=_ir2(id,st),it=ITEMS[id];if(it&&it.mhp)r.splice(1,0,['Max HP','+'+it.mhp],['Max MP','+'+it.mmp]);return r};

/* The ferry exit was lost when Southperry was redefined; restore it */
if(!MAPS.southperry.ex.some(e=>e[0]==='lith_harbor'))MAPS.southperry.ex.push(['lith_harbor','Ferry to Lith Harbor, Victoria Island','ferry']);
/* Training Center removed */
['atc_entrance','atc_1','atc_2','atc_3','atc_4'].forEach(k=>{delete MAPS[k];delete NAV[k]});
MAPS.amherst.ex=MAPS.amherst.ex.filter(e=>!/^atc_/.test(e[0]));
const _ci=cashInit;cashInit=function(){_ci();if(P.tr)for(const k in P.tr)P.tr[k]=P.tr[k].filter(id=>MAPS[id])};

/* Geography. Local island coordinates [x,y], y grows southward. */
const MAPLE=[['mushroom_west',4,8,'West Gate'],['mushroom_town',15,10,'Town'],['training_camp',27,13,'Town 2'],['mushroom_east',38,18,'East Gate'],['snail_hunting_ground_1',40,30,'Sm. Forest'],['snail_hunting_ground_2',33,41,'Snails II'],['snail_hunting_ground_3',26,51,'Snails III'],['a_split_road',29,62,'Split Road'],['inside_dangerous_forest',40,66,'In. Dang.'],['field_west_of_amherst',50,58,'West Field'],['mushroom_garden',49,45,'Garden 2'],['dangerous_forest',47,76,'Dang. Forest'],['amherst',62,51,'Amherst'],['snail_garden',64,37,'Snail Garden'],['tomato_field',76,41,'Tomatoes'],['snail_field',77,53,'Flowers'],['middle_forest_1',60,65,'Forest I'],['middle_forest_2',57,79,'Forest II'],['field_east_of_amherst',74,64,'East Field'],['inside_small_forest_2',84,72,'Sm. For. 2'],['field_west_of_southperry',88,82,'SP Field'],['southperry',95,92,'Southperry']];
const VICT=[['lith_harbor',6,62,'Lith Harbor'],['pig_beach',9,80,'Pig Beach'],['road_to_henesys',21,60,'Henesys Rd'],['henesys',35,56,'Henesys'],['henesys_hunting_ground_1',33,72,'Hunting I'],['henesys_hunting_ground_2',46,80,'Hunting II'],['forest_path',35,40,'Forest Path'],['ellinia',35,24,'Ellinia'],['ellinia_forest',24,9,'Ellinia For.'],['rocky_path',51,52,'Rocky Path'],['perion',67,46,'Perion'],['rocky_mountain',69,64,'Rocky Mtn'],['kerning_road',79,36,'Kerning Rd'],['kerning_city',91,30,'Kerning'],['kerning_outskirts',92,48,'Outskirts']];
const WPOS={};
MAPLE.forEach(a=>{NAV[a[0]]=[a[1],a[2],a[3]];WPOS[a[0]]=[2+a[1]*.36,30+a[2]*.56]});
VICT.forEach(a=>{NAV[a[0]]=[a[1],a[2],a[3]];WPOS[a[0]]=[48+a[1]*.38,22+a[2]*.55]});
const MAJOR=new Set(['mushroom_town','amherst','southperry','lith_harbor','henesys','ellinia','perion','kerning_city']);
const PREV={orbis:[56,28,'Orbis','☁️'],el_nath:[66,40,'El Nath','❄️'],ludibrium:[46,58,'Ludibrium','🧸'],leafre:[40,76,'Leafre','🐲'],mu_lung:[86,58,'Mu Lung','🥋'],herb:[92,72,'Herb Town','🌿'],ariant:[66,76,'Ariant','🏜️'],magatia:[76,50,'Magatia','⚗️']};
/* World-map layout, loosely following the Maple World chart: Maple Island north, Victoria Island west, Ossyria the big continent east */
const WW={mushroom_town:[8,8],amherst:[24,10],southperry:[16,22],lith_harbor:[5,56],henesys:[10,45],ellinia:[12,35],perion:[26,37],kerning_city:[26,51]};
const W2=k=>{if(WW[k])return WW[k];let b=null,d=1e9;for(const j in WW)if(reg(j)===reg(k)){const q=Math.hypot(WPOS[j][0]-WPOS[k][0],WPOS[j][1]-WPOS[k][1]);if(q<d){d=q;b=j}}return [WW[b][0]+3,WW[b][1]+4]};
const PREVE=[['ellinia','orbis'],['orbis','el_nath'],['orbis','ludibrium'],['ludibrium','leafre'],['leafre','mu_lung'],['mu_lung','herb']];
mapView='near';
worldMap=function(){
 const view=mapView==='half'||mapView==='full'?mapView:'near',here=P.map,m=MAPS[here],ok=isOpen(here);
 let keys;
 if(view==='near')keys=Object.keys(nearSet()).filter(k=>WPOS[k]&&reg(k)===reg(here));
 else if(view==='half')keys=Object.keys(WPOS).filter(k=>reg(k)===reg(here));
 else keys=Object.keys(WPOS).filter(k=>MAJOR.has(k)||k===here);
 const pts=keys.map(k=>view==='full'?W2(k):WPOS[k]).concat(view==='full'?Object.keys(PREV).map(k=>PREV[k]):[]);
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const s=Math.min(view==='near'?6:30,76/Math.max(x1-x0,5),70/Math.max(y1-y0,5)),cx=(x0+x1)/2,cy=(y0+y1)/2;
 const f=p=>[50+(p[0]-cx)*s,45+(p[1]-cy)*s],pos={};
 keys.forEach(k=>pos[k]=f(view==='full'?W2(k):WPOS[k]));
 const L=(a,b,on)=>'<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+(on?'#2f6fb8':(view==='near'?'#9fb0c8':'#7d8fa8'))+'" stroke-width="'+(on?4:view==='near'?3:2)+'"'+(on?'':' stroke-dasharray="6 5"')+' vector-effect="non-scaling-stroke"/>';
 const B=(cls,x,y,ic,lb,why,attr,nm)=>'<button class="'+cls+'"'+(attr||'')+' aria-label="'+(nm||'').replace(/"/g,'')+'" data-why="'+why.replace(/"/g,'&quot;')+'" style="left:'+x+'%;top:'+y+'%">'+ic+(lb?'<span>'+lb+'</span>':'')+'</button>';
 let bg='',ln='',nd='',rl='';
 if(view!=='near'){
  const blob=(ks,fill,stroke,dash,lab)=>{const ps=ks.map(k=>pos[k]||f(PREV[k])),a=Math.min(...ps.map(p=>p[0]))-5,b=Math.max(...ps.map(p=>p[0]))+5,c=Math.min(...ps.map(p=>p[1]))-6,d=Math.max(...ps.map(p=>p[1]))+6;rl+='<div class="rl" style="left:'+(a+b)/2+'%;top:'+(c+.5)+'%">'+lab+'</div>';return '<rect x="'+a+'" y="'+c+'" width="'+(b-a)+'" height="'+(d-c)+'" rx="6" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2"'+(dash?' stroke-dasharray="5 4"':'')+' vector-effect="non-scaling-stroke"/>'};
  ['maple','victoria'].forEach(r=>{const ks=keys.filter(k=>reg(k)===r);if(ks.length)bg+=blob(ks,'#a8d982','#6faa4c',0,r==='maple'?'Maple Island':'Victoria Island')});
  if(view==='full')bg+=blob(Object.keys(PREV),'#e6e9f6','#9aa5cf',1,'Ossyria')}
 const seen={};
 if(view!=='full')keys.forEach(a=>MAPS[a].ex.forEach(e=>{const b=e[0],kk=[a,b].sort().join();if(seen[kk]||!pos[b])return;seen[kk]=1;ln+=L(pos[a],pos[b],a===here||b===here)}));
 keys.forEach(k=>{const t=MAPS[k],c=pos[k],mj=MAJOR.has(k),sz=view==='near'?'':(mj?' cty':' sm');
  let cls='nd far'+sz,why=t.n+' is a few stops away from here.',attr='',ic=t.i;
  if(k===here){cls='nd here'+sz;why='You\'re in '+t.n+' right now.'}
  else{const i=m.ex.findIndex(e=>e[0]===k);
   if(i>=0){const e=m.ex[i],q=e[2]&&P.q[e[2]]!=='done',cl=!ok&&i>0;
    if(q||cl){cls='nd lock'+sz;ic='\u{1F512}';why=q?'The way to '+t.n+' opens once you finish "'+QD[e[2]].n+'".':'Defeat a few more monsters here before moving on ('+P.kills+'/'+needFor(m)+'), or reach level '+(maxLv(m)+25)+'.'}
    else{cls='nd ok'+sz;attr=' data-g="'+k+'"';why='Head to '+t.n+'.'}}}
  if(view==='full'){attr='';cls=cls.replace('nd ok','nd far').replace('nd lock','nd far');if(k!==here&&ic==='\u{1F512}')ic=t.i}
  if(view==='full'&&!mj&&k!==here)ic='';
  const lb=view==='near'?t.n:((mj||k===here)?NAV[k][2]:'');
  nd+=B(cls,c[0],c[1],ic,lb,why,attr,t.n)});
 if(view==='half'){keys.forEach(a=>MAPS[a].ex.forEach(e=>{const b=e[0];if(!WPOS[b]||reg(b)===reg(a))return;
  const pa=pos[a],pb=f(WPOS[b]),dx=pb[0]-pa[0],dy=pb[1]-pa[1],d=Math.hypot(dx,dy)||1,sx=Math.min(92,Math.max(8,pa[0]+dx/d*14)),sy=Math.min(78,Math.max(10,pa[1]+dy/d*14)),lock=e[2]&&P.q[e[2]]!=='done',go2=a===here&&!lock,dest=reg(b)==='victoria'?'Victoria':'Maple Isl.';
  ln+=L(pa,[sx,sy],go2);
  nd+=go2?B('nd ok cty',sx,sy,'⛴️',dest,'Board the ferry to '+MAPS[b].n+'.',' data-g="'+b+'"','Ferry to '+dest):B('nd far cty',sx,sy,'⛴️',dest,a===here&&lock?'The ferry opens once you finish "'+QD[e[2]].n+'".':'The ferry to '+dest+'. Take it from the port town.','','Ferry to '+dest)}))}
 if(view==='full'){
  for(const k in PREV){const p=f(PREV[k]);nd+=B('nd far cty',p[0],p[1],PREV[k][3],PREV[k][2],PREV[k][2]+' isn\'t open yet.','',PREV[k][2])}}
 const cap={near:'',half:'The whole continent. Towns are labelled, small circles are hunting grounds. Travel between continents is by ferry.',full:'The world and where each continent lies, with its major cities. Orange marks where you are.'}[view];
 return '<div class="panel"><div class="row"><h2>Map</h2></div><div class="seg ltb">'+[['near','Close'],['half','Continent'],['full','World']].map(z=>'<button class="'+(z[0]===view?'on':'')+'" data-z="'+z[0]+'">'+z[1]+'</button>').join('')+'</div><div class="wm '+view+'"'+(view==='near'?'':' style="background:#bfe3f6"')+'><svg viewBox="0 0 100 100" preserveAspectRatio="none">'+bg+ln+'</svg>'+rl+nd+'</div><div class="mute" id="navcap" style="min-height:34px">'+cap+'</div></div>'};

/* ===== Per-map monster limits + respawns (v62-style) =====
   Each hunting map has a fixed number of spawn points. A monster being fought is claimed, so
   nobody else can attack it; a killed monster respawns on the shared map respawn tick.
   WORLD is deliberately global (not stored on the player) so it can move server-side for networking. */
const RESPAWN_TICK=7560;/* v62: no per-monster timers. The server sweeps every ~7.56s and refills every empty spawn slot up to the map's capacity. */
const SPAWNS={
 snail_hunting_ground_1:{snail:15},
 snail_hunting_ground_2:{snail:15,blue_snail:14},
 snail_hunting_ground_3:{blue_snail:21},
 inside_dangerous_forest:{shroom:10,blue_snail:8},
 dangerous_forest:{orange_mushroom:12,red_snail:5,snail:3},
 field_west_of_southperry:{red_snail:7,stump:3,orange_mushroom:3,blue_snail:1},
 field_east_of_amherst:{red_snail:7,stump:7,slime:4,pig:3},
 middle_forest_1:{blue_snail:6,red_snail:6,slime:4,stump:3,pig:2},
 middle_forest_2:{red_snail:4,slime:5,stump:5,pig:5},
 snail_garden:{blue_snail:19},
 snail_field:{blue_snail:19},
 /* estimated (not in the supplied v62 list) */
 field_west_of_amherst:{stump:8,shroom:8},
 mushroom_garden:{shroom:8,orange_mushroom:8},
 inside_small_forest_2:{orange_mushroom:16},
 tomato_field:{red_snail:10,snail:8},
 atc_entrance:{shroom:6,blue_snail:6,orange_mushroom:6},
 atc_1:{stump:20},atc_2:{red_snail:20},atc_3:{slime:20},atc_4:{orange_mushroom:20},
 mushroom_east:{tutorial_sentinel:6}
};
for(const id in SPAWNS){const m=MAPS[id];if(m&&!m.town)m.mons=Object.keys(SPAWNS[id])}
const WORLD={};let eidSeq=0;
function spawnTable(id){if(SPAWNS[id])return SPAWNS[id];const m=MAPS[id];if(!m||m.town||!m.mons||!m.mons.length)return null;const t={},per=Math.max(1,Math.round(18/m.mons.length));m.mons.forEach(k=>t[k]=per);return t}
function mobSlots(id){if(WORLD[id])return WORLD[id];const t=spawnTable(id);if(!t)return WORLD[id]=[];const a=[];for(const k in t)for(let i=0;i<t[k];i++)a.push({k,dead:0,by:0});return WORLD[id]=a}
function slotLive(s,now){if(s.dead&&now>=s.dead)s.dead=0;return !s.dead}
function mapCount(id){const now=Date.now(),a=mobSlots(id);let n=0;a.forEach(s=>{if(slotLive(s,now))n++});return[n,a.length]}
function claimSlot(id){const now=Date.now(),a=mobSlots(id),fr=[];a.forEach((s,i)=>{if(slotLive(s,now)&&!s.by)fr.push(i)});return fr.length?fr[R(0,fr.length-1)]:-1}
/* every monster that dies starts its own respawn timer (7.56 s), so killing several at once brings several back */
function killSlot(id,i){const s=mobSlots(id)[i];if(!s)return;s.by=0;s.dead=Date.now()+RESPAWN_TICK}
function releaseStale(){if(!P)return;const a=WORLD[P.map];if(!a)return;a.forEach(s=>{if(s.by&&!(enc&&enc.eid===s.by))s.by=0})}
seek=function(){const m=MAPS[P.map];if(m.town||enc)return false;releaseStale();const i=claimSlot(P.map);if(i<0)return false;
 const s=mobSlots(P.map)[i],k=s.k,d=MON[k],eid=++eidSeq;s.by=eid;
 enc={k,hp:d.hp,max:d.hp,gap:R(0,3),eid,sm:P.map,si:i,mv:Date.now()+mvT(d),next:Date.now()+d.iv+R(-200,200)};log('A '+d.n+' (Lv '+d.lv+') appears.','','combat');return true};
{const _w=win;win=function(){const sm=enc&&enc.sm,si=enc&&enc.si;_w();if(sm!==undefined&&si!==undefined)killSlot(sm,si)}}
beginSeek=function(auto){if(enc||seeking)return;seeking=true;seekAuto=!!auto;clearTimeout(autoT);
 const attempt=first=>{seeking=false;if(!P||enc)return;if(seekAuto&&!autoSeek)return render();const m2=MAPS[P.map];if(m2.town||talk){autoSeek=false;return render()}
  
  if(seek())return render();
  if(seekAuto&&autoSeek){seeking=true;if(first)log('No monsters left here. Waiting for them to respawn.','','combat');autoT=setTimeout(()=>attempt(false),1000);return render()}
  log('There are no monsters here right now. They respawn shortly.','','combat');render()};
 autoT=setTimeout(()=>attempt(true),auto?600:500);render()};
{const _bp=battlePanel;battlePanel=function(mode){const h=_bp(mode),m=MAPS[P.map];if(m.town)return h;const c=mapCount(P.map);return h.replace(/<\/div>$/,'<div class="mute" style="margin-top:6px">Monsters on this map: '+c[0]+'/'+c[1]+'</div></div>')}}
/* Loot bar: dropdown toggle and Loot all share one row, collapsed or open. */
lootPanel=function(){const d=dropsHere(),now=Date.now();if(!d.length)return'';const t=g=>{const s=Math.max(0,Math.ceil((g.exp-now)/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
 const hd='<div style="display:flex;gap:6px;align-items:stretch"><button id="lootTg" style="flex:1;display:flex;justify-content:space-between;align-items:center"><span>🎒 Loot ('+d.length+')</span><span>'+(lootOpen?'▾':'▸')+'</span></button><button class="main" id="lootall" style="white-space:nowrap;padding:2px 14px">Loot all</button></div>';
 const wrap='<div class="panel" id="loot" data-ln="'+d.length+'" style="padding:6px;margin-top:-4px">';
 if(!lootOpen)return wrap+hd+'</div>';
 return wrap+hd+'<div class="lgb" style="height:auto;max-height:180px;margin-top:6px;padding:0 4px">'+d.map(g=>'<div class="row" style="padding:3px 0;align-items:center"><span>'+ITEMS[g.id].i+' '+ITEMS[g.id].n+(g.q>1?' x'+g.q:'')+' <span class="mute" data-lx="'+g.u+'">'+t(g)+'</span></span><button data-lp="'+g.u+'" style="min-height:32px;padding:2px 12px">Loot</button></div>').join('')+'</div></div>'};

/* ===== Character tab avatar: drawn from the saved look plus whatever is equipped right now ===== */
function avItemColor(id){const b=(typeof baseOf==='function'?baseOf(id):id)||id,m=/^(top|bottom|shoes)_c(\d+)$/.exec(b);
 if(m){const L={top:LK.top,bottom:LK.bot,shoes:LK.shoe}[m[1]][+m[2]];if(L)return L[1]}
 const C={red:'#c43a3a',blue:'#3d6fc4',green:'#3f9a54',brown:'#7a5230',black:'#2b2b2b',yellow:'#e3c13a',white:'#f0f0f0',pink:'#e58bb5',purple:'#7b4fb5',orange:'#e08a2e'};
 for(const k in C)if(b.indexOf(k)>=0)return C[k];return '#8c8f96'}
function avatarSvg(p,wd){const lk=p.look||{g:LK.g[0],face:LK.face[0],hair:LK.hair[0][0],hc:LK.hc[0][0],skin:LK.skin[0][0]},eq=(p===P?publicGear().eq:p.eq)||{};
 const g=Math.max(0,LK.g.indexOf(lk.g)),hs=Math.max(0,LK.hair[g].indexOf(lk.hair))%4,m=Math.max(0,LK.face.indexOf(lk.face))%3;
 const sk=(LK.skin.find(x=>x[0]===lk.skin)||LK.skin[0])[1],hc=(LK.hc.find(x=>x[0]===lk.hc)||LK.hc[0])[1];
 const E=s=>eq[s]||null,col=s=>E(s)?avItemColor(E(s)):null,bid=s=>E(s)?((typeof baseOf==='function'?baseOf(E(s)):E(s))||''):'';
 const tp=col('Top')||sk,bt=col('Bottom')||sk,sh=col('Shoes')||sk,gl=col('Gloves'),cp=col('Cape');
 let s='<svg viewBox="0 0 90 110" style="width:'+(wd||150)+'px;display:block;margin:6px auto" role="img" aria-label="'+p.name+'"><rect width="90" height="110" rx="10" fill="#dff0fb"/><rect x="0" y="100" width="90" height="10" fill="#9ccf7a"/>';
 if(cp)s+='<rect x="23" y="46" width="36" height="44" rx="5" fill="'+cp+'" stroke="#0004"/>';
 if(hs===1||g&&hs!==3)s+='<rect x="26" y="18" width="30" height="38" rx="10" fill="'+hc+'"/>';
 s+='<rect x="30" y="46" width="22" height="26" rx="4" fill="'+tp+'" stroke="#0003"/><rect x="30" y="72" width="22" height="14" fill="'+bt+'" stroke="#0003"/>'
  +'<rect x="31" y="86" width="7" height="9" fill="'+sk+'"/><rect x="44" y="86" width="7" height="9" fill="'+sk+'"/>'
  +'<rect x="29" y="95" width="10" height="7" rx="2" fill="'+sh+'" stroke="#0002"/><rect x="43" y="95" width="10" height="7" rx="2" fill="'+sh+'" stroke="#0002"/>'
  +'<rect x="21" y="48" width="8" height="20" rx="3" fill="'+(E('Top')?tp:sk)+'" stroke="#0002"/><rect x="53" y="48" width="8" height="20" rx="3" fill="'+(E('Top')?tp:sk)+'" stroke="#0002"/>'
  ;
 s+='<rect x="21" y="62" width="8" height="7" rx="3" fill="'+(gl||sk)+'"/><rect x="53" y="62" width="8" height="7" rx="3" fill="'+(gl||sk)+'"/>';
 s+='<circle cx="41" cy="32" r="14" fill="'+sk+'"/>';
 if(hs===3)s+='<circle cx="58" cy="26" r="6" fill="'+hc+'"/>';
 s+=hs===1?'<polygon points="27,26 31,10 37,20 41,8 47,20 52,10 55,26" fill="'+hc+'"/>':'<path d="M27 30 Q28 14 41 14 Q54 14 55 30 Q41 22 27 30Z" fill="'+hc+'"/>';
 s+='<circle cx="36" cy="33" r="1.8" fill="#222"/><circle cx="46" cy="33" r="1.8" fill="#222"/><path d="'+(m===0?'M37 40 H45':m===1?'M37 42 Q41 38 45 42':'M37 39 Q41 44 45 39')+'" stroke="#a33" fill="none" stroke-width="1.5"/>';
 if(E('Earring'))s+='<circle cx="27" cy="37" r="2" fill="#e5c35a" stroke="#0004" stroke-width=".5"/>';
 if(E('Eyes')||E('Face'))s+='<text x="'+(E('Eyes')?34:35)+'" y="'+(E('Eyes')?36:44)+'" font-size="'+(E('Eyes')?14:10)+'">'+ITEMS[E('Eyes')||E('Face')].i+'</text>';
 if(E('Hat')){const b=bid('Hat'),c=col('Hat');
  if(/skullcap/.test(b))s+='<path d="M26 28 Q27 11 41 11 Q55 11 56 28 Z" fill="'+c+'" stroke="#0004"/>';
  else if(/headband/.test(b))s+='<rect x="26" y="20" width="30" height="5" rx="2" fill="'+c+'" stroke="#0004"/><path d="M56 22 l8 -3 l-3 7 z" fill="'+c+'"/>';
  else s+='<text x="31" y="22" font-size="18">'+ITEMS[E('Hat')].i+'</text>'}
 if(E('Shield'))s+='<text x="1" y="68" font-size="18">'+ITEMS[E('Shield')].i+'</text>';
 {const wid=p===P?publicGear().w:p.weapon;if(wid&&ITEMS[wid])s+='<text x="62" y="68" font-size="18">'+ITEMS[wid].i+'</text>'}
 return s+'</svg>'}
function eqOffN(){return [P.weapon].concat(Object.values(P.eq||{})).filter(x=>x&&!eqOk(x)).length}
function charPanel(){const n=Object.keys(P.eq||{}).length+(P.weapon?1:0);
 return '<div class="panel win"><div class="title">CHARACTER</div><div class="pad" style="text-align:center">'+avatarSvg(P,150)+'<div style="margin-top:4px"><b>'+P.name+'</b> <span class="mute">Lv '+P.lvl+' '+jobName()+'</span></div><div class="mute">'+(n?n+' item'+(n>1?'s':'')+' equipped'+(eqOffN()?' ('+eqOffN()+' greyed out)':''):'Nothing equipped')+'</div></div></div>'}

/* ===== Inventory (MapleStory layout: Equip / Use / Etc / Cash) + Scrolling menu ===== */
(function(){const s=document.createElement('style');s.textContent='.invm{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:auto;gap:4px;max-width:300px;margin:8px auto 0;padding:4px;background:#e7e3d1;border:2px solid #a9b3c4;border-radius:6px}.invm .slot{aspect-ratio:1;width:100%;height:auto;min-height:0}.invm .qt{right:auto;left:4px;bottom:2px}.mesob{display:flex;align-items:center;gap:8px;margin:8px auto 0;max-width:300px;padding:5px 10px;background:#fff;border:2px solid #a9b3c4;border-radius:6px}.mesob b{flex:1;text-align:right;font-size:15px}.cmp{display:grid;grid-template-columns:1.1fr .8fr 1fr 1fr;gap:3px 6px;font-size:13px;align-items:center}.cmp .h{font-weight:700;font-size:12px}.cmp .ok{color:#1c7a2e;font-weight:700}.cmp .no{color:#b3261e;font-weight:700}';document.head.appendChild(s)})();
for(const k in DESC)if(/^sc_/.test(k))DESC[k]=DESC[k].replace('Open Inventory, Enchanting to use it.','Use it from the Scrolling button above your inventory.');
let cpop=null;
const INVTABS=[['equip','Equip'],['use','Use'],['etc','Etc'],['cash','Cash']];
function invTab(t){ptab=t;pop=null;cpop=null;sel=null;render()}
function invList(t){const L=[];for(const k in P.inv){const it=ITEMS[k],q=P.inv[k];if(!it||!(q>0))continue;const c=(it.scr||it.heal||it.mpheal||it.hpp||it.mpp||it.ammo)?'use':(it.w||it.s)?'equip':'etc';if(c===t)L.push([k,q])}return L}
function cashList(){return CASH.filter(c=>P.cinv&&P.cinv[c[0]]>0).map(c=>[c[0],P.cinv[c[0]],c])}
function cashPick(id){cpop=cpop===id?null:id;render()}
function cashOpenTab(){cpop=null;tab='cash';render()}
function cashPopHtml(){if(!cpop)return '';const c=CASH.find(x=>x[0]===cpop);if(!c||!(P.cinv[cpop]>0)){cpop=null;return ''}
 const auto=cpop==='charm'||cpop==='wheel',rock=!!ROCKS[cpop];
 const btn=auto?'<span class="mute">Used automatically when needed.</span>':rock?'<button class="main" onclick="cashOpenTab()">Open in Cash tab</button>':'<button class="main" onclick="cashUse(\''+cpop+'\')">Use</button>';
 return '<div class="mcard"><div class="mh"><span class="mi">'+c[1]+'</span><div><b>'+c[2]+'</b><div class="mute">'+c[4]+'</div></div></div><div class="mr"><span>Type</span><b>Cash</b></div><div class="mr"><span>Owned</span><b>'+P.cinv[cpop]+'</b></div><div class="ex" style="margin-top:10px">'+btn+'<button onclick="cpop=null;render()">Close</button></div></div>'}
{const _ph=popHtml;popHtml=function(){if(pop&&ITEMS[pop.id]&&ITEMS[pop.id].scr){const it=ITEMS[pop.id],n=P.inv[pop.id]||0,rows=[['Type','Use · Scroll']].concat(itemRows(pop.id),[['Owned',n]]);
 return '<div class="mcard"><div class="mh"><span class="mi">'+it.i+'</span><div><b>'+it.n+'</b><div class="mute">'+(DESC[pop.id]||'')+'</div></div></div>'+rows.map(r=>'<div class="mr"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('')+'<div class="ex" style="margin-top:10px"><button class="main" onclick="scrollWith(\''+it.scr+'\')">Use on equipment</button><button data-pa="close">Close</button></div></div>'}return _ph()}}
function scrollToggle(){if(ench)enchClose();else enchOpen()}
function scrollWith(sk){pop=null;if(P.dead)return;P.inst=P.inst||{};ench={st:1,pre:sk};render()}
function packHtml(){cashInit();if(!INVTABS.some(t=>t[0]===ptab))ptab='use';
 const sc=Object.keys(P.inv).filter(k=>ITEMS[k]&&ITEMS[k].scr&&P.inv[k]>0).reduce((a,k)=>a+P.inv[k],0);
 let h='<div class="ex" style="margin:0 0 8px"><button class="main'+(ench?' on':'')+'" style="width:100%" onclick="scrollToggle()">📜 Scrolling'+(sc?' ('+sc+')':'')+' '+(ench?'▾':'▸')+'</button></div>';
 if(ench)h+=enchHtml();
 const cash=ptab==='cash',list=cash?cashList():invList(ptab);let g='';
 for(let i=0,N=Math.max(invCap(ptab),Math.ceil(list.length/4)*4);i<N;i++){const e=list[i];
  if(!e){g+='<div class="slot empty"></div>';continue}
  if(cash){const c=e[2];g+='<button class="slot'+(cpop===e[0]?' sel':'')+'" title="'+c[2]+'" onclick="cashPick(\''+e[0]+'\')">'+c[1]+(e[1]>1?'<b class="qt">'+e[1]+'</b>':'')+'</button>'}
  else g+='<button class="slot'+(pop&&pop.id===e[0]&&!pop.eq?' sel':'')+'" data-i="'+e[0]+'" data-e="0" title="'+ITEMS[e[0]].n+'">'+ITEMS[e[0]].i+(e[1]>1?'<b class="qt">'+e[1]+'</b>':'')+'</button>'}
 const tip=cash?(cpop?cashPopHtml():''):(pop&&!pop.eq?popHtml():'');
 return h+'<div class="panel win"><div class="title">ITEM INVENTORY</div><div class="pad"><div class="tabs">'+INVTABS.map(t=>'<button class="'+(ptab===t[0]?'on':'')+'" onclick="invTab(\''+t[0]+'\')">'+t[1]+'</button>').join('')+'</div>'+tip+'<div class="invm">'+g+'</div><div class="mute" style="text-align:center;margin-top:4px">Slots used: '+list.length+' / '+invCap(ptab)+'</div><div class="mesob"><span>🪙</span><b>'+P.mesos.toLocaleString()+'</b><span class="mute">mesos</span></div></div></div>'}

/* ---- Scrolling flow: equipment -> scroll -> compare both -> confirm / cancel ---- */
enchOpen=function(){if(P.dead)return;P.inst=P.inst||{};ench={st:1};render()};
function enchCancel(){ench={st:1};render()}
enchPick=function(i){const t=enchTargets()[i];if(!t)return;const pre=ench&&ench.pre;
 if(pre&&P.inv['sc_'+pre]>0&&canUse(t.id,pre))ench={st:3,tgt:t,sk:pre,white:false,pre};else ench={st:2,tgt:t,pre};render()};
function enchAgain(){const e=ench||{},t=e.next,sk=e.lsk;if(t&&sk&&SCR[sk]&&(P.inv['sc_'+sk]|0)>0&&canUse(t.id,sk)){ench={st:3,tgt:t,sk,white:!!e.lw,qty:e.lq||1};if(enchMax()<1)ench={st:2,tgt:t}}else ench=t?{st:2,tgt:t}:{st:1};render()}
enchGo=function(){const e=ench,d=SCR[e.sk];if(!(P.inv['sc_'+e.sk]>0)||enc)return;const useW=e.white&&P.inv.sc_white>0&&d.kind!=='clean';
 const t0=e.tgt,bef=eff(t0.id),slB=slotsOf(t0.id);
 const id=mkInst(t0),ins=P.inst[id];P.inv['sc_'+e.sk]--;if(P.inv['sc_'+e.sk]<=0)delete P.inv['sc_'+e.sk];
 const ok=Math.random()*100<d.r;let msg;
 if(d.kind==='clean'){if(ok){ins.sl++;ins.lost--;msg='The Clean Slate worked. One upgrade slot was restored.'}else msg='The Clean Slate scroll fizzled. Nothing changed.'}
 else if(ok){ins.sl--;
  if(d.kind==='std'){for(const k in d.st)ins.st[k]=(ins.st[k]||0)+d.st[k];ins.ok++;msg='Success! '+Object.keys(d.st).map(k=>LBL[k]+' +'+d.st[k]).join(', ')+'.'}
  else{const cur=eff(id);for(const k in cur){if(cur[k]<=0)continue;let dl=d.kind==='chaos'?R(-5,5):R(1,5);if(cur[k]+dl<0)dl=-cur[k];if(dl)ins.st[k]=(ins.st[k]||0)+dl}ins.ok++;msg='The chaos settles.'}}
 else{if(useW&&P.inv.sc_white>0){P.inv.sc_white--;if(P.inv.sc_white<=0)delete P.inv.sc_white;msg='The scroll failed, but the White Scroll protected your upgrade slot.'}else{ins.sl--;ins.lost++;msg='The scroll failed. The upgrade slot is used up.'}}
 instBuild(id);const aft=eff(id),slA=slotsOf(id),it=ITEMS[id];
 log('Scrolling '+it.n+': '+(ok?'passed. ':'failed. ')+msg,ok?'good':'bad','items');save();
 const ks=Array.from(new Set(Object.keys(bef).concat(Object.keys(aft)))).filter(k=>(bef[k]||0)!==(aft[k]||0));
 const rows=ks.map(k=>'<div class="row"><span>'+LBL[k]+'</span><b>'+(bef[k]||0)+' → '+(aft[k]||0)+'</b></div>').concat(['<div class="row"><span>Upgrade slots</span><b>'+slB+' → '+slA+'</b></div>']).join('');
 const nt={id,w:t0.w,sl:t0.sl},can=slotsOf(id)>0||(P.inst[id]&&P.inst[id].lost>0);
 ench={st:4,next:can?nt:null,res:'<div style="font-size:16px">'+(ok?'✨ <b style="color:#1c7a2e">PASS</b>':'💥 <b style="color:#b3261e">FAIL</b>')+'</div><div style="margin:6px 0">'+it.i+' <b>'+it.n+'</b></div><div class="mute" style="margin-bottom:6px">'+msg+'</div>'+rows};render()};
enchHtml=function(){const e=ench,hd='<div class="title" style="display:flex;justify-content:space-between;align-items:center"><span>SCROLLING</span><button style="min-height:24px;padding:0 10px" onclick="enchClose()">✕</button></div>',W=b=>'<div class="panel win">'+hd+'<div class="pad">'+b+'</div></div>';
 const bk=n=>'<button onclick="enchBack('+n+')">Back</button>';
 if(e.st===4)return W('<div class="mcard">'+e.res+'</div><div class="ex">'+(e.next?'<button class="main" onclick="enchAgain()">Scroll this item again</button>':'')+'<button onclick="enchBack(1)">Pick other equipment</button></div>');
 if(e.st===1){const L=enchTargets(),pre=e.pre&&ITEMS['sc_'+e.pre];
  return W('<div class="mute">Choose equipment to scroll'+(pre?' with <b>'+pre.n+'</b>':'')+'. Only items with upgrade slots left are shown.</div><div class="escr">'+(L.length?L.map((t,i)=>{const it=ITEMS[t.id],n=slotsOf(t.id);const bad=e.pre&&!canUse(t.id,e.pre);return '<button class="row" style="width:100%;align-items:center;margin:3px 0'+(bad?';opacity:.45':'')+'"'+(bad?' disabled':'')+' onclick="enchPick('+i+')"><span>'+it.i+' <b>'+it.n+'</b></span><span class="mute">'+(bad?'Not compatible':(t.w==='eq'?'Equipped':'Inventory')+' · '+(n>0?n+' slot'+(n>1?'s':''):'Clean Slate only'))+'</span></button>'}).join(''):'<div class="mute">You have no equipment with upgrade slots left.</div>')+'</div>')}
 const t=e.tgt,it=ITEMS[t.id];if(!it){ench={st:1};return enchHtml()}
 if(e.st===2){const ks=Object.keys(P.inv).filter(k=>ITEMS[k]&&ITEMS[k].scr&&P.inv[k]>0&&canUse(t.id,ITEMS[k].scr));
  return W('<div class="mute">Choose a scroll for '+it.i+' <b>'+it.n+'</b> ('+slotsOf(t.id)+' slot'+(slotsOf(t.id)===1?'':'s')+' left).</div><div class="escr">'+(ks.length?ks.map(k=>{const d=SCR[ITEMS[k].scr];return '<button class="row" style="width:100%;align-items:center;margin:3px 0" onclick="enchScr(\''+ITEMS[k].scr+'\')"><span>📜 <b>'+ITEMS[k].n+'</b></span><span class="mute">'+d.r+'% · x'+P.inv[k]+'</span></button>'}).join(''):'<div class="mute">You have no compatible scrolls. Scrolls drop from monsters, and White Scrolls and Clean Slates are in the Cash Shop.</div>')+'</div><div class="ex">'+bk(1)+'</div>')}
 const d=SCR[e.sk],sc=ITEMS['sc_'+e.sk],id=t.id,cur=eff(id),sl=slotsOf(id),wh=P.inv.sc_white|0,useW=e.white&&wh>0&&d.kind!=='clean',left=P.inv['sc_'+e.sk]|0;
 let rows='';
 if(d.kind==='std')rows=Object.keys(d.st).map(k=>'<span>'+LBL[k]+'</span><span>'+(cur[k]||0)+'</span><span class="ok">'+((cur[k]||0)+d.st[k])+' (+'+d.st[k]+')</span><span class="no">'+(cur[k]||0)+'</span>').join('');
 else if(d.kind!=='clean')rows=Object.keys(cur).filter(k=>cur[k]>0).map(k=>{const lo=d.kind==='chaos'?Math.max(0,cur[k]-5):cur[k]+1,hi=cur[k]+5;return '<span>'+LBL[k]+'</span><span>'+cur[k]+'</span><span class="ok">'+lo+'–'+hi+'</span><span class="no">'+cur[k]+'</span>'}).join('');
 const slOk=d.kind==='clean'?sl+1:sl-1,slNo=d.kind==='clean'?sl:(useW?sl:sl-1);
 rows+='<span>Upgrade slots</span><span>'+sl+'</span><span class="ok">'+slOk+'</span><span class="no">'+slNo+'</span>';
 rows+='<span>'+sc.n.replace(/ \d+%$/,'')+'</span><span>'+left+'</span><span>'+(left-1)+'</span><span>'+(left-1)+'</span>';
 const live=Object.keys(d.st).some(k=>!LIVE.includes(k)),card=(i,n,s)=>'<div class="mcard" style="flex:1;min-width:0;margin:0;text-align:center"><div style="font-size:30px">'+i+'</div><b style="font-size:12px;word-break:break-word">'+n+'</b>'+(s?'<div class="mute">'+s+'</div>':'')+'</div>';
 return W('<div style="display:flex;gap:8px;align-items:stretch">'+card(it.i,it.n,sl+' slot'+(sl===1?'':'s')+' left')+'<div style="align-self:center;font-size:20px">+</div>'+card('📜',sc.n,'x'+left)+'</div>'
  +'<div class="row" style="margin-top:10px"><span>🟢 Pass chance</span><b>'+d.r+'%</b></div><div class="row"><span>🔴 Fail chance</span><b>'+(100-d.r)+'%</b></div><div class="row"><span>Item destroyed</span><b>0%</b></div>'
  +'<div class="cmp" style="margin-top:10px"><span class="h"></span><span class="h">Now</span><span class="h">✨ Pass</span><span class="h">💥 Fail</span>'+rows+'</div>'
  +'<div class="mute" style="margin-top:6px">'+(d.kind==='clean'?'Pass restores one slot. Either way the scroll is used up.':'Either way the scroll is used up. On a fail the slot is '+(useW?'kept thanks to the White Scroll.':'lost.'))+'</div>'
  +(live?'<div class="mute" style="margin-top:6px">Jump, Speed, MaxHP and M.DEF are recorded on the item but do not change combat yet.</div>':'')
  +(d.kind!=='clean'&&wh?'<div class="ex"><button class="'+(e.white?'on':'')+'" onclick="enchWhite()">⚪ White Scroll ('+wh+'): '+(e.white?'ON':'OFF')+'</button></div>':'')
  +(enc?'<div class="mute" style="margin-top:6px;color:#b3261e">You can\'t scroll while fighting a monster.</div>':'')
  +'<div class="ex">'+bk(2)+'<button onclick="enchCancel()">Cancel</button><button class="main" '+(enc?'disabled':'')+' onclick="enchGo()">Confirm</button></div>')};
{const _lg=leaveGame;leaveGame=function(n){ench=null;pop=null;cpop=null;_lg(n)}}

/* ===== Gear stats: scrolled MaxHP raises max health, M.DEF is totalled and shown ===== */
const gearHp=()=>[P.weapon].concat(Object.values(P.eq||{})).filter(eqOk).reduce((a,id)=>a+((id&&ITEMS[id]&&ITEMS[id].x&&ITEMS[id].x.hp)||0),0);
const mdefTotal=()=>Object.values(P.eq||{}).filter(eqOk).reduce((a,id)=>a+((id&&ITEMS[id]&&ITEMS[id].x&&ITEMS[id].x.mdef)||0),0);
/* P.gh remembers how much gear MaxHP is already counted in P.maxHp, so equip, unequip, scrolling and old saves all reconcile. */
function syncGearHp(){const g=gearHp(),was=P.gh|0;if(g===was&&P.gh!==undefined)return false;P.gh=g;if(g!==was)medAdj(g-was,0);return true}
{const _r=render;render=function(){if(P&&scr==='game'){try{if(syncGearHp())save()}catch(e){}}return _r.apply(this,arguments)}}
LIVE.push('hp','mdef','jump','speed','matk');/* nothing is left that needs the "does not change combat" warning */

/* ===== Upgrade slots per item, MapleStory-style: every equip has a fixed total, scrolls spend slots, only Clean Slates give failed ones back ===== */
const TUC={};
['sword','hand_axe','wooden_club','long_sword','fruit_knife','razor'].forEach(k=>TUC[k]=7);/* weapons 7 */
['brown_skullcap','green_skullcap','red_headband','black_headband','green_headband','yellow_headband','blue_headband'].forEach(k=>TUC[k]=7);
for(let i=0;i<4;i++){TUC['top_c'+i]=7;TUC['bottom_c'+i]=7;TUC['shoes_c'+i]=5}/* tops/bottoms 7, shoes 5 (Blue Jean Shorts 7, Red Rubber Boots 5) */
['top','bottom'].forEach(t=>[1,5,10,15,20].forEach(l=>TUC[t+'_'+l]=7));
['Medal'].forEach(()=>0);/* Medal, Face, Eyes and Ring have no slots and cannot be scrolled */
{const _ir2=itemRows;itemRows=function(id,st){const r=_ir2(id,st),it=ITEMS[id];if(!it||!(it.w||it.s))return r;
 if(it.inst){const d=P.inst&&P.inst[id];if(!d)return r;const x=[['Total upgrade slots',baseSl(d.b)||0],['Scrolls passed',d.ok|0]];if(d.lost>0)x.push(['Failed slots (Clean Slate)',d.lost]);return r.concat(x)}
 const n=baseSl(id)||0;return r.concat([['Upgrade slots left',n>0?n:'0 (cannot be scrolled)']])}}
/* Old saves: keep passed + failed + remaining equal to the item's real total. */
function tucReconcile(){P.inst=P.inst||{};for(const id in P.inst){const d=P.inst[id];if(!d||!ITEMS[d.b])continue;const diff=(baseSl(d.b)||0)-((d.sl|0)+(d.ok|0)+(d.lost|0));if(diff)d.sl=Math.max(0,(d.sl|0)+diff)}P.tucv=1;instReg();save()}
{const _r3=render;render=function(){if(P&&scr==='game'&&P.tucv!==1){try{tucReconcile()}catch(e){}}return _r3.apply(this,arguments)}}

/* ===== Playtest grant: 100 of every scroll, every inventory tab at MapleStory's max of 96 slots ===== */
const PLAYTEST_GRANT=true;/* set to false to stop new characters getting this on first load */
const INV_MAX=96;
const invCap=t=>Math.min(INV_MAX,(P.cap&&P.cap[t])||24);
function playtestGrant(){for(const k in SCR){const id='sc_'+k;if(ITEMS[id])P.inv[id]=(P.inv[id]||0)+100}
 P.cap={equip:INV_MAX,use:INV_MAX,etc:INV_MAX,cash:INV_MAX};P.ptg=1;log('Playtest grant: +100 of every scroll, and all inventory tabs now have '+INV_MAX+' slots.','good','items');save()}
function playtestTopUp(){for(const k in SCR){const id='sc_'+k;if(ITEMS[id]&&!(P.inv[id]>=100))P.inv[id]=100}P.cap={equip:INV_MAX,use:INV_MAX,etc:INV_MAX,cash:INV_MAX};save();render()}
{const _r4=render;render=function(){if(P&&scr==='game'&&!P.ptg&&PLAYTEST_GRANT){try{playtestGrant()}catch(e){}}return _r4.apply(this,arguments)}}
{const _ph2=packHtml;packHtml=function(){return _ph2()+'<div class="ex" style="margin-top:8px"><button onclick="playtestTopUp()">🧪 Playtest: top up every scroll to 100</button></div>'}}

/* ===== Use several scrolls at once: pick 1..max, where max = upgrade slots left (or failed slots for a Clean Slate) and scrolls owned ===== */
function enchMax(){const e=ench,id=e.tgt.id,d=SCR[e.sk],cap=d.kind==='clean'?(((P.inst||{})[id]||{}).lost|0):slotsOf(id);return Math.max(0,Math.min(cap,P.inv['sc_'+e.sk]|0))}
function enchQty(dl){const m=enchMax();ench.qty=Math.max(1,Math.min(m,(ench.qty||1)+dl));render()}
function enchQtyMax(){ench.qty=Math.max(1,enchMax());render()}
enchScr=function(sk){ench={st:3,tgt:ench.tgt,sk,white:false,qty:1};render()};
enchGo=function(){const e=ench,d=SCR[e.sk];if(enc)return;const owned=P.inv['sc_'+e.sk]|0,maxN=enchMax();if(owned<1||maxN<1)return;
 const N=Math.max(1,Math.min(e.qty||1,maxN)),t0=e.tgt,bef=eff(t0.id),slB=slotsOf(t0.id),id=mkInst(t0);let pass=0,fail=0,wUsed=0,done=0;
 for(let i=0;i<N;i++){const ins=P.inst[id];if(d.kind==='clean'?ins.lost<1:ins.sl<1)break;
  P.inv['sc_'+e.sk]--;if(P.inv['sc_'+e.sk]<=0)delete P.inv['sc_'+e.sk];done++;
  const ok=Math.random()*100<d.r;
  if(d.kind==='clean'){if(ok){ins.sl++;ins.lost--;pass++}else fail++}
  else if(ok){ins.sl--;pass++;
   if(d.kind==='std'){for(const k in d.st)ins.st[k]=(ins.st[k]||0)+d.st[k]}
   else{instBuild(id);const cur=eff(id);for(const k in cur){if(cur[k]<=0)continue;let dl=d.kind==='chaos'?R(-5,5):R(1,5);if(cur[k]+dl<0)dl=-cur[k];if(dl)ins.st[k]=(ins.st[k]||0)+dl}}
   ins.ok++}
  else{fail++;if(e.white&&P.inv.sc_white>0){P.inv.sc_white--;if(P.inv.sc_white<=0)delete P.inv.sc_white;wUsed++}else{ins.sl--;ins.lost++}}
  instBuild(id)}
 instBuild(id);const aft=eff(id),slA=slotsOf(id),it=ITEMS[id];
 const head=done+' scroll'+(done>1?'s':'')+' used: '+pass+' passed, '+fail+' failed'+(wUsed?' ('+wUsed+' slot'+(wUsed>1?'s':'')+' saved by White Scroll)':'')+'.';
 log('Scrolling '+it.n+': '+head,pass>=fail?'good':'bad','items');save();
 const ks=Array.from(new Set(Object.keys(bef).concat(Object.keys(aft)))).filter(k=>(bef[k]||0)!==(aft[k]||0));
 const rows=ks.map(k=>'<div class="row"><span>'+LBL[k]+'</span><b>'+(bef[k]||0)+' → '+(aft[k]||0)+'</b></div>').concat(['<div class="row"><span>Upgrade slots</span><b>'+slB+' → '+slA+'</b></div>']).join('');
 const nt={id,w:t0.w,sl:t0.sl},can=slotsOf(id)>0||(P.inst[id]&&P.inst[id].lost>0);
 const big=done===1?(pass?'✨ <b style="color:#1c7a2e">PASS</b>':'💥 <b style="color:#b3261e">FAIL</b>'):'✨ <b style="color:#1c7a2e">'+pass+' PASS</b> · 💥 <b style="color:#b3261e">'+fail+' FAIL</b>';
 ench={st:4,next:can?nt:null,lsk:e.sk,lq:N,lw:e.white,res:'<div style="font-size:16px">'+big+'</div><div style="margin:6px 0">'+it.i+' <b>'+it.n+'</b></div><div class="mute" style="margin-bottom:6px">'+head+'</div>'+rows};render()};
function enchStep3(){const e=ench,t=e.tgt,id=t.id,it=ITEMS[id],d=SCR[e.sk],sc=ITEMS['sc_'+e.sk],cur=eff(id),sl=slotsOf(id),wh=P.inv.sc_white|0,left=P.inv['sc_'+e.sk]|0,maxN=enchMax();
 const N=Math.max(1,Math.min(e.qty||1,Math.max(1,maxN)));e.qty=N;const useW=e.white&&wh>0&&d.kind!=='clean',many=N>1;
 const hd='<div class="title" style="display:flex;justify-content:space-between;align-items:center"><span>SCROLLING</span><button style="min-height:24px;padding:0 10px" onclick="enchClose()">✕</button></div>';
 let rows='';
 if(d.kind==='std')rows=Object.keys(d.st).map(k=>'<span>'+LBL[k]+'</span><span>'+(cur[k]||0)+'</span><span class="ok">'+((cur[k]||0)+d.st[k]*N)+' (+'+d.st[k]*N+')</span><span class="no">'+(cur[k]||0)+'</span>').join('');
 else if(d.kind!=='clean')rows=Object.keys(cur).filter(k=>cur[k]>0).map(k=>{const lo=d.kind==='chaos'?Math.max(0,cur[k]-5*N):cur[k]+N,hi=cur[k]+5*N;return '<span>'+LBL[k]+'</span><span>'+cur[k]+'</span><span class="ok">'+lo+'–'+hi+'</span><span class="no">'+cur[k]+'</span>'}).join('');
 const slOk=d.kind==='clean'?sl+N:sl-N,slNo=d.kind==='clean'?sl:sl-(N-(useW?Math.min(N,wh):0));
 rows+='<span>Upgrade slots</span><span>'+sl+'</span><span class="ok">'+slOk+'</span><span class="no">'+slNo+'</span>';
 rows+='<span>'+sc.n.replace(/ \d+%$/,'')+'</span><span>'+left+'</span><span>'+(left-N)+'</span><span>'+(left-N)+'</span>';
 if(useW)rows+='<span>White Scroll</span><span>'+wh+'</span><span>'+wh+'</span><span>'+(wh-Math.min(N,wh))+'</span>';
 const card=(i,n,s)=>'<div class="mcard" style="flex:1;min-width:0;margin:0;text-align:center"><div style="font-size:30px">'+i+'</div><b style="font-size:12px;word-break:break-word">'+n+'</b>'+(s?'<div class="mute">'+s+'</div>':'')+'</div>';
 const cap=d.kind==='clean'?'failed slots to restore':'upgrade slots left';
 const stepper='<div class="row" style="margin-top:10px;align-items:center"><span>Scrolls to use <span class="mute">(max '+maxN+', your '+cap+')</span></span><span style="display:flex;gap:6px;align-items:center"><button style="min-height:34px;padding:2px 12px" onclick="enchQty(-1)" '+(N<=1?'disabled':'')+'>−</button><b style="min-width:28px;text-align:center;font-size:16px">'+N+'</b><button style="min-height:34px;padding:2px 12px" onclick="enchQty(1)" '+(N>=maxN?'disabled':'')+'>+</button><button style="min-height:34px;padding:2px 10px" onclick="enchQtyMax()" '+(N>=maxN?'disabled':'')+'>Max</button></span></div>';
 return '<div class="panel win">'+hd+'<div class="pad"><div style="display:flex;gap:8px;align-items:stretch">'+card(it.i,it.n,sl+' slot'+(sl===1?'':'s')+' left')+'<div style="align-self:center;font-size:20px">+</div>'+card('📜',sc.n,'x'+left)+'</div>'+stepper
  +'<div class="row" style="margin-top:10px"><span>🟢 Pass chance'+(many?' (each)':'')+'</span><b>'+d.r+'%</b></div><div class="row"><span>🔴 Fail chance'+(many?' (each)':'')+'</span><b>'+(100-d.r)+'%</b></div>'+(many?'<div class="row"><span>Expected passes</span><b>~'+(N*d.r/100).toFixed(1)+' of '+N+'</b></div>':'')+'<div class="row"><span>Item destroyed</span><b>0%</b></div>'
  +'<div class="cmp" style="margin-top:10px"><span class="h"></span><span class="h">Now</span><span class="h">✨ '+(many?'All pass':'Pass')+'</span><span class="h">💥 '+(many?'All fail':'Fail')+'</span>'+rows+'</div>'
  +'<div class="mute" style="margin-top:6px">'+(many?'Each scroll is rolled one at a time, so the real result usually lands between the two. ':'')+(d.kind==='clean'?'Pass restores one slot. Either way the scroll is used up.':'Every scroll is used up. A failed one costs a slot'+(useW?', unless a White Scroll protects it.':'.'))+'</div>'
  +(d.kind!=='clean'&&wh?'<div class="ex"><button class="'+(e.white?'on':'')+'" onclick="enchWhite()">⚪ White Scroll ('+wh+'): '+(e.white?'ON, one per failure':'OFF')+'</button></div>':'')
  +(enc?'<div class="mute" style="margin-top:6px;color:#b3261e">You can\'t scroll while fighting a monster.</div>':'')
  +'<div class="ex"><button onclick="enchBack(2)">Back</button><button onclick="enchCancel()">Cancel</button><button class="main" '+(enc||maxN<1?'disabled':'')+' onclick="enchGo()">Confirm'+(many?' ('+N+')':'')+'</button></div></div></div>'}
{const _eh=enchHtml;enchHtml=function(){if(ench&&ench.st===3&&ench.tgt&&ITEMS[ench.tgt.id])return enchStep3();return _eh()}}


/* ===== Swordsman (Warrior, 1st job) skills, GMS v62. Only Swordsmen can see or learn them. =====
   Job advancement: Dances with Balrog in Perion, level 10 and 35 STR. 3 SP per level after advancing (1 SP on advancing). */
function isWar(){return !!P&&P.job==='swordsman'}
const sl=k=>((P&&P.sk&&P.sk[k])|0);
const SWORDS=['sword','long_sword','broad_sword','knights_blade'];
/* Power Strike and Slash Blast work with every warrior weapon (swords, axes, blunt weapons, spears, polearms), as in v62. */
const WAR_TY=['oh_sword','th_sword','oh_axe','th_axe','oh_bw','th_bw','spear','polearm'];
const swordOn=()=>{if(!P.weapon||!eqOk(P.weapon))return false;const id=baseOf(P.weapon),it=ITEMS[id];return SWORDS.includes(id)||WAR_TY.includes(tyOf(id))};
const ARR={
 psMp:[4,4,4,4,5,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12],
 sbHp:[8,8,8,8,9,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16],
 sbMp:[6,6,6,6,7,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14],
 ibMp:[8,8,8,8,9,9,9,10,10,10,11,11,12,12,13,13,14,14,15,15],
 ibDur:[75,85,95,105,120,130,140,155,165,175,190,200,215,225,240,250,265,275,290,300]};
const psPct=n=>160+5*n,sbPct=n=>n>=20?130:69+3*n,hrAmt=n=>n>=16?50:3*n;
const SKW={
 hprec:{ic:'💚',nm:'Improving HP Recovery',max:16,ty:'Passive',pre:[],d:'Recover additional HP every 10 sec. while standing still.',fx:n=>'Recover additional +'+hrAmt(n)+' HP'},
 mhp:{ic:'❤️',nm:'Improving Max HP Increase',max:10,ty:'Passive',pre:[['hprec',5]],d:'This skill boosts up the amount of increase on MaxHP after each Level UP, or AP used on MaxHP.',fx:n=>'If Level UP, +'+4*n+' more; if AP applied, +'+3*n+' more on top on MaxHP'},
 endure:{ic:'🧱',nm:'Endure',max:8,ty:'Passive',pre:[['mhp',3]],d:'Even when hanging on the rope or ladder, you\'ll be able to recover some HP after a certain amount of time.',fx:n=>'In combat, recover HP every '+(34-3*n)+' seconds (no ropes in this game)'},
 ironbody:{ic:'🛡️',nm:'Iron Body',max:20,ty:'Supportive',pre:[['endure',3]],d:'Temporarily increases your weapon defense.',fx:n=>'MP -'+ARR.ibMp[n-1]+'; Weapon def. +'+2*n+' for '+ARR.ibDur[n-1]+' seconds.',cost:n=>ARR.ibMp[n-1]+' MP',du:n=>ARR.ibDur[n-1]+' s'},
 powerstrike:{ic:'💥',nm:'Power Strike',max:20,ty:'Active',pre:[],d:'Use MP to deliver a killer blow to the monsters with a sword.',fx:n=>'MP -'+ARR.psMp[n-1]+'; Sword damage '+psPct(n)+'%',cost:n=>ARR.psMp[n-1]+' MP'},
 slashblast:{ic:'🌀',nm:'Slash Blast',max:20,ty:'Active',pre:[['powerstrike',1]],d:'Use HP and MP to attack every enemy around you with a sword.',fx:n=>'HP -'+ARR.sbHp[n-1]+'; MP -'+ARR.sbMp[n-1]+', damage '+sbPct(n)+'%',cost:n=>'HP '+ARR.sbHp[n-1]+' · MP '+ARR.sbMp[n-1]}};
Object.values(SKW).forEach(d=>d.job='Swordsman');
const SKJ=Object.assign({},SKW);
const skDef=k=>SKD[k]||SKJ[k];
const skPreOk=k=>!(SKJ[k]&&SKJ[k].pre)||SKJ[k].pre.every(p=>sl(p[0])>=p[1]);
const preTxt=k=>SKJ[k].pre.map(p=>SKJ[p[0]].nm+' Lv. '+p[1]).join(', ');
function warList(){const J=isWar()?SKW:isArc()?SKA:isRog()?SKR:isMag()?SKM:(typeof isPir==='function'&&isPir())?SKP:{};return Object.keys(J).map(k=>{const d=J[k],n=sl(k),on=skSel===k,ok=skPreOk(k);
 return '<div class="mrow" data-sks="'+k+'" style="cursor:pointer'+(on?';background:#fff3c4':'')+'"><span class="av">'+d.ic+'</span><div style="flex:1"><div>'+d.nm+' <span class="pill b">Lv '+n+'/'+d.max+'</span></div><div class="mute">'+d.fx(Math.max(1,n))+(ok?'':' · Requires '+preTxt(k))+'</div></div><button class="plus" data-k="'+k+'" '+(P.sp&&n<d.max&&ok?'':'disabled')+'>+</button></div>'+(on?skDetail(k):'')}).join('')}
const _skD0=skDetail;
skDetail=function(k){const d=SKJ[k];if(!d)return _skD0(k);const n=sl(k),l=Math.max(1,n),ok=skPreOk(k);
 const cost=d.cost?'<div class="mute" style="margin-top:6px">Cost: '+d.cost(l)+(n>0&&n<d.max&&d.cost(n+1)!==d.cost(l)?' → '+d.cost(n+1):'')+(d.du?' · Duration: '+d.du(l):'')+' · Cooldown: None</div>':'';
 return '<div class="panel" style="margin:4px 10px 8px"><div class="row"><h2>'+d.ic+' '+d.nm+'</h2><span class="pill b">Lv '+n+'/'+d.max+'</span></div><div class="mute">'+d.ty+' skill · '+d.job+' · Master Level: '+d.max+'</div>'
 +(d.pre.length?'<div class="mute">Pre-requisite: '+preTxt(k)+'</div>':'')+'<div style="margin:8px 0">'+d.d+'</div>'
 +(n>0?'<div><b>Current (Lv '+n+'):</b> '+d.fx(n)+'</div>':'<div class="mute">Not learned yet.</div>')
 +(n<d.max?'<div><b>Next (Lv '+(n+1)+'):</b> '+d.fx(n+1)+'</div>':'<div><b>Max level reached.</b></div>')+cost
 +'<div class="ex" style="margin-top:8px"><button class="main" data-k="'+k+'" '+(P.sp&&n<d.max&&ok?'':'disabled')+'>Upgrade (1 SP)</button><button data-sks="">Close</button></div></div>'};
spendSk=function(k){const d=skDef(k);if(!d||P.sp<1||(P.sk[k]|0)>=d.max)return;if(SKJ[k]&&(!((isWar()&&SKW[k])||(isArc()&&SKA[k])||(isRog()&&SKR[k])||(typeof isPir==='function'&&isPir()&&SKP[k])||(isMag()&&SKM[k]))||!skPreOk(k)))return;P.sk[k]=(P.sk[k]|0)+1;P.sp--;save();render()};
/* quickslots: the three active skills */
SKL.powerstrike=['💥','Power Strike'];SKL.slashblast=['🌀','Slash Blast'];SKL.ironbody=['🛡️','Iron Body'];
function warAttack(name,pct,hpc,mpc){if(!enc||!isWar())return false;const now=Date.now();
 if(now<atkReady()||now-lastMv<moveCd())return false;
 if(!swordOn()){log('You need a warrior weapon (sword, axe, blunt weapon, spear or polearm) to use '+name+'.','bad','combat');render();return false}
 if(enc.gap>wReach()){log('The '+MON[enc.k].n+' is out of reach.','','combat');render();return false}
 if(P.mp<mpc){log('You don\'t have enough MP for that.','bad','combat');render();return false}
 if(P.hp<=hpc){log('You don\'t have enough HP for that.','bad','combat');render();return false}
 P.mp-=mpc;P.hp-=hpc;lastAtk=now;const d=MON[enc.k],ch=Math.min(1,Math.max(.35,.8+(acc()-d.av)/50));
 if(Math.random()>ch)log(name+' misses the '+d.n+'.','','combat');
 else{const r=dmgRange(),x=Math.max(1,Math.floor(R(r[0],r[1])*pct/100));enc.hp-=x;log(name+' hits the '+d.n+' for '+x+'.','hit','combat')}
 if(enc.hp<=0)win();render();return true}
function skPower(){const n=sl('powerstrike');if(n)warAttack('Power Strike',psPct(n),0,ARR.psMp[n-1])}
function skSlash(){const n=sl('slashblast');if(n)warAttack('Slash Blast',sbPct(n),ARR.sbHp[n-1],ARR.sbMp[n-1])}
function skIron(){const n=sl('ironbody');if(!isWar()||!n||P.dead)return;const mp=ARR.ibMp[n-1];
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;P.b.iron=Date.now()+ARR.ibDur[n-1]*1000;P.b.ironv=2*n;log('Iron Body: weapon DEF +'+2*n+' for '+ARR.ibDur[n-1]+' s.','good','combat');save();render()}
{const _qi=qsInfo,_qu=qsUse;
 qsInfo=function(k,now){const t=v=>(v/1000).toFixed(1)+'s';
  if(k==='powerstrike'||k==='slashblast'){const ps=k==='powerstrike',n=sl(k)||1,mp=ps?ARR.psMp[n-1]:ARR.sbMp[n-1],hp=ps?0:ARR.sbHp[n-1],cs=(hp?hp+' HP · ':'')+mp+' MP',
    l=Math.max(atkReady(),lastMv+moveCd())-now,far=!!enc&&enc.gap>wReach();
   return{ic:SKL[k][0],nm:SKL[k][1],sub:!enc?cs:!swordOn()?'Warrior weapon':far?'Too far':l>0?t(l):cs,dis:!enc||!swordOn()||far||l>0||P.mp<mp||P.hp<=hp}}
  if(k==='ironbody'){const n=sl(k)||1,mp=ARR.ibMp[n-1];return{ic:SKL.ironbody[0],nm:'Iron Body',sub:P.b.iron>now?Math.ceil((P.b.iron-now)/1000)+'s':mp+' MP',dis:P.mp<mp}}
  return _qi(k,now)};
 qsUse=function(k){if(k==='powerstrike')skPower();else if(k==='slashblast')skSlash();else if(k==='ironbody')skIron();else _qu(k)}}
/* Improving HP Recovery: +HP every 10 s while standing still (idle, not in a fight) */
let lastHpRec=Date.now();
setInterval(()=>{if(!P||!isWar()||P.dead)return;const now=Date.now();if(now-lastHpRec<10000)return;lastHpRec=now;
 const n=sl('hprec');if(!n||enc||P.hp>=P.maxHp)return;P.hp=Math.min(P.maxHp,P.hp+hrAmt(n));if(!inShop)render()},1000);
/* Job advancement: Dances with Balrog, Perion */
{const _dl=dlg;dlg=function(){const d=_dl();if(talk&&talk.npc==='balrog'&&(!talk.page||talk.page==='main')){
  if(isWar())d.t+='<br><br><span class="mute">You are a Swordsman. Your skills are in the Skills tab, under 1st Job.</span>';
  else if(!P.job&&P.lvl>=10&&P.str>=35)d.ch.splice(d.ch.length-1,0,['I want to become a Warrior','job:swordsman']);
  else if(!P.job)d.t+='<br><br><span class="mute">To become a Warrior you need level 10 and 35 STR. You are level '+P.lvl+' with '+P.str+' STR.</span>'}
  return d}}
{const _dd=dlgDo;dlgDo=function(k){if(k==='job:swordsman'){if(P.job||P.lvl<10||P.str<35)return;P.job='swordsman';P.sp+=1;
  log('Dances with Balrog: You are now a Swordsman. Your skills are under 1st Job in the Skills tab.','good','quest');if(talk)talk.page='main';save();return render()}return _dd(k)}}


/* ===== Archer (Bowman, 1st job), GMS v62. Requirements: level 10 and 25 DEX, advance with Athena Pierce in Henesys. =====
   Only Archers can see or learn these skills, and only Archers can use bows and crossbows. */
function isArc(){return !!P&&P.job==='archer'}
function jobName(){return P.job==='swordsman'?'Swordsman':P.job==='archer'?'Archer':P.job==='rogue'?'Rogue':P.job==='magician'?'Magician':P.job==='pirate'?'Pirate':'Beginner'}
ITEMS.battle_bow={n:'Battle Bow',i:'🏹',w:1,rng:'bow',watk:17,spd:720,mult:3.4,req:10,buy:1000};
ITEMS.long_bow={n:'Long Bow',i:'🏹',w:1,rng:'bow',watk:30,spd:720,mult:3.4,req:15,buy:5000};
ITEMS.crossbow={n:'Crossbow',i:'🎯',w:1,rng:'xbow',watk:24,spd:780,mult:3.6,req:10,buy:1500};
ITEMS.steel_crossbow={n:'Steel Crossbow',i:'🎯',w:1,rng:'xbow',watk:38,spd:780,mult:3.6,req:15,buy:8000};
ITEMS.arrow_bow={n:'Arrow for Bow',i:'➴',ammo:'bow',buy:1};
ITEMS.arrow_xbow={n:'Arrow for Crossbow',i:'➶',ammo:'xbow',buy:1};
DESC.battle_bow='A sturdy bow for new Archers. Uses Arrows for Bow.';DESC.long_bow='A longer bow with more punch. Uses Arrows for Bow.';
DESC.crossbow='A crossbow with a steady aim. Uses Arrows for Crossbow.';DESC.steel_crossbow='A steel-limbed crossbow. Uses Arrows for Crossbow.';
DESC.arrow_bow='Ammunition for bows. Each shot uses one.';DESC.arrow_xbow='Ammunition for crossbows. Each shot uses one.';
['battle_bow','long_bow','crossbow','steel_crossbow'].forEach(k=>TUC[k]=7);
MAPS.henesys.shopList=MAPS.henesys.shopList.concat(['battle_bow','long_bow','crossbow','steel_crossbow','arrow_bow','arrow_xbow']);
Object.keys(SCR).forEach(k=>{const d=SCR[k];if(d.tg==='bow'||d.tg==='crossbow'||d.tg==='dagger'||d.tg==='claw'||d.tg==='wand'||d.tg==='staff')SW.push([k,d.kind==='std'?(d.r>=60?8:2):.3])});
/* ammo: the best ammo of the right kind in your inventory (stars for claws, arrows for bows/crossbows, bullets for guns) */
const AMMO_DEF={xbow:'arrow_xbow',claw:'star_subi',gun:'bullet',bow:'arrow_bow'};
const ammoKind=()=>{const t=W().rng;return t==='xbow'?'xbow':t==='claw'?'claw':t==='gun'?'gun':'bow'};
const ammoId=()=>{const want=ammoKind();let best=null,bs=-1;if(P)for(const k in P.inv){const it=ITEMS[k];if(it&&it.ammo===want&&P.inv[k]>0&&(!it.req||P.lvl>=it.req)){const s=it.sa||0;if(s>bs){bs=s;best=k}}}return best||AMMO_DEF[want]};
const ammoN=()=>(P.inv[ammoId()]|0);
function useAmmo(n){const a=ammoId();P.inv[a]=(P.inv[a]|0)-n;if(P.inv[a]<=0)delete P.inv[a]}
/* Reach in columns on the 7-wide board (MAXGAP=5 is the far edge):
   bare hands 0 (only the column next to you), melee weapons 1, bows/crossbows 3 (+1 with The Eye of Amazon Lv 8),
   claws 3 (+1 at Keen Eyes Lv 4, +2 at Lv 8 = the whole board). Keen Eyes adds more range than Eye of Amazon (200 vs 120 px in v62),
   so a thief with throwing stars and Keen Eyes outranges a bowman. */
function wReach(){const w=W();if(w===FIST||!P.weapon||!eqOk(P.weapon))return 0;
 if(w.rng==='claw')return Math.min(MAXGAP,3+(isRog()?Math.floor(sl('keen')/4):0));
 if(w.rng==='gun')return 3;
 if(w.rng)return Math.min(MAXGAP,3+(isArc()&&sl('eye')>=8?1:0));
 return w.reach!=null?w.reach:(['spear','polearm'].includes(typeof wTy==='function'?wTy():null)?1:0)}/* v3.2: one-handed and two-handed melee reach like a punch (next to you); spears and polearms one cell further */
function accBonus(){return (isArc()?sl('bless')+((P.b&&P.b.focus>Date.now())?(P.b.focusv|0):0):0)+(isRog()?sl('nimble'):0)}
function avBonus(){return (isArc()&&P.b&&P.b.focus>Date.now()?(P.b.focusv|0):0)+(isRog()?sl('nimble'):0)}
function critRoll(x){if(!isArc()||!W().rng)return x;const n=sl('crit');if(!n)return x;const rate=n<=10?10+2*n:20+n;
 if(Math.random()*100<rate){log('Critical Shot!','good','combat');return Math.floor(x*(100+5*n)/100)}return x}
const ARC={
 abMp:[7,8,8,8,9,9,9,10,10,10,11,11,11,12,12,12,13,13,13,14],
 abDm:[190,193,196,200,203,206,210,213,216,220,223,226,230,233,236,240,243,248,253,260],
 dsMp:[10,10,10,10,11,11,11,12,12,12,13,13,13,14,14,14,15,15,15,16],
 dsDm:[92,94,96,98,100,102,104,106,108,110,112,114,116,118,120,122,124,126,128,130],
 fcMp:[8,8,8,8,8,10,10,10,10,10,13,13,13,13,13,16,16,16,16,16],
 fcDu:[70,80,90,100,110,130,140,150,160,170,195,205,215,225,235,260,270,280,290,300]};
const critRate=n=>n<=10?10+2*n:20+n;
const SKA={
 bless:{ic:'🌿',nm:'The Blessing of Amazon',max:16,ty:'Passive',pre:[],d:'Increases accuracy.',fx:n=>'Accuracy +'+n},
 eye:{ic:'🦅',nm:'The Eye of Amazon',max:8,ty:'Passive',pre:[['bless',3]],d:'Increases the range of attack for both bows and crossbows.',fx:n=>'Range of attack for bows and crossbows +'+15*n},
 crit:{ic:'💢',nm:'Critical Shot',max:20,ty:'Passive',pre:[],d:'Allows you to perform a critical attack with a certain success rate.',fx:n=>critRate(n)+'% success rate, critical damage '+(100+5*n)+'%'},
 focus:{ic:'🔍',nm:'Focus',max:20,ty:'Supportive',pre:[['bless',3]],d:'Focusing to temporarily increase accuracy and avoidability.',fx:n=>'MP -'+ARC.fcMp[n-1]+'; accuracy +'+n+' and avoidability +'+n+' for '+ARC.fcDu[n-1]+' seconds',cost:n=>ARC.fcMp[n-1]+' MP',du:n=>ARC.fcDu[n-1]+' s'},
 doubleshot:{ic:'🎯',nm:'Double Shot',max:20,ty:'Active',pre:[['arrowblow',1]],d:'Fires two arrows at once to attack an enemy twice.',fx:n=>'MP -'+ARC.dsMp[n-1]+'; Damage '+ARC.dsDm[n-1]+'% x 2 Hits',cost:n=>ARC.dsMp[n-1]+' MP · 2 arrows'},
 arrowblow:{ic:'🏹',nm:'Arrow Blow',max:20,ty:'Active',pre:[],d:'Fires an arrow with authority. Applies more damage than usual.',fx:n=>'MP -'+ARC.abMp[n-1]+'; Damage '+ARC.abDm[n-1]+'%',cost:n=>ARC.abMp[n-1]+' MP · 1 arrow'}};
Object.values(SKA).forEach(d=>d.job='Archer');Object.assign(SKJ,SKA);
SKL.arrowblow=['🏹','Arrow Blow'];SKL.doubleshot=['🎯','Double Shot'];SKL.focus=['🔍','Focus'];
function arcAttack(name,pcts,mpc,ammo){if(!enc||!isArc())return false;const now=Date.now();
 if(now<atkReady()||now-lastMv<moveCd())return false;
 if(!W().rng){log('You need a bow or crossbow to use '+name+'.','bad','combat');render();return false}
 if(enc.gap>wReach()){log('The '+MON[enc.k].n+' is out of reach.','','combat');render();return false}
 if(ammoN()<ammo){log('You don\'t have enough '+ITEMS[ammoId()].n+'.','bad','combat');render();return false}
 if(P.mp<mpc){log('You don\'t have enough MP for that.','bad','combat');render();return false}
 P.mp-=mpc;useAmmo(ammo);lastAtk=now;const d=MON[enc.k];
 for(const pc of pcts){if(enc.hp<=0)break;const ch=Math.min(1,Math.max(.35,.8+(acc()-d.av)/50));
  if(Math.random()>ch)log(name+' misses the '+d.n+'.','','combat');
  else{const r=dmgRange(),x=Math.max(1,Math.floor(critRoll(R(r[0],r[1]))*pc/100));enc.hp-=x;log(name+' hits the '+d.n+' for '+x+'.','hit','combat')}}
 if(enc.hp<=0)win();render();return true}
function skArrow(){const n=sl('arrowblow');if(n)arcAttack('Arrow Blow',[ARC.abDm[n-1]],ARC.abMp[n-1],1)}
function skDouble(){const n=sl('doubleshot');if(n)arcAttack('Double Shot',[ARC.dsDm[n-1],ARC.dsDm[n-1]],ARC.dsMp[n-1],2)}
function skFocus(){const n=sl('focus');if(!isArc()||!n||P.dead)return;const mp=ARC.fcMp[n-1];
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;P.b.focus=Date.now()+ARC.fcDu[n-1]*1000;P.b.focusv=n;log('Focus: accuracy and avoidability +'+n+' for '+ARC.fcDu[n-1]+' s.','good','combat');save();render()}
{const _atk=attack,_hv=hitVerb,_eq=equipItem,_qi=qsInfo,_qu=qsUse;
 attack=function(){if(!enc)return;if(W().rng&&ammoN()<1){log('You have no '+ITEMS[ammoId()].n+'.','bad','combat');return render()}
  const la=lastAtk;_atk();if(W().rng&&lastAtk!==la&&ammoN()>0){useAmmo(1);render()}};
 hitVerb=function(){return W().rng==='claw'?'throw a star at':W().rng?'shoot':W().dag?'stab':_hv()};
 equipItem=function(id){const it=ITEMS[id];const bg=it&&it.beg&&(!P.job||P.job==='beginner');if(it&&!bg&&it.rng==='claw'&&P.job!=='rogue'){log('Only Rogues can use claws.','bad','items');return render()}if(it&&!bg&&(it.rng==='bow'||it.rng==='xbow')&&P.job!=='archer'){log('Only Archers can use bows and crossbows.','bad','items');return render()}_eq(id)};
 qsInfo=function(k,now){const t=v=>(v/1000).toFixed(1)+'s';
  if(k==='basic'&&W().rng){const f=_qi(k,now),n=ammoN();return Object.assign(f,{sub:n<1?'No ammo':(f.sub==='Basic'||f.sub==='Ready')?'x'+n:f.sub,dis:f.dis||n<1})}
  if(k==='arrowblow'||k==='doubleshot'){const ab=k==='arrowblow',n=sl(k)||1,mp=ab?ARC.abMp[n-1]:ARC.dsMp[n-1],am=ab?1:2,
    l=Math.max(atkReady(),lastMv+moveCd())-now,far=!!enc&&enc.gap>wReach();
   return{ic:SKL[k][0],nm:SKL[k][1],sub:!enc?mp+' MP':!W().rng?'Bow only':far?'Too far':ammoN()<am?'No ammo':l>0?t(l):mp+' MP',dis:!enc||!W().rng||far||ammoN()<am||l>0||P.mp<mp}}
  if(k==='focus'){const n=sl(k)||1,mp=ARC.fcMp[n-1];return{ic:SKL.focus[0],nm:'Focus',sub:P.b.focus>now?Math.ceil((P.b.focus-now)/1000)+'s':mp+' MP',dis:P.mp<mp}}
  return _qi(k,now)};
 qsUse=function(k){if(k==='arrowblow')skArrow();else if(k==='doubleshot')skDouble();else if(k==='focus')skFocus();else _qu(k)}}
/* Job advancement: Athena Pierce, Henesys */
{const _dl=dlg;dlg=function(){const d=_dl();if(talk&&talk.npc==='athena'&&(!talk.page||talk.page==='main')){
  if(isArc())d.t+='<br><br><span class="mute">You are an Archer. Your skills are in the Skills tab, under 1st Job.</span>';
  else if(!P.job&&P.lvl>=10&&P.dex>=25)d.ch.splice(d.ch.length-1,0,['I want to become an Archer','job:archer']);
  else if(!P.job)d.t+='<br><br><span class="mute">To become an Archer you need level 10 and 25 DEX. You are level '+P.lvl+' with '+P.dex+' DEX.</span>'}
  return d}}
{const _dd=dlgDo;dlgDo=function(k){if(k==='job:archer'){if(P.job||P.lvl<10||P.dex<25)return;P.job='archer';P.sp+=1;
  log('Athena Pierce: You are now an Archer. Your skills are under 1st Job in the Skills tab. Bows and crossbows are sold in Henesys.','good','quest');if(talk)talk.page='main';save();return render()}return _dd(k)}}


/* ===== Rogue (Thief, 1st job), GMS v62. Requirements: level 10 and 25 DEX, advance with the Dark Lord in Kerning City. =====
   Only Rogues can see or learn these skills and only Rogues can use claws. Daggers: any class. */
function isRog(){return !!P&&P.job==='rogue'}
ITEMS.razor.dag=1;ITEMS.fruit_knife.dag=1;
ITEMS.dagger={n:'Dagger',i:'🗡️',w:1,dag:1,watk:22,spd:600,mult:3.6,req:10,buy:1200};
ITEMS.gladius={n:'Gladius',i:'🗡️',w:1,dag:1,watk:32,spd:600,mult:3.6,req:15,buy:6000};
ITEMS.steel_titans={n:'Steel Titans',i:'🐾',w:1,rng:'claw',watk:15,spd:600,mult:3.6,req:10,buy:1500};
ITEMS.garnier={n:'Garnier',i:'🐾',w:1,rng:'claw',watk:24,spd:600,mult:3.6,req:15,buy:7000};
ITEMS.star_subi={n:'Subi Throwing-Stars',i:'✴️',ammo:'claw',sa:15,buy:3};
DESC.dagger='A short blade for quick stabs. Rogues get the most out of it.';DESC.gladius='A balanced short sword favoured by thieves.';
DESC.steel_titans='A claw worn over the hand. Throws Throwing-Stars. Rogues only.';DESC.garnier='A sharper claw for throwing Throwing-Stars. Rogues only.';
DESC.star_subi='Throwing-Stars for claws. They add 15 weapon attack. Each throw uses one.';
MAPS.kerning_city.shopList=MAPS.kerning_city.shopList.concat(['dagger','gladius','steel_titans','garnier','star_subi']);
function wMax(){const w=W(),S=eS('str'),D=eS('dex'),L=eS('luk');let a;
 const sa=(w.rng&&ammoN()>0)?((ITEMS[ammoId()]||{}).sa||0):0;
 if(w.rng==='claw')a=(L*w.mult+D)*(w.watk+sa)/100;
 else if(w.rng)a=(D*w.mult+S)*(w.watk+sa)/100;
 else if(w.dag&&isRog())a=(L*w.mult+S+D)*w.watk/100;
 else a=(S*w.mult+D)*w.watk/100;
 return Math.floor(a)}
const darkOn=()=>!!P&&!!P.b&&P.b.dark>Date.now();
const darkPen=()=>{if(!darkOn())return 0;const n=P.b.darkv|0;return n<=12?32-2*n:Math.max(0,20-n)};
const disVal=()=>enc&&enc.dis>Date.now()?(enc.disv|0):0;
const ROG={
 diMp:[5,5,5,5,5,6,6,6,7,7,7,8,8,8,9,9,9,10,10,10],
 diDu:[7,9,11,13,15,20,22,24,29,31,33,38,40,42,47,49,51,56,58,60],
 dsMp:[8,8,8,8,9,9,9,10,10,10,11,11,11,12,12,12,13,13,13,14],
 dsDm:[98,100,102,104,106,108,110,112,114,116,118,120,122,124,126,128,130,132,134,140],
 l7Mp:[8,8,8,8,9,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16],
 l7Dm:[58,62,66,70,76,80,84,90,94,100,104,110,114,120,124,130,134,140,144,150]};
const SKR={
 nimble:{ic:'🥷',nm:'Nimble Body',max:20,ty:'Passive',pre:[],d:'Increases accuracy and avoidability.',fx:n=>'Accuracy +'+n+', avoidability +'+n},
 keen:{ic:'👀',nm:'Keen Eyes',max:8,ty:'Passive',pre:[['nimble',3]],d:'Increases the range of attack using throwing weapons such as throwing stars & knives.',fx:n=>'Range of attack for throwing weapon: +'+25*n},
 disorder:{ic:'😵',nm:'Disorder',max:20,ty:'Supportive',pre:[],d:'Temporarily decreases the morale of an opponent. Its weapon def. and attack will suffer, and the attacking enemy will suddenly stop attacking. Can\'t perform the attack on an enemy that\'s already in "disorder", however.',fx:n=>'MP -'+ROG.diMp[n-1]+'; Enemy\'s weapon attack -'+n+', weapon def. -'+n+' for '+ROG.diDu[n-1]+' seconds',cost:n=>ROG.diMp[n-1]+' MP',du:n=>ROG.diDu[n-1]+' s'},
 darksight:{ic:'🌑',nm:'Dark Sight',max:20,ty:'Supportive',pre:[['disorder',3]],d:'Use MP to hide behind the shadows. While hiding, the enemy won\'t attack, but you can\'t attack back either. All movements other than attacking are available. It\'s temporary, so after a while, you\'ll be back to normal.',fx:n=>'MP -'+(25-n)+'; '+(n>=20?'Disappear for 200 seconds, regular moving speed':'Disappear for '+10*n+' seconds, speed -'+(n<=12?32-2*n:20-n)),cost:n=>(25-n)+' MP',du:n=>10*n+' s'},
 dstab:{ic:'🔪',nm:'Double Stab',max:20,ty:'Active',pre:[],d:'Use MP to quickly stab an enemy twice at once using a dagger.',fx:n=>'MP -'+ROG.dsMp[n-1]+'; Damage '+ROG.dsDm[n-1]+'% x 2 Hits',cost:n=>ROG.dsMp[n-1]+' MP'},
 lucky7:{ic:'⭐',nm:'Lucky Seven',max:20,ty:'Active',pre:[],d:'Use MP to throw 2 throwing stars and apply damage based on LUK, regardless of the rate of javelin mastery.',fx:n=>'MP -'+ROG.l7Mp[n-1]+'; Damage '+ROG.l7Dm[n-1]+'% x 2 Hits',cost:n=>ROG.l7Mp[n-1]+' MP · 2 stars'}};
Object.values(SKR).forEach(d=>d.job='Rogue');Object.assign(SKJ,SKR);
SKL.disorder=['😵','Disorder'];SKL.darksight=['🌑','Dark Sight'];SKL.dstab=['🔪','Double Stab'];SKL.lucky7=['⭐','Lucky Seven'];
function rogCheck(name,needDag,needClaw,mpc,ammo){if(!enc||!isRog())return false;const now=Date.now();
 if(darkOn()){log('You can\'t attack while hiding in the dark.','bad','combat');render();return false}
 if(now<atkReady()||now-lastMv<moveCd())return false;
 if(needDag&&!W().dag){log('You need a dagger to use '+name+'.','bad','combat');render();return false}
 if(needClaw&&W().rng!=='claw'){log('You need a claw to use '+name+'.','bad','combat');render();return false}
 if(enc.gap>wReach()){log('The '+MON[enc.k].n+' is out of reach.','','combat');render();return false}
 if(ammo&&ammoN()<ammo){log('You don\'t have enough Throwing-Stars.','bad','combat');render();return false}
 if(P.mp<mpc){log('You don\'t have enough MP for that.','bad','combat');render();return false}
 return true}
function rogHits(name,pcts,maxFn){const d=MON[enc.k];for(const pc of pcts){if(enc.hp<=0)break;const ch=Math.min(1,Math.max(.35,.8+(acc()-d.av)/50));
  if(Math.random()>ch)log(name+' misses the '+d.n+'.','','combat');
  else{const mx=maxFn(),x=Math.max(1,Math.floor(R(Math.max(1,Math.floor(mx*.6)),Math.max(1,mx))*pc/100));enc.hp-=x;log(name+' hits the '+d.n+' for '+x+'.','hit','combat')}}
 if(enc.hp<=0)win();render()}
function skStab(){const n=sl('dstab');if(!n)return;const mp=ROG.dsMp[n-1];if(!rogCheck('Double Stab',true,false,mp,0))return;
 P.mp-=mp;lastAtk=Date.now();rogHits('Double Stab',[ROG.dsDm[n-1],ROG.dsDm[n-1]],wMax)}
function skLucky(){const n=sl('lucky7');if(!n)return;const mp=ROG.l7Mp[n-1];if(!rogCheck('Lucky Seven',false,true,mp,2))return;
 P.mp-=mp;useAmmo(2);lastAtk=Date.now();rogHits('Lucky Seven',[ROG.l7Dm[n-1],ROG.l7Dm[n-1]],()=>Math.floor(eS('luk')*5*(W().watk+15)/100))}
function skDisorder(){const n=sl('disorder');if(!isRog()||!n||!enc)return;const mp=ROG.diMp[n-1],d=MON[enc.k],now=Date.now();
 if(darkOn()){log('You can\'t use Disorder while hiding in the dark.','bad','combat');return render()}
 if(enc.dis>now){log('The '+d.n+' is already in disorder.','bad','combat');return render()}
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;enc.dis=now+ROG.diDu[n-1]*1000;enc.disv=n;enc.next=Math.max(enc.next,now+d.iv);
 log('Disorder: the '+d.n+' loses its nerve. Attack -'+n+' for '+ROG.diDu[n-1]+' s.','good','combat');render()}
function skDark(){const n=sl('darksight');if(!isRog()||!n||P.dead)return;const mp=25-n;
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;P.b.dark=Date.now()+10*n*1000;P.b.darkv=n;log('Dark Sight: you vanish into the shadows for '+10*n+' s. Enemies won\'t attack, and you can\'t attack either.','good','combat');save();render()}
{const _atk=attack,_s3=skThree,_qi=qsInfo,_qu=qsUse;
 attack=function(){if(enc&&darkOn()){log('You can\'t attack while hiding in the dark.','bad','combat');return render()}_atk()};
 skThree=function(){if(enc&&darkOn()){log('You can\'t attack while hiding in the dark.','bad','combat');return render()}_s3()};
 qsInfo=function(k,now){const t=v=>(v/1000).toFixed(1)+'s';
  if(k==='basic'&&darkOn()){const f=_qi(k,now);return Object.assign(f,{sub:'Hidden',dis:true})}
  if(k==='dstab'||k==='lucky7'){const ds=k==='dstab',n=sl(k)||1,mp=ds?ROG.dsMp[n-1]:ROG.l7Mp[n-1],am=ds?0:2,
    l=Math.max(atkReady(),lastMv+moveCd())-now,far=!!enc&&enc.gap>wReach(),wrong=ds?!W().dag:W().rng!=='claw';
   return{ic:SKL[k][0],nm:ds?'Dbl Stab':'Lucky 7',sub:!enc?mp+' MP':darkOn()?'Hidden':wrong?(ds?'Dagger only':'Claw only'):far?'Too far':ammoN()<am?'No stars':l>0?t(l):mp+' MP',dis:!enc||darkOn()||wrong||far||ammoN()<am||l>0||P.mp<mp}}
  if(k==='disorder'){const n=sl(k)||1,mp=ROG.diMp[n-1],on=!!enc&&enc.dis>now;return{ic:SKL.disorder[0],nm:'Disorder',sub:!enc?mp+' MP':on?Math.ceil((enc.dis-now)/1000)+'s':mp+' MP',dis:!enc||on||darkOn()||P.mp<mp}}
  if(k==='darksight'){const n=sl(k)||1,mp=25-n;return{ic:SKL.darksight[0],nm:'Dark Sight',sub:darkOn()?Math.ceil((P.b.dark-now)/1000)+'s':mp+' MP',dis:P.mp<mp}}
  return _qi(k,now)};
 qsUse=function(k){if(k==='dstab')skStab();else if(k==='lucky7')skLucky();else if(k==='disorder')skDisorder();else if(k==='darksight')skDark();else _qu(k)}}
/* Job advancement: the Dark Lord, Kerning City */
{const _dl=dlg;dlg=function(){const d=_dl();if(talk&&talk.npc==='darklord'&&(!talk.page||talk.page==='main')){
  if(isRog())d.t+='<br><br><span class="mute">You are a Rogue. Your skills are in the Skills tab, under 1st Job.</span>';
  else if(!P.job&&P.lvl>=10&&P.dex>=25)d.ch.splice(d.ch.length-1,0,['I want to become a Rogue','job:rogue']);
  else if(!P.job)d.t+='<br><br><span class="mute">To become a Rogue you need level 10 and 25 DEX. You are level '+P.lvl+' with '+P.dex+' DEX.</span>'}
  return d}}
{const _dd=dlgDo;dlgDo=function(k){if(k==='job:rogue'){if(P.job||P.lvl<10||P.dex<25)return;P.job='rogue';P.sp+=1;
  log('Dark Lord: You are now a Rogue. Your skills are under 1st Job in the Skills tab. Daggers, claws and Throwing-Stars are sold in Kerning City.','good','quest');if(talk)talk.page='main';save();return render()}return _dd(k)}}


/* ===== Magician (1st job), GMS v62. Requirements: level 8 and 20 INT, advance with Grendel the Really Old in Ellinia. =====
   Only Magicians can see or learn these skills, and only Magicians can use wands and staffs. */
function isMag(){return !!P&&P.job==='magician'}
ITEMS.wooden_wand={n:'Wooden Wand',i:'🪄',w:1,mw:'wand',watk:10,matk:10,spd:700,mult:3.6,req:8,buy:600};
ITEMS.hardwood_wand={n:'Hardwood Wand',i:'🪄',w:1,mw:'wand',watk:14,matk:20,spd:700,mult:3.6,req:15,buy:4000};
ITEMS.wooden_staff={n:'Wooden Staff',i:'🦯',w:1,mw:'staff',watk:12,matk:12,spd:760,mult:3.6,req:8,buy:900};
ITEMS.hardwood_staff={n:'Hardwood Staff',i:'🦯',w:1,mw:'staff',watk:17,matk:24,spd:760,mult:3.6,req:15,buy:5500};
DESC.wooden_wand='A simple wand that focuses magic. Magicians only.';DESC.hardwood_wand='A sturdier wand with more magic power. Magicians only.';
DESC.wooden_staff='A walking staff that channels magic. Magicians only.';DESC.hardwood_staff='A hardwood staff with more magic power. Magicians only.';
MAPS.ellinia.shopList=MAPS.ellinia.shopList.concat(['wooden_wand','hardwood_wand','wooden_staff','hardwood_staff']);
const MG_REACH=4;/* v3.4: spells reach 4 columns on the 7-wide board, one more than bows and claws (range is the mage perk) */
const mastery=n=>15+5*Math.floor((n-1)/2);
const MAG={
 mgPct:n=>11+3*((n-1)%5)+19*Math.floor((n-1)/5),
 mgDur:n=>111+21*((n-1)%5)+135*Math.floor((n-1)/5),
 mgMp:[6,6,6,6,6,8,8,8,8,8,10,10,10,10,10,12,12,12,12,12],
 maMp:[8,8,8,8,8,10,10,10,10,10,13,13,13,13,13,16,16,16,16,16],
 maDur:n=>54+14*((n-1)%5)+(n>5?100*Math.floor((n-1)/5)-10:0),
 ebMp:[6,6,6,6,7,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14],
 ebAt:[20,21,22,23,26,27,28,31,32,35,36,39,40,43,44,47,48,51,52,55],
 mcMp:[10,10,10,10,11,11,11,12,12,13,13,14,14,15,15,16,17,18,19,20],
 mcAt:[11,12,13,14,16,17,18,20,21,23,24,26,27,29,30,32,34,36,38,40]};
const mprAmt=n=>Math.max(1,Math.floor(n*(P?P.lvl:1)/10));
const SKM={
 mprec:{ic:'💧',nm:'Improving MP Recovery',max:16,ty:'Passive',pre:[],d:'Recovering even more MP every 10 sec. The higher the level of the character and the skill level, the more recovery it enables the character to have.',fx:n=>'Constant additional recovery of MP (+'+mprAmt(n)+' every 10 s at your level)'},
 mmp:{ic:'🔷',nm:'Improved MaxMP Increase',max:10,ty:'Passive',pre:[['mprec',5]],d:'This skill boosts up the amount of increase on MaxMP after each Level UP, or AP used on MaxMP.',fx:n=>'If Level UP, +'+2*n+' more; if AP applied, +'+n+' more on top on MaxMP'},
 mguard:{ic:'🔮',nm:'Magic Guard',max:20,ty:'Supportive',pre:[],d:'Temporarily replaces damage with MP instead of HP. If MP reaches 0, the HP takes a full hit.',fx:n=>'MP -'+MAG.mgMp[n-1]+'; Replace '+MAG.mgPct(n)+'% of HP damage as MP for '+MAG.mgDur(n)+' sec.',cost:n=>MAG.mgMp[n-1]+' MP',du:n=>MAG.mgDur(n)+' s'},
 marmor:{ic:'🧿',nm:'Magic Armor',max:20,ty:'Supportive',pre:[['mguard',3]],d:'Temporarily boosts the weapon defense by blowing magic into the armor.',fx:n=>'MP -'+MAG.maMp[n-1]+'; Weapon Def. +'+2*n+' for '+MAG.maDur(n)+' seconds.',cost:n=>MAG.maMp[n-1]+' MP',du:n=>MAG.maDur(n)+' s'},
 ebolt:{ic:'⚡',nm:'Energy Bolt',max:20,ty:'Active',pre:[],d:'Use MP to attack one enemy.',fx:n=>'MP -'+MAG.ebMp[n-1]+'; Basic attack '+MAG.ebAt[n-1]+', mastery '+mastery(n)+'%',cost:n=>MAG.ebMp[n-1]+' MP'},
 mclaw:{ic:'🪄',nm:'Magic Claw',max:20,ty:'Active',pre:[['ebolt',1]],d:'Use MP to attack an enemy twice.',fx:n=>'MP -'+MAG.mcMp[n-1]+'; Basic attack '+MAG.mcAt[n-1]+' x 2 Hit, mastery '+mastery(n)+'%',cost:n=>MAG.mcMp[n-1]+' MP'}};
Object.values(SKM).forEach(d=>d.job='Magician');Object.assign(SKJ,SKM);
SKL.mguard=['🔮','Magic Guard'];SKL.marmor=['🧿','Magic Armor'];SKL.ebolt=['⚡','Energy Bolt'];SKL.mclaw=['🪄','Magic Claw'];
/* v3.4: as in v62, spells can be cast with any weapon or none; a wand or staff only adds magic attack */
const hasMW=()=>true;
/* v3.4: the v62 / MapleStory Classic magic formula (meowdb Damage & Combat Formulas):
   MagicTotal = floor(INT/2) + magic attack (weapon, gear, scrolls, buffs)
   MAX = SkillPower/100 x MagicTotal x (1 + INT/125);  MIN = SkillPower/100 x MagicTotal x (1 + INT x m / 125),
   m = (SpellMastery/10 + 0.1) x 0.7. Callers pass mastery as a percent (10 + 5 x SpellMastery). */
function magTotal(){const w=W(),I=eS('int');return Math.floor(I/2)+(w.matk||0)+((w.x&&w.x.matk)||0)+gearMatk()}
function gearMatk(){let a=0;for(const s in (P.eq||{})){const it=ITEMS[P.eq[s]];if(it&&eqOk(P.eq[s])){if(it.x&&it.x.matk)a+=it.x.matk}}return a}
function magRange(atk,mast){const I=eS('int'),K=atk/100,MT=magTotal(),sm=Math.max(0,((mast||10)-10)/5),m=(sm/10+0.1)*0.7;
 return[Math.max(1,Math.floor(K*MT*(1+I*m/125))),Math.max(1,Math.floor(K*MT*(1+I/125)))]}
const accMagic=()=>(eS('int')*1.2+P.lvl*2+eS('luk')*.6)/2.5+5;
function guardTake(x){const now=Date.now();if(!(P.b&&P.b.guard>now))return x;const mp=Math.floor(x*(P.b.guardv|0)/100);
 if(mp<=0)return x;if(P.mp>=mp){P.mp-=mp;return x-mp}P.mp=0;return x}
function magCast(name,hits,mpc,atk,mast){if(!enc||!isMag())return false;const now=Date.now();
 if(now<atkReady()||now-lastMv<moveCd())return false;
 if(!hasMW()){log('You need a wand or staff to use '+name+'.','bad','combat');render();return false}
 if(enc.gap>MG_REACH){log('The '+MON[enc.k].n+' is out of reach.','','combat');render();return false}
 if(P.mp<mpc){log('You don\'t have enough MP for that.','bad','combat');render();return false}
 P.mp-=mpc;lastAtk=now;const d=MON[enc.k];
 for(let i=0;i<hits;i++){if(enc.hp<=0)break;const ch=Math.min(1,Math.max(.35,.8+(accMagic()-d.av)/50));
  if(Math.random()>ch)log(name+' misses the '+d.n+'.','','combat');
  else{const r=magRange(atk,mast),x=R(r[0],r[1]);enc.hp-=x;log(name+' hits the '+d.n+' for '+x+'.','hit','combat')}}
 if(enc.hp<=0)win();render();return true}
function skEBolt(){const n=sl('ebolt');if(n)magCast('Energy Bolt',1,MAG.ebMp[n-1],MAG.ebAt[n-1],mastery(n))}
function skMClaw(){const n=sl('mclaw');if(n)magCast('Magic Claw',2,MAG.mcMp[n-1],MAG.mcAt[n-1],mastery(n))}
function skGuard(){const n=sl('mguard');if(!isMag()||!n||P.dead)return;const mp=MAG.mgMp[n-1];
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;P.b.guard=Date.now()+MAG.mgDur(n)*1000;P.b.guardv=MAG.mgPct(n);log('Magic Guard: '+MAG.mgPct(n)+'% of HP damage is taken as MP for '+MAG.mgDur(n)+' s.','good','combat');save();render()}
function skMArmor(){const n=sl('marmor');if(!isMag()||!n||P.dead)return;const mp=MAG.maMp[n-1];
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;P.b.marm=Date.now()+MAG.maDur(n)*1000;P.b.marmv=2*n;log('Magic Armor: weapon DEF +'+2*n+' for '+MAG.maDur(n)+' s.','good','combat');save();render()}
{const _eq=equipItem,_qi=qsInfo,_qu=qsUse;
 equipItem=function(id){const it=ITEMS[id];if(it&&it.mw&&P.job!=='magician'){log('Only Magicians can use wands and staffs.','bad','items');return render()}_eq(id)};
 qsInfo=function(k,now){const t=v=>(v/1000).toFixed(1)+'s';
  if(k==='ebolt'||k==='mclaw'){const eb=k==='ebolt',n=sl(k)||1,mp=eb?MAG.ebMp[n-1]:MAG.mcMp[n-1],
    l=Math.max(atkReady(),lastMv+moveCd())-now,far=!!enc&&enc.gap>MG_REACH;
   return{ic:SKL[k][0],nm:eb?'Energy Bolt':'Magic Claw',sub:!enc?mp+' MP':!hasMW()?'Wand/Staff':far?'Too far':l>0?t(l):mp+' MP',dis:!enc||!hasMW()||far||l>0||P.mp<mp}}
  if(k==='mguard'){const n=sl(k)||1,mp=MAG.mgMp[n-1],on=P.b.guard>now;return{ic:SKL.mguard[0],nm:'Magic Guard',sub:on?Math.ceil((P.b.guard-now)/1000)+'s':mp+' MP',dis:P.mp<mp}}
  if(k==='marmor'){const n=sl(k)||1,mp=MAG.maMp[n-1],on=P.b.marm>now;return{ic:SKL.marmor[0],nm:'Magic Armor',sub:on?Math.ceil((P.b.marm-now)/1000)+'s':mp+' MP',dis:P.mp<mp}}
  return _qi(k,now)};
 qsUse=function(k){if(k==='ebolt')skEBolt();else if(k==='mclaw')skMClaw();else if(k==='mguard')skGuard();else if(k==='marmor')skMArmor();else _qu(k)}}
/* Improving MP Recovery: extra MP every 10 s while standing still (idle, not in a fight) */
let lastMpRec=Date.now();
setInterval(()=>{if(!P||!isMag()||P.dead)return;const now=Date.now();if(now-lastMpRec<10000)return;lastMpRec=now;
 const n=sl('mprec');if(!n||enc||P.mp>=P.maxMp)return;P.mp=Math.min(P.maxMp,P.mp+mprAmt(n));if(!inShop)render()},1000);
/* Job advancement: Grendel the Really Old, Ellinia */
{const _dl=dlg;dlg=function(){const d=_dl();if(talk&&talk.npc==='grendel'&&(!talk.page||talk.page==='main')){
  if(isMag())d.t+='<br><br><span class="mute">You are a Magician. Your skills are in the Skills tab, under 1st Job.</span>';
  else if(!P.job&&P.lvl>=8&&P.int>=20)d.ch.splice(d.ch.length-1,0,['I want to become a Magician','job:magician']);
  else if(!P.job)d.t+='<br><br><span class="mute">To become a Magician you need level 8 and 20 INT. You are level '+P.lvl+' with '+P.int+' INT.</span>'}
  return d}}
{const _dd=dlgDo;dlgDo=function(k){if(k==='job:magician'){if(P.job||P.lvl<8||P.int<20)return;P.job='magician';P.sp+=1;
  log('Grendel the Really Old: You are now a Magician. Your skills are under 1st Job in the Skills tab. Wands and staffs are sold in Ellinia.','good','quest');if(talk)talk.page='main';save();return render()}return _dd(k)}}

/* Built-in account WXCX / WXCX, created once on first load and pre-filled with Save ID and Save password on. */
(async()=>{if(!lsGet('mapleish_seed2')){const ac=AC(),old=await sha('WXCX:WXCX');if(ac.WXCX&&ac.WXCX.h===old)delete ac.WXCX;const h=await sha('user:1234');if(!ac.user)ac.user={email:'user@example.com',h,ok:true};saveAC(ac);if(ac.user.h===h){lsSet('mapleish_id','user');lsSet('mapleish_spw',h);lsSet('mapleish_spwu','user')}else{if(lsGet('mapleish_id')==='WXCX')lsDel('mapleish_id');if(lsGet('mapleish_spwu')==='WXCX'){lsDel('mapleish_spw');lsDel('mapleish_spwu')}}lsSet('mapleish_seed2','1')}render()})();


/* ===== v62 weapon import: 234 weapons from the v62 list, with drops on monsters that exist in this game ===== */
(function(){
const WRATE=0.0007;/* chance per kill for each listed weapon on each listed monster (same as the existing Sword/Hand Axe drops). Edit to tune. */
const WD=window.__GD.WD;
const MONID={'Snail':'snail','Blue Snail':'blue_snail','Shroom':'shroom','Red Snail':'red_snail','Orange Mushroom':'orange_mushroom','Slime':'slime','Stump':'stump','Pig':'pig','Ribbon Pig':'ribbon_pig','Octopus':'octopus','Stirge':'stirge','Green Mushroom':'green_mushroom','Horny Mushroom':'horny_mushroom','Axe Stump':'axe_stump','Evil Eye':'evil_eye'};
const TYI={oh_sword:'\u{1F5E1}\uFE0F',th_sword:'\u2694\uFE0F',oh_axe:'\u{1FA93}',th_axe:'\u{1FA93}',oh_bw:'\u{1F528}',th_bw:'\u{1F528}',dagger:'\u{1F5E1}\uFE0F',spear:'\u{1F531}',polearm:'\u{1F531}',wand:'\u{1FA84}',staff:'\u{1F9AF}',bow:'\u{1F3F9}',crossbow:'\u{1F3AF}',claw:'\u{1F43E}',knuckle:'\u{1F44A}',gun:'\u{1F52B}'};
const TYL={oh_sword:'One-handed sword',th_sword:'Two-handed sword',oh_axe:'One-handed axe',th_axe:'Two-handed axe',oh_bw:'One-handed blunt weapon',th_bw:'Two-handed blunt weapon',dagger:'Dagger',spear:'Spear',polearm:'Polearm',wand:'Wand',staff:'Staff',bow:'Bow',crossbow:'Crossbow',claw:'Claw',knuckle:'Knuckle',gun:'Gun'};
const MULT={oh_sword:4.0,th_sword:4.6,oh_axe:4.4,th_axe:4.8,oh_bw:4.4,th_bw:4.8,dagger:3.6,spear:5.0,polearm:5.0,wand:3.6,staff:3.6,bow:3.4,crossbow:3.6,claw:3.6,knuckle:4.8,gun:3.6};
const SPD={2:540,3:600,4:660,5:720,6:780,7:840,8:900,9:960};
const PJ={Warrior:['swordsman'],Bowman:['archer'],Thief:['rogue'],Magician:['magician'],Pirate:['pirate'],Beginner:['beginner']};
const existing={},made={};Object.keys(ITEMS).forEach(k=>{if(ITEMS[k].n)existing[ITEMS[k].n.toLowerCase()]=k});
const noTable=k=>({m:[1,MON[k].m[0],MON[k].m[1]],i:[[MON[k].e,.55,1,1],['red_potion',.08,1,1]]});
WD.forEach(w=>{const key=w.n.toLowerCase();let id=existing[key];
 if(!id){id='w_'+key.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');if(made[key])id+='_'+(++made[key]);else made[key]=1;
  const it={n:w.n,i:TYI[w.ty],w:1,watk:w.watk,spd:SPD[w.sp||5]||720,mult:MULT[w.ty],req:w.req,ty:w.ty,tl:TYL[w.ty]};
  if(w.sell)it.sell=w.sell;if(w.matk)it.matk=w.matk;
  if(w.ty==='bow')it.rng='bow';else if(w.ty==='crossbow')it.rng='xbow';else if(w.ty==='claw')it.rng='claw';else if(w.ty==='wand'||w.ty==='staff')it.mw=w.ty;else if(w.ty==='dagger')it.dag=1;
  if(Object.keys(w.bon).length)it.bon=w.bon;if(Object.keys(w.x).length)it.x=w.x;if(Object.keys(w.rs).length)it.rs=w.rs;
  it.jb=w.job||'Common';if(w.job&&PJ[w.job])it.pj=PJ[w.job];
  ITEMS[id]=it;DESC[id]=(w.rem&&w.rem.replace(/Available for players[^.]*\./,'').trim())||('A '+TYL[w.ty].toLowerCase()+'.');TUC[id]=w.up}
 w.mons.forEach(m=>{const k=MONID[m];if(!k||!MON[k])return;const t=DROPS[k]||(DROPS[k]=noTable(k));if(!t.i.some(e=>e[0]===id))t.i.push([id,WRATE,1,1])})});
const _eqw=equipItem;equipItem=function(id){const it=ITEMS[id];if(it&&it.w){
 if(it.pj&&!it.pj.includes(P.job||'beginner')){log('That is '+(it.jb==='Pirate'?'a Pirate weapon, and there is no Pirate job yet.':'for '+it.jb+'s only.'),'bad','items');return render()}
 if(it.rs)for(const k in it.rs)if((P[k]|0)<it.rs[k]){log('You need '+k.toUpperCase()+' '+it.rs[k]+' to use this.','bad','items');return render()}}
 return _eqw(id)};
const _ir=itemRows;itemRows=function(id,st){const r=_ir.apply(this,arguments),it=ITEMS[id];if(!it||!it.w)return r;
 if(it.tl&&r[0]&&r[0][0]==='Type')r[0]=['Type',it.tl];
 if(it.rs)r.push(['Required stats',Object.keys(it.rs).map(k=>k.toUpperCase()+' '+it.rs[k]).join(', ')]);
 if(it.jb&&it.jb!=='Common')r.push(['Job',it.jb]);
 if(it.bon)r.push(['Bonus',Object.keys(it.bon).map(k=>k.toUpperCase()+' +'+it.bon[k]).join(', ')]);
 if(it.x)r.push(['Extra',Object.keys(it.x).map(k=>k.toUpperCase()+' +'+it.x[k]).join(', ')]);
 return r};
const _ty=tyOf;tyOf=function(id){const b=ITEMS[baseOf(id)];return(b&&b.w&&b.ty)||_ty(id)};
})();


/* ===== Combat v2: 5 lines (+1 per 25 levels), aggressive vs passive monsters, single and multi target ===== */
/* Combat lines: NRf() = number of lines (from the level, see monCap), PRf() = the line you stand in (the middle one). */
var /* v3.4 board size by level: up to 6 monsters at levels 1-10, rising evenly to 15 at level 71 (when Dragon Roar, the
   first 15-monster attack, can be learned) and to 20 at level 150; 2 monsters per row, so 3 to 10 rows */
monCap=()=>{const l=(P&&P.lvl)||1;if(l<=10)return 6;if(l<=71)return Math.round(6+(l-10)*9/61);return Math.min(20,Math.round(15+(l-71)*5/79))},
NRf=()=>Math.ceil(monCap()/2),PRf=()=>Math.floor(NRf()/2);let fld=[];
['shroom','slime','stump','axe_stump','stirge','evil_eye','horny_mushroom'].forEach(k=>{if(MON[k])MON[k].ag=1});/* aggressive monsters: edit this list to tune */
/* The board has COLS columns: you stand in column 0, monsters occupy columns 1..COLS-1 (gap = column - 1, so gap runs 0..MAXGAP). */
const COLS=7,MAXGAP=COLS-2;
const hot=m=>m.ag||m.prov||m.hp<m.max;/* non-aggressive monsters wander until you attack them, then they turn aggressive */
seek=function(){const m=MAPS[P.map];if(m.town||enc)return false;releaseStale();nextSpawn=Date.now()+SPAWN_GAP;const want=R(2,NRf()),mons=[],now=Date.now();
  for(let n=0;n<want;n++){const i=claimSlot(P.map);if(i<0)break;const sl0=mobSlots(P.map)[i],k=sl0.k,d=MON[k],eid=++eidSeq;sl0.by=eid;
   mons.push({k,hp:d.hp,max:d.hp,gap:R(1,MAXGAP),dir:Math.random()<.5?-1:1,row:0,eid,sm:P.map,si:i,ag:!!d.ag,mv:now+mvT(d),next:now+d.iv+R(-200,200)})}
  if(!mons.length)return false;
  const rw=[...Array(NRf()).keys()].sort(()=>Math.random()-.5);mons.forEach((o,j)=>o.row=rw[j]);fld=mons;enc=nearMob(null);
  log(mons.length===1?'A '+MON[enc.k].n+' (Lv '+MON[enc.k].lv+') appears.':mons.length+' monsters appear.','','combat');return true};
/* Each row is its own lane holding at most one monster; several rows can have a monster in the same slot. Distance (gap) is measured along the lane, so rows never add range. */
function nearMob(from){const r=from?from.row:PRf();return fld.slice().sort((a,b)=>a.gap-b.gap||Math.abs(a.row-r)-Math.abs(b.row-r))[0]||null}
const SPAWN_GAP=RESPAWN_TICK;/* a reinforcement every 3 to 7.5 seconds, at random */let nextSpawn=0;const spawnDelay=()=>R(3000,SPAWN_GAP);
/* Reinforcements: while you fight, free spawn points on the map keep sending monsters in (one every few seconds, entering from the far side), until the map's capacity is used up. */
function trickle(now){if(now<nextSpawn)return false;nextSpawn=now+spawnDelay();
  const free=[...Array(NRf()).keys()].filter(r=>!fld.some(o=>o.row===r));if(!free.length)return false;
  const i=claimSlot(P.map);if(i<0)return false;const sl0=mobSlots(P.map)[i],k=sl0.k,d=MON[k],eid=++eidSeq;sl0.by=eid;
  fld.push({k,hp:d.hp,max:d.hp,gap:R(1,MAXGAP),dir:Math.random()<.5?-1:1,row:free[R(0,free.length-1)],eid,sm:P.map,si:i,ag:!!d.ag,mv:now+mvT(d),next:now+d.iv+R(-200,200)});
  log('A '+d.n+' appears.','','combat');return true}
function mobsTick(now){if(!enc)return;let ch=trickle(now);
  for(const m of fld.slice()){if(!enc||!fld.includes(m))continue;const d=MON[m.k];
   if(now>=m.mv){m.mv=now+mvT(d);
    const rr=m.row+Math.sign(PRf()-m.row),canRow=m.row!==PRf()&&cellFree(m,rr,m.gap);
    if(hot(m)){
     /* aggressive (or provoked): step into your row when it is free, otherwise close the distance along the lane */
     if(canRow){m.row=rr;ch=true}
     else if(m.gap>0&&cellFree(m,m.row,m.gap-1)){m.gap--;ch=true;if(m.gap<=0){m.next=now+d.iv;log('The '+d.n+' closes in.','','combat')}}}/* one monster per cell */
    else{
     /* calm monsters wander back and forth along their lane, and drift toward your lane now and then */
     if(canRow&&Math.random()<.4){m.row=rr;ch=true}
     else if(Math.random()<.8){const mg=maxG(m);let g=m.gap+(m.dir||1);if(g<0||g>mg){m.dir=-(m.dir||1);g=m.gap+m.dir}if(g>=0&&g<=mg&&g!==m.gap&&cellFree(m,m.row,g)){m.gap=g;ch=true;if(g===0)m.next=now+Math.round(d.iv*1.5)}}}}
   if(m.gap<=0&&((hot(m)&&Math.abs(m.row-PRf())<=1)||(d.touch&&!TUT.on&&m.row===PRf()))&&now>=m.next){/* v3.2: only monsters next to you hit you: an angry one from your row or the rows beside it, a wandering one only by bumping into you in your row */m.next=now+d.iv+R(-200,200);ch=true;
    if(!darkOn()){if(Math.random()<Math.min(.95,Math.max(.5,.95-avoid()/100))){const dv=m.dis>now?(m.disv|0):0,x=Math.max(1,Math.round((R(d.atk[0],d.atk[1])-dv)*(1-defRed())));P.hp-=guardTake(x);log('The '+d.n+' hits you for '+x+'.','bad','combat')}else log('The '+d.n+' misses.','','combat')}
    if(P.hp<=0){die();break}}}
  if(ch)render()}
function onKill(){const d=window._dead;fld=fld.filter(m=>m!==d);
  if(fld.length){enc=nearMob(d);return}
  fld=[];if(autoSeek)beginSeek(true)}
function killMob(m){const keep=enc;enc=m;win();if(keep&&keep!==m&&fld.includes(keep))enc=keep}
/* In-reach monsters (any row), closest slot first, then nearest row to your target. */
function targetsFor(reach,n){const r=enc?enc.row:PRf();return fld.filter(m=>m.gap<=reach).sort((a,b)=>a.gap-b.gap||Math.abs(a.row-r)-Math.abs(b.row-r)).slice(0,n)}
/* Multi-target attack: hits up to `max` monsters in reach (each skill sets its own limit), nearest rows to your target first. */
const SB_MOBS=6,SB_EXTRA=1;/* Slash Blast sweeps the area in front of you: one column further than your normal attack *//* Slash Blast hits at most 6 monsters, whatever your level (v62). The level-based line count has nothing to do with this. */
function multiAttack(name,pct,hpc,mpc,max){if(!enc||!isWar())return false;const now=Date.now();
 if(now<atkReady()||now-lastMv<moveCd())return false;
 if(!swordOn()){log('You need a warrior weapon (sword, axe, blunt weapon, spear or polearm) to use '+name+'.','bad','combat');render();return false}
 const ts=targetsFor(wReach()+SB_EXTRA,max||SB_MOBS);
 if(!ts.length){log('No enemy is in reach.','','combat');render();return false}
 if(P.mp<mpc){log('You don\'t have enough MP for that.','bad','combat');render();return false}
 if(P.hp<=hpc){log('You don\'t have enough HP for that.','bad','combat');render();return false}
 P.mp-=mpc;P.hp-=hpc;lastAtk=now;
 for(const m of ts){const d=MON[m.k],ch=Math.min(1,Math.max(.35,.8+(acc()-d.av)/50));
  if(Math.random()>ch)log(name+' misses the '+d.n+'.','','combat');
  else{const r=dmgRange(),x=Math.max(1,Math.floor(R(r[0],r[1])*pct/100));m.hp-=x;log(name+' hits the '+d.n+' for '+x+'.','hit','combat')}}
 for(const m of ts)if(m.hp<=0&&fld.includes(m))killMob(m);
 render();return true}
skSlash=function(){const n=sl('slashblast');if(n)multiAttack('Slash Blast',sbPct(n),ARR.sbHp[n-1],ARR.sbMp[n-1],SB_MOBS)};
SKW.slashblast.fx=n=>'HP -'+ARR.sbHp[n-1]+'; MP -'+ARR.sbMp[n-1]+', damage '+sbPct(n)+'%, hits up to '+SB_MOBS+' enemies';
{const _qi=qsInfo;qsInfo=function(k,now){if(k==='slashblast'){const t=v=>(v/1000).toFixed(1)+'s',n=sl(k)||1,mp=ARR.sbMp[n-1],hp=ARR.sbHp[n-1],cs=hp+' HP · '+mp+' MP',l=Math.max(atkReady(),lastMv+moveCd())-now,far=!!enc&&!fld.some(m=>m&&m.gap<=wReach()+SB_EXTRA);
  return{ic:SKL[k][0],nm:SKL[k][1],sub:!enc?cs:!swordOn()?'Warrior weapon':far?'Too far':l>0?t(l):cs,dis:!enc||!swordOn()||far||l>0||P.mp<mp||P.hp<=hp}}return _qi(k,now)}}
/* Fleeing: you must have been idle for 3s and nobody can be standing in your row. */
flee=function(){if(!enc)return;const now=Date.now(),idle=now-Math.max(lastAtk,lastMv,lastPot);
  if(idle<3000){log('You can\'t slip away yet. Hold still for '+Math.ceil((3000-idle)/1000)+'s.','bad','combat');return render()}
  if(fld.some(m=>m.row===PRf())){log('A monster is in your row. You can\'t slip away.','bad','combat');return render()}
  if(Math.random()<.7){fld=[];enc=null;autoSeek=false;seeking=false;log('You slip away safely.','','combat')}else log('You couldn\'t get away!','bad','combat');render()};
/* Advance and Back step move you, so every monster's distance changes. */
stand=function(dir){if(!enc)return;const now=Date.now(),mc=moveCd();if(now-lastAtk<mc||now-lastMv<mc)return;const ms=fld.filter(Boolean);
 if(dir<0){if(!ms.some(m=>m.gap>0))return;lastMv=now;ms.forEach(m=>{if(m.gap>0){m.gap--;if(m.gap<=0)m.next=now+MON[m.k].iv}});log('You advance.','','combat')}
 else{if(!ms.some(m=>m.gap<MAXGAP))return;lastMv=now;if(Math.random()<Math.min(.9,Math.max(.25,.5+(speed()-100)/100))){ms.forEach(m=>{if(m.gap<MAXGAP){m.gap++;m.mv=now+mc*2+mvT(MON[m.k])}});lastMv=now-Math.floor(mc/2);log('You back away.','','combat')}else log('You stumble and fail to back away.','bad','combat')}
 render()};
laneHtml=function(){const LH=Math.max(20,Math.min(30,Math.floor(210/NRf())));let h='<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;min-height:'+(NRf()*(LH+3)-3)+'px">';
  for(let r=0;r<NRf();r++){const ms=fld.filter(m=>m.row===r),on=!!enc&&enc.row===r;let c='';
   for(let i=0;i<COLS;i++){const cell=i?ms.filter(m=>m.gap+1===i):[];
    c+='<div style="flex:1;display:flex;justify-content:center;align-items:center;font-size:'+(cell.length>2?12:Math.min(18,LH-6))+'px;line-height:'+(LH-2)+'px;border-left:'+(i?'1px dashed #b9c4d6':'0')+'">'+(i===0&&r===PRf()?'🧍':'')+cell.map(m=>'<span style="position:relative;display:inline-block;'+'">'+MON[m.k].i+'<span style="position:absolute;left:8%;right:8%;bottom:0;height:3px;background:#4a463c;border-radius:2px"><i style="display:block;height:100%;width:'+Math.max(0,m.hp/m.max*100)+'%;background:#d9534f;border-radius:2px"></i></span></span>').join('')+'</div>'}
   h+='<div class="lrow" style="display:flex;background:rgba(120,140,180,.12);border-radius:6px;min-height:'+LH+'px">'+c+'</div>'}
  return h+'</div>'};
app.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-row]');if(!b||!enc)return;const ms=fld.filter(m=>m.row===+b.dataset.row).sort((x,y)=>x.gap-y.gap);if(ms.length&&ms[0]!==enc&&!ms.includes(enc)){enc=ms[0];render()}else if(ms.length>1&&ms.includes(enc)){enc=ms[(ms.indexOf(enc)+1)%ms.length];render()}});

/* ===== Website home page: logo, account, news, events, server stats, Play Now ===== */
(function(){
/* Edit these two lists to change the News and Events panels. */
/* News and Events are managed by admins in the website Admin panel (49-v2.4-site-admin.js). */
const NEWS=[],EVENTS=[];
const $=id=>document.getElementById(id),esc=t=>String(t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const user=()=>{const u=lsGet('mapleish_sess'),a=AC()[u];return u&&a&&a.ok?u:null};
function list(id,a){const ic={Update:'🛠️',Notice:'📣',Ongoing:'🎁',Soon:'⏳'};$(id).innerHTML=a.map(x=>'<div class="ws-item"><div class="ws-ic">'+(ic[x[0]]||'⭐')+'</div><div><b><span class="ws-tagc'+(x[0]==='Ongoing'?' e':x[0]==='Soon'?' s':'')+'">'+esc(x[0])+'</span>'+esc(x[1])+'</b><p>'+esc(x[2])+'</p></div></div>').join('')}
function stats(){let ch=0,hi=0,kills=0;for(let i=0;i<6;i++){const c=slotData(i);if(c){ch++;hi=Math.max(hi,c.lvl|0);kills+=c.kills|0}}
 const r=(e,a,b,w)=>'<div class="ws-st'+(w?' w':'')+'"><em>'+e+'</em><b>'+b+'</b>'+a+'</div>';
 $('ws-stats').innerHTML='<div class="ws-grid">'+r('🟢','Status','<span class="ws-dot"></span>Online',1)+r('🌍','World','Normal')+r('📜','Version','v62')+r('👥','Accounts',Object.keys(AC()).length)+r('🧙','Characters',ch+' / 6')+r('⭐','Highest level',hi||'-')+r('👾','Defeated',kills.toLocaleString())+'</div><div class="ws-note">Numbers come from this browser. A real server would show global totals.</div>'}
function site(){const u=user();{const na=$('ws-navacct');if(na)na.style.display=u?'':'none'}if(!u&&$('ws-acctview').style.display!=='none'&&window.__wsBack)window.__wsBack();
 $('ws-acct').innerHTML=u?'<span>👤 <b>'+esc(u)+'</b></span>':'<button class="ws-b" id="ws-in">Log in</button><button class="ws-b p" id="ws-reg">Create account</button>';
 $('ws-sub').innerHTML=u?'Logged in as <b>'+esc(u)+'</b>. Jump back in.':'You will be asked to log in first. <a id="ws-sub-reg">New here? Create an account</a>';
 const b=(i,f)=>{const e=$(i);if(e)e.onclick=f};
 b('ws-ch',()=>window.__wsAcct&&window.__wsAcct());b('ws-out',()=>{lsDel('mapleish_sess');curUser='';site()});b('ws-in',()=>open('login'));b('ws-reg',()=>open('register'));b('ws-sub-reg',()=>open('register'));
 stats()}
function open(w){window.__wsFrom=w==='play'?'play':'site';const u=user(),a=document.getElementById('app');$('site').style.display='none';a.style.display='';window.scrollTo(0,0);
 if(u){curUser=u;const l=lastChar();cs=l?l.k:0;wsel=0;scr='chars'}else{curUser='';scr=w==='register'?'register':'title'}
 render()}
function home(){document.getElementById('app').style.display='none';$('site').style.display='';if(window.__wsBack)window.__wsBack();site();window.scrollTo(0,0)}
window.__wsSite=site;window.__wsOpen=open;window.__wsHome=home;$('ws-play').onclick=()=>open('play');
list('ws-news',NEWS);list('ws-events',EVENTS);site();setTimeout(()=>{if($('site').style.display!=='none')site()},500);
})();

/* ===== Website Account page: overview, characters, security, settings ===== */
(function(){
const $=id=>document.getElementById(id),esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const user=()=>{const u=lsGet('mapleish_sess'),a=AC()[u];return u&&a&&a.ok?u:null};
const PF=()=>{try{return Object.assign({anim:true,leaves:true},JSON.parse(lsGet('mapleish_prefs')))}catch(e){return{anim:true,leaves:true}}};
const applyPf=()=>{const p=PF(),st=$('site');st.classList.toggle('ws-noanim',!p.anim);st.classList.toggle('ws-noleaf',!p.leaves)};
const JOB={swordsman:'Warrior',archer:'Archer',rogue:'Rogue',magician:'Magician',pirate:'Pirate'};
let tab='overview',armDel=-1;
const slots=()=>Array.from({length:6},(_,i)=>slotData(i));
const refresh=()=>{window.__wsSite&&window.__wsSite()};
function msg(id,t,ok){const e=$(id);if(e){e.textContent=t;e.className='ws-m '+(ok?'ok':'bad')}}
function show(){const u=user(),v=$('ws-acctview');if(!u){back();return}document.getElementById('top').style.display='none';v.style.display='';window.scrollTo(0,0);
 document.querySelectorAll('.ws-nav a').forEach(a=>a.classList.toggle('on',a.id==='ws-navacct'));
 if(!u){v.innerHTML='<div class="ws-av"><div class="ws-card" style="max-width:520px;margin:0 auto;text-align:center"><h2>👤 Account</h2><p style="font:15px Georgia,serif;margin:14px 0">Log in to manage your account, characters and settings.</p><button class="ws-b p" id="ac-in">Log in</button> <button class="ws-b" id="ac-reg">Create account</button></div></div>';
  $('ac-in').onclick=()=>window.__wsOpen('login');$('ac-reg').onclick=()=>window.__wsOpen('register');return}
 const T=[['overview','🏠 Overview'],['chars','🧙 Characters'],['sec','🔒 Security'],['set','⚙️ Settings']];
 v.innerHTML='<div class="ws-av"><div class="ws-tabs">'+T.map(t=>'<button class="ws-tab'+(tab===t[0]?' on':'')+'" data-t="'+t[0]+'">'+t[1]+'</button>').join('')+'</div><div class="ws-card" id="ac-body"></div></div>';
 v.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;armDel=-1;show()});body(u)}
function body(u){const A=AC()[u],S=slots(),n=S.filter(Boolean).length,hi=Math.max(0,...S.filter(Boolean).map(c=>c.lvl|0)),B=$('ac-body');
 if(tab==='overview'){B.innerHTML='<div class="ws-h3">Account</div><div class="ws-row"><span>Account ID</span><b>'+esc(u)+'</b></div><div class="ws-row"><span>Email</span><b>'+esc(A.email)+'</b></div><div class="ws-row"><span>Status</span><b>✅ Confirmed</b></div><div class="ws-row"><span>Characters</span><b>'+n+' / 6</b></div><div class="ws-row"><span>Highest level</span><b>'+(hi||'-')+'</b></div><div style="margin-top:14px"><button class="ws-b p" id="ac-play">▶ Play now</button> <button class="ws-b" id="ac-out">Log out</button></div>';
  $('ac-play').onclick=()=>window.__wsOpen('play');$('ac-out').onclick=out}
 else if(tab==='chars'){B.innerHTML='<div class="ws-h3">Your 6 character slots</div><div class="ws-slots">'+S.map((c,i)=>c?'<div class="ws-sl f"><div class="a">🧙</div><b>'+esc(c.name)+'</b><small>Lv '+c.lvl+' '+(JOB[c.job]||'Beginner')+'<br>'+esc((MAPS[c.map]||{n:'Mushroom Town'}).n)+'</small><button class="ws-b p" data-p="'+i+'">Play</button><button class="ws-b d" data-d="'+i+'">'+(armDel===i?'Click again':'Delete')+'</button></div>':'<div class="ws-sl"><div class="a" style="opacity:.4">＋</div><b>Empty</b><small>Slot '+(i+1)+'</small><button class="ws-b" data-p="'+i+'">Create</button></div>').join('')+'</div><div class="ws-note" style="font:12px Georgia,serif;color:#6b7f9e;margin-top:12px">Characters are saved in this browser for now.</div>';
  B.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{window.__wsOpen('play');cs=+b.dataset.p;render()});
  B.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const i=+b.dataset.d;if(armDel!==i){armDel=i;return show()}lsDel('mapleish_c'+i);if(lsGet('mapleish_last')===String(i))lsDel('mapleish_last');armDel=-1;refresh();show()})}
 else if(tab==='sec'){B.innerHTML='<div class="ws-h3">Change password</div><div class="ws-f"><label>Current password<input id="ac-cp" type="password" autocomplete="current-password"></label><label>New password<input id="ac-np" type="password" autocomplete="new-password" placeholder="At least 8 characters"></label><label>Confirm new password<input id="ac-np2" type="password" autocomplete="new-password"></label><button class="ws-b p" id="ac-pw">Update password</button><div class="ws-m" id="ac-pwm"></div></div><div class="ws-h3">Change email</div><div class="ws-f"><label>New email<input id="ac-em" type="email" value="'+esc(A.email)+'"></label><button class="ws-b p" id="ac-emb">Update email</button><div class="ws-m" id="ac-emm"></div></div><div class="ws-h3">Delete account</div><div class="ws-f"><label>Type your ID ('+esc(u)+') to confirm<input id="ac-dl"></label><button class="ws-b d" id="ac-del">Delete account</button><div class="ws-m" id="ac-dlm">Your characters stay in this browser. Only the login is removed.</div></div>';
  $('ac-pw').onclick=async()=>{const a=AC(),X=a[u],c=$('ac-cp').value,p1=$('ac-np').value;if(await sha(u+':'+c)!==X.h)return msg('ac-pwm','Current password is wrong.');if(p1.length<8)return msg('ac-pwm','New password must be at least 8 characters.');if(p1!==$('ac-np2').value)return msg('ac-pwm','Passwords do not match.');X.h=await sha(u+':'+p1);saveAC(a);lsDel('mapleish_spw');lsDel('mapleish_spwu');['ac-cp','ac-np','ac-np2'].forEach(i=>$(i).value='');msg('ac-pwm','Password updated. Saved password cleared.',1)};
  $('ac-emb').onclick=()=>{const e=$('ac-em').value.trim().toLowerCase(),a=AC();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))return msg('ac-emm','Enter a valid email address.');if(Object.keys(a).some(k=>k!==u&&a[k].email===e))return msg('ac-emm','That email is already registered.');a[u].email=e;saveAC(a);msg('ac-emm','Email updated.',1)};
  $('ac-del').onclick=()=>{if($('ac-dl').value.trim()!==u)return msg('ac-dlm','Type your ID exactly to confirm.');const a=AC();delete a[u];saveAC(a);if(lsGet('mapleish_id')===u)lsDel('mapleish_id');if(lsGet('mapleish_spwu')===u){lsDel('mapleish_spw');lsDel('mapleish_spwu')}out()}}
 else{const p=PF(),sw=(k,t,d)=>'<div class="ws-row"><span>'+t+'<small>'+d+'</small></span><button class="ws-sw'+(p[k]?' on':'')+'" data-k="'+k+'"></button></div>';
  B.innerHTML='<div class="ws-h3">Website</div>'+sw('anim','Animations','Clouds, monsters, sparkles and the Play button pulse.')+sw('leaves','Falling leaves','Maple leaves drifting down the page.')+'<div class="ws-h3">Login</div><div class="ws-row"><span>Remembered ID<small>'+(lsGet('mapleish_id')?'Filled in on the login screen: '+esc(lsGet('mapleish_id')):'Nothing saved.')+'</small></span><button class="ws-b" id="ac-fid">Forget</button></div><div class="ws-row"><span>Saved password<small>'+(lsGet('mapleish_spw')?'Saved in this browser.':'Nothing saved.')+'</small></span><button class="ws-b" id="ac-fpw">Forget</button></div>';
  B.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const q=PF();q[b.dataset.k]=!q[b.dataset.k];lsSet('mapleish_prefs',JSON.stringify(q));applyPf();show()});
  $('ac-fid').onclick=()=>{lsDel('mapleish_id');show()};$('ac-fpw').onclick=()=>{lsDel('mapleish_spw');lsDel('mapleish_spwu');show()}}}
function out(){lsDel('mapleish_sess');curUser='';back()}
function back(){$('ws-acctview').style.display='none';document.getElementById('top').style.display='';document.querySelectorAll('.ws-nav a').forEach(a=>a.classList.remove('on'));refresh()}
window.__wsAcct=show;$("ws-logo").onclick=()=>{back();window.scrollTo(0,0)};$("ws-logo").onkeydown=e=>{if(e.key==="Enter")$("ws-logo").click()};
document.querySelectorAll('.ws-nav a').forEach(a=>a.addEventListener('click',e=>{if(a.id==='ws-navacct'){e.preventDefault();show()}else{const was=$('ws-acctview').style.display!=='none';back();if(was){e.preventDefault();const t=document.querySelector(a.getAttribute('href'));setTimeout(()=>t&&t.scrollIntoView(),30)}}}));
window.__wsBack=back;
applyPf()})();

/* The temporary Warrior Guide NPC (v1.x testing helper) was removed in v2.7: classes are only chosen at the job instructors, and only an admin can change one. */


/* ===== v1.4: Additional stats dropdown and "?" help on every stat ===== */
let statHelp=null,xsOpen=false;
const SH={
 str:['STR','Strength. The main stat for Warriors.','Damage (most melee weapons), gear requirements.','Your base points, points you add, and gear bonuses.'],
 dex:['DEX','Dexterity. The main stat for Archers.','Accuracy (x1.2), Avoidability (1 per 6), and damage: it is the second damage stat for most weapons and the main one for bows and crossbows.','Your base points, points you add, and gear bonuses.'],
 int:['INT','Intelligence. The main stat for Magicians.','Magician skills and gear requirements.','Your base points, points you add, and gear bonuses.'],
 luk:['LUK','Luck. The main stat for Rogues.','Avoidability (1 per 3), Accuracy (x0.6), and damage for claws and Rogue daggers.','Your base points, points you add, and gear bonuses.'],
 dmg:['DAMAGE','The lowest and highest damage of a basic attack. The lowest is 60% of the highest.','How fast monsters fall.','Max = (STR x weapon multiplier + DEX) x weapon attack / 100. Bows use DEX as the main stat, claws use LUK. Weapon and scrolls matter too.'],
 watk:['WEAPON ATT.','The attack power printed on your weapon, including scrolls.','Damage.','Your equipped weapon and its scrolls. Weapons your class cannot use do not count.'],
 cyc:['ATTACK CYCLE','Milliseconds between basic attacks. Lower is faster.','How many hits you land per second.','Your weapon type.'],
 reach:['REACH','How many slots away you can hit. 0 means the monster must be right next to you.','Which monsters your attacks and skills can touch.','Your weapon type, plus some skills.'],
 acc:['ACCURACY','Your chance to hit. It is compared with the monster\'s avoidability and the result is clamped between 35% and 100%.','Hit chance.','(DEX x 1.2 + Level x 2 + LUK x 0.6 + bonuses) / 2.5 + 5.'],
 avoid:['AVOIDABILITY','Your chance to make monsters miss. Monsters always hit you between 50% and 95% of the time.','Damage you take.','LUK / 3 + DEX / 6 + 5 + bonuses.'],
 speed:['SPEED','How quickly you can step. 100% is normal, 140% is the cap.','Advance and Back step cooldowns, and your chance to back away.','Nimble Feet and similar buffs.'],
 wdef:['WEAPON DEF.','Defense from your worn armor and buffs such as Iron Body.','Damage taken from monsters. Damage is reduced by DEF / (DEF + 80), up to 70%.','Armor you can use, scrolls, and buffs.'],
 mdef:['MAGIC DEF.','Magic defense from your gear.','Magic damage taken.','Armor and accessories you can use, and scrolls.'],
 mhp:['MAX HP','The most health you can have.','How much damage you can take.','Level ups, skills like Improving Max HP, and gear.'],
 mmp:['MAX MP','The most mana you can have.','How many skills you can cast.','Level ups, class skills, and gear.'],
 crit:['CRITICAL RATE','Chance of a Critical Shot with a bow or crossbow.','Occasional bonus damage.','The Critical Shot skill.'],
 guild:['GUILD','The guild you belong to.','Guild chat and the guild list in the Social tab.','Creating or joining a guild.']};
function helpBox(k){if(statHelp!==k||!SH[k])return '';const h=SH[k];return '<div style="padding:6px 10px;background:#fff8dc;border:1px solid #e6d28a;border-radius:6px;margin:2px 8px 6px;font-size:12px;line-height:1.35"><b>'+h[0]+'</b><br>'+h[1]+'<br><b>Affects:</b> '+h[2]+'<br><b>Comes from:</b> '+h[3]+'</div>'}
function extraRows(){const r=dmgRange(),w=W(),L=(c,t)=>'<span class="lab '+c+'">'+t+'</span>',V=x=>'<span class="val">'+x+'</span>';
 const rw=(k,c,t,x)=>'<div class="srow">'+L(c,t)+V(x)+'<button class="qm" data-hp="'+k+'" aria-label="What is '+t+'?">?</button></div>'+helpBox(k);
 let h=rw('dmg','bl','DAMAGE',r[0]+' ~ '+r[1])+rw('watk','bl','WEAPON ATT.',w.watk)+rw('cyc','bl','ATTACK CYCLE',w.spd+' ms')+rw('reach','bl','REACH',wReach())
  +rw('acc','gr','ACCURACY',acc().toFixed(1))+rw('avoid','gr','AVOIDABILITY',avoid())+rw('speed','gr','SPEED',speed()+'%')
  +rw('wdef','bl','WEAPON DEF.',defTotal()+(defTotal()?' <small>('+Math.round(defRed()*100)+'% less damage)</small>':''))+rw('mdef','bl','MAGIC DEF.',mdefTotal())
  +rw('mhp','pk','MAX HP',P.maxHp)+rw('mmp','pk','MAX MP',P.maxMp);
 if(isArc()&&w.rng&&sl('crit')){const n=sl('crit');h+=rw('crit','gr','CRITICAL RATE',(n<=10?10+2*n:20+n)+'%')}
 return h+rw('guild','pk','GUILD',P.guild?esc2(P.guild.name):'-')}
function extraStats(){return '<button data-xs="1" style="width:calc(100% - 16px);margin:8px;display:flex;justify-content:space-between;align-items:center;padding:8px 12px"><span>Additional stats</span><span>'+(xsOpen?'▾':'▸')+'</span></button>'+(xsOpen?extraRows():'')}
document.addEventListener('click',e=>{const h=e.target.closest&&e.target.closest('[data-hp]');if(h&&P){const k=h.dataset.hp;statHelp=statHelp===k?null:k;return render()}
 const x=e.target.closest&&e.target.closest('[data-xs]');if(x&&P){xsOpen=!xsOpen;render()}});

/* ===== v1.3: Social tab (party, friends, guild, chat, private messages), real and local ===== */
for(let i=FEAT.length-1;i>=0;i--)if(['party','chat','guild','friends'].includes(FEAT[i][0]))FEAT.splice(i,1);
const soOpen={party:true,friends:false,guild:false,chat:true,dm:false};
let soDraft={},chatCh='all',soMsg='',dmWith='';
const esc2=t=>String(t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
function known(name){const q=String(name||'').trim().toLowerCase();if(!q||!P)return null;
 if(KICHI.n.toLowerCase()===q)return{n:KICHI.n,lvl:KICHI.lvl,job:'Beginner',map:KICHI.map,online:true,bot:true};
 for(let i=0;i<6;i++){const d=slotData(i);if(d&&d.name&&d.name.toLowerCase()===q&&d.name!==P.name)return{n:d.name,lvl:d.lvl||1,job:jn(d.job),map:d.map,online:false}}return null}
const dot=on=>'<span class="dot'+(on?'':' off')+'" style="display:inline-block;vertical-align:middle"></span>';
const CHATK='mapleish_chat',INBOX=n=>'mapleish_inbox_'+String(n).toLowerCase();
const jget=(k,d)=>{try{return JSON.parse(LS.getItem(k))||d}catch(e){return d}};
function chatPost(ch,txt){const a=jget(CHATK,[]);a.push({t:Date.now(),f:P.name,ch,map:P.map,gd:P.guild?P.guild.name:null,x:txt.slice(0,120)});while(a.length>100)a.shift();try{LS.setItem(CHATK,JSON.stringify(a))}catch(e){}}
const chatSeen=m=>m.ch==='world'||(m.ch==='map'&&m.map===P.map)||(m.ch==='party'&&(m.f===P.name||(P.party||[]).includes(m.f)))||(m.ch==='guild'&&P.guild&&m.gd===P.guild.name);
const CHC={world:['World','#d6577f'],map:['Map','#3d7a2a'],party:['Party','#2f6fb8'],guild:['Guild','#8a5ac2']};
function dmUnread(){return P&&P.dmu?Object.values(P.dmu).reduce((a,b)=>a+b,0):0}
function dmPoll(){if(!P)return;const a=jget(INBOX(P.name),[]);if(!a.length)return;try{LS.removeItem(INBOX(P.name))}catch(e){}
 P.dms=P.dms||{};P.dmu=P.dmu||{};a.forEach(m=>{(P.dms[m.f]=P.dms[m.f]||[]).push({me:0,x:m.x,t:m.t});if(!(tab==='social'&&dmWith===m.f))P.dmu[m.f]=(P.dmu[m.f]||0)+1;log('[Whisper] '+m.f+': '+m.x,'','self')});save();render()}
setInterval(dmPoll,1500);
window.addEventListener('storage',e=>{if(P&&tab==='social'&&!/^mapleish_(c\d|accts|sess)/.test(e.key||''))render()});
function socialPanel(){P.friends=P.friends||[];P.party=P.party||[];P.dms=P.dms||{};P.dmu=P.dmu||{};
 const val=id=>esc2(soDraft[id]||''),inp=(id,ph,act,btn)=>'<div style="display:flex;gap:6px;margin-top:8px"><input id="'+id+'" data-enter="'+act+'" placeholder="'+ph+'" value="'+val(id)+'" maxlength="24" style="flex:1;min-width:0"><button data-so="'+act+'">'+btn+'</button></div>';
 const blk=(id,title,meta,body)=>'<div class="panel win"><button data-so="tg:'+id+'" style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:0;box-shadow:none;border-width:0 0 2px 0"><span>'+title+'</span><span>'+meta+' &nbsp;'+(soOpen[id]?'▾':'▸')+'</span></button>'+(soOpen[id]?'<div class="pad">'+(soMsg&&soOpen[id]&&soMsg[0]===id?'<div style="color:#b0562f;font-size:12px;margin-bottom:6px">'+esc2(soMsg[1])+'</div>':'')+body+'</div>':'')+'</div>';
 const row=(n,sub,right)=>{const k=known(n);return '<div class="mrow"><span class="av">'+(n===P.name?'\u{1F9D1}':'\u{1F6E1}️')+'</span><div style="flex:1"><div>'+dot(k?k.online:n===P.name)+' '+esc2(n)+'</div><div class="mute">'+sub+'</div></div>'+(right||'')+'</div>'};
 const sub=n=>{const k=known(n);return k?'Lv '+k.lvl+' '+k.job+' · '+(k.online?(MAPS[k.map]?MAPS[k.map].n:'-'):'offline'):'unknown'};
 // party
 const pOn=P.party.filter(n=>(known(n)||{}).online).length+1;
 const party=row(P.name,'Lv '+P.lvl+' '+jobName()+' · Leader','<span class="pill">Leader</span>')+P.party.map(n=>row(n,sub(n),'<button data-so="pkick:'+n+'">Kick</button>')).join('')+(P.party.length?'<div style="margin-top:8px"><button data-so="pdis">Disband party</button></div>':'')+(P.party.length<5?inp('so_pinv','Invite by name','pinv','Invite'):'<div class="mute" style="margin-top:6px">Party is full (6).</div>');
 // friends
 const fOn=P.friends.filter(n=>(known(n)||{}).online).length;
 const friends=(P.friends.length?P.friends.map(n=>row(n,sub(n),'<button data-so="wh:'+n+'">Whisper</button><button data-so="frm:'+n+'">Remove</button>')).join(''):'<div class="mute">No friends yet.</div>')+inp('so_fr','Add friend by name','fadd','Add');
 // guild
 const g=P.guild;let guild;
 if(!g)guild='<div class="mute">You are not in a guild.</div>'+inp('so_gname','Guild name (2-12 letters)','gmake','Create');
 else{g.members=g.members||[];guild='<div><b>'+esc2(g.name)+'</b> <span class="mute">· '+(g.members.length+1)+'/30 members</span></div>'+(g.notice?'<div class="mute" style="margin:4px 0">Notice: '+esc2(g.notice)+'</div>':'')+row(P.name,'Master · Lv '+P.lvl,'')+g.members.map(n=>row(n,'Member · '+sub(n),'<button data-so="gkick:'+n+'">Kick</button>')).join('')+inp('so_ginv','Invite by name','ginv','Invite')+inp('so_gnote','Edit notice','gnote','Save')+'<div style="margin-top:8px"><button data-so="gdis">Disband guild</button></div>'}
 const gOn=g?1+(g.members||[]).filter(n=>(known(n)||{}).online).length:0;
 // chat
 const chips='<div class="chips">'+[['all','All'],['map','Map'],['party','Party'],['guild','Guild'],['world','World']].map(c=>'<button class="'+(chatCh===c[0]?'on':'')+'" data-so="cch:'+c[0]+'">'+c[1]+'</button>').join('')+'</div>';
 const msgs=jget(CHATK,[]).filter(m=>chatSeen(m)&&(chatCh==='all'||m.ch===chatCh)).slice(-30);
 const sendCh=chatCh==='all'?'map':chatCh;
 const chat=chips+'<div class="cbox" style="max-height:200px;overflow:auto">'+(msgs.length?msgs.map(m=>'<div><b style="color:'+CHC[m.ch][1]+'">['+CHC[m.ch][0]+']</b> '+esc2(m.f)+': '+esc2(m.x)+'</div>').join(''):'<div class="mute">No messages.</div>')+'</div><div class="mute" style="margin-top:6px">Sending to: '+CHC[sendCh][0]+'</div>'+'<div style="display:flex;gap:6px;margin-top:4px"><input id="so_chat" data-enter="csend" placeholder="Type a message" value="'+val('so_chat')+'" maxlength="120" style="flex:1;min-width:0"><button data-so="csend">Send</button></div>';
 // private messages
 const names=Object.keys(P.dms);
 const th=dmWith&&P.dms[dmWith]?P.dms[dmWith]:[];
 const dm=(names.length?'<div class="chips">'+names.map(n=>'<button class="'+(dmWith===n?'on':'')+'" data-so="dmo:'+n+'">'+esc2(n)+((P.dmu[n]||0)?' ('+P.dmu[n]+')':'')+'</button>').join('')+'</div>':'')+(dmWith?'<div class="cbox" style="max-height:180px;overflow:auto">'+(th.length?th.map(m=>'<div><b style="color:#b5651d">'+(m.me?'You':esc2(dmWith))+':</b> '+esc2(m.x)+'</div>').join(''):'<div class="mute">No messages with '+esc2(dmWith)+' yet.</div>')+'</div>':'<div class="mute">'+(names.length?'Pick a conversation or start a new one.':'No conversations.')+'</div>')
  +'<div style="display:flex;gap:6px;margin-top:8px"><input id="so_dmto" placeholder="To" value="'+esc2(soDraft.so_dmto!==undefined?soDraft.so_dmto:dmWith)+'" maxlength="24" style="width:34%;min-width:0"><input id="so_dmx" data-enter="dmsend" placeholder="Message" value="'+val('so_dmx')+'" maxlength="120" style="flex:1;min-width:0"><button data-so="dmsend">Send</button></div>';
 return '<div class="panel win"><div class="title">SOCIAL</div></div>'
  +blk('party','\u{1F465} Party',dot(true)+' '+pOn+'/'+(P.party.length+1)+' online',party)
  +blk('friends','\u{1F91D} Friends',dot(fOn>0)+' '+fOn+'/'+P.friends.length+' online',friends)
  +blk('guild','\u{1F3F0} Guild',g?dot(true)+' '+gOn+'/'+(g.members.length+1)+' online':'none',guild)
  +blk('chat','\u{1F4AC} Chat','',chat)
  +blk('dm','✉️ Private messages',dmUnread()?'<span class="pill">'+dmUnread()+' new</span>':'',dm)}
function soDo(a,arg){const v=id=>(((document.getElementById(id)||{}).value)||soDraft[id]||'').trim(),clr=id=>{delete soDraft[id]};
 P.friends=P.friends||[];P.party=P.party||[];P.dms=P.dms||{};P.dmu=P.dmu||{};soMsg='';
 const say=(b,t)=>{soMsg=[b,t]};
 if(a==='tg')soOpen[arg]=!soOpen[arg];
 else if(a==='pinv'){const k=known(v('so_pinv'));if(!k)say('party','No player with that name.');else if(P.party.includes(k.n))say('party',k.n+' is already in your party.');else if(P.party.length>=5)say('party','Your party is full.');else if(!k.online)say('party',k.n+' is offline.');else{P.party.push(k.n);log(k.n+' joined your party.','good','party');clr('so_pinv')}}
 else if(a==='pkick'){P.party=P.party.filter(n=>n!==arg);log(arg+' was removed from your party.','','party')}
 else if(a==='pdis'){P.party=[];log('Your party was disbanded.','','party')}
 else if(a==='fadd'){const k=known(v('so_fr'));if(!k)say('friends','No player with that name.');else if(P.friends.includes(k.n))say('friends',k.n+' is already your friend.');else{P.friends.push(k.n);log(k.n+' is now your friend.','good','self');clr('so_fr')}}
 else if(a==='frm'){P.friends=P.friends.filter(n=>n!==arg);log(arg+' was removed from your friends.','','self')}
 else if(a==='wh'){soOpen.dm=true;dmWith=arg;delete P.dmu[arg];delete soDraft.so_dmto}
 else if(a==='gmake'){const n=v('so_gname');if(!/^[A-Za-z]{2,12}$/.test(n))say('guild','Use 2 to 12 letters.');else{P.guild={name:n,master:P.name,members:[],notice:''};log('You founded the guild '+n+'.','good','guild');clr('so_gname')}}
 else if(a==='ginv'&&P.guild){const k=known(v('so_ginv'));if(!k)say('guild','No player with that name.');else if(P.guild.members.includes(k.n))say('guild',k.n+' is already a member.');else if(P.guild.members.length>=29)say('guild','The guild is full.');else if(!k.online)say('guild',k.n+' is offline.');else{P.guild.members.push(k.n);log(k.n+' joined '+P.guild.name+'.','good','guild');clr('so_ginv')}}
 else if(a==='gkick'&&P.guild){P.guild.members=P.guild.members.filter(n=>n!==arg);log(arg+' was removed from the guild.','','guild')}
 else if(a==='gnote'&&P.guild){P.guild.notice=v('so_gnote').slice(0,60);clr('so_gnote')}
 else if(a==='gdis'){log('You disbanded '+P.guild.name+'.','','guild');P.guild=null}
 else if(a==='cch')chatCh=arg;
 else if(a==='csend'){const t=v('so_chat'),ch=chatCh==='all'?'map':chatCh;if(t){if(ch==='party'&&!P.party.length)say('chat','You are not in a party.');else if(ch==='guild'&&!P.guild)say('chat','You are not in a guild.');else{chatPost(ch,t);clr('so_chat')}}}
 else if(a==='dmo'){dmWith=arg;delete P.dmu[arg];delete soDraft.so_dmto}
 else if(a==='dmsend'){const to=v('so_dmto')||dmWith,t=v('so_dmx');if(t){const k=known(to);if(!k)say('dm','No player named '+to+'.');else{(P.dms[k.n]=P.dms[k.n]||[]).push({me:1,x:t,t:Date.now()});dmWith=k.n;if(!k.bot){const a2=jget(INBOX(k.n),[]);a2.push({f:P.name,x:t,t:Date.now()});try{LS.setItem(INBOX(k.n),JSON.stringify(a2))}catch(e){}}clr('so_dmx');delete soDraft.so_dmto}}}
 save();render()}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-so]');if(!b||!P)return;const[a,...r]=b.dataset.so.split(':');soDo(a,r.join(':'))});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.dataset&&e.target.dataset.enter&&P){e.preventDefault();soDo(e.target.dataset.enter,'')}});
document.addEventListener('input',e=>{const t=e.target;if(t&&t.id&&/^so_/.test(t.id))soDraft[t.id]=t.value});
{const _r2=render;render=function(){const a=document.activeElement;let st=null;if(a&&a.id&&/^so_/.test(a.id)){st={id:a.id,s:a.selectionStart,e:a.selectionEnd}}
 const r=_r2.apply(this,arguments);if(st){const n=document.getElementById(st.id);if(n){n.focus();try{n.setSelectionRange(st.s,st.e)}catch(e){}}}return r}}

/* ===== v1.2: combat focus + scroll lock, auto-hunt without re-seeking, KichiAlpha, no fake players ===== */
/* --- the only other character: KichiAlpha, god mode, always hunting here. She is served monsters before anyone else on the map. --- */
const KICHI={n:'KichiAlpha',i:'\u{1F6E1}️',lvl:30,g:'-',job:'Beginner',st:[999,4,4,4],w:null,eq:{},map:'snail_hunting_ground_1',god:true};
const KCAP=8,KS={nextKill:0};
PLAYERS.length=0;PLAYERS.push(KICHI);
function kichiFill(){const now=Date.now(),a=mobSlots(KICHI.map);let held=a.filter(x=>x.by==='kichi'&&slotLive(x,now)).length;
 for(let i=0;i<a.length&&held<KCAP;i++){const x=a[i];if(slotLive(x,now)&&!x.by){x.by='kichi';held++}}}
function kichiTick(){const now=Date.now(),a=mobSlots(KICHI.map);
 if(now>=KS.nextKill){KS.nextKill=now+1300;const i=a.findIndex(x=>x.by==='kichi'&&slotLive(x,now));if(i>=0)killSlot(KICHI.map,i)}
 kichiFill()}
{const _c=claimSlot;claimSlot=function(id){if(id===KICHI.map)kichiFill();return _c(id)}}
releaseStale=function(){if(!P)return;const a=WORLD[P.map];if(!a)return;const mine=new Set(fld.map(m=>m.eid));if(enc)mine.add(enc.eid);a.forEach(x=>{if(x.by&&x.by!=='kichi'&&!mine.has(x.by))x.by=0})};
kichiFill();setInterval(kichiTick,400);
playersHere=()=>(P&&KICHI.map===P.map)?[KICHI]:[];
const availHere=()=>{const now=Date.now(),a=mobSlots(P.map);return a.filter(x=>slotLive(x,now)&&!x.by).length};
playersPanel=function(){const ps=playersHere();if(!ps.length){viewPlayer=null;return ''}
 if(viewPlayer&&!ps.some(p=>p.n===viewPlayer))viewPlayer=null;const v=ps.find(p=>p.n===viewPlayer);
 P.friends=P.friends||[];P.party=P.party||[];
 const act=v?'<div class="ex" style="margin:8px 0"><button data-sa="friend:'+v.n+'">'+(P.friends.includes(v.n)?'Remove friend':'Add friend')+'</button><button data-sa="party:'+v.n+'">'+(P.party.includes(v.n)?'Remove from party':'Add to party')+'</button>'+(P.guild?'<button data-sa="guild:'+v.n+'">Add to guild</button>':'')+'</div>':'';
 return '<div class="panel"><h2>Players Here</h2>'+(v?profileCard(v)+act:'')+'<div class="ex">'+ps.map(p=>'<button data-pl="'+p.n+'"'+(viewPlayer===p.n?' class="on"':'')+'><span class="dot" style="display:inline-block;vertical-align:middle"></span> '+p.i+' '+p.n+' <span class="mute">Lv '+p.lvl+(p.god?' · God mode':'')+'</span></button>').join('')+'</div></div>'};
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-sa]');if(!b||!P)return;const[a,n]=b.dataset.sa.split(':');P.friends=P.friends||[];P.party=P.party||[];
 if(a==='friend'){const i=P.friends.indexOf(n);if(i<0){P.friends.push(n);log(n+' is now your friend.','good','self')}else{P.friends.splice(i,1);log(n+' was removed from your friends.','','self')}}
 if(a==='party'){const i=P.party.indexOf(n);if(i<0){if(P.party.length>=5)log('Your party is full (6 members).','bad','party');else{P.party.push(n);log(n+' joined your party.','good','party')}}else{P.party.splice(i,1);log(n+' left your party.','','party')}}
 if(a==='guild'&&P.guild){P.guild.members=P.guild.members||[];if(!P.guild.members.includes(n)){P.guild.members.push(n);log(n+' joined '+P.guild.name+'.','good','guild')}}
 save();render()});
/* --- no more fake social content --- */
const jn=j=>({swordsman:'Swordsman',archer:'Archer',rogue:'Rogue',magician:'Magician',pirate:'Pirate'}[j]||'Beginner');
function rankList(){const L=[{n:KICHI.n,lvl:KICHI.lvl,x:0,job:'Beginner'}];
 for(let i=0;i<6;i++){const d=slotData(i);if(d&&d.name&&d.name!==P.name)L.push({n:d.name,lvl:d.lvl||1,x:d.exp||0,job:jn(d.job)})}
 L.push({n:P.name,lvl:P.lvl,x:P.exp||0,job:jobName(),me:1});return L.sort((a,b)=>b.lvl-a.lvl||b.x-a.x)}
{const _fb=featBody;featBody=function(id){const nm=P.name.replace(/[<>&]/g,'');P.friends=P.friends||[];P.party=P.party||[];
 switch(id){
  case 'party':return mr('\u{1F9D1}',nm+' (you)','Lv '+P.lvl+' '+jobName()+' · Leader','<span class="pill">Leader</span>')+P.party.map(n=>mr('\u{1F6E1}️',n,'Lv '+KICHI.lvl+' Beginner','<button data-sa="party:'+n+'">Remove</button>')).join('')+(P.party.length?'':pad('No other members yet.'));
  case 'friends':return P.friends.length?P.friends.map(n=>mr('\u{1F6E1}️',n,'Lv '+KICHI.lvl+' · '+MAPS[KICHI.map].n,'<span class="dot"></span><button data-sa="friend:'+n+'">Remove</button>')).join(''):pad('No friends yet.');
  case 'guild':return pad(P.guild?P.guild.name:'You are not in a guild.');
  case 'chat':return '<div class="cbox"></div>';
  case 'family':case 'mail':case 'market':return pad('Nothing here yet.');
  case 'rank':{const L=rankList();return (viewMe?profileCard(meCard()):'')+L.map((r,i)=>mr(r.me?'\u{1F9D1}':'\u{1F6E1}️',r.n+(r.me?' (you)':''),'Lv '+r.lvl+' · '+r.job,'<b>#'+(i+1)+'</b>')).join('')+'<div class="ex" style="margin:8px 10px"><button id="meview">'+(viewMe?'Hide':'See')+' how other players see you</button></div>'}
  case 'settings':return _fb(id).replace(/<div class="mrow"><span class="av">[^<]*<\/span><div style="flex:1"><div>Notifications<\/div><div class="mute">[^<]*<\/div><\/div><\/div>/,'')}
 return _fb(id)}}
/* --- combat session: header with HP/MP, exit progress, scroll lock --- */
let scrollLockPref=lsGet('mapleish_slock')!=='0';
const combatOn=()=>!!P&&!MAPS[P.map].town&&!!(enc||autoSeek||seeking);
function applyLock(){const on=!!P&&scr==='game'&&tab==='play'&&combatOn()&&scrollLockPref,h=document.documentElement,b=document.body;
 if(on){h.style.overflow='hidden';b.style.overflow='hidden';h.style.overscrollBehavior='none';const el=document.getElementById('cpanel');if(el){const y=el.getBoundingClientRect().top+window.scrollY-6;if(Math.abs(window.scrollY-y)>2)window.scrollTo(0,Math.max(0,y))}}
 else{h.style.overflow='';b.style.overflow='';h.style.overscrollBehavior=''}}
{const _r=render;render=function(){const r=_r.apply(this,arguments);try{applyLock()}catch(e){}return r}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="slk"]');if(!b)return;scrollLockPref=!scrollLockPref;lsSet('mapleish_slock',scrollLockPref?'1':'0');render()});
{const _bp=battlePanel;battlePanel=function(mode){if(mode==='idle'&&autoSeek)mode='wait';let h=_bp(mode==='wait'?'seek':mode);const m=MAPS[P.map];
  if(m.town)return h;
  if(mode==='wait'){const qb=quickBar(),sI=h.indexOf('<div class="stage">'),qI=h.indexOf(qb);if(sI>=0&&qI>sI)h=h.slice(0,sI)+'<div class="stage"><div class="mute" style="text-align:center">Waiting for monsters to spawn<span class="dots"></span></div>'+laneHtml()+'</div>'+h.slice(qI)}
  h=h.replace(/Monsters on this map: \d+\/\d+/,'Available to you: '+availHere()+' · On map: '+mapCount(P.map)[0]+'/'+mapCount(P.map)[1]);
  if(mode==='idle')return h;
  const need=needFor(m),clear=isOpen(P.map)?'':'<div style="font-size:12px;margin-top:4px">Defeat <b>'+need+'</b> monsters to open the way: <b>'+Math.min(P.kills,need)+'/'+need+'</b></div>',
   here=playersHere().length?'<div class="mute" style="font-size:11px">Also here: '+playersHere().map(x=>x.n).join(', ')+'</div>':'';
  const hd='<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><div style="flex:1;font-size:11px"><div style="display:flex;gap:6px;align-items:center"><span style="width:20px">HP</span><span style="flex:1">'+bar('var(--hp)',P.hp,P.maxHp)+'</span><span>'+P.hp+'/'+P.maxHp+'</span></div><div style="display:flex;gap:6px;align-items:center"><span style="width:20px">MP</span><span style="flex:1">'+bar('#3f7fd8',P.mp,P.maxMp)+'</span><span>'+P.mp+'/'+P.maxMp+'</span></div></div><button data-act="slk" id="slk" style="min-height:34px;padding:2px 10px;font-size:12px;white-space:nowrap" title="Stops the page from scrolling during combat">'+(scrollLockPref?'\u{1F512} Lock ON':'\u{1F513} Lock OFF')+'</button></div>'+clear+here;
  return h.replace('<div class="panel"><div class="stage">','<div class="panel" id="cpanel" style="scroll-margin-top:6px">'+hd+'<div class="stage">')}}
/* --- auto-hunt: no seeking screen. Monsters keep arriving as long as the map has any free. --- */
function autoTick(){if(!P||!autoSeek||enc||seeking)return;const m=MAPS[P.map];if(m.town||talk){autoSeek=false;return render()}
 if(seek())render()}
{const _bs=beginSeek;beginSeek=function(auto){if(auto){autoTick();return render()}return _bs(auto)}}
setInterval(autoTick,700);

/* ===== v1.5: Tutorial rewrite. Todd teaches combat with a guided practice fight. ===== */
MON.training_snail=Object.assign({},MON.snail,{n:'Training Snail',hp:30,exp:0,atk:[1,1],m:[0,0],lv:1});
NPCS.heena.tip=['Quests','A ! over someone\'s head means they need help. Talk to them and accept the quest. Your Quests tab lists what to do, and the star pins a quest to the Play tab so you can follow it. When the goal is done, talk to the person named in the quest to hand it in and take your reward.'];
NPCS.roger.tip=['Items','The Inventory tab sorts your things into Equip, Use, Etc and Cash. Tap an item to see what it does. Press Use on potions and food, or press Equip on weapons and armor. Put potions in your two potion slots so you can drink one with a single tap in the middle of a fight.'];
NPCS.maria.tip=['Travelling','Use the Map on the Play tab. In hunting fields the way forward opens once you defeat the number of monsters shown at the top of the combat panel. It closes again when you leave. Towns are always open.'];
delete NPCS.todd.tip;NPCS.todd.hi='Welcome, newcomer. I am Todd, and I teach hunting. Nobody leaves the island without knowing how to fight.';
const TUT={on:false,step:0,pots:0};
const TSTEP=[
 ['Tap <b>Advance</b> to step up to the snail.','adv'],
 ['Tap <b>Attack</b> in your quickslots until the snail is half dead. It fights back once it is hurt.','atk'],
 ['Tap <b>Back step</b> to move away from it.','bk'],
 ['Your HP is low. Tap your <b>Red Potion</b> slot to drink one.','pot'],
 ['Finish it off. <b>Advance</b> if it is too far, then <b>Attack</b>.','atk']];
function tutStart(){if(!P||enc)return;talk=null;autoSeek=false;seeking=false;clearTimeout(autoT);TUT.on=true;TUT.step=0;
 const now=Date.now();fld=[{k:'training_snail',hp:30,max:30,gap:2,row:PRf(),eid:++eidSeq,sm:null,si:undefined,ag:false,mv:now+1e9,next:now+2500}];enc=fld[0];
 log('Todd: Let us begin. I set up a Training Snail. It barely scratches.','','combat');render()}
function tutEnd(msg){TUT.on=false;fld=[];enc=null;if(msg)log(msg,'','combat');render()}
function tutCheck(){if(!TUT.on)return false;
 if(!enc||!fld.length){if(TUT.step<5){tutEnd('Training ended.');return true}return false}
 const m=enc;let adv=false;
 if(TUT.step===0&&m.gap<=0)adv=true;
 else if(TUT.step===1&&m.hp<=m.max*.5)adv=true;
 else if(TUT.step===2&&m.gap>=1)adv=true;
 else if(TUT.step===3&&(P.inv.red_potion|0)<TUT.pots)adv=true;
 else if(TUT.step===4)return false;
 if(adv){TUT.step++;
  if(TUT.step===3){if((P.inv.red_potion|0)<1)P.inv.red_potion=1;TUT.pots=P.inv.red_potion|0;if(!P.pq)P.pq=[null,null];if(P.pq[0]!=='red_potion'&&P.pq[1]!=='red_potion')P.pq[P.pq[0]?1:0]='red_potion';P.hp=Math.max(1,Math.min(P.hp,Math.floor(P.maxHp*.5)));log('Todd: Good. You will get hurt out there. Here is a Red Potion.','','combat')}
  return true}
 return false}
{const _w=win;win=function(){if(enc&&enc.k==='training_snail'){fld=[];enc=null;TUT.step=5;TUT.on=false;
  log('Todd: Well done! That is all there is to it. Out in the fields, more monsters will join the fight, so keep an eye on HP.','good','combat');
  if(!P.tutDone){P.tutDone=1;gain(20);log('Training complete. +'+XR(20)+' EXP.','good','combat')}save();return}return _w.apply(this,arguments)}}
{const _t=trickle;trickle=function(now){if(TUT.on)return false;return _t(now)}}
{const _d=die;die=function(){if(TUT.on){P.hp=Math.max(2,Math.floor(P.maxHp/2));tutEnd('Todd: Careful! That is enough for now.');return}return _d.apply(this,arguments)}}
{const _dl=dlg;dlg=function(){if(talk&&talk.npc==='todd'){const pg=talk.page;
  const PG={ct1:['Fighting works in <b>lanes</b>. Look at the combat board: you are the \u{1F9CD} at the left of the middle row, and monsters stand in the boxes to your right.','Next','ct2'],
   ct2:['The distance to a monster is the number of empty boxes between you. Your attack only works when the monster is <b>in reach</b>. Bare hands and swords have reach 0, so the monster must be right next to you. <b>Advance</b> steps toward monsters, <b>Back step</b> moves away, and <b>Flee</b> leaves the fight.','Next','ct3'],
   ct3:['<b>Aggressive</b> monsters walk up and strike on their own timer. <b>Passive</b> ones wait until you hurt them. Watch your HP bar at the top of the combat panel and drink a <b>Red Potion</b> when it runs low. If you want to hit a different monster, tap its row.','Next','ct4'],
   ct4:['Ready to try it? I will set up a harmless Training Snail and guide you through each step.','Start training','tut']};
  if(PG[pg]){const x=PG[pg];return{t:x[0],ch:[[x[1],x[2]==='tut'?'tut:go':'pg:'+x[2]],['Back',pg==='ct1'?'main':'pg:'+({ct2:'ct1',ct3:'ct2',ct4:'ct3'}[pg])]]}}
  const d=_dl();if(!pg||pg==='main'){d.ch.splice(d.ch.length-1,0,[P.tutDone?'Combat training (completed)':'Combat training','pg:ct1']);if(P.tutDone)d.t+='<br><br><span class="mute">You finished the combat training.</span>'}
  return d}
 return _dl()}}
{const _dd=dlgDo;dlgDo=function(k){if(k==='tut:go'){return tutStart()}if(k.startsWith('pg:')){talk.page=k.slice(3);return render()}return _dd(k)}}
{const _bp=battlePanel;battlePanel=function(mode){let h=_bp(mode);if(!TUT.on||!enc)return h;
  const st=TSTEP[Math.min(TUT.step,TSTEP.length-1)],coach='<div style="background:#fff3c4;border:2px solid #e8a317;border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:13px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>Training '+(TUT.step+1)+' of '+TSTEP.length+'</b><button data-tut="end" style="min-height:30px;padding:2px 10px;font-size:12px">End training</button></div><div style="margin-top:4px">'+st[0]+'</div></div>';
  h=h.replace(autoBox(),'').replace(/<div style="font-size:12px;margin-top:4px">Defeat [\s\S]*?<\/div>/,'').replace(/<div class="mute" style="margin-top:6px">Available to you:[^<]*<\/div>/,'');
  return h.replace(/(<div class="panel"[^>]*>)/,'$1'+coach)}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-tut]');if(b&&b.dataset.tut==='end'&&TUT.on)tutEnd('Todd: No problem. Come back any time.')});
{const _r=render;render=function(){let r=_r.apply(this,arguments);if(TUT.on&&tutCheck())r=_r.apply(this,arguments);
  try{document.querySelectorAll('.tutp').forEach(x=>x.classList.remove('tutp'));
   if(TUT.on&&enc){const t=TSTEP[Math.min(TUT.step,TSTEP.length-1)][1];let el=null;
    if(t==='adv')el=document.getElementById('adv');else if(t==='bk')el=document.getElementById('bk');else if(t==='pot')el=document.getElementById('pq'+(P.pq&&P.pq[0]==='red_potion'?0:1));
    else if(t==='atk'){const i=(P.qs||[]).indexOf('basic');el=document.querySelector('[data-qs="'+i+'"]')}
    if(el)el.classList.add('tutp')}}catch(e){}
  return r}}

/* ===== v1.6: Admin and Moderator menus ===== */
/* Roles live on the account: AC()[id].role is 'admin', 'mod' or missing (player). Built-in accounts: user (player), mod, admin. All use password 1234. */
(async()=>{if(!lsGet('mapleish_seed3')){const hs={mod:await sha('mod:1234'),admin:await sha('admin:1234'),user:await sha('user:1234')};await new Promise(r=>setTimeout(r,60));const ac=AC();for(const[id,role]of[['mod','mod'],['admin','admin']]){if(!ac[id])ac[id]={email:id+'@example.com',h:hs[id],ok:true,role}}if(!ac.user&&!lsGet('mapleish_seed2'))ac.user={email:'user@example.com',h:hs.user,ok:true};saveAC(ac);lsSet('mapleish_seed3','1')}})();
const myRole=()=>{const a=AC()[MYID()];return(a&&a.role)||'player'};
const isMod=()=>myRole()==='mod'||myRole()==='admin',isAdm=()=>myRole()==='admin';
const MODK='mapleish_mod',AUDK='mapleish_audit';
const modGet=()=>{const m=jget(MODK,{});m.mute=m.mute||{};m.ban=m.ban||{};return m},modSet=m=>{try{LS.setItem(MODK,JSON.stringify(m))}catch(e){}};
const muteLeft=n=>Math.max(0,(modGet().mute[n]||0)-Date.now()),isBanned=n=>!!modGet().ban[n];
function audit(t){const a=jget(AUDK,[]);a.push({t:Date.now(),by:MYID()+' ('+myRole()+')',a:t});while(a.length>60)a.shift();try{LS.setItem(AUDK,JSON.stringify(a))}catch(e){}}
function toast(t){const d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#26365a;color:#fff;padding:10px 16px;border-radius:10px;border:2px solid #fff;z-index:99999;font:13px Maplestory,Arial,sans-serif;max-width:90vw;text-align:center';document.body.appendChild(d);setTimeout(()=>d.remove(),4500)}
/* KichiAlpha can be kicked: she leaves for 2 minutes and releases her monsters */
const kichiAway=()=>Date.now()<(KS.away||0);
{const _kf=kichiFill;kichiFill=function(){if(kichiAway()){mobSlots(KICHI.map).forEach(x=>{if(x.by==='kichi')x.by=0});return}return _kf()}}
{const _kn=known;known=function(n){const r=_kn(n);if(r&&r.bot)r.online=!kichiAway();return r}}
playersHere=()=>(P&&KICHI.map===P.map&&!kichiAway())?[KICHI]:[];
/* menu tiles by role */
function syncFeat(){for(let i=FEAT.length-1;i>=0;i--)if(FEAT[i][0]==='admin'||FEAT[i][0]==='mod')FEAT.splice(i,1);
 if(isMod())FEAT.push(['mod','\u{1F528}','Moderation']);if(isAdm())FEAT.push(['admin','\u{1F6E0}️','Admin'])}
/* helpers */
function findItem(q){q=String(q||'').trim().toLowerCase();if(!q)return null;if(ITEMS[q])return q;const ids=Object.keys(ITEMS);return ids.find(k=>ITEMS[k].n.toLowerCase()===q)||ids.find(k=>ITEMS[k].n.toLowerCase().includes(q))||ids.find(k=>k.includes(q.replace(/\s+/g,'_')))||null}
function slotByName(n){n=String(n||'').trim().toLowerCase();for(let i=0;i<6;i++){const d=slotData(i);if(d&&d.name&&d.name.toLowerCase()===n)return[i,d]}return null}
function slotSave(i,d){try{LS.setItem('mapleish_c'+i,JSON.stringify(d))}catch(e){}}
const gmOpen={rates:true,hot:true,self:true,items:false,tp:false,world:false,roles:false,ban:false,audit:false,mmute:true,mkick:false,mlog:false};
let gmMsg='';
function gmEnd(){fld=[];enc=null;autoSeek=false;seeking=false;clearTimeout(autoT);talk=null;inShop=false;selNpc=null}
function gmPanel(role){
 const val=id=>esc2(soDraft[id]||''),inp=(id,ph,w)=>'<input id="'+id+'" placeholder="'+ph+'" value="'+val(id)+'" style="'+(w||'flex:1')+';min-width:0">',
  btn=(a,t)=>'<button data-gm="'+a+'">'+t+'</button>',
  sec=(id,title,body)=>'<div class="panel win"><button data-gm="tg:'+id+'" style="width:100%;display:flex;justify-content:space-between;padding:10px 12px;border-radius:0;box-shadow:none;border-width:0 0 2px 0"><span>'+title+'</span><span>'+(gmOpen[id]?'▾':'▸')+'</span></button>'+(gmOpen[id]?'<div class="pad">'+body+'</div>':'')+'</div>',
  row=(...c)=>'<div style="display:flex;gap:6px;margin-top:6px">'+c.join('')+'</div>';
 const mods=modGet(),now=Date.now();
 const note=gmMsg?'<div class="panel win"><div class="pad" style="color:#b0562f;font-size:13px">'+esc2(gmMsg)+'</div></div>':'';
 const players=[KICHI.n].concat([0,1,2,3,4,5].map(i=>slotData(i)).filter(d=>d&&d.name).map(d=>d.name)).filter((n,i,a)=>a.indexOf(n)===i);
 let h='<div class="panel win"><div class="pad mute">Signed in as <b>'+esc2(MYID())+'</b> ('+myRole()+')</div></div>'+note;
 if(role==='admin'){
  h+=sec('rates','World settings','<div class="mute" style="font-size:13px">Base rates for all players (1-1000). EXP: <b>x'+expBase()+'</b> &middot; Drop: <b>x'+dropBase()+'</b>'+(hotNow().length?' &middot; with hot-time now: EXP <b>x'+expRate()+'</b>, Drop <b>x'+dropRate()+'</b>':'')+'</div>'
   +row(inp('so_gm_rate','EXP rate 1-1000','flex:1'),btn('rate','Set'),btn('rate1','x1'))
   +row(inp('so_gm_drate','Drop rate 1-1000','flex:1'),btn('drate','Set'),btn('drate1','x1'))
   +'<div class="mute" style="font-size:13px;margin-top:10px">Scrolling notice (shown after the welcome, server time, rates and hot-times in the bar at the top of the game and website). Now: <b>'+(worldCfg().msg?esc2(worldCfg().msg):'none')+'</b></div>'
   +row(inp('so_gm_notice','Custom message (up to 150 letters)','flex:1'),btn('notice','Set'),btn('notice0','Clear')))
  +sec('hot','Hot-time ('+hotList().length+'/24)','<div class="mute" style="font-size:13px">Scheduled EXP and drop boosts. Times are California time. While one is running, its EXP and drop multipliers apply on top of the base rates (the biggest one wins if several overlap), and the top bar announces it.</div>'
   +hotList().map((x,i)=>{const st=hotState(x);return '<div class="mrow"><span class="av">'+(st.on?'🔥':x.on?'⏰':'💤')+'</span><div style="flex:1"><div><b>'+esc2(x.name)+'</b> &middot; EXP x'+clampR(x.exp)+', Drop x'+clampR(x.drop)+'</div><div class="mute">'+esc2(x.date)+' '+esc2(x.time)+' for '+(+x.hours)+' h, '+({none:'once',daily:'every day',weekly:'every week'}[x.repeat]||'once')+(st.on?' &middot; running now':'')+'</div></div><button data-gm="htog:'+i+'">'+(x.on?'Disable':'Enable')+'</button><button data-gm="hdel:'+i+'">Delete</button></div>'}).join('')
   +(hotList().length<24?row(inp('so_gm_hname','Name, e.g. Weekend Hot-time'))
    +row(inp('so_gm_hexp','EXP x (1-1000)','flex:1'),inp('so_gm_hdrop','Drop x (1-1000)','flex:1'))
    +row('<input id="so_gm_hdate" type="date" value="'+val('so_gm_hdate')+'" style="flex:1;min-width:0">','<input id="so_gm_htime" type="time" value="'+val('so_gm_htime')+'" style="flex:1;min-width:0">')
    +row(inp('so_gm_hhours','Hours','flex:1'),'<select id="so_gm_hrep" style="flex:1">'+[['none','Once'],['daily','Every day'],['weekly','Every week']].map(o=>'<option value="'+o[0]+'"'+((soDraft.so_gm_hrep||'none')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>',btn('hadd','Add')):'<div class="mute" style="margin-top:6px">24 hot-times is the limit. Delete one to add another.</div>'))
  +sec('self','Edit a character',
   row(inp('so_gm_target','Character name (blank = me)'))
   +row(inp('so_gm_lvl','Level (1-'+MAXL+')'),inp('so_gm_exp','EXP'))+row(inp('so_gm_str','STR'),inp('so_gm_dex','DEX'),inp('so_gm_int','INT'),inp('so_gm_luk','LUK'))
   +row(inp('so_gm_ap','Ability pts'),inp('so_gm_sp','Skill pts'),inp('so_gm_mesos','Mesos'))+row(inp('so_gm_hp','Max HP'),inp('so_gm_mp','Max MP'))
   +row('<select id="so_gm_job" style="flex:1"><option value="">Class (keep)</option>'+[['','Beginner'],['swordsman','Swordsman'],['archer','Archer'],['rogue','Rogue'],['magician','Magician'],['pirate','Pirate']].map(j=>'<option value="'+(j[0]||'none')+'">'+j[1]+'</option>').join('')+'</select>',btn('apply','Apply'))
   +row(btn('heal','Full heal'),btn('revive','Revive'),btn('clearmap','Open this map\'s exits')))
  +sec('items','Grant items',
   row(inp('so_gm_item','Item name or id'),btn('find','Find'))+'<div id="gm_found" style="margin-top:6px">'+(gmFound||'')+'</div>'
   +row(inp('so_gm_qty','Quantity','width:30%'),inp('so_gm_to','Give to (blank = me)'),btn('give','Give')))
  +sec('tp','Teleport',
   row('<select id="so_gm_map" style="flex:1">'+Object.keys(MAPS).sort((a,b)=>MAPS[a].n.localeCompare(MAPS[b].n)).map(k=>'<option value="'+k+'"'+((soDraft.so_gm_map||P.map)===k?' selected':'')+'>'+esc2(MAPS[k].n)+'</option>').join('')+'</select>',btn('tpmap','Go'))
   +row(inp('so_gm_tpp','Player name'),btn('tpplayer','Go to player')))
  +sec('world','World tools',
   row(btn('refill','Refill this map\'s monsters'),btn('killall','Defeat all monsters here'))
   +row(btn('kichiback','Bring KichiAlpha back'))
   +row(inp('so_gm_say','Server announcement'),btn('say','Broadcast')))
  +sec('roles','Account roles',
   Object.keys(AC()).map(id=>'<div class="mrow"><span class="av">\u{1F464}</span><div style="flex:1"><div>'+esc2(id)+'</div><div class="mute">'+((AC()[id].role)||'player')+'</div></div><select data-gmrole="'+esc2(id)+'">'+['player','mod','admin'].map(r=>'<option value="'+r+'"'+(((AC()[id].role)||'player')===r?' selected':'')+'>'+r+'</option>').join('')+'</select></div>').join(''))
  +sec('ban','Bans',
   row(inp('so_gm_ban','Character name'),btn('ban','Ban'))
   +(Object.keys(mods.ban).length?Object.keys(mods.ban).map(n=>'<div class="mrow"><span class="av">⛔</span><div style="flex:1">'+esc2(n)+'</div><button data-gm="unban:'+esc2(n)+'">Unban</button></div>').join(''):'<div class="mute" style="margin-top:6px">No banned characters.</div>'))
  +sec('audit','Action log',
   jget(AUDK,[]).slice(-20).reverse().map(a=>'<div class="mute" style="font-size:12px">'+new Date(a.t).toLocaleTimeString()+' &middot; '+esc2(a.by)+': '+esc2(a.a)+'</div>').join('')||'<div class="mute">Nothing yet.</div>')}
 // moderation tools (shown to mods and admins)
 const mu=Object.keys(mods.mute).filter(n=>mods.mute[n]>now);
 h+=sec('mmute','Mute / unmute',
  row(inp('so_gm_mn','Player name'),inp('so_gm_mm','Minutes','width:26%'),btn('mute','Mute'))
  +(mu.length?mu.map(n=>'<div class="mrow"><span class="av">\u{1F910}</span><div style="flex:1">'+esc2(n)+'<div class="mute">'+Math.ceil((mods.mute[n]-now)/60000)+' min left</div></div><button data-gm="unmute:'+esc2(n)+'">Unmute</button></div>').join(''):'<div class="mute" style="margin-top:6px">Nobody is muted.</div>'))
  +sec('mkick','Warn and kick',
   row(inp('so_gm_kn','Player name'),btn('kick','Kick'))+row(inp('so_gm_wn','Player name','width:34%'),inp('so_gm_wt','Warning text'),btn('warn','Warn'))
   +'<div class="mute" style="margin-top:8px;font-size:12px">Players: '+players.map(n=>esc2(n)+' '+(((known(n)||{}).online||n===P.name)?'\u{1F7E2}':'⚪')).join(', ')+'</div>')
  +sec('mlog','Chat log',
   '<div class="cbox" style="max-height:220px;overflow:auto">'+(jget(CHATK,[]).map((m,i)=>'<div><b style="color:'+CHC[m.ch][1]+'">['+CHC[m.ch][0]+']</b> '+esc2(m.f)+': '+esc2(m.x)+' <button data-gm="delmsg:'+i+'" style="min-height:22px;padding:0 6px;font-size:11px">Delete</button></div>').join('')||'<div class="mute">No messages.</div>')+'</div>'+row(btn('clearchat','Clear all chat')));
 return h}
let gmFound='';
function gmDo(a,arg){const v=id=>(((document.getElementById(id)||{}).value)||soDraft[id]||'').trim(),clr=id=>{delete soDraft[id]};gmMsg='';
 const role=myRole(),needAdm=()=>{if(!isAdm()){gmMsg='Admins only.';return true}return false},needMod=()=>{if(!isMod()){gmMsg='Moderators only.';return true}return false};
 if(a==='tg'){gmOpen[arg]=!gmOpen[arg];render();return}
 if(['rate','rate1','drate','drate1','hadd','htog','hdel','notice','notice0','apply','heal','revive','clearmap','find','give','tpmap','tpplayer','refill','killall','kichiback','say','ban','unban'].includes(a)&&needAdm())return render();
 if(['mute','unmute','kick','warn','delmsg','clearchat'].includes(a)&&needMod())return render();
 if(a==='apply'){const tn=v('so_gm_target'),sl=tn&&tn.toLowerCase()!==P.name.toLowerCase()?slotByName(tn):null;if(tn&&tn.toLowerCase()!==P.name.toLowerCase()&&!sl){gmMsg='No saved character named '+tn+'.';return render()}const T=sl?sl[1]:P;const n=k=>{const x=v('so_gm_'+k);return x===''||isNaN(+x)?null:Math.floor(+x)},ch=[];
  const lv=n('lvl');if(lv!==null){const to=Math.max(1,Math.min(MAXL,lv)),d=to-T.lvl;T.lvl=to;T.exp=0;if(d>0){T.ap+=5*d;if(T.job)T.sp+=3*d;T.maxHp+=14*d;T.maxMp+=11*d}else if(d<0){T.maxHp=Math.max(50,T.maxHp+14*d);T.maxMp=Math.max(5,T.maxMp+11*d)}T.hp=T.maxHp;T.mp=T.maxMp;ch.push('level '+to)}
  [['exp','exp'],['str','str'],['dex','dex'],['int','int'],['luk','luk'],['ap','ap'],['sp','sp'],['mesos','mesos']].forEach(([f,k])=>{const x=n(f);if(x!==null){T[k]=Math.max(0,x);ch.push(f+' '+T[k])}});
  const hp=n('hp');if(hp!==null){T.maxHp=Math.max(1,hp);T.hp=T.maxHp;ch.push('max HP '+T.maxHp)}const mp=n('mp');if(mp!==null){T.maxMp=Math.max(0,mp);T.mp=T.maxMp;ch.push('max MP '+T.maxMp)}
  const j=v('so_gm_job');if(j){T.job=j==='none'?null:j;ch.push('class '+(T.job||'beginner'))}
  ['lvl','exp','str','dex','int','luk','ap','sp','mesos','hp','mp'].forEach(k=>clr('so_gm_'+k));clr('so_gm_job');
  clr('so_gm_target');if(sl&&ch.length)slotSave(sl[0],T);gmMsg=ch.length?'Updated '+(sl?T.name:'you')+': '+ch.join(', ')+'.':'Nothing to change.';if(ch.length)audit('edited '+(sl?T.name:'self')+': '+ch.join(', '))}
 else if(a==='rate'||a==='rate1'){const r=a==='rate1'?1:Math.floor(+v('so_gm_rate'));if(!(r>=1&&r<=1000))gmMsg='The EXP rate must be a whole number from 1 to 1000.';else{try{LS.setItem('mapleish_rates',JSON.stringify(Object.assign(worldCfg(),{exp:r,by:MYID(),t:Date.now()})))}catch(e){}clr('so_gm_rate');gmMsg='EXP rate is now x'+r+'.';audit('set EXP rate to x'+r)}}
 else if(a==='drate'||a==='drate1'){const r=a==='drate1'?1:Math.floor(+v('so_gm_drate'));if(!(r>=1&&r<=1000))gmMsg='The drop rate must be a whole number from 1 to 1000.';else{const c=worldCfg();c.drop=r;c.by=MYID();c.t=Date.now();try{LS.setItem('mapleish_rates',JSON.stringify(c))}catch(e){}clr('so_gm_drate');gmMsg='Drop rate is now x'+r+'.';audit('set drop rate to x'+r)}}
 else if(a==='hadd'){const c=worldCfg(),L=Array.isArray(c.hot)?c.hot:[];const name=v('so_gm_hname').replace(/\s+/g,' ').slice(0,40),ex=Math.floor(+v('so_gm_hexp')||1),dr=Math.floor(+v('so_gm_hdrop')||1),date=v('so_gm_hdate'),time=v('so_gm_htime'),hrs=+v('so_gm_hhours'),rep=v('so_gm_hrep')||'none';
  const maxH=rep==='daily'?24:rep==='weekly'?168:720;
  if(L.length>=24)gmMsg='24 hot-times is the limit.';else if(!name)gmMsg='Give the hot-time a name.';else if(!(ex>=1&&ex<=1000&&dr>=1&&dr<=1000))gmMsg='EXP and drop must be 1 to 1000.';else if(ex===1&&dr===1)gmMsg='Set an EXP or drop multiplier above 1.';
  else if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^\d\d?:\d\d$/.test(time))gmMsg='Pick a start date and time (California time).';else if(!(hrs>0&&hrs<=maxH))gmMsg='Hours must be more than 0 and at most '+maxH+(rep==='none'?'':' for a hot-time that repeats '+(rep==='daily'?'every day':'every week'))+'.';
  else{L.push({name,exp:ex,drop:dr,date,time,hours:Math.round(hrs*4)/4,repeat:['none','daily','weekly'].includes(rep)?rep:'none',on:true});c.hot=L;c.by=MYID();c.t=Date.now();try{LS.setItem('mapleish_rates',JSON.stringify(c))}catch(e){}
   ['hname','hexp','hdrop','hdate','htime','hhours','hrep'].forEach(k=>clr('so_gm_'+k));gmMsg='Hot-time "'+name+'" added.';audit('added hot-time '+name+' (EXP x'+ex+', drop x'+dr+')')}}
 else if(a==='htog'||a==='hdel'){const c=worldCfg(),L=Array.isArray(c.hot)?c.hot:[],x=L[+arg];if(x){if(a==='hdel'){L.splice(+arg,1);gmMsg='Hot-time "'+x.name+'" deleted.';audit('deleted hot-time '+x.name)}else{x.on=!x.on;gmMsg='Hot-time "'+x.name+'" '+(x.on?'enabled':'disabled')+'.';audit((x.on?'enabled':'disabled')+' hot-time '+x.name)}c.hot=L;c.by=MYID();c.t=Date.now();try{LS.setItem('mapleish_rates',JSON.stringify(c))}catch(e){}}}
 else if(a==='notice'||a==='notice0'){const t=a==='notice0'?'':v('so_gm_notice').replace(/\s+/g,' ').slice(0,150);const c=worldCfg();if(t)c.msg=t;else delete c.msg;c.by=MYID();c.t=Date.now();try{LS.setItem('mapleish_rates',JSON.stringify(c))}catch(e){}clr('so_gm_notice');gmMsg=t?'Scrolling notice set.':'Scrolling notice cleared.';audit(t?'set notice: '+t.slice(0,40):'cleared notice')}
 else if(a==='heal'){P.hp=P.maxHp;P.mp=P.maxMp;gmMsg='Healed.';audit('healed self')}
 else if(a==='revive'){P.dead=0;P.hp=Math.max(P.hp,Math.floor(P.maxHp/2));gmMsg='Revived.';audit('revived self')}
 else if(a==='clearmap'){P.cleared=P.cleared||{};P.cleared[P.map]=1;gmMsg='Exits of '+MAPS[P.map].n+' are open.';audit('opened exits of '+P.map)}
 else if(a==='find'){const q=v('so_gm_item').toLowerCase();const ids=Object.keys(ITEMS).filter(k=>ITEMS[k].n.toLowerCase().includes(q)||k.includes(q.replace(/\s+/g,'_'))).slice(0,10);gmFound=ids.length?ids.map(k=>'<button data-gm="pick:'+k+'" style="margin:2px">'+ITEMS[k].i+' '+esc2(ITEMS[k].n)+'</button>').join(''):'<span class="mute">No match.</span>'}
 else if(a==='pick'){soDraft.so_gm_item=arg;gmFound=''}
 else if(a==='give'){const id=findItem(v('so_gm_item'));let q=Math.floor(+v('so_gm_qty')||1);q=Math.max(1,Math.min(999,q));const to=v('so_gm_to');
  if(!id)gmMsg='No item matches "'+v('so_gm_item')+'".';
  else if(!to||to.toLowerCase()===P.name.toLowerCase()){P.inv[id]=(P.inv[id]||0)+q;gmMsg='Gave '+q+' x '+ITEMS[id].n+' to you.';audit('granted '+q+' x '+id+' to self')}
  else{const sl=slotByName(to);if(!sl)gmMsg=(known(to)&&known(to).bot)?'KichiAlpha has no inventory.':'No saved character named '+to+'.';else{sl[1].inv=sl[1].inv||{};sl[1].inv[id]=(sl[1].inv[id]||0)+q;slotSave(sl[0],sl[1]);gmMsg='Gave '+q+' x '+ITEMS[id].n+' to '+sl[1].name+'.';audit('granted '+q+' x '+id+' to '+sl[1].name)}}}
 else if(a==='tpmap'){const id=v('so_gm_map')||soDraft.so_gm_map;if(MAPS[id]){gmEnd();P.map=id;P.kills=0;gmMsg='Teleported to '+MAPS[id].n+'.';audit('teleported to '+id);tab='play';feat=null}}
 else if(a==='tpplayer'){const n=v('so_gm_tpp'),k=known(n);let to=null;if(k&&k.bot){if(kichiAway())gmMsg='KichiAlpha is away.';else to=KICHI.map}else{const sl=slotByName(n);if(sl&&sl[1].name!==P.name)to=sl[1].map}
  if(to&&MAPS[to]){gmEnd();P.map=to;P.kills=0;gmMsg='Teleported to '+n+' in '+MAPS[to].n+'.';audit('teleported to player '+n);tab='play';feat=null}else if(!gmMsg)gmMsg='Cannot find '+n+'.'}
 else if(a==='refill'){const w=WORLD[P.map];if(w){w.forEach(x=>{x.dead=0})}gmMsg='Monsters refilled.';audit('refilled '+P.map)}
 else if(a==='killall'){const w=WORLD[P.map]||[];w.forEach((x,i)=>{if(!x.by||x.by!=='kichi')killSlot(P.map,i)});if(fld.length){fld=[];enc=null}gmMsg='All monsters defeated.';audit('defeated all on '+P.map)}
 else if(a==='kichiback'){KS.away=0;gmMsg='KichiAlpha is back.';audit('recalled KichiAlpha')}
 else if(a==='say'){const t=v('so_gm_say');if(t){chatPost('world',t);const m=jget(CHATK,[]);if(m.length){m[m.length-1].f='[GM] '+MYID()}try{LS.setItem(CHATK,JSON.stringify(m))}catch(e){}clr('so_gm_say');audit('announced: '+t.slice(0,40));gmMsg='Announcement sent.'}}
 else if(a==='ban'){const n=v('so_gm_ban');if(n){const m=modGet();m.ban[n]=1;modSet(m);clr('so_gm_ban');gmMsg=n+' is banned.';audit('banned '+n)}}
 else if(a==='unban'){const m=modGet();delete m.ban[arg];modSet(m);gmMsg=arg+' is unbanned.';audit('unbanned '+arg)}
 else if(a==='mute'){const n=v('so_gm_mn'),min=Math.max(1,Math.min(1440,Math.floor(+v('so_gm_mm')||10)));if(!n)gmMsg='Enter a player name.';else if(n===MYID())gmMsg='You cannot mute yourself.';else{const m=modGet();m.mute[n]=Date.now()+min*60000;modSet(m);clr('so_gm_mn');clr('so_gm_mm');gmMsg=n+' is muted for '+min+' minutes.';audit('muted '+n+' for '+min+' min')}}
 else if(a==='unmute'){const m=modGet();delete m.mute[arg];modSet(m);gmMsg=arg+' is unmuted.';audit('unmuted '+arg)}
 else if(a==='kick'){const n=v('so_gm_kn'),k=known(n);if(!n)gmMsg='Enter a player name.';else if(k&&k.bot){KS.away=Date.now()+120000;gmMsg='KichiAlpha was kicked for 2 minutes.';audit('kicked KichiAlpha');clr('so_gm_kn')}
  else{const sl=slotByName(n);if(!sl)gmMsg='No player named '+n+'.';else if(sl[1].name===P.name)gmMsg='You cannot kick yourself.';else{const m0=MAPS[sl[1].map];sl[1].map=(m0&&m0.ret)||'mushroom_town';slotSave(sl[0],sl[1]);gmMsg=sl[1].name+' was sent back to town.';audit('kicked '+sl[1].name);clr('so_gm_kn')}}}
 else if(a==='warn'){const n=v('so_gm_wn'),t=v('so_gm_wt'),k=known(n);if(!n||!t)gmMsg='Enter a name and a warning.';else if(!k)gmMsg='No player named '+n+'.';else if(k.bot)gmMsg='KichiAlpha is a test character and cannot read warnings.';else{const q=jget(INBOX(k.n),[]);q.push({f:'[GM] '+MYID(),x:'Warning: '+t,t:Date.now()});try{LS.setItem(INBOX(k.n),JSON.stringify(q))}catch(e){}gmMsg='Warning sent to '+k.n+'.';audit('warned '+k.n+': '+t.slice(0,40));clr('so_gm_wn');clr('so_gm_wt')}}
 else if(a==='delmsg'){const c=jget(CHATK,[]);const m=c.splice(+arg,1)[0];try{LS.setItem(CHATK,JSON.stringify(c))}catch(e){}gmMsg='Message deleted.';if(m)audit('deleted chat message by '+m.f)}
 else if(a==='clearchat'){try{LS.setItem(CHATK,'[]')}catch(e){}gmMsg='Chat cleared.';audit('cleared chat')}
 save();render()}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-gm]');if(!b||!P)return;const[a,...r]=b.dataset.gm.split(':');gmDo(a,r.join(':'))});
document.addEventListener('change',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.gmrole&&P){if(!isAdm()){gmMsg='Admins only.';return render()}const A=AC(),id=t.dataset.gmrole;if(id===MYID()&&t.value!=='admin'&&Object.keys(A).filter(k=>A[k].role==='admin').length<2){gmMsg='You are the only admin. Make someone else an admin first.';return render()}
 if(A[id]){if(t.value==='player')delete A[id].role;else A[id].role=t.value;saveAC(A);audit('set role of '+id+' to '+t.value);gmMsg=id+' is now '+t.value+'.'}syncFeat();render()}
 if(t&&t.id&&/^so_gm_/.test(t.id))soDraft[t.id]=t.value});
{const _fb=featBody;featBody=function(id){if(id==='admin'){return isAdm()?gmPanel('admin'):'<div class="pad">Admins only.</div>'}if(id==='mod'){return isMod()?gmPanel('mod'):'<div class="pad">Moderators only.</div>'}return _fb(id)}}
/* the admin and mod screens draw their own title and notes, so the menu wrapper must not double them */
{const _r=render;render=function(){syncFeat();
 if(P&&scr==='game'&&isBanned(P.name)){const nm=P.name;P=null;enc=null;fld=[];autoSeek=false;scr='chars';toast('Character '+nm+' is banned.');return _r.apply(this,arguments)}
 return _r.apply(this,arguments)}}
{const _s=soDo;soDo=function(a,arg){if((a==='csend'||a==='dmsend')&&P){const l=muteLeft(P.name);if(l>0){soMsg=[a==='csend'?'chat':'dm','You are muted for '+Math.ceil(l/60000)+' more minute'+(Math.ceil(l/60000)>1?'s':'')+'.'];return render()}}return _s(a,arg)}}

/* ===== v1.6.1: combat always starts locked; auto-hunt can no longer stall ===== */
{let wasOn=false,stuckAt=0;
 const _rr=render;render=function(){const on=combatOn();if(on&&!wasOn)scrollLockPref=true;wasOn=on;return _rr.apply(this,arguments)};
 setInterval(()=>{if(!P||scr!=='game'){stuckAt=0;return}
  if(autoSeek&&!enc&&!MAPS[P.map].town){
   /* a search whose timer was lost leaves 'seeking' stuck on; release it */
   if(seeking){if(!stuckAt)stuckAt=Date.now();else if(Date.now()-stuckAt>2600){seeking=false;stuckAt=0;clearTimeout(autoT)}}else stuckAt=0;
  }else stuckAt=0},500);
}

/* ===== v1.7: pixel-art theme, sprite-ready avatar/face/emotes/icons =====
   Drop your own PNGs into the sprites/ folder (next to the built HTML). Anything missing falls back to the built-in art, so
   the game works with none, some or all of them. Frames are laid out left to right in ONE strip per file; the frame
   width is image width / frames. See README "Sprites" for the full list. */
const SPRITES={
 base:'sprites/',
 avatarIdle:{src:'avatar/idle.png',frames:4,fps:4,scale:2},   /* your character idle strip (shown in the menu and Character tab) */
 face:{src:'avatar/face.png',scale:2},                          /* single face picture used in combat and menus */
 emoteDir:'emote/',                                            /* emote/<id>.png, strip of N frames (frames = width / height) */
 emoteFps:6,
 iconDir:{item:'item/',mon:'mon/',skill:'skill/'},             /* item/<itemId>.png, mon/<monsterId>.png, skill/<skillId>.png */
 iconFps:6
};
const EMOTES=[['smile','\u{1F642}'],['grin','\u{1F604}'],['cry','\u{1F622}'],['angry','\u{1F620}'],['surprise','\u{1F632}'],['love','\u{1F60D}'],['sleep','\u{1F634}'],['cool','\u{1F60E}']];
const EM={k:null,until:0,open:false,t:0};
const SPC={};/* url -> {ok,w,h} once known */
let spRenderT=0;
function sprInfo(rel){const url=SPRITES.base+rel;let c=SPC[url];if(c)return c.ok?c:null;
 SPC[url]=c={ok:false,pending:true};const im=new Image();
 im.onload=()=>{c.ok=true;c.pending=false;c.w=im.naturalWidth;c.h=im.naturalHeight;c.url=url;clearTimeout(spRenderT);spRenderT=setTimeout(()=>{try{if(P&&scr==='game')render()}catch(e){}},120)};
 im.onerror=()=>{c.pending=false};im.src=url;return null}
/* Inline sprite markup. scale: integer pixel scale for fixed-size art; omitted = icon sized to the text (1.25em). */
function sprHtml(info,frames,fps,scale){const n=Math.max(1,frames|0),fw=info.w/n,fh=info.h;
 const size=scale?'height:'+(fh*scale)+'px;width:'+(fw*scale)+'px;':'height:1.25em;aspect-ratio:'+fw+'/'+fh+';';
 return '<span class="spr'+(n>1?' an':'')+'" style="background-image:url('+info.url+');--n:'+n+';--fps:'+fps+';'+size+'"></span>'}
function iconSprite(kind,id,orig){const dir=SPRITES.iconDir[kind];const i=sprInfo(dir+id+'.png');if(!i)return orig;
 const n=Math.max(1,Math.round(i.w/i.h));return sprHtml(i,n,SPRITES.iconFps)}
/* Items, monsters and skills hand out their icon through a property, so every screen picks sprites up without changes. */
const HOOKED=new WeakSet();
function hookIcons(){
 const hookObj=(kind,tbl)=>{for(const k in tbl){const o=tbl[k];if(!o||typeof o!=='object'||HOOKED.has(o))continue;HOOKED.add(o);
  if(Array.isArray(o)){let v=o[0];Object.defineProperty(o,0,{configurable:true,enumerable:true,get(){return iconSprite(kind,k,v)},set(x){v=x}})}
  else if('i' in o){let v=o.i;Object.defineProperty(o,'i',{configurable:true,enumerable:true,get(){return iconSprite(kind,k,v)},set(x){v=x}})}}};
 try{hookObj('item',ITEMS);hookObj('mon',MON);hookObj('skill',SKL)}catch(e){}}
/* ---------- avatar idle + face ---------- */
function idleSprite(){const c=SPRITES.avatarIdle,i=sprInfo(c.src);return i?sprHtml(i,c.frames,c.fps,c.scale||1):null}
const _avOrig=avatarSvg;
{const _a=avatarSvg;avatarSvg=function(p,wd){const s=_a.apply(this,arguments);if(p!==P)return s;
 const sp=idleSprite();if(sp)return '<div style="text-align:center;margin:6px auto">'+sp+'</div>';
 return '<div style="text-align:center"><span class="idleb">'+s+'</span></div>'}}
function emoVisual(k){const e=EMOTES.find(x=>x[0]===k);if(!e)return '';const i=sprInfo(SPRITES.emoteDir+k+'.png');
 if(i)return sprHtml(i,Math.max(1,Math.round(i.w/i.h)),SPRITES.emoteFps);return e[1]}
function faceHtml(px){const f=SPRITES.face,i=sprInfo(f.src);let inner;
 if(i)inner='<span class="spr" style="background-image:url('+i.url+');background-size:100% 100%;width:100%;height:100%;display:block;--n:1"></span>';
 else{inner=_avatarRaw(P).replace('viewBox="0 0 90 110"','viewBox="22 6 38 38" preserveAspectRatio="xMidYMid slice"').replace(/style="[^"]*"/,'style="width:100%;height:100%;display:block"')}
 const act=EM.k&&Date.now()<EM.until;
 return '<span class="face" style="width:'+px+'px;height:'+px+'px">'+inner+(act?'<span class="emo">'+emoVisual(EM.k)+'</span>':'')+'</span>'}
const _avatarRaw=p=>{const m=_avOrig(p,100).match(/<svg[\s\S]*<\/svg>/);return m?m[0]:''};
const faceWrap=px=>'<span class="face-wrap" data-fs="'+px+'">'+faceHtml(px)+'</span>';
function refreshFaces(){document.querySelectorAll('.face-wrap').forEach(e=>{e.innerHTML=faceHtml(+e.dataset.fs)})}
function setEmote(k){EM.k=k;EM.until=Date.now()+3500;refreshFaces();clearTimeout(EM.t);EM.t=setTimeout(()=>{EM.k=null;refreshFaces()},3600)}
const emoRow=()=>'<div class="emorow">'+EMOTES.map(e=>'<button data-emo="'+e[0]+'" title="'+e[0]+'">'+emoVisual(e[0])+'</button>').join('')+'</div>';
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-emo]');if(!b||!P)return;
 setEmote(b.dataset.emo)});
/* ---------- placing them on screen after each render ---------- */
function decorate(){if(!P||scr!=='game')return;const app=document.getElementById('app');if(!app)return;
 const sb=app.querySelector('.sbar .lvb');if(sb&&!app.querySelector('.sbar .face-wrap'))sb.insertAdjacentHTML('beforebegin',faceWrap(44));
 /* emotes live under the chat box in the Social tab */
 const ci=document.getElementById('so_chat');if(ci&&ci.parentNode&&!(ci.parentNode.nextElementSibling&&ci.parentNode.nextElementSibling.classList.contains('emorow')))ci.parentNode.insertAdjacentHTML('afterend',emoRow());
 /* the face in combat shows the current emote */
 const cp=document.getElementById('cpanel');if(cp){const hd=cp.querySelector('#slk');if(hd&&hd.parentNode&&!hd.parentNode.querySelector('.face-wrap'))hd.parentNode.insertAdjacentHTML('afterbegin',faceWrap(40))}
 if(tab==='menu'&&!feat&&!app.querySelector('.profcard')){const pn=[...app.querySelectorAll('.panel.win')].find(x=>{const t=x.querySelector('.title');return t&&t.textContent.trim()==='MENU'});
  if(pn)pn.insertAdjacentHTML('beforebegin','<div class="panel win profcard"><div class="pad"><div>'+(idleSprite()||'<span class="idleb">'+_avatarRaw(P).replace(/style="[^"]*"/,'style="width:78px;display:block"')+'</span>')+'</div><div class="who"><b>'+esc2(P.name)+'</b><span class="mute">Lv '+P.lvl+' '+jobName()+'</span></div></div></div>')}}
{const _r=render;render=function(){const r=_r.apply(this,arguments);try{hookIcons();decorate()}catch(e){}return r}}
hookIcons();

/* ===== v1.8: combat controls arranged for two thumbs, Flee removed ===== */
function thumbPad(){const cp=document.getElementById('cpanel');if(!cp||cp.querySelector('.thumbpad'))return;
 const grid=cp.querySelector('.qgrid'),qrow=grid&&grid.previousElementSibling,mv=cp.querySelector('#adv')&&cp.querySelector('#adv').parentNode,ab=cp.querySelector('#ab')&&cp.querySelector('#ab').parentNode;
 if(!grid||!mv)return;
 const g=id=>cp.querySelector('#'+id),mk=(c,kids)=>{const d=document.createElement('div');d.className=c;kids.forEach(k=>k&&d.appendChild(k));return d};
 const fl=g('fl');if(fl)fl.remove();
 const left=mk('tp-l',[g('adv'),g('bk'),g('pq0'),g('pq1')]);
 const right=mk('tp-r',[g('qs0'),g('qs1'),g('qs2'),g('qs3')]);
 const pad=mk('thumbpad',[left,right]);
 const foot=mk('tp-foot',[qrow,ab]);
 grid.parentNode.insertBefore(pad,grid);grid.parentNode.insertBefore(foot,grid);
 grid.remove();mv.remove()}
/* loot lives inside the combat panel so it stays in view while the screen is scroll-locked */
function lootIn(){const cp=document.getElementById('cpanel'),lo=document.getElementById('loot');if(!cp||!lo||lo.parentNode===cp)return;
 const note=[...cp.children].reverse().find(e=>e.classList.contains('mute'));cp.insertBefore(lo,note||null)}
{const _r=render;render=function(){const r=_r.apply(this,arguments);try{thumbPad();lootIn()}catch(e){}return r}}

/* ===== v2.0: calm monsters turn aggressive once you attack them ===== */
{const _q=qsUse;qsUse=function(k){const before=lastAtk;const r=_q.apply(this,arguments);
  if(enc&&lastAtk!==before){const reach=wReach();
   if(k==='slashblast')targetsFor(reach,SB_MOBS).forEach(m=>{m.prov=true});/* every monster the sweep reached */
   else if(enc.gap<=reach)enc.prov=true;/* the one you struck */}
  return r}}

const UPDATE_LOG=window.__GD.UPDATE_LOG;

const V83=window.__GD.V83;

/* ===== v2.1: real v83 values for the monsters, drops, EXP table and item prices already in the game ===== */
/* Data comes from 45-v83-data.js (generated). Monster icons and their main etc item stay as they were. */
for(const k in V83.items){if(!ITEMS[k]){const x=V83.items[k];ITEMS[k]=Object.assign({},x);delete ITEMS[k].d;if(x.d)DESC[k]=x.d}}
/* the tutorial monster keeps its tutorial stats and its quest drop (Jr. Sentinel Shellpiece for Todd's quest) */
const V83SKIP=new Set(['tutorial_sentinel']);
for(const k in V83.mon){if(!MON[k]||V83SKIP.has(k))continue;const keep={i:MON[k].i,e:MON[k].e};Object.assign(MON[k],V83.mon[k],keep)}
for(const k in V83.drops){if(MON[k]&&!V83SKIP.has(k))DROPS[k]=V83.drops[k]}
for(const k in V83.sell){if(ITEMS[k]&&!ITEMS[k].w&&!ITEMS[k].ammo)ITEMS[k].sell=V83.sell[k]}/* ammo is sold per piece here, so the data's set price would let you buy for 3 and sell for 250 */
for(const k in V83.heal||{}){const it=ITEMS[k];if(!it)continue;delete it.heal;Object.assign(it,V83.heal[k])}
EXP.splice(0,EXP.length,...V83.exp);while(EXP.length<MAXL)EXP.push(EXP[EXP.length-1]);
for(const k in V83.spawns){SPAWNS[k]=V83.spawns[k];if(MAPS[k])MAPS[k].mons=Object.keys(V83.spawns[k])}

/* ===== v2.2: Victoria Island from the v83 data: 231 real maps, their monsters and spawns, NPCs with real shops,
   real armor and weapons, and the quests those NPCs give. Data: V83.vic in 45-v83-data.js (generated). ===== */
(function(){
const V=V83.vic;
/* ---------- items: real armor/weapons need upgrade slots registered ---------- */
for(const k in V83.items){const x=V83.items[k];if(x.up!==undefined&&ITEMS[k]){TUC[k]=x.up;delete ITEMS[k].up}}
/* ---------- monsters ---------- */
for(const k in V.mon){MON[k]=Object.assign({},V.mon[k]);if(!MON[k].e)delete MON[k].e}
for(const k in V.drops)DROPS[k]=V.drops[k];
/* ---------- remove the old hand-made Victoria maps; old saves are moved to the real map that replaced them ---------- */
const ALIAS={pig_beach:'v104010001',road_to_henesys:'v104040000',henesys_hunting_ground_1:'v104040000',henesys_hunting_ground_2:'v104040001',
 forest_path:'v101010100',ellinia_forest:'v101010000',rocky_path:'v102010000',rocky_mountain:'v102020000',kerning_road:'v102040000',kerning_outskirts:'v103010000'};
for(const k in ALIAS){delete MAPS[k];delete SPAWNS[k];delete NAV[k];delete VNAV[k];delete WPOS[k];if(!V.maps[ALIAS[k]])ALIAS[k]='lith_harbor'}
['lith_harbor','henesys','ellinia','perion','kerning_city'].forEach(k=>{delete MAPS[k]});
/* ---------- maps ---------- */
for(const k in V.maps){const o=V.maps[k],m={n:o.n,i:o.i,d:o.d||'',ex:o.ex.slice(),ret:o.ret,npcs:o.npcs.filter(n=>NPCS[n]||V.npcs[n]),vid:o.vid};
 if(o.town)m.town=1;else{m.need=o.need;m.mons=o.mons.slice();m.art=o.art}
 MAPS[k]=m;if(V.spawns[k])SPAWNS[k]=V.spawns[k];
 const p=V.pos[k];VNAV[k]=[p[0],p[1],o.n];NAV[k]=VNAV[k];WPOS[k]=[48+p[0]*.38,22+p[1]*.55]}
/* the ferry from Southperry lands in Lith Harbor. It is one way, as in v62: once you leave Maple Island you cannot go back. */
MAPS.lith_harbor.ex=MAPS.lith_harbor.ex.filter(e=>e[0]!=='southperry');
if(MAPS.southperry&&!MAPS.southperry.ex.some(e=>e[0]==='lith_harbor'))MAPS.southperry.ex.push(['lith_harbor','Ferry to Lith Harbor']);
/* boss respawn timers (seconds) from the data */
{const _k=killSlot;killSlot=function(id,i){_k(id,i);const s=mobSlots(id)[i],b=V.boss[id];if(s&&b&&b[s.k])s.dead=Date.now()+b[s.k]*1000}}
/* move saved characters standing on a removed map */
{const _m=migrate;migrate=function(){const r=_m.apply(this,arguments);if(P&&ALIAS[P.map])P.map=ALIAS[P.map];return r}}
/* ---------- NPCs ---------- */
for(const k in V.npcs){const x=V.npcs[k];
 if(!NPCS[k])NPCS[k]={n:x.n,i:x.i,role:x.role||'',hi:x.hi||(x.n+' nods at you.')};
 if(x.shop){const L=x.shop.map(s=>s[0]).filter(id=>ITEMS[id]);x.shop.forEach(s=>{const it=ITEMS[s[0]];if(it&&!it.buy)it.buy=s[1]});
  if(x.shopArmor||!L.length)L.push(...tiers(GR,[1,5,10,15,20]).filter(id=>!L.includes(id)));
  NPCS[k].shop=1;NPCS[k].shopList=L;NPCS[k].shopPrice=Object.fromEntries(x.shop.filter(s=>ITEMS[s[0]]));NPCS[k].shopName=x.n+(x.role?' - '+x.role:'')}}
/* the old made-up shopkeepers have no place on the real maps; the job instructors keep their quests and job advancement */
{const _d=dlgDo;dlgDo=function(k){if(k==='shop'&&talk){const N=NPCS[talk.npc],m=MAPS[P.map];if(N&&N.shopList){m.shop=1;m.shopList=N.shopList;m.shopName=N.shopName;m.shopPrice=N.shopPrice||null}}return _d(k)}}
/* ---------- quests from the data ---------- */
for(const k in V.quests){const q=Object.assign({},V.quests[k]);if(q.mk)q.mk=q.mk.filter(x=>MON[x[0]]);if(q.col)q.col=q.col.filter(c=>ITEMS[c[0]]);
 if(q.type==='kill'&&q.mk&&q.mk.length===1&&!q.col){q.mon=q.mk[0][0];q.cnt=q.mk[0][1];delete q.mk}
 if(q.rw&&q.rw.items)for(const i in q.rw.items)if(!ITEMS[i])delete q.rw.items[i];
 if(q.rw&&q.rw.rand){q.rw.rand=q.rw.rand.filter(i=>ITEMS[i]);if(!q.rw.rand.length)delete q.rw.rand}
 if(q.give)for(const i in q.give)if(!ITEMS[i])delete q.give[i];
 QD[k]=q}
/* the old Athena quest asked for Pig Heads, which v83 Pigs do not drop: she now wants Pig's Ribbons (Ribbon Pigs) */
if(QD.target){QD.target.col=[['pig_ribbon',15]];QD.target.goal='Collect 15 Pig\'s Ribbons from Ribbon Pigs.'}
const JOB=()=>P.job||'beginner';
/* qAvail is a const, so class and extra-prerequisite rules work through the level check: the quest's level reads as out of reach when they fail */
for(const k in V.quests){const d=QD[k];if(!d||(!d.jobs&&!d.pre2))continue;const base=d.lvl;Object.defineProperty(d,'lvl',{configurable:true,enumerable:true,get(){if(!P)return base;if(d.jobs&&!d.jobs.includes(JOB()))return 9999;if(d.pre2&&!d.pre2.every(p=>P.q[p]==='done'))return 9999;return base}})}
{const _r=qReady;qReady=function(id){const d=QD[id];if(d&&d.type==='mixed'){if(P.q[id]!=='active')return false;return d.mk.every(x=>(P.qp[id+'|'+x[0]]||0)>=x[1])&&d.col.every(c=>(P.inv[c[0]]||0)>=c[1])}return _r(id)}}
{const _p=qProg;qProg=function(id){const d=QD[id];if(d&&d.type==='mixed')return d.mk.map(x=>Math.min(P.qp[id+'|'+x[0]]||0,x[1])+'/'+x[1]+' '+MON[x[0]].n).concat(d.col.map(c=>Math.min(P.inv[c[0]]||0,c[1])+'/'+c[1]+' '+ITEMS[c[0]].n)).join(', ');return _p(id)}}
{const _t=qTurn;qTurn=function(id){const d=QD[id];if(d&&d.type==='mixed'&&qReady(id)){d.col.forEach(c=>{P.inv[c[0]]-=c[1];if(P.inv[c[0]]<=0)delete P.inv[c[0]]});const keep=d.type;d.type='talk';try{return _t(id)}finally{d.type=keep}}return _t(id)}}
/* kill counting for mixed quests, and quest-only drops while the quest is active */
{const _w=win;win=function(){const k=enc&&enc.k;_w();if(!k||!P)return;
 for(const id in QD){const d=QD[id];if(d.type==='mixed'&&P.q[id]==='active'){const t=d.mk.find(x=>x[0]===k);if(t){const kk=id+'|'+k;if((P.qp[kk]||0)<t[1])P.qp[kk]=(P.qp[kk]||0)+1}}}
 (V.qdrops[k]||[]).forEach(e=>{if(e[2].some(q=>P.q[q]==='active')&&ITEMS[e[0]]&&Math.random()<e[1])addDrop(e[0],1)})}}
{const _q=qAccept;qAccept=function(id){const d=QD[id];if(d&&d.type==='mixed')d.mk.forEach(x=>P.qp[id+'|'+x[0]]=0);return _q(id)}}
/* ---------- real armor: requirements, class, Overall ---------- */
{const _e=equipItem;equipItem=function(id){const it=ITEMS[id];
 if(it&&it.s&&!it.w){
  if(it.pj&&!it.pj.includes(JOB())){log('That is for '+(it.jb||'another class')+'s only.','bad','items');return render()}
  if(it.rs)for(const s in it.rs)if((P[s]|0)<it.rs[s]){log('You need '+s.toUpperCase()+' '+it.rs[s]+' to wear this.','bad','items');return render()}}
 const r=_e(id);
 if(it&&P.eq){const top=P.eq.Top&&ITEMS[P.eq.Top];
  if(it.ov&&P.eq.Bottom){unequipItem('Bottom')}
  else if(it.s==='Bottom'&&top&&top.ov&&P.eq.Bottom===id){unequipItem('Top')}}
 return r}}
{const _ir=itemRows;itemRows=function(id,st){const r=_ir.apply(this,arguments),it=ITEMS[id];if(!it||!it.s||it.w)return r;
 if(it.ov&&r[0]&&r[0][0]==='Type')r[0]=['Type','Overall (top and bottom)'];
 if(it.x)Object.keys(it.x).forEach(k=>r.push([(typeof LBL!=='undefined'&&LBL[k])||k.toUpperCase(),'+'+it.x[k]]));
 if(it.rs)r.push(['Required stats',Object.keys(it.rs).map(k=>k.toUpperCase()+' '+it.rs[k]).join(', ')]);
 if(it.jb)r.push(['Job',it.jb]);return r}}
/* ---------- buildings: one-door town interiors (shops, schools, salons) are listed on their town's page instead of the map ---------- */
const LEAF=new Set(Object.keys(V.maps).filter(k=>{const o=V.maps[k];return o.town&&o.ex.length===1&&V.maps[o.ex[0][0]]&&V.maps[o.ex[0][0]].town}));
{const _n=nearSet;nearSet=function(){const d=_n.apply(this,arguments);for(const k in d)if(LEAF.has(k)&&k!==P.map)delete d[k];return d}}
{const _pp=peoplePanel;peoplePanel=function(){let h=_pp.apply(this,arguments);const m=MAPS[P.map];if(!m||!m.town)return h;
 const b=m.ex.filter(e=>LEAF.has(e[0]));if(!b.length)return h;
 return h+'<div class="panel"><h2>Buildings</h2><div class="tiles">'+b.map(e=>'<button class="tile" data-bld="'+e[0]+'"><span>'+(MAPS[e[0]].i||'🏠')+'</span>'+esc2(e[1])+'</button>').join('')+'</div></div>'}}
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-bld]');if(t&&P)go(t.dataset.bld)});
})();

/* ===== v2.3: Wiki on the website, built live from the game's own tables (MON, DROPS, SPAWNS, ITEMS, MAPS, NPCS, QD).
   Nothing here is a copy: whatever the game currently uses (including admin edits and future data) is what the wiki shows.
   Routes: #wiki, #wiki/search/<text>, #wiki/<monsters|items|maps|npcs|quests>, #wiki/<mon|item|map|npc|quest>/<key> ===== */
(function(){
const $=id=>document.getElementById(id),esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nav=document.querySelector('.ws-nav'),acct=$('ws-acctview');if(!nav||!acct)return;
/* nav link + view */
const wl=document.createElement('a');wl.href='#wiki';wl.id='ws-navwiki';wl.textContent='Wiki';nav.insertBefore(wl,$('ws-navacct'));
const view=document.createElement('div');view.id='ws-wikiview';view.style.display='none';acct.parentNode.insertBefore(view,acct.nextSibling);
/* ---------- index (rebuilt each time the wiki opens, so it follows the live game data) ---------- */
let IX=null;
const SKIPMON=new Set(['training_snail']);
const ARM=['Hat','Top','Bottom','Gloves','Shoes','Cape','Shield'],ACS=['Face','Eyes','Earring','Ring'];
function icat(k){const it=ITEMS[k];if(it.w)return'Weapon';if(it.s)return ARM.includes(it.s)?'Armor':ACS.includes(it.s)?'Accessory':'Armor';if(it.heal||it.mpheal||it.hpp||it.mpp||it.scr||it.ammo)return'Use';return'Etc'}
function build(){const ix={spawn:{},drop:{},sold:{},qrew:{},qgive:{},qneed:{},qkill:{},npcAt:{},qBy:{},qTo:{}};
 for(const m in MAPS){const t=(typeof spawnTable==='function'?spawnTable(m):null)||{};for(const k in t)(ix.spawn[k]=ix.spawn[k]||[]).push([m,t[k]]);
  (MAPS[m].npcs||[]).forEach(n=>(ix.npcAt[n]=ix.npcAt[n]||[]).push(m));
  if(MAPS[m].shopList&&!(MAPS[m].npcs||[]).some(n=>NPCS[n]&&NPCS[n].shopList))MAPS[m].shopList.forEach(i=>(ix.sold[i]=ix.sold[i]||[]).push(['map',m]))}
 for(const k in DROPS){const t=DROPS[k];if(!MON[k])continue;(t.i||[]).forEach(e=>(ix.drop[e[0]]=ix.drop[e[0]]||[]).push([k,e[1],e[2],e[3]]))}
 const qd=(typeof V83!=='undefined'&&V83.vic&&V83.vic.qdrops)||{};for(const k in qd)qd[k].forEach(e=>(ix.drop[e[0]]=ix.drop[e[0]]||[]).push([k,e[1],1,1,e[2]]));
 for(const n in NPCS)if(NPCS[n].shopList)NPCS[n].shopList.forEach(i=>(ix.sold[i]=ix.sold[i]||[]).push(['npc',n]));
 for(const q in QD){const d=QD[q],w=d.rw||{};
  Object.keys(w.items||{}).forEach(i=>(ix.qrew[i]=ix.qrew[i]||[]).push(q));(w.rand||[]).forEach(i=>(ix.qrew[i]=ix.qrew[i]||[]).push(q));
  Object.keys(d.give||{}).forEach(i=>(ix.qgive[i]=ix.qgive[i]||[]).push(q));(d.col||[]).forEach(c=>(ix.qneed[c[0]]=ix.qneed[c[0]]||[]).push(q));
  if(d.mon)(ix.qkill[d.mon]=ix.qkill[d.mon]||[]).push(q);(d.mk||[]).forEach(x=>(ix.qkill[x[0]]=ix.qkill[x[0]]||[]).push(q));
  if(d.giver)(ix.qBy[d.giver]=ix.qBy[d.giver]||[]).push(q);if(d.turn&&d.turn!==d.giver)(ix.qTo[d.turn]=ix.qTo[d.turn]||[]).push(q)}
 ix.mons=Object.keys(MON).filter(k=>!SKIPMON.has(k));
 ix.items=Object.keys(ITEMS).filter(k=>ITEMS[k]&&ITEMS[k].n&&!ITEMS[k].inst&&!/^x\d/.test(k));
 ix.maps=Object.keys(MAPS);ix.npcs=Object.keys(NPCS).filter(n=>ix.npcAt[n]);ix.quests=Object.keys(QD);
 return ix}
/* ---------- helpers ---------- */
const L=(t,k,txt)=>'<a class="wk-l" href="#wiki/'+t+'/'+encodeURIComponent(k)+'">'+txt+'</a>';
const mL=k=>MON[k]?L('mon',k,'<span class="wk-i">'+MON[k].i+'</span>'+esc(MON[k].n)):esc(k);
const iL=k=>ITEMS[k]?L('item',k,'<span class="wk-i">'+ITEMS[k].i+'</span>'+esc(ITEMS[k].n)):esc(k);
const pL=k=>MAPS[k]?L('map',k,'<span class="wk-i">'+(MAPS[k].i||(MAPS[k].town?'🏘️':'🌲'))+'</span>'+esc(MAPS[k].n)):esc(k);
const nL=k=>NPCS[k]?L('npc',k,'<span class="wk-i">'+(NPCS[k].i||'🧑')+'</span>'+esc(NPCS[k].n)):esc(k);
const qL=k=>QD[k]?L('quest',k,'<span class="wk-i">📜</span>'+esc(QD[k].n)):esc(k);
const pct=p=>{const v=p*100;let t=v>=10?v.toFixed(0):v>=1?v.toFixed(1):v>=.1?v.toFixed(2):v.toFixed(3);if(t.includes('.'))t=t.replace(/0+$/,'').replace(/\.$/,'');return t+'%'};
const row=(a,b)=>'<div class="ws-row"><span>'+a+'</span><b>'+b+'</b></div>';
const sec=(t,body)=>body?'<div class="ws-h3">'+t+'</div>'+body:'';
const chips=a=>a.length?'<div class="wk-chips">'+a.join('')+'</div>':'';
const region=m=>(typeof reg==='function'&&reg(m)==='victoria')?'Victoria Island':'Maple Island';
const JOBN={swordsman:'Warrior',archer:'Bowman',rogue:'Thief',magician:'Magician',beginner:'Beginner',pirate:'Pirate'};
const LBL2={str:'STR',dex:'DEX',int:'INT',luk:'LUK',hp:'Max HP',mp:'Max MP',mdef:'Magic DEF',def:'Weapon DEF',acc:'Accuracy',avoid:'Avoidability',speed:'Speed',jump:'Jump',watk:'Weapon ATT',matk:'Magic ATT'};
const SPDN=s=>s<=600?'Fast':s<=720?'Normal':'Slow';
function itemStats(k){const it=ITEMS[k],r=[];
 r.push(row('Category',it.w?(it.tl||'Weapon'):it.s?(it.ov?'Overall':it.s):icat(k)));
 if(it.req)r.push(row('Required level',it.req));
 if(it.pj)r.push(row('Class',it.pj.map(j=>JOBN[j]||j).join(', ')));else if(it.w||it.s)r.push(row('Class','All classes'));
 if(it.rs)r.push(row('Required stats',Object.keys(it.rs).map(s=>s.toUpperCase()+' '+it.rs[s]).join(', ')));
 if(it.w){r.push(row('Weapon ATT',it.watk));if(it.matk)r.push(row('Magic ATT',it.matk));r.push(row('Attack speed',SPDN(it.spd)))}
 if(it.def)r.push(row('Weapon DEF',it.def));
 for(const s in it.bon||{})r.push(row(LBL2[s]||s.toUpperCase(),'+'+it.bon[s]));
 for(const s in it.x||{})r.push(row(LBL2[s]||s.toUpperCase(),'+'+it.x[s]));
 if(typeof TUC!=='undefined'&&TUC[k]!==undefined&&(it.w||it.s))r.push(row('Upgrade slots',TUC[k]));
 if(it.heal)r.push(row('Restores',it.heal+' HP'));if(it.hpp)r.push(row('Restores',it.hpp+'% HP'));if(it.mpheal)r.push(row('Restores',it.mpheal+' MP'));if(it.mpp)r.push(row('Restores',it.mpp+'% MP'));
 if(it.scr&&typeof SCR!=='undefined'&&SCR[it.scr]){const d=SCR[it.scr];r.push(row('Success rate',d.r+'%'));for(const s in d.st||{})r.push(row(LBL2[s]||s,'+'+d.st[s]))}
 if(it.buy)r.push(row('Shop price',it.buy.toLocaleString()+' mesos'));
 const sv=it.sell||(it.buy?Math.floor(it.buy/2):0);if(sv)r.push(row('Sells for',sv.toLocaleString()+' mesos'));
 return r.join('')}
/* ---------- pages ---------- */
const CATS=[['monsters','👾','Monsters','mons'],['items','🎒','Items','items'],['maps','🗺️','Maps','maps'],['npcs','🧑','NPCs','npcs'],['quests','📜','Quests','quests']];
function home(){return '<div class="ws-h3">Browse</div><div class="wk-cats">'+CATS.map(c=>'<a class="wk-cat" href="#wiki/'+c[0]+'"><span>'+c[1]+'</span><b>'+c[2]+'</b><small>'+IX[c[3]].length.toLocaleString()+'</small></a>').join('')+'</div>'
 +'<div class="ws-h3">Starting out</div>'+chips(['snail','blue_snail','shroom','orange_mushroom','pig','green_mushroom'].filter(k=>MON[k]).map(mL))+chips(['mushroom_town','amherst','southperry','lith_harbor','henesys','ellinia','perion','kerning_city'].filter(k=>MAPS[k]).map(pL))}
/* Sorting: every list has its own options; tap the active option again to flip the direction.
   Default: by level for monsters and equipment (Weapon, Armor, Accessory), A-Z for everything else. */
let LST={cat:'all',sort:null,dir:1};
const nm=o=>(o&&o.n||'').toLowerCase();
const bySpawns=k=>(IX.spawn[k]||[]).length,mapMons=k=>Object.keys((typeof spawnTable==='function'&&spawnTable(k))||{}).length;
const SORTS={
 monsters:[['lv','Level',k=>MON[k].lv],['name','A-Z',k=>nm(MON[k])],['hp','HP',k=>MON[k].hp],['exp','EXP',k=>MON[k].exp],['maps','Maps',bySpawns]],
 items:[['lv','Level',k=>ITEMS[k].req||0],['name','A-Z',k=>nm(ITEMS[k])],['type','Type',k=>(ITEMS[k].w?(ITEMS[k].tl||'Weapon'):ITEMS[k].s||icat(k)).toLowerCase()],['atk','Attack',k=>ITEMS[k].watk||ITEMS[k].matk||0],['def','Defense',k=>ITEMS[k].def||0],['sell','Price',k=>ITEMS[k].sell||(ITEMS[k].buy?ITEMS[k].buy/2:0)]],
 maps:[['name','A-Z',k=>nm(MAPS[k])],['region','Region',k=>region(k)+' '+nm(MAPS[k])],['mons','Monsters',mapMons],['npcs','NPCs',k=>(MAPS[k].npcs||[]).length],['town','Towns first',k=>MAPS[k].town?0:1]],
 npcs:[['name','A-Z',k=>nm(NPCS[k])],['where','Location',k=>((IX.npcAt[k]||[])[0]&&MAPS[IX.npcAt[k][0]])?nm(MAPS[IX.npcAt[k][0]]):'~'],['quests','Quests',k=>(IX.qBy[k]||[]).length],['shop','Shops first',k=>NPCS[k].shop?0:1]],
 quests:[['name','A-Z',k=>nm(QD[k])],['lv','Level',k=>QD[k].lvl>=9999?999:(QD[k].lvl||0)],['exp','EXP reward',k=>(QD[k].rw||{}).exp||0],['giver','Giver',k=>nm(NPCS[QD[k].giver])]]};
const EQUIP=['Weapon','Armor','Accessory'];
function defSort(t){if(t==='monsters')return'lv';if(t==='items')return EQUIP.includes(LST.cat)?'lv':'name';return'name'}
/* numbers sort high-first by default (except level), text A-Z */
function defDir(t,k){return['hp','exp','maps','atk','def','sell','mons','npcs','quests'].includes(k)?-1:1}
function sorted(t,a){const opt=SORTS[t].find(o=>o[0]===LST.sort)||SORTS[t][0],f=opt[1]&&opt[2],d=LST.dir,nmf=SORTS[t].find(o=>o[0]==='name')[2];
 const cmp=(u,v)=>typeof u==='string'&&typeof v==='string'?u.localeCompare(v):(u<v?-1:u>v?1:0);
 return a.map(k=>[k,f(k),nmf(k)]).sort((x,y)=>cmp(x[1],y[1])*d||cmp(x[2],y[2])).map(x=>x[0])}
function listPage(t){const q=(WS.q||'').toLowerCase();let rows=[],head='',filters='';
 if(!LST.sort||!SORTS[t].some(o=>o[0]===LST.sort)){LST.sort=defSort(t);LST.dir=defDir(t,LST.sort)}
 if(t==='monsters'){const a=sorted(t,IX.mons.filter(k=>!q||MON[k].n.toLowerCase().includes(q)));
  head='<tr><th>Monster</th><th>Lv</th><th>HP</th><th>EXP</th><th>Found in</th></tr>';rows=a.map(k=>{const d=MON[k],sp=IX.spawn[k]||[];return '<tr><td>'+mL(k)+(d.boss?' <span class="wk-tag">Boss</span>':'')+'</td><td>'+d.lv+'</td><td>'+d.hp.toLocaleString()+'</td><td>'+d.exp+'</td><td>'+sp.length+' map'+(sp.length===1?'':'s')+'</td></tr>'})}
 else if(t==='items'){const C=['all','Weapon','Armor','Accessory','Use','Etc'];filters='<div class="wk-seg">'+C.map(c=>'<button class="ws-b'+(LST.cat===c?' p':'')+'" data-wcat="'+c+'">'+(c==='all'?'All':c)+'</button>').join('')+'</div>';
  let a=sorted(t,IX.items.filter(k=>(!q||ITEMS[k].n.toLowerCase().includes(q))&&(LST.cat==='all'||icat(k)===LST.cat)));
  const more=a.length>400;a=a.slice(0,400);
  head='<tr><th>Item</th><th>Type</th><th>Lv</th><th>Source</th></tr>';rows=a.map(k=>{const it=ITEMS[k],src=[(IX.drop[k]||[]).length?'Drop':'',(IX.sold[k]||[]).length?'Shop':'',(IX.qrew[k]||[]).length?'Quest':''].filter(Boolean).join(', ');return '<tr><td>'+iL(k)+'</td><td>'+(it.w?(it.tl||'Weapon'):it.s?(it.ov?'Overall':it.s):icat(k))+'</td><td>'+(it.req||'')+'</td><td>'+(src||'<span class="wk-m">-</span>')+'</td></tr>'});
  if(more)rows.push('<tr><td colspan="4" class="wk-m">Showing the first 400. Type in the filter box or pick a type to narrow it down.</td></tr>')}
 else if(t==='maps'){const a=sorted(t,IX.maps.filter(k=>!q||MAPS[k].n.toLowerCase().includes(q)));
  head='<tr><th>Map</th><th>Region</th><th>Monsters</th><th>NPCs</th></tr>';rows=a.map(k=>{const t2=(typeof spawnTable==='function'&&spawnTable(k))||{};return '<tr><td>'+pL(k)+(MAPS[k].town?' <span class="wk-tag">Town</span>':'')+'</td><td>'+region(k)+'</td><td>'+Object.keys(t2).map(m=>MON[m]?MON[m].i:'').join(' ')+'</td><td>'+(MAPS[k].npcs||[]).length+'</td></tr>'})}
 else if(t==='npcs'){const a=sorted(t,IX.npcs.filter(k=>!q||NPCS[k].n.toLowerCase().includes(q)));
  head='<tr><th>NPC</th><th>Where</th><th>Shop</th><th>Quests</th></tr>';rows=a.map(k=>'<tr><td>'+nL(k)+'</td><td>'+(IX.npcAt[k]||[]).slice(0,2).map(pL).join(', ')+'</td><td>'+(NPCS[k].shop?'Yes':'')+'</td><td>'+((IX.qBy[k]||[]).length||'')+'</td></tr>')}
 else if(t==='quests'){const a=sorted(t,IX.quests.filter(k=>!q||QD[k].n.toLowerCase().includes(q)));
  head='<tr><th>Quest</th><th>Lv</th><th>From</th><th>Reward</th></tr>';rows=a.map(k=>{const d=QD[k],w=d.rw||{};return '<tr><td>'+qL(k)+'</td><td>'+(d.lvl>=9999?'-':d.lvl)+'</td><td>'+nL(d.giver)+'</td><td>'+[w.exp?w.exp.toLocaleString()+' EXP':'',w.mesos?w.mesos.toLocaleString()+' mesos':'',(w.items||w.rand)?'items':''].filter(Boolean).join(', ')+'</td></tr>'})}
 const c=CATS.find(x=>x[0]===t);
 const sortBar='<div class="wk-sort"><span class="wk-m">Sort:</span>'+SORTS[t].map(o=>'<button class="ws-b'+(LST.sort===o[0]?' p':'')+'" data-wsort="'+o[0]+'">'+o[1]+(LST.sort===o[0]?(LST.dir>0?' ▲':' ▼'):'')+'</button>').join('')+'</div>';
 return '<div class="wk-crumb"><a href="#wiki">Wiki</a> › '+c[2]+'</div><div class="wk-tools"><input id="wk-q" placeholder="Filter '+c[2].toLowerCase()+'" value="'+esc(WS.q||'')+'"></div>'+filters+sortBar
 +'<div class="wk-count">'+rows.filter(r=>!r.includes('colspan')).length.toLocaleString()+' '+(rows.length===1?'entry':'entries')+'</div><div class="wk-tw"><table class="wk-t"><thead>'+head+'</thead><tbody>'+rows.join('')+'</tbody></table></div>'}
function monPage(k){const d=MON[k];if(!d)return nf();const t=DROPS[k]||{i:[]},sp=(IX.spawn[k]||[]).slice().sort((a,b)=>b[1]-a[1]);
 const qd=((typeof V83!=='undefined'&&V83.vic&&V83.vic.qdrops||{})[k]||[]);
 return crumb('monsters','Monsters',d.n)+'<div class="wk-hd"><span class="wk-big">'+d.i+'</span><div><div class="wk-name">'+esc(d.n)+'</div><div class="wk-m">Level '+d.lv+(d.boss?' boss':'')+' · '+(d.ag?'Aggressive':'Calm until attacked')+(d.touch?' · Touch damage':'')+'</div></div></div>'
 +sec('Stats',row('HP',d.hp.toLocaleString())+row('EXP',d.exp)+row('Damage to you',d.atk[0]+' - '+d.atk[1])+row('Accuracy',d.acc!=null?d.acc:'-')+row('Avoidability',d.av)+(d.wdef!=null?row('Weapon DEF',d.wdef):''))
 +sec('Drops',(t.m&&t.m[0]?row('Mesos',t.m[1]+' - '+t.m[2]+' ('+pct(t.m[0])+')'):'')+(t.i||[]).filter(e=>ITEMS[e[0]]).slice().sort((a,b)=>b[1]-a[1]).map(e=>row(iL(e[0])+(e[3]>1?' x'+e[2]+'-'+e[3]:''),pct(e[1]))).join('')+qd.filter(e=>ITEMS[e[0]]).map(e=>row(iL(e[0])+' <span class="wk-tag">Quest</span>',pct(e[1])+' while '+e[2].map(qL).join(', ')+' is active')).join(''))
 +sec('Where to find it',sp.map(s=>row(pL(s[0]),s[1]+' spawn point'+(s[1]===1?'':'s'))).join('')||'<div class="wk-m">Not placed on any map.</div>')
 +sec('Quests',chips((IX.qkill[k]||[]).map(qL)))}
function itemPage(k){const it=ITEMS[k];if(!it)return nf();const dr=(IX.drop[k]||[]).slice().sort((a,b)=>b[1]-a[1]);
 const sold=IX.sold[k]||[],desc=(typeof DESC!=='undefined'&&DESC[k])||'';
 return crumb('items','Items',it.n)+'<div class="wk-hd"><span class="wk-big">'+it.i+'</span><div><div class="wk-name">'+esc(it.n)+'</div>'+(desc?'<div class="wk-m">'+esc(desc)+'</div>':'')+'</div></div>'
 +sec('Details',itemStats(k))
 +sec('Dropped by',dr.map(e=>row(mL(e[0])+(e[4]?' <span class="wk-tag">Quest</span>':''),pct(e[1])+(e[3]>1?' (x'+e[2]+'-'+e[3]+')':''))).join(''))
 +sec('Sold by',sold.map(s=>row(s[0]==='npc'?nL(s[1]):pL(s[1]),s[0]==='npc'?(IX.npcAt[s[1]]||[]).slice(0,1).map(pL).join(''):'Town shop')).join(''))
 +sec('Quest reward from',chips((IX.qrew[k]||[]).map(qL)))+sec('Given by quest',chips((IX.qgive[k]||[]).map(qL)))+sec('Needed for quest',chips((IX.qneed[k]||[]).map(qL)))
 +(!dr.length&&!sold.length&&!(IX.qrew[k]||[]).length&&!(IX.qgive[k]||[]).length?'<div class="ws-h3">Where to get it</div><div class="wk-m">Not obtainable from monsters, shops or quests right now.</div>':'')}
function mapPage(k){const m=MAPS[k];if(!m)return nf();const t=(typeof spawnTable==='function'&&spawnTable(k))||{};
 return crumb('maps','Maps',m.n)+'<div class="wk-hd"><span class="wk-big">'+(m.i||(m.town?'🏘️':'🌲'))+'</span><div><div class="wk-name">'+esc(m.n)+'</div><div class="wk-m">'+region(k)+' · '+(m.town?'Town':'Hunting ground')+'</div>'+(m.d?'<div class="wk-m">'+esc(m.d)+'</div>':'')+'</div></div>'
 +sec('Details',(m.need?row('Defeat to open the way',m.need):'')+(m.ret?row('Return town',pL(m.ret)):''))
 +sec('Monsters',Object.keys(t).sort((a,b)=>(MON[a]?MON[a].lv:0)-(MON[b]?MON[b].lv:0)).map(x=>row(mL(x)+' <span class="wk-m">Lv '+(MON[x]?MON[x].lv:'?')+'</span>',t[x]+' spawn point'+(t[x]===1?'':'s'))).join(''))
 +sec('People',chips((m.npcs||[]).filter(n=>NPCS[n]).map(nL)))
 +sec('Exits',chips((m.ex||[]).filter(e=>MAPS[e[0]]).map(e=>pL(e[0]))))}
function npcPage(k){const n=NPCS[k];if(!n)return nf();const sh=n.shopList||[];
 return crumb('npcs','NPCs',n.n)+'<div class="wk-hd"><span class="wk-big">'+(n.i||'🧑')+'</span><div><div class="wk-name">'+esc(n.n)+'</div>'+(n.role?'<div class="wk-m">'+esc(n.role)+'</div>':'')+(n.hi?'<div class="wk-q">"'+esc(n.hi)+'"</div>':'')+'</div></div>'
 +sec('Where',chips((IX.npcAt[k]||[]).map(pL)))
 +sec('Shop',sh.filter(i=>ITEMS[i]).map(i=>row(iL(i),ITEMS[i].buy?ITEMS[i].buy.toLocaleString()+' mesos':'')).join(''))
 +sec('Gives quests',chips((IX.qBy[k]||[]).map(qL)))+sec('Takes quests',chips((IX.qTo[k]||[]).map(qL)))}
function questPage(k){const d=QD[k];if(!d)return nf();const w=d.rw||{},o=[];
 if(d.mon)o.push(row('Defeat',mL(d.mon)+' x'+d.cnt));(d.mk||[]).forEach(x=>o.push(row('Defeat',mL(x[0])+' x'+x[1])));(d.col||[]).forEach(c=>o.push(row('Bring',iL(c[0])+' x'+c[1])));
 if(!o.length)o.push(row('Goal',esc(d.goal||'Talk to '+(NPCS[d.turn||d.giver]||{}).n)));
 const r=[];if(w.exp)r.push(row('EXP',w.exp.toLocaleString()));if(w.mesos)r.push(row('Mesos',w.mesos.toLocaleString()));for(const i in w.items||{})r.push(row(iL(i),'x'+w.items[i]));if(w.rand)r.push(row('One of',w.rand.filter(i=>ITEMS[i]).map(iL).join(', ')));
 const lv=d.lvl>=9999?(Object.getOwnPropertyDescriptor(d,'lvl')?'':''):d.lvl;
 return crumb('quests','Quests',d.n)+'<div class="wk-hd"><span class="wk-big">📜</span><div><div class="wk-name">'+esc(d.n)+'</div>'+(d.goal?'<div class="wk-m">'+esc(d.goal)+'</div>':'')+'</div></div>'
 +sec('Requirements',(lv?row('Level',lv+(d.max?' - '+(d.max-1):'+')):'')+(d.jobs?row('Class',d.jobs.map(j=>JOBN[j]||j).join(', ')):'')+(d.pre?row('Complete first',qL(d.pre)):'')+(d.pre2||[]).map(p=>row('Complete first',qL(p))).join(''))
 +sec('Start',row('From',nL(d.giver)+' '+((IX.npcAt[d.giver]||[]).slice(0,1).map(m=>'<span class="wk-m">in</span> '+pL(m)).join('')))+(d.turn?row('Hand in to',nL(d.turn)):''))
 +sec('Objective',o.join(''))+sec('Given on accept',Object.keys(d.give||{}).map(i=>row(iL(i),'x'+d.give[i])).join(''))+sec('Rewards',r.join(''))}
function searchPage(){const q=(WS.q||'').trim().toLowerCase();if(!q)return home();
 const f=(arr,get)=>arr.filter(k=>get(k).toLowerCase().includes(q)).slice(0,30);
 const g=[['Monsters',f(IX.mons,k=>MON[k].n).map(mL)],['Items',f(IX.items,k=>ITEMS[k].n).map(iL)],['Maps',f(IX.maps,k=>MAPS[k].n).map(pL)],['NPCs',f(IX.npcs,k=>NPCS[k].n).map(nL)],['Quests',f(IX.quests,k=>QD[k].n).map(qL)]];
 const n=g.reduce((a,x)=>a+x[1].length,0);
 return '<div class="wk-crumb"><a href="#wiki">Wiki</a> › Search</div>'+(n?g.map(x=>sec(x[0]+' ('+x[1].length+')',chips(x[1]))).join(''):'<div class="wk-m">Nothing matches "'+esc(WS.q)+'".</div>')}
const crumb=(t,tn,n)=>'<div class="wk-crumb"><a href="#wiki">Wiki</a> › <a href="#wiki/'+t+'">'+tn+'</a> › '+esc(n)+'</div>';
const nf=()=>'<div class="wk-crumb"><a href="#wiki">Wiki</a></div><div class="wk-m">That page does not exist.</div>';
/* ---------- view + routing ----------
   Routing is kept in memory, not in location.hash: when the page runs inside a srcdoc iframe (as in the Claude preview),
   following a '#...' link navigates the whole frame away. The address bar is updated only where that is safe. */
const WS={q:''};let CUR='#wiki',STACK=[];
const canHash=()=>{try{return location.protocol!=='about:'&&location.protocol!=='data:'}catch(e){return false}};
function route(){const h=decodeURIComponent(CUR||'');if(!h.startsWith('#wiki'))return null;return h.slice(6).split('/').filter(Boolean)}
let lastList=null;
function go(h,opt){opt=opt||{};const r=decodeURIComponent(h).slice(6).split('/').filter(Boolean);
 if(['monsters','items','maps','npcs','quests'].includes(r[0])&&lastList!==r[0]){WS.q='';LST.cat='all';LST.sort=null}lastList=['monsters','items','maps','npcs','quests'].includes(r[0])?r[0]:lastList;
 if(!opt.back&&CUR!==h&&view.style.display!=='none')STACK.push(CUR);CUR=h;
 if(canHash()&&!opt.pop){try{history.pushState({wk:h},'',h)}catch(e){}}
 if(view.style.display==='none')showWiki();else render();try{window.scrollTo(0,view.offsetTop)}catch(e){}}
function back(){if(STACK.length)go(STACK.pop(),{back:true});else go('#wiki',{back:true})}
function render(){const r=route()||[];if(!IX)IX=build();let body;
 const [a,b]=r;
 if(!a)body=home();else if(a==='search'){WS.q=b||'';body=searchPage()}
 else if(['monsters','items','maps','npcs','quests'].includes(a))body=listPage(a);
 else body=({mon:monPage,item:itemPage,map:mapPage,npc:npcPage,quest:questPage}[a]||nf)(b);
 view.innerHTML='<div class="ws-av wk"><div class="ws-card"><div class="wk-top"><h2>📖 Maplelite Wiki</h2>'+(STACK.length?'<button class="ws-b" id="wk-back">‹ Back</button>':'')+'<form id="wk-sf"><input id="wk-s" placeholder="Search monsters, items, maps, NPCs, quests" value="'+(a==='search'?esc(WS.q):'')+'"><button class="ws-b p">Search</button></form></div>'+body+'<div class="wk-foot">Every page is read live from the game\'s own data.</div></div></div>';
 const sf=$('wk-sf');sf.onsubmit=e=>{e.preventDefault();const v=$('wk-s').value.trim();go(v?'#wiki/search/'+encodeURIComponent(v):'#wiki')};
 const bk=$('wk-back');if(bk)bk.onclick=back;
 const fq=$('wk-q');if(fq){fq.oninput=()=>{WS.q=fq.value;const pos=fq.selectionStart;render();const n=$('wk-q');if(n){n.focus();n.setSelectionRange(pos,pos)}}}
 view.querySelectorAll('[data-wsort]').forEach(x=>x.onclick=()=>{const k=x.dataset.wsort,t=(route()||[])[0];if(LST.sort===k)LST.dir=-LST.dir;else{LST.sort=k;LST.dir=defDir(t,k)}render()});
 view.querySelectorAll('[data-wcat]').forEach(x=>x.onclick=()=>{LST.cat=x.dataset.wcat;LST.sort=defSort('items');LST.dir=defDir('items',LST.sort);render()})}
function showWiki(){IX=build();document.getElementById('top').style.display='none';acct.style.display='none';const ad=$('ws-adminview');if(ad)ad.style.display='none';view.style.display='';
 document.querySelectorAll('.ws-nav a').forEach(x=>x.classList.toggle('on',x===wl));render()}
function hideWiki(){if(view.style.display==='none')return;view.style.display='none';document.getElementById('top').style.display='';wl.classList.remove('on');STACK=[];
 if(canHash()&&location.hash.startsWith('#wiki')){try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}}}
/* every in-page '#...' link is handled here so it never navigates the frame */
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a||!document.getElementById('site').contains(a))return;
 const h=a.getAttribute('href');e.preventDefault();
 if(h.startsWith('#wiki')){if(a===wl){STACK=[];CUR='#wiki';showWiki();if(canHash()){try{history.pushState({wk:'#wiki'},'',' #wiki'.trim())}catch(er){}}}else go(h);return}
 if(a.id==='ws-navacct'||a.id==='ws-navadmin')return;
 hideWiki();setTimeout(()=>{const t=document.querySelector(h);if(t)t.scrollIntoView()},30)},true);
window.addEventListener('popstate',()=>{if(!canHash())return;const h=location.hash||'';if(h.startsWith('#wiki')){CUR=h;STACK.pop();if(view.style.display==='none')showWiki();else render()}else hideWiki()});
{const hm=window.__wsHome;window.__wsHome=function(){hideWiki();return hm.apply(this,arguments)}}
if(canHash()&&location.hash.startsWith('#wiki')){CUR=location.hash;setTimeout(showWiki,0)}
window.__wiki={show:showWiki,hide:hideWiki,go,cur:()=>CUR,back,build:()=>IX=build()};
})();

/* ===== v2.4: website News/Events come only from admins (website Admin panel); no made-up posts or server status.
   The default "user" account is an admin. Posts live in LS 'mapleish_site' = {news:[...], events:[...]}. ===== */
(function(){
const $=id=>document.getElementById(id),esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY='mapleish_site';
const load=()=>{try{const d=JSON.parse(LS.getItem(KEY))||{};return{news:d.news||[],events:d.events||[]}}catch(e){return{news:[],events:[]}}};
const store=d=>{try{LS.setItem(KEY,JSON.stringify(d))}catch(e){}};
const me=()=>{const u=lsGet('mapleish_sess'),a=AC()[u];return u&&a&&a.ok?u:null};
const isAdmin=()=>{const u=me();return !!(u&&AC()[u].role==='admin')};
/* the default user account is an admin (upgrades existing browsers once) */
/* runs now and again once the async account seeding has finished, so a brand-new browser also gets it */
const seed4=()=>{if(lsGet('mapleish_seed4'))return;const ac=AC();if(!ac.user)return;ac.user.role='admin';saveAC(ac);lsSet('mapleish_seed4','1');try{paint()}catch(e){}};
seed4();[100,300,800,2000].forEach(t=>setTimeout(seed4,t));
const NTAGS=['Update','Notice','Maintenance','Patch'],ETAGS=['Ongoing','Upcoming','Ended'];
const ICON={Update:'🛠️',Notice:'📣',Maintenance:'🔧',Patch:'🩹',Ongoing:'🎁',Upcoming:'⏳',Ended:'🏁'};
let showAll=false;
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-sall]');if(b){showAll=!showAll;paint()}});
const day=t=>new Date(t).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
function postHtml(x,ev){return '<div class="ws-item"><div class="ws-ic">'+(ICON[x.tag]||'⭐')+'</div><div><b><span class="ws-tagc'+(x.tag==='Ongoing'?' e':(x.tag==='Upcoming'?' s':''))+'">'+esc(x.tag)+'</span>'+esc(x.title)+'</b><p>'+esc(x.body).replace(/\n/g,'<br>')+'</p><small class="sa-date">'+(ev&&x.when?esc(x.when)+' · ':'')+'Posted '+day(x.t)+' by '+esc(x.by)+'</small></div></div>'}
function paint(){const d=load();
 const n=$('ws-news'),e=$('ws-events');
 /* News = admin posts (newest first) followed by the update log, which is generated from the version notes at build time */
 const log=(typeof UPDATE_LOG!=='undefined'?UPDATE_LOG:[]).slice(0,showAll?999:4).map(u=>'<div class="ws-item"><div class="ws-ic">🛠️</div><div><b><span class="ws-tagc">Update</span>Version '+esc(u.v)+(u.title?': '+esc(u.title.charAt(0).toUpperCase()+u.title.slice(1)):'')+'</b>'+(u.summary.length?'<ul class="sa-sum">'+u.summary.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+'<details class="sa-more"><summary>Full update notes</summary><pre>'+esc(u.text)+'</pre></details></div></div>').join('');
 const moreBtn=(typeof UPDATE_LOG!=='undefined'&&UPDATE_LOG.length>4)?'<button class="ws-b sa-all" data-sall="1">'+(showAll?'Show fewer updates':'Show all '+UPDATE_LOG.length+' updates')+'</button>':'';
 if(n)n.innerHTML=(d.news.slice().sort((a,b)=>b.t-a.t).map(x=>postHtml(x)).join('')+log+moreBtn)||'<p class="sa-empty">No news yet.</p>';
 if(e)e.innerHTML=d.events.length?d.events.slice().sort((a,b)=>b.t-a.t).map(x=>postHtml(x,1)).join(''):'<p class="sa-empty">No events right now.</p>';
 /* server box: only numbers this browser really knows */
 const st=$('ws-stats');if(st){let ch=0,hi=0,kills=0;for(let i=0;i<6;i++){const c=slotData(i);if(c){ch++;hi=Math.max(hi,c.lvl|0);kills+=c.kills|0}}
  const r=(i,a,b)=>'<div class="ws-st"><em>'+i+'</em><b>'+b+'</b>'+a+'</div>';
  st.innerHTML='<div class="ws-grid">'+r('👥','Accounts',Object.keys(AC()).length)+r('🧙','Characters',ch+' / 6')+r('⭐','Highest level',hi||'-')+r('👾','Defeated',kills.toLocaleString())+'</div>'}
 /* nav link */
 const a=$('ws-navadmin');if(a)a.style.display=isAdmin()?'':'none';
 if(view.style.display!=='none'&&!isAdmin())hide()}
/* ---------- admin view ---------- */
const nav=document.querySelector('.ws-nav'),acct=$('ws-acctview');
const al=document.createElement('a');al.href='#admin';al.id='ws-navadmin';al.textContent='Admin';al.style.display='none';nav.appendChild(al);
const view=document.createElement('div');view.id='ws-adminview';view.style.display='none';acct.parentNode.insertBefore(view,acct.nextSibling);
let edit=null,msg='';
function form(kind){const ev=kind==='events',x=edit&&edit.kind===kind?load()[kind].find(p=>p.id===edit.id):null,tags=ev?ETAGS:NTAGS;
 return '<div class="sa-form" data-kind="'+kind+'"><div class="sa-row"><select id="sa-tag-'+kind+'">'+tags.map(t=>'<option'+(x&&x.tag===t?' selected':'')+'>'+t+'</option>').join('')+'</select><input id="sa-title-'+kind+'" maxlength="80" placeholder="Title" value="'+esc(x?x.title:'')+'"></div>'
 +(ev?'<input id="sa-when-'+kind+'" maxlength="60" placeholder="When (for example: Oct 20 - Oct 27)" value="'+esc(x?x.when||'':'')+'">':'')
 +'<textarea id="sa-body-'+kind+'" maxlength="600" rows="3" placeholder="Text">'+esc(x?x.body:'')+'</textarea>'
 +'<div class="sa-row"><button class="ws-b p" data-sa="save:'+kind+'">'+(x?'Save changes':'Post')+'</button>'+(x?'<button class="ws-b" data-sa="cancel">Cancel</button>':'')+'</div></div>'}
function listOf(kind){const L=load()[kind].slice().sort((a,b)=>b.t-a.t);
 return L.length?L.map(x=>'<div class="ws-row"><span><b>'+esc(x.title)+'</b> <small class="sa-date">'+esc(x.tag)+' · '+day(x.t)+'</small></span><span class="sa-btns"><button class="ws-b" data-sa="edit:'+kind+':'+x.id+'">Edit</button><button class="ws-b d" data-sa="del:'+kind+':'+x.id+'">Delete</button></span></div>').join(''):'<p class="sa-empty">Nothing posted.</p>'}
function draw(){view.innerHTML='<div class="ws-av"><div class="ws-card"><h2>🛠️ Website Admin</h2>'+(msg?'<p class="sa-msg">'+esc(msg)+'</p>':'')
 +'<div class="ws-h3">📰 News</div>'+form('news')+listOf('news')
 +'<div class="ws-h3">🎉 Events</div>'+form('events')+listOf('events')+'</div></div>'}
function show(){if(!isAdmin())return;document.getElementById('top').style.display='none';acct.style.display='none';const w=$('ws-wikiview');if(w)w.style.display='none';
 view.style.display='';nav.querySelectorAll('a').forEach(x=>x.classList.toggle('on',x===al));msg='';edit=null;draw();window.scrollTo(0,0)}
function hide(){if(view.style.display==='none')return;view.style.display='none';document.getElementById('top').style.display='';al.classList.remove('on')}
al.addEventListener('click',e=>{e.preventDefault();show()});
nav.querySelectorAll('a').forEach(x=>{if(x!==al)x.addEventListener('click',()=>hide(),true)});
view.addEventListener('click',e=>{const b=e.target.closest('[data-sa]');if(!b)return;if(!isAdmin()){hide();return}
 const [a,kind,id]=b.dataset.sa.split(':'),d=load();
 if(a==='save'){const g=f=>{const el=$('sa-'+f+'-'+kind);return el?el.value.trim():''};const title=g('title'),body=g('body');
  if(!title||!body){msg='Fill in a title and some text.';return draw()}
  if(edit&&edit.kind===kind){const x=d[kind].find(p=>p.id===edit.id);if(x){x.tag=g('tag');x.title=title;x.body=body;if(kind==='events')x.when=g('when');x.edited=Date.now()}msg='Saved.'}
  else{d[kind].push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),tag:g('tag'),title,body,when:kind==='events'?g('when'):'',t:Date.now(),by:me()});msg='Posted.'}
  store(d);edit=null;paint();return draw()}
 if(a==='edit'){edit={kind,id};msg='';return draw()}
 if(a==='cancel'){edit=null;msg='';return draw()}
 if(a==='del'){d[kind]=d[kind].filter(p=>p.id!==id);store(d);if(edit&&edit.id===id)edit=null;msg='Deleted.';paint();return draw()}});
{const s=window.__wsSite;window.__wsSite=function(){const r=s.apply(this,arguments);paint();return r}}
{const h=window.__wsHome;window.__wsHome=function(){hide();return h.apply(this,arguments)}}
window.addEventListener('storage',e=>{if(e.key===KEY)paint()});
paint();setTimeout(paint,600);
window.__siteAdmin={show,hide,paint};
})();

/* ===== v2.5: fixes from the full playtest ===== */
/* HP/MP recovery during combat. Auto-hunt keeps monsters coming, so a player is almost never "out of combat" and the
   old out-of-combat regen (every 5 s) never ran: mages and skill users ran dry of MP. While fighting you now recover a
   little every 10 seconds (1% max HP, 3% max MP plus INT/10). Out of combat the faster regen is unchanged. */
{let lastCR=0;setInterval(()=>{if(!P||P.dead||!enc)return;const t=Date.now();if(t-lastCR<10000)return;lastCR=t;
 P.hp=Math.min(P.maxHp,P.hp+Math.max(1,Math.floor(P.maxHp*.01)));P.mp=Math.min(P.maxMp,P.mp+Math.max(1,Math.floor(P.maxMp*.03)+Math.floor(eS('int')/10)))},1000)}
/* Spawning in combat follows the v62 spawn engine instead of a one-at-a-time trickle.
   - Every monster that dies starts its own 7.56 s respawn timer (killSlot); the board checks every second and brings
     back every spawn point that is ready, so killing several at once brings several back together.
   - A solo player can have up to 75% of the map's spawn points alive around them (party/multiplayer scaling later).
   - All of those come onto the board together, at random rows and columns. A line can hold up to 3 monsters
     (never two in the same cell). The board holds lines x 3 monsters at most.
   Before this, at most one monster joined every 3-7.5 s and a line held one monster, so kill speed was capped at about
   700 an hour whatever your damage: a warrior's Slash Blast had nothing to hit and levelled no faster than a Beginner. */
const ROWCAP=2;/* v3.4: at most 2 monsters per row */
var mapCap=()=>{const a=mobSlots(P.map);return Math.max(1,Math.floor(a.length*.75))};
const boardCap=()=>Math.min(mapCap(),monCap());
function freeCells(){const c=[];for(let r=0;r<NRf();r++){const inRow=fld.filter(o=>o.row===r);if(inRow.length>=ROWCAP)continue;for(let g=1;g<=MAXGAP;g++)if(!inRow.some(o=>o.gap===g))c.push([r,g])}return c}
function spawnWave(now,first){let n=0;const want=boardCap()-fld.length;
 for(let i=0;i<want;i++){const cells=freeCells();if(!cells.length)break;const s=claimSlot(P.map);if(s<0)break;
  const sl0=mobSlots(P.map)[s],k=sl0.k,d=MON[k],eid=++eidSeq;sl0.by=eid;const c=cells[R(0,cells.length-1)];
  fld.push({k,hp:d.hp,max:d.hp,gap:c[1],dir:Math.random()<.5?-1:1,row:c[0],eid,sm:P.map,si:s,ag:!!d.ag,mv:now+mvT(d)+R(0,600),next:now+d.iv+R(-200,200)});n++}
 return n}
const nextTick=now=>now+1000;
seek=function(){const m=MAPS[P.map];if(m.town||enc)return false;releaseStale();const now=Date.now();nextSpawn=nextTick(now);
 const n=spawnWave(now,true);if(!n)return false;enc=nearMob(null);
 log(n===1?'A '+MON[enc.k].n+' (Lv '+MON[enc.k].lv+') appears.':n+' monsters appear.','','combat');return true};
trickle=function(now){if(!autoSeek)return false;/* v3.2: with Auto-hunt off nothing respawns, so the fight ends when the board is clear */if(now<nextSpawn)return false;nextSpawn=nextTick(now);const n=spawnWave(now,false);if(n)log(n===1?'A monster appears.':n+' monsters appear.','','combat');return n>0};
/* Endure: in the original it recovers HP while hanging on ropes. This game has no ropes, so Endure does the same job
   in combat: every 31 s at Lv1 down to every 10 s at Lv8 you recover HP as if standing still (10 + Improving HP
   Recovery). It had no effect at all before. */
{let lastEn=0;setInterval(()=>{if(!P||P.dead||!enc||P.job!=='swordsman')return;const n=sl('endure');if(!n)return;const t=Date.now();
 if(t-lastEn<(34-3*n)*1000)return;lastEn=t;const x=10+hrAmt(sl('hprec'));if(P.hp<P.maxHp){P.hp=Math.min(P.maxHp,P.hp+x)}},1000)}

/* ===== v2.5: Pirate (1st job), as in GMS v62. Kyrin in The Nautilus: Navigation Room, level 10 and 20 DEX.
   Knuckles (melee, STR) for Flash Fist and Sommersault Kick; guns (DEX, ranged, use Bullets) for Double Shot.
   Skill numbers are the v83 data values (same as v62 for 1st job). Per-skill reach: skills can reach further than
   the weapon (SKREACH), which later jobs will use too. ===== */
function isPir(){return !!P&&P.job==='pirate'}
/* guns are ranged and use bullets; knuckles are melee */
for(const k in ITEMS){const it=ITEMS[k];if(!it||!it.w)continue;if(it.ty==='gun'){it.rng='gun';it.pj=['pirate'];it.jb='Pirate'}else if(it.ty==='knuckle'){it.pj=['pirate'];it.jb='Pirate'}}
if(!ITEMS.bullet)ITEMS.bullet={n:'Bullet',i:'🔩',ammo:'gun',sa:10,req:10,buy:1,sell:1};
DESC.bullet=DESC.bullet||'A bullet made out of steel. Guns fire one per shot. Weapon attack +10.';
const PIR={
 ffMp:[6,6,6,6,7,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14],
 ffDm:[156,162,168,174,180,186,192,198,204,210,216,222,228,234,240,246,252,258,264,270],
 skMp:[8,8,8,8,9,9,9,10,10,11,11,12,12,13,13,14,14,15,15,16],
 skDm:[114,118,122,126,130,134,138,142,146,150,154,158,162,166,170,174,178,182,186,190],
 skMob:[3,3,3,3,3,4,4,4,4,4,5,5,5,5,5,6,6,6,6,6],
 dsMp:[4,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,7,7,7,7],
 dsDm:[61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80],
 daMp:[14,14,14,14,15,15,15,15,16,16],daDu:[4,6,8,10,12,14,16,18,20,22],daSp:[12,14,16,18,20,22,24,26,28,30]};
/* Fill the tables from the data pack when it is present, so they always match v83 exactly */
(function(){try{const sk=V83&&V83.pirSk;if(!sk)return;for(const k in sk)if(PIR[k]&&sk[k].length)PIR[k]=sk[k]}catch(e){}})();
const SKP={
 bullettime:{ic:'⏱️',nm:'Bullet Time',max:20,ty:'Passive',pre:[],d:'Increases accuracy and avoidability.',fx:n=>'Accuracy +'+n+', avoidability +'+n},
 flashfist:{ic:'👊',nm:'Flash Fist',max:20,ty:'Active',pre:[],d:'Uses MP to speed up the punch to rapidly attack enemies.',fx:n=>'MP -'+PIR.ffMp[n-1]+', damage '+PIR.ffDm[n-1]+'%',cost:n=>PIR.ffMp[n-1]+' MP'},
 somersault:{ic:'🦶',nm:'Sommersault Kick',max:20,ty:'Active',pre:[],d:'A devastating kick that accompanies a backward sommersault. Attacks all enemies in the vicinity.',fx:n=>'MP -'+PIR.skMp[n-1]+', damage '+PIR.skDm[n-1]+'%, attacks up to '+PIR.skMob[n-1]+' monsters',cost:n=>PIR.skMp[n-1]+' MP'},
 pdshot:{ic:'🔫',nm:'Double Shot',max:20,ty:'Active',pre:[],d:'Fires two bullets at once to apply double damage to monsters.',fx:n=>'MP -'+PIR.dsMp[n-1]+', damage '+PIR.dsDm[n-1]+'% x 2'+(n>=11?' (longer range)':''),cost:n=>PIR.dsMp[n-1]+' MP · 2 bullets'},
 dash:{ic:'💨',nm:'Dash',max:10,ty:'Supportive',pre:[],d:'Temporarily boost your speed and jump.',fx:n=>'MP -'+PIR.daMp[n-1]+'; speed +'+PIR.daSp[n-1]+' for '+PIR.daDu[n-1]+' sec.',cost:n=>PIR.daMp[n-1]+' MP',du:n=>PIR.daDu[n-1]+' s'}};
Object.values(SKP).forEach(d=>d.job='Pirate');Object.assign(SKJ,SKP);
SKL.flashfist=['👊','Flash Fist'];SKL.somersault=['🦶','Sommersault Kick'];SKL.pdshot=['🔫','Double Shot'];SKL.dash=['💨','Dash'];
/* per-skill reach: a skill may reach further than the weapon's normal attack (3rd/4th job skills will add entries) */
const SKREACH={somersault:()=>Math.max(1,wReach()),pdshot:()=>3+(sl('pdshot')>=11?1:0)};
const knuckleOn=()=>!!P.weapon&&eqOk(P.weapon)&&tyOf(baseOf(P.weapon))==='knuckle';
const gunOn=()=>!!P.weapon&&eqOk(P.weapon)&&W().rng==='gun';
function pirHit(name,targets,pct,hits,maxFn){const now=Date.now();lastAtk=now;
 for(const m of targets){const d=MON[m.k];for(let h=0;h<hits;h++){if(m.hp<=0)break;const ch=Math.min(1,Math.max(.35,.8+(acc()-d.av)/50));
  if(Math.random()>ch)log(name+' misses the '+d.n+'.','','combat');else{const mx=maxFn(),x=Math.max(1,Math.floor(R(Math.max(1,Math.floor(mx*.6)),Math.max(1,mx))*pct/100));m.hp-=x;log(name+' hits the '+d.n+' for '+x+'.','hit','combat')}}}
 for(const m of targets)if(m.hp<=0&&fld.includes(m))killMob(m);render()}
function pirCheck(name,mp,reach,need){if(!enc||!isPir())return false;const now=Date.now();
 if(now<atkReady()||now-lastMv<moveCd())return false;
 if(need==='knuckle'&&!knuckleOn()){log('You need a knuckle to use '+name+'.','bad','combat');render();return false}
 if(need==='gun'&&!gunOn()){log('You need a gun to use '+name+'.','bad','combat');render();return false}
 if(enc.gap>reach&&!fld.some(m=>m.gap<=reach)){log('The '+MON[enc.k].n+' is out of reach.','','combat');render();return false}
 if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');render();return false}return true}
function skFlash(){const n=sl('flashfist');if(!n)return;const mp=PIR.ffMp[n-1];if(!pirCheck('Flash Fist',mp,wReach(),'knuckle'))return;
 if(enc.gap>wReach())enc=fld.find(m=>m.gap<=wReach());P.mp-=mp;pirHit('Flash Fist',[enc],PIR.ffDm[n-1],1,wMax)}
function skKick(){const n=sl('somersault');if(!n)return;const mp=PIR.skMp[n-1],r=SKREACH.somersault();if(!pirCheck('Sommersault Kick',mp,r,'knuckle'))return;
 P.mp-=mp;pirHit('Sommersault Kick',targetsFor(r,PIR.skMob[n-1]),PIR.skDm[n-1],1,wMax)}
function skPShot(){const n=sl('pdshot');if(!n)return;const mp=PIR.dsMp[n-1],r=SKREACH.pdshot();if(!pirCheck('Double Shot',mp,r,'gun'))return;
 if(ammoN()<2){log('You don\'t have enough Bullets.','bad','combat');return render()}
 if(enc.gap>r)enc=fld.find(m=>m.gap<=r);P.mp-=mp;useAmmo(2);pirHit('Double Shot',[enc],PIR.dsDm[n-1],2,wMax)}
function skDash(){const n=sl('dash');if(!isPir()||!n||P.dead)return;const mp=PIR.daMp[n-1];if(P.mp<mp){log('You don\'t have enough MP for that.','bad','combat');return render()}
 P.mp-=mp;P.b.dash=Date.now()+PIR.daDu[n-1]*1000;P.b.dashv=PIR.daSp[n-1];log('Dash: speed +'+PIR.daSp[n-1]+' for '+PIR.daDu[n-1]+' s.','good','combat');save();render()}
/* Bullet Time adds accuracy and avoidability; Dash adds speed */
{const _ab=accBonus;accBonus=function(){return _ab()+(isPir()?sl('bullettime'):0)}}
{const _av=avBonus;avBonus=function(){return _av()+(isPir()?sl('bullettime'):0)}}
{const _qi=qsInfo,_qu=qsUse;
 qsInfo=function(k,now){const t=v=>(v/1000).toFixed(1)+'s';
  if(SKP[k]&&k!=='bullettime'){const n=sl(k)||1,l=Math.max(atkReady(),lastMv+moveCd())-now;
   if(k==='dash'){const mp=PIR.daMp[n-1],on=P.b&&P.b.dash>now;return{ic:SKL.dash[0],nm:'Dash',sub:on?Math.ceil((P.b.dash-now)/1000)+'s':mp+' MP',dis:P.mp<mp}}
   const mp=k==='flashfist'?PIR.ffMp[n-1]:k==='somersault'?PIR.skMp[n-1]:PIR.dsMp[n-1],need=k==='pdshot'?'gun':'knuckle',ok=need==='gun'?gunOn():knuckleOn();
   const r=SKREACH[k]?SKREACH[k]():wReach(),far=!!enc&&!fld.some(m=>m.gap<=r),am=k==='pdshot'&&ammoN()<2;
   return{ic:SKL[k][0],nm:SKL[k][1],sub:!enc?mp+' MP':!ok?(need==='gun'?'Gun only':'Knuckle only'):far?'Too far':am?'No bullets':l>0?t(l):mp+' MP',dis:!enc||!ok||far||am||l>0||P.mp<mp}}
  return _qi(k,now)};
 qsUse=function(k){if(k==='flashfist')skFlash();else if(k==='somersault')skKick();else if(k==='pdshot')skPShot();else if(k==='dash')skDash();else _qu(k)}}
/* Job advancement: Kyrin, The Nautilus (Navigation Room) */
const KYRIN=['n1090000'];
{const _dl=dlg;dlg=function(){const d=_dl();if(talk&&KYRIN.includes(talk.npc)&&(!talk.page||talk.page==='main')){
  if(isPir())d.t+='<br><br><span class="mute">You are a Pirate. Your skills are in the Skills tab, under 1st Job.</span>';
  else if(!P.job&&P.lvl>=10&&P.dex>=20)d.ch.splice(d.ch.length-1,0,['I want to become a Pirate','job:pirate']);
  else if(!P.job)d.t+='<br><br><span class="mute">To become a Pirate you need level 10 and 20 DEX. You are level '+P.lvl+' with '+P.dex+' DEX.</span>'}
  return d}}
{const _dd=dlgDo;dlgDo=function(k){if(k==='job:pirate'){if(P.job||P.lvl<10||P.dex<20)return;P.job='pirate';P.sp+=1;
  log('Kyrin: You are now a Pirate. Your skills are under 1st Job in the Skills tab. Knuckles, guns and Bullets are sold in the Nautilus and in Victoria\'s department stores.','good','quest');if(talk)talk.page='main';save();return render()}return _dd(k)}}
if(NPCS.n1090000){NPCS.n1090000.i='🏴‍☠️';NPCS.n1090000.role=NPCS.n1090000.role||'Pirate instructor'}

/* ===== v2.6: timing, the way v62 works.
   - SPEED is how fast your character moves in combat: step delay = 720 ms x 100 / Speed. It no longer depends on the
     weapon. 100 is normal; equipment Speed, Nimble Feet and Dash add to it; capped at 140 (see moveCd/speed in 00-core).
   - WEAPONS have attack speed tiers (2 Faster ... 9 Slower). BOOSTERS (2nd job) lower the tier by 2, never below 2.
   - SKILLS have their own animation times, taken from meowdb.com (MapleStory Classic skill pages), which list each
     skill's time at every weapon speed, with and without a Booster. Weapon skills use the weapon's table; buffs use
     the 600 ms cast table; spells (Energy Bolt, Magic Claw 810; Magic Guard/Armor 600) are the same for any weapon.
     Casting a buff in combat takes its animation time too. Later jobs add their skills to SKDELAY from meowdb. ===== */
const SPD_TIER={540:2,600:3,660:4,720:5,780:6,840:7,900:8,960:9};/* the old tier->ms map, to read each weapon's tier back */
const TIERN=t=>t<=3?'Faster':t<=5?'Fast':t===6?'Normal':t<=8?'Slow':'Slower';
/* meowdb animation tables: tier -> [ms without booster, ms with booster] */
const T_ONE={2:[600,540],3:[660,570],4:[720,600],5:[750,660],6:[810,720],7:[870,750],8:[900,810]};/* 1H/2H swing; claw, dagger */
const T_POLE={4:[720,630],5:[750,660],6:[780,690],7:[840,735],8:[885,780]};/* spear/polearm: midpoint of meowdb's stab/swing ranges */
const T_BOW={5:[750,660],6:[810,720]};
const T_XBOW={6:[840,720],7:[870,780]};
const T_CAST={3:[510,450],4:[540,450],5:[570,510],6:[600,540],7:[660,570],8:[690,600]};/* Iron Body, Focus, Dark Sight, Rage, Boosters */
const T_RUSH={4:[360,300],5:[390,330],6:[420,360]};
const WTAB={bow:[T_BOW,810],crossbow:[T_XBOW,840],spear:[T_POLE,780],polearm:[T_POLE,780]};
/* tiers a table does not list: v62 scales each animation frame by (10 + speed)/16, rounded to 30 ms frames */
const scaleMs=(base,t)=>Math.round(base*(10+t)/16/30)*30;
function tabMs(tab,base,tier,boost){const t=Math.max(2,Math.min(9,tier));const r=tab&&tab[t];
 if(r)return boost?(r[1]!=null?r[1]:scaleMs(base,Math.max(2,t-2))):r[0];return scaleMs(base,boost?Math.max(2,t-2):t)}
/* how each action is timed (meowdb MapleStory Classic skill pages):
   w     = weapon animation (basic attack and weapon skills; the table depends on the weapon type)
   cast  = weapon-speed cast animation, 600 ms at Normal
   fixed = the same for any weapon [without, with Spell Booster]
   tab   = the skill's own table, base ms at Normal */
const SKDELAY={
 basic:'w',powerstrike:'w',slashblast:'w',arrowblow:'w',doubleshot:'w',lucky7:'w',dstab:'w',disorder:'w',
 flashfist:'w',somersault:'w',pdshot:'w',/* Pirate: meowdb has no Pirate pages; timed like the other weapon skills */
 ironbody:'cast',focus:'cast',darksight:'cast',rec:'cast',feet:'cast',dash:'cast',/* Recovery/Nimble Feet/Dash: no meowdb timing, use the standard cast */
 three:{fixed:[810,810]},ebolt:{fixed:[810,720]},mclaw:{fixed:[810,720]},mguard:{fixed:[600,540]},marmor:{fixed:[600,540]},
 /* 2nd job, filled in from meowdb as each job is built */
 rage:'cast',rush:{tab:T_RUSH,base:420}};
for(const k in ITEMS){const it=ITEMS[k];if(!it||!it.w)continue;if(it.tier==null)it.tier=SPD_TIER[it.spd]||5}
FIST.tier=6;
const boosterOn=()=>typeof seBoosterOn==='function'&&seBoosterOn();/* 2nd job weapon boosters (skill engine) */
const spellBoostOn=()=>typeof seSpellBoostOn==='function'&&seSpellBoostOn();/* Spell Booster (3rd job) */
const wTy=()=>{const w=W();return w===FIST?null:(w.ty||(()=>{try{return tyOf(P.weapon)}catch(e){return null}})())};
const weapMs=(ty,tier,boost)=>{const x=WTAB[ty]||[T_ONE,810];return tabMs(x[0],x[1],tier,boost)};
function actTime(k){const d=SKDELAY[k]||'w',tier=W().tier||6,b=boosterOn();
 if(d==='w')return weapMs(wTy(),tier,b);
 if(d==='cast')return tabMs(T_CAST,600,tier,b);
 if(d.fixed)return d.fixed[spellBoostOn()?1:0];
 return tabMs(d.tab,d.base,tier,b)}
const wAnim=()=>actTime('basic');
/* keep each weapon's spd equal to its real basic attack time, for every screen that shows or reads it */
for(const k in ITEMS){const it=ITEMS[k];if(!it||!it.w)continue;let ty=it.ty;if(!ty)try{ty=tyOf(k)}catch(e){ty=null}it.spd=weapMs(ty,it.tier,false)}
FIST.spd=810;
const BUFFK=new Set(['rec','feet','ironbody','focus','darksight','mguard','marmor','dash','rage']);
{const _qu=qsUse;qsUse=function(k){const now=Date.now();
  if(BUFFK.has(k)&&enc&&now<atkReady())return;/* still in the last action's animation */
  const a0=lastAtk,mp0=P.mp,hp0=P.hp,b0=JSON.stringify(P.b||{});_qu(k);
  if(lastAtk!==a0)lastDur=actTime(k);
  else if(BUFFK.has(k)&&enc&&(P.mp!==mp0||JSON.stringify(P.b||{})!==b0)){lastAtk=Date.now();lastDur=actTime(k)}/* casting a buff takes its animation time too */
 }}
{const _at=attack;attack=function(){const a0=lastAtk;_at();if(lastAtk!==a0)lastDur=actTime('basic')}}

/* ===== v2.7: combat input and targeting
   - Taps register instantly. Combat redraws the screen whenever a monster moves; a tap whose press and release landed
     on two different redraws was lost, so skills like Slash Blast seemed to do nothing. Skill, move and potion buttons
     now act on press (pointerdown), handled once at the app level, so redraws can no longer eat them.
   - No manual targeting: every attack goes at the closest monster (fewest columns away, then nearest row to you).
     The orange outline on the target and on its row is gone.
   - Changing class (only possible through an admin edit) removes the skills of classes you no longer belong
     to and gives their SP back. Beginner skills are kept. The temporary Warrior Guide NPC is gone. ===== */
function closestMob(){let b=null,bs=1e9;const pr=PRf();for(const m of fld){if(m.hp<=0)continue;const s=m.gap*100+Math.abs(m.row-pr);if(s<bs){bs=s;b=m}}return b}
function aimClosest(){if(!enc||!fld.length)return;const c=closestMob();if(c)enc=c}
{const _qu=qsUse;qsUse=function(k){aimClosest();return _qu(k)}}
{const _at=attack;attack=function(){aimClosest();return _at()}}
/* act on press; swallow the click that follows so nothing fires twice */
let _pressAt=0;
app.addEventListener('pointerdown',e=>{if(!P||scr!=='game'||e.button>0)return;const t=e.target.closest&&e.target.closest('[data-qs],#adv,#bk,#pq0,#pq1');if(!t||t.disabled)return;
 if(t.dataset.qs!=null&&qEdit)return;/* editing the quick slots still uses normal taps */
 _pressAt=Date.now();e.preventDefault();
 if(t.dataset.qs!=null)qsUse(P.qs[+t.dataset.qs]);else if(t.id==='adv')stand(-1);else if(t.id==='bk')stand(1);else if(t.id==='pq0')pqClick(0);else pqClick(1)},true);
app.addEventListener('click',e=>{if(Date.now()-_pressAt>700)return;const t=e.target.closest&&e.target.closest('[data-qs],#adv,#bk,#pq0,#pq1');if(!t)return;if(t.dataset.qs!=null&&qEdit)return;e.stopPropagation();e.preventDefault()},true);
/* class change: keep only beginner skills and the current class's skills */
const JOBLBL={swordsman:'Swordsman',archer:'Archer',rogue:'Rogue',magician:'Magician',pirate:'Pirate'};
function stripClassSkills(){if(!P||!P.sk)return;const lbl=JOBLBL[P.job]||null;let back=0;const gone=[];
 for(const k in P.sk){const d=SKJ[k];if(!d||!d.job)continue;if(d.job!==lbl&&(P.sk[k]|0)>0){back+=P.sk[k]|0;gone.push(d.nm||k);P.sk[k]=0}}
 if(gone.length){P.sp+=back;if(Array.isArray(P.qseen))P.qseen=P.qseen.filter(k=>!(SKJ[k]&&SKJ[k].job&&SKJ[k].job!==lbl));P.b={};try{qsSync()}catch(e){}
  log('Your class changed: '+gone.join(', ')+' removed, '+back+' SP returned.','','system');save()}}
{const _r=render;render=function(){if(scr==='game'&&P&&P.skJob!==(P.job||null)){P.skJob=P.job||null;stripClassSkills()}return _r.apply(this,arguments)}}

/* ===== v3.2: skill engine + 2nd job (all 12 branches) =====
   One engine runs every 2nd job skill straight from the v83 data (V83.sk: per-level mpCon, hpCon, damage, mad,
   mobCount, attackCount, time, prop, x, y, mastery ...). Each skill only adds its own rule below (SPEC): which weapon,
   which shape (one target, several, a row), and any special effect (stun, poison, knock-back, drain, steal ...).
   The engine also owns the things 2nd job brings: weapon boosters (attack speed), masteries (minimum damage and
   accuracy), Final Attack, MP Eater, Critical Throw, monster status effects, party-less versions of party buffs.
   Damage now follows the v62 formula: minimum = (primary stat x 0.9 x mastery + secondary stat) x attack / 100, with
   a 10% base mastery until a mastery skill raises it (it was a flat 60% of the maximum before).
   2nd job advancement at level 30: your 1st job instructor -> letter -> job instructor -> test room (30 Dark Marbles,
   or 15 Potent Wind Crystals for Pirates) -> The Proof of a Hero -> back to your instructor -> choose your path. ===== */
const SKD2=V83.sk||{};
/* ---------- branches ---------- */
const BR={
 fighter:{fam:'swordsman',n:'Fighter',ids:[1100000,1100001,1100002,1100003,1101004,1101005,1101006,1101007],d:'Masters swords and axes; Rage raises attack, Power Guard turns damage back on monsters.'},
 page:{fam:'swordsman',n:'Page',ids:[1200000,1200001,1200002,1200003,1201004,1201005,1201006,1201007],d:'Masters swords and blunt weapons; Threaten weakens monsters, Power Guard turns damage back.'},
 spearman:{fam:'swordsman',n:'Spearman',ids:[1300000,1300001,1300002,1300003,1301004,1301005,1301006,1301007],d:'Masters spears and polearms; Hyper Body raises max HP and MP, Iron Will raises defense.'},
 fpwizard:{fam:'magician',n:'Wizard (Fire, Poison)',ids:[2100000,2101001,2101002,2101003,2101004,2101005],d:'Fire Arrow and Poison Breath; Meditation raises magic attack.'},
 ilwizard:{fam:'magician',n:'Wizard (Ice, Lightning)',ids:[2200000,2201001,2201002,2201003,2201004,2201005],d:'Cold Beam freezes, Thunder Bolt hits up to 6 monsters.'},
 cleric:{fam:'magician',n:'Cleric',ids:[2300000,2301001,2301002,2301003,2301004,2301005],d:'Heal restores HP and hurts undead; Bless and Invincible protect.'},
 hunter:{fam:'archer',n:'Hunter',ids:[3100000,3100001,3101002,3101003,3101004,3101005],d:'Bows; Arrow Bomb stuns up to 6 monsters.'},
 crossbowman:{fam:'archer',n:'Crossbowman',ids:[3200000,3200001,3201002,3201003,3201004,3201005],d:'Crossbows; Iron Arrow pierces a whole row.'},
 assassin:{fam:'rogue',n:'Assassin',ids:[4100000,4100001,4100002,4101003,4101004,4101005],d:'Claws; Drain heals you, Critical Throw lands big hits.'},
 bandit:{fam:'rogue',n:'Bandit',ids:[4200000,4200001,4201002,4201003,4201004,4201005],d:'Daggers; Savage Blow hits 6 times, Steal takes items.'},
 brawler:{fam:'pirate',n:'Brawler',ids:[5100000,5100001,5101002,5101003,5101004,5101005,5101006,5101007],d:'Knuckles; Corkscrew Blow and Backspin Blow hit groups and stun.'},
 gunslinger:{fam:'pirate',n:'Gunslinger',ids:[5200000,5201001,5201002,5201003,5201004,5201005,5201006],d:'Guns; Grenade hits 6 monsters, Blank Shot stuns.'}};
/* ---------- weapon groups ---------- */
const WG={sw:['oh_sword','th_sword'],ax:['oh_axe','th_axe'],bw:['oh_bw','th_bw'],sp:['spear'],pa:['polearm'],bow:['bow'],xb:['crossbow'],cl:['claw'],dg:['dagger'],kn:['knuckle'],gn:['gun'],mw:['wand','staff']};
const curTy=()=>{const w=W();if(w===FIST||!P.weapon||!eqOk(P.weapon))return null;return w.ty||(()=>{try{return tyOf(P.weapon)}catch(e){return null}})()};
const wIs=g=>{const t=curTy();return !!t&&WG[g].includes(t)};
const WGN={sw:'sword',ax:'axe',bw:'blunt weapon',sp:'spear',pa:'polearm',bow:'bow',xb:'crossbow',cl:'claw',dg:'dagger',kn:'knuckle',gn:'gun',mw:'wand or staff'};
/* ---------- what each skill does (numbers come from the data) ----------
   k: passive | mastery | final | buff | booster | debuff | phys | magic | heal | teleport | mprec
   w: weapon group needed · sh: shape (one | multi | row) · rx: extra reach · el: element */
const SPEC={
 1100000:{k:'mastery',w:'sw'},1100001:{k:'mastery',w:'ax'},1100002:{k:'final',w:'sw'},1100003:{k:'final',w:'ax'},
 1101004:{k:'booster',w:'sw'},1101005:{k:'booster',w:'ax'},1101006:{k:'buff',fx:'rage'},1101007:{k:'buff',fx:'pguard'},
 1200000:{k:'mastery',w:'sw'},1200001:{k:'mastery',w:'bw'},1200002:{k:'final',w:'sw'},1200003:{k:'final',w:'bw'},
 1201004:{k:'booster',w:'sw'},1201005:{k:'booster',w:'bw'},1201006:{k:'debuff',fx:'threaten',reach:2},1201007:{k:'buff',fx:'pguard'},
 1300000:{k:'mastery',w:'sp'},1300001:{k:'mastery',w:'pa'},1300002:{k:'final',w:'sp'},1300003:{k:'final',w:'pa'},
 1301004:{k:'booster',w:'sp'},1301005:{k:'booster',w:'pa'},1301006:{k:'buff',fx:'ironwill'},1301007:{k:'buff',fx:'hyperbody'},
 2100000:{k:'passive',fx:'mpeater'},2101001:{k:'buff',fx:'meditation'},2101002:{k:'teleport'},2101003:{k:'debuff',fx:'slow'},
 2101004:{k:'magic',sh:'one',el:'fire'},2101005:{k:'magic',sh:'one',el:'poison',fx:'poison'},
 2200000:{k:'passive',fx:'mpeater'},2201001:{k:'buff',fx:'meditation'},2201002:{k:'teleport'},2201003:{k:'debuff',fx:'slow'},
 2201004:{k:'magic',sh:'one',el:'ice',fx:'freeze'},2201005:{k:'magic',sh:'multi',el:'lightning'},
 2300000:{k:'passive',fx:'mpeater'},2301001:{k:'teleport'},2301002:{k:'heal'},2301003:{k:'buff',fx:'invincible'},2301004:{k:'buff',fx:'bless'},
 2301005:{k:'magic',sh:'one',el:'holy'},
 3100000:{k:'mastery',w:'bow'},3100001:{k:'final',w:'bow'},3101002:{k:'booster',w:'bow'},3101003:{k:'phys',w:'bow',sh:'multi',reach:1,fx:'knockback'},
 3101004:{k:'buff',fx:'soularrow',w:'bow'},3101005:{k:'phys',w:'bow',sh:'multi',dmgKey:'x',fx:'stun'},
 3200000:{k:'mastery',w:'xb'},3200001:{k:'final',w:'xb'},3201002:{k:'booster',w:'xb'},3201003:{k:'phys',w:'xb',sh:'multi',reach:1,fx:'knockback'},
 3201004:{k:'buff',fx:'soularrow',w:'xb'},3201005:{k:'phys',w:'xb',sh:'row',rx:1},
 4100000:{k:'mastery',w:'cl'},4100001:{k:'passive',fx:'critthrow'},4100002:{k:'passive',fx:'endure'},4101003:{k:'booster',w:'cl'},
 4101004:{k:'buff',fx:'haste'},4101005:{k:'phys',w:'cl',sh:'one',fx:'drain'},
 4200000:{k:'mastery',w:'dg'},4200001:{k:'passive',fx:'endure'},4201002:{k:'booster',w:'dg'},4201003:{k:'buff',fx:'haste'},
 4201004:{k:'phys',w:'dg',sh:'one',fx:'steal'},4201005:{k:'phys',w:'dg',sh:'one'},
 5100000:{k:'passive',fx:'maxhp'},5100001:{k:'mastery',w:'kn'},5101002:{k:'phys',w:'kn',sh:'multi',fx:'stun'},5101003:{k:'phys',w:'kn',sh:'one',fx:'stun'},
 5101004:{k:'phys',w:'kn',sh:'multi',rx:1},5101005:{k:'mprec'},5101006:{k:'booster',w:'kn'},5101007:{k:'buff',fx:'barrel'},
 5200000:{k:'mastery',w:'gn'},5201001:{k:'phys',w:'gn',sh:'multi',ammo:1},5201002:{k:'phys',w:'gn',sh:'multi',rx:1,ammo:0},5201003:{k:'booster',w:'gn'},
 5201004:{k:'phys',w:'gn',sh:'multi',fx:'stun',ammo:1},5201005:{k:'buff',fx:'wings'},5201006:{k:'phys',w:'gn',sh:'one',fx:'recoil',ammo:1}};
const ICON={mastery:'📘',final:'💫',booster:'⚡',buff:'✨',debuff:'🌀',phys:'💥',magic:'🔮',heal:'💖',teleport:'🌀',mprec:'🔁',passive:'📗'};
const FXICON={rage:'😤',pguard:'🛡️',ironwill:'🧱',hyperbody:'💪',meditation:'🧘',invincible:'🔰',bless:'🙏',soularrow:'👻',haste:'💨',barrel:'🛢️',wings:'🪽',threaten:'😠',slow:'🐢',
 knockback:'🎯',stun:'💣',drain:'🩸',steal:'🫳',poison:'☠️',freeze:'❄️',mpeater:'🔵',critthrow:'🎯',endure:'❤️‍🩹',maxhp:'❤️'};
/* ---------- registry: key = 'k' + skill id ---------- */
const SE={};
for(const b in BR)for(const id of BR[b].ids){const d=SKD2[id],sp=SPEC[id];if(!d||!sp)continue;SE['k'+id]=Object.assign({id,br:b,n:d.n,max:d.max},sp)}
const seKeyOf=id=>'k'+id;
const seLv=(k,n)=>{const e=SE[k],L=(SKD2[e.id]||{}).lv||[];const i=Math.max(1,Math.min(L.length,n|0||1))-1;return L[i]||{}};
const seOwn=k=>!!SE[k]&&P&&P.job2===SE[k].br;
const seN=k=>seOwn(k)?sl(k):0;
const isJ2=b=>!!P&&P.job2===b;
const brOf=()=>P&&P.job2?BR[P.job2]:null;
/* ---------- skill window entries (same shape as the 1st job ones) ---------- */
const tyName=e=>({mastery:'Passive',final:'Passive',passive:'Passive',buff:'Supportive',booster:'Supportive',debuff:'Supportive',teleport:'Supportive',mprec:'Supportive',heal:'Active',phys:'Active',magic:'Active'})[e.k];
const NOEFFECT={wings:'This game has no jumping, so Wings has no effect here.'};
for(const k in SE){const e=SE[k],d=SKD2[e.id];
 const pre=(d.req||[]).map(([nm,lv])=>{const m=Object.keys(SE).find(x=>SE[x].br===e.br&&SE[x].n===nm);return m?[m,lv]:null}).filter(Boolean);
 SKJ[k]={ic:FXICON[e.fx]||ICON[e.k]||'✨',nm:e.n,max:e.max,ty:tyName(e),pre,d:(d.desc||'').replace(/\s*Required Skill\s*:.*$/i,'')+(NOEFFECT[e.fx]?' ('+NOEFFECT[e.fx]+')':''),
  fx:n=>seLv(k,n).t||'',job:BR[e.br].n,
  cost:(e.k==='mastery'||e.k==='final'||e.k==='passive')?null:(n=>{const l=seLv(k,n);return [l.hpCon?l.hpCon+' HP':'',l.mpCon?l.mpCon+' MP':'',l.x&&e.k==='mprec'?l.x+'% max HP':''].filter(Boolean).join(' · ')||'None'}),
  du:n=>{const l=seLv(k,n);return l.time&&e.k!=='magic'&&e.k!=='phys'?l.time+' s':''}};
 if(!SKJ[k].cost)delete SKJ[k].cost;
 if(!['mastery','final','passive'].includes(e.k))SKL[k]=[SKJ[k].ic,e.n.replace(/ : .*/,'').replace(/^(Final Attack|Power Knock-Back)$/,'$1')];
 SKT[k]=2;
 /* attack timing: spells 810 ms whatever the weapon; buffs the 600 ms cast; weapon skills swing the weapon */
 if(e.k==='magic'||e.k==='heal')SKDELAY[k]={fixed:[810,720]};
 else if(['buff','booster','debuff','mprec'].includes(e.k)){SKDELAY[k]='cast';BUFFK.add(k)}
 else if(e.k==='teleport')SKDELAY[k]={fixed:[600,540]}}
/* ---------- passives the stat formulas read ---------- */
const masteryPct=()=>{if(!P||!P.job2)return 10;for(const k in SE){const e=SE[k];if(e.k==='mastery'&&seOwn(k)&&wIs(e.w)){const n=sl(k);if(n)return 10+5*(seLv(k,n).mastery|0)}}return 10};
const masteryAcc=()=>{if(!P||!P.job2)return 0;for(const k in SE){const e=SE[k];if(e.k==='mastery'&&seOwn(k)&&wIs(e.w)){const n=sl(k);if(n)return seLv(k,n).x|0}}return 0};
const buffOn=k=>!!P&&!!P.b&&P.b[k]>Date.now();
const bv=(k,f)=>buffOn(k)&&P.b[k+'_v']?(P.b[k+'_v'][f]|0):0;
const BKEYS=()=>Object.keys(SE).filter(k=>SE[k].k==='buff'||SE[k].k==='booster');
function seWatk(){let a=0;for(const k of BKEYS())if(SE[k].fx==='rage')a+=bv(k,'pad');return a}
function seMatk(){let a=0;for(const k of BKEYS())if(SE[k].fx==='meditation')a+=bv(k,'mad');return a}
function seDef(){let a=0;for(const k of BKEYS())a+=bv(k,'pdd');return a}
function seSpeed(){let a=0;for(const k of BKEYS())if(SE[k].fx==='haste')a+=bv(k,'speed');return a}
function seBoosterOn(){if(!P||!P.job2)return false;for(const k of BKEYS()){const e=SE[k];if(e.k==='booster'&&buffOn(k)&&wIs(e.w))return true}return false}
const soulOn=()=>{if(!P||!P.job2)return false;for(const k of BKEYS()){const e=SE[k];if(e.fx==='soularrow'&&buffOn(k)&&wIs(e.w))return true}return false};
{const _ab=accBonus;accBonus=function(){let a=_ab()+masteryAcc();for(const k of BKEYS())a+=bv(k,'acc');return a}}
{const _av=avBonus;avBonus=function(){let a=_av();for(const k of BKEYS())a+=bv(k,'eva');return a}}
/* physical damage: v62 formula with mastery for the minimum; Rage adds weapon attack */
function physParts(){const w=W(),S=eS('str'),D=eS('dex'),L=eS('luk');
 const sa=(w.rng&&ammoN()>0)?((ITEMS[ammoId()]||{}).sa||0):0,watk=(w.watk||0)+sa+seWatk();let pr,sc;
 if(w.rng==='claw'){pr=L*w.mult;sc=D}else if(w.rng){pr=D*w.mult;sc=S}else if(w.dag&&isRog()){pr=L*w.mult;sc=S+D}else{pr=S*w.mult;sc=D}
 return{pr,sc,watk}}
wMax=function(){const p=physParts();return Math.floor((p.pr+p.sc)*p.watk/100)};
dmgRange=function(){const p=physParts(),mx=Math.max(1,Math.floor((p.pr+p.sc)*p.watk/100)),mn=Math.floor((p.pr*0.9*masteryPct()/100+p.sc)*p.watk/100);return[Math.max(1,Math.min(mx,mn)),mx]};
{const _mr=magRange;magRange=function(atk,mast){const m=seMatk();if(!m)return _mr(atk,mast);const w=W(),old=w.matk;try{w.matk=(old||0)+m;return _mr(atk,mast)}finally{w.matk=old}}}
/* Critical Throw (Assassin, claws) */
{const _cr=critRoll;critRoll=function(x){x=_cr(x);if(!isJ2('assassin')||!wIs('cl'))return x;const n=sl('k4100001');if(!n)return x;const l=seLv('k4100001',n);return Math.random()*100<(l.prop|0)?Math.floor(x*(l.damage||100)/100):x}}
/* Power Guard (reduce and return damage) and Invincible (reduce damage) */
{const _gt=guardTake;guardTake=function(x){if(P&&P.job2){for(const k of BKEYS()){const e=SE[k];if(!buffOn(k))continue;
   if(e.fx==='pguard'){const pct=bv(k,'x'),back=Math.floor(x*pct/100);if(back>0){x-=back;const m=fld.filter(f=>f.gap<=0&&f.hp>0).sort((a,b)=>Math.abs(a.row-PRf())-Math.abs(b.row-PRf()))[0];
     if(m){const dmg=Math.min(back,Math.floor(m.max*0.1)||back);m.hp-=dmg;m.prov=true;log('Power Guard returns '+dmg+' damage to the '+MON[m.k].n+'.','hit','combat');if(m.hp<=0&&fld.includes(m))setTimeout(()=>{if(fld.includes(m)&&m.hp<=0){killMob(m);render()}},0)}}}
   if(e.fx==='invincible')x=Math.floor(x*(100-bv(k,'x'))/100)}}
  return _gt(Math.max(0,x))}}
/* Hyper Body: max HP/MP up while it lasts (also undone after a reload) */
function hbTick(){if(!P||!P.hb)return;if(Date.now()<P.hb.until)return;P.maxHp=Math.max(1,P.maxHp-P.hb.hp);P.maxMp=Math.max(1,P.maxMp-P.hb.mp);P.hp=Math.min(P.hp,P.maxHp);P.mp=Math.min(P.mp,P.maxMp);delete P.hb;log('Hyper Body wears off.','','combat')}
/* Endure (thieves): extra HP and MP every few seconds; Improve MaxHP (Brawler): more HP per level */
let enT=0;
setInterval(()=>{if(!P||P.dead)return;hbTick();const now=Date.now();
 for(const k of ['k4100002','k4200001'])if(seOwn(k)&&sl(k)){const l=seLv(k,sl(k));if(now-enT>=(l.time||10)*1000){enT=now;P.hp=Math.min(P.maxHp,P.hp+(l.hp|0));P.mp=Math.min(P.maxMp,P.mp+(l.mp|0))}}},1000);
{const _g=gain;gain=function(x){const l0=P?P.lvl:0;const r=_g(x);if(P&&P.lvl>l0&&isJ2('brawler')&&sl('k5100000')){const add=(seLv('k5100000',sl('k5100000')).x|0)*(P.lvl-l0);P.maxHp+=add;P.hp+=add}return r}}
/* ---------- monster status effects ---------- */
const stOn=(m,f)=>m[f]&&m[f]>Date.now();
{const _mt=mobsTick;mobsTick=function(now){
  const before=new Map();for(const m of fld){if(stOn(m,'stun')||stOn(m,'frz')){m.mv=Math.max(m.mv||0,m.stun||0,m.frz||0);m.next=Math.max(m.next||0,m.stun||0,m.frz||0)}before.set(m,m.mv)}
  const r=_mt(now);
  for(const m of fld)if(stOn(m,'slow')&&m.mv!==before.get(m)&&m.mv>now)m.mv=now+Math.round((m.mv-now)*100/Math.max(20,100-(m.slowv|0)));
  return r}}
setInterval(()=>{if(!P||!enc)return;const now=Date.now();let ch=false;
 for(const m of fld){if(m.psn&&m.psn.until>now&&now>=m.psn.next){m.psn.next=now+1000;const d=Math.min(m.psn.dmg,m.hp-1);if(d>0){m.hp-=d;ch=true}}}
 if(ch&&typeof render==='function')render()},250);
/* ---------- the engine ---------- */
const seCd={};
const say=(t,c)=>{log(t,c||'','combat');render()};
const elMul=(m,el)=>{const e=(MON[m.k]||{}).el||{};const r=el&&e[el];return r==='w'?1.25:r==='r'?0.75:r==='i'?0:1};/* v62: weak x1.25, resists x0.75, immune x0 */
function seTargets(e,reach,n){const pool=fld.filter(m=>m.hp>0&&m.gap<=reach);if(!pool.length)return[];
 if(e.sh==='row'){const c=pool.slice().sort((a,b)=>a.gap-b.gap||Math.abs(a.row-PRf())-Math.abs(b.row-PRf()))[0];return pool.filter(m=>m.row===c.row).sort((a,b)=>a.gap-b.gap).slice(0,n)}
 return targetsFor(reach,n).filter(m=>m.hp>0)}
function seReach(e){if(e.reach!=null)return e.reach;if(e.k==='magic'||e.k==='heal'||e.k==='debuff')return MG_REACH;return Math.min(MAXGAP,wReach()+(e.rx|0))}
function seKill(ts){for(const m of ts)if(m.hp<=0&&fld.includes(m))killMob(m)}
/* MP Eater: magic hits may drain MP from the monster */
function mpEat(m){if(!P||!P.job2)return;const k={fpwizard:'k2100000',ilwizard:'k2200000',cleric:'k2300000'}[P.job2];if(!k||!sl(k))return;const l=seLv(k,sl(k));
 if(m.mpEaten||Math.random()*100>=(l.prop|0))return;const mm=(MON[m.k]||{}).mp||((MON[m.k]||{}).lv||1)*10;const g=Math.floor(mm*(l.x|0)/100);if(g>0){m.mpEaten=1;P.mp=Math.min(P.maxMp,P.mp+g);log('MP Eater: +'+g+' MP.','good','combat')}}
/* Final Attack: after a weapon attack, a chance of one more strong hit */
function finalAttack(){if(!P||!P.job2||!enc)return;for(const k in SE){const e=SE[k];if(e.k!=='final'||!seOwn(k)||!wIs(e.w))continue;const n=sl(k);if(!n)continue;const l=seLv(k,n);
  if(Math.random()*100>=(l.prop|0))return;const t=targetsFor(wReach(),1).filter(m=>m.hp>0)[0];if(!t)return;const d=MON[t.k],r=dmgRange(),x=Math.max(1,Math.floor(critRoll(R(r[0],r[1]))*(l.damage||100)/100));
  t.hp-=x;t.prov=true;log('Final Attack hits the '+d.n+' for '+x+'.','hit','combat');seKill([t]);return}}
function seUse(k){const e=SE[k];if(!e||!P||P.dead)return;const n=sl(k);if(!n||!seOwn(k))return;const l=seLv(k,n),now=Date.now(),nm=e.n;
 if(seCd[k]>now)return say(nm+' is not ready yet.');
 const passive=['mastery','final','passive'].includes(e.k);if(passive)return;
 const needsTarget=['phys','magic','debuff'].includes(e.k);
 if(needsTarget&&!enc)return;
 if((needsTarget||e.k==='heal'||e.k==='teleport')&&(now<atkReady()||now-lastMv<moveCd()))return;
 if(e.w&&e.k!=='buff'&&!wIs(e.w))return say('You need a '+WGN[e.w]+' to use '+nm+'.','bad');
 if((e.k==='magic'||e.k==='heal')&&!hasMW())return say('You need a wand or staff to use '+nm+'.','bad');
 const mp=l.mpCon|0,hp=l.hpCon|0;
 if(P.mp<mp)return say('You don\'t have enough MP for that.','bad');
 if(hp&&P.hp<=hp)return say('You don\'t have enough HP for that.','bad');
 const reach=seReach(e);
 /* ----- attacks ----- */
 if(e.k==='phys'||e.k==='magic'){const cnt=e.k==='magic'?(l.mobCount||(e.sh==='multi'?6:1)):(l.mobCount||1),ts=seTargets(e,reach,e.sh==='one'?1:cnt);
  if(!ts.length)return say('No enemy is in reach.');
  const ranged=e.k==='phys'&&!!W().rng,shots=(e.ammo!=null?e.ammo:(ranged?1:0));
  if(shots&&!soulOn()&&ammoN()<shots)return say('You don\'t have enough '+((ITEMS[ammoId()]||{}).n||'ammo')+'.','bad');
  P.mp-=mp;P.hp-=hp;lastAtk=now;if(shots&&!soulOn())useAmmo(shots);
  const hits=l.attackCount||1,pct=e.dmgKey?(l[e.dmgKey]||100):(l.damage||100);let dealt=0;
  for(const m of ts){const d=MON[m.k];m.prov=true;
   for(let h=0;h<hits;h++){if(m.hp<=0)break;
    const ch=Math.min(1,Math.max(.35,.8+((e.k==='magic'?accMagic():acc())-d.av)/50));
    if(Math.random()>ch){log(nm+' misses the '+d.n+'.','','combat');continue}
    let x;if(e.k==='magic'){const r=magRange(l.mad||100,10+5*(l.mastery|0));x=R(r[0],r[1])}else{const r=dmgRange();x=Math.max(1,Math.floor(critRoll(R(r[0],r[1]))*pct/100))}
    x=Math.floor(x*elMul(m,e.el));if(e.el&&elMul(m,e.el)===0){log('The '+d.n+' is immune to '+e.el+'.','','combat');continue}
    x=Math.max(1,x);m.hp-=x;dealt+=x;log(nm+' hits the '+d.n+' for '+x+'.','hit','combat');if(e.k==='magic')mpEat(m)}
   /* effects on each target that is still standing */
   if(m.hp>0){const roll=Math.random()*100<(l.prop==null?100:l.prop);
    if(e.fx==='stun'&&roll){m.stun=now+(l.time||1)*1000;log('The '+d.n+' is stunned.','','combat')}
    if(e.fx==='freeze'&&elMul(m,'ice')>0){m.frz=now+(l.time||2)*1000;log('The '+d.n+' is frozen.','','combat')}
    if(e.fx==='poison'&&roll&&elMul(m,'poison')>0){const r=magRange(l.mad||70,10+5*(l.mastery|0));m.psn={until:now+(l.time||10)*1000,next:now+1000,dmg:Math.max(1,Math.floor(r[0]/2))};log('The '+d.n+' is poisoned.','','combat')}
    if(e.fx==='knockback'&&Math.random()*100<(l.prop||70)){if(cellFree(m,m.row,Math.min(maxG(m),m.gap+1))){m.gap=Math.min(maxG(m),m.gap+1);m.mv=now+mvT(d)}}
    if(e.fx==='steal'&&!m.stolen&&roll){m.stolen=1;const dr=(DROPS[m.k]||{}).i||[];const pick=dr.filter(x=>ITEMS[x[0]]);if(pick.length){const it=pick[R(0,pick.length-1)][0];P.inv[it]=(P.inv[it]|0)+1;log('You steal '+ITEMS[it].n+' from the '+d.n+'.','good','items')}}}}
  if(e.fx==='drain'&&dealt>0){const g=Math.min(Math.floor(dealt*(l.x|0)/100),Math.floor(P.maxHp/2));if(g>0){P.hp=Math.min(P.maxHp,P.hp+g);log('Drain: +'+g+' HP.','good','combat')}}
  if(e.fx==='recoil'){shiftMobs(1,{delay:0});log('The recoil throws you back a step.','','combat')}
  seKill(ts);if(e.k==='phys')finalAttack();save();return render()}
 /* ----- heal: heals you, hurts undead in reach ----- */
 if(e.k==='heal'){P.mp-=mp;lastAtk=now;/* v62 Heal: (INT x 1.2 + LUK) x MagicTotal / 1000 x target multiplier (4 for one target: you), scaled by the skill's heal % */
  const amt=Math.max(1,Math.floor((eS('int')*1.2+eS('luk'))*(magTotal()+seMatk())/1000*4*(l.hp||100)/100));
  P.hp=Math.min(P.maxHp,P.hp+amt);log('Heal: +'+amt+' HP.','good','combat');
  if(enc){const ts=targetsFor(reach,l.mobCount||6).filter(m=>m.hp>0&&(MON[m.k]||{}).ud);for(const m of ts){const x=Math.max(1,Math.floor(amt*elMul(m,'holy')));m.hp-=x;m.prov=true;log('Heal burns the undead '+MON[m.k].n+' for '+x+'.','hit','combat')}seKill(ts)}
  save();return render()}
 /* ----- teleport: two steps back at once ----- */
 if(e.k==='teleport'){if(!enc)return;P.mp-=mp;lastMv=now-moveCd();const moved=(shiftMobs(1,{delay:0})+shiftMobs(1,{delay:0}))>0;
  log(moved?'You teleport away.':'Nothing to teleport away from.','','combat');return render()}
 /* ----- MP Recovery (Brawler) ----- */
 if(e.k==='mprec'){const cost=Math.floor(P.maxHp*(l.x|0)/100);if(P.hp<=cost)return say('You don\'t have enough HP for that.','bad');
  P.hp-=cost;const g=Math.floor(cost*(l.y||100)/100);P.mp=Math.min(P.maxMp,P.mp+g);seCd[k]=now+(l.cooltime||25)*1000;log('MP Recovery: -'+cost+' HP, +'+g+' MP.','good','combat');return render()}
 /* ----- debuffs on monsters ----- */
 if(e.k==='debuff'){const ts=targetsFor(reach,l.mobCount||6).filter(m=>m.hp>0);if(!ts.length)return say('No enemy is in reach.');
  P.mp-=mp;lastAtk=now;const until=now+(l.time||30)*1000;
  for(const m of ts){m.prov=true;if(e.fx==='threaten'){m.dis=until;m.disv=Math.abs(l.x|0)}if(e.fx==='slow'){m.slow=until;m.slowv=Math.abs(l.x|0)}}
  log(nm+' affects '+ts.length+' monster'+(ts.length>1?'s':'')+'.','good','combat');return render()}
 /* ----- buffs ----- */
 if(e.k==='buff'||e.k==='booster'){if(e.fx==='wings')return say(NOEFFECT.wings);
  if(e.fx==='barrel'&&Math.random()*100<(l.prop|0)){P.mp-=mp;seCd[k]=now+(l.cooltime||15)*1000;return say('Oak Barrel failed.')}
  P.mp-=mp;P.hp-=hp;const dur=(l.time||60)*1000;P.b[k]=now+dur;P.b[k+'_v']={pad:l.pad|0,pdd:(l.pdd|0)+(e.fx==='rage'?0:0),mad:l.mad|0,acc:l.acc|0,eva:l.eva|0,speed:l.speed|0,x:l.x|0};
  if(e.fx==='hyperbody'){if(P.hb){P.maxHp-=P.hb.hp;P.maxMp-=P.hb.mp}const ah=Math.floor((P.hb?P.maxHp:P.maxHp)*(l.x|0)/100),am=Math.floor(P.maxMp*(l.y|0)/100);P.hb={hp:ah,mp:am,until:now+dur};P.maxHp+=ah;P.maxMp+=am}
  if(e.fx==='barrel'){P.b.dark=now+dur;seCd[k]=now+(l.cooltime||15)*1000}
  log(nm+' for '+(l.time||60)+' s.','good','combat');save();return render()}}
/* ---------- quick slots ---------- */
{const _qi=qsInfo,_qu=qsUse;
 qsInfo=function(k,now){const e=SE[k];if(!e)return _qi(k,now);const n=sl(k)||1,l=seLv(k,n),ic=SKL[k]?SKL[k][0]:'✨',nm=SKL[k]?SKL[k][1]:e.n;const mp=l.mpCon|0,t=v=>(v/1000).toFixed(1)+'s';
  const wait=Math.max(atkReady(),lastMv+moveCd())-now,cd=(seCd[k]||0)-now,on=buffOn(k);
  const wrong=e.w&&e.k!=='buff'&&!wIs(e.w),wrongM=(e.k==='magic'||e.k==='heal')&&!hasMW();
  const tgt=['phys','magic','debuff'].includes(e.k),far=tgt&&!!enc&&!fld.some(m=>m.hp>0&&m.gap<=seReach(e));
  let sub=mp?mp+' MP':'Ready';if(on)sub=Math.ceil((P.b[k]-now)/1000)+'s';if(cd>0)sub=Math.ceil(cd/1000)+'s';if(wrong)sub=WGN[e.w];if(wrongM)sub='Wand/staff';if(tgt&&!enc)sub=mp+' MP';else if(far)sub='Too far';else if(tgt&&wait>0)sub=t(wait);
  return{ic,nm,sub,dis:!seOwn(k)||wrong||wrongM||cd>0||P.mp<mp||(tgt&&(!enc||far||wait>0))}};
 qsUse=function(k){if(SE[k])return seUse(k);const a0=lastAtk;_qu(k);
  /* Final Attack follows the 1st job weapon attacks too */
  if(lastAtk!==a0&&P&&P.job2&&['basic','powerstrike','slashblast','arrowblow','doubleshot','lucky7','dstab','flashfist','somersault','pdshot'].includes(k))finalAttack()}}
{const _mc=magCast;magCast=function(name,hits,mpc,atk,mast){const e0=enc;const r=_mc(name,hits,mpc,atk,mast);if(r&&e0&&fld.includes(e0)&&e0.hp>0)mpEat(e0);return r}}
/* ---------- skill window: 2nd job tab, spending, class rules ---------- */
{const _fb=featBody;featBody=function(id){if(id!=='skills'||!P)return _fb(id);SKTABS[2]=P.job2?BR[P.job2].n:'2nd Job';
  const h=_fb(id);if(!(typeof skTab!=='undefined'&&skTab===2&&P.job2))return h;
  const cut=h.indexOf('<div class="pad" style="text-align:center"><div style="font-size:40px">🔒');const head=cut>=0?h.slice(0,cut):h;
  const list=BR[P.job2].ids.map(id=>'k'+id).filter(k=>SKJ[k]).map(k=>{const d=SKJ[k],n=sl(k),on=skSel===k,ok=skPreOk(k);
   return '<div class="mrow" data-sks="'+k+'" style="cursor:pointer'+(on?';background:#fff3c4':'')+'"><span class="av">'+d.ic+'</span><div style="flex:1"><div>'+d.nm+' <span class="pill b">Lv '+n+'/'+d.max+'</span></div><div class="mute">'+(d.fx(Math.max(1,n))||'')+(ok?'':' · Requires '+preTxt(k))+'</div></div><button class="plus" data-k="'+k+'" '+(P.sp&&n<d.max&&ok?'':'disabled')+'>+</button></div>'+(on?skDetail(k):'')}).join('');
  return head+list}}
{const _sp=spendSk;spendSk=function(k){if(!P)return;
  if(SE[k]){const d=SKJ[k];if(!seOwn(k)||P.sp<1||(P.sk[k]|0)>=d.max||!skPreOk(k))return;P.sk[k]=(P.sk[k]|0)+1;P.sp--;save();return render()}
  if(P.job2&&SKJ[k]&&!SKD[k])return;/* after 2nd job, new SP goes to 2nd job skills only (v62) */
  return _sp(k)}}
{const _jn=jobName;jobName=function(){return P&&P.job2&&BR[P.job2]?BR[P.job2].n:_jn()}}
stripClassSkills=function(){if(!P||!P.sk)return;if(P.job2&&(!BR[P.job2]||BR[P.job2].fam!==P.job))delete P.job2;
 const ok=new Set([JOBLBL[P.job]||null,P.job2?BR[P.job2].n:null].filter(Boolean));let back=0;const gone=[];
 for(const k in P.sk){const d=SKJ[k];if(!d||!d.job)continue;if(!ok.has(d.job)&&(P.sk[k]|0)>0){back+=P.sk[k]|0;gone.push(d.nm||k);P.sk[k]=0}}
 if(gone.length){P.sp+=back;if(Array.isArray(P.qseen))P.qseen=P.qseen.filter(k=>!(SKJ[k]&&SKJ[k].job&&!ok.has(SKJ[k].job)));P.b={};try{qsSync()}catch(e){}
  log('Your class changed: '+gone.join(', ')+' removed, '+back+' SP returned.','','system');save()}};
/* ---------- 2nd job advancement ---------- */
const J2={swordsman:{npc:'balrog',test:'n1072000',inside:'n1072004',map:'v108000300',letter:'i4031008',ln:'Dances with Balrog\'s Letter',item:'i4031013',need:30,town:'Perion'},
 magician:{npc:'grendel',test:'n1072001',inside:'n1072005',map:'v108000200',letter:'i4031009',ln:'Grendel the Really Old\'s Letter',item:'i4031013',need:30,town:'Ellinia'},
 archer:{npc:'athena',test:'n1072002',inside:'n1072006',map:'v108000100',letter:'i4031010',ln:'Athena Pierce\'s Letter',item:'i4031013',need:30,town:'Henesys'},
 rogue:{npc:'darklord',test:'n1072003',inside:'n1072007',map:'v108000400',letter:'i4031011',ln:'Dark Lord\'s Letter',item:'i4031013',need:30,town:'Kerning City'},
 pirate:{npc:'n1090000',test:'n1090000',inside:'n1072008',map:'v108000500',letter:null,item:'i4031857',need:15,town:'the Nautilus'}};
const PROOF='i4031012';
if(!ITEMS[PROOF])ITEMS[PROOF]={n:'The Proof of a Hero',i:'🏅',sell:0};DESC[PROOF]=DESC[PROOF]||'Proof that you passed the 2nd job advancement test.';
for(const f in J2){const j=J2[f];if(j.letter&&!ITEMS[j.letter])ITEMS[j.letter]={n:j.ln,i:'✉️',sell:0};if(!ITEMS[j.item])ITEMS[j.item]={n:j.item==='i4031013'?'Dark Marble':'Potent Wind Crystal',i:j.item==='i4031013'?'🔮':'💎',sell:0}}
/* test rooms: no walking in or out, you are sent there and back */
for(const f in J2){const m=MAPS[J2[f].map];if(m){m.ex=[];m.hidden=1;m.jobtest=f;m.need=999;if(NAV[J2[f].map])delete NAV[J2[f].map];if(WPOS[J2[f].map])delete WPOS[J2[f].map]}}
if(MON.m9001005&&!(DROPS.m9001005&&DROPS.m9001005.i&&DROPS.m9001005.i.some(x=>x[0]==='i4031857')))DROPS.m9001005={m:[0,0,0],i:[['i4031857',0.7,1,1]]};
for(const k of ['m9000100','m9000101','m9000200','m9000201','m9000001','m9000002','m9000300','m9000301'])if(MON[k])MON[k].n=MON[k].n.replace(/ 2$/,'');
const outsideMap=f=>Object.keys(MAPS).find(k=>!MAPS[k].hidden&&(MAPS[k].npcs||[]).includes(J2[f].test))||Object.keys(MAPS).find(k=>(MAPS[k].npcs||[]).includes(J2[f].npc));
const j2st=()=>(P.j2=P.j2||{});
function j2Dlg(d){const n=talk.npc,f=P.job,j=J2[f];if(!j||P.job2||P.lvl<30)return;
 const st=j2st();
 /* 1st job instructor: start the test, or choose your path with the proof */
 if(n===j.npc){if(P.inv[PROOF]>0){d.t+='<br><br>You have The Proof of a Hero. Choose your path. This choice is final.';
    for(const b in BR)if(BR[b].fam===f)d.ch.splice(d.ch.length-1,0,['Become a '+BR[b].n+': '+BR[b].d,'j2:pick:'+b]);return}
  if(!st.letter){if(P.sp>0){d.t+='<br><br><span class="mute">You are ready for the 2nd job advancement, but spend your remaining '+P.sp+' SP first.</span>';return}
   d.ch.splice(d.ch.length-1,0,['I want the 2nd job advancement','j2:start'])}
  else d.t+='<br><br><span class="mute">'+(j.letter?'Take my letter to the job instructor near '+j.town+'.':'Go into the test room through me when you are ready.')+'</span>'}
 /* the job instructor outside the test room (Kyrin for pirates) */
 if(n===j.test&&st.letter&&!(P.inv[PROOF]>0)&&MAPS[P.map]&&!MAPS[P.map].jobtest){d.t+='<br><br>Collect '+j.need+' '+ITEMS[j.item].n+'s in the test room and bring them to my colleague inside.';d.ch.splice(d.ch.length-1,0,['Enter the test room','j2:enter'])}
 /* the instructor inside the test room */
 if(n===j.inside&&MAPS[P.map]&&MAPS[P.map].jobtest){const have=P.inv[j.item]|0;d.t+='<br><br>'+ITEMS[j.item].n+': '+have+' / '+j.need+'.';
  if(have>=j.need)d.ch.splice(d.ch.length-1,0,['Hand over the '+j.need+' '+ITEMS[j.item].n+'s','j2:proof']);d.ch.splice(d.ch.length-1,0,['Leave the test room','j2:leave'])}}
{const _dl=dlg;dlg=function(){const d=_dl();try{if(talk&&P)j2Dlg(d)}catch(e){}return d}}
{const _dd=dlgDo;dlgDo=function(k){if(!/^j2:/.test(k))return _dd(k);const f=P.job,j=J2[f];if(!j)return;const st=j2st();
  if(k==='j2:start'){if(P.lvl<30||P.job2||P.sp>0)return;st.letter=1;if(j.letter)P.inv[j.letter]=(P.inv[j.letter]|0)+1;
   log(j.letter?'You receive '+ITEMS[j.letter].n+'. Take it to the job instructor near '+j.town+'.':'Kyrin: Talk to me again to enter the test room.','good','quest')}
  else if(k==='j2:enter'){if(!st.letter)return;if(j.letter&&!(P.inv[j.letter]>0)){P.inv[j.letter]=1}
   delete P.inv[j.item];enc=null;fld=[];autoSeek=false;seeking=false;P.map=j.map;talk=null;log('You enter '+MAPS[j.map].n+'. Collect '+j.need+' '+ITEMS[j.item].n+'s.','good','quest')}
  else if(k==='j2:proof'){if((P.inv[j.item]|0)<j.need)return;delete P.inv[j.item];if(j.letter)delete P.inv[j.letter];P.inv[PROOF]=1;enc=null;fld=[];autoSeek=false;P.map=outsideMap(f)||P.map;talk=null;
   log('You receive The Proof of a Hero. Take it back to your instructor.','good','quest')}
  else if(k==='j2:leave'){delete P.inv[j.item];enc=null;fld=[];autoSeek=false;P.map=outsideMap(f)||P.map;talk=null;log('You leave the test room.','','quest')}
  else if(k.startsWith('j2:pick:')){const b=k.slice(8);if(!BR[b]||BR[b].fam!==f||!(P.inv[PROOF]>0))return;delete P.inv[PROOF];P.job2=b;P.skJob=P.job;P.sp+=1;delete P.j2;
   log('You are now a '+BR[b].n+'! Your new skills are in the Skills tab under '+BR[b].n+'.','good','quest');try{qsSync()}catch(e){}}
  save();render()}}
/* bosses and test rooms: never a training target for travel, the world map or the auto path */
if(typeof canTravel==='function'){const _ct=canTravel;canTravel=function(k){return !(MAPS[k]&&MAPS[k].hidden)&&_ct(k)}}

/* ===== v3.2: combat fixes from play testing =====
   - One monster per cell. Players may share a cell, monsters may not: walking, wandering, closing in, advancing,
     backing away, knock-back, Teleport and Recoil Shot all stop at an occupied cell.
   - Monsters step every 2.4 s at Speed 0 (was 1.4 s; monsters without data stepped every 0.6 s).
   - Auto-hunt off: nothing respawns, so the fight ends when the board is clear. And you can walk away: with Auto-hunt
     off, Back step when no monster is next to you leaves the fight. ===== */
var cellFree=(m,row,gap)=>!fld.some(o=>o!==m&&o.hp>0&&o.row===row&&o.gap===gap);
/* move every monster by d columns (+1 away, -1 closer), nearest first when closing in, farthest first when backing off */
function shiftMobs(d,opts){const now=Date.now(),o=opts||{};let moved=0;
 const ms=fld.filter(m=>m.hp>0).sort((a,b)=>d<0?a.gap-b.gap:b.gap-a.gap);
 for(const m of ms){const g=Math.max(0,Math.min(MAXGAP,m.gap+d));if(g===m.gap||!cellFree(m,m.row,g))continue;m.gap=g;moved++;
  if(d<0&&g<=0)m.next=now+MON[m.k].iv;if(d>0&&o.delay!=null)m.mv=now+o.delay+mvT(MON[m.k])}
 return moved}
stand=function(dir){if(!enc&&!fld.some(m=>m.hp>0))return;const now=Date.now(),mc=moveCd();if(now-lastAtk<mc||now-lastMv<mc)return;
 if(dir<0){if(!fld.some(m=>m.gap>0))return;lastMv=now;shiftMobs(-1);log('You advance.','','combat');return render()}
 if(!autoSeek&&!fld.some(m=>m.hp>0&&m.gap<=0)){/* walk away */const a=WORLD[P.map];if(a)a.forEach(s=>{if(s.by&&fld.some(m=>m.eid===s.by))s.by=0});
  fld=[];enc=null;lastMv=now;log('You walk away from the fight.','','combat');return render()}
 if(!fld.some(m=>m.gap<MAXGAP))return;lastMv=now;
 if(Math.random()<Math.min(.9,Math.max(.25,.5+(speed()-100)/100))){shiftMobs(1,{delay:mc*2});lastMv=now-Math.floor(mc/2);log('You back away.','','combat')}
 else log('You stumble and fail to back away.','bad','combat');
 render()};
/* the skill engine's pushes respect cells too */
{const _mv=(m,d)=>{const g=Math.max(0,Math.min(MAXGAP,m.gap+d));if(g!==m.gap&&cellFree(m,m.row,g)){m.gap=g;return true}return false};
 window.__pushMob=_mv}

/* ===== v3.2: the Maple Island shops from the data, with their own stock and prices (as Victoria's since v2.2):
   - Sid, Amherst Weapon Store: Razor, Wooden Club, Hand Axe, Sword.
   - Lucy, Amherst Department Store: Egg, Apple, White/Orange/Red Potion, plus Green Apple (30 MP) and Blue Potion (100 MP, 200 mesos as in Victoria's shops). Green Apple is not
     in any Maple Island shop in the data; it was added on request so magician hopefuls can keep MP up before Victoria.
     The data has no shop price for it, so it costs 60 mesos (about 2 mesos per MP, like Blue Potions).
   - Pan, Southperry Armor Store: the 13 beginner clothes for 50 mesos each.
   The old made-up Amherst town shop is gone; you shop by talking to the shopkeeper. ===== */
{const mi=(npc,key,role,shopName,extra)=>{const D=NPCS[key];if(!D||!D.shopList)return null;const N=NPCS[npc]||(NPCS[npc]={n:D.n,i:'🛒',hi:D.hi});
  N.role=role;N.shop=1;N.shopName=shopName;N.shopList=D.shopList.slice();N.shopPrice=Object.assign({},D.shopPrice);
  for(const [id,pr] of extra||[])if(ITEMS[id]&&!N.shopList.includes(id)){N.shopList.push(id);N.shopPrice[id]=pr;if(!ITEMS[id].buy)ITEMS[id].buy=pr}
  return N};
 mi('sid','n11000','Weapon seller','Amherst Weapon Store');
 if(mi('lucy','n11100','Grocer','Amherst Department Store',[['i2010009',60],['i2000003',200]])){NPCS.lucy.i='🧺';if(!MAPS.amherst.npcs.includes('lucy'))MAPS.amherst.npcs.splice(MAPS.amherst.npcs.indexOf('sid')+1,0,'lucy')}
 if(mi('pan','n21000','Armor seller','Southperry Armor Store')){NPCS.pan.i='👕';if(!MAPS.southperry.npcs.includes('pan'))MAPS.southperry.npcs.push('pan')}
 for(const k of ['n11000','n11100','n21000'])delete NPCS[k];
 delete MAPS.amherst.shop;delete MAPS.amherst.shopList;
 MAPS.amherst.hint='Sid sells weapons and Lucy sells potions and food. Lucas and Rain have quests.';
 MAPS.southperry.hint=(MAPS.southperry.hint||'')+' Pan sells beginner clothes.';
 if(NPCS.sid)NPCS.sid.hi='On sale! Really CHEAP!'}
/* ===== v3.2: Maple Island keeps its own v62-style layout; the maps and NPCs the data has that it was missing are added
   (the Adventurer Training Center stays out):
   - Split Road of Destiny (east of Amherst): the five job instructors explain their classes. Tomato Field now opens off
     it, and it leads on to Southperry, as in the data.
   - Amherst Townstreet, between Amherst and the Small Field of Flowers.
   - Mushroom Town 2 is the data's Mushroom Town Townstreet (renamed).
   - New NPCs: Robin (Dangerous Forest), Bari (The Field West of Southperry), Paul (Southperry), Lucy and Pan (shops
     above). Their data lines are used as their greetings. ===== */
{const SR={sr_athena:['Athena Pierce','🏹','Bowman instructor',"Bowmen are blessed with dexterity and power, taking charge of long-distance attacks, providing support for those at the front line of the battle. Very adept at using landscape as part of the arsenal."],
  sr_grendel:['Grendel the Really Old','🧙','Magician instructor',"Magicians are armed with flashy element-based spells and secondary magic that aids party as a whole. After the 2nd job adv., the elemental-based magic will provide ample amount of damage to enemies of opposite element."],
  sr_balrog:['Dances with Balrog','⚔️','Warrior instructor',"Warriors possess an enormous power with stamina to back it up, and they shine the brightest in melee combat situation. Regular attacks are powerful to begin with, and armed with complex skills, the job is perfect for explosive attacks."],
  sr_darklord:['Dark Lord','🗡️','Thief instructor',"Thieves are a perfect blend of luck, dexterity, and power that are adept at the surprise attacks against helpless enemies. A high level of avoidability and speed allows Thieves to attack enemies from various angles."],
  sr_kyrin:['Kyrin','🔫','Pirate instructor',"Pirates are blessed with outstanding dexterity and power, utilizing their guns for long-range attacks while using their power on melee combat situations. Gunslingers use elemental-based bullets for added damage, while Infighters transform to a different being for maximum effect."]};
 const where={sr_athena:'Henesys',sr_grendel:'Ellinia',sr_balrog:'Perion',sr_darklord:'Kerning City',sr_kyrin:'the Nautilus'};
 for(const k in SR){const a=SR[k];NPCS[k]={n:a[0],i:a[1],role:a[2],hi:a[3]+' Reach level 10 (Magicians level 8) and come see me in '+where[k]+' on Victoria Island to become one.'}}
 Object.assign(NPCS,{
  robin:{n:'Robin',i:'📖',role:'Walking encyclopedia',hi:"Be careful! You'll see monsters around here. Tap a monster to attack it, and walk over what it drops to pick it up."},
  bari:{n:'Bari',i:'🪵',role:"Pio's nephew",hi:'I am good at making anything! Since my uncle is Pio in Amherst, he used to teach me lots of things when I was young.'},
  paul:{n:'Paul',i:'🧒',role:'Event goer',hi:"Where's my brother...? I need to get to where the event takes place..."}});
 MAPS.split_road_of_destiny={n:'Split Road of Destiny',i:'🪧',d:'The road where beginners choose their future. The five job instructors wait here to tell you about their classes.',town:1,ret:'amherst',mons:[],
  npcs:['sr_balrog','sr_grendel','sr_athena','sr_darklord','sr_kyrin'],ex:[['amherst','West to Amherst'],['tomato_field','Tomato Field'],['southperry','South to Southperry']],art:['#86c765','#5fa84a']};
 MAPS.amherst_townstreet={n:'Amherst Townstreet',i:'🏘️',d:'A quiet street of houses at the edge of Amherst, leading out to the flower fields.',town:1,ret:'amherst',mons:[],npcs:[],
  ex:[['amherst','Back to Amherst'],['snail_field','Small Field of Flowers']],art:['#9fd27a','#6fb24f']};
 const relink=(from,old,to,label)=>{const m=MAPS[from];if(!m)return;const e=m.ex.find(x=>x[0]===old);if(e){e[0]=to;e[1]=label}else m.ex.push([to,label])};
 /* Amherst -> Split Road of Destiny (Tomato Field moves behind it); Amherst -> Amherst Townstreet -> flowers */
 relink('amherst','tomato_field','split_road_of_destiny','East to the Split Road of Destiny');
 relink('amherst','snail_field','amherst_townstreet','Amherst Townstreet');
 relink('tomato_field','amherst','split_road_of_destiny','Back to the Split Road of Destiny');
 relink('snail_field','amherst','amherst_townstreet','Back to Amherst Townstreet');
 if(!MAPS.southperry.ex.some(e=>e[0]==='split_road_of_destiny'))MAPS.southperry.ex.splice(1,0,['split_road_of_destiny','North to the Split Road of Destiny']);
 MAPS.training_camp.n='Mushroom Town Townstreet';
 MAPS.dangerous_forest.npcs=(MAPS.dangerous_forest.npcs||[]).concat(['robin']);
 MAPS.field_west_of_southperry.npcs=(MAPS.field_west_of_southperry.npcs||[]).concat(['bari']);
 MAPS.southperry.npcs.splice(0,0,'paul');
 /* world map positions (island coordinates, as in 10-maple-island.js) */
 for(const [k,x,y,l] of [['split_road_of_destiny',86,46,'Destiny Rd'],['amherst_townstreet',70,57,'Townstreet']]){NAV[k]=[x,y,l];WPOS[k]=[2+x*.36,30+y*.56]}
 if(NAV.training_camp)NAV.training_camp[2]='Townstreet'}
/* ===== v3.2: the shop items that were missing (they need things the game did not do yet):
   - Return Scrolls (Nearest Town, Lith Harbor, Ellinia, Perion, Henesys, Kerning City, Sleepywood, Nautilus): take you to
     that town at once, ending any fight. Not in job test rooms; on Maple Island only Nearest Town works (one way island).
   - Timed potions (Warrior, Magic, Sniper, Dexterity, Speed Potion; also Wizard Potion, Drake's Blood/Meat, Sap of
     Ancient Tree from drops): their W.ATK / M.ATK / Accuracy / Avoid / Speed / W.DEF bonus for the data's duration.
     Using the same potion again restarts its timer.
   - 100% scrolls from El Moth and Tulcus: real game scrolls (Inventory -> Enchanting), +1 of the data's stat, never fail.
   - Status cures (Antidote, Eyedrop, Tonic, Holy Water, All Cure Potion), Pet Food, Revitalizer and the Sky-blue Wooden
     Chair are sold, but there are no player status effects, pets or sitting yet, so using them only says so (and does not
     use them up). ===== */
{/* 100% scrolls -> game scrolls */
 const norm=t=>t.toLowerCase().replace('pole arm','polearm').replace('knuckler','knuckle').replace('blunt weapon','bw');
 const STK={'W.Atk':'watk','M.Atk':'matk','W.Def':'def','M.Def':'mdef','HP':'hp','DEX':'dex','INT':'int','LUK':'luk','STR':'str','Jump':'jump','Speed':'speed','Avoid':'eva'};
 if(typeof LBL!=='undefined'&&!LBL.eva)LBL.eva='Avoid';
 const swap={};
 for(const id in ITEMS){const it=ITEMS[id];if(!it.scr100)continue;const nm=norm(it.n);
  const tg=(WT.concat(AF)).map(a=>[a[0],norm(a[1])]).sort((a,b)=>b[1].length-a[1].length).find(a=>nm.includes('for '+a[1]+' for'));
  const m=/^([A-Za-z.]+) \+(\d+)/.exec(it.scr100);if(!tg||!m||!STK[m[1]])continue;const st=STK[m[1]],key=tg[0]+'_'+st+'_100';
  if(!SCR[key])addS(key,it.n.replace(/ 100%$/,'')+' 100%',100,tg[0],{[st]:+m[2]});ITEMS['sc_'+key].buy=it.buy;ITEMS['sc_'+key].sell=it.sell;swap[id]='sc_'+key}
 for(const k in NPCS){const N=NPCS[k];if(!N.shopList)continue;N.shopList=N.shopList.map(id=>{if(!swap[id])return id;if(N.shopPrice){N.shopPrice[swap[id]]=N.shopPrice[id];delete N.shopPrice[id]}return swap[id]})}
 for(const k in DROPS)if(DROPS[k]&&DROPS[k].i)DROPS[k].i.forEach(e=>{if(swap[e[0]])e[0]=swap[e[0]]});
 /* quest rewards too; the old id stays as a pointer to the game scroll so nothing that still names it breaks */
 for(const q in QD){const w=QD[q].rw;if(!w)continue;if(w.items)for(const id in w.items)if(swap[id]){w.items[swap[id]]=w.items[id];delete w.items[id]}if(w.rand)w.rand=w.rand.map(id=>swap[id]||id)}
 for(const id in swap)ITEMS[id]=ITEMS[swap[id]];
 /* timed potion bonuses: P.ib = {itemId: until}; the bonus is read from the item */
 const ib=k=>{if(!P||!P.ib)return 0;const now=Date.now();let a=0;for(const id in P.ib){if(P.ib[id]<=now){delete P.ib[id];continue}const b=ITEMS[id]&&ITEMS[id].buff;if(b&&b[k])a+=b[k]}return a};
 window.itemBuff=ib;
 {const f=seWatk;seWatk=function(){return f()+ib('watk')}}{const f=seMatk;seMatk=function(){return f()+ib('matk')}}
 {const f=seSpeed;seSpeed=function(){return f()+ib('speed')}}{const f=seDef;seDef=function(){return f()+ib('def')}}
 {const f=accBonus;accBonus=function(){return f()+ib('acc')}}{const f=avBonus;avBonus=function(){return f()+ib('eva')}}
 const TOWN={'Lith Harbor':'lith_harbor','Ellinia':'ellinia','Perion':'perion','Henesys':'henesys','Kerning City':'kerning_city','Sleepywood':'v105040300','Nautilus':'v120000000'};
 const special=it=>it&&(it.ret||it.buff||it.cure||it.pet||it.chair);
 const LB={watk:'W.ATK',matk:'M.ATK',acc:'Accuracy',eva:'Avoid',speed:'Speed',def:'W.DEF',mdef:'M.DEF'};
 const bText=b=>Object.keys(b).map(k=>(LB[k]||k)+' +'+b[k]).join(', ');
 const _use=useItem;useItem=function(id){const it=ITEMS[id];if(!special(it))return _use(id);if(!P||!(P.inv[id]>0))return;
  const take=()=>{P.inv[id]--;if(P.inv[id]<=0)delete P.inv[id]};
  if(it.ret){if(P.dead)return;const m=MAPS[P.map]||{};if(m.hidden||m.jobtest){log('You cannot use that here.','bad','items');return render()}
   const onMaple=!m.vid&&!(typeof VNAV!=='undefined'&&VNAV[P.map]);const to=it.ret==='Nearest Town'?(m.ret||P.map):TOWN[it.ret];
   if(it.ret!=='Nearest Town'&&onMaple){log('Return Scrolls to Victoria Island do not work on Maple Island.','bad','items');return render()}
   if(!to||!MAPS[to]){log('That scroll has nowhere to take you.','bad','items');return render()}
   if(to===P.map&&!fld.length){log('You are already in '+MAPS[to].n+'.','','items');return render()}
   const a=WORLD[P.map];if(a)a.forEach(s=>{if(s.by&&fld.some(m2=>m2.eid===s.by))s.by=0});gmEnd();take();P.map=to;P.kills=0;tab='play';
   log('You read the '+it.n+' and arrive in '+MAPS[to].n+'.','good','items');save();return render()}
  if(it.buff){P.ib=P.ib||{};P.ib[id]=Date.now()+it.dur*1000;take();log(it.n+': '+bText(it.buff)+' for '+(it.dur>=120?Math.round(it.dur/60)+' minutes':it.dur+' seconds')+'.','good','items');save();return render()}
  log(it.cure?'You are not affected by anything it cures (player status effects are not in the game yet).':it.pet?'You do not have a pet (pets are not in the game yet).':'You sit down for a moment (sitting does nothing yet).','','items');return render()};
 const _pop=popHtml;popHtml=function(){const it=pop&&ITEMS[pop.id];if(!pop||pop.eq||!special(it))return _pop.apply(this,arguments);const n=P.inv[pop.id]||0;
  const left=it.buff&&P.ib&&P.ib[pop.id]>Date.now()?Math.ceil((P.ib[pop.id]-Date.now())/1000):0;
  const rows=[['Type',it.ret?'Return Scroll':it.buff?'Potion':it.chair?'Chair':'Consumable'],[it.ret?'Takes you to':it.buff?'Effect':'Use',it.ret?it.ret:it.buff?bText(it.buff)+' for '+it.dur+' s':'No effect yet']].concat(left?[['Active',left+' s left']]:[]).concat([['Owned',n]]);
  return '<div class="mcard"><div class="mh"><span class="mi">'+it.i+'</span><div><b>'+it.n+'</b><div class="mute">'+(it.d||'')+'</div></div></div>'+rows.map(r=>'<div class="mr"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('')+'<div class="ex" style="margin-top:10px">'+(n>0?'<button class="main" data-pa="use">Use</button>':'')+'<button data-pa="close">Close</button></div></div>'}}
/* ===== v3.2: the scrolling notice bar across the top of the game and the website (like v62's top notice). It always
   shows the welcome with the version and the server time (California, Pacific time); then any hot-time running now
   (name, EXP/drop boost, when it ends), the current rates when they are not x1, and the admin's custom message
   (Admin menu -> World settings / Hot-time). Hot-times are separate from the website's Events. ===== */
(function(){
 const VER=()=>(typeof UPDATE_LOG!=='undefined'&&UPDATE_LOG[0]&&UPDATE_LOG[0].v)||'';
 /* times show in the player's own time zone (from the browser), with the zone name */
 const fmt=t=>{try{return new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',timeZoneName:'short'})}catch(e){return new Date(t).toLocaleTimeString()}};
 const wallFmt=w=>{const d=new Date(w);let h=d.getUTCHours(),m=d.getUTCMinutes();const ap=h<12?'AM':'PM';h=h%12||12;return h+':'+String(m).padStart(2,'0')+' '+ap};
 const bar=document.createElement('div');bar.id='topnote';bar.setAttribute('aria-live','off');
 bar.innerHTML='<div class="tn-run"><span class="tn-w"></span><span class="tn-sep">✦</span><span class="tn-t"></span><span class="tn-x"></span></div>';
 document.body.appendChild(bar);
 const $=c=>bar.querySelector(c),sep='<span class="tn-sep">✦</span>';let last='';
 const timeText=()=>'Time '+fmt(Date.now());
 function fill(){const c=worldCfg(),hot=hotNow(),er=expRate(),dr=dropRate();
  $('.tn-w').textContent='Welcome to Maplelite'+(VER()?' v'+VER():'')+'!';$('.tn-t').textContent=timeText();
  let x=hot.map(h=>sep+'<span class="tn-hot">🔥 Hot-time: '+esc2(h.name)+'</span> EXP x'+clampR(h.exp)+(clampR(h.drop)>1?', Drop x'+clampR(h.drop):'')+' until '+fmt(Date.now()+(hotState(h).ends-hotState(h).wall))).join('');
  if(er!==1||dr!==1)x+=sep+'Rates now: EXP x'+er+', Drop x'+dr;
  const ev=typeof evTickerText==='function'?evTickerText():'';if(ev)x+=sep+'<span class="tn-hot">'+esc2(ev)+'</span>';
  if(c.msg)x+=sep+esc2(c.msg);$('.tn-x').innerHTML=x}
 function tick(){/* hidden while combat locks the screen, so it never covers the fight */const locked=typeof scr!=='undefined'&&scr==='game'&&typeof fld!=='undefined'&&fld.length>0&&typeof scrollLockPref!=='undefined'&&scrollLockPref&&tab==='play';
  const on=(typeof scr==='undefined'||scr!=='game'||!!P)&&!locked;bar.style.display=on?'':'none';document.body.classList.toggle('has-topnote',on);
  if(!on)return;const k=JSON.stringify(worldCfg())+'|'+hotNow().map(h=>h.name).join(',')+'|'+(typeof evTickerText==='function'?evTickerText():'');if(k!==last){last=k;fill()}else $('.tn-t').textContent=timeText()}
 fill();tick();setInterval(tick,1000);
 const st=document.createElement('style');st.textContent=
  '#topnote{position:fixed;left:0;right:0;top:0;height:22px;z-index:9000;overflow:hidden;background:rgba(20,28,52,.88);border-bottom:2px solid #f2c14e;color:#fff6d8;font:12px/22px Maplestory,Arial,sans-serif;white-space:nowrap;pointer-events:none}'
  +'#topnote .tn-run{display:inline-block;padding-left:100%;animation:tnScroll 30s linear infinite}'
  +'#topnote .tn-sep{color:#f2c14e;margin:0 10px}#topnote .tn-w{color:#ffe27a;font-weight:bold}#topnote .tn-hot{color:#ff9d5c;font-weight:bold}'
  +'@keyframes tnScroll{from{transform:translateX(0)}to{transform:translateX(-100%)}}'
  +'@media (prefers-reduced-motion:reduce){#topnote .tn-run{animation-duration:70s}}'
  +'body.has-topnote #app,body.has-topnote #site{padding-top:24px}';
 document.head.appendChild(st)})();

/* ===== v3.3: real positions on the combat grid
   - You stand on a column of the 7-wide grid (PC). Monsters stand on a side of you (m.side: +1 right, -1 left) at a
     distance (m.gap: 0 = the cell next to you). One monster per cell; players may share cells.
   - Spawn side: the arrow button on your character card picks where you appear when a fight starts: left edge (monsters
     come from the right), center (from both sides) or right edge (from the left). It never changes a fight in progress.
   - You face your target. Advance steps toward it, Back step away from it (Back step can still stumble). Stepping off
     either edge of the grid leaves the fight, but not within your movement time of attacking or being hit.
   - Targeting: every attack goes at the nearest monster it can reach (fewest steps away, counting rows), or the nearest
     monster if none is in reach. If the old target is gone, the nearest one becomes the target at once, so you can never
     be left in a fight with nothing to attack. ===== */
let PC=0,inFight=false,lastHit=0;
const SPAWN_SIDES=[['left','◀','Left'],['center','▼','Center'],['right','▶','Right']];
const spawnCol=()=>{const s=(P&&P.spawn)||'left';return s==='center'?Math.floor(COLS/2):s==='right'?COLS-1:0};
function maxG(m){return m.side<0?PC-1:COLS-2-PC}
const colOf=m=>PC+(m.side<0?-1:1)*(m.gap+1);
cellFree=function(m,row,gap,side){const sd=side||(m&&m.side)||1,c=PC+(sd<0?-1:1)*(gap+1);if(c<0||c>=COLS||gap<0)return false;
 return !fld.some(o=>o!==m&&o.hp>0&&o.row===row&&colOf(o)===c)};
/* every free cell a new monster may appear in: not right next to you */
freeCells=function(){const c=[];for(let r=0;r<NRf();r++){const inRow=fld.filter(o=>o.row===r&&o.hp>0);if(inRow.length>=ROWCAP)continue;
  for(const sd of [1,-1]){const mg=sd<0?PC-1:COLS-2-PC;for(let g=1;g<=mg;g++)if(cellFree(null,r,g,sd))c.push([r,g,sd])}}return c};
spawnWave=function(now,first){let n=0;const want=boardCap()-fld.length;
 for(let i=0;i<want;i++){const cells=freeCells();if(!cells.length)break;const s=claimSlot(P.map);if(s<0)break;
  const sl0=mobSlots(P.map)[s],k=sl0.k,d=MON[k],eid=++eidSeq;sl0.by=eid;const c=cells[R(0,cells.length-1)];
  fld.push({k,hp:d.hp,max:d.hp,gap:c[1],side:c[2],dir:Math.random()<.5?-1:1,row:c[0],eid,sm:P.map,si:s,ag:!!d.ag,mv:now+mvT(d)+R(0,600),next:now+d.iv+R(-200,200)});n++}
 return n};
/* any monster made elsewhere (tutorial, tests, older code) gets a valid side and cell */
function fixPos(){const alive=fld.filter(m=>m.hp>0);
 if(!alive.length){if(!fld.length)inFight=false;return}
 if(!inFight){inFight=true}
 for(const m of alive){if(m.side!==1&&m.side!==-1)m.side=PC>=COLS-1?-1:1;
  if(m.side<0&&PC<=0)m.side=1;if(m.side>0&&PC>=COLS-1)m.side=-1;
  m.gap=Math.max(0,Math.min(maxG(m),m.gap|0))}
 const seen=new Set();for(const m of alive){let k=m.row+':'+colOf(m);if(!seen.has(k)){seen.add(k);continue}
  /* clash: move to the nearest free cell in the same row, either side */
  let done=false;for(let g=0;g<COLS&&!done;g++)for(const sd of [m.side,-m.side]){const mg=sd<0?PC-1:COLS-2-PC;if(g>mg)continue;const kk=m.row+':'+(PC+sd*(g+1));if(!seen.has(kk)){m.side=sd;m.gap=g;seen.add(kk);done=true;break}}}}
{const _sk=seek;seek=function(){if(!enc&&!fld.length){PC=spawnCol();inFight=false}return _sk.apply(this,arguments)}}
/* targeting */
const stepsTo=m=>Math.max(m.gap,Math.abs(m.row-PRf()));
closestMob=function(r){const alive=fld.filter(m=>m.hp>0);if(!alive.length)return null;const inR=r==null?[]:alive.filter(m=>m.gap<=r);
 const pool=inR.length?inR:alive;let b=null,bs=1e9;for(const m of pool){const s=stepsTo(m)*1000+m.gap*10+Math.abs(m.row-PRf());if(s<bs){bs=s;b=m}}return b};
const reachFor=k=>{try{if(!k||k==='basic')return wReach();if(typeof SE!=='undefined'&&SE[k])return seReach(SE[k]);if(typeof SKREACH!=='undefined'&&SKREACH[k])return SKREACH[k]();if(k==='ebolt'||k==='mclaw')return MG_REACH}catch(e){}return wReach()};
/* v3.4: the target is always the nearest monster you can reach (checked on every redraw), so buttons never show
   "Too far" while a monster stands next to you */
const keepTarget=()=>{if(fld.some(m=>m.hp>0))enc=closestMob(wReach())};
aimClosest=function(){keepTarget()};
{const _qu=qsUse;qsUse=function(k){fixPos();if(fld.some(m=>m.hp>0))enc=closestMob(reachFor(k));return _qu(k)}}
{const _at=attack;attack=function(){fixPos();if(fld.some(m=>m.hp>0))enc=closestMob(wReach());return _at()}}
/* who hit you last: for the leave-the-fight rule */
{const _mt=mobsTick;mobsTick=function(){const h=P&&P.hp;const r=_mt.apply(this,arguments);if(P&&P.hp<h)lastHit=Date.now();return r}}
const facing=()=>{const t=enc&&enc.hp>0?enc:closestMob(null);return t?(t.side<0?-1:1):(PC>=COLS-1?-1:1)};
/* move yourself one column; monsters keep their cells */
function stepTo(nc){const cols=fld.map(m=>[m,colOf(m)]);PC=nc;for(const [m,c] of cols){m.side=c<PC?-1:1;m.gap=Math.abs(c-PC)-1;if(m.gap<0){m.gap=0}}fixPos()}
function leaveFight(){const a=WORLD[P.map];if(a)a.forEach(s=>{if(s.by&&fld.some(m=>m.eid===s.by))s.by=0});fld=[];enc=null;autoSeek=false;seeking=false;inFight=false;log('You leave the fight.','','combat')}
stand=function(dir){if(!enc&&!fld.some(m=>m.hp>0))return;fixPos();const now=Date.now(),mc=moveCd();if(now-lastAtk<mc||now-lastMv<mc)return;
 const f=facing(),nc=PC+(dir<0?f:-f);
 if(nc<0||nc>=COLS){if(now-Math.max(lastAtk,lastHit)<mc){log('You are still in the thick of it. You can\'t leave the fight yet.','bad','combat');return render()}
  lastMv=now;leaveFight();return render()}
 if(fld.some(m=>m.hp>0&&m.row===PRf()&&colOf(m)===nc)){log('A monster blocks the way.','','combat');return render()}
 if(dir>0&&Math.random()>=Math.min(.9,Math.max(.25,.5+(speed()-100)/100))){lastMv=now;log('You stumble and fail to back away.','bad','combat');return render()}
 lastMv=now;stepTo(nc);for(const m of fld)if(m.gap<=0&&m.hp>0&&now>m.next-200)m.next=Math.max(m.next,now+Math.round(MON[m.k].iv/2));
 log(dir<0?'You advance.':'You back away.','','combat');render()};
/* the skill engine's moves: d=-1 a step toward your target, d=+1 a step away; returns 1 if you moved */
shiftMobs=function(d){if(!fld.length)return 0;fixPos();const f=facing(),nc=PC+(d<0?f:-f);
 if(nc>=0&&nc<COLS&&!fld.some(m=>m.hp>0&&m.row===PRf()&&colOf(m)===nc)){stepTo(nc);return 1}
 /* no room behind you (edge of the grid): Teleport and Recoil Shot push the monsters back instead */
 if(d>0){let n=0;for(const m of fld.filter(m=>m.hp>0).sort((a,b)=>b.gap-a.gap))if(window.__pushMob(m,1))n++;return n?1:0}return 0};
window.__pushMob=(m,d)=>{const g=Math.max(0,Math.min(maxG(m),m.gap+d));if(g!==m.gap&&cellFree(m,m.row,g)){m.gap=g;return true}return false};
/* the grid */
laneHtml=function(){fixPos();const LH=Math.max(20,Math.min(30,Math.floor(210/NRf())));let h='<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;min-height:'+(NRf()*(LH+3)-3)+'px">';
 const f=facing();
 for(let r=0;r<NRf();r++){const ms=fld.filter(m=>m.row===r&&m.hp>0);let c='';
  for(let i=0;i<COLS;i++){const cell=ms.filter(m=>colOf(m)===i),me=i===PC&&r===PRf();
   c+='<div style="flex:1;display:flex;justify-content:center;align-items:center;font-size:'+(cell.length>2?12:Math.min(18,LH-6))+'px;line-height:'+(LH-2)+'px;border-left:'+(i?'1px dashed #b9c4d6':'0')+'">'+(me?'<span title="You" style="white-space:nowrap">'+(f<0?'<small style="font-size:9px">◀</small>':'')+'🧍'+(f>0?'<small style="font-size:9px">▶</small>':'')+'</span>':'')+cell.map(m=>'<span style="position:relative;display:inline-block">'+MON[m.k].i+'<span style="position:absolute;left:8%;right:8%;bottom:0;height:3px;background:#4a463c;border-radius:2px"><i style="display:block;height:100%;width:'+Math.max(0,m.hp/m.max*100)+'%;background:#d9534f;border-radius:2px"></i></span></span>').join('')+'</div>'}
  h+='<div class="lrow" style="display:flex;background:rgba(120,140,180,.12);border-radius:6px;min-height:'+LH+'px">'+c+'</div>'}
 return h+'</div>'};
/* keep the target valid on every redraw, and draw the spawn-side button in the fight section (next to Lock) */
{const _r=render;render=function(){if(fld.length){fixPos();keepTarget()}else inFight=false;const out=_r.apply(this,arguments);
  try{if(typeof scr!=='undefined'&&scr==='game'&&P){const lk=document.getElementById('slk'),st=document.getElementById('sk');if((lk||st)&&!document.getElementById('spawnbtn')){const s=SPAWN_SIDES.find(x=>x[0]===(P.spawn||'left'))||SPAWN_SIDES[0];
    const b=document.createElement('button');b.id='spawnbtn';b.type='button';b.title='Where you appear when a fight starts. Tap to change.';b.textContent='Start: '+s[2]+' '+s[1];
    b.style.cssText='min-height:34px;padding:2px 10px;font-size:12px;white-space:nowrap;margin-right:6px';if(lk)lk.insertAdjacentElement('beforebegin',b);else{b.style.margin='8px auto 0';b.style.display='block';st.insertAdjacentElement('afterend',b)}}}}catch(e){}
  return out}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#spawnbtn');if(!b||!P)return;e.stopPropagation();const i=SPAWN_SIDES.findIndex(x=>x[0]===(P.spawn||'left'));P.spawn=SPAWN_SIDES[(i+1)%3][0];
 log('Spawn side: '+SPAWN_SIDES[(i+1)%3][2]+'. You will appear there when your next fight starts.','','combat');save();render()},true);

/* ===== v3.3: the Maze event (a scheduled event, separate from hot-time and from the website's Events page)
   - When: every 4 hours on the hour, California time (12 AM, 4 AM, 8 AM, 12 PM, 4 PM, 8 PM), plus any extra start an
     admin schedules (Admin menu -> Maze event). An admin can turn the 4-hour schedule off.
   - How: at the start time entries open and a 5-minute countdown runs; then the maze starts and runs for 10 minutes.
     Entries stay open the whole 15 minutes: talk to the Maplelite Administrator in any town to join (once per event).
     Before the start you wait in the Event Waiting Room; after it you go straight into the maze.
   - The maze: the same grid as combat, no skills, no monsters. Move Up, Down, Back and Forward (one step per your
     movement time, from Speed) and reach the flag at the far end. Everyone in one event gets the same maze.
   - Finish or run out of time: either way you go to the Event Prize Room. The prize NPC gives finishers an Event
     Trophy, and takes everyone back to the town they joined from.
   - No trading in event maps (trading only ever works between players on the same map).
   - While an event is open, a timer block at the top of the Play screen shows the time left and the nearest town with
     an Maplelite Administrator; the notice bar announces it too. ===== */
(function(){
 const EV_WAIT=5*60e3,EV_RUN=10*60e3,EV_LEN=EV_WAIT+EV_RUN,SLOT=4*3600e3;
 const EVNPC='maplelite_admin',EVTOWNS=['amherst','southperry','lith_harbor','henesys','ellinia','perion','kerning_city'];
 /* the schedule */
 if(typeof gmOpen!=='undefined')gmOpen.evt=true;
 const evCfg=()=>{const c=worldCfg();return c.ev&&typeof c.ev==='object'?c.ev:{}};
 function evStarts(now){const c=evCfg(),out=[];if(c.auto!==false){const w=pacWall(now),sw=Math.floor(w/SLOT)*SLOT;out.push(now-(w-sw),now-(w-sw)+SLOT)}
  for(const t of Array.isArray(c.extra)?c.extra:[])if(+t>0)out.push(+t);return out.sort((a,b)=>a-b)}
 window.evState=function(now){now=now||Date.now();const s=evStarts(now).find(t=>now>=t&&now<t+EV_LEN);
  if(s==null){const nx=evStarts(now).find(t=>t>now);return{phase:null,next:nx}}
  return{phase:now<s+EV_WAIT?'wait':'run',id:Math.floor(s/60e3),start:s,runAt:s+EV_WAIT,end:s+EV_LEN}};
 /* maps and NPCs */
 const EVMAPS=['evt_lobby','evt_maze','evt_prize'];
 window.inEventMap=k=>EVMAPS.includes(k||(P&&P.map));
 Object.assign(MAPS,{
  evt_lobby:{n:'Event Waiting Room',i:'⏳',d:'Contestants gather here until the maze opens.',town:1,hidden:1,noTrade:1,ret:'henesys',mons:[],npcs:[],ex:[],art:['#b9a3e3','#8e74c9']},
  evt_maze:{n:'The Maze',i:'🌀',d:'Find the way to the flag before time runs out.',town:1,hidden:1,noTrade:1,ret:'henesys',mons:[],npcs:[],ex:[],art:['#9fd27a','#5fa84a']},
  evt_prize:{n:'Event Prize Room',i:'🏆',d:'Where every contestant ends up. Collect your prize, then head home.',town:1,hidden:1,noTrade:1,ret:'henesys',mons:[],npcs:['evt_prize'],ex:[],art:['#f2d27a','#d9a640']}});
 for(const k of EVMAPS){delete NAV[k];if(typeof WPOS!=='undefined')delete WPOS[k]}
 NPCS[EVNPC]=Object.assign(NPCS[EVNPC]||{},{n:'Maplelite Administrator',i:'🛡️',role:'Events',hi:NPCS[EVNPC]&&NPCS[EVNPC].hi||'Welcome! Events are held here every 4 hours.'});
 NPCS.evt_prize={n:'Maplelite Administrator',i:'🏆',role:'Event prizes',hi:'Well done, everyone! Talk to me for your prize and a ride home.'};
 for(const t of EVTOWNS)if(MAPS[t]&&!(MAPS[t].npcs||[]).includes(EVNPC))(MAPS[t].npcs=MAPS[t].npcs||[]).push(EVNPC);
 if(!ITEMS.i4000038)ITEMS.i4000038={n:'Event Trophy',i:'🏆',sell:30000,d:'A souvenir for entering the event. Made out of gold, so you can sell it for a high price.'};
 /* the maze: 5 rows x 21 columns of tiles, carved from 3 x 11 rooms; the same for everyone in one event */
 const MR=5,MC=21;let mz=null;
 function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
 function makeMaze(id){const r=rng(id*2654435761),W=[...Array(MR)].map(()=>Array(MC).fill(1)),seen=new Set(),st=[[2,0]];W[2][0]=0;seen.add('2,0');
  while(st.length){const [y,x]=st[st.length-1],nb=[[0,2],[0,-2],[2,0],[-2,0]].map(d=>[y+d[0],x+d[1],d]).filter(q=>q[0]>=0&&q[0]<MR&&q[1]>=0&&q[1]<MC&&!seen.has(q[0]+','+q[1]));
   if(!nb.length){st.pop();continue}const q=nb[Math.floor(r()*nb.length)];W[y+q[2][0]/2][x+q[2][1]/2]=0;W[q[0]][q[1]]=0;seen.add(q[0]+','+q[1]);st.push([q[0],q[1]])}
  /* a few extra openings so it is not a single corridor */
  for(let i=0;i<6;i++){const y=[0,2,4][Math.floor(r()*3)],x=1+2*Math.floor(r()*10);W[y][x]=0}
  const gy=[0,2,4][Math.floor(r()*3)];return{W,gy,gx:MC-1}}
 const mzFor=id=>{if(!mz||mz.id!==id){mz=Object.assign(makeMaze(id),{id,y:2,x:0})}return mz};
 window.mazeForTest=id=>makeMaze(id);
 /* joining, leaving, prizes */
 function evJoin(){const s=evState();if(!s.phase)return log('There is no event right now.','','quest');if(P.evt&&P.evt.id===s.id)return log('You already took part in this event.','','quest');
  P.evt={id:s.id,from:P.map,done:false,got:false};talk=null;inShop=false;
  if(s.phase==='wait'){P.map='evt_lobby';log('You enter the Event Waiting Room. The maze opens in '+fmtLeft(s.runAt-Date.now())+'.','good','quest')}
  else{P.map='evt_maze';mz=null;mzFor(s.id);log('You enter the maze. Find the flag!','good','quest')}
  tab='play';save();render()}
 function toPrize(won){if(!P.evt)P.evt={id:0,from:'henesys'};P.evt.done=!!won;P.map='evt_prize';mz=null;
  log(won?'You reached the flag! Collect your Event Trophy from the Maplelite Administrator.':'Time is up. The Maplelite Administrator will take you home.',won?'good':'','quest');save();render()}
 function goHome(){const to=P.evt&&MAPS[P.evt.from]&&!inEventMap(P.evt.from)?P.evt.from:'henesys';P.map=to;talk=null;log('You are back in '+MAPS[to].n+'.','','quest');save();render()}
 const fmtLeft=ms=>{ms=Math.max(0,ms);const m=Math.floor(ms/60e3),s=Math.floor(ms%60e3/1000);return m+':'+String(s).padStart(2,'0')};
 /* talking */
 {const _dl=dlg;dlg=function(){const d=_dl();try{if(talk&&P){const n=talk.npc,s=evState(),last=d.ch.length-1;
   if(n===EVNPC&&!inEventMap()&&(!talk.page||talk.page==='main')){
    if(s.phase){const joined=P.evt&&P.evt.id===s.id;d.t+='<br><br>🎉 <b>The Maze event is open!</b> '+(s.phase==='wait'?'It starts in '+fmtLeft(s.runAt-Date.now())+'.':'It ends in '+fmtLeft(s.end-Date.now())+'.')+(joined?' You already took part in this one.':'');if(!joined)d.ch.splice(last,0,['Join the Maze event','ev:join'])}
    else d.t+='<br><br><span class="mute">The next Maze event starts '+(s.next?'at '+new Date(s.next).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'when an admin schedules one')+'.</span>'}
   if(n==='evt_prize'&&P.map==='evt_prize'){const won=P.evt&&P.evt.done&&!P.evt.got;
    d.t=won?'Congratulations on finishing the maze! Here is your Event Trophy.':P.evt&&P.evt.got?'Thanks for taking part. Ready to go home?':'Not this time, but thanks for taking part! Ready to go home?';
    d.ch=(won?[['Take the Event Trophy','ev:prize']]:[]).concat([['Return to '+(P.evt&&MAPS[P.evt.from]?MAPS[P.evt.from].n:'Henesys'),'ev:home']])}}}catch(e){}return d}}
 {const _dd=dlgDo;dlgDo=function(k){if(!/^ev:/.test(k))return _dd(k);
   if(k==='ev:join')return evJoin();
   if(k==='ev:prize'){if(P.evt&&P.evt.done&&!P.evt.got){P.evt.got=true;P.inv.i4000038=(P.inv.i4000038||0)+1;log('You received an Event Trophy.','good','items');save()}talk.page='main';return render()}
   if(k==='ev:home')return goHome()}}
 /* trading: same map only, never in event maps */
 window.canTradeWith=other=>!!(P&&other&&other.map===P.map&&!(MAPS[P.map]||{}).noTrade);
 /* moving in the maze */
 let lastStep=0;
 window.mazeMove=function(dy,dx,force){if(!P||P.map!=='evt_maze')return;const s=evState();if(s.phase!=='run'||!P.evt||P.evt.id!==s.id)return;
  const m=mzFor(s.id),now=Date.now(),cd=moveCd();if(!force&&now-lastStep<cd)return;const y=m.y+dy,x=m.x+dx;
  if(y<0||y>=MR||x<0||x>=MC||m.W[y][x]){lastStep=now;return render()}lastStep=now;m.y=y;m.x=x;
  if(y===m.gy&&x===m.gx)return toPrize(true);render()};
 function mazeHtml(){const s=evState(),m=mzFor(s.id),x0=Math.max(0,Math.min(MC-7,m.x-3)),LH=28;let h='<div class="pad"><div class="row"><h2>🌀 The Maze</h2><b id="mz-left">'+fmtLeft(s.end-Date.now())+'</b></div><div class="mute">Reach the 🏁. Column '+(m.x+1)+' of '+MC+'.</div><div style="margin-top:8px;display:flex;flex-direction:column;gap:3px">';
  for(let y=0;y<MR;y++){let c='';for(let x=x0;x<x0+7;x++){const wall=m.W[y][x],me=y===m.y&&x===m.x,goal=y===m.gy&&x===m.gx;
    c+='<div style="flex:1;display:flex;justify-content:center;align-items:center;min-height:'+LH+'px;font-size:18px;border-left:'+(x>x0?'1px dashed #b9c4d6':'0')+';background:'+(wall?'#6b5a4a':'transparent')+'">'+(me?'🧍':goal?'🏁':wall?'<span style="font-size:13px">🧱</span>':'')+'</div>'}
   h+='<div class="lrow" style="display:flex;background:rgba(120,140,180,.12);border-radius:6px;overflow:hidden">'+c+'</div>'}
  const b=(id,t,l)=>'<button id="'+id+'" style="flex:1;min-height:54px;font-size:15px">'+t+'<br><small>'+l+'</small></button>';
  return h+'</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">'+'<div></div>'+b('mzU','▲','Up')+'<div></div>'+b('mzB','◀','Back')+b('mzD','▼','Down')+b('mzF','▶','Forward')+'</div><div class="mute" style="margin-top:6px">No skills or items here, just your feet. Arrow keys work too.</div></div>'}
 document.addEventListener('pointerdown',e=>{const t=e.target.closest&&e.target.closest('#mzU,#mzD,#mzB,#mzF');if(!t)return;e.preventDefault();({mzU:()=>mazeMove(-1,0),mzD:()=>mazeMove(1,0),mzB:()=>mazeMove(0,-1),mzF:()=>mazeMove(0,1)})[t.id]()},true);
 document.addEventListener('keydown',e=>{if(!P||P.map!=='evt_maze'||/INPUT|TEXTAREA|SELECT/.test((e.target||{}).tagName||''))return;const k={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(k){e.preventDefault();mazeMove(k[0],k[1])}});
 /* nearest town with an Maplelite Administrator, by walking distance */
 function nearestEvTown(){const start=P.map,seen=new Set([start]),q=[start];while(q.length){const k=q.shift();if(EVTOWNS.includes(k)&&MAPS[k])return k;for(const e of (MAPS[k]&&MAPS[k].ex)||[])if(MAPS[e[0]]&&!seen.has(e[0])){seen.add(e[0]);q.push(e[0])}}return 'henesys'}
 /* the timer block, maze panel and event map clean-up on every redraw */
 {const _r=render;render=function(){const out=_r.apply(this,arguments);try{if(typeof scr!=='undefined'&&scr==='game'&&P&&tab==='play'){const app=document.getElementById('app'),tabs=app&&app.querySelector('.tabs');const s=evState();
   if(s.phase&&tabs&&!document.getElementById('evtimer')){const inEv=inEventMap(),joined=P.evt&&P.evt.id===s.id;const d=document.createElement('div');d.id='evtimer';d.className='panel';
    const near=nearestEvTown();d.innerHTML='<div class="pad" style="display:flex;align-items:center;gap:10px"><span style="font-size:24px">🎉</span><div style="flex:1"><b>Maze event '+(s.phase==='wait'?'starts in':'ends in')+' <span id="ev-left">'+fmtLeft((s.phase==='wait'?s.runAt:s.end)-Date.now())+'</span></b><div class="mute">'+(inEv?(P.map==='evt_lobby'?'Waiting for the maze to open.':P.map==='evt_maze'?'Find the flag!':'Collect your prize from the Maplelite Administrator.'):joined?'You already took part in this one.':'Join at the Maplelite Administrator. Nearest: '+MAPS[near].n+'.')+'</div></div></div>';
    tabs.insertAdjacentElement('afterend',d)}
   if(P.map==='evt_maze'&&s.phase==='run'){const first=app.querySelector(':scope > .panel:not(#evtimer)');if(first)first.innerHTML=mazeHtml();
    app.querySelectorAll(':scope > .panel').forEach(p=>{if(p.querySelector('.qgrid,.tiles,.wm'))p.style.display='none'})}}}catch(e){}return out}}
 /* every second: countdowns, moving contestants along, sending everyone home when it is over */
 let lastPhase='';setInterval(()=>{if(!P||typeof scr==='undefined'||scr!=='game')return;const s=evState(),ph=(s.phase||'')+':'+(s.id||'');
  const L=document.getElementById('ev-left');if(L&&s.phase)L.textContent=fmtLeft((s.phase==='wait'?s.runAt:s.end)-Date.now());
  const M=document.getElementById('mz-left');if(M&&s.phase)M.textContent=fmtLeft(s.end-Date.now());
  if(inEventMap()&&P.map!=='evt_prize'){if(!P.evt||!s.phase||P.evt.id!==s.id)return toPrize(false);
   if(P.map==='evt_lobby'&&s.phase==='run'){P.map='evt_maze';mz=null;mzFor(s.id);log('The maze is open. Go!','good','quest');save();return render()}}
  if(ph!==lastPhase){lastPhase=ph;render()}},1000);
 /* for the notice bar */
 window.evTickerText=()=>{const s=evState();return s.phase?(s.phase==='wait'?'🎉 Maze event: entries are open, it starts in '+fmtLeft(s.runAt-Date.now()).replace(/:\d\d$/,' min')+'. Talk to the Maplelite Administrator in any town.':'🎉 Maze event running now. Join at the Maplelite Administrator in any town.'):''};
 /* admin: Maze event schedule */
 {const _gp=gmPanel;gmPanel=function(role){let h=_gp(role);if(role!=='admin')return h;const c=evCfg(),s=evState(),ex=(Array.isArray(c.extra)?c.extra:[]).filter(t=>t+EV_LEN>Date.now()).sort((a,b)=>a-b);
   const lt=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
   const body='<div class="mute" style="font-size:13px">Every 4 hours on the hour (California time) entries open for 5 minutes, then the maze runs for 10. '+(s.phase?'<b>An event is open now ('+s.phase+').</b>':'Next: '+(s.next?lt(s.next):'none scheduled')+'.')+'</div>'
    +'<div style="display:flex;gap:6px;margin-top:6px"><button data-gm="evauto">'+(c.auto===false?'Turn the 4-hour schedule on':'Turn the 4-hour schedule off')+'</button><button data-gm="evnow">Start one now</button></div>'
    +ex.map((t,i)=>'<div class="mrow"><span class="av">🌀</span><div style="flex:1">'+lt(t)+'</div><button data-gm="evdel:'+t+'">Cancel</button></div>').join('')
    +(ex.length<24?'<div style="display:flex;gap:6px;margin-top:6px"><input id="so_gm_evdate" type="date" value="'+(soDraft.so_gm_evdate||'')+'" style="flex:1;min-width:0"><input id="so_gm_evtime" type="time" value="'+(soDraft.so_gm_evtime||'')+'" style="flex:1;min-width:0"><button data-gm="evadd">Schedule</button></div><div class="mute" style="font-size:12px">Extra start time, California time.</div>':'');
   const open=!!gmOpen.evt;
   return h.replace('<div class="panel win"><button data-gm="tg:self"','<div class="panel win"><button data-gm="tg:evt" style="width:100%;display:flex;justify-content:space-between;padding:10px 12px;border-radius:0;box-shadow:none;border-width:0 0 2px 0"><span>Maze event</span><span>'+(open?'▾':'▸')+'</span></button>'+(open?'<div class="pad">'+body+'</div>':'')+'</div><div class="panel win"><button data-gm="tg:self"')}}
 {const _gd=gmDo;gmDo=function(a,arg){if(!/^ev/.test(a))return _gd(a,arg);if(!isAdm()){gmMsg='Admins only.';return render()}
   const c=worldCfg(),ev=c.ev&&typeof c.ev==='object'?c.ev:{};ev.extra=(Array.isArray(ev.extra)?ev.extra:[]).filter(t=>t+EV_LEN>Date.now());
   if(a==='evauto'){ev.auto=ev.auto===false?true:false;gmMsg='The 4-hour Maze event schedule is '+(ev.auto?'on':'off')+'.';audit('maze schedule '+(ev.auto?'on':'off'))}
   else if(a==='evnow'){if(evState().phase){gmMsg='An event is already open.';return render()}ev.extra.push(Date.now());gmMsg='A Maze event is open now. It starts in 5 minutes.';audit('started a maze event')}
   else if(a==='evdel'){ev.extra=ev.extra.filter(t=>String(t)!==String(arg));gmMsg='Event cancelled.';audit('cancelled a maze event')}
   else if(a==='evadd'){const d=((document.getElementById('so_gm_evdate')||{}).value||soDraft.so_gm_evdate||''),t=((document.getElementById('so_gm_evtime')||{}).value||soDraft.so_gm_evtime||'');
    const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(d),tm=/^(\d\d?):(\d\d)$/.exec(t);if(!m||!tm){gmMsg='Pick a date and time (California time).';return render()}
    const wall=Date.UTC(+m[1],+m[2]-1,+m[3],+tm[1],+tm[2]),ts=Date.now()+(wall-pacWall(Date.now()));if(ts<Date.now()-60e3){gmMsg='That time has passed.';return render()}
    if(ev.extra.length>=24){gmMsg='24 extra events is the limit.';return render()}ev.extra.push(Math.round(ts/60e3)*60e3);delete soDraft.so_gm_evdate;delete soDraft.so_gm_evtime;gmMsg='Maze event scheduled.';audit('scheduled a maze event')}
   else if(a==='evt'){}
   c.ev=ev;c.by=MYID();c.t=Date.now();try{LS.setItem('mapleish_rates',JSON.stringify(c))}catch(e){}save();render()}}
})();

/* ===== v3.4: every piece of equipment is its own item
   - Equipment never stacks: each piece is a separate item with its own stats, upgrade slots and scroll history
     (built on the scroll system's item instances, P.inst).
   - Dropped equipment gets random stats, as in v62: each stat the item has moves up or down by up to 10% of its value
     (at least 1), capped at 5 for STR/DEX/INT/LUK, attack, magic attack, accuracy, avoid, speed and jump, and at 10 for
     defense, magic defense, HP and MP. Stats never go below 0. Shop-bought and quest equipment is the standard item.
   - Stacks from older saves are split into separate standard items. ===== */
(function(){
 const isEq=k=>{const it=ITEMS[k];return !!it&&(it.w||it.s)&&!it.ammo&&!it.inst&&!(P.inst&&P.inst[k])};
 const CAP={str:5,dex:5,int:5,luk:5,watk:5,matk:5,acc:5,eva:5,speed:5,jump:5,def:10,mdef:10,hp:10,mp:10};
 const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
 function variance(base){const b=ITEMS[base],st={};const v={};
  if(b.w){v.watk=b.watk|0;if(b.matk)v.matk=b.matk|0}else v.def=b.def|0;
  for(const k in (b.bon||{}))v[k]=b.bon[k]|0;for(const k in (b.x||{}))if(CAP[k])v[k]=b.x[k]|0;
  for(const k in v){const val=v[k];if(!(val>0))continue;const r=Math.min(Math.max(1,Math.ceil(val*0.1)),CAP[k]||5);const d=ri(-r,r);if(d)st[k]=d}return st}
 window.newEquip=function(base,random){P.inst=P.inst||{};const id=base+'#'+(P.ic=(P.ic|0)+1);
  P.inst[id]={b:base,sl:baseSl(base),ok:0,lost:0,st:random?variance(base):{}};instBuild(id);return id};
 /* split any stacked or plain equipment in the inventory into separate items */
 window.splitEquips=function(){if(!P||!P.inv)return;for(const k of Object.keys(P.inv)){if(!isEq(k))continue;const n=P.inv[k]|0;delete P.inv[k];for(let i=0;i<n;i++)P.inv[newEquip(k,false)]=1}};
 /* picking up a dropped piece: random stats */
 {const _lt=lootTake;lootTake=function(g){const it=ITEMS[g.id];if(!isEq(g.id))return _lt(g);for(let i=0;i<(g.q||1);i++)P.inv[newEquip(g.id,true)]=1;log('You pick up '+it.n+'.','good','items')}}
 {const _s=save;save=function(){try{splitEquips()}catch(e){}return _s.apply(this,arguments)}}
 {const _r=render;render=function(){try{if(P&&typeof scr!=='undefined'&&scr==='game')splitEquips()}catch(e){}return _r.apply(this,arguments)}}
})();
/* v3.4: no Free Market menu tile. In v62 the Free Market is a place you walk into from town maps (Free Market
   Entrance); it comes back as a map when player shops are built. */
for(let i=FEAT.length-1;i>=0;i--)if(FEAT[i][0]==='market'||FEAT[i][0]==='pets'||FEAT[i][0]==='trade')FEAT.splice(i,1);/* pets come back on the Character screen when they are built */
/* v3.4: Shanks (Vasily) takes you to Victoria Island from level 7 for 150 mesos, as in v62. (The free ride with
   Lucas's Recommendation Letter belongs to a later version's quest chain, which this game does not have.) */
QD.ferry.goal='Pay Shanks 150 mesos for the ride to Victoria Island (from level 7). You can never come back.';
{const _dd=dlgDo;dlgDo=function(k){if(k==='qa:ferry'&&P){if(P.mesos<150){log('Shanks: The ride costs 150 mesos. Come back when you have them.','bad','quest');talk=null;return render()}
  const r=_dd(k);if(P.q.ferry){P.mesos-=150;log('You pay Shanks 150 mesos.','','quest');save()}return r}return _dd(k)}}

/* v3.5: class symbol on equipment icons (inventory and shop slots).
   Warrior sword, Bowman bow, Magician wand, Thief throwing star, Pirate gun, Beginner snail. Common gear: a small "ALL" tag. Also on worn gear (Character screen). */
/* v3.5: classes for every equipment item come from the raw data by name (V83.eqjobs), so multi-class gear such as
   Eloon (Warrior/Thief) is wearable by each of its classes. Before, only the first class was kept. */
const CLS_PJ={Warrior:'swordsman',Magician:'magician',Bowman:'archer',Thief:'rogue',Pirate:'pirate',Beginner:'beginner'};
(function fixEqJobs(){try{const J=(typeof V83!=='undefined'&&V83.eqjobs)||{};for(const k in ITEMS){const it=ITEMS[k];if(!it||!it.n)continue;
 const m=/(1\d{6})$/.exec(k);let r;
 if(m){r=J['#'+m[1]]||'';if(!r){delete it.pj;it.jb='Common';continue}}   // equipment with a known ID: exact record; none = all jobs
 else r=J[it.n];if(!r)continue;
 const L=r.split('/');it.pj=L.map(c=>CLS_PJ[c]).filter(Boolean);it.jb=L.join(', ')}}catch(e){}})();
const CLS_BADGE=(()=>{const s=(p)=>'<svg viewBox="0 0 16 16" width="100%" height="100%">'+p+'</svg>',k='stroke="#222" stroke-width="1" ';
 return{
  Warrior:s('<path d="M13 2 L6 9 L7 10 L14 3Z" fill="#cfd6dd" '+k+'/><path d="M4 9 L8 13 M5 12 L3 14" '+k+'fill="none" stroke-linecap="round"/>'),
  Bowman:s('<path d="M4 2 Q14 8 4 14" fill="none" stroke="#8a5a2b" stroke-width="2"/><path d="M4 2 L4 14 M2 8 L13 8 M11 6 L13 8 L11 10" '+k+'fill="none"/>'),
  Magician:s('<path d="M3 14 L10 7" stroke="#6b4a2b" stroke-width="2.5" stroke-linecap="round"/><path d="M12 1 L13 4 L16 5 L13 6 L12 9 L11 6 L8 5 L11 4Z" fill="#f4d03f" '+k+'/>'),
  Thief:s('<path d="M8 1 L9.5 6.5 L15 8 L9.5 9.5 L8 15 L6.5 9.5 L1 8 L6.5 6.5Z" fill="#b8c2cc" '+k+'/><circle cx="8" cy="8" r="1.5" fill="#222"/>'),
  Pirate:s('<path d="M2 5 H14 V8 H8 L7 13 H4 L5 8 H2Z" fill="#555" '+k+'/>'),
  Beginner:s('<circle cx="9" cy="8" r="4.5" fill="#e8a04a" '+k+'/><path d="M9 8 m-2 0 a2 2 0 1 0 2-2" fill="none" '+k+'/><path d="M1 13 H13 Q11 11 6 12 L4 9 M3 9 L4 6 M5 9 L6 6" fill="#a7d36f" '+k+'/>')}})();
/* Several classes: one symbol each. Common (or all five classes): a small "ALL" tag. */
CLS_BADGE.All='<b class="clsall">ALL</b>';
const PJ_CLS={swordsman:'Warrior',warrior:'Warrior',archer:'Bowman',bowman:'Bowman',magician:'Magician',mage:'Magician',rogue:'Thief',thief:'Thief',pirate:'Pirate',beginner:'Beginner'};
function itemClasses(b){if(!b)return [];
 if(!b.jb&&!b.pj){if(!(b.w||b.s))return [];   // hand-made gear with no class in the data: by weapon type, otherwise every class
  if(b.w){if(b.rng==='claw'||b.ty==='claw')return ['Thief'];if(b.rng==='bow'||b.rng==='xbow'||b.ty==='bow'||b.ty==='crossbow')return ['Bowman'];
   if(b.mw||b.ty==='wand'||b.ty==='staff')return ['Magician'];if(b.rng==='gun'||b.ty==='gun'||b.ty==='knuckle')return ['Pirate']}
  return ['All']}
 let L=(b.pj&&b.pj.length?b.pj.map(j=>PJ_CLS[j]||j):String(b.jb).split(/[,\/&]| and /)).map(x=>String(x).trim()).filter(Boolean);
 L=[...new Set(L.map(x=>PJ_CLS[x.toLowerCase()]||x))];
 if(L.includes('Common')||['Warrior','Bowman','Magician','Thief','Pirate'].every(c=>L.includes(c)))return ['All'];
 return L.filter(c=>CLS_BADGE[c])}
function clsBadge(id){try{const b=ITEMS[(typeof baseOf==='function'&&P)?baseOf(id):id]||ITEMS[id];if(!b||!(b.w||b.s||b.ty||b.jb))return '';
 const L=itemClasses(b);if(!L.length)return '';const t=L[0]==='All'?'All classes':L.join(', ');
 return '<span class="clsb" title="'+t+'">'+L.map(c=>'<i>'+CLS_BADGE[c]+'</i>').join('')+'</span>'}catch(e){return ''}}
function decorateBadges(){try{document.querySelectorAll('.slot[data-i],.slot[data-sh],.eqs[data-eqs]').forEach(el=>{if(el.querySelector('.clsb'))return;
 const id=el.dataset.eqs?(typeof eqOf==='function'?eqOf(el.dataset.eqs):null):(el.dataset.i||el.dataset.sh);const h=id?clsBadge(id):'';if(h)el.insertAdjacentHTML('beforeend',h)})}catch(e){}}
{const _r=render;render=function(){const r=_r.apply(this,arguments);decorateBadges();return r}}
(()=>{const st=document.createElement('style');st.textContent='.eqs{position:relative}.clsb{position:absolute;left:2px;top:2px;right:2px;display:flex;gap:1px;flex-wrap:wrap;pointer-events:none;line-height:0;filter:drop-shadow(0 0 1px #fff)}.clsb i{display:block;width:30%;max-width:20px;aspect-ratio:1}.clsall{display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;font:bold 8px/1 sans-serif;letter-spacing:-.3px;color:#fff;background:#4a6fa5;border:1px solid #223;border-radius:3px}';document.head.appendChild(st)})();
/* v3.5: the level 10 starter bow and claw (War Bow, Garnier) can also be equipped by beginners. */
const BEG_OK=['wp1452002','garnier'];
for(const k of BEG_OK){const it=ITEMS[k];if(it){it.pj=[...new Set([...(it.pj||[]),'beginner'])];it.beg=1;if(!/Beginner/.test(it.jb||''))it.jb=(it.jb?it.jb+', ':'')+'Beginner'}}
{const _e=eqOk;eqOk=function(id){const b=id&&(ITEMS[typeof baseOf==='function'?baseOf(id):id]||ITEMS[id]);
 if(b&&b.beg&&(!P||!P.job||P.job==='beginner'))return true;return _e.apply(this,arguments)}}
/* Garnier to its v62 values (was a custom level 15, 24 attack, 7,000 mesos). */
if(ITEMS.garnier)Object.assign(ITEMS.garnier,{req:10,watk:10,buy:3000});
if(typeof DESC!=='undefined'){DESC.garnier='A claw for throwing Throwing-Stars. Thieves and beginners can use it.'}
/* v3.5: hand-made weapons set to their v62 values (level, attack, magic attack, shop price). */
const V62_WFIX={"broad_sword": {"req": 25, "watk": 45, "buy": 22000}, "iron_axe": {"req": 20, "watk": 42, "buy": 10000}, "iron_mace": {"req": 20, "watk": 39, "buy": 10000}, "war_hammer": {"req": 30, "watk": 49, "buy": 40000}, "fruit_knife": {"req": 8, "watk": 22, "buy": 1000}, "razor": {"req": 5, "watk": 20, "buy": 500}, "battle_bow": {"req": 25, "watk": 40, "buy": 20000}, "crossbow": {"req": 12, "watk": 29, "buy": 4000}, "gladius": {"req": 30, "watk": 47, "buy": 40000}, "steel_titans": {"req": 15, "watk": 12, "buy": 20000}, "wooden_wand": {"req": 8, "watk": 15, "matk": 23, "buy": 2000}, "hardwood_wand": {"req": 13, "watk": 18, "matk": 28, "buy": 5000}, "wooden_staff": {"req": 10, "watk": 20, "matk": 25, "buy": 3000}, "w_astaroth_one_handed_sword": {"req": 25, "watk": 42}, "w_astaroth_two_handed_sword": {"req": 25, "watk": 45}, "w_astaroth_axe": {"req": 25, "watk": 46}, "w_astaroth_crossbow": {"req": 25, "watk": 46}, "w_astaroth_claw": {"req": 25, "watk": 18}, "w_astaroth_short_sword": {"req": 25, "watk": 40}, "w_astaroth_spear": {"req": 25, "watk": 46}, "w_astaroth_knuckles": {"req": 25, "watk": 32}, "w_astaroth_gun": {"req": 25, "watk": 28}};
for(const k in V62_WFIX)if(ITEMS[k])Object.assign(ITEMS[k],V62_WFIX[k]);
/* v3.5: armor that differed from the v62 data set to its v62 level, defense and stats (starter clothes had 1 defense). */
const V62_AFIX={"shield_15": {"req": 15, "def": 15, "bon": null, "buy": 6000}, "earring_15": {"req": 25, "def": 0, "bon": null}, "top_c0": {"req": 0, "def": 3, "bon": null, "buy": 50}, "top_c1": {"req": 0, "def": 3, "bon": null, "buy": 50}, "top_c3": {"req": 0, "def": 3, "bon": null, "buy": 50}, "bottom_c0": {"req": 0, "def": 2, "bon": null, "buy": 50}, "bottom_c1": {"req": 0, "def": 2, "bon": null, "buy": 50}, "shoes_c0": {"req": 0, "def": 2, "bon": null, "buy": 50}, "shoes_c1": {"req": 0, "def": 2, "bon": null, "buy": 50}, "shoes_c2": {"req": 0, "def": 2, "bon": null, "buy": 50}, "shoes_c3": {"req": 0, "def": 2, "bon": null, "buy": 50}, "brown_skullcap": {"req": 5, "def": 5, "bon": null, "buy": 500}, "green_skullcap": {"req": 5, "def": 5, "bon": null}, "red_headband": {"req": 5, "def": 5, "bon": null, "buy": 1000}, "black_headband": {"req": 5, "def": 5, "bon": null, "buy": 450}, "green_headband": {"req": 5, "def": 5, "bon": null, "buy": 450}, "yellow_headband": {"req": 5, "def": 5, "bon": null, "buy": 450}, "blue_headband": {"req": 5, "def": 5, "bon": null, "buy": 450}};
for(const k in V62_AFIX)if(ITEMS[k])Object.assign(ITEMS[k],V62_AFIX[k]);

/* v3.5: the Free Market, as in v62 a place you walk into from town maps (Free Market Entrance), with player shops.
   You come back out to the town you entered from. No monsters. The shops themselves need the server (online version):
   they are drawn by the live-world client. */
const FM_TOWNS=['henesys','ellinia','perion','kerning_city','lith_harbor'];
MAPS.free_market={n:'Free Market Entrance',i:'🏪',d:'Players set up shops here to sell their items. Walk around and see what is for sale.',
 town:1,mons:[],npcs:[],ex:[['henesys','Henesys']],ret:'henesys',art:['#f3c98b','#d99a4e']};
for(const t of FM_TOWNS){const m=MAPS[t];if(m&&m.ex&&!m.ex.some(x=>x[0]==='free_market'))m.ex.push(['free_market','Free Market Entrance'])}
function fmBack(){const r=(P&&MAPS[P.fmRet])?P.fmRet:'henesys';const m=MAPS.free_market;m.ex=[[r,MAPS[r].n]];m.ret=r}
{const _go=go;go=function(to){if(P&&to==='free_market'&&P.map!=='free_market')P.fmRet=P.map;if(P&&P.map==='free_market'&&to==='free_market')return;
  fmBack();return _go.apply(this,arguments)}}
{const _r=render;render=function(){try{if(P)fmBack()}catch(e){}return _r.apply(this,arguments)}}
/* v3.5: no made-up online activity. The old simulated "players nearby" lines (e.g. "KichiAlpha is chatting nearby.")
   are switched off; real players come from the live world. */
simAct=function(){};
/* v3.5: Heracle (guilds). In v62 he is at the Guild Headquarters in Orbis, which this game does not have yet, so he
   stands in Henesys. Creating and running a guild is on the Social tab (online version). */
NPCS.heracle={n:'Heracle',i:'🛡️',role:'Guild Headquarters',hi:'Want to start a guild? It costs 1,500,000 mesos and you need to be level 10. Open the Social tab while you are here in Henesys.'};
if(MAPS.henesys&&!MAPS.henesys.npcs.includes('heracle'))MAPS.henesys.npcs.push('heracle');
/* v3.5 drop rates: rare drops are rare.
   - The extra "4% random scroll on every kill" (not a v62 rule) is gone: scrolls drop only from monsters' own tables.
   - The drop tables come from v83 data, where some monsters list 20-35 different equipment drops. Every item can
     still drop, but each monster's equipment chances are scaled so that ANY equipment drop happens at most about once
     in 250 kills (monsters that were already rarer keep their chances). */
dropLoot=_dl1;
const EQ_ANY_MAX=0.004;
(function scaleEquipDrops(){try{for(const k in DROPS){const D=DROPS[k];if(!D||!Array.isArray(D.i))continue;
 const eq=D.i.filter(e=>ITEMS[e[0]]&&(ITEMS[e[0]].w||ITEMS[e[0]].s));if(!eq.length)continue;
 const pAny=1-eq.reduce((q,e)=>q*(1-e[1]),1);if(pAny<=EQ_ANY_MAX)continue;const f=EQ_ANY_MAX/pAny;for(const e of eq)e[1]=e[1]*f}}catch(e){}})();

/* v3.5: Pets (on the Character screen). Bought in the Cash Shop; one pet out at a time.
   - Fullness (0-100) drops slowly while you play (1 every 90 seconds). At 0 the pet stops helping until you feed it Pet
     Food (Doofus, Henesys Market): +30 fullness, and +1 closeness when it was hungry (fullness 70 or less).
   - Closeness raises the pet's level (v62 table, levels 1-30).
   - Pet skills come from pet equipment, as in v62 (no bigger pickup range):
       Meso Magnet  - picks up the mesos monsters drop
       Item Pouch   - picks up every item drop after each kill (auto pickup)
       Auto HP Pouch / Auto MP Pouch - drink your best HP / MP potion when you fall below the set percentage
     plus a cosmetic accessory slot (pet hats from the data). Pet equipment is bought in the Cash Shop. */
const PET_TYPES=[['brown_kitty','🐱','Brown Kitty'],['black_kitty','🐈‍⬛','Black Kitty'],['brown_puppy','🐶','Brown Puppy'],['husky','🐺','Husky'],
 ['white_bunny','🐰','White Bunny'],['pink_bunny','🐇','Pink Bunny'],['black_pig','🐷','Black Pig'],['panda','🐼','Panda'],['dino_boy','🦖','Dino Boy'],['dino_girl','🦕','Dino Girl'],['monkey','🐵','Monkey']];
const PET_EQ={pe_meso:['🧲','Meso Magnet','meso','Your pet picks up the mesos monsters drop.'],pe_pouch:['👝','Item Pouch','pouch','Your pet picks up every drop after each kill.'],pe_autohp:['❤️','Auto HP Pouch','hp','Your pet makes you drink an HP potion when your HP falls below the set percentage.'],
 pe_automp:['💙','Auto MP Pouch','mp','Your pet makes you drink an MP potion when your MP falls below the set percentage.']};
const PET_HATS=[['ph_red_ribbon','🎀','Red Ribbon'],['ph_yellow_hat','👒','Yellow Hat'],['ph_red_hat','🧢','Red Hat'],['ph_black_hat','🎩','Black Hat'],['ph_blue_top','🎩','Blue Top Hat'],['ph_mushroom','🍄','Mushroom Suit']];
const PET_CLOSE=[0,1,3,6,14,31,60,108,181,287,434,632,891,1224,1642,2161,2793,3557,4467,5542,6801,8263,9950,11882,14084,16578,19391,22547,26074,30000];
const PET_FOOD='i2120000';
/* Cash Shop entries (6th field: Cash Shop tab) */
for(const [k,i,n] of PET_TYPES)CASH.push(['pet_'+k,i,n,4000,'A pet that follows you. Feed it Pet Food. Give it pet equipment for auto pickup and auto potions.','pets']);
for(const k in PET_EQ)CASH.push([k,PET_EQ[k][0],PET_EQ[k][1],k==='pe_pouch'||k==='pe_meso'?2000:2500,PET_EQ[k][3]+' Equip it on your pet (Character screen).','peteq']);
for(const [k,i,n] of PET_HATS)CASH.push([k,i,n,800,'A cosmetic accessory for your pet.','peteq']);
const petType=t=>PET_TYPES.find(x=>x[0]===t)||PET_TYPES[0];
const pet=()=>P&&Array.isArray(P.pets)&&P.petOn>=0?P.pets[P.petOn]||null:null;
const petLvl=c=>{let l=1;for(let i=1;i<PET_CLOSE.length;i++)if(c>=PET_CLOSE[i])l=i+1;return Math.min(30,l)};
const petSkill=s=>{const p=pet();if(!p||p.full<=0)return false;return Object.values(p.eq||{}).some(k=>PET_EQ[k]&&PET_EQ[k][2]===s)};
/* buying a pet adds it to your pets (not the cash inventory) */
{const _cb=cashBuy;cashBuy=function(id){if(!String(id).startsWith('pet_'))return _cb(id);const c=CASH.find(x=>x[0]===id);if(!c||!P)return;if((P.nx||0)<c[3]){log('Not enough NX.','bad','items');return render()}
  P.nx-=c[3];P.pets=P.pets||[];const t=id.slice(4);P.pets.push({t,name:petType(t)[2],close:0,full:100,eq:{}});if(!(P.petOn>=0))P.petOn=P.pets.length-1;
  log('You got a '+c[2]+'! It is on your Character screen.','good','items');save();render()}}
function petFeed(){const p=pet();if(!p)return;if(!(P.inv[PET_FOOD]>0)){log('You have no Pet Food. Doofus sells it in the Henesys Market.','bad','items');return render()}
 P.inv[PET_FOOD]--;if(P.inv[PET_FOOD]<=0)delete P.inv[PET_FOOD];const hungry=p.full<=70;p.full=Math.min(100,p.full+30);
 if(hungry){const before=petLvl(p.close);p.close++;const after=petLvl(p.close);log(p.name+' enjoyed the food. Closeness +1.'+(after>before?' '+p.name+' is now level '+after+'!':''),'good','self')}else log(p.name+' is not very hungry.','','self');save();render()}
function petEquip(k){const p=pet();if(!p||!(P.cinv&&P.cinv[k]>0))return;const slot=PET_EQ[k]?PET_EQ[k][2]:'hat';p.eq=p.eq||{};if(p.eq[slot])P.cinv[p.eq[slot]]=(P.cinv[p.eq[slot]]||0)+1;
 P.cinv[k]--;if(P.cinv[k]<=0)delete P.cinv[k];p.eq[slot]=k;save();render()}
function petUnequip(slot){const p=pet();if(!p||!p.eq||!p.eq[slot])return;P.cinv=P.cinv||{};P.cinv[p.eq[slot]]=(P.cinv[p.eq[slot]]||0)+1;delete p.eq[slot];save();render()}
/* hunger */
setInterval(()=>{try{if(!P||typeof scr==='undefined'||scr!=='game')return;const p=pet();if(!p||p.full<=0)return;p.lastTick=p.lastTick||Date.now();
 if(Date.now()-p.lastTick>=90000){p.lastTick=Date.now();p.full=Math.max(0,p.full-1);if(p.full===0)log(p.name+' is too hungry to help. Feed it Pet Food.','bad','self');if(p.full===20)log(p.name+' is getting hungry.','','self')}}catch(e){}},5000);
/* auto potions */
const potBest=kind=>{const ok=k=>P.inv[k]>0&&ITEMS[k]&&(kind==='hp'?(ITEMS[k].heal||ITEMS[k].hpp):(ITEMS[k].mpheal||ITEMS[k].mpp))&&!(kind==='hp'&&ITEMS[k].mpheal&&!ITEMS[k].heal&&!ITEMS[k].hpp);
 const val=k=>{const it=ITEMS[k];return kind==='hp'?(it.heal||0)+(it.hpp||0)*P.maxHp/100:(it.mpheal||0)+(it.mpp||0)*P.maxMp/100};return Object.keys(P.inv).filter(ok).sort((a,b)=>val(b)-val(a))[0]};
setInterval(()=>{try{if(!P||typeof scr==='undefined'||scr!=='game'||P.dead||P.hp<=0)return;
 if(petSkill('hp')&&P.hp<P.maxHp*((P.petHp||50)/100)){const k=potBest('hp');if(k)useItem(k)}
 else if(petSkill('mp')&&P.mp<P.maxMp*((P.petMp||30)/100)){const k=potBest('mp');if(k)useItem(k)}}catch(e){}},700);
/* auto pickup after each kill */
{const _w=win;win=function(){const r=_w.apply(this,arguments);try{const mz=petSkill('meso'),pz=petSkill('pouch');if((mz||pz)&&typeof dropsHere==='function'){
  const take=dropsHere().filter(g=>g.id==='meso'?mz:pz);if(take.length){P.gd=P.gd.filter(g=>!take.includes(g));take.forEach(lootTake);save();render()}}}catch(e){}return r}}
/* the Character screen pet panel */
function petPanel(){const L=P.pets||[];let h='<div class="panel" id="petpanel"><h2>🐾 Pet</h2>';
 if(!L.length)return h+'<div class="mute">You have no pet yet. Pets are sold in the Cash Shop (💎). With pet equipment they pick up your loot and drink potions for you.</div></div>';
 const p=pet(),T=p?petType(p.t):null;
 if(p){const lv=petLvl(p.close),nx=PET_CLOSE[lv]||PET_CLOSE[29],pv=PET_CLOSE[lv-1]||0;
  h+='<div class="mrow"><span class="av" style="font-size:30px">'+T[1]+'</span><div style="flex:1"><b>'+esc2(p.name)+'</b> <span class="mute">Lv '+lv+'</span>'
   +'<div class="mute" style="font-size:12px">Closeness '+p.close+(lv<30?' / '+nx:'')+'</div><div class="xpi" style="height:8px;margin:2px 0"><i style="width:'+(lv<30?Math.min(100,(p.close-pv)/(nx-pv)*100):100)+'%"></i></div>'
   +'<div class="mute" style="font-size:12px">Fullness '+p.full+'/100'+(p.full<=0?' · too hungry to help':'')+'</div><div class="xpi" style="height:8px;margin:2px 0"><i style="width:'+p.full+'%;background:'+(p.full>30?'#5aae3e':'#d0451b')+'"></i></div></div>'
   +'<button data-pet="feed">Feed'+(P.inv[PET_FOOD]>0?' ('+P.inv[PET_FOOD]+')':'')+'</button></div>';
  const slots=[['hat','Accessory'],['meso','Meso Magnet'],['pouch','Item Pouch'],['hp','Auto HP'],['mp','Auto MP']];
  const nameOf=k=>{const c=CASH.find(x=>x[0]===k);return c?c[1]+' '+c[2]:k};
  h+='<div class="mute" style="margin-top:6px">Pet equipment</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start">'+slots.map(([s,lab])=>{const k=p.eq&&p.eq[s];
   const have=Object.keys(P.cinv||{}).filter(c=>P.cinv[c]>0&&(s==='hat'?PET_HATS.some(x=>x[0]===c):PET_EQ[c]&&PET_EQ[c][2]===s));
   return '<div class="cbox" style="padding:6px;min-height:0;height:auto;max-height:none"><div class="mute" style="font-size:12px">'+lab+'</div>'+(k?'<div>'+nameOf(k)+'</div><button data-pet="un:'+s+'" style="min-height:26px;padding:0 8px;font-size:12px">Remove</button>':(have.length?'<button data-pet="eq:'+have[0]+'" style="min-height:26px;padding:0 8px;font-size:12px">Equip '+nameOf(have[0])+'</button>':'<div class="mute" style="font-size:12px">Empty (Cash Shop)</div>'))+'</div>'}).join('')+'</div>';
  if(p.eq&&(p.eq.hp||p.eq.mp))h+='<div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap">'+(p.eq.hp?'<label class="mute">Auto HP below <select data-petset="petHp">'+[30,40,50,60,70,80].map(v=>'<option'+((P.petHp||50)===v?' selected':'')+'>'+v+'</option>').join('')+'</select>%</label>':'')+(p.eq.mp?'<label class="mute">Auto MP below <select data-petset="petMp">'+[10,20,30,40,50,60].map(v=>'<option'+((P.petMp||30)===v?' selected':'')+'>'+v+'</option>').join('')+'</select>%</label>':'')+'</div>';
  h+='<div style="display:flex;gap:6px;margin-top:6px"><input id="petname" maxlength="12" placeholder="Rename your pet" style="flex:1;min-width:0"><button data-pet="name">Rename</button><button data-pet="away">Put away</button></div>'}
 else h+='<div class="mute">Your pets are resting.</div>';
 if(L.length>1||!p)h+='<div class="mute" style="margin-top:8px">Your pets</div>'+L.map((x,i)=>'<button data-pet="out:'+i+'" '+(i===P.petOn?'disabled':'')+' style="margin:2px">'+petType(x.t)[1]+' '+esc2(x.name)+'</button>').join('');
 return h+'</div>'}
{const _r=render;render=function(){const out=_r.apply(this,arguments);try{if(P&&typeof scr!=='undefined'&&scr==='game'&&tab==='stats'&&!document.getElementById('petpanel')){const app=document.getElementById('app');
  const panels=[...app.querySelectorAll(':scope > .panel')].filter(x=>x.id!=='log');const after=panels[panels.length-1];const d=document.createElement('div');d.innerHTML=petPanel();if(after)after.insertAdjacentElement('afterend',d.firstChild);else app.appendChild(d.firstChild)}}catch(e){}return out}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-pet]');if(!b||!P)return;const [a,x]=b.dataset.pet.split(':');
 if(a==='feed')petFeed();else if(a==='eq')petEquip(x);else if(a==='un')petUnequip(x);else if(a==='away'){P.petOn=-1;save();render()}else if(a==='out'){P.petOn=+x;save();render()}
 else if(a==='name'){const v=((document.getElementById('petname')||{}).value||'').trim().slice(0,12);const p=pet();if(p&&v){p.name=v;save();render()}}});
document.addEventListener('change',e=>{const s=e.target.closest&&e.target.closest('[data-petset]');if(!s||!P)return;P[s.dataset.petset]=+s.value;save()});
/* Pet Food is sold by Doofus (Henesys Market) */
try{const d=NPCS.n1012004;if(d&&d.shopList&&!d.shopList.includes(PET_FOOD))d.shopList.unshift(PET_FOOD)}catch(e){}
/* Pet Food used from the bag feeds the pet */
{const _u=useItem;useItem=function(id){if(id===PET_FOOD&&pet())return petFeed();return _u.apply(this,arguments)}}

/* mesos lying on the map show like any drop */
ITEMS.meso=ITEMS.meso||{n:'Mesos',i:'💰'};

/* v3.5: Cash Shop tabs by item type: Use, Etc, Pets, Pet equipment, Equipment, Other. */
const CASH_TABS=[['use','Use'],['etc','Etc'],['pets','Pets'],['peteq','Pet equipment'],['equip','Equipment'],['other','Other']];
const cashTabOf=c=>c[5]||(/^sc_/.test(c[0])||['exp2','drop2','charm','wheel','mega','smega'].includes(c[0])?'use':'etc');
let cashTab='use';
cashHtml=function(){cashInit();const now=Date.now(),fx=[];if(P.cb.exp2>now)fx.push('2x EXP '+Math.ceil((P.cb.exp2-now)/60000)+' min');if(P.cb.drop2>now)fx.push('2x Drop '+Math.ceil((P.cb.drop2-now)/60000)+' min');
 const row=(c,r)=>'<div class="row" style="align-items:center;padding:6px 0;gap:8px"><span>'+c[1]+' <b>'+c[2]+'</b><div class="mute">'+c[4]+'</div></span>'+r+'</div>';
 const owned=c=>String(c[0]).startsWith('pet_')?(P.pets||[]).filter(p=>'pet_'+p.t===c[0]).length:(P.cinv[c[0]]|0);
 const list=CASH.filter(c=>cashTabOf(c)===cashTab),mine=CASH.filter(c=>!String(c[0]).startsWith('pet_')&&P.cinv[c[0]]>0);
 const empty={equip:'Cash equipment (outfits and cosmetics) is coming later.',other:'Emote skins and other extras are coming later.'};
 return '<div class="panel"><div class="row"><h2>Cash Shop</h2><b>'+P.nx.toLocaleString()+' NX</b></div><div class="mute">Earn NX by hunting and questing.'+(fx.length?'<br>Active: '+fx.join(' · '):'')+'</div>'
  +'<div class="seg ltb" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">'+CASH_TABS.map(t=>'<button data-ctab="'+t[0]+'" class="'+(cashTab===t[0]?'on':'')+'" style="flex:1 1 30%;min-width:0;padding:4px 2px">'+t[1]+'</button>').join('')+'</div></div>'
  +'<div class="panel"><h2>'+CASH_TABS.find(t=>t[0]===cashTab)[1]+'</h2>'+(list.length?list.map(c=>row(c,'<button '+(P.nx>=c[3]&&!(ROCKS[c[0]]&&P.cinv[c[0]]>0)?'class="main"':'disabled')+' onclick="cashBuy(\''+c[0]+'\')">'+(ROCKS[c[0]]&&P.cinv[c[0]]>0?'Owned':c[3].toLocaleString()+' NX')+'</button>'+(owned(c)&&!ROCKS[c[0]]?'<span class="pill b">have '+owned(c)+'</span>':''))).join(''):'<div class="mute">'+(empty[cashTab]||'Nothing here yet.')+'</div>')+'</div>'
  +'<div class="panel"><h2>My Cash Items</h2>'+(mine.length?mine.map(c=>row(c,ROCKS[c[0]]?'<span class="pill b">owned</span>':['charm','wheel'].includes(c[0])?'<span class="pill b">x'+P.cinv[c[0]]+' auto</span>':cashTabOf(c)==='peteq'?'<span class="pill b">x'+P.cinv[c[0]]+' · equip on your pet (Character)</span>':'<button class="main" onclick="cashUse(\''+c[0]+'\')">Use x'+P.cinv[c[0]]+'</button>')).join(''):'<div class="mute">Nothing yet.</div>')
  +((P.pets||[]).length?'<div class="mute" style="margin-top:6px">Pets: '+P.pets.map(p=>p.name).join(', ')+' (Character screen)</div>':'')+'</div>'
  +(P.cinv.rock>0?rockHtml('rock'):'')+(P.cinv.vip>0?rockHtml('vip'):'')};
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-ctab]');if(!b)return;cashTab=b.dataset.ctab;render()});

/* v3.5: Details on the map card: the monsters that spawn there (with levels) and, online, who "owns" the map (the
   player who arrived first and has spawn priority). Tapping a player opens a small profile. */
let mapDet=false,profileOf=null;
function mapDetailsHtml(){const m=MAPS[P.map];if(!m)return '';const L=window.liveState;
 const mons=[...new Set(m.mons||[])].filter(k=>MON[k]).sort((a,b)=>MON[a].lv-MON[b].lv);
 let h='<div class="mapdet" style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px">'+(m.d?'<div class="mute" style="margin-bottom:6px">'+m.d+'</div>':'');
 h+='<div class="mute" style="font-size:12px">Monsters here</div>'+(mons.length?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">'+mons.map(k=>'<span class="pill" style="display:inline-flex;gap:4px;align-items:center">'+(MON[k].i||'👾')+' '+MON[k].n+' <b>Lv '+MON[k].lv+'</b></span>').join('')+'</div>':'<div class="mute">None (safe map).</div>');
 if(L&&L.state==='on'&&(L.here||[]).length+1>1&&mons.length){const me=L.me;const all=(L.here||[]).concat(me?[Object.assign({},me,{map:P.map})]:[]).filter(x=>x.map===P.map||x===me);
  const owner=all.slice().sort((a,b)=>(a.at||0)-(b.at||0))[0];
  if(owner)h+='<div class="mute" style="font-size:12px;margin-top:4px">Map owner (arrived first, spawn priority)</div><div class="mrow" data-prof="'+(owner.name||'')+'" style="cursor:pointer"><span class="av">👑</span><div style="flex:1"><b>'+String(owner.name).replace(/</g,'&lt;')+'</b> <span class="mute">Lv '+(owner.lvl|0)+'</span></div></div>'}
 return h+'</div>'}
function profileHtml(n){const L=window.liveState||{},p=((L.here||[]).concat(L.me?[L.me]:[])).find(x=>x.name===n)||{name:n};const g=L.guild&&L.guild.members&&L.guild.members.some(x=>x.n===n)?L.guild.name:null;
 return '<div class="panel" id="profilebox"><div class="row"><h2>🧑 '+String(p.name).replace(/</g,'&lt;')+'</h2><button data-prof="">Close</button></div>'
  +'<div>Level <b>'+(p.lvl|0||'?')+'</b>'+(p.job?' · '+String(p.job).replace(/</g,'&lt;'):'')+(g?' · Guild <b>'+g+'</b>':'')+'</div>'
  +(L.me&&n!==L.me.name&&window.liveParty?'<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'+(p.id?'<button data-lp="invite:'+p.id+'">Invite to party</button><button data-lt="ask:'+p.id+'">Trade</button>':'')+'<button data-lb="addn:'+n+'">Add buddy</button><button data-lb="w:'+n+'">Whisper</button></div>':'')+'</div>'}
{const _r=render;render=function(){const out=_r.apply(this,arguments);try{if(!P||typeof scr==='undefined'||scr!=='game'||tab!=='play')return out;
  const name=document.querySelector('#app h2.mapname');if(name&&!document.getElementById('mapdetbtn')){const b=document.createElement('button');b.id='mapdetbtn';b.textContent=mapDet?'Details ▴':'Details ▾';
   b.style.cssText='min-height:26px;padding:0 8px;font-size:12px;margin-left:auto';name.parentNode.appendChild(b);{const row=name.parentNode,d=row.nextElementSibling;if(d&&d.textContent&&MAPS[P.map]&&MAPS[P.map].d&&d.textContent.trim()===String(MAPS[P.map].d).trim())d.style.display='none'}if(mapDet)name.closest('.panel').insertAdjacentHTML('beforeend',mapDetailsHtml())}
  /* in a fight the map picture hides (the name stays) so the fight and loot fit on small phones */
  if(name&&typeof enc!=='undefined'){const row=name.parentNode,art=row.previousElementSibling;if(art&&art!==row)art.style.display=enc?'none':''}
  if(profileOf&&!document.getElementById('profilebox')){const card=name&&name.closest('.panel');if(card)card.insertAdjacentHTML('afterend',profileHtml(profileOf))}}catch(e){}return out}}
document.addEventListener('click',e=>{const t=e.target;if(t.id==='mapdetbtn'){mapDet=!mapDet;render();return}
 const pr=t.closest&&t.closest('[data-prof]');if(pr){profileOf=pr.dataset.prof||null;render()}});

/* v3.5: every block with a title bar can be collapsed with a +/- button on the right of the title bar. The state is
   saved with the character (P.ui.col), so it is the same the next time you log in. Quickslots get a title bar. */
const _qp=quickPanel;quickPanel=function(){const h=_qp.apply(this,arguments);return h.replace('<div class="panel">','<div class="panel"><h2>Quickslots</h2>')};
const colKey=t=>String(t||'').replace(/[^A-Za-z ]/g,'').trim().toLowerCase().replace(/\s+/g,'_').slice(0,24);
function decorateCollapse(){try{if(!P)return;P.ui=P.ui||{};const col=P.ui.col=P.ui.col||{};
 document.querySelectorAll('#app .panel, #livebox, #livechatbox').forEach(pn=>{if(pn.closest('.dlginline'))return;const hd=pn.querySelector(':scope > h2:first-child, :scope > .row:first-child, :scope > .title:first-child');
  if(!hd||hd.querySelector('.colbtn'))return;const txt=(hd.querySelector('h2')||hd).textContent;const k=colKey(txt);if(!k)return;
  const b=document.createElement('button');b.className='colbtn';b.dataset.col=k;b.textContent=col[k]?'+':'−';b.title=col[k]?'Show':'Hide';hd.appendChild(b);
  pn.classList.toggle('collapsed',!!col[k])})}catch(e){}}
{const _r=render;render=function(){const out=_r.apply(this,arguments);decorateCollapse();return out}}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.colbtn');if(!b||!P)return;e.stopPropagation();P.ui=P.ui||{};P.ui.col=P.ui.col||{};
 const k=b.dataset.col;P.ui.col[k]=!P.ui.col[k];const pn=b.closest('.panel,#livebox,#livechatbox');if(pn)pn.classList.toggle('collapsed',P.ui.col[k]);b.textContent=P.ui.col[k]?'+':'−';save()},true);
(()=>{const st=document.createElement('style');st.textContent='.colbtn{margin-left:auto;float:right;min-height:0!important;height:22px;width:26px;padding:0!important;font-size:16px;line-height:18px;border-radius:6px}'
 +'#app .panel>h2:first-child,#app .panel>.row:first-child{display:flex;align-items:center;gap:6px}'
 +'.collapsed>*:not(h2:first-child):not(.row:first-child):not(.title:first-child){display:none!important}'
 +'.collapsed>h2:first-child,.collapsed>.row:first-child,.collapsed>.title:first-child{margin-bottom:-10px!important}';document.head.appendChild(st)})();

/* ===== Server client: accounts. Only in the server build. Log in and Create account talk to the server; passwords
   never stay in the browser ("Save password" is gone). There is no email service yet, so new accounts are active at
   once instead of waiting for a confirmation code. ===== */
const api=async(method,url,body)=>{try{const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));return Object.assign({status:r.status},j)}catch(e){return{error:'Cannot reach the server.'}}};
window.__serverNote=t=>{try{if(typeof log==='function'&&P)log(t,'bad','system');else console.warn(t)}catch(e){console.warn(t)}
 /* v3.5: problems with saving show as a red bar under the top bar until saving works again (they used to go only to the log) */
 try{let b=document.getElementById('savebar');if(!b){b=document.createElement('div');b.id='savebar';b.style.cssText='margin:6px 0;padding:8px 10px;border-radius:8px;background:#b3261e;color:#fff;font-size:14px;display:flex;gap:8px;align-items:center';const tb=document.querySelector('#app .tabs');if(tb)tb.insertAdjacentElement('afterend',b);else{const app=document.getElementById('app');(app&&app.parentNode||document.body).insertBefore(b,app||null)}}
  b.innerHTML='<span style="flex:1">⚠️ '+String(t).replace(/</g,'&lt;')+'</span><button style="min-height:26px;padding:0 8px" onclick="this.parentNode.remove()">OK</button>'}catch(e){}};
window.__saveOk=()=>{const b=document.getElementById('savebar');if(b)b.remove()};
const keepToken=r=>{try{if(r&&r.token)localStorage.setItem('ml_token',r.token)}catch(e){}};
async function afterAuth(v){await LS.reload();curUser=v;lsSet('mapleish_sess',v);if(window.__wsFrom==='site')return window.__wsHome();goTo('chars')}
{const _ls=loginScreen;loginScreen=function(){_ls();{const sm=app.querySelector('.logo small');if(sm)sm.textContent='A Maple adventure'}const pw=$('apw');if(!pw)return;
  const sp=$('spwc');if(sp&&sp.parentElement)sp.parentElement.remove();delete pw.dataset.saved;if(pw.value==='••••••••')pw.value='';
  const m=t=>{const e=$('lgmsg');if(e){e.textContent=t;e.style.color='#d4443f'}};
  $('login').onclick=async()=>{const v=$('aid').value.trim();if(!/^[A-Za-z0-9]{4,12}$/.test(v))return m('Enter an ID of 4-12 letters or digits.');if(!pw.value)return m('Enter a password.');
   const r=await api('POST','/api/login',{id:v,password:pw.value});if(r.error)return m(r.error);keepToken(r);
   if($('sid').checked)lsSet('mapleish_id',r.id);else lsDel('mapleish_id');afterAuth(r.id)};
  const g=$('goog');if(g)g.onclick=()=>m('Google sign-in is not set up on this server yet.');
  const f=$('forgot');if(f)f.onclick=()=>m('There is no email service yet. Ask an admin: they can give you a temporary password from the Players page.')}}
{const _rs=regScreen;regScreen=function(){_rs();const note=$('rmsg');if(note)note.textContent='Your account is ready as soon as you create it.';
  const m=t=>{const e=$('rmsg');if(e){e.textContent=t;e.style.color='#d4443f'}};
  $('rgo').onclick=async()=>{const u=$('ru').value.trim(),em=$('re').value.trim().toLowerCase(),p1=$('rp').value;
   if(!/^[A-Za-z0-9]{4,12}$/.test(u))return m('ID must be 4-12 letters or digits.');
   if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return m('Enter a valid email address.');
   if(p1.length<8)return m('Password must be at least 8 characters.');
   if(p1!==$('rp2').value)return m('Passwords do not match.');
   if(!$('rt').checked)return m('You must agree to the Terms of Service.');
   const r=await api('POST','/api/register',{id:u,email:em,password:p1});if(r.error)return m(r.error);keepToken(r);lsSet('mapleish_id',r.id);afterAuth(r.id)}}}
/* the session lives in a server cookie: keep the local marker in step with it */
(function(){const me=window.__KV&&window.__KV.me;if(me){lsSet('mapleish_sess',me.id);curUser=curUser||''}else lsDel2()
 function lsDel2(){try{localStorage.removeItem('mapleish_sess')}catch(e){}}})();

/* ===== Server client: the website, online. Only in the server build.
   - Server box: live numbers from the server (status, players online, accounts, characters, top player), every minute.
   - Rankings page: top 100 characters on the server, by class. Staff and suspended accounts are left out.
   - Account page: password, email and account deletion go to the server (password required); "Log out everywhere".
   - Players page (admins and GMs): every account with its characters, role, last seen; admins can change roles,
     suspend/unsuspend and reset a password (the temporary password is shown once). Also the refused-saves log.
   - While the site or game is open the client pings the server every minute, which is what "online" counts. ===== */
(function(){
const $=id=>document.getElementById(id),esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const get=u=>fetch(u,{credentials:'same-origin'}).then(r=>r.json()).catch(()=>({error:'Cannot reach the server.'}));
const post=(u,b)=>api('POST',u,b);
const JOBN={beginner:'Beginner',swordsman:'Warrior',archer:'Bowman',rogue:'Thief',magician:'Magician',pirate:'Pirate'};
const JOBI={beginner:'🌱',swordsman:'⚔️',archer:'🏹',rogue:'🗡️',magician:'🔮',pirate:'🏴‍☠️'};
const me=()=>(window.__KV&&window.__KV.me)||null;
const role=()=>{const m=me();return m?m.role:null};
const ago=t=>{if(!t)return 'never';const s=(Date.now()-t)/1000;return s<90?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago'};
const day=t=>t?new Date(t).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'-';
/* keep window.__KV.me in step with logins and logouts */
async function refreshMe(){const r=await get('/api/me');if(window.__KV)window.__KV.me=r.me||null;return r.me}
/* ---------- heartbeat ---------- */
/* presence: every open page (site or game, visible or not) checks in every 15 s; 30 s after the last check-in from
   any page the player counts as offline */
setInterval(()=>{if(me())fetch('/api/ping',{method:'POST',credentials:'same-origin'}).then(r=>r.json()).then(j=>{/* the EXP rate an admin set reaches players already online within a minute */if(j&&'rates' in j&&window.__KV){if(j.rates==null)delete window.__KV.shared.mapleish_rates;else window.__KV.shared.mapleish_rates=j.rates}}).catch(()=>{})},15000);
/* ---------- server box ---------- */
let stats=null,lastHtml='';
function paintStats(){const st=$('ws-stats');if(!st)return;
 const r=(i,a,b,w)=>'<div class="ws-st'+(w?' w':'')+'"><em>'+i+'</em><b>'+b+'</b>'+a+'</div>';
 if(!stats||stats.error)st.innerHTML='<div class="ws-grid">'+r('🔴','Status',stats?'Unreachable':'Checking…',1)+'</div>';
 else st.innerHTML='<div class="ws-grid">'+r('🟢','Status','<span class="ws-dot"></span>Online',1)+r('🧑‍🤝‍🧑','Players online',stats.online)+r('👥','Accounts',stats.accounts.toLocaleString())+r('🧙','Characters',stats.characters.toLocaleString())
  +r('🏆','Top player',stats.top?esc(stats.top.name)+' <small>Lv '+stats.top.lvl+'</small>':'-')+r('📜','Version','v62')+'</div>'
  +'<div class="ws-note">'+(stats.newest?'Newest adventurer: <b>'+esc(stats.newest)+'</b>. ':'')+'<a href="#rankings" id="ws-st-rank">See the rankings</a></div>';
 lastHtml=st.innerHTML;const a=$('ws-st-rank');if(a)a.onclick=e=>{e.preventDefault();showRank()}}
async function loadStats(){stats=await get('/api/stats');paintStats()}
{const st=$('ws-stats');if(st)new MutationObserver(()=>{if(st.innerHTML!==lastHtml)paintStats()})/* the offline code repaints this box; put the server numbers back (only when it changed, or this would loop) */.observe(st,{childList:true})}
loadStats();setInterval(()=>{if($('site')&&$('site').style.display!=='none')loadStats()},60000);
/* ---------- views ---------- */
const nav=document.querySelector('.ws-nav'),acct=$('ws-acctview');
const mine=[];
function mkView(id,href,label){const a=document.createElement('a');a.href='#'+href;a.textContent=label;nav.appendChild(a);
 const v=document.createElement('div');v.id=id;v.style.display='none';acct.parentNode.insertBefore(v,acct.nextSibling);mine.push([a,v]);return [a,v]}
function open(a,v){['top','ws-acctview','ws-wikiview','ws-adminview'].forEach(i=>{const e=$(i);if(e)e.style.display='none'});mine.forEach(([x,y])=>{y.style.display=y===v?'':'none'});
 nav.querySelectorAll('a').forEach(x=>x.classList.toggle('on',x===a));v.style.display='';window.scrollTo(0,0)}
function closeMine(){let was=false;mine.forEach(([a,v])=>{if(v.style.display!=='none'){was=true;v.style.display='none';a.classList.remove('on')}});if(was&&$('top'))$('top').style.display=''}
nav.querySelectorAll('a').forEach(x=>x.addEventListener('click',()=>closeMine(),true));
{const lg=$('ws-logo');if(lg)lg.addEventListener('click',closeMine,true)}
/* ---------- rankings ---------- */
const [rkA,rkV]=mkView('ws-rankview','rankings','Rankings');let rkJob='all';
async function showRank(){open(rkA,rkV);rkV.innerHTML='<div class="ws-av"><div class="ws-card"><h2>🏆 Rankings</h2><p class="sa-empty">Loading…</p></div></div>';
 const r=await get('/api/rankings?job='+rkJob);const J=['all','beginner','swordsman','archer','rogue','magician','pirate'];
 rkV.innerHTML='<div class="ws-av"><div class="ws-card"><h2>🏆 Rankings</h2><div class="ws-tabs" style="flex-wrap:wrap;margin:6px 0 10px">'+J.map(j=>'<button class="ws-tab'+(rkJob===j?' on':'')+'" data-rk="'+j+'">'+(j==='all'?'All':JOBI[j]+' '+JOBN[j])+'</button>').join('')+'</div>'
  +(r.error?'<p class="sa-empty">'+esc(r.error)+'</p>':!r.list.length?'<p class="sa-empty">No characters yet. Be the first!</p>':
   '<div class="rk-t">'+r.list.map(c=>'<div class="ws-row rk-r'+(c.rank<=3?' rk'+c.rank:'')+'"><span><b class="rk-n">'+(c.rank<=3?['🥇','🥈','🥉'][c.rank-1]:'#'+c.rank)+'</b> '+esc(c.name)+(c.gm?' <small class="rk-gm" title="Staff character">GM</small>':'')+(c.mode?' <small>'+esc((MODES[c.mode]||['',''])[1])+'</small>':'')+'</span><span>'+JOBI[c.job]+' '+JOBN[c.job]+' · <b>Lv '+c.lvl+'</b></span></div>').join('')+'</div>')
  +'<p class="ws-note" style="margin-top:10px">Top 100 by level, then EXP. Updated live. Staff accounts are not ranked.</p></div></div>';
 rkV.querySelectorAll('[data-rk]').forEach(b=>b.onclick=()=>{rkJob=b.dataset.rk;showRank()})}
rkA.addEventListener('click',e=>{e.preventDefault();showRank()});
/* ---------- players (staff) ---------- */
const [plA,plV]=mkView('ws-playersview','players','Players');plA.style.display='none';let plMsg='',plQ='',plTab='accounts';
function navStaff(){plA.style.display=(role()==='admin'||role()==='gm')?'':'none';if(plV.style.display!=='none'&&plA.style.display==='none')closeMine()}
async function showPlayers(){if(!(role()==='admin'||role()==='gm'))return;open(plA,plV);plV.innerHTML='<div class="ws-av"><div class="ws-card"><h2>🧑‍🤝‍🧑 Players</h2><p class="sa-empty">Loading…</p></div></div>';
 const adm=role()==='admin';const T='<div class="ws-tabs" style="margin:6px 0 10px"><button class="ws-tab'+(plTab==='accounts'?' on':'')+'" data-pt="accounts">Accounts</button><button class="ws-tab'+(plTab==='rejects'?' on':'')+'" data-pt="rejects">Refused saves</button></div>';
 let h='';
 if(plTab==='accounts'){const r=await get('/api/admin/accounts');if(r.error)h='<p class="sa-empty">'+esc(r.error)+'</p>';else{
   const L=r.list.filter(a=>!plQ||a.id.toLowerCase().includes(plQ)||(a.chars||[]).some(c=>c.toLowerCase().includes(plQ)));
   h='<input id="pl-q" placeholder="Search account or character" value="'+esc(plQ)+'" style="width:100%;margin-bottom:8px">'+'<p class="ws-note">'+r.list.length+' accounts, '+r.list.filter(a=>a.last_seen>Date.now()-45000).length+' online now.</p>'
    +L.map(a=>'<div class="ws-row pl-r" style="align-items:flex-start;gap:8px;flex-wrap:wrap"><span style="flex:1;min-width:180px"><b>'+esc(a.id)+'</b>'+(a.banned?' <span class="ws-tagc s">Suspended</span>':'')+(a.role!=='player'?' <span class="ws-tagc">'+esc(a.role.toUpperCase())+'</span>':'')
     +'<small>'+esc(a.email)+' · joined '+day(a.created)+' · seen '+ago(a.last_seen)+'<br>'+(a.chars.length?esc(a.chars.join(', ')):'No characters')+'</small></span>'
     +(adm&&a.id.toLowerCase()!==me().id.toLowerCase()?'<span class="sa-btns" style="flex-wrap:wrap"><select data-prole="'+esc(a.id)+'">'+['player','gm','admin'].map(x=>'<option'+(a.role===x?' selected':'')+'>'+x+'</option>').join('')+'</select>'
      +'<button class="ws-b'+(a.banned?'':' d')+'" data-pban="'+esc(a.id)+'" data-v="'+(a.banned?0:1)+'">'+(a.banned?'Unsuspend':'Suspend')+'</button><button class="ws-b" data-preset="'+esc(a.id)+'">Reset password</button></span>':'')+'</div>').join('')}}
 else{const r=await get('/api/admin/rejects');h=r.error?'<p class="sa-empty">'+esc(r.error)+'</p>':!r.list.length?'<p class="sa-empty">No refused saves.</p>':r.list.map(x=>'<div class="ws-row"><span><b>'+esc(x.id)+'</b> <small>'+esc(x.key.replace('mapleish_c','slot '))+' · '+ago(x.at)+'</small><small>'+esc(x.reason)+'</small></span></div>').join('')}
 plV.innerHTML='<div class="ws-av"><div class="ws-card"><h2>🧑‍🤝‍🧑 Players</h2>'+(plMsg?'<p class="sa-msg">'+plMsg+'</p>':'')+T+h+'</div></div>';plMsg='';
 plV.querySelectorAll('[data-pt]').forEach(b=>b.onclick=()=>{plTab=b.dataset.pt;showPlayers()});
 const q=$('pl-q');if(q){q.oninput=()=>{plQ=q.value.trim().toLowerCase();clearTimeout(q._t);q._t=setTimeout(()=>{showPlayers().then(()=>{const n=$('pl-q');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}})},300)}}
 plV.querySelectorAll('[data-prole]').forEach(s=>s.onchange=async()=>{const r=await post('/api/role',{id:s.dataset.prole,role:s.value});plMsg=r.error?esc(r.error):'Role of '+esc(s.dataset.prole)+' set to '+esc(s.value)+'.';showPlayers()});
 plV.querySelectorAll('[data-pban]').forEach(b=>b.onclick=async()=>{const r=await post('/api/admin/ban',{id:b.dataset.pban,banned:b.dataset.v==='1'});plMsg=r.error?esc(r.error):esc(b.dataset.pban)+(b.dataset.v==='1'?' is suspended and logged out.':' can log in again.');showPlayers()});
 plV.querySelectorAll('[data-preset]').forEach(b=>b.onclick=async()=>{if(b.dataset.arm!=='1'){b.dataset.arm='1';b.textContent='Tap again to reset';return}
  const r=await post('/api/admin/reset-password',{id:b.dataset.preset});plMsg=r.error?esc(r.error):'Temporary password for <b>'+esc(b.dataset.preset)+'</b>: <code style="user-select:all">'+esc(r.temp)+'</code> (shown once; they should change it on the Account page).';showPlayers()})}
plA.addEventListener('click',e=>{e.preventDefault();showPlayers()});
/* ---------- account page: security actions on the server ---------- */
const amsg=(id,t,ok)=>{const e=$(id);if(e){e.textContent=t;e.className='ws-m '+(ok?'ok':'bad')}};
function addPw(afterId,id,label){const a=$(afterId);if(!a||$(id))return;const l=document.createElement('label');l.innerHTML=esc(label)+'<input id="'+id+'" type="password" autocomplete="current-password">';
 const lab=a.closest('label');(lab||a).insertAdjacentElement('afterend',l)}
new MutationObserver(()=>{if($('ac-em'))addPw('ac-em','ac-emp','Password');if($('ac-dl'))addPw('ac-dl','ac-dlp','Password');
 const del=$('ac-del');if(del&&!$('ac-all')){const b=document.createElement('button');b.className='ws-b';b.id='ac-all';b.textContent='Log out on all devices';b.style.marginTop='8px';
  const box=document.createElement('div');box.innerHTML='<div class="ws-h3">Sessions</div><p class="ws-note">Logs this account out everywhere, including this browser.</p>';box.appendChild(b);(del.closest('.ws-f')||del.parentNode).insertAdjacentElement('beforebegin',box)}
 const fpw=$('ac-fpw');if(fpw){const row=fpw.closest('.ws-row');if(row)row.remove()}}).observe(acct,{childList:true,subtree:true});
document.addEventListener('click',async e=>{const t=e.target.closest&&e.target.closest('#ac-pw,#ac-emb,#ac-del,#ac-all');if(!t)return;e.stopPropagation();e.preventDefault();
 if(t.id==='ac-pw'){const c=$('ac-cp').value,p1=$('ac-np').value;if(p1.length<8)return amsg('ac-pwm','New password must be at least 8 characters.');if(p1!==$('ac-np2').value)return amsg('ac-pwm','Passwords do not match.');
  const r=await post('/api/account/password',{current:c,password:p1});if(r.error)return amsg('ac-pwm',r.error);['ac-cp','ac-np','ac-np2'].forEach(i=>{const x=$(i);if(x)x.value=''});amsg('ac-pwm','Password changed. Other devices were logged out.',1)}
 else if(t.id==='ac-emb'){const r=await post('/api/account/email',{email:$('ac-em').value.trim(),password:($('ac-emp')||{}).value});if(r.error)return amsg('ac-emm',r.error);
  const u=me()&&me().id;if(u&&window.__KV.accts[u])window.__KV.accts[u].email=r.email;amsg('ac-emm','Email updated.',1)}
 else if(t.id==='ac-del'){const r=await post('/api/account/delete',{confirm:$('ac-dl').value.trim(),password:($('ac-dlp')||{}).value});if(r.error)return amsg('ac-dlm',r.error);
  try{localStorage.removeItem('mapleish_sess');localStorage.removeItem('mapleish_id');localStorage.removeItem('ml_token')}catch(x){}await LS.reload();curUser='';if(window.__wsBack)window.__wsBack();if(window.__wsSite)window.__wsSite()}
 else if(t.id==='ac-all'){await post('/api/account/logout-all',{});try{localStorage.removeItem('mapleish_sess');localStorage.removeItem('ml_token')}catch(x){}await LS.reload();curUser='';if(window.__wsBack)window.__wsBack();if(window.__wsSite)window.__wsSite()}},true);
/* ---------- keep staff links and stats in step with logins ---------- */
{const _s=window.__wsSite;if(_s)window.__wsSite=function(){const r=_s.apply(this,arguments);navStaff();return r}}
{const _rl=LS.reload;LS.reload=async function(){const k=await _rl.call(LS);navStaff();loadStats();return k}}
navStaff();
/* opening the site at #rankings goes straight there */
if(location.hash==='#rankings')setTimeout(showRank,50);
})();

/* ===== Server client: the live world (phase 1 of the online plan). Only in the server build.
   - While you play a character you are connected to one channel of the world (Channel 1-3, chosen on the Play screen,
     remembered in this browser). The server checks the character belongs to your account.
   - "Players here" on the Play screen lists the real players on your map in your channel, updated live; changing
     maps updates it for everyone.
   - Map chat: messages go to everyone on your map in your channel (120 letters, at most 5 per 5 seconds).
   - Parties (up to 6, in your channel): invite players from the list; the leader can remove members; party chat;
     members on the same map get 20% of each kill's EXP. The map's monsters are shared with the other players on the
     map, and the first to arrive gets priority (a 1.5x share).
   - Trading: Trade with a player on your map (never in event maps): both offer items and mesos, the trade happens
     when both confirm (changing an offer clears both confirmations). Equipment keeps its own stats.
   - Free Market (the Free Market Entrance map, reached from the main towns): open a shop with up to 9 items and
     prices; the items are held out of your bag while it is open and come back when it closes. Other players on the
     map browse the shops and buy part or all of a stack; the server checks the stock.
   - Buddies and whispers: add a player as a buddy (they accept); the buddy list shows who is online and in which
     channel. Whisper anyone online in any channel (Whisper button, or type /w Name message).
   - Emotes: the 7 basic expressions (F1-F7) as buttons under the chat box; everyone on your map sees them in chat and
     next to your name. One emote every 15 seconds. Emote skins (NX) can later swap the pictures via P.emoteSkin.
   - Reconnects by itself (after 3 s, then slower) if the connection drops. ===== */
(function(){
 const API=(window.MAPLE_API||'').replace(/\/$/,'');
 const L={ws:null,ch:+(localStorage.getItem('ml_ch')||1)||1,here:[],chat:[],state:'off',slot:null,map:null,counts:null,tries:0,timer:null,err:'',share:null,party:null,members:[],invite:null,chatTo:'map',trade:null,treq:null,shops:[],myShop:null,draft:[],buds:[],breq:null,wTo:null,emo:{},emoAt:0};
 window.liveState=L;
 const wsUrl=()=>{const base=API||location.origin;let t='';try{t=localStorage.getItem('ml_token')||''}catch(e){}
  return base.replace(/^http/,'ws')+'/api/live?ch='+L.ch+'&slot='+L.slot+(t?'&token='+t:'')};
 const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 function want(){return typeof P!=='undefined'&&P&&typeof scr!=='undefined'&&scr==='game'&&typeof SLOT!=='undefined'&&window.__KV&&window.__KV.me}
 function close(){clearTimeout(L.timer);if(L.ws){const w=L.ws;L.ws=null;try{if(w.readyState===1)w.send('{"t":"bye"}')}catch(e){}try{w.onclose=null;w.close()}catch(e){}}/* leaving on purpose: no grace period */L.state='off';L.here=[];}
 function connect(){close();if(!want())return;L.slot=SLOT;L.map=P.map;L.state='connecting';let ws;try{ws=new WebSocket(wsUrl())}catch(e){return retry()}L.ws=ws;
  ws.onopen=()=>{L.tries=0;L.state='on';L.err='';if(P&&P.map!==L.map)sendMap()};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}
   if(m.t==='welcome'){setTimeout(askWho,300);setTimeout(mFetch,500);if(m.me&&m.me.staff&&L.spyOn&&(L.spyOn.map||L.spyOn.friends||L.spyOn.guild))setTimeout(()=>out({t:'spyset',spy:L.spyOn}),500);setTimeout(gFetch,400);if(!m.resumed){L.myShop=null;L.shops=[];if(P&&P.shopHold)returnHold()}L.here=m.here||[];L.counts=m.counts;L.me=m.me;L.party=m.me.party||null;if(P&&P.map!==m.me.map)sendMap()}
   else if(m.t==='here')L.here=m.players||[];
   else if(m.t==='join'){L.here=L.here.filter(x=>x.id!==m.p.id).concat([m.p])}
   else if(m.t==='leave')L.here=L.here.filter(x=>x.id!==m.id);
   else if(m.t==='chat'){m.ts=m.ts||Date.now();L.chat.push(m);if(L.chat.length>60)L.chat.shift();const tb=tabOf(m);if(tb!==L.ctab)L.unread[tb]++}
   else if(m.t==='share')L.share=m;
   else if(m.t==='treq')L.treq={from:m.from,name:m.name,until:Date.now()+60000};
   else if(m.t==='tstate')L.trade=m;
   else if(m.t==='tend'){L.trade=null;L.err=m.why||''}
   else if(m.t==='tdone'){L.trade=null;applyTrade(m)}
   else if(m.t==='party'){L.party=m.id;L.members=m.members||[];if(m.note)L.err=m.note;if(!m.id)L.chatTo='map'}
   else if(m.t==='pinvited')L.invite={from:m.from,name:m.name,until:Date.now()+60000};
   else if(m.t==='pgain'){if(P&&typeof gain==='function'){gain(m.exp);log('Party EXP +'+XR(m.exp)+' ('+m.from+' defeated a monster).','good','combat')}}
   else if(m.t==='chcount'){L.counts=(L.counts||[0,0,0]).slice();L.counts[m.ch-1]=m.n}
   else if(m.t==='w'){L.chat.push({ts:Date.now(),from:m.from,text:m.text,w:'from'});if(L.chat.length>60)L.chat.shift();if(!L.wTo)L.wTo=m.from;if(L.ctab!=='friends')L.unread.friends++}
   else if(m.t==='wsent'){L.chat.push({ts:Date.now(),from:m.to,text:m.text,w:'to'});if(L.chat.length>30)L.chat.shift()}
   else if(m.t==='emote'){L.emo[m.id]={e:m.e,skin:m.skin,until:Date.now()+5000};L.chat.push({ts:Date.now(),from:m.from,emote:emoPic(m.e,m.skin)});if(L.chat.length>30)L.chat.shift();setTimeout(paint,5100)}
   else if(m.t==='achat'){L.chat.push({ts:Date.now(),from:m.from,text:m.text,all:true});if(L.chat.length>80)L.chat.shift();if(L.ctab!=='all')L.unread.all=(L.unread.all||0)+1}
   else if(m.t==='spy'){m.ts=m.ts||Date.now();(L.spyLog=L.spyLog||[]).push(m);if(L.spyLog.length>120)L.spyLog.shift()}
   else if(m.t==='mail'){mFetch();if(m.from)log('New mail from '+m.from+'.','good','self')}
   else if(m.t==='whois'){if(m.tag==='g')L.gon=m.list||[];else L.buds=m.list||[]}
   else if(m.t==='ginv'){L.ginv={guild:m.guild,from:m.from,until:Date.now()+60000}}
   else if(m.t==='gupd'){if(m.note)log(m.note,'','guild');gFetch()}
   else if(m.t==='gchat'){if(L.guild&&m.guild===L.guild.name){L.chat.push({ts:Date.now(),from:m.from,text:m.text,guild:true});if(L.chat.length>60)L.chat.shift();if(L.ctab!=='guild')L.unread.guild++}}
   else if(m.t==='breq')L.breq={from:m.from,until:Date.now()+60000};
   else if(m.t==='badd'){if(P){P.buddies=P.buddies||[];if(!P.buddies.some(n=>n.toLowerCase()===m.name.toLowerCase())){P.buddies.push(m.name);log(m.name+' is now your buddy.','good','social');save()}askWho()}}
   else if(m.t==='shops')L.shops=m.shops||[];
   else if(m.t==='myshop'){L.myShop=m.shop;if(m.note)L.err=m.note;if(P){if(m.shop)P.shopHold=m.shop.items.map(o=>Object.assign({},o));else returnHold();save()}}
   else if(m.t==='ssold'){if(P){P.mesos+=m.mesos|0;log(m.buyer+' bought '+m.name+(m.n>1?' x'+m.n:'')+' from your shop for '+(m.mesos|0).toLocaleString()+' mesos.','good','items');save()}}
   else if(m.t==='sgot'){if(P){P.mesos=Math.max(0,P.mesos-(m.mesos|0));recvItem(m);log('You bought '+m.name+(m.n>1?' x'+m.n:'')+' from '+m.from+' for '+(m.mesos|0).toLocaleString()+' mesos.','good','items');save();render()}}
   else if(m.t==='err'){L.err=m.error;liveNote(m.error)}
   paint()};
  ws.onclose=()=>{if(L.ws===ws){L.ws=null;L.state='off';L.here=[];paint();retry()}}}
 function retry(){clearTimeout(L.timer);if(!want())return;L.tries++;L.timer=setTimeout(connect,Math.min(30000,3000*L.tries))}
 function sendMap(){if(L.ws&&L.ws.readyState===1&&P){L.map=P.map;L.ws.send(JSON.stringify({t:'map',map:P.map,lvl:P.lvl}));L.chat=L.chat.filter(m=>m.party||m.w||m.guild)}}
 const out=o=>{if(L.ws&&L.ws.readyState===1){L.ws.send(JSON.stringify(o));return true}return false};
 /* the 7 basic expressions (v62 F1-F7). A skin (later an NX item) maps 1-7 to other pictures. */
 const EMO=[null,['😊','Happy'],['😟','Troubled'],['😢','Cry'],['😠','Angry'],['😵','Bewildered'],['😳','Stunned'],['😍','Love']];
 window.EMOTE_SKINS={basic:EMO.map(x=>x&&x[0])};
 const emoPic=(e,skin)=>{const S=(skin&&EMOTE_SKINS[skin])||EMOTE_SKINS.basic;return (S&&S[e])||EMO[e][0]};
 window.liveEmote=function(e){e=e|0;if(!(e>=1&&e<=7))return false;const left=15000-(Date.now()-L.emoAt);if(left>0){L.err='Emotes have a 15 second cooldown ('+Math.ceil(left/1000)+'s).';paint();return false}
  if(!out({t:'emote',e,skin:(P&&P.emoteSkin)||null}))return false;L.emoAt=Date.now();paint();return true};
 /* notices under the tab row */
 function liveNote(t){try{let n=document.getElementById('livenote');const tb=document.querySelector('#app .tabs');if(!tb)return;if(!n){n=document.createElement('div');n.id='livenote';n.style.cssText='margin:6px 0;padding:8px 10px;border-radius:8px;background:#26365a;color:#fff;font-size:14px'}
  if(n.previousElementSibling!==tb)tb.insertAdjacentElement('afterend',n);n.textContent='ℹ️ '+t;clearTimeout(L.noteT);L.noteT=setTimeout(()=>{const x=document.getElementById('livenote');if(x)x.remove()},5000)}catch(e){}}
 window.liveNote=liveNote;
 function askWho(){if(P&&(P.buddies||[]).length)out({t:'who',names:P.buddies});else L.buds=[]}
 window.liveBuddy={add:name=>{name=String(name||'').trim();if(!name)return;if((P.buddies||[]).length>=50){L.err='Your buddy list is full (50).';return paint()}out({t:'breq',to:name})},
  accept:()=>{const r=L.breq;L.breq=null;if(r)out({t:'bacc',to:r.from});paint()},decline:()=>{const r=L.breq;L.breq=null;if(r)out({t:'bno',to:r.from});paint()},
  remove:name=>{P.buddies=(P.buddies||[]).filter(n=>n!==name);save();askWho();paint()},whisper:name=>{L.wTo=name;L.ctab='friends';paint();const i=document.getElementById('live-in');if(i)i.focus()}};
 window.liveSay=function(text,party){text=String(text||'').trim();if(!text)return false;
  const wm=/^\/w(?:hisper)?\s+(\S+)\s+(.+)$/i.exec(text);if(wm)return out({t:'w',to:wm[1],text:wm[2]});
  if(L.ctab==='friends'&&!party){const sel=document.getElementById('live-wto');const to=(sel&&sel.value)||L.wTo;if(!to){L.err='Pick who to whisper (add buddies first).';paint();return false}L.wTo=to;return out({t:'w',to,text})}
  if(L.ctab==='guild'&&!party){if(!L.guild)return false;return out({t:'gchat',text,guild:L.guild.name,to:L.guild.members.map(m=>m.n)})}
  if(L.ctab==='log')return false;
  if(L.ctab==='all'&&!party){if(!(L.me&&L.me.staff))return false;return out({t:'achat',text})}
  if(L.ctab==='party'&&!party)party=true;return out({t:(party||L.chatTo==='party')&&L.party?'pchat':'chat',text})};
/* receiving an item (trade or shop): equipment keeps its own stats */
 function recvItem(o){if(o.inst&&o.inst.b&&ITEMS[o.inst.b]){P.inst=P.inst||{};const id=o.inst.b+'#'+(P.ic=(P.ic|0)+1);P.inst[id]={b:o.inst.b,sl:o.inst.sl|0,ok:o.inst.ok|0,lost:o.inst.lost|0,st:o.inst.st||{}};instBuild(id);P.inv[id]=1}
  else if(ITEMS[o.k])P.inv[o.k]=(P.inv[o.k]||0)+(o.n|0)}
 function takeItem(k,n){if(!(P.inv[k]>0))return;P.inv[k]-=n;if(P.inv[k]<=0)delete P.inv[k];if(P.inst&&P.inst[k]&&!(P.inv[k]>0)&&!Object.values(P.eq||{}).includes(k)&&P.weapon!==k)delete P.inst[k]}
 /* Free Market: items in your open shop are held out of your bag; whatever is left comes back when it closes */
 function returnHold(){if(!P||!P.shopHold)return;const h=P.shopHold;P.shopHold=null;for(const o of h)recvItem(o);if(h.length)log('Your shop closed. Unsold items are back in your bag.','','items');save();if(typeof render==='function')render()}
 window.liveShop={open:title=>{if(!L.draft.length){L.err='Add at least one item.';return paint()}
   const items=L.draft.filter(o=>P.inv[o.k]>=o.n).map(o=>({k:o.k,n:o.n,price:o.price,name:o.name,inst:P.inst&&P.inst[o.k]?Object.assign({},P.inst[o.k]):null}));
   if(!items.length){L.err='Those items are no longer in your bag.';return paint()}
   if(!out({t:'sopen',title,items})){L.err='Not connected.';return paint()}
   for(const o of items)takeItem(o.k,o.n);P.shopHold=items;L.draft=[];save();render()},
  close:()=>out({t:'sclose'}),
  buy:(owner,i,k,n)=>{const sh=L.shops.find(x=>x.id===owner),o=sh&&sh.items[i];if(!o)return;n=Math.max(1,Math.min(o.n,n|0||1));
   if(P.mesos<o.price*n){L.err='You do not have enough mesos.';return paint()}out({t:'sbuy',owner,i,k,n,have:P.mesos})}};
 function addDraft(k,n,price){if(!k||!(P.inv[k]>0))return;n=Math.max(1,Math.min(P.inv[k],n|0||1));price=Math.max(1,Math.floor(+price||0));if(!(price>0)){L.err='Set a price.';return paint()}
  L.draft=L.draft.filter(o=>o.k!==k);if(L.draft.length>=9){L.err='A shop holds 9 items.';return paint()}L.draft.push({k,n,price,name:ITEMS[k].n});L.err='';paint()}
 function emoRow(){const left=Math.max(0,15000-(Date.now()-L.emoAt));if(left>0)setTimeout(()=>{if(Date.now()-L.emoAt>=15000)paint()},left+50);
  return '<div style="display:flex;gap:4px;margin-top:6px">'+[1,2,3,4,5,6,7].map(e=>'<button data-le="'+e+'" title="F'+e+' '+EMO[e][1]+'"'+(left>0?' disabled':'')+' style="flex:1;min-width:0;min-height:34px;padding:0;font-size:20px;line-height:1">'+emoPic(e,P&&P.emoteSkin)+'</button>').join('')+'</div>'
   +(left>0?'<div class="mute" style="font-size:12px;text-align:center">Emotes ready in '+Math.ceil(left/1000)+'s</div>':'')}
 /* ===== guilds: stored on the server; this is the Social tab's guild screen and the guild invitations ===== */
 const RANK={1:'Master',2:'Jr. Master',3:'Member'};
 function gApi(path,body){return fetch('/api/guild'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({slot:SLOT},body||{}))}).then(r=>r.json()).then(j=>{if(j.error){L.gerr=j.error;L.err=j.error}else L.gerr='';gFetch();return j}).catch(()=>{L.gerr='Could not reach the server.'})}
 function gFetch(){if(!want())return;fetch('/api/guild?slot='+SLOT).then(r=>r.json()).then(j=>{if(j.error)return;L.guild=j.guild;L.grank=j.rank;L.gcost=j.cost;L.gmin=j.minLvl;if(j.invite&&!L.ginv)L.ginv={guild:j.invite.guild,from:j.invite.by,until:Date.now()+30000};
   if(P){const nm=L.guild?L.guild.name:null;if((P.guild&&P.guild.name)!==nm){P.guild=nm?{name:nm,live:1}:null;save()}}gWho();paint();if(typeof tab!=='undefined'&&tab==='social')render()}).catch(()=>{})}
 function gWho(){if(L.guild)out({t:'who',tag:'g',names:L.guild.members.map(m=>m.n)})}
 window.liveGuild={create:name=>{if(!P)return;if(P.map!=='henesys'){L.gerr='Talk to Heracle in Henesys to create a guild.';return render()}if(P.mesos<(L.gcost||1500000)){L.gerr='Creating a guild costs '+(L.gcost||1500000).toLocaleString()+' mesos.';return render()}
   gApi('/create',{name,mesos:P.mesos}).then(j=>{if(j&&j.ok){P.mesos-=(L.gcost||1500000);log('You created the guild '+j.guild.name+' (-'+(L.gcost||1500000).toLocaleString()+' mesos).','good','guild');save();render()}else render()})},
  invite:to=>gApi('/invite',{to}).then(()=>render()),accept:()=>{L.ginv=null;gApi('/accept').then(()=>{paint();render()})},decline:()=>{L.ginv=null;gApi('/decline');paint()},
  leave:()=>gApi('/leave').then(()=>render()),kick:who=>gApi('/kick',{who}).then(()=>render()),rank:(who,rank)=>gApi('/rank',{who,rank}).then(()=>render()),
  notice:text=>gApi('/notice',{text}).then(()=>render()),disband:()=>gApi('/disband').then(()=>render())};
 function guildHtml(){const G=L.guild,on=n=>(L.gon||[]).find(x=>x.name.toLowerCase()===n.toLowerCase());let h='<div class="panel"><h2>🛡️ Guild</h2>';
  if(L.state!=='on')h+='<div class="mute">Connecting to the server…</div>';
  if(!G){h+=(L.ginv&&L.ginv.until>Date.now()?'<div class="mrow" style="background:rgba(240,170,60,.2);border-radius:8px"><div style="flex:1"><b>'+esc(L.ginv.from)+'</b> invites you to <b>'+esc(L.ginv.guild)+'</b>.</div><button data-lg="accept">Join</button><button data-lg="decline">No</button></div>':'')
    +'<p>You are not in a guild. A guild member can invite you, or you can start your own.</p>'
    +'<p class="mute">Creating a guild: talk to <b>Heracle</b> in Henesys. It costs <b>'+(L.gcost||1500000).toLocaleString()+' mesos</b> and you need to be level '+(L.gmin||10)+'. Guilds hold 30 members.</p>'
    +(P&&P.map==='henesys'?'<div style="display:flex;gap:6px"><input id="lg-name" maxlength="12" placeholder="Guild name (3-12 letters/numbers)" style="flex:1;min-width:0"><button class="main" data-lg="create">Create</button></div>':'<div class="mute">You are not in Henesys.</div>')}
  else{const me=L.me&&L.me.name;const r=L.grank|0;
   h+='<div class="row"><b style="font-size:1.1em">'+esc(G.name)+'</b><span class="mute">'+G.members.length+'/'+G.cap+' · you: '+RANK[r]+'</span></div>'
    +'<div class="mute" style="margin:4px 0">Notice: '+(G.notice?esc(G.notice):'(none)')+'</div>'
    +(r<=2?'<div style="display:flex;gap:6px;margin-bottom:6px"><input id="lg-notice" maxlength="100" placeholder="Set the guild notice" style="flex:1;min-width:0"><button data-lg="notice">Set</button></div>':'')
    +G.members.slice().sort((a,b)=>a.r-b.r||a.n.localeCompare(b.n)).map(m=>{const o=on(m.n),self=me&&m.n.toLowerCase()===me.toLowerCase();
     let btn='';if(!self&&r===1)btn=(m.r===3?'<button data-lg="rank:'+esc(m.n)+':2">Promote</button>':'<button data-lg="rank:'+esc(m.n)+':3">Demote</button>')+'<button data-lg="rank:'+esc(m.n)+':1" title="Make Master">👑</button>';
     if(!self&&r<=2&&m.r>r)btn+='<button data-lg="kick:'+esc(m.n)+'" style="min-width:0">✕</button>';
     return '<div class="mrow"><span class="av">'+(o?'🟢':'⚪')+'</span><div style="flex:1"><b>'+esc(m.n)+'</b>'+(self?' (you)':'')+'<div class="mute">'+RANK[m.r]+(o?' · Ch '+o.ch+' · '+esc((typeof MAPS!=='undefined'&&MAPS[o.map]&&MAPS[o.map].n)||o.map):' · Offline')+'</div></div>'+btn+'</div>'}).join('')
    +(r<=2?'<div style="display:flex;gap:6px;margin-top:6px"><input id="lg-inv" maxlength="12" placeholder="Invite by character name" style="flex:1;min-width:0"><button data-lg="invite">Invite</button></div>':'')
    +'<div style="display:flex;gap:6px;margin-top:8px"><button data-lg="leave" style="flex:1">Leave guild</button>'+(r===1?'<button data-lg="disband" style="flex:1">Disband</button>':'')+'</div>'}
  return h+(L.gerr?'<div class="mute" style="color:#b0562f;margin-top:6px">'+esc(L.gerr)+'</div>':'')+'</div>'}
 /* the online version's Social tab is the real guild screen (the old one only lived in this browser) */
 {const _sp=socialPanel;socialPanel=function(){if(!want())return _sp.apply(this,arguments);return guildHtml()+'<div class="panel" id="budpanel"><h2>🤝 Buddies</h2>'+budHtml()+'</div>'}}
 /* ===== Mailbox: System (from the game and staff only) and Messages (from players only). Kept on the server, so it
    arrives while you are offline. A mailbox button on the Play screen shows how many are unread. ===== */
 L.mail=[];L.unreadMail=0;L.mview=null;/* null closed | {f:'system'|'player', open:id, compose:{to,subject,body}} */
 function mFetch(){if(!window.__KV||!window.__KV.me)return;fetch('/api/mail').then(r=>r.json()).then(j=>{if(j.error)return;L.mail=j.mail||[];L.unreadMail=j.unread|0;drawMailBtn();if(L.mview)render()}).catch(()=>{})}
 function mApi(path,body){return fetch('/api/mail'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({slot:typeof SLOT!=='undefined'?SLOT:0},body||{}))}).then(r=>r.json()).then(j=>{L.merr=j.error||'';mFetch();return j}).catch(()=>{L.merr='Could not reach the server.'})}
 window.liveMail={open:f=>{L.mview={f:f||'system'};mFetch();render()},close:()=>{L.mview=null;render()},
  read:id=>{L.mview.open=id;const r=L.mail.find(x=>x.id===id);if(r&&!r.read){r.read=1;L.unreadMail=Math.max(0,L.unreadMail-1);mApi('/read',{id})}render()},
  del:id=>{mApi('/delete',{id}).then(()=>{if(L.mview)L.mview.open=null;render()})},
  compose:(to,subject)=>{L.mview=L.mview||{f:'player'};L.mview.f='player';L.mview.compose={to:to||'',subject:subject||'',body:''};render()},
  send:(to,subject,body)=>mApi('/send',{to,subject,body}).then(j=>{if(j&&j.ok){if(L.mview)L.mview.compose=null;L.merr='Sent to '+to+'.'}render()}),
  system:(to,subject,body)=>mApi('/system',{to,subject,body}).then(j=>{if(j&&j.ok){if(L.mview)L.mview.compose=null;L.merr='System mail sent ('+j.sent+').'}render()})};
 function drawMailBtn(){const b=document.getElementById('mailbtn');if(b)b.innerHTML=mailBtnInner()}
 const mailBtnInner=()=>'📬 Mail'+(L.unreadMail?' <b class="mbadge">'+L.unreadMail+'</b>':'');
 function mailHtml(){const V=L.mview,f=V.f,list=L.mail.filter(m=>m.kind===f),cnt=k=>L.mail.filter(m=>m.kind===k&&!m.read).length,staff=window.__KV.me&&/admin|gm/.test(window.__KV.me.role||'');
  let h='<div class="panel"><div class="row"><h2>📬 Mailbox</h2><button data-lm="close">Close</button></div>'
   +'<div class="seg ltb" style="display:flex;gap:4px"><button data-lm="f:system" class="'+(f==='system'?'on':'')+'" style="flex:1">System'+(cnt('system')?' •'+cnt('system'):'')+'</button><button data-lm="f:player" class="'+(f==='player'?'on':'')+'" style="flex:1">Messages'+(cnt('player')?' •'+cnt('player'):'')+'</button></div>'
   +'<div class="mute" style="font-size:12px;margin:4px 0">'+(f==='system'?'Notices from the game and the staff. Players cannot send these.':'Private messages from other players. They arrive even while you are offline.')+'</div>';
  if(V.compose){const c=V.compose,sys=f==='system';h+='<div style="display:flex;flex-direction:column;gap:6px"><input id="lm-to" maxlength="12" placeholder="'+(sys?'Character name, or all':'To (character name)')+'" value="'+esc(c.to)+'"><input id="lm-subj" maxlength="40" placeholder="Subject" value="'+esc(c.subject)+'"><textarea id="lm-body" maxlength="500" rows="5" placeholder="Message">'+esc(c.body)+'</textarea><div style="display:flex;gap:6px"><button class="main" data-lm="'+(sys?'sendsys':'send')+'" style="flex:1">'+(sys?'Send system mail':'Send')+'</button><button data-lm="cancel" style="flex:1">Cancel</button></div></div>'}
  else if(V.open){const m=L.mail.find(x=>x.id===V.open);if(m)h+='<div class="cbox" style="padding:8px"><div><b>'+esc(m.subject)+'</b></div><div class="mute" style="font-size:12px">From '+esc(m.from)+' · '+new Date(m.created).toLocaleString()+'</div><div style="margin-top:8px;white-space:pre-wrap">'+esc(m.body)+'</div></div><div style="display:flex;gap:6px;margin-top:6px"><button data-lm="back" style="flex:1">Back</button>'+(m.kind==='player'?'<button data-lm="reply:'+esc(m.from)+'" style="flex:1">Reply</button>':'')+'<button data-lm="del:'+m.id+'" style="flex:1">Delete</button></div>'}
  else{h+=(list.length?list.map(m=>'<div class="mrow" data-lm="open:'+m.id+'" style="cursor:pointer'+(m.read?';opacity:.7':'')+'"><span class="av">'+(m.read?'📭':'📩')+'</span><div style="flex:1;min-width:0"><b>'+esc(m.subject)+'</b><div class="mute" style="font-size:12px">'+esc(m.from)+' · '+new Date(m.created).toLocaleDateString()+'</div></div></div>').join(''):'<div class="mute">No '+(f==='system'?'system mail':'messages')+' yet.</div>')
    +(f==='player'?'<button class="main" data-lm="new" style="width:100%;margin-top:8px">Write a message</button>':(staff?'<button data-lm="newsys" style="width:100%;margin-top:8px">Send system mail (staff)</button>':''))}
  return h+(L.merr?'<div class="mute" style="margin-top:6px;color:#b0562f">'+esc(L.merr)+'</div>':'')+'</div>'}
 /* the mailbox button on the Play screen, and the mailbox screen (replaces the Play screen while open) */
 {const _r3=render;render=function(){const out=_r3.apply(this,arguments);try{if(window.__KV&&window.__KV.me&&typeof scr!=='undefined'&&scr==='game'&&P){const app=document.getElementById('app');
   if(L.mview&&tab==='play'){[...app.querySelectorAll(':scope > .panel')].forEach(x=>x.style.display='none');const d=document.createElement('div');d.innerHTML=mailHtml();app.insertBefore(d.firstChild,app.firstChild.nextSibling)}
   else if(tab==='play'&&!document.getElementById('mailbtn')){const first=[...app.querySelectorAll(':scope > .panel')][0];if(first){const b=document.createElement('button');b.id='mailbtn';b.className='mailbtn';b.dataset.lm='openbox';b.innerHTML=mailBtnInner();first.style.position='relative';first.appendChild(b)}}}}catch(e){}return out}}
 (()=>{const st=document.createElement('style');st.textContent='.mailbtn{position:absolute;top:8px;right:8px;z-index:3;min-height:30px;padding:2px 10px;font-size:13px}.mbadge{display:inline-block;min-width:16px;padding:0 4px;border-radius:8px;background:#d0451b;color:#fff;font-size:11px;line-height:16px;text-align:center}';document.head.appendChild(st)})();
 setInterval(()=>{if(window.__KV&&window.__KV.me&&!L.ws)mFetch()},120000);
 function budHtml(){const B=(P&&P.buddies)||[];const on=n=>L.buds.find(x=>x.name.toLowerCase()===n.toLowerCase());
  return '<div class="mute" style="margin:8px 0 2px"><b>Buddies</b> ('+B.length+'/50)</div>'
   +(L.breq&&L.breq.until>Date.now()?'<div class="mrow" style="background:rgba(170,120,255,.18);border-radius:8px"><span class="av">💌</span><div style="flex:1"><b>'+esc(L.breq.from)+'</b> wants to be your buddy.</div><button data-lb="accept">Accept</button><button data-lb="decline">No</button></div>':'')
   +B.map(n=>{const o=on(n);return '<div class="mrow"><span class="av">'+(o?'🟢':'⚪')+'</span><div style="flex:1"><b>'+esc(n)+'</b><div class="mute">'+(o?'Online · Ch '+o.ch+' · '+esc((typeof MAPS!=='undefined'&&MAPS[o.map]&&MAPS[o.map].n)||o.map):'Offline')+'</div></div>'+(o?'<button data-lb="w:'+esc(n)+'">Whisper</button>':'<button data-lm="mailto:'+esc(n)+'">Mail</button>')+'<button data-lb="rm:'+esc(n)+'" style="min-width:0">✕</button></div>'}).join('')
   +'<div style="display:flex;gap:6px;margin-top:4px"><input id="lb-name" maxlength="12" placeholder="Character name" style="flex:1;min-width:0"><button data-lb="add">Add buddy</button></div>'}
 function shopHtml(){if(!P||P.map!=='free_market')return '';const me=L.me&&L.me.id;let h='<div class="panel" style="margin:8px 0;padding:8px"><b>🏪 Free Market shops</b>';
  const others=L.shops.filter(x=>x.id!==me);
  h+=others.length?others.map(sh=>'<div style="margin-top:6px"><div><b>'+esc(sh.title)+'</b> <span class="mute">('+esc(sh.owner)+')</span></div>'+sh.items.map((o,i)=>'<div class="row" style="align-items:center;gap:6px"><span style="flex:1">'+esc(o.name)+' x'+o.n+' · <b>'+(o.price|0).toLocaleString()+'</b> each</span>'+(o.n>1?'<input data-sn="'+esc(sh.id)+':'+i+'" type="number" min="1" max="'+o.n+'" value="1" style="width:56px">':'')+'<button data-ls="buy:'+esc(sh.id)+':'+i+':'+esc(o.k)+'">Buy</button></div>').join('')+'</div>').join(''):'<div class="mute">No shops open in this channel right now.</div>';
  h+='<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:6px"><b>Your shop</b>';
  if(L.myShop){h+='<div class="mute">'+esc(L.myShop.title)+' — open while you stay on this map.</div>'+L.myShop.items.map(o=>'<div>'+esc(o.name)+' x'+o.n+' · '+(o.price|0).toLocaleString()+' each</div>').join('')+'<button data-ls="close" style="margin-top:6px">Close shop</button>'}
  else{const keys=Object.keys(P.inv).filter(k=>P.inv[k]>0&&ITEMS[k]&&!(typeof CASH!=='undefined'&&CASH.some(c=>c[0]===k))&&!Object.values(P.eq||{}).includes(k)&&P.weapon!==k);
   h+=(L.draft.length?L.draft.map(o=>'<div>'+esc(o.name)+' x'+o.n+' · '+o.price.toLocaleString()+' each <button data-ls="rm:'+esc(o.k)+'" style="min-height:0;padding:0 6px">✕</button></div>').join(''):'<div class="mute">Pick items and prices, then open your shop.</div>')
    +'<div style="display:flex;gap:6px;margin-top:6px"><select id="ls-item" style="flex:2;min-width:0">'+keys.map(k=>'<option value="'+esc(k)+'">'+esc(ITEMS[k].n)+' ('+P.inv[k]+')</option>').join('')+'</select><input id="ls-n" type="number" min="1" value="1" style="width:52px"><input id="ls-p" type="number" min="1" placeholder="Price" style="width:80px"><button data-ls="add">Add</button></div>'
    +'<div style="display:flex;gap:6px;margin-top:6px"><input id="ls-title" maxlength="30" placeholder="Shop name" style="flex:1;min-width:0"><button class="main" data-ls="open">Open shop</button></div>'}
  return h+'</div></div>'}
/* trading */
 function applyTrade(m){if(!P)return;const g=m.give||{},r=m.get||{};
  P.mesos=Math.max(0,P.mesos-(g.mesos|0))+(r.mesos|0);
  for(const o of g.items||[])takeItem(o.k,o.n);
  for(const o of r.items||[])recvItem(o);
  log('Trade with '+m.with+' complete.','good','items');save();render()}
 const tradeable=()=>Object.keys(P.inv).filter(k=>P.inv[k]>0&&ITEMS[k]&&!(typeof CASH!=='undefined'&&CASH.some(c=>c[0]===k)));
 window.liveTrade={ask:id=>{if((MAPS[P.map]||{}).noTrade){L.err='No trading in event maps.';return paint()}out({t:'treq',to:id})},accept:()=>{L.treq=null;out({t:'tacc'});paint()},decline:()=>{L.treq=null;out({t:'tno'});paint()},
  offer:(items,mesos)=>out({t:'toffer',items,mesos}),ok:()=>out({t:'tok'}),cancel:()=>out({t:'tcancel'})};
 L.myOffer={items:[],mesos:0};
 function offerItem(k,n){if(!k||!(P.inv[k]>0))return;n=Math.max(1,Math.min(P.inv[k],n|0||1));const it=ITEMS[k];const ex=L.myOffer.items.find(o=>o.k===k);if(ex)ex.n=n;else if(L.myOffer.items.length<9)L.myOffer.items.push({k,n,name:it.n,inst:P.inst&&P.inst[k]?Object.assign({},P.inst[k]):null});liveTrade.offer(L.myOffer.items,L.myOffer.mesos)}
 window.liveParty={invite:id=>out({t:'pinvite',to:id}),accept:()=>{L.invite=null;out({t:'paccept'});paint()},decline:()=>{L.invite=null;out({t:'pdecline'});paint()},leave:()=>out({t:'pleave'}),kick:id=>out({t:'pkick',id})};
 /* party EXP: tell the server about each kill so party members on this map get their share */
 {const _w=win;win=function(){const k=enc&&enc.k;const r=_w.apply(this,arguments);try{if(k&&L.party&&MON[k])out({t:'pexp',exp:MON[k].exp|0})}catch(e){}return r}}
 /* party board size: rows = the lowest party member's rows (on this map) + 1 per extra member there, at most 10 rows
    (2 monsters per row). Solo: the normal rows for your level. */
 const capAt=l=>{l=l||1;if(l<=10)return 6;if(l<=71)return Math.round(6+(l-10)*9/61);return Math.min(20,Math.round(15+(l-71)*5/79))};
 {const _mc0=monCap;monCap=function(){const base=_mc0();try{if(!L.party||!(L.ws&&L.ws.readyState===1)||!P)return base;
   const here=L.members.filter(x=>x.map===P.map);if(here.length<2)return base;const low=Math.min(...here.map(x=>x.lvl||1));
   const rows=Math.min(10,Math.ceil(capAt(low)/2)+(here.length-1));return rows*2}catch(e){return base}}}
 /* the map's monsters are shared with the other players on it; the first to arrive gets priority */
 {const _mc=mapCap;mapCap=function(){const base=_mc();const s=L.share;if(!s||!(s.n>1)||!(L.ws&&L.ws.readyState===1))return base;try{const pop=mobSlots(P.map).length;return Math.max(1,Math.floor(pop*0.75*s.w/s.total))}catch(e){return base}}}
 window.liveChannel=function(n){n=+n;if(!(n>=1&&n<=3)||n===L.ch)return;L.chOpen=false;L.ch=n;try{localStorage.setItem('ml_ch',String(n))}catch(e){}L.chat=[];connect();paint()};
 /* keep the connection matched to the character and map */
 setInterval(()=>{if(!want()){if(L.ws||L.state!=='off')close();return}
  if(L.emoAt&&Date.now()-L.emoAt<16000)paint();/* emote cooldown countdown */
  if(!L.ws&&L.state==='off'&&!L.timer)connect();else if(L.slot!==SLOT)connect();else if(P.map!==L.map)sendMap();
  if(Date.now()-(L.lastCount||0)>30000){L.lastCount=Date.now();askWho();gWho();if(L.me&&L.me.staff&&(L.spyOn.map||L.spyOn.friends||L.spyOn.guild))out({t:'spyset',spy:L.spyOn});fetch('/api/live/counts').then(r=>r.json()).then(j=>{if(j&&j.counts){L.counts=j.counts;paint()}}).catch(()=>{})}
  if(L.ws&&L.ws.readyState===1&&Date.now()-(L.lastPing||0)>25000){L.lastPing=Date.now();try{L.ws.send('{"t":"ping"}')}catch(e){}}},1000);
 /* the Players here panel, drawn after the Play screen */
 function panelHtml(){const st=L.state==='on'?'🟢 Channel '+L.ch:L.state==='connecting'?'🟡 Connecting…':'⚪ Offline';
  const others=L.here.filter(x=>!L.me||x.id!==L.me.id);
  return '<div class="row"><h2>👥 Players here</h2><span class="mute">'+st+'</span></div><div class="pad">'
   +(L.invite&&L.invite.until>Date.now()?'<div class="mrow" style="background:rgba(242,193,78,.2);border-radius:8px"><span class="av">🎉</span><div style="flex:1"><b>'+esc(L.invite.name)+'</b> invites you to a party.</div><button data-lp="accept">Join</button><button data-lp="decline">No</button></div>':'')
   +(L.ginv&&L.ginv.until>Date.now()?'<div class="mrow" style="background:rgba(240,170,60,.2);border-radius:8px"><span class="av">🛡️</span><div style="flex:1"><b>'+esc(L.ginv.from)+'</b> invites you to the guild <b>'+esc(L.ginv.guild)+'</b>.</div><button data-lg="accept">Join</button><button data-lg="decline">No</button></div>':'')
   +(L.breq&&L.breq.until>Date.now()?'<div class="mrow" style="background:rgba(170,120,255,.18);border-radius:8px"><span class="av">💌</span><div style="flex:1"><b>'+esc(L.breq.from)+'</b> wants to be your buddy.</div><button data-lb="accept">Accept</button><button data-lb="decline">No</button></div>':'')
   +(L.treq&&L.treq.until>Date.now()?'<div class="mrow" style="background:rgba(120,200,255,.2);border-radius:8px"><span class="av">🔁</span><div style="flex:1"><b>'+esc(L.treq.name)+'</b> wants to trade.</div><button data-lt="accept">Trade</button><button data-lt="decline">No</button></div>':'')
   +(L.trade?'<div class="panel" style="margin:8px 0;padding:8px"><b>🔁 Trading with '+esc(L.trade.name)+'</b><div style="display:flex;gap:8px;margin-top:6px"><div style="flex:1"><div class="mute">You give'+(L.trade.ok[0]?' ✅':'')+'</div>'+(L.trade.mine.items.map(o=>'<div>'+esc(o.name)+' x'+o.n+' <button data-lt="rm:'+esc(o.k)+'" style="min-height:0;padding:0 6px">✕</button></div>').join('')||'<div class="mute">Nothing</div>')+'<div>'+(L.trade.mine.mesos|0).toLocaleString()+' mesos</div></div><div style="flex:1"><div class="mute">You get'+(L.trade.ok[1]?' ✅':'')+'</div>'+(L.trade.theirs.items.map(o=>'<div>'+esc(o.name)+' x'+o.n+'</div>').join('')||'<div class="mute">Nothing</div>')+'<div>'+(L.trade.theirs.mesos|0).toLocaleString()+' mesos</div></div></div>'
     +'<div style="display:flex;gap:6px;margin-top:6px"><select id="lt-item" style="flex:2;min-width:0">'+tradeable().map(k=>'<option value="'+esc(k)+'">'+esc(ITEMS[k].n)+' ('+P.inv[k]+')</option>').join('')+'</select><input id="lt-n" type="number" min="1" value="1" style="flex:1;min-width:0"><button data-lt="add">Add</button></div>'
     +'<div style="display:flex;gap:6px;margin-top:6px"><input id="lt-m" type="number" min="0" placeholder="Mesos" value="'+(L.myOffer.mesos||'')+'" style="flex:1;min-width:0"><button data-lt="mesos">Set mesos</button></div>'
     +'<div style="display:flex;gap:6px;margin-top:6px"><button class="main" data-lt="ok" style="flex:1">Confirm</button><button data-lt="cancel" style="flex:1">Cancel</button></div><div class="mute" style="font-size:12px">Changing an offer clears both confirmations. The trade happens when you both confirm.</div></div>':'')
   +shopHtml()
   +(L.party&&L.members.length?'<div class="mute" style="margin:6px 0 2px"><b>Party</b> ('+L.members.length+'/6) · members on this map share 20% of each kill\'s EXP</div>'+L.members.map(x=>'<div class="mrow"><span class="av">'+(x.lead?'👑':'🧑')+'</span><div style="flex:1"><b>'+esc(x.name)+'</b><div class="mute">Lv '+(x.lvl|0)+' · '+esc((typeof MAPS!=='undefined'&&MAPS[x.map]&&MAPS[x.map].n)||x.map)+'</div></div>'+(L.me&&x.id===L.me.id?'<button data-lp="leave">Leave</button>':(L.members.some(y=>y.lead&&L.me&&y.id===L.me.id)?'<button data-lp="kick:'+esc(x.id)+'">Remove</button>':''))+'</div>').join(''):'')
   +(others.length?others.map(x=>'<button class="npc" data-prof="'+esc(x.name)+'"><span class="av">'+(L.emo[x.id]&&L.emo[x.id].until>Date.now()?emoPic(L.emo[x.id].e,L.emo[x.id].skin):'🧑')+'</span><span style="flex:1;text-align:left">'+esc(x.name)+' <span class="mute">Lv '+(x.lvl|0)+'</span><br><span class="mute">'+(x.job?esc(x.job):'Beginner')+(L.members.some(y=>y.id===x.id)?' · Party':'')+'</span></span></button>').join(''):'<div class="mute">No other players on this map'+(L.state==='on'?' right now.':'.')+'</div>')
   +(L.err?'<div class="mute" style="color:#b0562f">'+esc(L.err)+'</div>':'')+'</div>'}
 /* the chat panel: tabs Map / Friends (whispers) / Party / Guild / Activity log (read-only game log) */
 L.ctab=L.ctab||'map';L.unread={all:0,map:0,friends:0,party:0,guild:0};L.spyOn={map:false,friends:false,guild:false};
 const tabOf=m=>m.all?'all':m.w?'friends':m.party?'party':m.guild?'guild':'map';
 function chatLine(m){return m.emote?'<div><b>'+esc(m.from)+'</b> <span style="font-size:20px">'+m.emote+'</span></div>':m.w?'<div style="color:#7a3fb5"><b>'+(m.w==='to'?'To '+esc(m.from):esc(m.from)+' whispers')+':</b> '+esc(m.text)+'</div>':'<div'+(m.party?' style="color:#2e7d5b"':m.guild?' style="color:#a0661c"':'')+'><b>'+esc(m.from)+':</b> '+esc(m.text)+'</div>'}
 function chatHtml(){const T=[['all','All'],['map','Map'],['friends','Friends'],['party','Party'],['guild','Guild'],['log','Log']];const t=L.ctab;
  let body;
  if(t==='all'){const staff=L.me&&L.me.staff;const col={map:'#2b6cb0',friends:'#7a3fb5',guild:'#a0661c'};
   const mine=L.chat.filter(m=>!m.party).map(m=>({ts:m.ts||0,h:m.all?'<div style="color:#c2410c;font-weight:bold">📢 '+esc(m.from)+': '+esc(m.text)+'</div>':chatLine(m)}));
   const spies=staff?(L.spyLog||[]).filter(m=>L.spyOn[m.kind]).map(m=>({ts:m.ts||0,h:'<div style="color:'+col[m.kind]+';opacity:.9;font-size:.92em">['+(m.kind==='map'?'Ch'+m.ch+' '+esc((typeof MAPS!=='undefined'&&MAPS[m.map]&&MAPS[m.map].n)||m.map):m.kind==='friends'?esc(m.from)+' → '+esc(m.to):'Guild '+esc(m.guild))+'] <b>'+esc(m.from)+':</b> '+esc(m.text)+'</div>'})):[];
   const v=mine.concat(spies).sort((a,b)=>a.ts-b.ts);body=v.length?v.map(x=>x.h).join(''):'<div class="mute">All: announcements from the staff, plus your map, whispers and guild chat in one place.</div>'}
  else if(t==='log'){const v=(typeof logs!=='undefined'?logs:[]).slice(-60);body=v.length?v.map(l=>'<div class="'+l[1]+'">'+esc(l[0])+'</div>').join(''):'<div class="mute">Nothing here yet.</div>'}
  else{const v=L.chat.filter(m=>tabOf(m)===t);body=v.length?v.map(chatLine).join(''):'<div class="mute">'+({map:'Map chat: say hi to players on this map.',friends:'Whispers with your buddies and other players show here.',party:L.party?'Party chat: only your party sees this.':'You are not in a party. Invite players from Players here.',guild:L.guild?'Guild chat: only '+esc(L.guild.name)+' members see this.':'You are not in a guild.'}[t])+'</div>'}
  const B=(P&&P.buddies)||[],rec=[...new Set(L.chat.filter(m=>m.w).map(m=>m.from).reverse())],targets=[...new Set((L.wTo?[L.wTo]:[]).concat(rec,B))];
  let input='';
  if(t==='log')input='<div class="mute" style="font-size:12px;margin-top:4px">The activity log is read-only.</div>';
  else if(t==='all'&&!(L.me&&L.me.staff))input='<div class="mute" style="font-size:12px;margin-top:4px">Only admins and GMs can talk in All.</div>';
  else if(t==='all')input='<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap"><span class="mute" style="font-size:12px;align-self:center">Watch:</span>'+[['map','All maps'],['friends','All friends'],['guild','All guilds']].map(x=>'<button data-spy="'+x[0]+'" class="'+(L.spyOn[x[0]]?'on main':'')+'" style="min-height:26px;padding:2px 8px;font-size:12px">'+x[1]+'</button>').join('')+'</div><div style="display:flex;gap:6px;margin-top:6px"><input id="live-in" maxlength="120" placeholder="Announce to every map" style="flex:1;min-width:0"><button id="live-say">Send</button></div>';
  else if(t==='guild'&&!L.guild)input='<div class="mute" style="font-size:12px;margin-top:4px">Join or create a guild (Social tab) to use guild chat.</div>';
  else if(t==='party'&&!L.party)input='';
  else input='<div style="display:flex;gap:6px;margin-top:6px">'+(t==='friends'?'<select id="live-wto" style="max-width:38%;min-width:0">'+(targets.length?targets.map(n=>'<option'+(n===L.wTo?' selected':'')+'>'+esc(n)+'</option>').join(''):'<option value="">No one yet</option>')+'</select>':'')+'<input id="live-in" maxlength="120" placeholder="'+(t==='friends'?'Whisper…':t==='party'?'Say to your party':t==='guild'?'Say to your guild':'Say something (/w Name to whisper)')+'" style="flex:1;min-width:0"><button id="live-say">Send</button></div>';
  return '<h2>💬 Chat</h2><div class="pad"><div class="seg ltb" style="display:flex;gap:4px;flex-wrap:wrap">'+T.map(x=>'<button data-ct="'+x[0]+'" class="'+(t===x[0]?'on':'')+'" style="flex:1;min-width:0;padding:4px 2px">'+x[1]+(x[0]!=='log'&&L.unread[x[0]]&&t!==x[0]?' <b style="color:#d0451b">•'+L.unread[x[0]]+'</b>':'')+'</button>').join('')+'</div>'
   +'<div class="cbox" id="live-chat" style="max-height:180px;min-height:90px;overflow:auto;margin-top:6px">'+body+'</div>'+input+(t!=='log'?emoRow():'')+'</div>'}
 function paint(){const el=document.getElementById('livebox');if(!el)return;const inp=document.getElementById('live-in'),val=inp?inp.value:'',foc=document.activeElement===inp;
  el.innerHTML=panelHtml();const cx=document.getElementById('livechatbox');if(cx){if(L.unread[L.ctab])L.unread[L.ctab]=0;cx.innerHTML=chatHtml()}const ni=document.getElementById('live-in');if(ni){ni.value=val;if(foc)ni.focus()}const cb=document.getElementById('live-chat');if(cb)cb.scrollTop=cb.scrollHeight}
 {const _r=render;render=function(){const out=_r.apply(this,arguments);try{if(want()&&tab==='play'&&!(MAPS[P.map]||{}).jobtest){const app=document.getElementById('app');
    const people=[...app.querySelectorAll(':scope > .panel')].find(p=>p.querySelector('.npc'))||[...app.querySelectorAll(':scope > .panel')].find(p=>/PEOPLE/i.test((p.querySelector('h2')||{}).textContent||''));
    if(!document.getElementById('livebox')){const d=document.createElement('div');d.id='livebox';d.className='panel';if(people)people.insertAdjacentElement('afterend',d);else{const log=document.getElementById('log');if(log)log.insertAdjacentElement('beforebegin',d);else app.appendChild(d)}const c=document.createElement('div');c.id='livechatbox';c.className='panel';d.insertAdjacentElement('afterend',c);paint()}
    {const lg=document.getElementById('log');if(lg)lg.style.display='none'}/* the Activity log lives in the chat tabs */}}catch(e){}return out}}
 /* Menu tab: a button with your channel and how many players are in it; pressing it opens the channel menu */
 function chHtml(){const n=c=>L.counts&&L.counts[c-1]!=null?(c===L.ch&&L.state==='on'?Math.max(1,L.counts[c-1]|0):L.counts[c-1]|0):'?';
  return '<div class="pad"><button data-chm="1" class="main" style="width:100%;display:flex;justify-content:space-between;align-items:center;min-height:44px"><span>📡 Channel '+L.ch+(L.state==='on'?'':L.state==='connecting'?' (connecting…)':' (offline)')+'</span><span>👥 '+n(L.ch)+' '+(n(L.ch)===1?'player':'players')+' ▾</span></button>'
   +(L.chOpen?'<div style="margin-top:6px">'+[1,2,3].map(c=>'<button data-live-ch="'+c+'" style="width:100%;display:flex;justify-content:space-between;margin-top:4px;min-height:40px"'+(c===L.ch?' disabled':'')+'><span>Channel '+c+(c===L.ch?' (you are here)':'')+'</span><span>👥 '+n(c)+'</span></button>').join('')+'</div>':'')+'</div>'}
 {const _r2=render;render=function(){const out=_r2.apply(this,arguments);try{if(want()&&tab==='menu'&&!feat){const app=document.getElementById('app');if(!document.getElementById('chbox')){const d=document.createElement('div');d.id='chbox';d.className='panel';const first=app.querySelector(':scope > .panel');if(first)first.insertAdjacentElement('beforebegin',d);else app.appendChild(d);d.innerHTML=chHtml()}}}catch(e){}return out}}
 const _paint0=paint;paint=function(){_paint0();try{if(typeof decorateCollapse==='function')decorateCollapse()}catch(e){}const c=document.getElementById('chbox');if(c)c.innerHTML=chHtml()};
 document.addEventListener('click',e=>{const t=e.target;if(t.closest&&t.closest('[data-chm]')){L.chOpen=!L.chOpen;if(L.chOpen)fetch('/api/live/counts').then(r=>r.json()).then(j=>{if(j&&j.counts){L.counts=j.counts;paint()}}).catch(()=>{});paint();return}if(t.closest&&t.closest('[data-live-ch]')){liveChannel(t.closest('[data-live-ch]').dataset.liveCh);return}
  const lt=t.closest&&t.closest('[data-lt]');if(lt){const [a3,arg3]=lt.dataset.lt.split(/:(.*)/);
   if(a3==='ask'){L.myOffer={items:[],mesos:0};liveTrade.ask(arg3)}else if(a3==='accept'){L.myOffer={items:[],mesos:0};liveTrade.accept()}else if(a3==='add'){offerItem((document.getElementById('lt-item')||{}).value,+(document.getElementById('lt-n')||{}).value)}
   else if(a3==='rm'){L.myOffer.items=L.myOffer.items.filter(o=>o.k!==arg3);liveTrade.offer(L.myOffer.items,L.myOffer.mesos)}else if(a3==='mesos'){L.myOffer.mesos=Math.max(0,Math.min(P.mesos,Math.floor(+(document.getElementById('lt-m')||{}).value||0)));liveTrade.offer(L.myOffer.items,L.myOffer.mesos)}
   else liveTrade[a3]();return}
  const lg=t.closest&&t.closest('[data-lg]');if(lg){const [a,x1,x2]=lg.dataset.lg.split(':');const v=id=>(document.getElementById(id)||{}).value||'';
   if(a==='create')liveGuild.create(v('lg-name'));else if(a==='invite')liveGuild.invite(v('lg-inv'));else if(a==='notice')liveGuild.notice(v('lg-notice'));
   else if(a==='kick'){if(confirm('Remove '+x1+' from the guild?'))liveGuild.kick(x1)}else if(a==='rank'){if(+x2!==1||confirm('Make '+x1+' the guild Master? You become Jr. Master.'))liveGuild.rank(x1,+x2)}
   else if(a==='disband'){if(confirm('Disband the guild? This cannot be undone.'))liveGuild.disband()}else if(a==='leave'){if(confirm('Leave the guild?'))liveGuild.leave()}else liveGuild[a]();return}
  const lm=t.closest&&t.closest('[data-lm]');if(lm){const [a,...r]=lm.dataset.lm.split(':');const arg=r.join(':');const v=id=>(document.getElementById(id)||{}).value||'';
   if(a==='openbox'){tab='play';liveMail.open(L.mail.some(m=>m.kind==='player'&&!m.read)&&!L.mail.some(m=>m.kind==='system'&&!m.read)?'player':'system')}
   else if(a==='close')liveMail.close();else if(a==='f'){L.mview={f:arg};L.merr='';render()}else if(a==='open')liveMail.read(+arg);else if(a==='back'){L.mview.open=null;render()}
   else if(a==='del'){if(confirm('Delete this mail?'))liveMail.del(+arg)}else if(a==='reply')liveMail.compose(arg,'Re: '+((L.mail.find(m=>m.id===L.mview.open)||{}).subject||'').replace(/^(Re: )+/,''));
   else if(a==='new')liveMail.compose('','');else if(a==='mailto'){tab='play';L.mview={f:'player'};liveMail.compose(arg,'')}else if(a==='newsys'){L.mview.compose={to:'all',subject:'',body:''};render()}
   else if(a==='cancel'){L.mview.compose=null;render()}else if(a==='send')liveMail.send(v('lm-to'),v('lm-subj'),v('lm-body'));else if(a==='sendsys')liveMail.system(v('lm-to'),v('lm-subj'),v('lm-body'));return}
  const sp=t.closest&&t.closest('[data-spy]');if(sp){const k=sp.dataset.spy;L.spyOn[k]=!L.spyOn[k];out({t:'spyset',spy:L.spyOn});paint();return}
  const ct=t.closest&&t.closest('[data-ct]');if(ct){L.ctab=ct.dataset.ct;L.err='';paint();return}
  const le=t.closest&&t.closest('[data-le]');if(le){liveEmote(+le.dataset.le);return}
  const lb=t.closest&&t.closest('[data-lb]');if(lb){const [a,...r]=lb.dataset.lb.split(':');const arg=r.join(':');
   if(a==='add')liveBuddy.add((document.getElementById('lb-name')||{}).value);else if(a==='addn')liveBuddy.add(arg);else if(a==='w')liveBuddy.whisper(arg);else if(a==='rm')liveBuddy.remove(arg);
   else if(a==='wx'){L.chatTo='map';L.wTo=null;paint()}else liveBuddy[a]();return}
  const ls=t.closest&&t.closest('[data-ls]');if(ls){const a=ls.dataset.ls.split(':');
   if(a[0]==='buy'){const inp=document.querySelector('[data-sn="'+a[1]+':'+a[2]+'"]');liveShop.buy(a[1],+a[2],a.slice(3).join(':'),inp?+inp.value:1)}
   else if(a[0]==='add')addDraft((document.getElementById('ls-item')||{}).value,+(document.getElementById('ls-n')||{}).value,(document.getElementById('ls-p')||{}).value);
   else if(a[0]==='rm'){L.draft=L.draft.filter(o=>o.k!==a.slice(1).join(':'));paint()}
   else if(a[0]==='open')liveShop.open((document.getElementById('ls-title')||{}).value||'');else if(a[0]==='close')liveShop.close();return}
  const lp=t.closest&&t.closest('[data-lp]');if(lp){const [a2,arg]=lp.dataset.lp.split(':');if(a2==='invite')liveParty.invite(arg);else if(a2==='kick')liveParty.kick(arg);else if(a2==='to'){L.chatTo=L.chatTo==='party'?'map':'party';paint()}else liveParty[a2]();return}
  if(t.id==='live-say'){const i=document.getElementById('live-in');if(i&&liveSay(i.value)){i.value=''}}});
 document.addEventListener('keydown',e=>{const fk=/^F([1-7])$/.exec(e.key);if(fk&&L.state==='on'&&!(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))){e.preventDefault();liveEmote(+fk[1]);return}
 if(e.key==='Enter'&&e.target&&e.target.id==='live-in'){if(liveSay(e.target.value))e.target.value=''}});
})();

/* ===== v1.1: auto-hunt button, no tips, lines message ===== */
rollTips=function(){return ''};
function autoBox(){return '<button id="ab" class="abtn'+(autoSeek?' on':'')+'" data-act="auto" aria-pressed="'+(!!autoSeek)+'"><span class="kn"></span><span>Auto-hunt</span><b>'+(autoSeek?'ON':'OFF')+'</b></button>'}
function toggleAuto(){if(!P)return;if(autoSeek){autoSeek=false;if(!enc&&seeking){seeking=false;clearTimeout(autoT)}return render()}
 autoSeek=true;if(!enc&&!MAPS[P.map].town)return beginSeek(true);render()}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="auto"]');if(b)toggleAuto()});
{const _g=gain;gain=function(x){const a=NRf();const r=_g.apply(this,arguments);const b=NRf();if(b>a)log('You can now fight on '+b+' lines.','good','combat');return r}}
document.getElementById('app').addEventListener('click',e=>{const t=e.target;if(t.closest&&t.closest('.logo')&&(scr==='title'||scr==='register'||scr==='verify'))window.__wsHome()});
