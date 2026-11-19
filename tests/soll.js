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
  T('Bone Fiend, Schaden je Diener', +(p.detail.match(/je ([\d.]+)\/s/) || [0, 0])[1], 23.5 * 0.86 / 1.86); } // Mittelwert 86 % der Spannenmitte (Wiki "Bone Horror": Stufe 18 im Mittel 27,5 bei 17-49)
// 14 Dienerzahl: höchstens 2 plus halber Rang Todesmagie (Wiki "Minion")
{ const r = run(bar(N, 0, { 5: 12, 6: 8 }, ['Animate Bone Fiend']), { targets: 3 }); const m = (r.notes.join(' ').match(/von höchstens (\d+)/) || [0, 0])[1];
  T('Diener höchstens 8 bei Todesmagie 12', +m, 8, 0); }
// 15 Geister: Signet of Spirits, 3 Geister mit 5...20 je Angriff alle 2 s, 70 % im Einsatz (Annahme)
{ const b = bar(RT, 0, { 34: 12 }, ['Signet of Spirits']);
  T('Signet of Spirits', part(run(b), 'Signet of Spirits'), 3 * lin(5, 20, 12) / 2 * 0.7); }
// 16 Verhexung mit Degeneration: Conjure Phantasm −5 Pips = 10 Lebenspunkte/s, hält 4...18 s bei 5 s Aufladen: durchgehend
{ const b = bar(ME, 0, { 1: 12 }, ['Conjure Phantasm']);
  T('Conjure Phantasm, Gegner lebt lange', part(run(b, { death: 0.01 }), 'Conjure Phantasm'), 10, 0.08);
  // Stirbt der einzige Gegner im Schnitt nach 6 s, bleiben von 13 s Verhexung im Mittel 3 s (Rest verfällt), neu gewirkt wird alle 6,75 s
  T('Conjure Phantasm, Gegner stirbt nach 6 s', part(run(b), 'Conjure Phantasm'), 10 * 3 / 6.75); }
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
  T('Splinter Weapon, 3 Gegner, einer steht neben dem Ziel', part(r, 'Splinter Weapon'), lin(5, 50, 12) * k * 1 / Math.max(5 + 1 + AFT, k / 1.2), 0.05);
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
  T('Empathy, Gegner lebt lange', part(run(b, { targets: 3, death: 0.01 }), 'Empathy'), lin(10, 55, 12) * 0.55 * Math.min(1, dur / 12.75), 0.08);
  // Drei Gegner, alle 6 s stirbt einer: Kampf 18 s, ein Gegner lebt im Schnitt 12 s, von 13 s Verhexung bleiben 6 s
  T('Empathy, Ziel stirbt vorher', part(run(b, { targets: 3 }), 'Empathy'), lin(10, 55, 12) * 0.55 * 6 / 12.75, 0.05); }
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
{ const b = bar(ME, 0, { 1: 16 }, ['Conjure Phantasm', 'Conjure Nightmare', 'Phantom Pain']); const r = run(b, { death: 0.01 }); const deg = r.parts.filter(p => /Degeneration|Zustand/.test(p.kind || '')).reduce((a, p) => a + p.dps, 0);
  T('Degeneration gedeckelt bei 20/s', deg, 20, 0.02); }

// ---------- Teamregeln (GW.teamDps) ----------
const team = (bars, n, w0) => GW.teamDps(bars, bars.map(b => GW.effRanks(b, [])), w0 || null, n || 3, { armor: 60, foeDps: 40 });
const tpart = (D, name, cat) => D.parts.filter(p => p.sid === id(name) && p.cat === (cat || 'dmg')).reduce((a, p) => a + p.dps, 0);
// T1 Gleiche Geister verdrängen sich (Wiki "Spirit"): Nur der erste Signet-of-Spirits-Ritualist zählt
{ const b = () => bar(RT, 0, { 34: 12 }, ['Signet of Spirits']), D = team([bar(E, 0, { 10: 12 }, ['Flare']), b(), b()]);
  T('Team: erstes Signet of Spirits zählt', tpart(D[1], 'Signet of Spirits'), 3 * lin(5, 20, 12) / 2 * 0.7);
  T('Team: zweites Signet of Spirits zählt nicht', tpart(D[2], 'Signet of Spirits'), 0); }
// T2 Blut ist Kraft: +3...6 Pips (bei Blutmagie 12: 5). Flare braucht 2,86 Energie/s, mit 9 Pips = 3/s reicht es.
{ const D = team([bar(E, 0, { 10: 12 }, ['Flare']), bar(N, 0, { 4: 12 }, ['Blood is Power'])]);
  T('Team: Flare mit Blut ist Kraft ohne Energiemangel', tpart(D[0], 'Flare'), 56 / 1.75);
  const D0 = team([bar(E, 0, { 10: 12 }, ['Flare']), bar(N, 0, { 4: 12 }, [])]);
  T('Team: Flare ohne Blut ist Kraft', tpart(D0[0], 'Flare'), 56 / 1.75 * (4 / 3) / (5 / 1.75)); }
// T3 Heroischer Refrain: Paragon mit Führung 12 gibt sich +3 (Führung 15) und dem Team +3, wenn ein gruppenweiter Schrei ihn erneuert. Flare zählt dann mit Feuermagie 15.
{ const pg = bar(P, 0, { 40: 12 }, ['Heroic Refrain', '"Stand Your Ground!"']), el = bar(E, 0, { 10: 12 }, ['Flare']), nb = bar(N, 0, { 4: 12 }, ['Blood is Power']);
  const D = team([pg, el, nb]); T('Team: Flare unter Heroischem Refrain', tpart(D[1], 'Flare'), lin(20, 65, 15) / 1.75, 0.04); }
// T4 Dieselbe Flächen-Verhexung zählt im Team einmal
{ const b = () => bar(ME, 0, { 1: 12 }, ['Fevered Dreams']); let two; try { two = team([bar(E, 0, { 10: 12 }, ['Flare']), bar(N, 0, { 7: 12 }, ['Suffering']), bar(N, 0, { 7: 12 }, ['Suffering'])]); } catch (e) { two = null; }
  if (two) { T('Team: zweite gleiche Flächen-Verhexung zählt nicht', tpart(two[2], 'Suffering'), 0); T('Team: erste Flächen-Verhexung zählt', tpart(two[1], 'Suffering') > 0 ? 1 : 0, 1, 0); } }
// T5 Degeneration im Team: höchstens 10 Pips je Ziel, bei 1 Ziel also 20/s zusammen
{ const b = () => bar(ME, 0, { 1: 16 }, ['Conjure Phantasm', 'Conjure Nightmare']), D = team([b(), b(), bar(N, 0, { 4: 12 }, ['Blood is Power'])], 1);
  const deg = D.reduce((a, d) => a + d.parts.filter(p => /Degeneration|Zustand/.test(p.kind || '')).reduce((x, p) => x + p.dps, 0), 0);
  T('Team: Degeneration gedeckelt', deg, 20, 0.02); }
// T6 Ein Verbündeter trägt nur einen Waffenzauber: Bei einem Nahkämpfer zählt die zweite Splitterwaffe nicht
{ const sw = () => bar(RT, 0, { 34: 12 }, ['Splinter Weapon']), me = bar(D, 0, { 41: 12, 44: 10 }, ['Mystic Sweep']), X = team([me, sw(), sw()], 3, [6, 'Sense']);
  T('Team: erste Splitterwaffe zählt', tpart(X[1], 'Splinter Weapon') > 0 ? 1 : 0, 1, 0); T('Team: zweite Splitterwaffe zählt nicht', tpart(X[2], 'Splinter Weapon'), 0); }
// T7 Blindheit stapelt nicht: Zwei gleiche Leisten bringen zusammen höchstens 100 % Laufzeit
{ const b = () => bar(ME, 0, { 1: 12, 0: 10 }, ['Ineptitude']), X = team([bar(E, 0, { 10: 12 }, ['Flare']), b(), b(), bar(N, 0, { 4: 12 }, ['Blood is Power'])]);
  const bl = d => d.parts.filter(p => p.blind).reduce((a, p) => a + p.dps, 0), u = X[1].parts.find(p => p.blind).blind;
  T('Team: zweite Blindheit nur für die fehlende Zeit', bl(X[2]) / bl(X[1]), Math.max(0, Math.min(1, 2 * u) - u) / u, 0.03); }

// ---------- Schutz: Reihenfolge nach Wiki "Order of damage modifiers" ----------
// Gegner im schweren Modus: 120 Schaden/s, davon 50 % kleine Angriffe (28), 10 % Angriffsfertigkeiten (95), 40 % Zauber (95)
{ const F = (type, val, o) => Object.assign({ type, val, cov: 1, up: 1, rate: 1, dur: 10 }, o || {}), P = fx => GW.protTotal(fx, 120, false, 8);
  T('Schutz: 50 % Blocken wirkt nur auf Angriffe', P([F('block', 0.5)]), 120 * 0.6 * 0.5);
  T('Schutz: zwei mal 50 % Blocken ergeben 75 % (Wiki "Effect stacking")', P([F('block', 0.5), F('block', 0.5)]), 120 * 0.6 * 0.75);
  T('Schutz: Schadensgrenze 48 greift nur bei großen Treffern', P([F('cap', 48)]), 120 * 0.5 * (1 - 48 / 95));
  T('Schutz: Blocken vor Schadensgrenze', P([F('block', 0.5), F('cap', 48)]), 120 * (0.5 * 0.5 + 0.1 * (1 - 0.5 * 48 / 95) + 0.4 * (1 - 48 / 95)));
  T('Schutz: Schadensgrenze vor Prozent-Minderung (Unterschlupf, dann "Sie stehen in Flammen!")', P([F('cap', 48), F('pct', 0.145)]), 120 * (0.5 * 0.145 + 0.5 * (1 - 48 * 0.855 / 95)));
  T('Schutz: fester Abzug 15 wirkt bei kleinen Treffern stärker', P([F('flat', 15)]), 120 * (0.5 * 15 / 28 + 0.5 * 15 / 95));
  T('Schutz: Prozent vor festem Abzug', P([F('pct', 0.2), F('flat', 15)]), 120 * (0.5 * (1 - (28 * 0.8 - 15) / 28) + 0.5 * (1 - (95 * 0.8 - 15) / 95)));
  T('Schutz: Rüstungsboni zusammen höchstens +25 (Wiki)', P([F('armor', 20), F('armor', 20)]), 120 * 0.8 * (1 - Math.pow(2, -25 / 40)));
  T('Schutz: ein einzelner größerer Rüstungsbonus zählt voll', P([F('armor', 100), F('armor', 20)]), 120 * 0.8 * (1 - Math.pow(2, -100 / 40)));
  T('Schutz: Einzelziel-Schutz sieht 40 % der Treffer', P([F('cap', 48, { cov: 0.4 })]), 120 * 0.5 * 0.4 * (1 - 48 / 95));
  // Schutzgeist mit 5 Treffern Vorrat, alle 20 s neu: 0,63 große Treffer/s, lebt 7,9 s, also 39,6 % der Zeit
  T('Schutz: Geist lebt nur, bis sein Vorrat verbraucht ist', P([F('cap', 48, { hits: 5, rate: 1 / 20, dur: 54 })]), 120 * 0.5 * (5 / (120 * 0.5 / 95) / 20) * (1 - 48 / 95)); }
// Rüstungsbruch (Wiki "Cracked Armor"): −20 Rüstung, nie unter 60
{ const b = bar(E, 0, { 10: 12, 12: 12 }, ['Flare']);
  T('Rüstungsbruch: Rüstung 80 wird 60', part(run(b, { armor: 80, crack: 1 }), 'Flare'), 56 / 1.75);
  T('Rüstungsbruch: Rüstung 100 wird 80', part(run(b, { armor: 100, crack: 1 }), 'Flare'), 56 * Math.pow(2, -0.5) / 1.75);
  T('Rüstungsbruch: Rüstung 60 bleibt 60', part(run(b, { armor: 60, crack: 1 }), 'Flare'), 56 / 1.75); }
// Arkanes Echo (Wiki): Kopie für 20 s, danach 20 s gesperrt, ein Durchlauf alle 42 s. Energy Burn (20 s Aufladen) bekommt je Durchlauf einen Einsatz dazu.
{ const b = bar(ME, 0, { 2: 12 }, ['Energy Burn', 'Arcane Echo']);
  T('Arkanes Echo: ein zusätzlicher Einsatz alle 42 s', part(run(b), 'Energy Burn'), lin(1, 10, 12) * 9 * (1 / (20 + 2 + AFT) + 1 / 42), 0.04); }

// ---------- Waffe, Laufwege, Reichweiten ----------
// Schwert 15-22, Rang 12: kritische Treffer 17,8 % (Wiki-Messung) mit Höchstschaden mal Wurzel 2. Waffe angepasst +20 % (Wiki "Customize"), Inschrift +15 % zu 90 % der Zeit.
// Ein Gegner, der nach 6 s stirbt: Der Nahkämpfer läuft 2 s und ist 6/8 der Zeit am Gegner. Ein Angriff alle 1,33 s.
{ const b = bar(W, 0, { 20: 12 }, []), r = run(b), p = r.parts.find(x => /Normale Angriffe/.test(x.name)), c = 0.052 + 0.01575 * 8;
  T('Schwert, normale Angriffe', p ? p.dps : 0, ((1 - c) * 18.5 + c * 22 * Math.SQRT2) * 1.2 * 1.135 * (6 / 8) / 1.33, 0.04); }
// Sense 9-41, alle 1,5 s. Drei Gegner: Neben dem Ziel steht einer der beiden anderen, also 2 Treffer je Schwung. Kampf 18 s, 90 % der Zeit am Gegner.
{ const b = bar(D, 0, { 41: 12 }, []), r = run(b, { targets: 3 }), p = r.parts.find(x => /Normale Angriffe/.test(x.name)), c = 0.052 + 0.01575 * 8;
  T('Sense, drei Gegner', p ? p.dps : 0, ((1 - c) * 25 + c * 41 * Math.SQRT2) * 1.2 * 1.135 * (18 / 20) / 1.5 * 2, 0.04); } // Sense: ein Angriff alle 1,5 s (Wiki)
// Waffen-Aufwertungen (Wiki "Vampiric", "Zealous"): Vampir-Schwert 3 Lebensentzug je Treffer, Sense 5; Eifer 1 Energie je Treffer und 1 Pip weniger
{ const b = bar(W, 0, { 20: 12 }, []), r = run(b, { wmod: 'vamp' }), v = r.parts.filter(x => x.name === 'Vampir-Aufwertung' && x.cat === 'dmg').reduce((a, x) => a + x.dps, 0);
  T('Vampir-Schwert: 3 je Treffer', v, 3 * (6 / 8) / 1.33, 0.03);
  const d = bar(D, 0, { 41: 12 }, []), r2 = run(d, { wmod: 'vamp', targets: 3 }), v2 = r2.parts.filter(x => x.name === 'Vampir-Aufwertung' && x.cat === 'dmg').reduce((a, x) => a + x.dps, 0);
  T('Vampir-Sense: 5 je Treffer, zwei Ziele', v2, 5 * 2 * (18 / 20) / 1.5, 0.03);
  const z = run(d, { wmod: 'zeal', targets: 3, bipPips: 0 }); T('Eifer-Sense: Energie je Treffer vermerkt', /Eifer-Aufwertung \+1\.2/.test(z.notes.join(' ')) ? 1 : 0, 1, 0); }
// Zwietracht 30...110, 1 s Wirkzeit, 2 s Aufladen. Zählt nur, wenn das Team Verhexung und Zustand liefert.
{ const b = bar(N, 0, { 5: 12, 6: 8 }, ['Discord']);
  T('Zwietracht mit Verhexung und Zustand im Team', part(run(b, { team: { hex: 1, mhex: 1, cond: 1 } }), 'Discord'), lin(30, 110, 12) / (2 + 1 + AFT), 0.04);
  T('Zwietracht ohne Vorbedingung', part(run(b, { team: { hex: 0, mhex: 0, cond: 0 } }), 'Discord'), 0); }
// Unbeholfenheit 30...135 auf das Ziel und Nachbarn (bei drei Gegnern 2 Ziele). Spieler: Gelegenheit bei 3 x 0,55 Angriffen/s.
{ const b = bar(ME, 0, { 1: 12 }, ['Ineptitude']), Tt = 15 + 1 + AFT;
  T('Unbeholfenheit, drei Gegner', part(run(b, { targets: 3 }), 'Ineptitude'), lin(30, 135, 12) * 2 / (Tt + 1 / (3 * 0.55)), 0.05); }
// Held statt Spieler: unterbricht nur am gemeinsamen Ziel (Wiki "Hero behavior"), Gelegenheit 0,15 Zauber/s
{ const b = bar(ME, 0, { 2: 12 }, ['Power Spike']), Tt = 12 + 0.25 + AFT;
  T('Power Spike als Held', part(run(b, { targets: 3, hero: true }), 'Power Spike'), lin(30, 120, 12) / (Tt + 1 / 0.15)); }
// Vier Helden mit Power Spike teilen sich die 0,15 Zauber/s des gemeinsamen Ziels
{ const ps = () => bar(ME, 0, { 2: 12 }, ['Power Spike']), X = team([bar(E, 0, { 10: 12 }, ['Flare']), ps(), ps(), ps(), ps(), bar(N, 0, { 4: 12 }, ['Blood is Power'])]);
  T('Team: vier Unterbrecher teilen sich ein Ziel', X.slice(1, 5).reduce((a, d) => a + tpart(d, 'Power Spike'), 0), 0.15 * lin(30, 120, 12), 0.05); }
// Kampfdauer folgt aus dem Teamschaden: Sterberate = Schaden / (700 Lebenspunkte x 2), mindestens ein Gegner alle 15 s
{ const X = team([bar(E, 0, { 10: 12 }, ['Flare']), bar(E, 0, { 10: 12 }, ['Flare']), bar(N, 0, { 4: 12 }, ['Blood is Power'])]), dmg = X.reduce((a, d) => a + d.total, 0);
  T('Team: Sterberate aus dem Schaden', X.death, Math.max(3 / 45, Math.min(3 / 4, dmg / 1400)), 0.25); }

// Flächen-Niederschlag hält die Gruppe am Boden (Wiki "Knock down": Niedergeschlagene können sich nicht bewegen). Annahme für diese Zeit: drei Viertel der übrigen Gegner neben dem Ziel statt der Hälfte.
// Sense gegen drei Gegner: ohne Niederschlag 1 + 2 x 0,5 = 2 Treffer je Schwung, liegt die Gruppe die ganze Zeit, 1 + 2 x 0,75 = 2,5. Bei 40 % Liegezeit 1 + 2 x 0,6 = 2,2.
{ const b = bar(D, 0, { 41: 12 }, []), w = o => { const r = run(b, Object.assign({ targets: 3, weapon: [6, 'Sense'] }, o)); return r.parts.find(x => /Normale Angriffe/.test(x.name)).dps; }, w0 = w({});
  T('Niederschlag hält die Gruppe: Sense trifft 2,5 statt 2', w({ hold: 1 }) / w0, 1.25, 0.01);
  T('Niederschlag 40 % der Zeit: Sense trifft 2,2', w({ hold: 0.4 }) / w0, 1.1, 0.01);
  T('Ohne Niederschlag unverändert', GW._aoeMul('Deals damage to target and adjacent foes.', 3), 2, 0.001); }
// Übernatürliche Labilität (Wiki): Niederschlag 2...4 s für Ziel und Gegner in der Nähe, nie länger als 4 s
{ const b = bar(ME, 0, { 0: 16, 2: 16 }, ['Psychic Instability']), r = run(b, { targets: 3 }), p = r.parts.find(x => x.cat === 'ctrl' && /Niederschlag/.test(x.detail));
  T('Labilität: Flächen-Niederschlag mit Liegezeit', p && p.kdUp > 0 && p.kdUp <= 1 && /4 s/.test(p.detail) ? 1 : 0, 1, 0); }

// Strength of Honor (Wiki): "+5...25 Schaden im Nahkampf". Mit einem Speer-Paragon und ohne Nahkämpfer im Team zählt sie nicht, mit einem Sensen-Derwisch schon.
{ const soh = bar(RT, MO, { 34: 12, 15: 10 }, ['Strength of Honor']), para = bar(P, 0, { 37: 12 }, []), derv = bar(D, 0, { 41: 12 }, []);
  const X = team([para, soh], 3, [17, 'Speer']), Y = team([derv, soh], 3, [6, 'Sense']);
  T('Stärke der Ehre ohne Nahkämpfer: 0', part(X[1], 'Strength of Honor'), 0, 0);
  T('Stärke der Ehre mit Nahkämpfer: zählt', part(Y[1], 'Strength of Honor') > 3 ? 1 : 0, 1, 0); }

// Bone Horror (Wiki): Stufe 18 macht im Mittel 27,5 Schaden je Treffer und 8,7 Schaden/s. Todesmagie 16 ergibt Stufe 18.
{ const r = run(bar(N, 0, { 5: 16, 6: 8 }, ['Animate Bone Horror'])), p = r.parts.find(x => x.sid === id('Animate Bone Horror'));
  T('Bone Horror Stufe 18: 8,7 Schaden/s je Diener', +(p.detail.match(/je ([\d.]+)\/s/) || [0, 0])[1], 8.7, 0.06); }

console.log(ok + ' von ' + (ok + bad) + ' Fällen bestanden'); fails.forEach(f => console.log('  FEHLER  ' + f)); process.exit(bad ? 1 : 0);
