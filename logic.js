// Guild Wars 1 Build-Werkstatt: Codec, Daten und Teamlogik (ohne DOM)
(function (G) {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const PROF = ["None", "Warrior", "Ranger", "Monk", "Necromancer", "Mesmer", "Elementalist", "Assassin", "Ritualist", "Paragon", "Dervish"];
  const PROF_DE = ["–", "Krieger", "Waldläufer", "Mönch", "Nekromant", "Mesmer", "Elementarmagier", "Assassine", "Ritualist", "Paragon", "Derwisch"];
  const PROF_ATTRS = { 1: [17, 18, 19, 20, 21], 2: [23, 22, 24, 25], 3: [16, 13, 14, 15], 4: [6, 4, 5, 7], 5: [0, 1, 2, 3], 6: [12, 8, 9, 10, 11], 7: [35, 29, 30, 31], 8: [36, 32, 33, 34], 9: [40, 37, 38, 39], 10: [44, 41, 42, 43] };
  const COST = [0, 1, 3, 6, 10, 15, 21, 28, 37, 48, 61, 77, 97];
  const WEAPON_ATTRS = [18, 19, 20, 25, 29, 37, 41]; // Axe, Hammer, Sword, Marksmanship, Dagger, Spear, Scythe

  function allowedAttrs(pri, sec) {
    const ok = new Set(PROF_ATTRS[pri] || []);
    (PROF_ATTRS[sec] || []).slice(1).forEach(a => ok.add(a));
    return ok;
  }
  function bitlen(v) { return v > 0 ? Math.floor(Math.log2(v)) + 1 : 0; }

  function decode(code, raw) {
    code = (code || "").trim();
    if (!code) throw new Error("Kein Code");
    const bits = [];
    for (const ch of code) {
      const v = B64.indexOf(ch);
      if (v < 0) throw new Error("Ungültiges Zeichen im Code: " + ch);
      for (let i = 0; i < 6; i++) bits.push((v >> i) & 1);
    }
    let pos = 0;
    const rd = n => { let v = 0; for (let i = 0; i < n; i++) v |= (bits[pos + i] || 0) << i; pos += n; return v; };
    const t = rd(4);
    if (t === 14) rd(4); else if (t !== 0) throw new Error("Kein Skill-Template-Code");
    const pb = rd(2) * 2 + 4;
    const pri = rd(pb), sec = rd(pb);
    const n = rd(4), ab = rd(4) + 4;
    const attrs = [];
    for (let i = 0; i < n; i++) attrs.push([rd(ab), rd(4)]);
    const sb = rd(4) + 8;
    const skills = [];
    for (let i = 0; i < 8; i++) skills.push(rd(sb));
    if (pos > bits.length) throw new Error("Code ist zu kurz");
    if ((raw ? pri < 0 : pri < 1) || pri > 10 || sec > 10) throw new Error("Beruf im Code ungültig");
    return { pri, sec, attrs, skills };
  }

  function encode(pri, sec, attrs, skills) {
    const bits = [];
    const wr = (v, n) => { for (let i = 0; i < n; i++) bits.push((v >> i) & 1); };
    const at = attrs.filter(a => a[1] > 0).sort((a, b) => a[0] - b[0]);
    wr(14, 4); wr(0, 4);
    let pb = Math.max(4, bitlen(Math.max(pri, sec))); pb += pb % 2;
    wr((pb - 4) / 2, 2); wr(pri, pb); wr(sec, pb);
    wr(at.length, 4);
    const ab = Math.max(5, bitlen(Math.max(0, ...at.map(a => a[0]))));
    wr(ab - 4, 4);
    at.forEach(([a, p]) => { wr(a, ab); wr(p, 4); });
    const sb = Math.max(8, bitlen(Math.max(...skills)));
    wr(sb - 8, 4);
    skills.forEach(s => wr(s, sb));
    wr(0, 1);
    while (bits.length % 6) bits.push(0);
    let out = "";
    for (let i = 0; i < bits.length; i += 6) { let v = 0; for (let k = 0; k < 6; k++) v |= bits[i + k] << k; out += B64[v]; }
    return out;
  }

  // ---------- Daten ----------
  let SK = null; // id -> Skill
  function loadSkills(data) {
    SK = new Map();
    const c = data.cols;
    data.rows.forEach(r => {
      const o = {}; c.forEach((k, i) => o[k] = r[i]);
      o.tags = new Set(o.g ? o.g.split(" ") : []);
      SK.set(o.id, o);
    });
    G.GW.heroai = data.heroai || {};
    G.GW.allSkills = () => [...SK.values()];
    G.GW.spiritIds = bar => bar.skills.filter(id => { const x = SK.get(id); return x && (/ritual/i.test(x.t) || x.n === "Signet of Spirits"); });
    G.GW.ATTR = data.attr;
    G.GW.icon = { N: data.iconN, size: data.iconSize };
    return SK;
  }
  function skill(id) { return SK && SK.get(id); }

  // ---------- Prüfung einer Leiste ----------
  function validate(bar, isHero) {
    const out = [];
    const nm = s => s.de || s.n;
    const sk = bar.skills.filter(Boolean).map(skill).filter(Boolean);
    const elites = sk.filter(s => s.e);
    if (elites.length > 1) out.push(["bad", "Mehr als eine Elite-Fertigkeit: " + elites.map(nm).join(", ")]);
    const pve = sk.filter(s => s.pve);
    if (pve.length > 3) out.push(["bad", "Mehr als 3 PvE-Fertigkeiten (" + pve.length + ")"]);
    if (isHero && pve.length) out.push(["bad", "Helden können keine PvE-Fertigkeiten nutzen: " + pve.map(nm).join(", ")]);
    const pvp = sk.filter(s => s.pvp);
    if (pvp.length) out.push(["warn", "PvP-Version im Code: " + pvp.map(nm).join(", ")]);
    const wrong = sk.filter(s => s.p && s.p !== bar.pri && s.p !== bar.sec);
    if (wrong.length) out.push(["bad", "Passt nicht zu " + PROF_DE[bar.pri] + (bar.sec ? "/" + PROF_DE[bar.sec] : "") + ": " + wrong.map(nm).join(", ")]);
    const ok = allowedAttrs(bar.pri, bar.sec);
    const badA = bar.attrs.filter(a => a[1] > 0 && !ok.has(a[0]));
    if (badA.length) out.push(["bad", "Attribut passt nicht zur Klasse: " + badA.map(a => G.GW.ATTR[a[0]]).join(", ")]);
    const pts = bar.attrs.reduce((s, a) => s + (COST[a[1]] || 0), 0);
    if (pts > 200) out.push(["bad", "Attributpunkte " + pts + " von 200"]);
    const ids = bar.skills.filter(Boolean);
    if (new Set(ids).size !== ids.length) out.push(["bad", "Eine Fertigkeit steht doppelt auf der Leiste"]);
    return { msgs: out, points: pts };
  }

  // ---------- Heldenleisten (aus den geprüften Teams) ----------
  const BARS = {
    PANIC_SE: { code: "OQBSAYBP0gcw0z0NEwpXgiA", role: "Panik-Mesmer", why: "Panik legt ganze Gruppen lahm: Jede Fertigkeit eines Gegners unterbricht die Gegner um ihn herum. Seit dem Update vom 24.06.2026 führt PvX im Mesmerway Panik auf dem ersten Mesmer, weil Energiewelle rund ein Fünftel Schaden verloren hat." },
    PANIC_SE_MO: { code: "OQNTAYB3mhGkDmemuhAO9CUEA", role: "Panik-Mesmer", why: "Panik legt ganze Gruppen lahm: Jede Fertigkeit eines Gegners unterbricht die Gegner um ihn herum. Seit dem Update vom 24.06.2026 führt PvX im Mesmerway Panik auf dem ersten Mesmer, weil Energiewelle rund ein Fünftel Schaden verloren hat." },
    INEPT: { code: "OQhkAoB8AGK0LACIHUeGJQGARwFD", role: "Unbeholfenheit-Mesmer", why: "Lässt Angreifer danebenschlagen und macht dabei Flächenschaden. In unserer Rechnung kommt diese Leiste auf fast doppelt so viel Dauerschaden wie eine Energiewellen-Leiste. Bringt mit Fleisch von meinem Fleisch eine Wiederbelebung mit." },
    ES_SE_X: { code: "OQBSAYBPngcw0z0NEwpXgiA", role: "Energiewelle mit Verzauberung brechen", why: "Energiewelle und Geisterschmerz sind der Hauptschaden der Heldengruppe. Verzauberung brechen nimmt Gegnern ihre Schutz-Verzauberungen, Verhexung brechen befreit dich von Verhexungen." },
    ES_FOMF: { code: "OQhjAwCc4Mngcw0z0NEwpXgLG", role: "Energiewelle, Wiederbelebung mit Fleisch von meinem Fleisch", why: "Gleicher Schaden wie die anderen Energiewellen-Mesmer. Fleisch von meinem Fleisch ist die schnelle Wiederbelebung der Gruppe." },
    ES_RC: { code: "OQNTAYB3m5EkDmemuhAO9CgGB", role: "Energiewelle, Wiederbelebung mit Gesang der Wiederbelebung", why: "Energiewelle und Geisterschmerz als Schaden. Gesang der Wiederbelebung belebt wieder, ohne Lebenspunkte zu kosten." },
    ES_SE_MO: { code: "OQNTAYB3m5EkDmemuhAO9CUEA", role: "Energiewelle mit Verzauberung brechen", why: "Schaden über Energiewelle, dazu Verzauberungs-Entfernung gegen gegnerische Mönche und Verhexung brechen für die Gruppe." },
    ZEI_SPLINTER: { code: "OAmjIykjJP8469OuG7NZmUOMG", role: "Splitterwaffe mit Rufen", why: "Splitterwaffe verteilt deine Treffer auf Gegner neben dem Ziel. \"Findet ihren Schwachpunkt!\" und die Rüstungs-Rufe stützen Angreifer direkt." },
    XANDRA_ST_MELEE: { code: "OAOj4ggMpOYTr3jLcCNdmLk5B", role: "Seelenverflechtung-Schutz mit Einblick des Richters und Stärke der Ehre", why: "Unterschlupf, Vereinigung und Verschiebung fangen Schaden ab. Einblick des Richters und Stärke der Ehre erhöhen den Schaden von Angreifern." },
    XANDRA_ST_MELEE_NOSOH: { code: "OAOj4ggMpOYTr3jLcCNdmLEkL", role: "Seelenverflechtung-Schutz mit Einblick des Richters und Geschenk des Geistes", why: "Du bringst Stärke der Ehre selbst mit, deshalb hat Xandra stattdessen Geschenk des Geistes als zusätzliche Heilung." },
    XANDRA_ST_CASTER: { code: "OASiAykMhNZ984EOBN5MhclAC", role: "Seelenverflechtung-Schutz mit Geschenk des Geistes und Widerliches Gelage", why: "Schadensverhinderung über Geister. Widerliches Gelage nimmt der Gruppe Zustände ab, Geschenk des Geistes heilt nach." },
    XANDRA_ST_CONVERT: { code: "OAOj8MgMJPYTr3jLcCNdmI3XC", role: "Seelenverflechtung-Schutz mit Verhexungen umwandeln", why: "Schadensverhinderung über Geister. Verhexungen umwandeln entfernt Verhexungen von dir, weil die Rufe deiner Leiste dagegen nichts tun." },
    BIP_FF: { code: "OAhjQkGZIT3BVVCPSTTODTjTJgA", role: "Blut-ist-Kraft-Heiler mit Widerliches Gelage", why: "Blut ist Kraft gibt Energie. Geheilt wird mit Körper und Seele heilen sowie Geisterlicht. Widerliches Gelage holt Zustände von der Frontlinie." },
    BIP_BB: { code: "OAhjQkGZIP3hqqwTaO5GmjzhG", role: "Blut-ist-Kraft-Heiler mit Blutsbande", why: "Energie über Blut ist Kraft, Heilung über Wiederherstellungsmagie. Blutsbande heilt die Gruppe bei jedem Treffer auf das Ziel." },
    BIP_PARA: { code: "OAhjQgGaIP3Bhn0cyNMHnVvqK", role: "Blut-ist-Kraft-Heiler", why: "Energie für die Mesmer, Heilung über Wiederherstellungsmagie und Erholung." },
    LIVIA_MM: { code: "OAljUwGpZS8YVV7Y1YUBKgbh4BA", role: "Knochenteufel-Dienerbeschwörer mit Rufen", why: "Knochenteufel machen Fernkampfschaden aus Leichen. \"Schon unterwegs!\", \"Zieht Euch zurück!\" und \"Haltet Eure Stellung!\" kommen aus Befehlsgewalt." },
    LIVIA_MM_PARA: { code: "OAlkUwGnpeSEPWPWNGVgCIegKWVF", role: "Knochenteufel-Dienerbeschwörer mit \"Sie brennen!\" und Genesungsrefrain", why: "Hält mit \"Sie brennen!\" und Genesungsrefrain Echos auf der Gruppe und nutzt deinen Heroischen Refrain mit." },
    ZEI_SOS: { code: "OACjEyiM5MXTvJzUaO5GmjTKH", role: "Siegel-der-Geister-Heiler mit Wut der Vorfahren", why: "Du bringst selbst Diener mit. Ein zweiter Dienerbeschwörer würde um dieselben Leichen konkurrieren, deshalb heilt Zei Ri statt eines Helden-Dienerbeschwörers." }
  };
  const HEROES = [
    ["Koss", 1], ["Goren", 1], ["Jora", 1], ["Devona", 1],
    ["Acolyte Jin", 2], ["Margrid the Sly", 2], ["Pyre Fierceshot", 2],
    ["Dunkoro", 3], ["Tahlkora", 3], ["Ogden Stonehealer", 3],
    ["Master of Whispers", 4], ["Livia", 4], ["Olias", 4],
    ["Gwen", 5], ["Norgu", 5], ["Ghost of Althea", 5],
    ["Acolyte Sousuke", 6], ["Zhed Shadowhoof", 6], ["Vekk", 6],
    ["Anton", 7], ["Zenmai", 7], ["Miku", 7],
    ["Xandra", 8], ["Zei Ri", 8],
    ["General Morgahn", 9], ["Hayda", 9], ["Keiran Thackeray", 9],
    ["Melonni", 10], ["Kahmu", 10], ["M.O.X.", 10],
    ["Razah", 0]
  ];
  // Wunsch-Helden je Leiste (in dieser Reihenfolge), danach jeder passende Held, dann Razah, dann Mercs
  const PREF = {
    PANIC_SE: ["Gwen", "Norgu"], PANIC_SE_MO: ["Gwen", "Norgu"], INEPT: ["Razah", "Ghost of Althea", "Norgu"],
    ES_SE_X: ["Gwen", "Norgu"], ES_FOMF: ["Ghost of Althea", "Razah"], ES_RC: ["Gwen", "Norgu"], ES_SE_MO: ["Ghost of Althea", "Razah"],
    ZEI_SPLINTER: ["Zei Ri"], XANDRA_ST_MELEE: ["Xandra"], XANDRA_ST_MELEE_NOSOH: ["Xandra"], XANDRA_ST_CASTER: ["Xandra"], XANDRA_ST_CONVERT: ["Xandra", "Zei Ri"],
    BIP_FF: ["Olias", "Master of Whispers", "Livia"], BIP_BB: ["Olias", "Master of Whispers"], BIP_PARA: ["Olias", "Master of Whispers"],
    LIVIA_MM: ["Livia"], LIVIA_MM_PARA: ["Livia"], ZEI_SOS: ["Zei Ri"]
  };

  function analyzePlayer(bar) {
    const sk = bar.skills.filter(Boolean).map(skill).filter(Boolean);
    const names = new Set(sk.map(s => s.n.replace(/ \((Kurzick|Luxon|PvP)\)$/, "")));
    const atk = sk.filter(s => s.tags.has("atk")).length;
    const weapon = Math.max(0, ...bar.attrs.filter(a => WEAPON_ATTRS.includes(a[0])).map(a => a[1]));
    return {
      hr: names.has("Heroic Refrain"),
      attacker: atk >= 3 || weapon >= 9,
      atk, weapon,
      minion: sk.some(s => s.tags.has("minion")),
      soh: names.has("Strength of Honor"),
      names
    };
  }

  function teamPlan(bar, areaKey, areas) {
    const a = analyzePlayer(bar);
    const reasons = [];
    let slots;
    if (a.hr) {
      slots = ["PANIC_SE_MO", "ES_RC", "ES_SE_MO", "INEPT", "LIVIA_MM_PARA", "XANDRA_ST_CONVERT", "BIP_PARA"];
      reasons.push("Deine Leiste hat Heroischen Refrain. Das Team ist auf Echos und Rufe ausgelegt und nutzt deine Refrains mit.");
    } else if (a.attacker) {
      slots = ["PANIC_SE", "ES_SE_X", "ES_FOMF", "INEPT", "ZEI_SPLINTER", a.soh ? "XANDRA_ST_MELEE_NOSOH" : "XANDRA_ST_MELEE", "BIP_FF"];
      reasons.push("Deine Leiste ist auf Angriffe ausgelegt (" + a.atk + " Angriffs-Fertigkeiten" + (a.weapon ? ", Waffenattribut auf " + a.weapon : "") + "). Deshalb kommen Splitterwaffe, Einblick des Richters und Widerliches Gelage für die Frontlinie ins Team.");
    } else {
      slots = ["PANIC_SE_MO", "ES_RC", "ES_SE_MO", "INEPT", a.minion ? "ZEI_SOS" : "LIVIA_MM", "XANDRA_ST_CASTER", "BIP_BB"];
      reasons.push("Deine Leiste ist eine Zauber- oder Unterstützungsleiste. Das Team setzt auf Panik, Energiewelle und Unbeholfenheit im Mittelfeld, Geister als Schutz und einen Dienerbeschwörer" + (a.minion ? ". Weil du selbst Diener mitbringst, heilt Zei Ri statt eines zweiten Dienerbeschwörers." : "."));
    }
    const area = areas.find(x => x.key === areaKey);
    // Gebietsanpassung: ohne Shrines mindestens 3 Rez-Skills
    if (area && area.flags.includes("norez")) {
      const rez = countTag(bar, slots, "rez");
      if (rez < 3) {
        const i = slots.findIndex(s => s === "ES_SE_X" || s === "ES_SE_MO");
        if (i >= 0) {
          const old = slots[i];
          slots[i] = old === "ES_SE_X" ? "ES_FOMF" : "ES_RC";
          reasons.push(area.name + " hat laut Wiki keine Wiederbelebungs-Schreine. Ein Mesmer bekommt deshalb eine Wiederbelebung statt Verzauberung brechen (vorher " + rez + " Wiederbelebungen im Team).");
        }
      }
    }
    reasons.push("Stand nach dem Update vom 24.06.2026: Energiewelle macht 7 statt 9 Schaden je Energiepunkt und trifft Umstehende nur noch mit 75 %. Deshalb stehen im Mittelfeld jetzt ein Panik-Mesmer, zwei Energiewellen-Mesmer und ein Unbeholfenheit-Mesmer. So führt es auch PvX im aktuellen Mesmerway (Stand 30.10.2026).");
    return { analysis: a, slots, reasons, area };
  }

  function countTag(bar, slots, tag) {
    let n = bar.skills.filter(Boolean).map(skill).filter(s => s && s.tags.has(tag)).length;
    slots.forEach(k => { decode(BARS[k].code).skills.forEach(id => { const s = skill(id); if (s && s.tags.has(tag)) n++; }); });
    return n;
  }

  function assignHeroes(slots, owned, mercs) {
    const used = new Set();
    let mercUsed = 0;
    const res = slots.map(() => null);
    // zuerst Leisten mit festem Wunschhelden, dann der Rest
    const order = slots.map((k, i) => i);
    order.forEach(i => {
      const k = slots[i];
      const prof = decode(slotCode(k)).pri;
      const pref = (slotPref(k) || []).filter(h => owned.has(h) && !used.has(h) && heroProf(h) === prof);
      let h = pref[0];
      if (!h) h = HEROES.map(x => x[0]).find(n => owned.has(n) && !used.has(n) && heroProf(n) === prof && n !== "Razah");
      if (!h && owned.has("Razah") && !used.has("Razah")) h = "Razah";
      if (h) { used.add(h); res[i] = { name: h, merc: false }; }
      else if (mercUsed < mercs) { mercUsed++; res[i] = { name: "Söldner " + mercUsed, merc: true }; }
      else res[i] = { name: null, merc: false };
    });
    return res;
  }
  function slotCode(k) { return typeof k === "string" ? BARS[k].code : k.code; }
  function slotPref(k) { return typeof k === "string" ? PREF[k] : (k.pref || []); }
  function heroProf(n) { const h = HEROES.find(x => x[0] === n); return h ? h[1] : -1; }

  function areaChecks(bar, slots, area, size) {
    const out = [];
    const all = [bar.skills, ...slots.map(k => decode(slotCode(k)).skills)].flat().filter(Boolean).map(skill).filter(Boolean);
    const cnt = t => all.filter(s => s.tags.has(t));
    const names = arr => [...new Set(arr.map(s => s.de || s.n))].join(", ");
    const flags = area ? area.flags : [];
    const rez = cnt("rez");
    const sz = size || 8;
    const need = flags.includes("norez") ? 3 : sz >= 6 ? 2 : 1;
    out.push([rez.length >= need ? "ok" : "warn", "Wiederbelebung: " + rez.length + (rez.length ? " (" + names(rez) + ")" : "") + (flags.includes("norez") ? ". Keine Wiederbelebungs-Schreine, Ziel mindestens 3." : rez.length < need ? ". Für " + sz + " Spieler mindestens " + need + "." : "")]);
    if (sz < 8 && !flags.length) {
      const sup = slots.filter(k => { const d = decode(slotCode(k)); const top = d.attrs.slice().sort((a, b) => b[1] - a[1])[0] || [0]; return d.pri === 3 || [33, 32, 4, 13, 15].includes(top[0]); }).length;
      out.push([sup >= (sz >= 6 ? 2 : 1) ? "ok" : "warn", "Heiler und Schützer im Team: " + sup + ". Bei " + sz + " Spielern " + (sz >= 6 ? "mindestens 2." : "mindestens 1.")]);
    }
    if (flags.includes("hex")) { const x = cnt("hexrem"); out.push([x.length >= 3 ? "ok" : x.length ? "warn" : "bad", "Verhexungs-Entfernung: " + x.length + (x.length ? " (" + names(x) + ")" : "") + ". Laut Wiki viele gefährliche Verhexungen."]); }
    if (flags.includes("cond")) { const x = cnt("condrem"); out.push([x.length >= 2 ? "ok" : x.length ? "warn" : "bad", "Zustands-Entfernung: " + x.length + (x.length ? " (" + names(x) + ")" : "") + (x.length < 2 ? ". Knapp für dieses Gebiet, nimm selbst eine mit." : ".")]); }
    if (flags.includes("ench")) { const x = cnt("ench"); out.push([x.length > 4 ? "warn" : "ok", "Verzauberungen im Team: " + x.length + (x.length ? " (" + names(x) + ")" : "") + ". Gegner entfernen dort oft Verzauberungen."]); }
    if (flags.includes("kd")) { const x = cnt("stab"); out.push([x.length ? "ok" : "warn", "Schutz vor Knockdown: " + (x.length ? names(x) : "keiner im Team") + ". Laut Wiki viel Knockdown."]); }
    if (flags.includes("ownkd")) { const x = cnt("kd"); out.push([x.length ? "ok" : "bad", "Eigene Knockdowns: " + (x.length ? names(x) : "keine") + ". Laut Wiki-Ableitung Pflicht gegen Aspekte und Kanaxai."]); }
    if (flags.includes("intr")) { const x = cnt("intr"); out.push(["info", "Unterbrechungen im Team: " + x.length + (x.length ? " (" + names(x) + ")" : "") + ". Gegner unterbrechen dort oft, eigene Unterbrechungen helfen gegen Heiler."]); }
    if (flags.includes("energy")) out.push(["info", "Starker Energiedruck laut Wiki. Energiewellen-Mesmer und der Blut-ist-Kraft-Heiler leiden darunter."]);
    return out;
  }

  G.GW = Object.assign(G.GW || {}, { decodeRaw: c => decode(c, true), slotCode, PROF, PROF_DE, PROF_ATTRS, COST, allowedAttrs, decode, encode, loadSkills, skill, validate, BARS, HEROES, PREF, analyzePlayer, teamPlan, assignHeroes, areaChecks, heroProf });
})(typeof window !== "undefined" ? window : globalThis);

// ---------- Fertigkeitsvorschläge nach Buildchemie ----------
(function (G) {
  const GW = G.GW;
  // pages: PvX-Builds und unsere Teamleisten [{name,url,core:[ids],opt:[[id,note]],team}]
  GW.suggest = function (bar, slot, pages, limit) {
    const S = GW.skill;
    const others = bar.skills.filter((id, i) => id && i !== slot);
    const otherSet = new Set(others);
    const os = others.map(S).filter(Boolean);
    const slotSkill = S(bar.skills[slot]);
    const eliteTaken = os.some(s => s.e);
    const pveCount = os.filter(s => s.pve).length;
    const attr = new Map(bar.attrs);
    const atkCount = os.filter(s => s.tags.has("atk")).length;
    const spellCount = os.filter(s => /Spell|Signet|Hex|Enchantment|Well|Ward|Glyph|Ritual|Echo|Chant|Shout|Skill|Form/.test(s.t) && !s.tags.has("atk")).length;
    const adrCount = os.filter(s => /A$/.test(s.cost || "")).length;
    const score = new Map();
    const add = (id, pts, why) => {
      if (!id || otherSet.has(id)) return;
      const r = score.get(id) || { id, pts: 0, why: [] };
      r.pts += pts; if (why && !r.why.includes(why)) r.why.push(why);
      score.set(id, r);
    };
    pages.forEach(p => {
      const ov = p.core.filter(id => otherSet.has(id));
      const need = others.length >= 4 ? 2 : 1;
      if (ov.length < need) return;
      const w = ov.length;
      p.core.forEach(id => add(id, 2 * w, (p.team ? "Unser Team-Build" : "PvX-Build") + " „" + p.name + "“ (" + w + " gemeinsame)"));
      p.opt.forEach(([id, note]) => add(id, 1.5 * w, "Option in „" + p.name + "“" + (note ? ": " + note : "")));
    });
    const out = [];
    score.forEach(r => {
      const s = S(r.id);
      if (!s || s.pvp) return;
      if (s.p && s.p !== bar.pri && s.p !== bar.sec) return;
      if (s.e && eliteTaken) return;
      if (s.pve && pveCount >= 3) return;
      // Attribut-Passung
      if (s.aid >= 0) {
        const rank = attr.get(s.aid) || 0;
        if (rank >= 8) { r.pts += 2; r.why.unshift("Nutzt dein Attribut (" + rank + ")"); }
        else if (rank === 0) { r.pts -= 4; r.why.push("Attribut nicht gesteigert"); }
      }
      // Mechanik: Angriffe zu Angriffsleisten, Zauber zu Zauberleisten
      if (s.tags.has("atk") && spellCount > atkCount + 2) r.pts -= 2;
      if (s.tags.has("atk") && atkCount >= 3) r.pts += 1;
      if (/A$/.test(s.cost || "") && adrCount === 0 && atkCount < 2) r.pts -= 2;
      if (r.pts > 0) out.push(r);
    });
    out.sort((a, b) => b.pts - a.pts);
    return out.slice(0, limit || 12);
  };
})(typeof window !== "undefined" ? window : globalThis);

// ---------- Teamtypen und Ausrüstung ----------
(function (G) {
  const GW = G.GW;
  // Liefert die 7 Heldenslots als Objekte {code, role, why, pref, src}
  GW.resolveTeam = function (teamKey, bar, areaKey, areas, TEAMS, variant) {
    let def = TEAMS.find(t => t.key === teamKey) || TEAMS[0];
    if (def.variants) { const v = def.variants[Math.min(variant || 0, def.variants.length - 1)]; def = Object.assign({}, def, { slots: v.slots, player: v.player, variant: v.label }); }
    if (!def.slots) {
      const plan = GW.teamPlan(bar, areaKey, areas);
      return { def, analysis: plan.analysis, area: plan.area, reasons: plan.reasons,
        slots: plan.slots.map(k => Object.assign({ key: k, pref: GW.PREF[k] }, GW.BARS[k])) };
    }
    const area = areas.find(a => a.key === areaKey);
    const slots = def.slots.map(s => s.own ? Object.assign({ key: s.own, pref: GW.PREF[s.own] }, GW.BARS[s.own]) : Object.assign({}, s));
    return { def, analysis: GW.analyzePlayer(bar), area, reasons: [def.desc], slots };
  };

  const RUNE = { 3: ["Überlegene Rune (+3)", "+3, kostet 75 Lebenspunkte"], 2: ["Höhere Rune (+2)", "+2, kostet 35 Lebenspunkte"], 1: ["Kleinere Rune (+1)", "+1, kostet keine Lebenspunkte"] };
  // Erklärungen zu Ausrüstungsbegriffen (Werte laut Guild Wars Wiki)
  const EXPL = [
    [/anniversary/i, "Jubiläumswaffe: Anforderung 9 in einem Primärattribut der Klasse, der Waffentyp passt sonst nicht zur Klasse. Gibt es nur während der Jubiläumsfeier beim Jubiläums-Waffenschmied (laut Wiki)."],
    [/superior vigor|vigor/i, "Rune der Lebenskraft (kleinere/höhere/überlegene): +30/+41/+50 Lebenspunkte. Mehrere davon stapeln nicht, es zählt die stärkste."],
    [/vitae/i, "Rune der Lebenskraft (+10): +10 Lebenspunkte je Rune, stapelt."],
    [/attunement/i, "Rune der Einstimmung: +2 Energie je Rune, stapelt."],
    [/clarity/i, "Rune der Klarheit: −20 % Dauer von Blindheit und Schwäche."],
    [/purity/i, "Rune der Reinheit: −20 % Dauer von Krankheit und Gift."],
    [/recovery/i, "Rune der Gesundung: −20 % Dauer von Benommenheit und Tiefer Wunde."],
    [/rune of restoration|of restoration/i, "Rune der Wiederherstellung: −20 % Dauer von Blutung und Verkrüppelung."],
    [/survivor/i, "Überlebende-Befähigung: Lebenspunkte +15 (Brust), +10 (Beine), +5 (sonst)."],
    [/radiant/i, "Radianten-Befähigung: Energie +3 (Brust), +2 (Beine), +1 (sonst)."],
    [/stalwart/i, "Entschlossenheits-Befähigung: Rüstung +10 gegen physischen Schaden."],
    [/blessed/i, "Segens-Befähigung: Rüstung +10, solange du verzaubert bist."],
    [/sentry/i, "Wachposten-Befähigung: Rüstung +10 in einer Haltung."],
    [/herald/i, "Herold-Befähigung: Rüstung +10 beim Tragen eines Gegenstands."],
    [/brawler/i, "Raufbold-Befähigung: Rüstung +10 beim Angreifen."],
    [/knight/i, "Ritter-Befähigung: Erlittener physischer Schaden −3."],
    [/sentinel/i, "Wächter-Befähigung: Rüstung +20 gegen Elementarschaden (braucht Stärke 13)."],
    [/dreadnought/i, "Panzerschiff-Befähigung: Rüstung +10 gegen Elementarschaden."],
    [/lieutenant/i, "Leutnant-Befähigung: −20 % Verhexungsdauer auf dir, −5 % ausgeteilter Schaden, Rüstung −20."],
    [/beastmaster/i, "Tierbändiger-Befähigung: Rüstung +10, solange dein Tiergefährte lebt."],
    [/scout/i, "Späher-Befähigung: Rüstung +10 während einer Vorbereitung."],
    [/earthbound/i, "Erdbindungs-Befähigung: Rüstung +15 gegen Erdschaden."],
    [/wanderer/i, "Wanderer-Befähigung: Rüstung +10 gegen Elementarschaden."],
    [/disciple/i, "Jünger-Befähigung: Rüstung +15 unter einem Zustand."],
    [/anchorite/i, "Einsiedler-Befähigung: Rüstung +5 je ab 1, 3 und 5 Fertigkeiten im Wiederaufladen."],
    [/blighter/i, "Verderber-Befähigung: Rüstung +20, solange du verhext bist."],
    [/bloodstained/i, "Blutfleck-Befähigung: −25 % Zauberzeit für Leichen-Zauber (z. B. Diener beleben), stapelt nicht."],
    [/bonelace/i, "Klöppelspitzen-Befähigung: Rüstung +15 gegen Stichschaden."],
    [/minion master/i, "Dienermeister-Befähigung: Rüstung +5 je ab 1, 3 und 5 Dienern."],
    [/tormentor/i, "Folterer-Befähigung: Rüstung +10, aber mehr erlittener Heiliger Schaden (+6 Brust, +4 Beine, +2 sonst)."],
    [/undertaker/i, "Leichenbestatter-Befähigung: Rüstung +5 je unter 80, 60, 40 und 20 % Lebenspunkte."],
    [/virtuoso/i, "Virtuosen-Befähigung: Rüstung +15 beim Aktivieren von Fertigkeiten."],
    [/artificer/i, "Feuerwerker-Befähigung: Rüstung +3 je ausgerüstetem Siegel."],
    [/prodigy/i, "Wunder-Befähigung: Rüstung +5 je ab 1, 3 und 5 Fertigkeiten im Wiederaufladen."],
    [/aeromancer|geomancer|hydromancer|pyromancer/i, "Element-Befähigung (Hydro-, Geo-, Pyro-, Aeromanten): Rüstung +10 gegen Elementarschaden und +10 gegen das eigene Element."],
    [/prismatic/i, "Spektral-Befähigung: Rüstung +5 je Element-Attribut auf mindestens 9."],
    [/infiltrator|saboteur|vanguard/i, "Assassinen-Befähigung (Hauptmann, Eindringlings, Saboteur): Rüstung +10 gegen physischen Schaden und +10 gegen eine Schadensart."],
    [/nightstalker/i, "Nachtpirscher-Befähigung: Rüstung +15 beim Angreifen."],
    [/ghost forge/i, "Geisterschmiede-Befähigung: Rüstung +15 unter einem Waffenzauber."],
    [/mystic/i, "Mystiker-Befähigung: Rüstung +15 beim Aktivieren von Fertigkeiten."],
    [/shaman/i, "Schamanen-Befähigung: Rüstung +5 je ab 1, 2 und 3 eigenen Geistern."],
    [/centurion/i, "Zenturio-Befähigung: Rüstung +10 unter einem Ruf, Echo oder Gesang."],
    [/forsaken/i, "Verlassenen-Befähigung: Rüstung +10 ohne Verzauberung."],
    [/windwalker/i, "Windläufer-Befähigung: Rüstung +5 je ab 1, 2, 3 und 4 Verzauberungen."],
    [/(^|[^\/\d])40\/40/, "40/40-Set: Zauberstab plus Fokus im selben Attribut, je 20 % halbe Zauberzeit und 20 % halbe Wiederaufladezeit. Laut Wiki zusammen nur 36 % Chance."],
    [/40\/20\/20/, "40/20/20-Stab: Stab mit Chance auf halbe Zauberzeit und halbe Wiederaufladezeit im genannten Attribut plus einem weiteren Bonus."],
    [/(^|[^\/\d])20\/20/, "20/20: Zauberwaffe mit 20 % halbe Zauberzeit und 20 % halbe Wiederaufladezeit für ein Attribut."],
    [/aptitude not attitude/i, "Inschrift \"Gut gewirkt ist halb gewonnen\": halbe Zauberzeit für Zauber des Waffenattributs (10…20 % Chance)."],
    [/don'?t think twice/i, "Inschrift \"Zauderei ist keine Zier\": halbe Zauberzeit für alle Zauber (5…10 % Chance)."],
    [/let the memory live again/i, "Inschrift \"Auf die Erinnerung!\": halbe Wiederaufladezeit für Zauber (5…10 % Chance)."],
    [/i have the power/i, "Inschrift \"Ich habe die Kraft!\": Energie +5."],
    [/hale and hearty/i, "Inschrift \"Gesund und munter\": Energie +1…5, solange Lebenspunkte über 50 %."],
    [/have faith/i, "Inschrift \"Habt Vertrauen\": Energie +1…5, solange verzaubert."],
    [/seize the day|live for today/i, "Inschrift \"Nutzt den Tag\" bzw. \"Lebt den Tag\": Energie +10…15, Energieregeneration −1."],
    [/master of my domain/i, "Inschrift \"Herr in meinem Haus\": Waffenattribut +1 (10…20 % Chance)."],
    [/hail to the king/i, "Fokus-Inschrift \"Gelobt sei der König\": Rüstung +4…5, solange Lebenspunkte über 50 %."],
    [/i can see clearly now/i, "Inschrift \"Klar wie Morgentau\": −20 % Blindheitsdauer auf dir."],
    [/strength and hono/i, "Inschrift \"Stärke und Ehre\": Schaden +10…15 %, solange Lebenspunkte über 50 % (nur Waffengrundschaden)."],
    [/guided by fate/i, "Inschrift \"Wink des Schicksals\": Schaden +10…15 %, solange verzaubert (nur Waffengrundschaden)."],
    [/dance with death/i, "Inschrift \"Tanz mit dem Tod\": Schaden +10…15 % in einer Haltung."],
    [/vengeance/i, "Inschrift \"Die Rache ist mein\": Schaden +10…20 %, solange Lebenspunkte unter 50 %."],
    [/sleep now in the fire|riders on the storm|leaf on the wind|like a rolling stone|through thick and thin|the riddle of steel|not the face/i, "Schild-/Fokus-Inschrift: Rüstung +5…10 gegen eine Schadensart."],
    [/zealous/i, "Eifer-: +1 Energie pro Treffer, Energieregeneration −1."],
    [/vampiric/i, "Vampir-: Lebensentzug pro Treffer, Lebenspunkte-Regeneration −1."],
    [/sundering/i, "Trenn-: +20 % Rüstungsdurchdringung mit 10…20 % Chance (Erwartungswert 2…4 %)."],
    [/furious/i, "Zorn-: doppeltes Adrenalin mit 2…10 % Chance."],
    [/adept/i, "Experten- (Stabkopf): halbe Zauberzeit für Zauber des Attributs (10…20 % Chance)."],
    [/swift/i, "Schnelligkeits- (Stabkopf): halbe Zauberzeit für alle Zauber (2…10 % Chance)."],
    [/hale/i, "Rüstigkeits- (Stabkopf): Lebenspunkte +10…30."],
    [/insightful/i, "Einblick- (Stabkopf): Energie +1…5."],
    [/defensive/i, "Verteidigungs- (Stabkopf): Rüstung +4…5 (Bonus-Kategorie, gedeckelt bei +25)."],
    [/of enchanting/i, "der Verzauberung: Verzauberungen halten 10…20 % länger."],
    [/of defense/i, "der Verteidigung: Rüstung +4…5 (Bonus-Kategorie, gedeckelt bei +25)."],
    [/of shelter/i, "der Zuflucht: Rüstung +4…7 gegen physischen Schaden."],
    [/of warding/i, "der Abwehr: Rüstung +4…7 gegen Elementarschaden."],
    [/of fortitude/i, "der Tapferkeit: Lebenspunkte +10…30."],
    [/of devotion/i, "der Hingabe: Lebenspunkte +30…45, solange verzaubert."],
    [/of mastery/i, "der Beherrschung: Waffenattribut +1 mit 10…20 % Chance."],
    [/of the (necromancer|mesmer|monk|warrior|ranger|elementalist|assassin|ritualist|paragon|dervish)/i, "des <Klasse> (z. B. des Nekromanten): hebt das Hauptattribut dieser Klasse auf 4…5, wenn es niedriger ist. Beim Nekromanten ist das Seelensammlung: Energie, wenn in der Nähe etwas stirbt."],
    [/shield/i, "Schild: Rüstung (Core, nicht gedeckelt). Volle 16 Rüstung nur mit Anforderung 9 im Schildattribut."],
    [/focus/i, "Fokus: bis +12 Energie (mit Anforderung 9 im Attribut)."]
  ];
  GW.explainEquip = function (text) {
    const out = [];
    EXPL.forEach(([re, t]) => { if (re.test(text) && !out.includes(t)) out.push(t); });
    return out;
  };
  GW.equipFor = function (bar, EQ, url) {
    const ids = new Set(bar.skills.filter(Boolean));
    let best = null, bestOv = 0, own = null, ownOv = -1;
    EQ.forEach(e => {
      const ov = e.s.filter(x => ids.has(x)).length;
      // Einträge der eigenen PvX-Seite des Builds gehen vor (auch bei "für jede Klasse")
      if (url && e.url === url && e.eq.length && ov > ownOv) { ownOv = ov; own = e; }
      if (e.pri !== bar.pri) return;
      if (ov > bestOv) { bestOv = ov; best = e; }
    });
    const need = Math.min(5, Math.max(3, ids.size - 2));
    const runes = [];
    if (own && ownOv >= 2) {
      let headUsed = false;
      // Runen gelten nur für Attribute der eigenen Primärklasse
      if (own.pri === bar.pri) own.r.forEach(([a, add]) => {
        if (add === 1 && !headUsed) { headUsed = true; runes.push({ item: "Kopfteil +1", attr: a, why: "Das Kopfteil gibt +1 auf ein Attribut deiner Primärklasse und kostet keine Lebenspunkte." }); return; }
        const R = RUNE[add];
        if (R) runes.push({ item: R[0], attr: a, why: R[1] + ". Attributrunen derselben Art stapeln nicht, der Lebenspunkte-Malus aber schon." });
      });
      return { src: own, overlap: ownOv, items: own.eq, runes, derived: false, own: true };
    }
    if (best && bestOv >= need) {
      let headUsed = false;
      best.r.forEach(([a, add]) => {
        if (add === 1 && !headUsed) { headUsed = true; runes.push({ item: "Kopfteil +1", attr: a, why: "Das Kopfteil gibt +1 auf ein Attribut deiner Primärklasse und kostet keine Lebenspunkte." }); return; }
        const R = RUNE[add];
        if (R) runes.push({ item: R[0], attr: a, why: R[1] + ". Attributrunen derselben Art stapeln nicht, der Lebenspunkte-Malus aber schon." });
      });
      return { src: best, overlap: bestOv, items: best.eq, runes, derived: false };
    }
    // Herleitung ohne passenden PvX-Eintrag
    const primAttrs = (GW.PROF_ATTRS[bar.pri] || []);
    const top = bar.attrs.filter(a => primAttrs.includes(a[0])).sort((x, y) => y[1] - x[1])[0];
    if (top && top[1] >= 9) runes.push({ item: "Überlegene Rune (+3)", attr: top[0], why: "+3 auf dein höchstes Primärattribut, kostet 75 Lebenspunkte." });
    const a = GW.analyzePlayer(bar);
    const items = ["Rune of Superior Vigor", "Rune of Vitae", a.attacker ? "5 Survivor Insignia" : "5 Radiant Insignia", a.attacker ? "Zealous weapon with \"Strength and Honor\"" : "40/40 set"];
    return { src: null, overlap: bestOv, items, runes, derived: true };
  };
})(typeof window !== "undefined" ? window : globalThis);

// ---------- Ausrüstung und Patchnotizen eindeutschen ----------
(function (G) {
  const GW = G.GW;
  const INS = {"Survivor":"Überlebende","Radiant":"Radianten","Stalwart":"Entschlossenheits","Brawler's":"Raufbold","Blessed":"Segens","Herald's":"Herold","Sentry's":"Wachposten","Knight's":"Ritter","Stonefist":"Steinfaust","Dreadnought":"Panzerschiff","Lieutenant's":"Leutnant","Sentinel's":"Wächter","Frostbound":"Permafrost","Pyrebound":"Scheiterhaufen","Stormbound":"Unwetter","Scout's":"Späher","Earthbound":"Erdbindungs","Beastmaster's":"Tierbändiger","Wanderer's":"Wanderer","Disciple's":"Jünger","Anchorite's":"Einsiedler","Bloodstained":"Blutfleck","Tormentor's":"Folterer","Bonelace":"Klöppelspitzen","Minion Master's":"Dienermeister","Blighter's":"Verderber","Undertaker's":"Leichenbestatter","Virtuoso's":"Virtuosen","Artificer's":"Feuerwerker","Prodigy's":"Wunder","Hydromancer":"Hydromanten","Geomancer":"Geomanten","Pyromancer":"Pyromanten","Aeromancer":"Aeromanten","Prismatic":"Spektral","Vanguard's":"Hauptmann","Infiltrator's":"Eindringlings","Saboteur's":"Saboteur","Nightstalker's":"Nachtpirscher","Shaman's":"Schamanen","Ghost Forge":"Geisterschmiede","Mystic's":"Mystiker","Centurion's":"Zenturio","Windwalker":"Windläufer","Forsaken":"Verlassenen"};
  const INSCR = {"Aptitude not Attitude":"Gut gewirkt ist halb gewonnen","I have the power!":"Ich habe die Kraft!","Guided by Fate":"Wink des Schicksals","Have Faith":"Habt Vertrauen","Don't Think Twice":"Zauderei ist keine Zier","I Can See Clearly Now":"Klar wie Morgentau","Hale and Hearty":"Gesund und munter","Strength and Honor":"Stärke und Ehre","Strength and Honour":"Stärke und Ehre","Sleep Now in the Fire":"Geborgenheit im Feuer","Through Thick and Thin":"Durch Dick und Dünn","Let the Memory Live Again":"Auf die Erinnerung!","Dance with Death":"Tanz mit dem Tod","Hail to the King":"Gelobt sei der König","The Riddle of Steel":"Hieb- und stahlfest","Live for Today":"Lebt den Tag","Vengeance is Mine":"Die Rache ist mein","Vengeance":"Die Rache ist mein","Seize the Day":"Nutzt den Tag","Like a Rolling Stone":"Marmor, Stein und Erde bricht","Leaf on the Wind":"Grashalm im Wind","Not the face!":"Nicht das Gesicht!","Master of My Domain":"Herr in meinem Haus","Riders on the Storm":"Geblitzt wird nicht!","Sheltered by Faith":"Vertrauen ist gut","To the Pain!":"Fühlt den Schmerz!","Brawn over Brains":"Körper über Geist","Too Much Information":"Zuviel Information","Don't Fear the Reaper":"Keine Angst vorm Sensenmann","Run for Your Life!":"Rennt um Euer Leben!","Nothing to Fear":"Nichts zu befürchten"};
  const CLS = {necromancer:"des Nekromanten",mesmer:"des Mesmers",monk:"des Mönchs",warrior:"des Kriegers",ranger:"des Waldläufers",elementalist:"des Elementarmagiers",assassin:"des Assassinen",ritualist:"des Ritualisten",paragon:"des Paragons",dervish:"des Derwischs"};
  const ATTR_DE = {"Fast Casting":"Schnellwirkung","Illusion Magic":"Illusionsmagie","Domination Magic":"Beherrschungsmagie","Inspiration Magic":"Inspirationsmagie","Blood Magic":"Blutmagie","Death Magic":"Todesmagie","Soul Reaping":"Seelensammlung","Curses":"Flüche","Air Magic":"Luftmagie","Earth Magic":"Erdmagie","Fire Magic":"Feuermagie","Water Magic":"Wassermagie","Energy Storage":"Energiespeicherung","Healing Prayers":"Heilgebete","Smiting Prayers":"Peinigungsgebete","Protection Prayers":"Schutzgebete","Divine Favor":"Gunst der Götter","Strength":"Stärke","Axe Mastery":"Axtbeherrschung","Hammer Mastery":"Hammerbeherrschung","Swordsmanship":"Schwertkunst","Tactics":"Taktik","Beast Mastery":"Tierbeherrschung","Expertise":"Fachkenntnis","Wilderness Survival":"Überleben in der Wildnis","Marksmanship":"Treffsicherheit","Dagger Mastery":"Dolchbeherrschung","Deadly Arts":"Tödliche Künste","Shadow Arts":"Schattenkünste","Communing":"Zwiesprache","Restoration Magic":"Wiederherstellungsmagie","Channeling Magic":"Kanalisierungsmagie","Critical Strikes":"Kritische Stöße","Spawning Power":"Macht des Herbeirufens","Spear Mastery":"Speerbeherrschung","Command":"Befehlsgewalt","Motivation":"Motivation","Leadership":"Führung","Scythe Mastery":"Sensenbeherrschung","Wind Prayers":"Windgebete","Earth Prayers":"Erdgebete","Mysticism":"Mystik","Domination":"Beherrschungsmagie","Illusion":"Illusionsmagie","Restoration":"Wiederherstellungsmagie","Channeling":"Kanalisierungsmagie","Spawning":"Macht des Herbeirufens","Death":"Todesmagie"};
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const LIST = (o, flags) => new RegExp("(" + Object.keys(o).sort((a, b) => b.length - a.length).map(esc).join("|") + ")", flags || "gi");
  const insRe = new RegExp("(\\d+x?\\s*|full |all )?(" + Object.keys(INS).sort((a, b) => b.length - a.length).map(k => esc(k).replace("'s", "(?:'s)?")).join("|") + ")\\s*insignias?", "gi");
  GW.deEquip = function (text) {
    let s = " " + text + " ";
    s = s.replace(/"([^"]+)"/g, (m, q) => { const k = Object.keys(INSCR).find(x => x.toLowerCase() === q.toLowerCase().replace(/!$/, "") || x.toLowerCase() === q.toLowerCase()); return k ? "\u201e" + INSCR[k] + "\u201c" : m; });
    s = s.replace(insRe, (m, n, name) => { const key = Object.keys(INS).find(k => k.toLowerCase().replace("'s", "") === name.toLowerCase().replace("'s", "")); const num = (n || "").replace(/x/i, "").trim(); return (num && /\d/.test(num) ? num + "× " : (/full|all/i.test(n || "") ? "5× " : "")) + (key ? INS[key] : name) + "-Befähigung "; });
    s = s.replace(new RegExp("\\b(" + Object.keys(INS).sort((a, b) => b.length - a.length).map(esc).join("|") + ")(?=[\\s/,.]|$)", "gi"), m => { const k = Object.keys(INS).find(x => x.toLowerCase() === m.toLowerCase()); return (k ? INS[k] : m) + "-Befähigung"; }).replace(/-Befähigung\/([A-ZÄÖÜ][^\s\/]*-Befähigung)/g, "/$1");
    const AW = { spear: "Speer", sword: "Schwert", hammer: "Hammer", scythe: "Sense", shield: "Schild", axe: "Axt", shortbow: "Kurzbogen", flatbow: "Flachbogen", staff: "Stab", daggers: "Dolche" };
    s = s.replace(/anniversary (\w+) (?:"|\u201e)(\w+)(?:"|\u201c)?/gi, (m, t, n) => "Jubiläums-" + (AW[t.toLowerCase()] || t) + " \u201e" + n + "\u201c");
    const R = [
      [/(?:\d+x?\s*)?(?:a\s+)?runes? of superior vigor|superior vigor runes?/gi, "Überlegene Rune der Lebenskraft (+50 Leben)"],
      [/(\d+)x?\s*runes? of vitae/gi, "$1× Rune der Lebenskraft (+10 Leben)"],
      [/(?:\d+x?\s*)?(?:a\s+)?runes? of vitae|vitae runes?/gi, "Rune der Lebenskraft (+10 Leben)"],
      [/(\d+)x?\s*runes? of attunement/gi, "$1× Rune der Einstimmung"],
      [/(?:\d+x?\s*)?(?:a\s+)?runes? of attunement|attunement runes?/gi, "Rune der Einstimmung"],
      [/(?:a\s+)?runes? of clarity/gi, "Rune der Klarheit"], [/(?:a\s+)?runes? of purity/gi, "Rune der Reinheit"],
      [/(?:a\s+)?runes? of recovery/gi, "Rune der Gesundung"], [/(?:a\s+)?runes? of restoration/gi, "Rune der Wiederherstellung"],
      [/runes? of superior ([a-z ]+?)(?=[,.;]| on| rune|\s*$)/gi, "Überlegene Rune: $1"], [/runes? of major ([a-z ]+?)(?=[,.;]|\s*$)/gi, "Höhere Rune: $1"], [/runes? of minor ([a-z ]+?)(?=[,.;]|\s*$)/gi, "Kleinere Rune: $1"],
      [/\bzealous\b/gi, "Eifer-"], [/\bvampiric\b/gi, "Vampir-"], [/\bsundering\b/gi, "Trenn-"], [/\bfurious\b/gi, "Zorn-"],
      [/\badept\b/gi, "Experten-"], [/\bswift\b/gi, "Schnelligkeits-"], [/\bhale\b/gi, "Rüstigkeits-"], [/\binsightful\b/gi, "Einblick-"], [/\bdefensive\b/gi, "Verteidigungs-"],
      [/\bof fortitude\b/gi, "der Tapferkeit"], [/\bof defen[cs]e\b/gi, "der Verteidigung"], [/\bof shelter\b/gi, "der Zuflucht"], [/\bof warding\b/gi, "der Abwehr"],
      [/\bof enchanting\b/gi, "der Verzauberung"], [/\bof devotion\b/gi, "der Hingabe"], [/\bof endurance\b/gi, "der Ausdauer"], [/\bof valor\b/gi, "der Wertschätzung"], [/\bof mastery\b/gi, "der Beherrschung"],
      [/\bof aptitude\b/gi, "der Begabung"], [/\bof swiftness\b/gi, "der Eile"],
      [/\bof the (necromancer|mesmer|monk|warrior|ranger|elementalist|assassin|ritualist|paragon|dervish)\b/gi, (m, c) => CLS[c.toLowerCase()]],
      [/\bstaff\b/gi, "Stab"], [/\bwand\b/gi, "Zauberstab"], [/\bfocus\b/gi, "Fokus"], [/\bshield set\b/gi, "Schild-Set"], [/\bshield\b/gi, "Schild"], [/\bspear\b/gi, "Speer"], [/\bscythe\b/gi, "Sense"],
      [/\bsword\b/gi, "Schwert"], [/\baxe\b/gi, "Axt"], [/\bdaggers\b/gi, "Dolche"], [/\bbow\b/gi, "Bogen"], [/\bset\b/gi, "Set"], [/\bweapon\b/gi, "Waffe"], [/40\/40 Set\s*$/i, "40/40-Set im Hauptattribut"],
      [/\bsuperior runes of\b/gi, "Überlegene Runen:"], [/\bvigor\b/gi, "Lebenskraft"], [/\binscription\b/gi, "Inschrift"], [/\bhigh energy set\b/gi, "Set mit hoher Energie"], [/\bhigh set\b/gi, "Set mit hoher Energie"],
      [/\bhigh\/low energy set\b/gi, "Sets mit hoher und niedriger Energie"], [/\bmain set\b/gi, "Hauptset"], [/(\d+) insignias?\b/gi, "$1 Befähigungen"], [/\bstaff of (Kanalisierungsmagie|Wiederherstellungsmagie|Todesmagie|Seelensammlung|Beherrschungsmagie|Illusionsmagie|Schnellwirkung)/gi, "Stab des Attributs $1"],
      [/\bfull\b/gi, "5×"], [/(\d+)\^ench(anted)?/gi, "+$1 Lebenspunkte (verzaubert)"], [/(\d+)\s?% ench\b/gi, "$1 % längere Verzauberungen"],
      [/\+(\d+) vs\.? (blunt|piercing|slashing|physical|elemental|fire|cold|lightning|earth)\b/gi, (m, n, t) => "+" + n + " Rüstung gegen " + ({ blunt: "stumpfen ", piercing: "Stich-", slashing: "Hieb-", physical: "physischen ", elemental: "Elementar-", fire: "Feuer-", cold: "Kälte-", lightning: "Blitz-", earth: "Erd-" }[t.toLowerCase()]) + "Schaden"],
      [/\+(\d+) energy\b/gi, "+$1 Energie"], [/\bwhile enchanted\b/gi, "solange verzaubert"], [/\bwhile hexed\b/gi, "solange verhext"], [/\bench\b/gi, "Verzauberung"],
      [/\blongbow\b/gi, "Langbogen"], [/\bshortbow\b/gi, "Kurzbogen"], [/\bflatbow\b/gi, "Flachbogen"], [/\brecurve bow\b/gi, "Recurvebogen"], [/\bhornbow\b/gi, "Hornbogen"],
      [/\bmartial (weapon|waffe)\b/gi, "Nahkampfwaffe"], [/\bcontaining\b/gi, "mit"], [/\barmor\b/gi, "Rüstung"], [/\bhammer\b/gi, "Hammer"],
      [/\bwith an?\b/gi, "mit"], [/\bwith\b/gi, "mit"], [/\bor\b/gi, "oder"], [/\band\b/gi, "und"], [/\bon the headpiece\b/gi, "auf dem Kopfteil"], [/\bbest vigor rune you can afford\b/gi, "die beste bezahlbare"],
      [/\bany\b/gi, "beliebig"], [/\binscription as you see fit\b/gi, "Inschrift nach Wahl"], [/^\s*a\s+/i, " "]
    ];
    R.forEach(([re, to]) => { s = s.replace(re, to); });
    s = s.replace(LIST(ATTR_DE), m => { const k = Object.keys(ATTR_DE).find(x => x.toLowerCase() === m.toLowerCase()); return k ? ATTR_DE[k] : m; });
    s = s.replace(/\bvitae\b/gi, "Rune der Lebenskraft (+10 Leben)").replace(/\battunement\b/gi, "Rune der Einstimmung");
    s = s.replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").trim().replace(/^1x\s*/i, "").replace(/^(\d+)x\s*/i, "$1× ");
    s = s.replace(/([A-Za-zäöüÄÖÜ]+-) (Sense|Schwert|Axt|Hammer|Speer|Dolche|Bogen|Stab|Waffe|Nahkampfwaffe|Langbogen|Kurzbogen|Flachbogen|Zauberstab|Schild|Fokus)/g, "$1$2")
         .replace(/Befähigung (Rüstung|Insignia)\b/g, "Befähigung").replace(/^beliebig /i, "").replace(/\.$/, "");
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  };
  // Zeile ist eine reine Ausrüstungsangabe (kein englischer Erklärtext)?
  GW.equipLineOk = function (de) {
    return !/\b(the|to|for|is|are|you|your|use|when|not|will|be|on|if|try|prefer|should|recommended|against|cast|apply|catch|remove|maintain|raise|under|using|only|also|good|best|otherwise|anything|general|variant|build)\b/i.test(de) && !/\[\[/.test(de);
  };
  // Patchnotizen (Spielupdates) grob ins Deutsche
  const NOUN = [["energy cost","Energiekosten"],["adrenaline cost","Adrenalinkosten"],["recharge time","Wiederaufladezeit"],["recharge","Wiederaufladezeit"],["activation time","Aktivierungszeit"],["activation","Aktivierungszeit"],["AoE damage","Flächenschaden"],["conditional damage","bedingten Schaden"],["damage per energy","Schaden pro Energiepunkt"],["damage per second","Schaden pro Sekunde"],["damage","Schaden"],["effect duration","Wirkungsdauer"],["duration","Dauer"],["healing","Heilung"],["health gain","Lebenspunktgewinn"],["energy gain percentage","Energiegewinn in Prozent"],["energy gain","Energiegewinn"],["armor bonus","Rüstungsbonus"],["block chance","Blockchance"],["energy cost","Energiekosten"],["upkeep","Unterhalt"],["Minimum threshold","Mindestschwelle"]];
  GW.dePatch = function (t) {
    let s = t.replace(/^[^-]+ - /, "").replace(/^[^:]+: /, "");
    s = s.replace(/\b(Reduce|Decrease|Lower)\b/gi, "↓").replace(/\b(Increase)\b/gi, "↑");
    NOUN.forEach(([en, de]) => { s = s.replace(new RegExp("\\b" + en + "\\b", "gi"), de); });
    s = s.replace(/\bfrom ([^,]+?) to ([^,.]+)/gi, "von $1 auf $2").replace(/\breduced from\b/gi, "gesenkt von").replace(/\bto\b/gi, "auf").replace(/\band\b/gi, "und").replace(/\bseconds?\b/gi, "s");
    s = s.replace(/↓\s*([^,]+?)\s+von/g, "$1 gesenkt von").replace(/↑\s*([^,]+?)\s+von/g, "$1 erhöht von");
    s = s.replace(/↓/g, "gesenkt:").replace(/↑/g, "erhöht:");
    if (/\b(the|you|for|each|when|from|is|was|add|adjust|fix|rework|nearby|foes|bug|chance)\b/i.test(s) || /[“"]/.test(s)) return "Überarbeitet, Details im Guild Wars Wiki.";
    return s;
  };
})(typeof window !== "undefined" ? window : globalThis);

// ---------- Schaden pro Sekunde (Dauerwert, gegen 60 Rüstung) ----------
// Regeln laut Guild Wars Wiki: Energie (Seite "Energy", 1 Pip = 1 Energie alle 3 s), Waffen (Seite "Weapon"),
// Angriffstempo (Seite "Attack speed"), Zustände (Seite "Condition": Brennen -7, Blutung -3, Gift -4, Krankheit -4 Pips,
// 1 Pip = 2 Lebenspunkte/s laut Seite "Pip"), Nachwirkzeit von Zaubern 0,75 s (Seite "Aftercast"), Fachkenntnis und Mystik je 4 %/Rang.
(function (G) {
  const GW = G.GW;
  const REGEN = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 2, 10: 4 };
  const WEAP = { 18: ["Axt", 6, 28, 1.33, 1], 19: ["Hammer", 19, 35, 1.75, 1], 20: ["Schwert", 15, 22, 1.33, 1], 25: ["Bogen", 15, 28, 2.025, 1],
                 29: ["Dolche", 7, 17, 1.33, 1], 37: ["Speer", 14, 27, 1.5, 1], 41: ["Sense", 9, 41, 1.5, 3] };
  // Jubiläumswaffen: Waffentyp und Attribut laut Wiki-Seite "Anniversary weapon"
  const ANNIV = { 3: [16, "Hammer"], 4: [6, "Sense"], 1: [17, "Speer"], 2: [23, "Schwert"], 6: [12, "Axt"], 7: [35, "Bogen"], 8: [36, "Bogen"], 10: [44, "Stab"], 9: [40, "Dolche"] };
  const TYPE2ATTR = { "Axt": 18, "Hammer": 19, "Schwert": 20, "Bogen": 25, "Dolche": 29, "Speer": 37, "Sense": 41 };
  const COND = { burning: 7, bleeding: 3, poison: 4, disease: 4 };
  const frac = s => { if (!s) return 0; s = String(s).trim(); const m = { "¼": .25, "½": .5, "¾": .75 }; if (m[s] != null) return m[s];
    if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split("/"); return a / b; } const n = parseFloat(s.replace(",", ".")); return isNaN(n) ? 0 : n; };
  const at = (txt, r) => { const m = String(txt).match(/(-?\d+)\.\.\.(-?\d+)/); if (!m) { const n = parseFloat(txt); return isNaN(n) ? 0 : n; }
    return Math.round(+m[1] + (+m[2] - +m[1]) * Math.min(r, 20) / 15); }; // Wiki "Attribute": Ränge enden bei 20
  const strikeFactor = r => Math.pow(2, ((5 * Math.min(r, 12) + 2 * Math.max(0, r - 12)) - 60) / 40);

  // Wie viele Gegner ein Flächeneffekt trifft. Annahme zur Aufstellung der Gegner (das Wiki nennt nur die Reichweiten "adjacent", "nearby", "in the area"): Neben dem Ziel steht die Hälfte der übrigen Gegner, in der Nähe drei Viertel, im Bereich alle.
  // Flächen-Niederschlag im Team (opts.hold = Anteil der Kampfzeit, in dem die Gruppe am Boden liegt): Laut Wiki können sich niedergeschlagene Gegner nicht bewegen. Sie bleiben so dicht stehen, wie die Gruppe beim Anlaufen stand.
  // Annahme für diese Zeit: drei Viertel der übrigen Gegner neben dem Ziel, alle in der Nähe.
  let ADJS = 0.5, NEARS = 0.75;
  function aoeMul(d, n) {
    const adj = 1 + (n - 1) * ADJS, near = 1 + (n - 1) * NEARS, isAdj = /adjacent/.test(d);
    if (/all other (adjacent|nearby) foes|to (adjacent|nearby) foes whenever target foe/.test(d)) return Math.max(0, (n - 1) * (isAdj ? ADJS : NEARS));
    if (/75% of that damage to (nearby|adjacent)/.test(d)) return 1 + 0.75 * (n - 1) * (isAdj ? ADJS : NEARS);
    if (/to 3 adjacent foes|to up to 3/.test(d)) return Math.min((n - 1) * ADJS, 3) + (/target and/.test(d) ? 1 : 0) || 1;
    if (/foes in the area|in the area/.test(d)) return n;
    if (/(target and (nearby|adjacent|all nearby|all adjacent) foes|all (adjacent|nearby) foes|to (adjacent|nearby) foes|hits foes adjacent|and foes near|also (hexes|hits|affects|strikes) (all )?(adjacent |nearby )?foes|foes (adjacent to|near|nearby)|(adjacent|nearby) foes)/.test(d)) return isAdj ? adj : near;
    return 1;
  }

  // eff: Map Attribut -> Rang inkl. Runen; opts: {targets, weapon:[attr,typ], foeRate, physRate}
  // Diener-Schaden je Treffer gegen Rüstung 60 nach Stufe: Mittelwerte der Messreihen im Wiki (Bone Horror, Bone Fiend, Bone Minion, Shambling Horror, Vampiric Horror, Flesh Golem, Jagged Horror)
  const MINDMG = {"bone horror":{"1":1.0,"2":1.5,"3":3.5,"4":5.0,"5":6.0,"6":7.5,"7":8.5,"8":10.5,"10":15.0,"11":16.0,"12":18.5,"13":21.0,"14":23.0,"15":24.0,"16":27.0,"17":29.0,"18":33.0,"19":35.0,"20":38.0,"21":40.0,"22":43.5,"23":46.0},"bone fiend":{"1":1.0,"2":2.0,"3":3.0,"4":4.0,"5":6.0,"6":7.5,"7":9.0,"8":11.0,"10":15.0,"11":16.5,"12":19.0,"13":20.5,"14":23.5,"15":24.5,"16":27.5,"17":29.5,"18":33.0,"19":35.0,"20":38.0,"21":40.0,"22":43.5,"23":46.0},"bone minion":{"0":0.0,"1":1.0,"2":1.5,"3":2.0,"4":3.0,"5":4.0,"6":5.5,"7":6.0,"8":7.5,"9":8.5,"10":10.5,"11":11.0,"12":13.0,"13":14.0,"14":15.5,"15":17.0,"16":18.5,"17":20.0},"shambling horror":{"1":1.0,"2":1.5,"3":2.5,"4":3.0,"5":4.0,"6":4.5,"7":7.5,"8":8.5,"10":11.5,"11":13.5,"12":14.5,"13":18.0,"14":20.0,"15":22.5,"16":24.5,"17":27.0,"18":31.0,"19":34.5,"20":37.5,"21":41.0,"22":43.0,"23":46.5},"vampiric horror":{"1":1.0,"2":2.0,"3":3.5,"4":5.0,"5":6.0,"6":6.0,"7":7.5,"8":10.5,"10":15.5,"11":16.5,"12":18.5,"13":20.5,"14":21.5,"15":24.0,"16":28.5,"17":29.5,"18":32.0,"19":34.5,"20":38.5,"21":40.0,"22":43.5,"23":46.0},"flesh golem":{"3":7.5,"4":12.0,"6":14.5,"7":19.5,"9":25.0,"10":30.5,"12":34.5,"13":38.0,"15":50.5,"16":54.0,"18":64.0,"19":68.5,"21":77.5,"22":81.5,"24":89.0,"25":91.0,"26":94.5,"28":105.5,"29":112.5,"31":117.0,"32":128.0,"34":139.0},"jagged horror":{"0":0.0,"1":1.0,"2":1.5,"3":2.5,"4":3.5,"5":4.0,"6":5.0,"7":6.0,"8":6.5,"9":8.5,"10":11.5,"11":12.5,"12":15.0,"13":17.0,"14":18.5,"15":21.5,"16":24.0,"17":27.5,"18":29.5,"19":33.0,"20":36.5,"21":40.0}};
  const minionMean = (kind, L) => { const t = MINDMG[kind]; if (!t) return 1.53 * L; const ks = Object.keys(t).map(Number).sort((a, b) => a - b); if (L <= ks[0]) return t[ks[0]]; if (L >= ks[ks.length - 1]) return t[ks[ks.length - 1]]; let lo = ks[0], hi = ks[ks.length - 1]; for (const k of ks) { if (k <= L) lo = k; if (k >= L) { hi = k; break; } } return lo === hi ? t[lo] : t[lo] + (t[hi] - t[lo]) * (L - lo) / (hi - lo); };
  GW.dps = function (bar, eff, opts) { const h = Math.max(0, Math.min(1, (opts && opts.hold) || 0)); ADJS = 0.5 + 0.25 * h; NEARS = 0.75 + 0.25 * h; HOLD = h; try { return dpsCore(bar, eff, opts); } finally { ADJS = 0.5; NEARS = 0.75; HOLD = 0; } };
  let HOLD = 0;
  const dpsCore = function (bar, eff, opts) {
    const n = opts.targets || 1, out = [], notes = [];
    let fcUsed = false, fleeUsed = false, heldUsed = false, scatter = 0;

    const ADOT = new Set(["Kirin's Wrath", "Ray of Judgment", "Symbol of Wrath", "Mystic Sandstorm", "Sandstorm", "Savannah Heat", "Searing Heat", "Bed of Coals", "Breath of Fire", "Celestial Storm", "Eruption", "Fire Storm", "Lava Font", "Maelstrom", "Unsteady Ground", "Chaos Storm", "Snow Storm", "Churning Earth", "Meteor Shower", "Balthazar's Aura", "Storm of Swords"]);
    const SNARE = new Set(["Deep Freeze", "Grasping Earth", "Frozen Burst", "Ice Spikes", "Teinai's Prison"]);
    const INC = n * (opts.foeDps || 40);
    // Zielrüstung (Wiki "Armor rating"): je 40 Rüstung halbiert sich rüstungsabhängiger Schaden, 60 ist die Basis
    const AR0 = opts.armor || 60, crack = opts.crack != null ? opts.crack : GW.crackOf(bar, eff, n), AR = AR0 > 60 ? Math.max(60, AR0 - 20 * crack) : AR0, af = Math.pow(2, (60 - AR) / 40), afAir = Math.pow(2, (60 - AR * 0.75) / 40);
    if (crack > 0.02 && AR0 > 60) notes.push("Rüstungsbruch: Die Gegner tragen ihn " + Math.round(crack * 100) + " % der Zeit, gerechnet mit Rüstung " + Math.round(AR) + " statt " + AR0 + " (Wiki: −20, nie unter 60).");
    const armorOf = (x, air) => { const m = x.match(/\d (fire|cold|lightning|earth|slashing|piercing|blunt|physical|chaos|dark) damage/); return !m ? 1 : m[1] === "lightning" && air ? afAir : af; }; // 25 % Rüstungsdurchdringung haben nur Luftmagie-Zauber (Wiki "Armor penetration")
    const boost = new Map(); const rank = a => Math.min(20, (eff.get(a) || 0) + (boost.get(a) || 0));
    const sk = bar.skills.map((id, i) => [i, GW.skill(id)]).filter(x => x[1]);
    // Derwisch: Fertigkeiten, die eine eigene Derwisch-Verzauberung entfernen, wirken voll, solange genug Verzauberungen nachkommen. Fromme Erneuerung lädt sich beim Enden selbst wieder auf und liefert deshalb immer eine.
    const TEARRX = /(removes?|lose) (1|one|a) (of your )?dervish enchantments?/i;
    const dEnch = sk.map(x => x[1]).filter(x => x.p === 10 && /enchantment/i.test(x.t)), hasPR = dEnch.some(x => x.n === "Pious Renewal");
    const tearSk = sk.map(x => x[1]).filter(x => x.p === 10 && TEARRX.test(x.d || ""));
    const tSupply = hasPR ? 9 : dEnch.reduce((a, x) => a + 1 / Math.max(1, frac(x.rc) + frac(x.ac)), 0), tDemand = tearSk.reduce((a, x) => a + 1 / Math.max(2, /A$/.test(String(x.cost)) ? 6 : frac(x.rc) * 0.5 + 1), 0);
    const isMaint0 = x => /enchantment spell/i.test(x.t) && !/\d+(\.\.\.\d+)?\)? seconds?/.test(x.d || "") && !/next \d|ends after/i.test(x.d || "");
    const hasHB = sk.some(x => x[1].n === "Healer's Boon");
    const hasSk = nm => sk.some(x => x[1].n.replace(/ \((Kurzick|Luxon|PvP)\)$/, "") === nm);
    // Verstärker für Attributränge (Wiki-Texte), gewichtet mit ihrer Laufzeit: Masochismus +2 Todesmagie und Seelensammlung, Erwecktes Blut +2 Blutmagie und Flüche, Elementarherr +1 auf die Elementarattribute
    { const upOf = (nm, range, a) => { const x = sk.find(y => y[1].n.replace(/ \((Kurzick|Luxon)\)$/, "") === nm); if (!x) return 0; const D = at(range, a < 0 ? 15 : (eff.get(a) || 0)); return Math.min(1, D / Math.max(1, frac(x[1].rc) + frac(x[1].ac))); };
      const add = (ids, v, lab) => { if (v > 0.05) { ids.forEach(a => { if (eff.get(a) > 0) boost.set(a, (boost.get(a) || 0) + v); }); notes.push(lab + ": zählt als +" + v.toFixed(1) + " Rang (mit Laufzeit gewichtet)."); } };
      add([5, 6], 2 * upOf("Masochism", "10...40", 6), "Masochismus"); add([4, 7], 2 * upOf("Awaken the Blood", "20...44", 4), "Erwecktes Blut"); add([8, 9, 10, 11], upOf("Elemental Lord", "40...60", -1), "Elementarherr"); }
    // Gegner im schweren Modus (Wiki "Hard mode", "Damage calculation"): Angriffe treffen einen Zauberer mit Rüstung 60 für rund 28, Fertigkeiten für rund 95. Elite-Gebiete: 34 und 125. Je die Hälfte des Schadens kommt aus Angriffen und aus Fertigkeiten.
    // Normaler Modus (Wiki): Gegner Stufe 20, Angriffe ohne den Tempo-Bonus des schweren Modus, Fertigkeiten ohne Stufenzuschlag: Angriff rund 20, Fertigkeit rund 70
    const ELITE = (opts.foeDps || 40) > 50, NM = (opts.foeDps || 40) < 30, SMALL = ELITE ? 34 : NM ? 20 : 28, BIG = ELITE ? 125 : NM ? 70 : 95, MAXHP0 = 480;
    const FOE_ATK = NM ? 0.42 : 0.55, FOE_SKILL = NM ? 0.2 : 0.25, FOE_SPELL = NM ? 0.12 : 0.15; // Aktionen je Gegner und Sekunde. Schwerer Modus: Nahkämpfer 0,8 Angriffe (1,33 s Schwert, +33 %), Zauberer 0,3 mit dem Stab zwischen den Zaubern; eine Fertigkeit alle 4 s; Zauber nur von der Hälfte der Gegner. Normaler Modus: ohne die 33 %, eine Fertigkeit alle 5 s.
    const stN = hasSk("Soul Twisting") ? at("1...3", rank(36)) : 0, nRit = sk.filter(x => /binding ritual/i.test(x[1].t)).length;
    const aouF = hasSk("Armor of Unfeeling") ? 1 - 0.5 * 0.75 : 1; // Rüstung der Gefühllosigkeit halbiert, was Geister einstecken; sie trifft nur Geister, die beim Wirken schon stehen (75 % angenommen)
    const TEAR = tDemand ? Math.min(1, tSupply / tDemand) : 0;
    // Waffe bestimmen
    let w = null, wAttr = null;
    const best = [...eff].filter(a => WEAP[a[0]]).sort((a, b) => b[1] - a[1])[0];
    const atkSkills = sk.filter(x => x[1].tags.has("atk"));
    const typeW = { scythe: 41, sword: 20, axe: 18, hammer: 19, spear: 37, bow: 25, dagger: 29, "lead attack": 29, "off-hand": 29, "dual attack": 29 };
    const fromSkill = atkSkills.map(x => Object.entries(typeW).find(([k]) => x[1].t.toLowerCase().includes(k))).filter(Boolean)[0];
    if (fromSkill && !(best && best[1] >= 5 && best[0] !== fromSkill[1])) { wAttr = fromSkill[1]; w = WEAP[wAttr]; }
    else if (best && best[1] >= 5) { wAttr = best[0]; w = WEAP[wAttr]; }
    if (opts.weapon && (!w || rank(wAttr) < 5)) { wAttr = opts.weapon[0]; const t = TYPE2ATTR[opts.weapon[1]]; w = t ? WEAP[t] : ["Stab", 11, 22, 1.75, 1]; notes.push("Jubiläumswaffe angenommen: " + w[0] + " mit " + (GW.ATTR[wAttr] || "") + "."); }
    else if (!w && atkSkills.length >= 2 && ANNIV[bar.pri] && sk.some(x => x[1].e && x[1].pve && x[1].tags.has("atk"))) {
      wAttr = ANNIV[bar.pri][0]; const t = TYPE2ATTR[ANNIV[bar.pri][1]]; w = t ? WEAP[t] : ["Stab", 11, 22, 1.75, 1]; notes.push("Jubiläumswaffe angenommen: " + w[0] + ".");
    }
    // Angriffstempo (Wiki "Attack speed"): "X % schneller" verkürzt die Angriffsdauer um X %, höchstens 33 %
    // Wie oft im Kampf eine Kreatur stirbt: im Team aus dem Teamschaden gerechnet (GW.teamDps), für eine einzelne Leiste ohne Team alle 6 s (Annahme)
    const DEATH = opts.death || 1 / 6;
    const CORPSE = DEATH * (opts.corpseShare || 1); // Leichen teilen sich alle im Team, die welche brauchen
    // Ein Kampf gegen n Gegner dauert n / DEATH Sekunden, ein einzelner Gegner lebt im Schnitt (n+1)/(2n) davon. Wirkt eine Verhexung oder ein Zustand länger, als das Ziel noch lebt, verfällt der Rest.
    const FIGHT = n / DEATH, FOELIFE = FIGHT * (n + 1) / (2 * n), emin = D => D <= 0 ? 0 : D < FOELIFE ? D * (1 - D / (2 * FOELIFE)) : FOELIFE / 2;
    let ias = 0, petIas = 0, critBonus = 0, wPer = 0, hitEnergy = 0, critEnergy = 0, zealHits = 0;
    for (const [i, s] of sk) {
      const dl = (s.d || "").toLowerCase(), tr = /rank$/.test(s.a || "") ? 15 : rank(s.aid);
      const du = dl.match(/\((\d+(?:\.\.\.\d+)?) seconds?(?:\[s\])?\.?\)/), dur0 = du ? at(du[1], tr) : 0;
      const up = /A$/.test(String(s.cost || "")) ? 1 : dur0 ? Math.min(1, dur0 / Math.max(dur0, frac(s.rc) + frac(s.ac))) : 1;
      const me = dl.match(/you (?:and your pet )?(?:move and )?attack (\d+(?:\.\.\.\d+)?)% faster/) || dl.match(/while wielding \w+, you attack (\d+(?:\.\.\.\d+)?)% faster/);
      if (me) ias = Math.max(ias, Math.min(33, at(me[1], tr)) * up);
      const eh = dl.match(/gain (\d+(?:\.\.\.\d+)?) energy (?:whenever|each time|every time) you (?:successfully )?(?:hit|land a hit|attack|strike)/);
      if (eh) hitEnergy += at(eh[1], tr) * up;
      const ec = dl.match(/gain (\d+(?:\.\.\.\d+)?) energy whenever you land a critical hit/);
      if (ec) critEnergy += at(ec[1], tr) * up;
      const cb = dl.match(/\+(\d+(?:\.\.\.\d+)?)% chance to land a critical hit/);
      if (cb) critBonus = Math.max(critBonus, at(cb[1], tr) / 100 * up);
      const pe = dl.match(/your pet (?:moves and )?attacks (\d+(?:\.\.\.\d+)?)% faster/) || dl.match(/you and your pet attack (\d+(?:\.\.\.\d+)?)% faster/);
      if (pe) petIas = Math.max(petIas, Math.min(33, at(pe[1], tr)) * up);
    }
    let attackRate = 0, wIdx = -1;
    if (w) {
      const r = rank(wAttr), avg = (w[1] + w[2]) / 2, wc = r <= 4 ? 0.01 + 0.0105 * r : 0.052 + 0.01575 * (r - 4), cs = bar.pri === 7 ? rank(35) / 100 : 0, crit = Math.min(1, 1 - (1 - Math.min(wc, 0.3)) * (1 - cs) * (1 - critBonus));
      // Waffe angepasst (+20 %, Wiki "Customize") und mit Inschrift "15 % Schaden über 50 % Lebenspunkte" (zu 90 % aktiv, Annahme): Standard bei allen Leisten
      let per = ((1 - crit) * avg + crit * w[2] * Math.SQRT2) * strikeFactor(r) * 1.2 * (1 + 0.15 * 0.9);
      wPer = per;
      if (w[0] === "Dolche") per *= 1 + (0.02 + 0.02 * r);
      notes.push("Kritische Treffer: Chance nach Spieler-Messung im Wiki (etwa 18 % bei Rang 12), bei Assassinen plus 1 % je Rang Kritische Stöße.");
      const melee = !/Bogen|Speer|Stab/.test(w[0]), reach = melee ? FIGHT / (FIGHT + 2) : 1; // Nahkämpfer laufen je Kampf rund 2 s zum Gegner (Annahme; Wiki "Hero behavior": Nahkampfhelden verlieren Schaden durch Laufwege)
      attackRate = reach / (w[3] * (1 - ias / 100));
      const hits = w[4] > 1 ? Math.min(w[4], 1 + (n - 1) * ADJS) : 1; // Sense: Die Hälfte der übrigen Gegner steht neben dem Ziel
      wIdx = out.length;
      per *= af; wPer *= af;
      out.push({ name: "Normale Angriffe (" + w[0] + ")", dps: per * attackRate * hits, kind: "Waffe", detail: Math.round(per) + " je Treffer, alle " + (1 / attackRate).toFixed(2) + " s" + (ias ? " (Angriffstempo +" + Math.round(ias) + " %)" : "") + (hits > 1 ? ", " + hits.toFixed(1) + " Ziele" : "") + (melee ? ", " + Math.round(reach * 100) + " % der Zeit am Gegner" : "") });
      var critChance = crit;
      // Waffen-Aufwertung, wenn die Ausrüstungsempfehlung der Leiste sie nennt (Wiki "Vampiric", "Zealous", "Sundering")
      if (opts.wmod === "vamp") { const two = /Bogen|Hammer|Sense/.test(w[0]), v = (two ? 5 : 3) * attackRate * hits; out.push({ name: "Vampir-Aufwertung", dps: v, cat: "dmg", kind: "Waffe", detail: (two ? 5 : 3) + " Lebensentzug je Treffer, rüstungsignorierend" }); const hv = Math.max(0, v - 2); if (hv > 0.05) out.push({ name: "Vampir-Aufwertung", dps: hv, cat: "heal", kind: "Heilung", detail: "Lebensentzug heilt den Träger, abzüglich 1 Pip Lebenspunkte-Degeneration (2/s)" }); }
      if (opts.wmod === "sund") { const k = 1 + 0.2 * (Math.pow(2, 0.2 * AR / 40) - 1); out[wIdx].dps *= k; out[wIdx].detail += ", Trenn-Aufwertung: 20 % Rüstungsdurchdringung bei jedem fünften Treffer"; }
      if (opts.wmod === "zeal") zealHits = attackRate * hits;
    }
    // Energie
    let pips = REGEN[bar.pri] || 2;
    // Aufrechterhaltene Verzauberungen (ohne Dauer und Aufladezeit) kosten je 1 Pip Energieregeneration (Wiki "Maintained enchantment")
    const isMaint = x => /enchantment spell/i.test(x.t) && !/\d+(\.\.\.\d+)?\)? seconds?/.test(x.d || "") && !/next \d|ends after/i.test(x.d || "");
    const maint = sk.filter(x => isMaint(x[1])).length; if (maint) { pips -= maint; notes.push(maint + " aufrechterhaltene Verzauberung" + (maint > 1 ? "en kosten" : " kostet") + " zusammen " + maint + " Pip Energieregeneration."); }
    if (opts.wmod === "zeal" && w) pips -= 1; // Eifer-Aufwertung: Energieregeneration −1 (Wiki "Zealous")
    const income = pips / 3;
    const uses = [], minions = []; let usedTitle = false;
    for (const [i, s] of sk) {
      // Zwei gleiche Geister können nicht nebeneinander stehen (Wiki "Spirit"): Was ein anderer im Team schon setzt, zählt hier nicht noch einmal
      // "Fall Back!" ist ein Laufruf: Laut Wiki nutzen Helden ihn, um die Gruppe schneller zu machen, auch außerhalb des Kampfes beim Loslaufen. Annahme nach Spielbeobachtung: Im Kampf wird er nicht gerufen, also weder Heilung noch Energiekosten.
      // Schaden, der nur bei einem seltenen Auslöser fällt (Wiki): "Brace Yourself!" erst, wenn ein Niederschlag verhindert wird, Judge's Intervention erst, wenn tödlicher Schaden abgewendet wird. Im Dauerwert nicht gezählt.
      if (/prevents the next knock-?down and deals|negation effect: deals/i.test(s.d || "")) { notes.push((s.de || s.n) + " macht nur Schaden, wenn der Auslöser eintritt (verhinderter Niederschlag oder abgewendeter Tod). Im Dauerwert nicht gezählt."); continue; }
      if (/^"Fall Back!"/.test(s.n)) { notes.push((s.de || s.n) + " ist ein Laufruf für den Weg zwischen den Kämpfen. Im Kampf nicht gezählt, auch nicht bei der Energie."); continue; }
      if (opts.skip && opts.skip.has(s.id)) { notes.push((s.de || s.n) + " setzt schon jemand anders im Team. Zwei gleiche Geister verdrängen sich, deshalb hier nicht gezählt."); continue; }
      const dRaw = (s.d || "").toLowerCase(), dd = (s.dd || "");
      // Schaden an eigenen Geistern und Verstärkungen für Verbündete zählen nicht als Schaden am Gegner
      const d = dRaw.replace(/(this spirit|the spirit) (takes|loses) \d+(\.\.\.\d+)? (damage|health)/g, "").replace(/(its attacks|these spirits|attacks) deal \d+(\.\.\.\d+)? damage/g, "").replace(/(target (other )?ally|allies|party members)[^.]*deals? (\+)?\d+(\.\.\.\d+)? (more )?damage[^.]*/g, "");
      let ac = frac(s.ac), rc = frac(s.rc);
      // Schnellwirkung (Wiki "Fast Casting"): Wirkzeit von Zaubern und Siegeln halbiert sich bis Rang 15, fremde Fertigkeiten unter 2 s bleiben. In PvE laden Mesmer-Zauber je Rang 3 % schneller auf.
      if (bar.pri === 5 && rank(0) > 0 && /spell|signet/i.test(s.t)) {
        if (s.p === 5 || ac >= 2) ac *= Math.pow(0.5, rank(0) / 15);
        if (s.p === 5 && /spell/i.test(s.t)) rc *= Math.max(0.4, 1 - 0.03 * rank(0));
        fcUsed = true;
      }
      if (hasHB && s.aid === 13 && /spell/i.test(s.t)) ac *= 0.5; // Healer's Boon: Heilgebete wirken 50 % schneller
      if (stN && /binding ritual/i.test(s.t)) rc = Math.min(rc, 15 * Math.max(1, nRit / stN)); // Seelenverflechtung (Aufladezeit 15 s) lädt 1...3 Rituale sofort wieder auf
      if (hasSk("Ritual Lord") && /binding ritual/i.test(s.t)) rc *= 1 - at("10...60", rank(36)) / 100; // Wiki: Binderituale laden 10...60 % schneller
      if (hasSk("Serpent's Quickness")) rc *= 1 - 0.33 * Math.min(1, at("15...30", rank(24)) / 45);
      const tear = s.p === 10 && TEARRX.test(d);
      if (tear) { const m = d.match(/recharges (\d+)% faster/); if (m) rc *= 1 - (+m[1] / 100) * TEAR; }
      const spell = /spell|signet|ritual|chant|shout|echo|well|glyph/i.test(s.t) && !/attack/i.test(s.t);
      const T = Math.max(0.25, rc + ac + (/spell/i.test(s.t) ? 0.75 : 0));
      const durM = d.match(/\((\d+(?:\.\.\.\d+)?) seconds?(?:\[s\])?\.?\)/);
      // Macht des Herbeirufens (Wiki "Spawning Power"): Waffenzauber halten je Rang 4 % länger
      const dur = (durM ? at(durM[1], rank(s.aid)) : 0) * (bar.pri === 8 && /weapon spell/i.test(s.t) ? 1 + 0.04 * rank(36) : 1);
      const title = /rank$/.test(s.a || "");
      const r = title ? 15 : rank(s.aid);
      if (title) usedTitle = true;
      const c = String(s.cost || "");
      let cost = /E$/.test(c) ? parseFloat(c) : 0, adr = /A$/.test(c) ? parseFloat(c) : 0;
      if (cost && bar.pri === 2 && (/attack|ritual|touch/i.test(s.t + " " + d) || s.p === 2)) cost *= 1 - 0.04 * rank(23);
      if (cost && bar.pri === 10 && s.p === 10 && /enchant/i.test(s.t)) cost *= 1 - 0.04 * rank(44);
      if (cost && stN && /binding ritual/i.test(s.t)) cost = Math.max(5, cost - 15);
      // Kostenminderer (Wiki-Texte), mit ihrer Laufzeit gewichtet
      if (cost) { const upS = (nm, rng, a) => { const x = sk.find(y => y[1].n.replace(/ \((Kurzick|Luxon)\)$/, "") === nm); if (!x) return 0; return Math.min(1, at(rng, a < 0 ? 15 : rank(a)) / Math.max(1, frac(x[1].rc) + frac(x[1].ac))); };
        if (/spell|ritual/i.test(s.t) && hasSk("Attuned Was Songkai")) cost *= 1 - (at("5...50", rank(36)) / 100) * upS("Attuned Was Songkai", "45", 36);
        if (s.p === 4 && /spell/i.test(s.t) && hasSk("Cultist's Fervor")) cost = Math.max(1, cost - at("1...6", rank(4)) * Math.min(1, (5 + 3 * rank(6)) / 26));
        if (/spell/i.test(s.t) && /target ally|other ally|target other/.test(dRaw) && hasSk("Selfless Spirit")) cost = Math.max(1, cost - 3 * upS("Selfless Spirit", "15...20", -1));
        if (/bow attack/i.test(s.t) && hasSk("Expert Focus")) cost = Math.max(1, cost - at("1...2", rank(23)) * upS("Expert Focus", "24", 23)); }
      const parts = [];
      const sents = d.split(/(?<=[.:)]) /);
      const aoeAll = /(^|[.:)] )(also (hits|affects|strikes|hexes)|hits (\d+ )?(foes|all)|affects (foes|all)|strikes (foes|all))/.test(d);
      const aoeAt = rx => { const x = sents.find(q => rx.test(q)); const v = aoeMul(x || d, n) || 1; return v === 1 && aoeAll ? (aoeMul(d, n) || 1) : v; };
      // Bedingter Schaden (nur wenn der Gegner gerade zaubert, angreift oder eine Fertigkeit nutzt): halbe Trefferquote angenommen
      // Bedingte Fertigkeiten. Unterbrechungen und "wenn der Gegner gerade angreift oder zaubert": Helden reagieren laut Wiki ("Hero behavior") ohne Verzögerung, sie warten nur auf die Gelegenheit. Die Wartezeit ergibt sich aus der Zahl der Gegner und wie oft sie so etwas tun.
      const waitFor = lam => T / (T + 1 / Math.max(0.05, (opts.hero ? 1 : n) * lam)); // Helden unterbrechen laut Wiki fast nur an ihrem festgelegten Ziel, der Spieler sucht sich die Gelegenheit unter allen Gegnern
      const oppAtk = /interrupts? (target foe's )?(next )?(an )?attack|if target foe is attacking|unless hexed foe attacks|interrupts next attack/.test(d), oppSpell = /interrupts? (a |target foe's )?(next )?(spell|chant)|if target foe is casting|the next spell that target foe/.test(d), oppAny = /interrupts? (an |target foe's )?(action|skill)|if target foe is (using|activating)|interruption effect:|if that action was|if target foe was (casting|attacking)|the next (skill|attack)[^.]*that target foe/.test(d);
      const condP = tear ? 1 : oppAtk ? waitFor(FOE_ATK) : oppSpell ? waitFor(FOE_SPELL) : oppAny ? waitFor(FOE_SKILL) : /removal effect:|if (a|an|that) (condition|hex|enchantment) (is|was) removed|for each (condition|hex) removed/.test(d) ? (/foe loses \d+(\.\.\.\d+)? enchantment|enchantments? from target foe/.test(d) ? 0.3 : 0.5) : 1;
      // Energiegewinn der Fertigkeit selbst
      let gain = 0;
      const gm = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) energy(?! (?:whenever|when|each time|for each|every))/) || dRaw.match(/health and (\d+(?:\.\.\.\d+)?) energy/);
      if (gm) gain = at(gm[1], r) * (condP < 1 ? 1 : / if |interrupt/.test(dRaw) ? 0.5 : 1);
      const el2 = dRaw.match(/causes (\d+(?:\.\.\.\d+)?) energy loss\. you gain (\d+) energy for each/); if (el2) gain = at(el2[1], r) * +el2[2];
      // Weitere Energiegewinne aus dem Text (Wiki): je getroffenem Gegner, je Verbündetem in der Nähe, je erschaffener Kreatur, vom eigenen Geist
      if (!gm && !el2) { let m;
        if ((m = dRaw.match(/gain (\d+(?:\.\.\.\d+)?) energy(?: and \d+ adrenaline)? for each foe (?:you hit|struck|hit)/))) gain += at(m[1], r) * Math.min(/scythe/i.test(s.t) ? 3 : n, n);
        else if ((m = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) energy \(maximum (\d+(?:\.\.\.\d+)?) energy\) for each nearby ally/))) gain += Math.min(at(m[2], r), at(m[1], r) * Math.max(1, Math.round((opts.allies || 8) / 2)));
        else if ((m = dRaw.match(/gain (\d+) energy \(maximum (\d+(?:\.\.\.\d+)?) energy\) for each summoned creature/))) { if (sk.some(x => /binding ritual/i.test(x[1].t) || /animate|creates? \d? ?level/i.test(x[1].d || "") || x[1].n === "Signet of Spirits")) gain += at(m[2], r); }
        else if ((m = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?)% of that energy/)) && /spirit nearest you/.test(dRaw)) { if (sk.some(x => /binding ritual/i.test(x[1].t) || x[1].n === "Signet of Spirits")) gain += 31 * at(m[1], r) / 100; } // Wiki "Spirit": Geister haben 31 Energie
        else if ((m = dRaw.match(/(?:^|[.;] ?)(?:you )?gain (\d+(?:\.\.\.\d+)?) energy(?! (?:whenever|when|each time|for each|every|regeneration|\())([^.]*)/))) gain += at(m[1], r) * (/ if |unless/.test(m[2]) ? 0.5 : 1); }
      if (s.n === "Blessed Signet") gain += Math.min(at("3...24", r), 3 * sk.filter(x => isMaint0(x[1])).length);
      if (bar.pri === 9 && /shout|chant/i.test(s.t)) gain += Math.min(2 * (opts.allies || 8), Math.floor(rank(40) / 2));
      if (tear && hasPR) { cost += 5 * (1 - 0.04 * rank(44)); gain += at("0...5", rank(44)); } // Fromme Erneuerung wird nach jedem Entfernen neu gewirkt und gibt beim Enden Energie zurück
      // Zustände
      for (const [k, p] of Object.entries(COND)) {
        const m = d.match(new RegExp("(inflicts?|causes?|suffers?|take|bleeding|burning|poison|disease)[^.]*?" + k + "\\w*(?: condition)? \\((\\d+(?:\\.\\.\\.\\d+)?) seconds?"));
        if (m) { const cd = at(m[2], r); parts.push({ kind: "Zustand", per: p * 2 * cd, dur: cd, aoe: aoeAt(new RegExp(k + "\\w*(?: condition)? \\(")), label: { burning: "Brennen", bleeding: "Blutung", poison: "Gift", disease: "Krankheit" }[k] }); }
      }
      // Verhexungs-Degeneration
      const hd = d.match(/(-?\d+\.\.\.\d+|\d+) health degeneration/);
      if (hd && /hex/i.test(s.t)) { const p = Math.abs(at(hd[1], r)); parts.push({ kind: "Degeneration", per: p * 2 * (dur || 1), dur: dur || 1, aoe: aoeAt(/health degeneration/), label: "Lebenspunkte-Degeneration" }); }
      { const hd2 = !/hex/i.test(s.t) && d.match(/causes -?(\d+(?:\.\.\.\d+)?) health degeneration \((\d+) seconds\)/); if (hd2) { const p = at(hd2[1], r), D = +hd2[2]; parts.push({ kind: "Degeneration", per: p * 2 * D * (/if target foe (had|has)/.test(d) ? 0.5 : 1), dur: D, aoe: aoeMul(d, n) || 1, label: "Lebenspunkte-Degeneration " + D + " s" }); } }
      // Direktschaden
      let dm = null;
      if (/for each point of energy lost/.test(d)) { const el = d.match(/causes (\d+\.\.\.\d+) energy loss/); const per = d.match(/deals (\d+) damage[^.]*for each point/); if (el && per) dm = at(el[1], r) * +per[1]; }
      if (dm == null) { const m = d.match(/(?:deals?|causes?|take|takes) \+?(\d+(?:\.\.\.\d+)?) (?:(?!less |more |fewer )\w+ )?damage/); if (m) dm = at(m[1], r); }
      if (dm == null && !/(its attacks|these spirits) (deal|steal)/.test(dRaw)) { const m = dd.match(/\+?(\d+\.\.\.\d+) Punkte (?:\w+ )?(?:Sakral-|Feuer|Kälte|Blitz|Erd|Dunkel|Chaos|heiligen )?Schaden/); if (m) dm = at(m[1], r); }
      const dmS = (d.split(/(?<=[.:)]) /).find(x => /(?:deals?|causes?|take|takes) \+?\d+(?:\.\.\.\d+)? (?:(?!less |more |fewer )\w+ )?damage/.test(x)) || d);
      const perAttack0 = /whenever you attack|when you attack|attacks deal|your attacks|whenever you hit|next \d+ attacks?/.test(dmS) || (dm != null && !/(?:deals?|causes?|take|takes) \+?\d/.test(d) && /Angriffe (verursachen|richten)/.test(dd));
      // Schadensrückwurf und Lebenspunktverlust am Gegner: Spoil Victor, Pain Inverter (höchstens 80 je Treffer des Gegners)
      if (dm == null) { const m = d.match(/causes (\d+(?:\.\.\.\d+)?) health loss whenever/); if (m) dm = at(m[1], r); }
      if (dm == null && /back to target foe every time it does damage/.test(d)) dm = 80;
      const onFoe = /whenever (this|target) foe (attacks|uses a skill|takes physical damage)|whenever it takes physical damage|with each attack|whenever (it|they) (casts?|uses?|attacks?) |health loss whenever target foe|every time it does damage/.test(d);
      const perAttack = perAttack0 && !onFoe;
      const onDeath = /if (target|this|that) (foe|ally|creature) dies|whenever [^.]* dies|exploits? (a|the|nearest) |corpse/.test(d);
      const endsK = d.match(/ends after (\d+(?:\.\.\.\d+)?) (?:hit|attack)/);
      if (dm != null) dm = dm * armorOf(dmS, s.aid === 8);
      const every = d.match(/(?:every|each) second \((\d+) seconds?\)/);
          // Flächenschaden über Zeit löst Auseinanderlaufen aus (Wiki "Scatter", "Area damage over time"). Laut guildwiki.de "Künstliche Intelligenz" verteilen sich NSC nach zwei bis drei Schadenspulsen: Gezählt werden 3 Pulse.
          // Ausnahme: Der Zauber wirft selbst um, oder im Team gibt es eine Flächen-Verlangsamung. Dann kommen die Gegner kaum vom Fleck (guildwiki.de, Beispiel Geistige Erfrierung).
          const adot = every && (ADOT.has(s.n.replace(/ \(PvP\)$/, "")) || /initial location|to location of|your location/.test(d));
          const held = /knock/.test(d) || opts.snare || sk.some(x => SNARE.has(x[1].n));
          const fl0 = adot && !held ? Math.min(1, 3 / +every[1]) : 1, flee = fl0 + (1 - fl0) * HOLD; if (flee < 1) fleeUsed = true; if (adot && held) heldUsed = true;
          if (adot && !held) scatter += 1;
      if (/allies in this ward deal/.test(dRaw)) dm = null;
      if (dm != null && dm > 0) {
        const allyW = /weapon spell/i.test(s.t) && d.match(/ends after (\d+(?:\.\.\.\d+)?) attack/);
        if (allyW) {
          const k = at(allyW[1], r);
          parts.push({ kind: "Waffenzauber", per: dm * k, dur: 0, aoe: /to \d+ adjacent foes/.test(d) ? Math.min(+(d.match(/to (\d+) adjacent foes/) || [0, 3])[1], (n - 1) * ADJS) : aoeMul(d, n), limit: (opts.physRate != null ? opts.physRate : attackRate) / Math.max(1, k), label: "Waffenzauber auf Verbündete, " + k + " Angriffe" });
        } else if (perAttack && !/attack/i.test(s.t) && endsK) {
          const k = at(endsK[1], r);
          parts.push({ kind: "Direkt", per: dm * k, dur: 0, aoe: aoeMul(d, n), limit: attackRate / Math.max(1, k), label: "je Treffer, endet nach " + k + " Treffern" });
        } else if (perAttack && !/attack/i.test(s.t)) {
          parts.push({ kind: "Pro Angriff", perAttack: Math.round(dm), dur: dur || 10, aoe: aoeMul(d, n), label: "Schaden je Angriff" });
        } else if (onFoe) {
          const phys = /physical damage/.test(d);
          // nur Zauber oder nur gegen schwächere Ziele: Der Auslöser greift seltener, halb gezählt
          const fr = /casts? a spell/.test(d) && !/attacks/.test(d) ? FOE_SPELL : /uses? a skill/.test(d) && !/attacks/.test(d) ? FOE_SKILL : /attacks or (casts|uses)/.test(d) ? FOE_ATK + FOE_SKILL : FOE_ATK;
          const rate = phys ? (opts.physRate != null ? opts.physRate : attackRate) : fr * (/with less health/.test(d) ? 0.5 : 1);
          const live = 1;
          parts.push({ kind: "Ausgelöst", per: dm * rate * (dur || 1) * live, dur: dur || 1, aoe: aoeMul(d, n), label: (phys ? "bei körperlichem Schaden am Ziel" : "löst " + rate.toFixed(2) + "-mal je Sekunde aus (Gegner im schweren Modus)") + (live < 1 ? ", Ziel stirbt vorher" : "") });
        } else {
          const dual = /dual attack/i.test(s.t) ? 2 : 1;
          const deathP = /if (target|this|that) (foe|ally|creature) dies/.test(d) ? 0.5 : 1;
          const tot = (every ? dm * +every[1] * flee : dm) * deathP * (/pet attack/i.test(s.t) ? 1.33 : 1) * dual + (dual > 1 && w ? wPer : 0);
          // Zweite Schadensangabe im selben Text ("Deals 5...50 damage to other adjacent foes if ...", "End effect: deals ..."): zählt mit, bedingte zur Hälfte, außer die Leiste oder das Team erfüllt die Bedingung
          if (!every && !onDeath) { const rx2 = /(?:deals?|takes?|struck for)(?: an additional)? \+?(\d+(?:\.\.\.\d+)?) (?:(?:more|additional) )?(?:(?!less |fewer )\w+ )?damage/g; let m2, k2 = 0;
            while ((m2 = rx2.exec(d))) { if (k2++ === 0) continue; const st = d.lastIndexOf(". ", m2.index) + 1, en = d.indexOf(".", m2.index + m2[0].length + (/\.\.\./.test(m2[0]) ? 0 : 0)); const sen = d.slice(st, d.indexOf(". ", m2.index + m2[0].length) < 0 ? d.length : d.indexOf(". ", m2.index + m2[0].length));
              if (/each second|for each|whenever|every time|charr|summoned|spirit|removal effect|interruption effect|if target foe dies|maximum|\d% chance/.test(sen)) continue;
              const condS = / if |unless| who ha(s|ve) | that (has|is|are) /.test(sen), okS = /if you are enchanted/.test(sen) ? dEnch.length > 0 || sk.some(x => /enchantment/i.test(x[1].t)) : /hexed or enchanted|is hexed|has a hex/.test(sen) ? !!(opts.team && opts.team.hex) : /has a condition|suffering from a condition/.test(sen) ? !!(opts.team && opts.team.cond) : false;
              const f2 = condS ? (okS ? 1 : 0.5) : 1, a2 = /other adjacent foes|two nearby foes/.test(sen) ? Math.max(0, Math.min(/two/.test(sen) ? 2 : 3, (n - 1) * (/two/.test(sen) ? NEARS : ADJS))) : (aoeMul(sen, n) || 1);
              if (a2 > 0) parts.push({ kind: "Direkt", per: at(m2[1], r) * f2 * armorOf(sen, s.aid === 8), dur: 0, aoe: a2, label: "zweite Schadensangabe" + (condS ? (okS ? ", Bedingung erfüllt" : ", bedingt (halb gezählt)") : "") }); } }
          parts.push({ kind: "Direkt", per: tot, dur: 0, aoe: aoeAt(/(?:deals?|causes?|take|takes) \+?\d+(?:\.\.\.\d+)? (?:(?!less |more |fewer )\w+ )?damage/), limit: onDeath ? (/corpse|exploit/.test(d) ? CORPSE : DEATH) : undefined, label: onDeath ? "beim Tod eines Gegners (eine Leiche alle " + (1 / DEATH).toFixed(1) + " s" + (/corpse|exploit/.test(d) && opts.corpseShare < 1 ? ", geteilt im Team" : "") + ")" : dual > 1 ? "Doppelangriff, zwei Treffer" : /pet attack/i.test(s.t) ? "Tierangriff" : /attack/i.test(s.t) ? "Angriffsbonus" : condP < 1 ? "Direktschaden, bedingt (wartet auf die Gelegenheit)" : "Direktschaden" });
        }
      }
      { const rv = dRaw.match(/hits the source for that same amount \(maximum (\d+(?:\.\.\.\d+)?)\)/); if (rv) parts.push({ kind: "Direkt", per: Math.min(80, at(rv[1], r)), dur: 0, aoe: 1, label: "wirft den nächsten Treffer zurück (höchstens " + at(rv[1], r) + ")" }); }
      { const ms = dRaw.match(/shoots? (two|3) arrows simultaneously[^.]*\. these arrows deal (\d+(?:\.\.\.\d+)?)% less damage/); if (ms && wPer) { const k = ms[1] === "two" ? 2 : 3, less = at(ms[2], r) / 100, extra = k * (1 - less) - 1; parts.push({ kind: "Direkt", per: wPer * extra, dur: 0, aoe: 1, label: k + " Pfeile mit je " + Math.round((1 - less) * 100) + " % Schaden statt eines normalen Angriffs" }); } }
      if (/attack (target foe )?twice/.test(dRaw) && !/removal effect/.test(dRaw) && wPer && !parts.some(p => p.kind === "Direkt")) parts.push({ kind: "Direkt", per: wPer, dur: 0, aoe: 1, label: "zweiter Angriff" });
      { const gd = /weapon spell/i.test(s.t) && dRaw.match(/\+(\d+(?:\.\.\.\d+)?) weapon damage/); if (gd && opts.physRate) { const v = at(gd[1], r), D = dur || 20; parts.push({ kind: "Verbündeten-Bonus", per: v * opts.physRate * D, dur: D, aoe: 1, label: "+" + v + " Waffenschaden je Treffer des Nahkämpfers" }); } }
      const ward = dRaw.match(/allies in this ward deal \+(\d+(?:\.\.\.\d+)?) damage/);
      if (ward) { const D = dur || 20, hr = (opts.physRate || 0) + attackRate; if (hr) parts.push({ kind: "Verbündeten-Bonus", per: at(ward[1], r) * hr * D, dur: D, aoe: 1, label: "+" + at(ward[1], r) + " je Treffer in der Abwehr" }); }
      const ab = dRaw.match(/target ally deals (\d+(?:\.\.\.\d+)?) more damage in melee/) || dRaw.match(/(\d+(?:\.\.\.\d+)?) more damage whenever these party members hit with physical/);
      // "in melee" (Wiki, Strength of Honor): wirkt nur auf Nahkampf-Treffer. Ohne Nahkämpfer im Team (Speer und Bogen zählen nicht) bringt die Verzauberung nichts.
      if (ab && /in melee/.test(dRaw) && opts.meleeAlly === false) notes.push((s.de || s.n) + " wirkt nur im Nahkampf. Im Team kämpft niemand im Nahkampf, deshalb nicht gezählt.");
      else if (ab && opts.physRate) { const D = dur || 60; parts.push({ kind: "Verbündeten-Bonus", per: at(ab[1], r) * opts.physRate * D, dur: D, aoe: 1, label: "+" + at(ab[1], r) + " je Treffer des Nahkämpfers" }); }
      // ---- Unterstützung: Heilung und verhinderter Schaden (Texte von guildwiki.de) ----
      const HIT = 80, MAXHP = 480;
      const allies = opts.allies || 8;
      const many = /(gesamte Gruppe|alle Gruppenmitglieder|Gruppenmitglieder in|Verbündete in (Reichweite|Hörweite)|alle Verbündeten|Verbündeten in (Reichweite|Hörweite))/i.test(dd) || /(party members|allies in (earshot|range)|within range|entire party|all allies)/.test(d);
      const lifeM = d.match(/\((\d+(?:\.\.\.\d+)?) second lifespan\)/);
      let sdur = dur || (lifeM ? at(lifeM[1], r) : 0);
      const enchant = /enchantment|echo|ritual/i.test(s.t);
      if (!sdur && enchant && !/spell\.\s/i.test(s.t)) sdur = 0;
      const mult = many ? allies : 1;
      // Treffer auf die Gruppe: Jeder Gegner macht opts.foeDps Schaden/s (Annahme 40, Elite 60). Gruppenweite Effekte sehen alle Treffer, Effekte auf ein Ziel 40 % davon (der Heiler schützt den, der gerade Schaden nimmt).
      const HITRATE = (many ? INC / allies : 0.4 * INC) / HIT;
      const hpReg = dd.match(/\+?(\d+(?:\.\.\.\d+)?) Lebenspunktregeneration/);
      if (hpReg && !/hex/i.test(s.t)) { const p = Math.abs(at(hpReg[1], r)); const D = sdur || (/echo/i.test(s.t) ? 15 : 60); parts.push({ kind: "Heilung", per: p * 2 * D, dur: D, aoe: mult, label: "Regeneration +" + p }); }
      const trig = dd.match(/[Hh]eilt jedes Mal um (\d+(?:\.\.\.\d+)?)/) || dd.match(/[Hh]eilt[^.]*?jedes Mal um (\d+(?:\.\.\.\d+)?)/);
      const healM = dd.match(/[Hh]eilt (?:die gesamte Gruppe |alle Gruppenmitglieder |alle Verbündeten |Euch selbst und Gruppenmitglieder in Hörweite |Euch und den Verbündeten |Euch |den Verbündeten )?um (\d+(?:\.\.\.\d+)?)/);
      const endHeal = dd.match(/Wirkung am Ende: Heilt (?:um )?(\d+(?:\.\.\.\d+)?)/);
      const conv = dd.match(/in Heilung um/) && dd.match(/maximal (\d+(?:\.\.\.\d+)?)/);
      // Heilung und Lebensraub, die an Treffer gebunden sind (englische Wiki-Texte)
      { let m;
        if ((m = dRaw.match(/allies hitting these foes gain (\d+(?:\.\.\.\d+)?) health/))) { const v = at(m[1], r), hr = (opts.physRate || 0) + attackRate, D = sdur || 8; if (hr) parts.push({ kind: "Heilung", per: v * hr * D, dur: D, aoe: 1, label: "Heilung " + v + " je Treffer eines Verbündeten auf verhexte Gegner" }); }
        if ((m = dRaw.match(/steals (\d+(?:\.\.\.\d+)?) health from the next foe that deals damage/))) { const v = at(m[1], r); parts.push({ kind: "Direkt", per: v, dur: 0, aoe: 1, label: "Lebensraub am nächsten Angreifer" }); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Lebensraub " + v }); }
        if ((m = dRaw.match(/you steal (\d+(?:\.\.\.\d+)?) health from every foe that hits you/))) { const v = at(m[1], r), D = sdur || 8, hits = INC / allies * 0.5 / SMALL * D; parts.push({ kind: "Direkt", per: v * hits, dur: D, aoe: 1, label: "Lebensraub bei jedem Treffer auf den Helden" }); parts.push({ kind: "Heilung", per: v * hits, dur: D, aoe: 1, label: "Lebensraub " + v + " je Treffer auf den Helden" }); }
        if ((m = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) health \(maximum (\d+)\) for each enchantment on you whenever you hit/))) { const v = Math.min(+m[2], at(m[1], r) * Math.max(1, Math.min(3, dEnch.length))), D = sdur || 20; if (attackRate) parts.push({ kind: "Heilung", per: v * attackRate * D, dur: D, aoe: 1, label: "Selbstheilung " + Math.round(v) + " je eigenem Treffer" }); }
        if ((m = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) health and \d+(?:\.\.\.\d+)? energy for each condition transferred/))) { const v = at(m[1], r) * 0.5; if (v > 0) parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Selbstheilung je übernommenem Zustand (ein Zustand bei jedem zweiten Einsatz angenommen)" }); }
        if ((m = dRaw.match(/gain (\d+(?:\.\.\.\d+)?) health (?:per second )?while moving/))) { const v = at(m[1], r), D = sdur || 8; parts.push({ kind: "Heilung", per: v * D, dur: D, aoe: allies, label: "Heilung " + v + "/s für alle, die sich bewegen" }); }
        { const lvS2 = dRaw.match(/level (\d+(?:\.\.\.\d+)?) spirit/), H2 = lvS2 ? at(lvS2[1], r) * 20 * (bar.pri === 8 ? 1 + 0.04 * rank(36) : 1) : 0;
          // Verjüngung und Todesqual zahlen jede Wirkung mit eigenen Lebenspunkten (Wiki): Insgesamt geben sie so viel ab, wie der Geist Lebenspunkte hat. 80 % gerechnet, weil Gegner den Geist mit angreifen.
          if (/heals party members in earshot for (\d+(?:\.\.\.\d+)?) each second/.test(dRaw) && H2) parts.push({ kind: "Heilung", per: H2 * 0.8, dur: 0, aoe: 1, label: "Geist verteilt seine " + Math.round(H2) + " Lebenspunkte als Heilung (80 % gerechnet)" });
          if (/causes (\d+(?:\.\.\.\d+)?) health loss each second to foes in earshot/.test(dRaw) && H2) parts.push({ kind: "Geist", per: H2 * 0.8, dur: 0, aoe: 1, label: "Geist setzt seine " + Math.round(H2) + " Lebenspunkte in Lebenspunktverlust um (80 % gerechnet)" }); }
        if ((m = dRaw.match(/steal (\d+(?:\.\.\.\d+)?) health whenever target foe hits/))) { const v = at(m[1], r), D = sdur || 8, k = FOE_ATK * D; parts.push({ kind: "Ausgelöst", per: v * k, dur: D, aoe: 1, label: "Lebensraub bei jedem Treffer des Gegners" }); parts.push({ kind: "Heilung", per: v * k, dur: D, aoe: 1, label: "Lebensraub " + v }); }
        if ((m = dRaw.match(/limited to 5% of target ally's max health and that ally steals (\d+(?:\.\.\.\d+)?) health/))) { const v = at(m[1], r); parts.push({ kind: "Direkt", per: v, dur: 0, aoe: 1, label: "Lebensraub am nächsten Angreifer" }); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Lebensraub " + v }); parts.push({ kind: "Schutz", per: (SMALL + BIG) / 2 - 0.05 * MAXHP, dur: 0, aoe: 1, label: "nächster Treffer auf 5 % begrenzt" }); }
        if ((m = dRaw.match(/each attack's damage \(maximum (\d+(?:\.\.\.\d+)?)\) back to the source/))) { const v = at(m[1], r), D = 60; parts.push({ kind: "Ausgelöst", per: v * (0.4 * INC * 0.5 / SMALL) * D, dur: D, aoe: 1, label: "wirft bis zu " + v + " je Angriff auf den Verbündeten zurück" }); }
        if ((m = dRaw.match(/whenever you create a creature, all nearby allies gain (\d+(?:\.\.\.\d+)?) health/) || dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) health and \d+(?:\.\.\.\d+)? energy whenever you create a creature/))) { const v = at(m[1], r), D = sdur || 60, cs = sk.filter(x => /binding ritual|nature ritual/i.test(x[1].t) || /animate|creates? (a|two|three|\d) /i.test(x[1].d || "")), c = cs.length, cr = cs.reduce((a, x) => a + (x[1].n === "Signet of Spirits" ? 3 : 1) / Math.max(5, (stN && /binding ritual/i.test(x[1].t) ? Math.min(frac(x[1].rc), 15 * Math.max(1, nRit / stN)) : frac(x[1].rc)) + frac(x[1].ac)), 0); if (c) parts.push({ kind: "Heilung", per: v * cr * D, dur: D, aoe: /all nearby allies/.test(dRaw) ? Math.min(2, allies) : 1, label: "Heilung " + v + " für Verbündete in der Nähe des Ritualisten (zwei gerechnet) bei jeder erschaffenen Kreatur (" + c + " solche Fertigkeiten, zusammen eine alle " + (1 / cr).toFixed(0) + " s nach ihren Aufladezeiten)" }); }
        if ((m = dRaw.match(/party members in earshot gain (\d+(?:\.\.\.\d+)?) health with their next spell/))) { const v = at(m[1], r); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: Math.max(1, Math.round(allies * 0.6)), label: "Heilung " + v + " beim nächsten Zauber (60 % der Gruppe zaubern)" }); }
        if ((m = dRaw.match(/spirits do (\d+(?:\.\.\.\d+)?) more damage against these foes/))) { const v = at(m[1], r), D = sdur || 10, c = sk.reduce((a, x) => a + (x[1].n === "Signet of Spirits" ? 3 : /(its attacks|these spirits) (deal|steal)/.test((x[1].d || "").toLowerCase()) ? 1 : 0), 0); if (c) parts.push({ kind: "Geist", per: v * 0.5 * c * 0.7 * D, dur: D, aoe: 1, label: "+" + v + " je Treffer der " + c + " eigenen Geister" }); }
        if ((m = dRaw.match(/target ally deals \+(\d+(?:\.\.\.\d+)?) damage.{0,70}?with the next attack/))) { const v = at(m[1], r); if ((opts.physRate || 0) + attackRate > 0) parts.push({ kind: "Direkt", per: v, dur: 0, aoe: 1, label: "+" + v + " auf den nächsten Angriff eines Verbündeten" }); }
        if (/adds \+20% armor penetration/.test(dRaw) && opts.physRate) { const D = sdur || 10, fac = Math.pow(2, 0.2 * AR / 40) - 1; parts.push({ kind: "Verbündeten-Bonus", per: 25 * af * fac * opts.physRate * D, dur: D, aoe: 1, label: "20 % Rüstungsdurchdringung für die Angriffe eines Verbündeten (25 Grundschaden je Treffer angenommen)" }); }
        if (!w && /weapon spell/i.test(s.t) && (m = dRaw.match(/^[^.]*\.\s*\([^)]*\)\s*attacks deal \+(\d+(?:\.\.\.\d+)?) damage/)) && opts.physRate) { const v = at(m[1], r), D = sdur || 20; parts.push({ kind: "Verbündeten-Bonus", per: v * opts.physRate * D, dur: D, aoe: 1, label: "+" + v + " je Treffer des Nahkämpfers (wirkt nicht auf Verzauberte)" }); }
        if ((m = dRaw.match(/reduces damage you take by (\d+(?:\.\.\.\d+)?)/))) { const x = at(m[1], r), v = HIT * (0.5 * Math.min(1, x / SMALL) + 0.5 * Math.min(1, x / BIG)), D = sdur || 10; parts.push({ kind: "Schutz", per: v * (INC / allies / HIT) * D, dur: D, aoe: 1, fx: { type: "flat", val: x, cov: 1 / allies }, label: "−" + x + " je Treffer, nur für den Helden selbst" }); }
        if ((m = dRaw.match(/take (\d+(?:\.\.\.\d+)?)% less damage from burning foes/))) { const v = at(m[1], r) / 100, D = sdur || 10, burn = sk.some(x => /burning/i.test(x[1].d || "") && x[1].n !== s.n) || (opts.team && opts.team.burn); if (burn) parts.push({ kind: "Schutz", per: v * INC * 0.5 * D, dur: D, aoe: 1, fx: { type: "pct", val: v * 0.5, cov: 1 }, label: Math.round(v * 100) + " % weniger Schaden von brennenden Gegnern (Brennen liegt auf der Hälfte der Gegner)" }); else notes.push((s.de || s.n) + " zählt nicht: Niemand setzt Gegner in Brand."); }
        if (/cannot lose more than 5% max health from a single attack or spell/.test(dRaw)) { const D = 60; parts.push({ kind: "Schutz", per: (BIG - 0.05 * MAXHP) * (0.4 * INC * 0.5 / BIG) * 0.5 * D, dur: D, aoe: 1, fx: { type: "cap", val: 0.05 * MAXHP, cov: 0.4, upF: 0.5 }, label: "Treffer auf 5 % begrenzt (halb gezählt, weil jeder Treffer Energie kostet)" }); }
        if (/ward/i.test(s.t) && (m = dRaw.match(/causes -?(\d+(?:\.\.\.\d+)?) health degeneration to foes in the area/))) { const p = at(m[1], r), D = sdur || 5; parts.push({ kind: "Degeneration", per: p * 2 * D, dur: D, aoe: n, label: "Lebenspunkte-Degeneration im Bereich" }); }
        if ((m = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) health and \d+(?:\.\.\.\d+)? energy if target foe is below/))) { const v = at(m[1], r) * 0.5; parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Selbstheilung, nur gegen Gegner unter 50 % (halb gezählt)" }); }
        if (/for each rank in divine favor whenever target takes damage/.test(dRaw)) { const v = 2 * rank(16), D = sdur || at("2...5", r); if (v > 0) parts.push({ kind: "Heilung", per: v * (0.4 * INC * (0.5 / SMALL + 0.5 / BIG)) * D, dur: D, aoe: allies, label: "Gruppenheilung " + v + " bei jedem Treffer auf das Ziel" }); }
      }
      const lifeEnd = dd.match(/Wirkung am Ende: Heilt pro Sekunde[^.]*um (\d+(?:\.\.\.\d+)?)/), selfHeal = dd.match(/Ihr werdet um (\d+(?:\.\.\.\d+)?) Lebenspunkte geheilt/), spT = /Geist verliert/.test(dd) && dd.match(/verliert (\d+(?:\.\.\.\d+)?) Lebenspunkte\. Heilt.*?um (\d+) Lebenspunkte/);
      if (lifeEnd) { const v = at(lifeEnd[1], r), L = sdur || 20; parts.push({ kind: "Heilung", per: v * L * 0.7, dur: 0, aoe: mult, label: "Heilung am Ende des Geists, " + v + " je Sekunde Lebenszeit (70 % gerechnet, weil der Geist vorher sterben kann)" }); }
      else if (spT && sk.some(x => /binding ritual/i.test(x[1].t) || /spirit/i.test(x[1].n))) { const v = at(spT[1], r) * +spT[2]; parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Heilung " + v + " über einen eigenen Geist" }); }
      else if (selfHeal && !healM) { const v = at(selfHeal[1], r) * (/falls/.test(dd) ? 0.5 : 1); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Selbstheilung " + Math.round(v) + (/falls/.test(dd) ? " (bedingt, halb gezählt)" : "") }); }
      else if (trig) { const v = at(trig[1], r), D = sdur || 8, k = (d.match(/ends after (\d+)/) || [0, 99])[1]; const rate = /angreift oder einen Zauber/.test(dd) ? 0.67 : /mehr als 50/.test(dd) ? HITRATE * 0.8 : HITRATE; parts.push({ kind: "Heilung", per: v * Math.min(rate * D, +k), dur: D, aoe: mult, label: "Heilung bei Auslösung " + v }); }
      else if (endHeal) { const v = at(endHeal[1], r); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: mult, label: "Heilung am Ende " + v }); }
      else if (conv) { const v = Math.min(HIT, at(conv[1], r)); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Schaden wird Heilung " + v }); }
      else if (healM && !/Diener|Geist verliert/.test(dd)) { const v = at(healM[1], r); if (v > 0) parts.push({ kind: "Heilung", per: v, dur: 0, aoe: mult, label: "Heilung " + v }); }
      { let m; const hasH = () => parts.some(p => p.kind === "Heilung");
        if ((m = dRaw.match(/drop effect: all party members are healed for (\d+(?:\.\.\.\d+)?)/))) parts.push({ kind: "Heilung", per: at(m[1], r), dur: 0, aoe: allies, label: "Gruppenheilung " + at(m[1], r) + " beim Ablegen" });
        if (!hasH() && (m = dRaw.match(/end effect: heals? (?:for )?(\d+(?:\.\.\.\d+)?)/))) parts.push({ kind: "Heilung", per: at(m[1], r), dur: 0, aoe: mult, label: "Heilung am Ende " + at(m[1], r) });
        if (!hasH() && (m = dRaw.match(/^[^.]*\. heals (?:target ally |you |entire party )?for (\d+(?:\.\.\.\d+)?)/))) parts.push({ kind: "Heilung", per: at(m[1], r), dur: 0, aoe: /entire party/.test(m[0]) ? mult : 1, label: "Heilung " + at(m[1], r) });
        if ((m = dRaw.match(/heals for (\d+(?:\.\.\.\d+)?) more([^.]*)/))) { const f = / if /.test(m[2]) ? 0.5 : 1; parts.push({ kind: "Heilung", per: at(m[1], r) * f, dur: 0, aoe: 1, label: "Zusatzheilung " + at(m[1], r) + (f < 1 ? ", bedingt (halb gezählt)" : /for each/.test(m[2]) ? ", eine Verzauberung oder Verhexung angenommen" : "") }); } }
      // verhinderter Schaden
      const D2 = sdur || (enchant ? 60 : 0);
      if (D2) {
        const capM = /auf 10% der maximalen Lebenspunkte/.test(dd) || /more than 10% maximum health/i.test(d);
        const redM = dd.match(/[Rr]eduziert erlittenen Schaden[^.]*?um (\d+(?:\.\.\.\d+)?)/) || d.match(/reduced by (\d+(?:\.\.\.\d+)?)/) || dd.match(/um (\d+(?:\.\.\.\d+)?) Punkte reduziert/);
        const blkM = d.match(/(\d+)% chance to block/);
        const armM = d.match(/\+(\d+(?:\.\.\.\d+)?) armor/);
        let perHit = 0, lab = ""; const pctM = d.match(/reduces damage by (\d+(?:\.\.\.\d+)?)%/) || (!/spirits/.test(d) && d.match(/(?:target ally[^.]*|you|party members[^.]*|allies[^.]*) takes? (\d+(?:\.\.\.\d+)?)% less damage(?! from)/));
        if (pctM) { perHit = HIT * at(pctM[1], r) / 100; lab = at(pctM[1], r) + " % weniger Schaden"; }
        else if (capM) { perHit = HIT * 0.5 * Math.max(0, 1 - 0.1 * MAXHP / BIG); lab = "Schadensgrenze 10 %, greift nur bei großen Treffern"; }
        else if (redM) { const x = at(redM[1], r); perHit = HIT * (0.5 * Math.min(1, x / SMALL) + 0.5 * Math.min(1, x / BIG)); lab = "−" + x + " je Treffer"; }
        else if (blkM) { perHit = HIT * 0.6 * (+blkM[1]) / 100; lab = blkM[1] + " % Blocken, wirkt nur gegen Angriffe (60 % des Schadens)"; }
        else if (armM && !/hex/i.test(s.t)) { const a = at(armM[1], r); perHit = HIT * (1 - Math.pow(2, -a / 40)); lab = "+" + a + " Rüstung"; }
        // Wirkt der Effekt nur auf den Wirker selbst ("You have +20 armor"), schützt er nur dessen Anteil an den Treffern
        const selfOnly = /you have \+\d+(\.\.\.\d+)? armor|you (have|gain) (a )?\d+(\.\.\.\d+)?% chance to block|you block/i.test(d);
        // Schutzgeister halten nur so lange, wie ihre Lebenspunkte reichen (Wiki "Spirit": Stufe mal 20, je Rang Macht des Herbeirufens +4 %; Shelter, Union, Displacement)
        const lossM = dRaw.match(/this spirit loses (\d+(?:\.\.\.\d+)?) health/) || dRaw.match(/spirit takes (\d+) damage/), lvS = dRaw.match(/level (\d+(?:\.\.\.\d+)?) spirit/);
        let hits; if (lossM && lvS && /binding ritual/i.test(s.t)) { const H = at(lvS[1], r) * 20 * (bar.pri === 8 ? 1 + 0.04 * rank(36) : 1); hits = H / Math.max(1, at(lossM[1], r) * aouF) * 0.8; lab += ", Geist hält rund " + Math.round(H / Math.max(1, at(lossM[1], r) * aouF)) + " Treffer aus" + (aouF < 1 ? " (mit Rüstung der Gefühllosigkeit)" : ""); }
        const fx = pctM ? { type: "pct", val: at(pctM[1], r) / 100 } : capM ? { type: "cap", val: 0.1 * MAXHP } : redM ? { type: "flat", val: at(redM[1], r) } : blkM ? { type: "block", val: +blkM[1] / 100 } : armM && !/hex/i.test(s.t) ? { type: "armor", val: at(armM[1], r) } : null;
        if (fx) { fx.cov = selfOnly ? 1 / allies : many ? 1 : 0.4; if (hits) fx.hits = hits; }
        if (perHit > 0) parts.push({ kind: "Schutz", per: perHit * (selfOnly ? INC / allies / HIT : HITRATE) * D2, dur: D2, aoe: selfOnly ? 1 : mult, fx, label: lab + (selfOnly ? ", nur für den Helden selbst" : "") });
      }
      // ---- Diener und Geister (Wiki: Minion, Bone Horror, Bone Fiend, Flesh Golem, Spirit) ----
      const lvM = d.match(/level (\d+\.\.\.\d+) (bone horror|bone fiend|vampiric horror|shambling horror|flesh golem|bone minion)/) || d.match(/creates? (?:two|2) level (\d+\.\.\.\d+) (bone minion)/) || d.match(/animates? a level (\d+\.\.\.\d+) (bone horror)/);
      if (lvM) {
        const L = at(lvM[1], r), kind = lvM[2];
        // Die Tabelle hält die Mitte der Wiki-Spanne. Die Spanne schließt kritische Treffer ein, der Mittelwert liegt darunter: Wiki "Bone Horror" nennt für Stufe 18 (17-49) 27,5 und für Stufe 21 (21-59) 35,5, also rund 86 % der Mitte.
        const mean = minionMean(kind, L) * 0.86, per = mean / (kind === "bone fiend" ? 1.86 : 3.10);
        minions.push({ s, per, count: /two|2 level/.test(d) || kind === "bone minion" ? 2 : 1, max: kind === "flesh golem" ? 1 : 99, rate: 1 / Math.max(1, rc + ac + 0.75), cost, L, kind, i });
      }
      const spA = dRaw.match(/(?:its attacks|these spirits|attacks) (?:deal|steal) (\d+(?:\.\.\.\d+)?) (?:damage|health)/);
      if (spA && /ritual|signet/i.test(s.t) && /spirit/.test(dRaw)) {
        const dmgS = at(spA[1], r), life = lifeM ? at(lifeM[1], r) : (d.match(/\((\d+)[- ]second lifespan\)/) || [0, 30])[1] * 1;
        const cnt = (d.match(/creates (\d) level/) || [0, 1])[1] * 1;
        // Geister stehen fest und müssen in jedem Kampf neu gesetzt werden: 70 % der Zeit im Einsatz (Annahme)
        parts.push({ kind: "Geist", per: dmgS * 0.5 * life * cnt * 0.7 * (/double damage to hexed/.test(dRaw) ? 1.5 : 1), dur: life, aoe: 1, label: cnt + (cnt > 1 ? " Geister" : " Geist") + ", " + dmgS + " alle 2 s, 70 % im Einsatz" });
      }
      if (hasHB && s.aid === 13 && /spell/i.test(s.t)) parts.forEach(p => { if (p.kind === "Heilung") { p.per *= 1.5; p.label += ", +50 % durch Segen des Heilers"; } });
      // Gunst der Götter: Mönchszauber auf Verbündete heilen zusätzlich 3,2 je Rang (Wiki "Divine Favor")
      if (bar.pri === 3 && s.p === 3 && /spell/i.test(s.t) && (/Verbündete/.test(dd) || parts.some(p => p.kind === "Heilung" || p.kind === "Schutz")) && rank(16) > 0) parts.push({ kind: "Heilung", per: Math.round(3.2 * rank(16)) * (hasSk("Smiter's Boon") && s.aid === 14 ? 2 : 1), dur: 0, aoe: 1, label: "Gunst der Götter " + Math.round(3.2 * rank(16)) });
      const isMinion = minions.some(m => m.i === i);
      const isCtrl = s.n === "Panic" || /hex/i.test(s.t) && /(attack|cast)[^.]*% slower|% slower spell casting|doubles? (spell casting|skill activation|casting) time/i.test(s.d || "") || /knock[s]?[- ]?down|interrupt|Dazed|Blind|disable/i.test(s.d || "") && !/enchantment|stance|shout|chant|form/i.test(s.t.replace(/hex/i, "")) || /Dazed|Blind|knock/i.test(s.d || "") && /attack|shout/i.test(s.t);
      if (!parts.length && !gain && !isMinion && !isCtrl) continue;
      // Wie oft wird die Fertigkeit genutzt? Effekte mit Dauer werden nur gehalten, nicht gestapelt.
      if (tear && TEAR > 0) { const rs = d.split(/removal effect:/)[1] || "", sc2 = w && /sense|scythe/i.test(w[0]) ? Math.min(3, 1 + (n - 1) * ADJS) : 1, pct = Math.round(TEAR * 100);
        const m1 = rs.match(/adjacent foes take (\d+(?:\.\.\.\d+)?) /); if (m1) parts.push({ kind: "Direkt", per: at(m1[1], r) * TEAR, dur: 0, aoe: n, label: "Entfernungseffekt auf alle Nachbarn (" + pct + " % der Einsätze)" });
        const m2 = rs.match(/deals \+(\d+(?:\.\.\.\d+)?) (?:additional )?damage/); if (m2) parts.push({ kind: "Direkt", per: at(m2[1], r) * TEAR, dur: 0, aoe: sc2, label: "Entfernungseffekt (" + pct + " % der Einsätze)" });
        if (/attack twice/.test(rs) && wPer) parts.push({ kind: "Direkt", per: wPer * TEAR, dur: 0, aoe: sc2, label: "zweiter Angriff (" + pct + " % der Einsätze)" });
      }
      const holds = parts.length > 0 && parts.every(p => p.dur > 0 && p.kind !== "Direkt");
      // Gruppenheilung trifft auch Unverletzte: Im Kampf ist etwa die halbe Gruppe verletzt (Annahme), nur dieser Teil zählt
      parts.forEach(p => { if (p.kind === "Heilung" && p.aoe === allies && allies > 2) { p.aoe = allies * 0.5; p.label += ", zählt für die halbe Gruppe"; } });
      // Stirbt ein Schutzgeist vor Ablauf, wird er neu gerufen, sobald er aufgeladen ist
      const capBound = parts.some(p => p.fx && p.fx.hits);
      const foeDur = holds && parts.every(p => /Degeneration|Zustand|Ausgelöst/.test(p.kind));
      let rate = 1 / (holds && !capBound ? Math.max(T, foeDur ? emin(parts[0].dur) : parts[0].dur) : T);
      const maintS = isMaint(s); if (maintS) { rate = Math.min(rate, 1 / 120); cost = 0; } // einmal wirken, danach zahlt der Pip-Abzug
      if (isMinion) rate = Math.min(rate, CORPSE);
      if (adr) rate = Math.min(rate, attackRate / adr);
      const lim = parts.find(p => p.limit != null); if (lim) rate = Math.min(rate, lim.limit);
      // Vorbedingung am Ziel (Verhexung, Zustand): Zählt nur, wenn das Team sie liefert. Ohne Team-Angabe wird sie als erfüllt angenommen.
      if (opts.team) { const dl = d.toLowerCase();
        if (/no effect unless|damage if target foe (has|is|was)|if target foe (has|had|is) [^.]*deals|removes? (a|one) (mesmer )?hex(es)? from target foe/.test(dl)) {
          const needC = /(has|suffering from) a condition|foes? with a condition/.test(dl), orEnch = /hexed or enchanted|hex or (an )?enchantment|condition or hex/.test(dl), needM = /mesmer hex/.test(dl), needH = /hexed|has a (mesmer )?hex|removes? (a|one) (mesmer )?hex/.test(dl);
          let pf = 1; if (needC && !/condition or hex/.test(dl) && !opts.team.cond) pf *= 0;
          if (needH && !(needM ? opts.team.mhex : opts.team.hex)) pf *= orEnch ? (/condition or hex/.test(dl) && opts.team.cond ? 1 : 0.3) : 0;
          const missC = needC && !/condition or hex/.test(dl) && !opts.team.cond, missH = needH && !(needM ? opts.team.mhex : opts.team.hex);
          if (pf < 1) { rate *= pf; notes.push((s.de || s.n) + " braucht am Ziel " + [missC ? "einen Zustand" : "", missH ? (needM ? "eine Mesmer-Verhexung" : "eine Verhexung") : ""].filter(Boolean).join(" und ") + ". Das liefert im Team niemand" + (pf > 0 ? ". Gezählt zu 30 %, weil manche Gegner sich selbst verzaubern." : ". Nicht gezählt.")); }
        } }
      rate *= condP; // bedingte Fertigkeiten (Unterbrechung, Entfernung) werden nur halb so oft gewirkt und kosten dann auch nur halb so viel
      const isAtk = /attack/i.test(s.t) && !/pet attack/i.test(s.t);
      uses.push({ s, i, rate, cost, gain, parts, holds, intr: oppAtk ? "atk" : oppSpell ? "spell" : oppAny ? "skill" : null, isAtk, time: isAtk ? 0 : ac + (/spell/i.test(s.t) ? 0.75 : 0), minion: isMinion, maint: maintS });
    }
    // Energie: Grundregeneration plus Seelensammlung, Kritische Stöße, Führung, eigene Energie-Fertigkeiten und Blut ist Kraft aus dem Team
    let extra = 0; const eNotes = [];
    if (bar.pri === 4 && rank(6) > 0) { const v = rank(6) * Math.min(3 / 15, DEATH); extra += v; eNotes.push("Seelensammlung +" + v.toFixed(1)); }
    if (bar.pri === 7 && w && rank(35) >= 3) { const e = rank(35) >= 13 ? 3 : rank(35) >= 8 ? 2 : 1, v = attackRate * (critChance || 0) * e; extra += v; eNotes.push("Kritische Stöße +" + v.toFixed(1)); }
    if (w && zealHits) { extra += zealHits; eNotes.push("Eifer-Aufwertung +" + zealHits.toFixed(1) + " (1 Energie je Treffer, dafür 1 Pip weniger)"); }
    if (w && hitEnergy) { const v = attackRate * hitEnergy; extra += v; eNotes.push("Energie je Treffer +" + v.toFixed(1)); }
    if (w && critEnergy) { const v = attackRate * (critChance || 0) * critEnergy; extra += v; eNotes.push("Energie je kritischem Treffer +" + v.toFixed(1)); }
    if (hasSk("Essence Bond")) { const v = 0.4 * INC * (0.5 / SMALL + 0.5 / BIG); extra += v; eNotes.push("Essenzbindung +" + v.toFixed(1)); }
    { const crSk = sk.filter(x => /binding ritual|nature ritual/i.test(x[1].t) || /animate|creates? (a|two|three|\d) /i.test(x[1].d || "") || x[1].n === "Signet of Spirits"), bc = sk.find(x => /you gain \d+(\.\.\.\d+)? health and (\d+(?:\.\.\.\d+)?) energy whenever you create a creature/i.test(x[1].d || ""));
      if (bc && crSk.length) { const cr = uses.filter(u => crSk.some(x => x[1].id === u.s.id)).reduce((a, u) => a + u.rate * (u.s.n === "Signet of Spirits" ? 3 : /two|2 level/i.test(u.s.d || "") ? 2 : 1), 0), v = at((bc[1].d.match(/health and (\d+(?:\.\.\.\d+)?) energy/i) || [0, "0"])[1], rank(bc[1].aid)) * cr; extra += v; eNotes.push("Segen der Schöpfung +" + v.toFixed(1)); }
      const ch = sk.find(x => x[1].n === "Channeling"); if (ch) { const spells = uses.filter(u => /spell/i.test(u.s.t)).reduce((a, u) => a + u.rate, 0), v = spells * 1; extra += v; eNotes.push("Kanalisieren +" + v.toFixed(1) + " (ein Gegner im Bereich angenommen)"); }
      const vr = sk.find(x => /gain \+(\d+(?:\.\.\.\d+)?) energy regeneration/i.test(x[1].d || "") && !/cannot self-target/i.test(x[1].d || "")); if (vr) { const v = at((vr[1].d.match(/gain \+(\d+(?:\.\.\.\d+)?) energy regeneration/i))[1], vr[1].aid < 0 ? 15 : rank(vr[1].aid)) / 3; extra += v; eNotes.push((vr[1].de || vr[1].n) + " +" + v.toFixed(1)); } }
    if (opts.bipPips) { extra += opts.bipPips / 3; eNotes.push("Energie aus dem Team +" + (opts.bipPips / 3).toFixed(1)); }
    // Arkanes Echo (Wiki): Der nächste Zauber wird kopiert, die Kopie bleibt 20 s, danach ist Arkanes Echo 20 s gesperrt: ein Durchlauf alle 42 s. Helden echoen laut Wiki "Hero behavior" einen zufälligen Zauber, der Spieler seine Elite.
    if (hasSk("Arcane Echo")) { const sp = uses.filter(u => /spell/i.test(u.s.t) && u.parts.length && !u.maint && u.s.n !== "Arcane Echo"), extraOf = u => 1 + Math.floor(20 / Math.max(1, frac(u.s.rc) + frac(u.s.ac) + 0.75));
      if (sp.length) { const el = sp.find(u => u.s.e); if (!opts.hero && el) el.rate += extraOf(el) / 42; else sp.forEach(u => { u.rate += extraOf(u) / 42 / sp.length; });
        const ae = sk.find(x => x[1].n === "Arcane Echo")[1]; uses.push({ s: ae, i: -1, rate: 1 / 42, cost: 15, gain: 0, parts: [], holds: false, isAtk: false, time: 2.75, minion: false });
        notes.push("Arkanes Echo: " + (!opts.hero && el ? "kopiert die Elite-Fertigkeit" : "kopiert bei Helden einen zufälligen Zauber der Leiste (Wiki)") + ", ein Durchlauf alle 42 s."); } }
    const corpse = minions.length ? Math.min(1, CORPSE / uses.filter(u => u.minion).reduce((a, u) => a + u.rate, 0)) : 1;
    uses.forEach(u => { if (u.minion) u.rate *= corpse; });
    // Zeit zuerst: Ein Charakter kann nur eine Sache zugleich tun. Zauber kosten Wirkzeit plus 0,75 s Nachwirkzeit.
    let busy = uses.reduce((a, u) => a + u.rate * u.time, 0);
    if (busy > 1) { uses.forEach(u => { if (u.time) u.rate /= busy; }); notes.push("Zeit begrenzt: Die Leiste hat mehr Zauber, als in die Zeit passen. Alle Zauber laufen auf " + Math.round(100 / busy) + " %."); busy = 1; }
    // Energie, die beim Wirken zurückkommt (Wiki-Texte): Einstimmungen, Aura der Wiederherstellung, Ätherische Erneuerung, Glyphe der geringeren Energie
    const has = n2 => sk.find(x => x[1].n === n2), ES = rank(12), EL = { "Air Attunement": 8, "Earth Attunement": 9, "Fire Attunement": 10, "Water Attunement": 11 };
    const isSpell = u => /spell/i.test(u.s.t);
    for (const [nm, aid] of Object.entries(EL)) if (has(nm)) uses.forEach(u => { if (u.s.aid === aid && u.cost) u.gain += 1 + 0.3 * u.cost; });
    const allEl = has("Elemental Attunement") ? 0.5 : has("Master of Magic") ? 0.3 : 0;
    if (allEl) uses.forEach(u => { if ([8, 9, 10, 11].includes(u.s.aid) && u.cost) u.gain += 1 + allEl * u.cost; });
    if (has("Aura of Restoration")) uses.forEach(u => { if (isSpell(u)) u.gain += at("0...1", ES); });
    if (has("Ether Renewal")) { const er = has("Ether Renewal")[1], dur = at("5...20", ES), up = Math.min(1, dur / (frac(er.rc) + frac(er.ac))), ench = Math.min(3, sk.filter(x => /enchantment/i.test(x[1].t) && x[1].p === 6).length);
      uses.forEach(u => { if (isSpell(u)) u.gain += at("1...4", ES) * ench * up; }); eNotes.push("Ätherische Erneuerung: je Zauber +" + (at("1...4", ES) * ench * up).toFixed(1)); }
    if (has("Glyph of Lesser Energy")) { const v = 2 * at("10...18", ES) / 31; extra += v; eNotes.push("Glyphe der geringeren Energie +" + v.toFixed(1)); }
    const need = uses.reduce((a, u) => a + u.cost * u.rate, 0), gains = uses.reduce((a, u) => a + Math.min(u.gain, u.cost + 20) * u.rate, 0);
    const budget = income + extra;
    const f = need - gains > budget ? budget / Math.max(0.01, need - gains) : 1;
    if (gains > 0.05) eNotes.push("eigene Fertigkeiten +" + (gains * f).toFixed(1));
    if (f < 1) notes.push("Energie begrenzt: Nur " + Math.round(f * 100) + " % der möglichen Einsätze sind auf Dauer bezahlbar (" + pips + " Pips" + (eNotes.length ? ", " + eNotes.join(", ") + " Energie/s" : "") + ").");
    else if (eNotes.length) notes.push("Energie reicht: " + pips + " Pips, " + eNotes.join(", ") + " Energie/s.");
    uses.forEach(u => { if (u.cost || u.gain) u.rate *= f; });
    busy = Math.min(1, uses.reduce((a, u) => a + u.rate * u.time, 0));
    if (wIdx >= 0 && busy > 0.02) { out[wIdx].dps *= 1 - busy; out[wIdx].detail += ", " + Math.round(busy * 100) + " % der Zeit mit Zaubern belegt"; }
    const atkSum = uses.filter(u => u.isAtk).reduce((a, u) => a + u.rate, 0), atkCap = attackRate * (1 - busy);
    if (atkSum > atkCap && atkSum > 0) uses.forEach(u => { if (u.isAtk) u.rate *= atkCap / atkSum; });
    // Tiefe Wunde (Wiki "Deep Wound"): 20 % weniger maximale Lebenspunkte, höchstens 100. Das spart 100 Schaden je Gegner, der damit stirbt. Die Hälfte der Gegner stirbt mit Tiefer Wunde, wenn die Leiste sie oft genug setzt (Annahme).
    { const dwRate = uses.filter(u => /deep wound/i.test(u.s.d || "") && /inflict|cause/i.test(u.s.d || "") && !/if you are|remove|lose/i.test((u.s.d || "").split(/deep wound/i)[0].slice(-40))).reduce((a, u) => a + u.rate * (/removal effect:[^.]*deep wound/i.test(u.s.d || "") ? TEAR : 1), 0), v = 100 * Math.min(dwRate, DEATH * 0.5);
      if (v > 0.05) out.push({ name: "Tiefe Wunde", dps: v, cat: "dmg", kind: "Tiefe Wunde", dw: true, detail: "100 Lebenspunkte weniger je Gegner, der damit stirbt (jeder zweite, eine Kreatur stirbt alle " + (1 / DEATH).toFixed(1) + " s)" }); }
    // Stärke (Wiki "Strength"): 1 % Rüstungsdurchdringung je Rang, nur bei Angriffsfertigkeiten. Wirkt auf den Waffenschaden dieser Treffer.
    if (bar.pri === 1 && rank(17) > 0 && wIdx >= 0 && attackRate > 0) {
      const share = Math.min(1, uses.filter(u => u.isAtk).reduce((a, u) => a + u.rate, 0) / attackRate), fac = Math.pow(2, AR * rank(17) / 100 / 40) - 1, v = out[wIdx].dps * share * fac;
      if (v > 0.05) out.push({ name: "Stärke", dps: v, cat: "dmg", kind: "Waffe", detail: rank(17) + " % Rüstungsdurchdringung bei " + Math.round(share * 100) + " % der Treffer (Angriffsfertigkeiten)" });
    }
    const fxOut = [];
    for (const u of uses) {
      const rate = u.rate, sc = opts.scale && opts.scale.has(u.s.id) ? opts.scale.get(u.s.id) : 1;
      if (sc < 1 && u.parts.some(p => p.dur > 0 || p.kind === "Pro Angriff" || /Waffenzauber|Verbündeten-Bonus/.test(p.kind))) notes.push((u.s.de || u.s.n) + " wirkt schon jemand anders im Team. Der Effekt stapelt sich nicht" + (sc > 0 ? " voll." : ", deshalb hier nicht gezählt."));
      let dps = 0; const det = [];
      for (const p of u.parts) {
        if (p.kind === "Pro Angriff") { const up = (u.maint ? 1 : Math.min(1, (/Degeneration|Zustand|Ausgelöst/.test(p.kind) ? emin(p.dur) : p.dur) * rate)); const v = p.perAttack * attackRate * up * p.aoe * sc; dps += v; det.push(p.label + " " + p.perAttack + (attackRate ? "" : " (keine Waffe erkannt)")); }
        else if (p.dur > 0) { const up = (u.maint ? 1 : Math.min(1, (/Degeneration|Zustand|Ausgelöst/.test(p.kind) ? emin(p.dur) : p.dur) * rate)); const v = (p.per / p.dur) * up * p.aoe * sc; dps += v; det.push(p.label + (p.fx && p.fx.hits ? ", neu gerufen alle " + (1 / rate).toFixed(0) + " s" : " " + Math.round(up * 100) + " % Laufzeit")); }
        else { const v = p.per * rate * p.aoe * (/Waffenzauber|Verbündeten-Bonus/.test(p.kind) ? sc : 1); dps += v; det.push(p.label + " " + Math.round(p.per) + " alle " + (1 / rate).toFixed(1) + " s"); }
      }
      u.parts.forEach(p => { if (p.fx) fxOut.push(Object.assign({}, p.fx, { up: (u.maint ? 1 : Math.min(1, (/Degeneration|Zustand|Ausgelöst/.test(p.kind) ? emin(p.dur) : p.dur) * rate)) * (p.fx.upF || 1), rate, dur: p.dur, sid: u.s.id })); });
      // nach Art aufteilen
      const by = { dmg: 0, heal: 0, prot: 0 };
      u.parts.forEach((p, j) => { const v = p.kind === "Pro Angriff" ? p.perAttack * attackRate * (u.maint ? 1 : Math.min(1, (/Degeneration|Zustand|Ausgelöst/.test(p.kind) ? emin(p.dur) : p.dur) * rate)) * p.aoe * sc : p.dur > 0 ? Math.min((p.per / p.dur) * (u.maint ? 1 : Math.min(1, (/Degeneration|Zustand|Ausgelöst/.test(p.kind) ? emin(p.dur) : p.dur) * rate)) * p.aoe * sc, p.capPer != null ? p.capPer * rate : Infinity) : p.per * rate * p.aoe * (/Waffenzauber|Verbündeten-Bonus/.test(p.kind) ? sc : 1); by[p.kind === "Heilung" ? "heal" : p.kind === "Schutz" ? "prot" : "dmg"] += v; });
      for (const k of ["dmg", "heal", "prot"]) if (by[k] > 0.05) out.push({ name: u.s.de || u.s.n, sid: u.s.id, dps: by[k], cat: k, intr: k === "dmg" ? u.intr : null, ips: u.rate, kind: u.parts.filter(p => (p.kind === "Heilung" ? "heal" : p.kind === "Schutz" ? "prot" : "dmg") === k).map(p => p.kind).join("/"), detail: det.filter((x, j) => (u.parts[j].kind === "Heilung" ? "heal" : u.parts[j].kind === "Schutz" ? "prot" : "dmg") === k).join(", ") });
    }
    // Stab oder Zauberstab (Wiki "Staff", "Wand"): 11-22 Schaden, ein Angriff alle 1,75 s, rüstungsabhängig. Nur in der Zeit ohne Zauber.
    if (wIdx < 0 && !w && [3, 4, 5, 6, 8].includes(bar.pri)) {
      const top = Math.max(0, ...bar.attrs.map(a => rank(a[0]))), free = Math.max(0, 1 - busy);
      const v = 16.5 * strikeFactor(Math.min(top, 12)) / strikeFactor(12) * af / 1.75 * free;
      if (v > 0.05) out.push({ name: "Stab oder Zauberstab", dps: v, cat: "dmg", kind: "Waffe", detail: "11-22 Schaden alle 1,75 s, " + Math.round(free * 100) + " % der Zeit frei" });
    }
    // Kontrolle: Wie viele Gegner im Schnitt ausgeschaltet sind (Niederschlag, Unterbrechung, Benommenheit, Blindheit, gesperrte Fertigkeiten, Panik)
    const CAST = 0.5, MELEE = 0.5; // Annahme: Die Hälfte der Gegner zaubert, die Hälfte greift an
    for (const u of uses) {
      const sx = u.s, d = sx.d || "", r = /rank$/.test(sx.a || "") ? 15 : rank(sx.aid), rate = u.rate; if (rate <= 0) continue;
      const secs = rx => { const m = d.match(rx); return m ? at(m[1], r) : 0; };
      const cond = /\bif\b|unless|whenever|interruption effect|if target/i.test(d) ? 0.5 : 1;
      const add = (v, label, ex) => { if (v > 0.005) out.push(Object.assign({ name: sx.de || sx.n, sid: sx.id, dps: v, cat: "ctrl", kind: "Kontrolle", detail: label }, ex || {})); };
      // Panik (Wiki): Nutzt ein verhexter Gegner erfolgreich eine Fertigkeit, werden alle anderen Gegner in der Nähe unterbrochen. Jeder Gegner nutzt 0,25 Fertigkeiten je Sekunde, 60 % davon kommen durch, weil er selbst unterbrochen wird (Annahme). Jede Unterbrechung kostet rund 1 s.
      if (sx.n === "Panic") { const dur = secs(/\((\d+(?:\.\.\.\d+)?) seconds?/), up = Math.min(1, dur * rate), nn = 1 + (n - 1) * NEARS, per = Math.min(0.8, Math.max(0, nn - 1) * FOE_SKILL * 0.6); add(up * nn * per, "Panik: Jeder der " + nn.toFixed(1) + " Gegner in der Nähe verliert " + Math.round(per * 100) + " % seiner Zeit durch Unterbrechungen, " + Math.round(up * 100) + " % Laufzeit"); continue; }
      const kd = /caus\w* knock[- ]?down|knocks? down|is knocked down for|are knocked down(?! foe)|knock(?:ed)?[- ]down (?:target|all|that|nearby|adjacent)|and knocked down/i.test(d) && !/cannot be knocked|if you are knocked|you are knocked down|immune/i.test(d);
      if (kd) { const dur = Math.min(4, secs(/knock[- ]?down[^.]*?\((\d+(?:\.\.\.\d+)?) seconds?\)/i) || secs(/for (\d+(?:\.\.\.\d+)?) seconds?[^.]*knock/i) || secs(/knock(?:ed)?[- ]?down for (\d+(?:\.\.\.\d+)?) seconds?/i) || 2); /* Wiki: Kein Niederschlag dauert länger als 4 s */ const c = /using attack skills/i.test(d) ? 0.2 : /if|unless|moving|attacking|casting|using a skill|\d+% chance/i.test(d) ? 0.5 : 1; const kdN = /nearby|adjacent|in the area/i.test(d) && !/knocks? down target( foe)?\./i.test(d) ? Math.max(1, aoeMul(d, n)) : 1, area = kdN > 1; let kdUp = 0; // nur der Satz mit dem Niederschlag entscheidet, wen er trifft
        // Flächen-Niederschlag: Anteil der Kampfzeit, in dem die Gruppe liegt. Der erste fällt beim Anlaufen, danach so oft, wie die Fertigkeit wieder bereit ist.
        if (area) { const P = 1 / rate; let cover = 0; for (let t = 0; t < FIGHT; t += P) cover += Math.min(dur, FIGHT - t); kdUp = Math.min(1, c * cover / FIGHT); }
        add(rate * dur * kdN * c, "Niederschlag " + dur + " s" + (area ? " für " + kdN.toFixed(1) + " Gegner" : "") + (c < 1 ? ", an Bedingung geknüpft" : ""), area ? { kdUp } : null); }
      if (/interrupt/i.test(d) && !/easily interrupted|cannot be interrupted|not interrupt|if interrupted|is interrupted/i.test(d)) { const lost = /interrupts? (target foe's )?(next )?(an )?attack|interrupts next attack/i.test(d) ? 1 : 2; add(rate * lost * Math.max(1, /all (other )?(nearby|adjacent) foes|foes in the area/i.test(d) ? aoeMul(d, n) : 1), "Unterbrechung: " + (lost === 1 ? "ein Angriff (1 s)" : "ein Zauber (2 s)") + " geht verloren", { intr: lost === 1 ? "atk" : /spell|chant/i.test(d) ? "spell" : "skill", ips: rate }); }
      // Verlangsamte Angriffe und Zauber: "50% slower" kostet ein Drittel der Aktionen, "doubles" die Hälfte
      { const mA = d.match(/attacks?[^.]*?(\d+)% slower/i), mC = d.match(/cast[^.]*?(\d+)% slower|(\d+)% slower spell casting/i), dbl = /doubles? (spell casting|skill activation|casting) time/i.test(d) ? (/skill activation/i.test(d) ? 1 : CAST) : 0;
        const pA = mA ? +mA[1] : 0, pC = mC ? +(mC[1] || mC[2]) : 0, share = (pA ? MELEE * pA / (100 + pA) : 0) + (pC ? CAST * pC / (100 + pC) : 0) + dbl * 0.5;
        if (share > 0 && /hex/i.test(sx.t)) { const dur = secs(/\((\d+(?:\.\.\.\d+)?) seconds?\)/) || 10, up = Math.min(1, rate * dur) * (opts.scale && opts.scale.has(sx.id) ? opts.scale.get(sx.id) : 1); add(up * Math.max(1, /also hexes/i.test(d) ? aoeMul(d, n) : 1) * share, "Verlangsamt Angriffe oder Zauber, " + Math.round(up * 100) + " % Laufzeit"); } }
      if (/Dazed/.test(d) && /inflict|causes?|are Dazed|is Dazed|become/i.test(d)) { const dur = secs(/Dazed[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?\)/) || secs(/Dazed (?:condition )?for (\d+(?:\.\.\.\d+)?) seconds?/) || 5; add(Math.min(1, rate * dur) * 0.75 * CAST * cond * Math.max(1, aoeMul(d, n)), "Benommenheit " + dur + " s: Zauberer fast ausgeschaltet"); }
      if (/Blind/.test(d) && /inflict|causes?|are Blinded|become Blind|Blindness/i.test(d) && !/remove|lose|cure|if you are blind/i.test(d)) { const dur = secs(/Blind(?:ness|ed)?[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?\)/) || secs(/Blind(?:ness|ed)? (?:condition )?for (\d+(?:\.\.\.\d+)?) seconds?/) || 5; add(Math.min(1, rate * dur) * 0.9 * MELEE * cond * Math.max(1, aoeMul(d, n)), "Blindheit " + dur + " s: 90 % der Angriffe gehen daneben", { blind: Math.min(1, rate * dur) }); }
      if (/Weakness/.test(d) && /inflict|causes?|are Weakened|Weakness \(/i.test(d) && !/remove|lose|cure|you are weakened|if (target )?foe is weak/i.test(d)) { const dur = secs(/Weakness[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?\)/) || secs(/Weakness \((\d+(?:\.\.\.\d+)?) seconds?/) || 5; add(Math.min(1, rate * dur) * 0.66 * MELEE * cond * Math.max(1, aoeMul(d, n)), "Schwäche " + dur + " s: Angriffe machen 66 % weniger Schaden (Wiki)", { weak: Math.min(1, rate * dur) }); }
      if (/disables?|disabled/i.test(d) && /target foe|that foe|foe's/i.test(d) && !/your (non-|other )?[\w -]*skills are disabled|disables your/i.test(d.replace(/target foe[^.]*\./i, ""))) { const dur = secs(/disabled?[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?\)/i) || secs(/disabled? for (\d+(?:\.\.\.\d+)?) seconds?/i) || secs(/\((\d+(?:\.\.\.\d+)?) seconds?\)/); const all = /all (of )?(target foe's |that foe's |its )?skills/i.test(d), part = all ? 1 : /attribute/i.test(d) ? 0.5 : 0.2; if (dur) add(Math.min(1, rate * dur) * part * (all ? 1 : cond), "Fertigkeiten gesperrt " + Math.round(dur) + " s" + (all ? "" : ", nur ein Teil")); }
    }
    // Degenerationsgrenze: höchstens 10 Pips (20 Lebenspunkte/s) je Ziel
    const deg = out.filter(o => /Zustand|Degeneration/.test(o.kind)).reduce((a, o) => a + o.dps, 0);
    const cap = 20 * n;
    if (deg > cap) { const k = cap / deg; out.forEach(o => { if (/Zustand|Degeneration/.test(o.kind)) o.dps *= k; }); notes.push("Degeneration auf 10 Pips je Ziel begrenzt."); }
    // Diener im Dauerzustand: Erzeugungsrate mal Lebensdauer, höchstens 2 + halber Rang Todesmagie (Wiki "Minion")
    if (minions.length) {
      const cap = 2 + Math.floor(rank(5) / 2);
      const life = L => { let hp = (80 + 20 * L) * (bar.pri === 8 ? 1 + 0.04 * rank(36) : 1), t = 0, p = 1; while (hp > 0 && t < 600) { const loss = p * 2 * 20; if (loss >= hp) { t += hp / (p * 2); hp = 0; } else { hp -= loss; t += 20; p++; } } return t; };
      // Ohne Dienerheilung hält ein Held die Höchstzahl selten: gerechnet mit zwei Dritteln (Annahme). Mit Blood of the Master reizt er sie aus, solange Leichen da sind (Spielbeobachtung).
      const keep = sk.some(x => x[1].n === "Blood of the Master"), capUse = keep ? cap : cap * 2 / 3;
      let left = capUse; const got = [];
      minions.sort((a, b) => a.max - b.max).forEach(m => { const u = uses.find(x => x.i === m.i); const want = Math.min(m.max, (u ? u.rate : 0) * m.count * life(m.L) / 2); const share = Math.min(want, left); left -= share; if (share > 0.05) { got.push(share); const reachM = FIGHT / (FIGHT + (m.kind === "bone fiend" ? 1 : 2)); out.push({ name: m.s.de || m.s.n, sid: m.s.id, dps: share * m.per * af * reachM, cat: "dmg", kind: "Diener", detail: share.toFixed(1) + " Diener im Schnitt, Stufe " + m.L + ", je " + m.per.toFixed(1) + "/s, " + Math.round(reachM * 100) + " % der Zeit am Gegner (Laufweg je Kampf wie bei Nahkämpfern, Fernkämpfer 1 s)" }); } });
      notes.push("Diener: Im Schnitt " + got.reduce((a, b) => a + b, 0).toFixed(1) + " von höchstens " + cap + (keep ? " (Blut des Meisters hält sie am Leben)" : ", ohne Dienerheilung mit höchstens zwei Dritteln davon gerechnet") + ". Gerechnet mit einer Leiche alle " + (1 / DEATH).toFixed(1) + " s. Lebensdauer: die Hälfte der Zerfallszeit laut Wiki, weil Diener im Kampf auch durch Gegner sterben (Annahme).");
    }
    // Tiergefährte (Wiki "Animal companion"): Stufe 20, im Schnitt 24,4 je Treffer bei Tierbeherrschung 12, +33 % in PvE, ein Angriff alle 2 s
    if (sk.some(x => ["Charm Animal", "Comfort Animal", "Heal as One"].includes(x[1].n))) {
      const bm = rank(22), per = 24.4 * 1.33 * af * strikeFactor(bm) / strikeFactor(12), iv = 2 * (1 - petIas / 100);
      out.push({ name: "Tiergefährte", dps: per / iv, cat: "dmg", kind: "Tier", detail: Math.round(per) + " je Treffer, alle " + iv.toFixed(2) + " s" + (petIas ? " (Angriffstempo +" + Math.round(petIas) + " %)" : "") });
      notes.push("Tiergefährte: Wiki-Messwert für Tierbeherrschung 12, auf deinen Rang umgerechnet wie Waffenschaden. Diese Umrechnung ist eine Annahme.");
    }
    if (fleeUsed) notes.push("Flächenschaden über Zeit: Gegner laufen nach zwei bis drei Schadenspulsen auseinander (guildwiki.de). Gezählt werden 3 Pulse.");
    if (heldUsed) notes.push("Flächenschaden über Zeit zählt voll: Niederschlag oder eine Flächen-Verlangsamung hält die Gegner im Bereich.");
    if (fcUsed) notes.push("Schnellwirkung " + rank(0) + ": Wirkzeit " + Math.round(Math.pow(0.5, rank(0) / 15) * 100) + " %, Aufladezeit der Mesmer-Zauber " + Math.round(Math.max(0.4, 1 - 0.03 * rank(0)) * 100) + " %.");
    if (AR !== 60) notes.push("Zielrüstung " + AR + ": Waffen-, Diener-, Tier- und Elementarschaden zählen zu " + Math.round(af * 100) + " %. Rüstungsignorierender Schaden bleibt voll.");
    if (usedTitle) notes.push("Titel-Fertigkeiten sind mit maximalem Titelrang gerechnet.");
    out.forEach(o => { if (!o.cat) o.cat = "dmg"; });
    const sum = c => out.filter(o => o.cat === c).reduce((a, o) => a + o.dps, 0);
    // Schutz in der Reihenfolge des Wikis ("Order of damage modifiers"): Die Leiste wird als Ganzes gerechnet, die Anzeige je Fertigkeit ist ihr Anteil daran.
    const fxSids = new Set(fxOut.map(f => f.sid)), protOf = list => GW.protTotal(list, INC, NM ? "nm" : ELITE, opts.allies || 8);
    { const ps = out.filter(o => o.cat === "prot" && fxSids.has(o.sid)), solo = ps.map(o => protOf(fxOut.filter(f => f.sid === o.sid))), sumS = solo.reduce((a, b) => a + b, 0), tot = protOf(fxOut); ps.forEach((o, k) => { o.dps = sumS > 0 ? solo[k] * tot / sumS : 0; }); }
    const protExtra = out.filter(o => o.cat === "prot" && !fxSids.has(o.sid)).reduce((a, o) => a + o.dps, 0);
    // Heilung mit Bedingung: "while moving" zählt im Kampf nicht (dort steht die Gruppe, und "Fall Back!" endet laut Wiki beim ersten Angriffstreffer), "below 75% Health" nur zeitweise (50 %, Annahme).
    out.forEach(o => { if (o.cat !== "heal" || !o.sid) return; const x = GW.skill(o.sid), dx = (x && x.d || "").toLowerCase(); const k = /while moving/.test(dx) ? 0 : /below \d+% health|under \d+% health/.test(dx) ? 0.5 : 1; if (k < 1) { o.dps *= k; o.detail += k ? ", an Bedingung geknüpft: zählt zu " + Math.round(k * 100) + " %" : ", wirkt nur in Bewegung: zählt im Kampf nicht"; } });
    // Heilung: Mehr als ankommt, kann nicht geheilt werden
    { const hs = out.filter(o => o.cat === "heal" && o.dps > 0), raw = hs.reduce((a, o) => a + o.dps, 0); if (raw > INC) { hs.forEach(o => { o.dps *= INC / raw; }); notes.push("Heilung auf den ankommenden Schaden begrenzt (" + Math.round(INC) + "/s). Die Leiste könnte " + Math.round(raw) + "/s heilen."); } }
    const total = sum("dmg"), heal = sum("heal"), prot = sum("prot"), ctrl = Math.min(n, sum("ctrl"));
    if (ctrl > 0.05) notes.push("Kontrolle: Im Schnitt " + ctrl.toFixed(1).replace(".", ",") + " von " + n + " Gegnern ausgeschaltet. Je die Hälfte des Gegnerschadens kommt aus Angriffen und aus Fertigkeiten. Eine Unterbrechung kostet einen Angriff (1 s) oder einen Zauber (2 s).");
    return { total, heal, prot, ctrl, incoming: INC, parts: out.filter(o => o.dps > (o.cat === "ctrl" ? 0.005 : 0.05)).sort((a, b) => b.dps - a.dps), notes, attackRate, physical: w ? attackRate : 0, meleeW: !!w && !/Bogen|Speer|Stab/.test(w[0]), energyF: f, protFx: fxOut, protExtra };
  };
  // Effektive Ränge aus Grundwerten plus Runen der Ausrüstungsempfehlung
  // ---------- Schutz: Reihenfolge der Schadensminderung nach Wiki "Order of damage modifiers" ----------
  // Blocken (Zufallschancen multiplizieren sich, Wiki "Effect stacking") -> Rüstung (Boni aus Fertigkeiten zusammen höchstens +25, außer ein einzelner ist größer) -> Schadensgrenzen (Unterschlupf, Schutzbindung, Schutzgeist) -> prozentuale Minderung ("Sie stehen in Flammen!", Lebenssperre) -> Vereinigung und feste Abzüge (Steinfleisch-Aura, Schild der Absorption, Schützende Hände).
  // Gegnerschaden: 50 % kleine Angriffe, 10 % Angriffsfertigkeiten, 40 % Zauber. Blocken wirkt nur auf die ersten beiden.
  // Rüstungsbruch (Wiki "Cracked Armor"): −20 Rüstung, nie unter 60. Anteil der Zeit, in der die Gegner ihn tragen.
  GW._aoeMul = aoeMul;
  // Welche Waffen-Aufwertung die Ausrüstungsempfehlung zuerst nennt
  GW.weaponMod = function (items) { for (const it of items || []) { const m = String(it).match(/\b(zealous|vampiric|sundering|eifer-|vampir-|trenn-)/i); if (m) { const k = m[1].toLowerCase(); return /^(zeal|eifer)/.test(k) ? "zeal" : /^vamp/.test(k) ? "vamp" : "sund"; } } return null; };
  GW.crackOf = function (bar, eff, n) { let u = 0; for (const id of bar.skills) { const s = GW.skill(id); if (!s) continue; const d = (s.d || "").toLowerCase(); if (!/cracked armor/.test(d) || /if target foe has cracked armor|foe has cracked armor|suffering from cracked armor|you have cracked armor/.test(d)) continue;
      const m = d.match(/cracked armor[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?/) || d.match(/cracked armor (?:condition )?(?:for )?\(?(\d+(?:\.\.\.\d+)?) seconds?/) || d.match(/\((\d+(?:\.\.\.\d+)?) seconds?\)[^.]*cracked armor/); const r = /rank$/.test(s.a || "") ? 15 : Math.min(20, eff.get(s.aid) || 0), dur = m ? at(m[1], r) : 5;
      const T = /A$/.test(String(s.cost || "")) ? 8 : Math.max(1, frac(s.rc) + frac(s.ac) + 0.75), wide = /also (affects|hits)|adjacent|nearby|in the area|foes near/.test(d);
      u += Math.min(1, dur / T) * (wide ? 1 : 1 / Math.max(1, n)) * (/ if |end effect/.test(d) ? 0.5 : 1); } return Math.min(1, u); };
  GW.protTotal = function (fx, INC, elite, allies) {
    if (!fx || !fx.length || INC <= 0) return 0;
    const SMALL = elite === "nm" ? 20 : elite ? 34 : 28, BIG = elite === "nm" ? 70 : elite ? 125 : 95;
    const cls = [{ share: 0.5, h: SMALL, atk: true }, { share: 0.1, h: BIG, atk: true }, { share: 0.4, h: BIG, atk: false }];
    const atkPS = INC * (0.5 / SMALL + 0.1 / BIG), bigPS = INC * 0.5 / BIG, allPS = INC * (0.5 / SMALL + 0.5 / BIG);
    // Schutzgeister: Laufzeit aus Lebenspunkten und Trefferzahl, neu gerufen wird, sobald das Ritual aufgeladen ist
    const q = fx.map(f => { let up = f.up; if (f.hits) { const ev = (f.type === "block" ? atkPS * f.val : f.type === "cap" ? bigPS : allPS) * f.cov, life = ev > 0 ? f.hits / ev : Infinity; up = Math.min(1, f.rate * Math.min(f.dur || 30, life)); } return Math.max(0, Math.min(1, up)) * f.cov; });
    const of = t => fx.map((f, i) => [f, q[i]]).filter(x => x[0].type === t);
    const pb = 1 - of("block").reduce((a, [f, p]) => a * (1 - p * f.val), 1);
    const arms = of("armor"), aSum = arms.reduce((a, [f, p]) => a + p * f.val, 0), aMax = arms.reduce((a, [f, p]) => Math.max(a, p * f.val), 0), aEff = Math.max(Math.min(25, aSum), aMax);
    const caps = of("cap"), pCap = 1 - caps.reduce((a, [f, p]) => a * (1 - p), 1), capV = caps.reduce((a, [f]) => Math.min(a, f.val), Infinity);
    let prevented = 0;
    for (const c of cls) { let rem = c.h * (1 - 0.8 * (1 - Math.pow(2, -aEff / 40)));
      if (pCap > 0) rem = (1 - pCap) * rem + pCap * Math.min(rem, capV);
      for (const [f, p] of of("pct")) rem *= 1 - p * f.val;
      for (const [f, p] of of("flat")) rem -= p * Math.min(f.val, rem);
      prevented += INC * c.share * (1 - (c.atk ? 1 - pb : 1) * Math.max(0, rem) / c.h); }
    return Math.min(0.95 * INC, prevented);
  };
  // Schutz des ganzen Teams: alle Effekte aller Leisten gemeinsam durch die Reihenfolge
  GW.teamProt = function (list, n, foeDps) { const INC = n * foeDps, L = list.filter(Boolean); return Math.min(0.95 * INC, GW.protTotal(L.flatMap(d => d.protFx || []), INC, foeDps > 50 ? true : foeDps < 30 ? "nm" : false, L.length || 8) + L.reduce((a, d) => a + (d.protExtra || 0), 0)); };
  // ---------- Team: Was sich zwischen den Leisten gegenseitig beeinflusst ----------
  const RUNMEMO = new Map();
  const teamOnce = function (bars, eff, weapon0, n, env, death) {
    const hasBip = bar => bar.skills.some(id => { const s = GW.skill(id); return s && s.n === "Blood is Power"; });
    const bipPips = effMap => Math.round(3 + 3 * Math.min(effMap.get(4) || 0, 21) / 15);
    const SK = b => b.skills.map(id=>GW.skill(id)).filter(Boolean);
    const SN = ["Deep Freeze","Grasping Earth","Frozen Burst","Ice Spikes","Teinai's Prison"], snare = bars.some(b=>SK(b).some(s=>SN.includes(s.n)));
    // Was das Team an Vorbedingungen liefert: Verhexungen, Mesmer-Verhexungen, Zustände
    const CONDS = /(inflicts?|causes?|suffer(s)? from|are|become) (the )?(bleeding|burning|poison|disease|deep wound|weakness|crippled?|blind(ness|ed)?|dazed|cracked armor)/i;
    const all = bars.flatMap(SK), team = { hex: all.some(s=>/hex/i.test(s.t)), mhex: all.some(s=>/hex/i.test(s.t) && s.p===5), cond: all.some(s=>CONDS.test(s.d) && !/remove|lose|cure/i.test(s.d.split(".")[0])) };
    // Leichen teilen sich alle, die welche brauchen
    const corpseUser = b => SK(b).some(s=>/corpse|exploit/i.test(s.d)), cu = bars.filter(corpseUser).length;
    // Heroischer Refrain im Team (Wiki): Der Paragon gibt Verbündeten +1...3 auf alle Attribute, ab Führung 19 +4. Jeder Schrei oder Anfeuerungsruf, der auf dem Verbündeten endet, erneuert ihn. Mit einem gruppenweiten Schrei bleibt er auf allen, sonst nur auf so vielen, wie Dauer und Aufladezeit (10 s) hergeben.
    { const hi = bars.findIndex(b=>b.pri===9 && SK(b).some(s=>s.n==="Heroic Refrain"));
      if (hi>=0 && bars.length>1) { const L = Math.min(20, eff[hi].get(40)||0), b = Math.round(1 + 2*L/15), dur = 3 + 12*L/15;
        const wide = SK(bars[hi]).some(s=>/shout|chant/i.test(s.t) && /(allies|party members) (in|within) earshot|all allies|party members/i.test(s.d||"")), cov = wide ? 1 : Math.min(1, (dur/10)/(bars.length-1)), add = Math.round(b*cov);
        if (add>0) eff = eff.map((m,i)=> i===hi ? m : new Map([...m].map(([a,v])=>[a, v>0 ? Math.min(20, v+add) : v]))); } }
    const allies = Math.max(bars.length, 1), crackT = Math.min(1, bars.reduce((a,b,i)=>a+GW.crackOf(b, eff[i], n),0)), base = { targets:n, foeRate:0.5, armor:env.armor, foeDps:env.foeDps, allies, snare, team, crack:crackT, death };
    // gleiche Geister nur einmal im Team: Der Erste in der Reihe setzt sie
    const seenSp = new Set(), skips = bars.map(b=>{ const mine = GW.spiritIds(b), sk2 = new Set(mine.filter(id=>seenSp.has(id))); mine.forEach(id=>seenSp.add(id)); return sk2; });
    // gleiche Verhexung von mehreren: Flächen-Verhexungen zählen einmal, Einzel-Verhexungen so oft, wie es Ziele gibt
    const hexSeen = new Map(), scales = bars.map(b=>{ const m = new Map(); SK(b).forEach(s=>{ if (!/hex/i.test(s.t)) return; const j = hexSeen.get(s.id)||0; hexSeen.set(s.id, j+1); const aoe = /also hexes|adjacent|nearby|in the area/i.test(s.d); if (aoe ? j>0 : j>=n) m.set(s.id, 0); }); return m; });
    // Gleiche Leiste unter gleichen Bedingungen nur einmal rechnen (die Suche nach dem Vergleichsteam fragt dieselben Fälle sehr oft ab)
    const run = (i, phys, bp) => { const cs = cu>1 && corpseUser(bars[i]) ? 1/cu : 1;
      const key = [(env.wmods && env.wmods[i]) || "-", death.toFixed(3), crackT.toFixed(3), i===0 ? "S" : "H", bars[i].skills.join(","), [...eff[i]].join(";"), i===0 ? "w"+JSON.stringify(weapon0||0) : "p"+(Math.round(phys*1000)), bp, [...skips[i]].join(","), [...scales[i]].join(";"), cs, n, base.armor, base.foeDps, allies, snare?1:0, base.hold||0, base.meleeAlly===false?"nm":"", JSON.stringify(team)].join("|");
      let v = RUNMEMO.get(key); if (!v) { if (RUNMEMO.size > 6000) RUNMEMO.clear(); v = GW.dps(bars[i], eff[i], Object.assign({}, base, i===0 ? { weapon:weapon0 } : { physRate:phys, hero:true }, { wmod: (env.wmods && env.wmods[i]) || null, bipPips:bp, skip:skips[i], scale:scales[i], corpseShare: cs })); RUNMEMO.set(key, v); } return v; };
    const first0 = run(0, 0, 0); let pass = bars.map((b,i)=> i===0 ? first0 : run(i, first0.physical, 0));
    // Kein Nahkämpfer im Team: Verstärkungen, die nur Nahkampf-Treffer verbessern, zählen nicht
    if (!pass.some(D=>D.meleeW)) { base.meleeAlly = false; pass = bars.map((b,i)=> i===0 ? run(0, 0, 0) : run(i, first0.physical, 0)); }
    // Verstärkungen für Angreifer stapeln sich nicht: Ein Verbündeter trägt nur einen Waffenzauber, dieselbe Verzauberung oder derselbe Orden wirkt nur einmal
    const physCount = Math.max(1, pass.filter(D=>D.physical>0).length); let ws = 0; const buffSeen = new Map(); let changed = false;
    pass.forEach((D,i)=>{ const seen = new Set(); D.parts.forEach(p=>{ if (!p.sid || seen.has(p.sid) || !/Verbündeten-Bonus|Waffenzauber/.test(p.kind||"")) return; seen.add(p.sid); const s = GW.skill(p.sid); if (!s) return;
      if (/weapon spell/i.test(s.t)) { if (ws >= physCount) { scales[i].set(s.id, 0); changed = true; } ws++; }
      else { const j = buffSeen.get(s.id)||0; buffSeen.set(s.id, j+1); const wide = /party|all allies|allies in|allies within/i.test(s.d); if (wide ? j>0 : j>=physCount) { scales[i].set(s.id, 0); changed = true; } } }); });
    if (changed) pass = bars.map((b,i)=> i===0 ? run(0, 0, 0) : run(i, first0.physical, 0));
    // Flächen-Niederschlag im Team: Solange die Gruppe liegt, läuft niemand aus dem Flächenschaden und die Gegner bleiben dicht stehen. Das gilt für alle im Team, also zweiter Durchlauf mit diesem Anteil.
    { const hold = 1 - pass.reduce((a,D)=>a*D.parts.reduce((x,p)=>x*(1-(p.kdUp||0)),1),1);
      if (hold > 0.02) { base.hold = Math.round(hold*50)/50; const f = run(0, 0, 0); pass = bars.map((b,i)=> i===0 ? f : run(i, f.physical, 0)); } }
    // Energie aus dem Team (Wiki): Blut ist Kraft gibt +3...6 Pips für 10 s und lässt sich auf drei Verbündeten halten. Blutritual gibt +3 Pips, hier auf zwei Verbündeten.
    // Verteilt wird an die, denen am meisten Energie fehlt. Wer genug bekommt, hat keinen Engpass mehr.
    const hasSk = (b, nm) => SK(b).some(s=>s.n===nm);
    const bi = bars.findIndex(hasBip), ri = bars.findIndex(b=>hasSk(b,"Blood Ritual"));
    let res = pass;
    if (bi>=0 || ri>=0) {
      const give = bars.map(()=>0), order = pass.map((D,i)=>[i, D.energyF]).filter(x=>x[1] < 0.98).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
      if (bi>=0) order.filter(i=>i!==bi).slice(0,3).forEach(i=>{ give[i] += bipPips(eff[bi]); });
      if (ri>=0) { const rest = order.filter(i=>i!==ri && !give[i]); (rest.length ? rest : order.filter(i=>i!==ri)).slice(0,2).forEach(i=>{ give[i] += 3; }); }
      const first = give[0] ? run(0, 0, give[0]) : pass[0];
      res = bars.map((b,i)=> i===0 ? first : give[i] ? run(i, first.physical, give[i]) : pass[i]);
    }
    // Degeneration im Team: höchstens 10 Pips (20 Lebenspunkte/s) je Ziel, egal von wie vielen
    const isDeg = p => p.cat==="dmg" && /Zustand|Degeneration/.test(p.kind||""), deg = res.reduce((a,D)=>a+D.parts.filter(isDeg).reduce((x,p)=>x+p.dps,0),0), cap = 20*n;
    if (deg > cap) res = res.map(D=>{ const mine = D.parts.filter(isDeg).reduce((x,p)=>x+p.dps,0); if (!mine) return D; const k = cap/deg; return Object.assign({}, D, { total: D.total - mine*(1-k), parts: D.parts.map(p=>isDeg(p) ? Object.assign({}, p, { dps:p.dps*k }) : p), notes: D.notes.concat("Degeneration im Team auf 10 Pips je Ziel begrenzt: Diese Leiste zählt hier zu " + Math.round(k*100) + " %.") }); });
    // Blindheit und Schwäche stapeln sich nicht: Ist ein Gegner schon betroffen, bringt die zweite Quelle nur die Zeit, die noch fehlt. Der Schaden der Fertigkeit bleibt.
    for (const key of ["blind", "weak"]) { let used = 0; res = res.map(D=>{ if (!D.parts.some(p=>p[key])) return D; let cut = 0; const parts = D.parts.map(p=>{ if (!p[key]) return p; const eff = Math.max(0, Math.min(1, used + p[key]) - used), k = eff / p[key]; used = Math.min(1, used + p[key]); if (k >= 0.999) return p; cut += p.dps*(1-k); return Object.assign({}, p, { dps:p.dps*k, detail:p.detail + ". Im Team zu " + Math.round(k*100) + " % gezählt, weil die Gegner das schon von jemand anderem haben" }); }); return cut ? Object.assign({}, D, { ctrl: Math.max(0, D.ctrl - cut), parts }) : D; }); }
    // Tiefe Wunde im Team: Mehr als jeder zweite sterbende Gegner kann sie nicht tragen
    { const cap = 100 * death * 0.5, tot = res.reduce((a,D)=>a+D.parts.filter(p=>p.dw).reduce((x,p)=>x+p.dps,0),0); if (tot > cap + 0.01) { const k = cap/tot; res = res.map(D=>{ const mine = D.parts.filter(p=>p.dw).reduce((x,p)=>x+p.dps,0); return mine ? Object.assign({}, D, { total: D.total - mine*(1-k), parts: D.parts.map(p=>p.dw ? Object.assign({}, p, { dps:p.dps*k, detail:p.detail + ". Im Team geteilt" }) : p) }) : D; }); } }
    // Unterbrechungen der Helden: Laut Wiki ("Hero behavior") stimmen sich Helden nicht ab, legen sich auf das Ziel des Spielers fest und unterbrechen fast nie andere Gegner. Alle Helden teilen sich also, was dieser eine Gegner tut: 0,55 Angriffe, 0,25 Fertigkeiten, 0,15 Zauber je Sekunde.
    { const CAP = env.foeDps < 30 ? { atk: 0.42, skill: 0.2, spell: 0.12 } : { atk: 0.55, skill: 0.25, spell: 0.15 }, tot = { atk: 0, skill: 0, spell: 0 }, seen = new Set();
      res.forEach((D, i) => { if (i === 0) return; D.parts.forEach(p => { if (!p.intr || !p.sid) return; const k = i + ":" + p.sid; if (seen.has(k)) return; seen.add(k); tot[p.intr] += p.ips || 0; }); });
      const kf = {}; for (const t in CAP) kf[t] = tot[t] > CAP[t] ? CAP[t] / tot[t] : 1;
      if (Object.values(kf).some(v => v < 0.999)) res = res.map((D, i) => { if (i === 0 || !D.parts.some(p => p.intr && kf[p.intr] < 0.999)) return D; let dD = 0, dC = 0;
        const parts = D.parts.map(p => { const k = p.intr ? kf[p.intr] : 1; if (k >= 0.999) return p; if (p.cat === "ctrl") dC += p.dps * (1 - k); else if (p.cat === "dmg") dD += p.dps * (1 - k); return Object.assign({}, p, { dps: p.dps * k, detail: p.detail + ". Im Team zu " + Math.round(k * 100) + " % gezählt: Die Helden teilen sich die Gelegenheiten am selben Ziel" }); });
        return Object.assign({}, D, { total: D.total - dD, ctrl: Math.max(0, D.ctrl - dC), parts }); }); }
    // Wirkungslose Fertigkeiten: Was eine Heldenleiste unter guten Bedingungen leistet (ein Nahkämpfer im Team, nichts doppelt), in diesem Team aber gar nicht, steht in "dead".
    // Die Teamsuche nimmt solche Leisten nicht: Eine Fertigkeit, die hier nichts bewirkt, belegt nur einen Platz.
    res = res.map((D, i) => { if (i === 0) return D;
      const key = ["ideal", (env.wmods && env.wmods[i]) || "-", death.toFixed(3), bars[i].skills.join(","), [...eff[i]].join(";"), n, base.armor, base.foeDps, allies].join("|");
      let I = RUNMEMO.get(key); if (!I) { I = GW.dps(bars[i], eff[i], Object.assign({}, base, { meleeAlly: true, physRate: Math.max(first0.physical || 0, 0.67), hero: true, wmod: (env.wmods && env.wmods[i]) || null, bipPips: 0 })); RUNMEMO.set(key, I); }
      const sum = X => { const m = new Map(); X.parts.forEach(p => { if (p.sid) m.set(p.sid, (m.get(p.sid) || 0) + p.dps * (p.cat === "ctrl" ? 40 : 1)); }); return m; };
      const a = sum(I), b = sum(D), dead = [], deadCat = {}; a.forEach((v, sid) => { if (v > 1 && (b.get(sid) || 0) < 0.05 * v) { dead.push(sid); deadCat[sid] = I.parts.filter(p => p.sid === sid).sort((x, y) => y.dps * (y.cat === "ctrl" ? 40 : 1) - x.dps * (x.cat === "ctrl" ? 40 : 1))[0].cat; } });
      return dead.length ? Object.assign({}, D, { dead, deadCat }) : D; });
    return res;
  };
  // Team mit passender Kampfdauer: Wie schnell Gegner sterben, folgt aus dem Schaden des Teams. Lebenspunkte im schweren Modus nach Wiki ("Hard mode", Stufe 24 bis 28): rund 700, in Elite-Gebieten 850.
  // Annahme: Ein Kampf dauert doppelt so lange wie Lebenspunkte geteilt durch Schaden, weil Helden laut Wiki auch auf fast tote Gegner weiter Schaden machen, Ziele gewechselt werden und Gegner sich heilen.
  GW.teamDps = function (bars, eff, weapon0, n, env) {
    const HP = env.foeDps > 50 ? 850 : env.foeDps < 30 ? 500 : 700, K = 2, // normaler Modus: Stufe 20 bis 22, rund 500 Lebenspunkte
       deathOf = res => Math.max(n / 45, Math.min(n / 4, res.reduce((a, d) => a + (d ? d.total : 0), 0) / (HP * K)));
    const q = x => Math.round(x * 50) / 50;
    if (env.death) { const r = teamOnce(bars, eff, weapon0, n, env, q(env.death)); r.death = q(env.death); return r; }
    let death = q(0.3), res = null;
    for (let it = 0; it < 3; it++) { res = teamOnce(bars, eff, weapon0, n, env, death); const d2 = q((death + deathOf(res)) / 2); if (Math.abs(d2 - death) < 0.021) { death = d2; break; } death = d2; }
    res = teamOnce(bars, eff, weapon0, n, env, death); res.death = death; return res;
  };
  GW.effRanks = function (bar, runes) {
    const m = new Map(bar.attrs.filter(a => a[1] > 0));
    const add = { "Kopfteil +1": 1, "Überlegene Rune (+3)": 3, "Höhere Rune (+2)": 2, "Kleinere Rune (+1)": 1 };
    const seen = new Set();
    const prim = new Set(GW.PROF_ATTRS[bar.pri] || []);
    const hrSelf = bar.pri === 9 && bar.skills.some(id => { const x = GW.skill(id); return x && x.n === "Heroic Refrain"; });
    (runes || []).forEach(r => { if (!prim.has(r.attr)) return; const k = r.attr + "|" + (r.item === "Kopfteil +1" ? "h" : "r"); if (seen.has(k)) return; seen.add(k); m.set(r.attr, (m.get(r.attr) || 0) + (add[r.item] || 0)); });
    // Heroischer Refrain auf sich selbst (Wiki): +1...3 auf alle Attribute nach Führung, ab Führung 19 sind es +4. Mit Führung 16 hebt der erste Refrain auf 19, der zweite gibt dann +4. Ränge enden bei 20.
    if (hrSelf) { const hr = L => Math.round(1 + 2 * Math.min(20, L) / 15), L0 = m.get(40) || 0, b = hr(Math.min(20, L0 + hr(L0))); for (const [a, v] of [...m]) m.set(a, Math.min(20, v + b)); m.hrBonus = b; }
    return m;
  };
  // Gruppengröße: Wichtigste Helden zuerst behalten (Heilung/Schutz, dann Mesmer-Schaden, dann Rest)
  GW.trimSlots = function (slots, keep) {
    if (slots.length <= keep) return slots.map((s, i) => i);
    const score = (s, i) => {
      let d; try { d = GW.decode(s.code); } catch (e) { return [9, i]; }
      const top = d.attrs.slice().sort((a, b) => b[1] - a[1])[0] || [0, 0];
      const support = d.pri === 3 || (d.pri === 8 && [33, 32].includes(top[0])) || (d.pri === 4 && top[0] === 4) || /heil|schutz|mönch/i.test(s.role || "");
      const sub = /blut-ist-kraft/i.test(s.role || "") ? 0 : /seelenverflechtung|schutz/i.test(s.role || "") ? 0.1 : 0.2;
      return [support ? sub : d.pri === 5 ? 1 : 2, i];
    };
    // Kleine Gruppen brauchen nicht drei Unterstützer: bei bis zu 3 Helden höchstens 2, bei bis zu 5 höchstens 3. Der Rest geht an Schaden und Kontrolle.
    const maxSup = keep <= 3 ? 2 : keep <= 5 ? 3 : 99; let sup = 0;
    const ranked = slots.map((s, i) => score(s, i)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const first = ranked.filter(x => x[0] >= 1 || sup++ < maxSup);
    return first.slice(0, keep).map(x => x[1]).sort((a, b) => a - b);
  };
  // Builds mit beliebiger Primärklasse (PvX "Any/X") auf die gewählte Klasse umschreiben
  GW.adaptAny = function (code, pri) {
    const d = GW.decodeRaw(code);
    const sec = d.sec === pri ? 0 : d.sec;
    const skills = d.skills.map(id => { const s = GW.skill(id); return s && (!s.p || s.p === pri || s.p === sec) ? id : 0; });
    return GW.encode(pri, sec, d.attrs.filter(a => GW.allowedAttrs(pri, sec).has(a[0])), skills);
  };
})(typeof window !== "undefined" ? window : globalThis);

// ---------- Voraussetzungen: Titel und Verbrauchsgüter ----------
(function (G) {
  const GW = G.GW;
  const TITLE = { "Deldrimor rank": "Deldrimor-Titel", "Asura rank": "Asura-Titel", "Norn rank": "Norn-Titel", "Ebon Vanguard rank": "Ebon-Vorhut-Titel", "Sunspear rank": "Sonnenspeer-Titel", "Lightbringer rank": "Lichtbringer-Titel", "Allegiance rank": "Kurzick- oder Luxon-Titel" };
  GW.needs = function (bar, pageCons) {
    const sk = bar.skills.map(GW.skill).filter(Boolean);
    const titles = {};
    sk.forEach(s => { const t = TITLE[s.a]; if (t) (titles[t] = titles[t] || []).push(s.de || s.n); });
    const cons = new Map();
    // Alkohol nur, wenn die Leiste eine Fertigkeit hat, die betrunken anders wirkt (Wiki-Texte).
    const DRUNK = { "Drunken Master": "ohne Alkohol nur 10...15 % statt 25...33 % schneller", "Dwarven Stability": "ohne Alkohol verlängert sie nur Haltungen, der Schutz vor Niederschlag fehlt", "Feel No Pain": "die zusätzlichen Lebenspunkte gibt es nur betrunken" };
    const dr = sk.filter(s => DRUNK[s.n]), pageReq = (pageCons || []).includes("Alkohol nötig");
    if (dr.length) {
      const must = pageReq || dr.some(s => s.n === "Feel No Pain");
      cons.set(must ? "Alkohol" : "Alkohol (optional)", dr.map(s => (s.de || s.n) + ": " + DRUNK[s.n]).join("; ") + (pageReq ? ". Laut PvX-Seite Pflicht" : ""));
    }
    (pageCons || []).forEach(c => { if (c !== "Alkohol nötig" && c !== "Alkohol" && !cons.has(c)) cons.set(c, "laut PvX-Seite des Builds"); });
    return { titles: Object.entries(titles).map(([t, l]) => ({ title: t, skills: l })), cons: [...cons].map(([name, why]) => ({ name, why })) };
  };
})(typeof window !== "undefined" ? window : globalThis);
