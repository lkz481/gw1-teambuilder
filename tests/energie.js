// Energie-Prüfung: Jede Fertigkeit, deren Text Energiegewinn nennt, kommt in eine Leiste mit Dauerverbraucher (Flare, 2,86 Energie/s).
// Steigt der bezahlbare Anteil nicht, erkennt die Rechnung den Gewinn nicht.
const path=require('path'),fs=require('fs');const SITE=path.join(__dirname,'..');
require(path.join(SITE,'logic.js'));GW.loadSkills(JSON.parse(fs.readFileSync(path.join(SITE,'skills.json'))));
const B=JSON.parse(fs.readFileSync(path.join(SITE,'builds.json'))),R=JSON.parse(fs.readFileSync(path.join(SITE,'ref.json')));
const codes=new Set();JSON.stringify(B).replace(/"(O[A-Za-z0-9+\/]{15,})"/g,(m,c)=>codes.add(c));R.forEach(r=>codes.add(r.c));
const used=new Map();for(const c of codes){let d;try{d=GW.decode(c)}catch(e){continue}for(const i of d.skills){const s=GW.skill(i);if(s)used.set(s.id,(used.get(s.id)||0)+1)}}
const flare=GW.allSkills().find(x=>x.n==='Flare').id;const WPN={41:[6,'Sense'],20:[23,'Schwert'],18:[12,'Axt'],19:[16,'Hammer'],25:[35,'Bogen'],37:[17,'Speer'],29:[0,'Dolche']};
const prim={1:17,2:23,3:16,4:6,5:0,6:12,7:35,8:36,9:40,10:44};const rows=[];
for(const [sid,cnt] of used){const s=GW.skill(sid);if(!/energy/i.test(s.d)||!/gain|regeneration|cost|less energy|steal/i.test(s.d))continue;
  const pri=s.p||6,attrs=[[10,12]];if(s.aid>=0&&s.aid!==10)attrs.push([s.aid,12]);if(prim[pri]!=null&&!attrs.some(a=>a[0]===prim[pri]))attrs.push([prim[pri],10]);
  const w=/attack/i.test(s.t)?(WPN[s.aid]||[23,'Schwert']):null,o={targets:3,armor:60,foeDps:40,allies:8,bipPips:0,physRate:1.2,weapon:w,team:{hex:1,mhex:1,cond:1}};
  const f=sk=>GW.dps({pri,sec:0,attrs,skills:sk.concat(Array(8).fill(0)).slice(0,8)},new Map(attrs),o).energyF;
  const a=f([flare]),b=f([flare,sid]);rows.push([b>a+0.01?'ok':'KEIN GEWINN',cnt,s.n,a.toFixed(2)+' -> '+b.toFixed(2),s.d.slice(0,150)]);}
rows.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:y[1]-x[1]);
console.log('geprüft',rows.length,'ohne erkannten Gewinn',rows.filter(r=>r[0]!=='ok').length);rows.filter(r=>r[0]!=='ok').forEach(r=>console.log(r.slice(1).join(' | ')));
