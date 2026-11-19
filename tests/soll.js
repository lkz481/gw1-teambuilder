// Prüfsammlung: Sollwerte, von Hand nach Wiki-Zahlen gerechnet. Aufruf: node tests/soll.js [Pfad zur Seite]
// Jeder Fall prüft eine Mechanik an einer Fertigkeit. Weicht die Rechnung mehr als die Toleranz ab, schlägt der Fall fehl.
const path = require('path'), fs = require('fs');
const SITE = process.argv[2] || path.join(__dirname, '..');
require(path.join(SITE, 'logic.js'));
GW.loadSkills(JSON.parse(fs.readFileSync(path.join(SITE, 'skills.json'))));
const id = n => { const s = GW.allSkills().find(x => x.n === n); if (!s) throw new Error('Fertigkeit fehlt: ' + n); return s.id; };
const bar = (pri, sec, attrs, names) => ({ pri, sec, attrs: Object.entries(attrs).map(([a, v]) => [+a, v]), skills: names.map(id).concat(Array(8).fill(0)).slice(0, 8) });
const run = (b, opts, eff) => GW.dps(b, eff || new Map(b.attrs), Object.assign({ targets: 1, armor: 60, foeDps: 40, allies: 8, bipPips: 6 }, opts || {}));
const part = (r, name, cat) => r.parts.filter(p => p.sid === id(name) && p.cat === (cat || 'dmg')).reduce((a, p) => a + p.dps, 0);
const lin = (a, b, r) => Math.round(a + (b - a) * Math.min(r, 20) / 15); // Wiki: linear von Rang 0 bis 15, darüber weiter, Ende bei Rang 20
let ok = 0, bad = 0; const fails = [];
const T = (title, got, want, tol) => { const t = tol == null ? 0.03 : tol, good = Math.abs(got - want) <= Math.max(0.05, Math.abs(want) * t); if (good) ok++; else { bad++; fails.push(title + ': Soll ' + want.toFixed(2) + ', Ist ' + got.toFixed(2)); } };
const W = 1, MO = 3, N = 4, ME = 5, E = 6, RT = 8, P = 9, D = 10;
const AFT = 0.75; // Nachwirkzeit von Zaubern (Wiki "Aftercast")

// 1-3 Rüstung: Schaden halbiert sich je 40 Rüstung (Wiki "Armor rating"). Flare 20...65 Feuer, 1 s Wirkzeit, keine Aufladezeit.
{ const b = bar(E, 0, { 10: 12, 12: 12 }, ['Flare']), f12 = lin(20, 65, 12); // 56
  T('Flare, Rüstung 60', part(run(b), 'Flare'), f12 / (1 + AFT));
  T('Flare, Rüstung 80', part(run(b, { armor: 80 }), 'Flare'), f12 * Math.pow(2, -0.5) / (1 + AFT));
  T('Flare, Rüstung 100', part(run(b, { armor: 100 }), 'Flare'), f12 * 0.5 / (1 + AFT)); }
// 4-6 Attributskalierung und Rangende 20
{ const mk = r => bar(E, 0, { 10: r, 12: 12 }, ['Flare']);
  T('Flare, Feuermagie 16', part(run(mk(16)), 'Flare'), lin(20, 65, 16) / (1 + AFT)); // 68
  T('Flare, Feuermagie 20', part(run(mk(20)), 'Flare'), 80 / (1 + AFT));
  T('Flare, Rang 25 zählt wie 20', part(run(mk(25)), 'Flare'), 80 / (1 + AFT)); }
// 7 Luftmagie: 25 % Rüstungsdurchdringung (Wiki "Armor penetration"). Lightning Orb 10...100, 2 s Wirkzeit, 5 s Aufladen.
{ const b = bar(E, 0, { 8: 12, 12: 12 }, ['Lightning Orb']);
  T('Lightning Orb, Rüstung 80 mit 25 % Durchdringung', part(run(b, { armor: 80 }), 'Lightning Orb'), lin(10, 100, 12) * Math.pow(2, (60 - 60) / 40) / (5 + 2 + AFT)); }
// 8 Blitzschaden ohne Luftmagie hat keine Durchdringung. Ancestors' Rage 5...110, Fertigkeit (keine Nachwirkzeit), 1/4 s, 10 s.
{ const b = bar(RT, 0, { 34: 12 }, ["Ancestors' Rage"]);
  T("Ancestors' Rage, Rüstung 80 ohne Durchdringung", part(run(b, { armor: 80 }), "Ancestors' Rage"), lin(5, 110, 12) * Math.pow(2, -0.5) / 10.25); }
// 9 Rüstungsignorierend: Spiritual Pain 15...75, bei Rüstung 100 gleich wie bei 60
{ const b = bar(ME, 0, { 2: 12, 0: 0 }, ['Spiritual Pain']);
  T('Spiritual Pain ignoriert Rüstung', part(run(b, { armor: 100 }), 'Spiritual Pain'), part(run(b, { armor: 60 }), 'Spiritual Pain'));
  T('Spiritual Pain, Wert', part(run(b), 'Spiritual Pain'), lin(15, 75, 12) / (7 + 1 + AFT)); }
// 10 Schnellwirkung: Wirkzeit halbiert sich bis Rang 15, Mesmer-Zauber laden 3 % je Rang schneller (Wiki "Fast Casting")
{ const b = bar(ME, 0, { 2: 12, 0: 10 }, ['Spiritual Pain']);
  T('Spiritual Pain mit Schnellwirkung 10', part(run(b), 'Spiritual Pain'), lin(15, 75, 12) / (7 * 0.7 + Math.pow(0.5, 10 / 15) + AFT)); }
// 11 Energie je verlorenem Punkt: Energy Burn 1...10 Verlust, 9 Schaden je Punkt
{ const b = bar(ME, 0, { 2: 12 }, ['Energy Burn']);
  T('Energy Burn', part(run(b), 'Energy Burn'), lin(1, 10, 12) * 9 / (20 + 2 + AFT)); }
// 12 Energiegrenze: Flare kostet 5 Energie alle 1,75 s = 2,86/s. Ein Elementarmagier hat 4 Pips = 1,33/s. Ohne Hilfe sind 46,7 % bezahlbar.
{ const b = bar(E, 0, { 10: 12 }, ['Flare']);
  T('Flare ohne Energiehilfe', part(run(b, { bipPips: 0 }), 'Flare'), 56 / 1.75 * (4 / 3) / (5 / 1.75)); }
// 13 Diener: Bone Fiend Stufe 1...17, bei Todesmagie 12 Stufe 14, 12-35 Schaden (Wiki-Messreihe), ein Angriff alle 1,86 s
{ const r = run(bar(N, 0, { 5: 12, 6: 8 }, ['Animate Bone Fiend'])), p = r.parts.find(x => x.sid === id('Animate Bone Fiend'));
  T('Bone Fiend, Stufe 14', +(p.detail.match(/Stufe (\d+)/) || [0, 0])[1], 14, 0);
  T('Bone Fiend, Schaden je Diener', +(p.detail.match(/je ([\d.]+)\/s/) || [0, 0])[1], 23.5 / 1.86); }
// 14 Dienerzahl: höchstens 2 plus halber Rang Todesmagie (Wiki "Minion")
{ const r = run(bar(N, 0, { 5: 12, 6: 8 }, ['Animate Bone Fiend']), { targets: 3 }); const m = (r.notes.join(' ').match(/von höchstens (\d+)/) || [0, 0])[1];
  T('Diener höchstens 8 bei Todesmagie 12', +m, 8, 0); }
// 15 Geister: Signet of Spirits, 3 Geister mit 5...20 je Angriff alle 2 s, 70 % im Einsatz (Annahme)
{ const b = bar(RT, 0, { 34: 12 }, ['Signet of Spirits']);
  T('Signet of Spirits', part(run(b), 'Signet of Spirits'), 3 * lin(5, 20, 12) / 2 * 0.7); }
// 16 Verhexung mit Degeneration: Conjure Phantasm −5 Pips = 10 Lebenspunkte/s, hält 4...18 s bei 5 s Aufladen: durchgehend
{ const b = bar(ME, 0, { 1: 12 }, ['Conjure Phantasm']);
  T('Conjure Phantasm', part(run(b), 'Conjure Phantasm'), 10); }
// 17 Flächenschaden über Zeit: Fire Storm 5...35 je Sekunde, 10 s. Gegner laufen nach 3 Pulsen raus (guildwiki.de "Künstliche Intelligenz")
{ const b = bar(E, 0, { 10: 12, 12: 12 }, ['Fire Storm']);
  T('Fire Storm, drei Pulse', part(run(b), 'Fire Storm'), lin(5, 35, 12) * 3 / (20 + 2 + AFT)); }
// 18 Heilung: Orison of Healing 30...80, 1 s, 2 s Aufladen. Mönch mit Gunst der Götter 12: +3,2 je Rang (Wiki "Divine Favor")
{ const b = bar(MO, 0, { 13: 12, 16: 12 }, ['Orison of Healing']);
  T('Orison of Healing mit Gunst der Götter', part(run(b), 'Orison of Healing', 'heal'), (lin(30, 80, 12) + Math.round(3.2 * 12)) / (2 + 1 + AFT)); }
// 19 Healer's Boon: 50 % mehr Heilung, 50 % schnellere Wirkzeit bei Heilgebeten
{ const b = bar(MO, 0, { 13: 12, 16: 0 }, ['Orison of Healing', "Healer's Boon"]), b0 = bar(MO, 0, { 13: 12, 16: 0 }, ['Orison of Healing']);
  T("Orison of Healing mit Healer's Boon", part(run(b), 'Orison of Healing', 'heal'), lin(30, 80, 12) * 1.5 / (2 + 0.5 + AFT));
  T("Orison of Healing ohne Healer's Boon", part(run(b0), 'Orison of Healing', 'heal'), lin(30, 80, 12) / (2 + 1 + AFT)); }
// 20 Gruppenheilung zählt für die halbe Gruppe (Annahme): Heal Party 30...75, 2 s, 2 s Aufladen, 8 Leute
{ const b = bar(MO, 0, { 13: 12 }, ['Heal Party']);
  T('Heal Party, halbe Gruppe', part(run(b, { targets: 3 }), 'Heal Party', 'heal'), lin(30, 75, 12) * 4 / (2 + 2 + AFT)); }
// 21 Aufrechterhaltene Verzauberung: Strength of Honor +5...25 je Nahkampftreffer, rüstungsignorierend (Wiki), läuft durchgehend. 1,2 Treffer/s vom Nahkämpfer.
{ const b = bar(MO, 0, { 14: 12 }, ['Strength of Honor']), r = run(b, { physRate: 1.2, armor: 100 });
  T('Strength of Honor', part(r, 'Strength of Honor'), lin(5, 25, 12) * 1.2, 0.05);
  T('Strength of Honor kostet 1 Pip', /1 aufrechterhaltene Verzauberung/.test(r.notes.join(' ')) ? 1 : 0, 1, 0); }
// 22 Splitterwaffe trifft nur die Nachbarn des Ziels (Wiki): bei 3 Gegnern zwei. 5...50 je Angriff, endet nach 1...5 Angriffen.
{ const b = bar(RT, 0, { 34: 12 }, ['Splinter Weapon']), r = run(b, { physRate: 1.2, targets: 3 }), k = lin(1, 5, 12);
  T('Splinter Weapon, 3 Gegner', part(r, 'Splinter Weapon'), lin(5, 50, 12) * k * 2 / Math.max(5 + 1 + AFT, k / 1.2), 0.05);
  T('Splinter Weapon, 1 Gegner hat keinen Nachbarn', part(run(b, { physRate: 1.2, targets: 1 }), 'Splinter Weapon'), 0); }
// 23 Niederschlag dauert 2 s (Wiki "Knock down"): Shock alle 10,75 s
{ const b = bar(E, 0, { 8: 12 }, ['Shock']);
  T('Shock, Niederschlag', part(run(b), 'Shock', 'ctrl'), 2 / (10 + 0.75), 0.05); }
// 24 Unterbrechung wartet auf Gelegenheit: Power Spike 30...120, T = 12 + 1/4 + 3/4. Drei Gegner zaubern zusammen 0,45-mal je Sekunde.
{ const b = bar(ME, 0, { 2: 12 }, ['Power Spike']), Tt = 12 + 0.25 + AFT;
  T('Power Spike, 3 Gegner', part(run(b, { targets: 3 }), 'Power Spike'), lin(30, 120, 12) / (Tt + 1 / 0.45));
  T('Power Spike, 1 Gegner', part(run(b, { targets: 1 }), 'Power Spike'), lin(30, 120, 12) / (Tt + 1 / 0.15)); }
// 25 Auslöser am Gegner: Empathy 10...55 je Angriff, 0,55 Angriffe/s, hält 5...15 s bei 10 s Aufladen + 2 s Wirkzeit + 0,75. Bei drei Gegnern lebt das Ziel lang genug.
{ const b = bar(ME, 0, { 2: 12 }, ['Empathy']), dur = lin(5, 15, 12);
  T('Empathy', part(run(b, { targets: 3 }), 'Empathy'), lin(10, 55, 12) * 0.55 * Math.min(1, dur / 12.75), 0.05); }
// 26 Life: heilt am Ende 1...7 je Sekunde Lebenszeit (20 s), 70 % gerechnet, halbe Gruppe
{ const b = bar(RT, 0, { 33: 12 }, ['Life']);
  T('Life', part(run(b), 'Life', 'heal'), lin(1, 7, 12) * 20 * 0.7 * 4 / (20 + 0.75), 0.05); }
// 27 Schutzgeist hält nur, solange seine Lebenspunkte reichen: Shelter Stufe 1...12 (bei 12: 10), 200 Lebenspunkte, verliert 75...45 (bei 12: 51) je Treffer
{ const b = bar(RT, 0, { 32: 12 }, ['Shelter']), r = run(b, { targets: 3 }), p = r.parts.find(x => x.sid === id('Shelter') && x.cat === 'prot');
  T('Shelter hält 4 Treffer', +(p.detail.match(/rund (\d+) Treffer/) || [0, 0])[1], Math.round(200 / 51), 0);
  T('Shelter, verhinderter Schaden', p.dps, (200 / 51) * (95 - 48) * 0.8 / (45 + 1), 0.05); }
// 28 Seelenverflechtung: Shelter lädt nach 15 s wieder auf und kostet 15 weniger
{ const b = bar(RT, 0, { 32: 12, 36: 12 }, ['Shelter', 'Soul Twisting']), r = run(b, { targets: 3 }), H = 200 * 1.48;
  T('Shelter mit Seelenverflechtung', part(r, 'Shelter', 'prot'), (H / 51) * (95 - 48) * 0.8 / (15 + 1), 0.05); }
// 29 Derwisch: Pious Assault lädt mit Pious Renewal 75 % schneller und trifft die Nachbarn mit 15...40
{ const b = bar(D, 0, { 41: 12, 44: 12 }, ['Pious Assault', 'Pious Renewal']), r = run(b, { targets: 3, weapon: [6, 'Sense'] }), p = r.parts.find(x => x.sid === id('Pious Assault'));
  T('Pious Assault alle 3 s', +(p.detail.match(/alle ([\d.]+) s/) || [0, 0])[1], 3, 0.05); }
// 30 Heroischer Refrain auf sich selbst: Führung 12 + Rune 3 + Kopfteil 1 = 16, erster Refrain +3 = 19, dann +4 = 20 (Wiki)
{ const b = bar(P, 0, { 40: 12, 37: 9 }, ['Heroic Refrain']), e = GW.effRanks(b, [{ attr: 40, item: 'Überlegene Rune (+3)' }, { attr: 40, item: 'Kopfteil +1' }]);
  T('Heroischer Refrain: Führung 20', e.get(40), 20, 0); T('Heroischer Refrain: Speer 9 + 4', e.get(37), 13, 0);
  const e2 = GW.effRanks(bar(P, 0, { 40: 12, 37: 9 }, ['Heroic Refrain']), []); T('Heroischer Refrain ohne Runen: +3', e2.get(37), 12, 0); }
// 31 Stab oder Zauberstab: 11-22 Schaden alle 1,75 s (Wiki), wenn nichts anderes gewirkt wird
{ const r = run(bar(E, 0, { 10: 12 }, []), {}); const p = r.parts.find(x => /Stab oder Zauberstab/.test(x.name));
  T('Stab ohne Zauber', p ? p.dps : 0, 16.5 / 1.75, 0.05); }
// 32 Degeneration höchstens 10 Pips je Ziel
{ const b = bar(ME, 0, { 1: 16 }, ['Conjure Phantasm', 'Conjure Nightmare', 'Phantom Pain']); const r = run(b); const deg = r.parts.filter(p => /Degeneration|Zustand/.test(p.kind || '')).reduce((a, p) => a + p.dps, 0);
  T('Degeneration gedeckelt bei 20/s', deg, 20, 0.02); }

console.log(ok + ' von ' + (ok + bad) + ' Fällen bestanden'); fails.forEach(f => console.log('  FEHLER  ' + f)); process.exit(bad ? 1 : 0);
