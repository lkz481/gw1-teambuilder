// Prüft für jede Fertigkeit aus den Leisten, welche Zahlen aus dem Text in die Rechnung eingehen.
// Jede Spanne "a...b" wird einzeln verdoppelt. Ändert sich nichts, nutzt die Rechnung die Zahl nicht.
const path=require('path'),fs=require('fs');const SITE=path.join(__dirname,'..');
require(path.join(SITE,'logic.js'));GW.loadSkills(JSON.parse(fs.readFileSync(path.join(SITE,'skills.json'))));
const B=JSON.parse(fs.readFileSync(path.join(SITE,'builds.json'))),R=JSON.parse(fs.readFileSync(path.join(SITE,'ref.json')));
const codes=new Set();JSON.stringify(B).replace(/"(O[A-Za-z0-9+\/]{15,})"/g,(m,c)=>codes.add(c));R.forEach(r=>codes.add(r.c));
const used=new Map();for(const c of codes){let d;try{d=GW.decode(c)}catch(e){continue}for(const i of d.skills){const s=GW.skill(i);if(s)used.set(s.id,(used.get(s.id)||0)+1)}}
const WPN={41:[6,'Sense'],20:[23,'Schwert'],18:[12,'Axt'],19:[16,'Hammer'],25:[35,'Bogen'],37:[17,'Speer'],29:[0,'Dolche']};
const ctx=(s)=>{const attrs=[[s.aid>=0?s.aid:0,12]];const pri=s.p||1;const prim={1:17,2:23,3:16,4:6,5:0,6:12,7:35,8:36,9:40,10:44}[pri];if(prim!=null&&prim!==s.aid)attrs.push([prim,10]);
  const b={pri,sec:0,attrs,skills:[s.id,0,0,0,0,0,0,0]};const w=/attack/i.test(s.t)?(WPN[s.aid]||[23,'Schwert']):null;
  return ()=>{const r=GW.dps(b,new Map(attrs),{targets:3,armor:60,foeDps:40,allies:8,bipPips:6,physRate:1.2,weapon:w,team:{hex:1,mhex:1,cond:1}});const o={dmg:0,heal:0,prot:0,ctrl:0};r.parts.filter(p=>p.sid===s.id).forEach(p=>o[p.cat]+=p.dps);return o;};};
const rows=[];
for(const [sid,cnt] of used){const s=GW.skill(sid);const run=ctx(s);let base;try{base=run()}catch(e){rows.push(['FEHLER',s.n,e.message]);continue}
  const d0=s.d,dd0=s.dd||'';const rx=/(\d+)\.\.\.(\d+)/g;let m;const ranges=[];while((m=rx.exec(d0)))ranges.push([m[0],m.index,+m[1],+m[2]]);
  const tot=base.dmg+base.heal+base.prot+base.ctrl;
  ranges.forEach(([txt,idx,a,b],k)=>{const rep=(a*3+7)+'...'+(b*3+7);s.d=d0.slice(0,idx)+rep+d0.slice(idx+txt.length);s.dd=dd0.split(txt).join(rep);let v;try{v=run()}catch(e){v=base}s.d=d0;s.dd=dd0;
    const ch=['dmg','heal','prot','ctrl'].filter(c=>Math.abs(v[c]-base[c])>0.02*Math.max(0.5,base[c]));
    rows.push([ch.join('+')||'-',cnt,s.n,txt,d0.slice(Math.max(0,idx-45),idx+txt.length+40).replace(/\n/g,' '),tot.toFixed(1)]);});
  if(!ranges.length) rows.push(['(keine Spanne)',cnt,s.n,'',d0.slice(0,110),tot.toFixed(1)]);}
fs.writeFileSync('/tmp/audit.json',JSON.stringify(rows));
const un=rows.filter(r=>r[0]==='-');console.log('Fertigkeiten',used.size,'Spannen',rows.length,'ohne Wirkung',un.length);
