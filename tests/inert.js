// Welche Fertigkeiten ändern in ihrer eigenen Leiste gar nichts? Jede Fertigkeit wird einzeln aus der Leiste genommen.
const path=require('path'),fs=require('fs');const SITE=path.join(__dirname,'..');
require(path.join(SITE,'logic.js'));GW.loadSkills(JSON.parse(fs.readFileSync(path.join(SITE,'skills.json'))));
const B=JSON.parse(fs.readFileSync(path.join(SITE,'builds.json'))),R=JSON.parse(fs.readFileSync(path.join(SITE,'ref.json')));
const codes=new Set();JSON.stringify(B).replace(/"(O[A-Za-z0-9+\/]{15,})"/g,(m,c)=>codes.add(c));R.forEach(r=>codes.add(r.c));
const O={targets:3,armor:60,foeDps:40,allies:8,bipPips:0,physRate:1.2,team:{hex:1,mhex:1,cond:1}};
const sig=r=>[r.total,r.heal,r.prot,r.ctrl,r.energyF].map(x=>x.toFixed(2)).join('|');
const inert={};
for(const c of codes){let d;try{d=GW.decode(c)}catch(e){continue}const eff=GW.effRanks(d,[]);const base=sig(GW.dps(d,eff,O));
  d.skills.forEach((id,k)=>{const s=GW.skill(id);if(!s)return;const d2=Object.assign({},d,{skills:d.skills.map((x,j)=>j===k?0:x)});const v=sig(GW.dps(d2,GW.effRanks(d2,[]),O));
    const e=inert[s.n]=inert[s.n]||{n:0,inert:0,t:s.t,d:s.d};e.n++;if(v===base)e.inert++;});}
const rows=Object.entries(inert).filter(([k,v])=>v.inert>0).sort((a,b)=>b[1].inert-a[1].inert);
console.log('wirkungslos in mindestens einer Leiste:',rows.length);
rows.forEach(([k,v])=>console.log(v.inert+'/'+v.n,'|',k,'['+v.t+']',v.d.slice(0,150)));
