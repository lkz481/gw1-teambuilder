// Sucht eigene Heldenleisten: tauscht in den Leisten aus dem Vorrat einzelne Fertigkeiten und behält, was nach unserer Rechnung mehr Schaden bringt.
const fs=require('fs'),path=require('path'),SITE=path.join(__dirname,'..');
require(path.join(SITE,'logic.js'));const sd=JSON.parse(fs.readFileSync(path.join(SITE,'skills.json')));GW.loadSkills(sd);
const EQ=JSON.parse(fs.readFileSync(path.join(SITE,'equip.json'))),REF=JSON.parse(fs.readFileSync(path.join(SITE,'ref.json'))),TEAMS=JSON.parse(fs.readFileSync(path.join(SITE,'teams.json')));
const pool=new Map();const add=(c,src)=>{try{const d=GW.decode(c);const sk=d.skills.map(id=>GW.skill(id));if(!d.pri||sk.some(s=>!s||s.pve)||sk.filter(s=>s.e).length!==1)return;const k=d.pri+'|'+d.skills.join(',');if(!pool.has(k))pool.set(k,{code:c,src,bar:d});}catch(e){}};
REF.forEach(o=>{if(!/Farm|AFK/i.test(o.p))add(o.c,o.p);});
(Array.isArray(TEAMS)?TEAMS:Object.values(TEAMS)).forEach(T=>(T.variants?T.variants.flatMap(v=>v.slots):(T.slots||[])).forEach(s=>{if(s.code)add(s.code,'Team '+T.name);}));
Object.keys(GW.BARS).forEach(k=>add(GW.BARS[k].code,'Standardteam'));
// Zwei Umgebungen: Team mit Nahkämpfer (Sense, zwei Gegner je Schwung) und Team ohne Angreifer. Verstärkungen für Angreifer zählen nur in der ersten.
const CTXS={nah:{physRate:0.7,hitMul:2,meleeAlly:true},fern:{physRate:0,meleeAlly:false}};let OPT=null;const setCtx=k=>{OPT=Object.assign({targets:3,foeRate:0.5,armor:60,foeDps:40,allies:8,hero:true,bipPips:0,team:{hex:true,mhex:true,cond:true},death:0.33},CTXS[k]);};
const ev=bar=>{let r=[];try{r=GW.equipFor(bar,EQ,null).runes;}catch(e){}return GW.dps(bar,GW.effRanks(bar,r),OPT);};
const aiBad=s=>GW.heroai[s.n]&&GW.heroai[s.n][0]>=2;
const ALL=GW.allSkills().filter(s=>!s.pve&&!s.pvp&&!/\(PvP\)|Kurzick|Luxon/.test(s.n)&&!s.e&&!aiBad(s)&&!/Attack|Trap|Preparation|Pet|Touch/i.test(s.t)&&!/resurrect/i.test(s.d||'')&&!/pet|while wielding|bow|melee|destroys a spirit/i.test(s.d||'')&&!['Retribution','Shatter Delusions',"Verata's Gaze",'Holy Wrath'].includes(s.n));
const out=[];let cnt=0;
for(const ctx of Object.keys(CTXS)){setCtx(ctx);
for(const o of pool.values()){const bar=o.bar;if(![3,4,5,6,8,9].includes(bar.pri))continue;const base=ev(bar);if(base.total<35)continue;
  const ranks=new Map(bar.attrs);const cand=ALL.filter(s=>(s.p===bar.pri||s.p===bar.sec)&&(s.aid==null||s.aid<0||(ranks.get(s.aid)||0)>=9));
  let cur={bar,D:base};const fixed=i=>{const s=GW.skill(cur.bar.skills[i]);return !s||s.e||/resurrect/i.test(s.d||'')||/^"Fall Back!"/.test(s.n);};const log=[];
  for(let it=0;it<6;it++){let best=null;
    for(let i=0;i<8;i++){if(fixed(i))continue;for(const c of cand){if(cur.bar.skills.includes(c.id))continue;const b2=Object.assign({},cur.bar,{skills:cur.bar.skills.slice()});b2.skills[i]=c.id;let D;try{D=ev(b2);}catch(e){continue;}cnt++;
      if((D.ctrl||0)<0.9*(base.ctrl||0)-0.02||D.heal+D.prot<0.9*(base.heal+base.prot)-2)continue;const own=D.parts.filter(p=>p.sid===c.id&&p.cat==='dmg').reduce((x,p)=>x+p.dps,0);if(own<0.5*(D.total-cur.D.total))continue; /* der Gewinn muss überwiegend aus dem Schaden der neuen Fertigkeit selbst kommen, nicht aus Energie-Tricks */ if(!best||D.total>best.D.total)best={bar:b2,D,i,c};}}
    if(!best||best.D.total<cur.D.total+5)break; /* unter 5 Schaden/s lohnt kein Tausch: Dafür ginge oft Nutzen verloren, den die Rechnung nicht sieht */log.push(GW.skill(cur.bar.skills[best.i]).n+' -> '+best.c.n+' ('+Math.round(cur.D.total)+' -> '+Math.round(best.D.total)+')');cur=best;}
  if(log.length)out.push({ctx,src:o.src,pri:bar.pri,elite:bar.skills.map(id=>GW.skill(id)).find(s=>s.e).n,from:o.code,to:GW.encode(cur.bar.pri,cur.bar.sec,cur.bar.attrs,cur.bar.skills),base:Math.round(base.total),now:Math.round(cur.D.total),ctrl:[+(base.ctrl||0).toFixed(2),+(cur.D.ctrl||0).toFixed(2)],log,skills:cur.bar.skills.map(id=>GW.skill(id).n)});
}}
out.sort((a,b)=>b.now-a.now);fs.writeFileSync(path.join(__dirname,'mutate.json'),JSON.stringify(out,null,1));console.log('Leisten',pool.size,'Rechnungen',cnt,'verbessert',out.length);
