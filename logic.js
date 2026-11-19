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
    return Math.round(+m[1] + (+m[2] - +m[1]) * Math.min(r, 21) / 15); };
  const strikeFactor = r => Math.pow(2, ((5 * Math.min(r, 12) + 2 * Math.max(0, r - 12)) - 60) / 40);

  function aoeMul(d, n) {
    if (/all other (adjacent|nearby) foes|to (adjacent|nearby) foes whenever target foe/.test(d)) return Math.max(0, n - 1);
    if (/75% of that damage to (nearby|adjacent)/.test(d)) return 1 + 0.75 * (n - 1);
    if (/to 3 adjacent foes|to up to 3/.test(d)) return Math.min(n - 1, 3) + (/target and/.test(d) ? 1 : 0) || 1;
    if (/(target and (nearby|adjacent|all nearby|all adjacent) foes|all (adjacent|nearby) foes|to (adjacent|nearby) foes|hits foes adjacent|foes in the area|and foes near)/.test(d)) return n;
    return 1;
  }

  // eff: Map Attribut -> Rang inkl. Runen; opts: {targets, weapon:[attr,typ], foeRate, physRate}
  GW.dps = function (bar, eff, opts) {
    const n = opts.targets || 1, out = [], notes = [];
    let fcUsed = false, fleeUsed = false;
    const INC = n * (opts.foeDps || 40);
    // Zielrüstung (Wiki "Armor rating"): je 40 Rüstung halbiert sich rüstungsabhängiger Schaden, 60 ist die Basis
    const AR = opts.armor || 60, af = Math.pow(2, (60 - AR) / 40), afAir = Math.pow(2, (60 - AR * 0.75) / 40);
    const armorOf = x => { const m = x.match(/\d (fire|cold|lightning|earth|slashing|piercing|blunt|physical|chaos|dark) damage/); return !m ? 1 : m[1] === "lightning" ? afAir : af; };
    const rank = a => eff.get(a) || 0;
    const sk = bar.skills.map((id, i) => [i, GW.skill(id)]).filter(x => x[1]);
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
    const DEATH = 1 / 6; // Annahme für alle Leisten: Im Kampf stirbt alle 6 s eine Kreatur (Leichen, Seelensammlung)
    let ias = 0, petIas = 0, critBonus = 0, wPer = 0, hitEnergy = 0, critEnergy = 0;
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
      let per = ((1 - crit) * avg + crit * w[2] * Math.SQRT2) * strikeFactor(r);
      wPer = per;
      if (w[0] === "Dolche") per *= 1 + (0.02 + 0.02 * r);
      notes.push("Kritische Treffer: Chance nach Spieler-Messung im Wiki (etwa 18 % bei Rang 12), bei Assassinen plus 1 % je Rang Kritische Stöße.");
      attackRate = 1 / (w[3] * (1 - ias / 100));
      const hits = Math.min(n, w[4]);
      wIdx = out.length;
      per *= af; wPer *= af;
      out.push({ name: "Normale Angriffe (" + w[0] + ")", dps: per * attackRate * hits, kind: "Waffe", detail: Math.round(per) + " je Treffer, alle " + (1 / attackRate).toFixed(2) + " s" + (ias ? " (Angriffstempo +" + Math.round(ias) + " %)" : "") + (hits > 1 ? ", " + hits + " Ziele" : "") });
      var critChance = crit;
    }
    // Energie
    let pips = REGEN[bar.pri] || 2;
    const income = pips / 3;
    const uses = [], minions = []; let usedTitle = false;
    for (const [i, s] of sk) {
      // Zwei gleiche Geister können nicht nebeneinander stehen (Wiki "Spirit"): Was ein anderer im Team schon setzt, zählt hier nicht noch einmal
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
      const parts = [];
      const sents = d.split(/(?<=[.:)]) /);
      const aoeAll = /(^|[.:)] )(also (hits|affects|strikes)|hits (\d+ )?(foes|all)|affects (foes|all)|strikes (foes|all))/.test(d);
      const aoeAt = rx => { const x = sents.find(q => rx.test(q)); const v = aoeMul(x || d, n) || 1; return v === 1 && aoeAll ? (aoeMul(d, n) || 1) : v; };
      // Bedingter Schaden (nur wenn der Gegner gerade zaubert, angreift oder eine Fertigkeit nutzt): halbe Trefferquote angenommen
      const condP = /if (target|that|this) foe is (casting|using|attacking|activating)|the next (spell|skill|attack)[^.]*that target foe|if target foe was (casting|attacking)|if that action was|interruption effect:|removal effect:|if (a|an|that) (condition|hex|enchantment) (is|was) removed|for each (condition|hex) removed/.test(d) ? 0.5 : 1;
      // Energiegewinn der Fertigkeit selbst
      let gain = 0;
      const gm = dRaw.match(/you gain (\d+(?:\.\.\.\d+)?) energy(?! (?:whenever|when|each time|for each|every))/) || dRaw.match(/health and (\d+(?:\.\.\.\d+)?) energy/);
      if (gm) gain = at(gm[1], r) * (condP < 1 ? 1 : / if |interrupt/.test(dRaw) ? 0.5 : 1);
      const el2 = dRaw.match(/causes (\d+(?:\.\.\.\d+)?) energy loss\. you gain (\d+) energy for each/); if (el2) gain = at(el2[1], r) * +el2[2];
      if (bar.pri === 9 && /shout|chant/i.test(s.t)) gain += Math.min(2 * (opts.allies || 8), Math.floor(rank(40) / 2));
      // Zustände
      for (const [k, p] of Object.entries(COND)) {
        const m = d.match(new RegExp("(inflicts?|causes?|suffers?|take|bleeding|burning|poison|disease)[^.]*?" + k + " \\((\\d+(?:\\.\\.\\.\\d+)?) seconds?"));
        if (m) { const cd = at(m[2], r); parts.push({ kind: "Zustand", per: p * 2 * cd, dur: cd, aoe: aoeAt(new RegExp(k + " \\(")), label: { burning: "Brennen", bleeding: "Blutung", poison: "Gift", disease: "Krankheit" }[k] }); }
      }
      // Verhexungs-Degeneration
      const hd = d.match(/(-?\d+\.\.\.\d+|\d+) health degeneration/);
      if (hd && /hex/i.test(s.t)) { const p = Math.abs(at(hd[1], r)); parts.push({ kind: "Degeneration", per: p * 2 * (dur || 1), dur: dur || 1, aoe: aoeAt(/health degeneration/), label: "Lebenspunkte-Degeneration" }); }
      // Direktschaden
      let dm = null;
      if (/for each point of energy lost/.test(d)) { const el = d.match(/causes (\d+\.\.\.\d+) energy loss/); const per = d.match(/deals (\d+) damage[^.]*for each point/); if (el && per) dm = at(el[1], r) * +per[1]; }
      if (dm == null) { const m = d.match(/(?:deals?|causes?|take|takes) \+?(\d+(?:\.\.\.\d+)?) (?:\w+ )?damage/); if (m) dm = at(m[1], r); }
      if (dm == null && !/(its attacks|these spirits) (deal|steal)/.test(dRaw)) { const m = dd.match(/\+?(\d+\.\.\.\d+) Punkte (?:\w+ )?(?:Sakral-|Feuer|Kälte|Blitz|Erd|Dunkel|Chaos|heiligen )?Schaden/); if (m) dm = at(m[1], r); }
      const dmS = (d.split(/(?<=[.:)]) /).find(x => /(?:deals?|causes?|take|takes) \+?\d+(?:\.\.\.\d+)? (?:\w+ )?damage/.test(x)) || d);
      const perAttack = /whenever you attack|when you attack|attacks deal|your attacks|whenever you hit|next \d+ attacks?/.test(dmS) || (dm != null && !/(?:deals?|causes?|take|takes) \+?\d/.test(d) && /Angriffe (verursachen|richten)/.test(dd));
      const onFoe = /whenever (this|target) foe (attacks|uses a skill|takes physical damage)|whenever it takes physical damage/.test(d);
      const onDeath = /if (target|this|that) (foe|ally|creature) dies|whenever [^.]* dies|exploits? (a|the|nearest) |corpse/.test(d);
      const endsK = d.match(/ends after (\d+(?:\.\.\.\d+)?) (?:hit|attack)/);
      if (dm != null) dm = dm * armorOf(dmS);
      const every = d.match(/(?:every|each) second \((\d+) seconds?\)/);
          // Flächenzauber am Boden: Gegner laufen heraus, im schweren Modus besonders schnell (Wiki "Hard mode"). Annahme: Die halbe Dauer trifft.
          const flee = every && /initial location|to location of|your location/.test(d) && !/knock/.test(d) ? 0.5 : 1; if (flee < 1) fleeUsed = true;
      if (/allies in this ward deal/.test(dRaw)) dm = null;
      if (dm != null && dm > 0) {
        const allyW = /weapon spell/i.test(s.t) && d.match(/ends after (\d+(?:\.\.\.\d+)?) attack/);
        if (allyW) {
          const k = at(allyW[1], r);
          parts.push({ kind: "Waffenzauber", per: dm * k, dur: 0, aoe: aoeMul(d, n), limit: (opts.physRate != null ? opts.physRate : attackRate) / Math.max(1, k), label: "Waffenzauber auf Verbündete, " + k + " Angriffe" });
        } else if (perAttack && !/attack/i.test(s.t) && endsK) {
          const k = at(endsK[1], r);
          parts.push({ kind: "Direkt", per: dm * k, dur: 0, aoe: aoeMul(d, n), limit: attackRate / Math.max(1, k), label: "je Treffer, endet nach " + k + " Treffern" });
        } else if (perAttack && !/attack/i.test(s.t)) {
          parts.push({ kind: "Pro Angriff", perAttack: Math.round(dm), dur: dur || 10, aoe: aoeMul(d, n), label: "Schaden je Angriff" });
        } else if (onFoe) {
          const phys = /physical damage/.test(d);
          const rate = phys ? (opts.physRate != null ? opts.physRate : attackRate) : (opts.foeRate || 0.5);
          const life = n / DEATH, live = Math.min(1, life / Math.max(life, Math.min(dur || 1, T)));
          parts.push({ kind: "Ausgelöst", per: dm * rate * (dur || 1) * live, dur: dur || 1, aoe: aoeMul(d, n), label: (phys ? "bei körperlichem Schaden am Ziel" : "wenn der Gegner handelt (Annahme)") + (live < 1 ? ", Ziel stirbt vorher" : "") });
        } else {
          const dual = /dual attack/i.test(s.t) ? 2 : 1;
          const deathP = /if (target|this|that) (foe|ally|creature) dies/.test(d) ? 0.5 : 1;
          const tot = (every ? dm * +every[1] * flee : dm) * deathP * (/pet attack/i.test(s.t) ? 1.33 : 1) * dual + (dual > 1 && w ? wPer : 0);
          parts.push({ kind: "Direkt", per: tot, dur: 0, aoe: aoeAt(/(?:deals?|causes?|take|takes) \+?\d+(?:\.\.\.\d+)? (?:\w+ )?damage/), limit: onDeath ? DEATH : undefined, label: onDeath ? "beim Tod eines Gegners (eine Leiche alle 6 s)" : dual > 1 ? "Doppelangriff, zwei Treffer" : /pet attack/i.test(s.t) ? "Tierangriff" : /attack/i.test(s.t) ? "Angriffsbonus" : condP < 1 ? "Direktschaden, bedingt (halbe Trefferquote)" : "Direktschaden" });
        }
      }
      const ward = dRaw.match(/allies in this ward deal \+(\d+(?:\.\.\.\d+)?) damage/);
      if (ward) { const D = dur || 20, hr = (opts.physRate || 0) + attackRate; if (hr) parts.push({ kind: "Verbündeten-Bonus", per: at(ward[1], r) * hr * D, dur: D, aoe: 1, label: "+" + at(ward[1], r) + " je Treffer in der Abwehr" }); }
      const ab = dRaw.match(/target ally deals (\d+(?:\.\.\.\d+)?) more damage in melee/) || dRaw.match(/(\d+(?:\.\.\.\d+)?) more damage whenever these party members hit with physical/);
      if (ab && opts.physRate) { const D = dur || 60; parts.push({ kind: "Verbündeten-Bonus", per: at(ab[1], r) * opts.physRate * D, dur: D, aoe: 1, label: "+" + at(ab[1], r) + " je Treffer des Nahkämpfers" }); }
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
      const healM = dd.match(/[Hh]eilt (?:die gesamte Gruppe |alle Gruppenmitglieder |alle Verbündeten |Euch |den Verbündeten )?um (\d+(?:\.\.\.\d+)?)/);
      const endHeal = dd.match(/Wirkung am Ende: Heilt (?:um )?(\d+(?:\.\.\.\d+)?)/);
      const conv = dd.match(/in Heilung um/) && dd.match(/maximal (\d+(?:\.\.\.\d+)?)/);
      if (trig) { const v = at(trig[1], r), D = sdur || 8, k = (d.match(/ends after (\d+)/) || [0, 99])[1]; const rate = /angreift oder einen Zauber/.test(dd) ? 0.67 : /mehr als 50/.test(dd) ? HITRATE * 0.8 : HITRATE; parts.push({ kind: "Heilung", per: v * Math.min(rate * D, +k), dur: D, aoe: mult, label: "Heilung bei Auslösung " + v }); }
      else if (endHeal) { const v = at(endHeal[1], r); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: mult, label: "Heilung am Ende " + v }); }
      else if (conv) { const v = Math.min(HIT, at(conv[1], r)); parts.push({ kind: "Heilung", per: v, dur: 0, aoe: 1, label: "Schaden wird Heilung " + v }); }
      else if (healM && !/Diener|Geist verliert/.test(dd)) { const v = at(healM[1], r); if (v > 0) parts.push({ kind: "Heilung", per: v, dur: 0, aoe: mult, label: "Heilung " + v }); }
      // verhinderter Schaden
      const D2 = sdur || (enchant ? 60 : 0);
      if (D2) {
        const capM = /auf 10% der maximalen Lebenspunkte/.test(dd) || /more than 10% maximum health/i.test(d);
        const redM = dd.match(/[Rr]eduziert erlittenen Schaden[^.]*?um (\d+(?:\.\.\.\d+)?)/) || d.match(/reduced by (\d+(?:\.\.\.\d+)?)/) || dd.match(/um (\d+(?:\.\.\.\d+)?) Punkte reduziert/);
        const blkM = d.match(/(\d+)% chance to block/);
        const armM = d.match(/\+(\d+(?:\.\.\.\d+)?) armor/);
        let perHit = 0, lab = "";
        if (capM) { perHit = Math.max(0, HIT - 0.1 * MAXHP); lab = "Schadensgrenze 10 %"; }
        else if (redM) { perHit = Math.min(HIT, at(redM[1], r)); lab = "−" + at(redM[1], r) + " je Treffer"; }
        else if (blkM) { perHit = HIT * (+blkM[1]) / 100; lab = blkM[1] + " % Blocken"; }
        else if (armM && !/hex/i.test(s.t)) { const a = at(armM[1], r); perHit = HIT * (1 - Math.pow(2, -a / 40)); lab = "+" + a + " Rüstung"; }
        // Wirkt der Effekt nur auf den Wirker selbst ("You have +20 armor"), schützt er nur dessen Anteil an den Treffern
        const selfOnly = /you have \+\d+(\.\.\.\d+)? armor|you (have|gain) (a )?\d+(\.\.\.\d+)?% chance to block|you block/i.test(d);
        if (perHit > 0) parts.push({ kind: "Schutz", per: perHit * (selfOnly ? INC / allies / HIT : HITRATE) * D2, dur: D2, aoe: selfOnly ? 1 : mult, label: lab + (selfOnly ? ", nur für den Helden selbst" : "") });
      }
      // ---- Diener und Geister (Wiki: Minion, Bone Horror, Bone Fiend, Flesh Golem, Spirit) ----
      const lvM = d.match(/level (\d+\.\.\.\d+) (bone horror|bone fiend|vampiric horror|shambling horror|flesh golem|bone minion)/) || d.match(/creates? (?:two|2) level (\d+\.\.\.\d+) (bone minion)/) || d.match(/animates? a level (\d+\.\.\.\d+) (bone horror)/);
      if (lvM) {
        const L = at(lvM[1], r), kind = lvM[2];
        const mean = (kind === "flesh golem" ? 3.5 : 1.53) * L, per = mean / (kind === "bone fiend" ? 1.86 : 3.10);
        minions.push({ s, per, count: /two|2 level/.test(d) || kind === "bone minion" ? 2 : 1, max: kind === "flesh golem" ? 1 : 99, rate: 1 / Math.max(1, rc + ac + 0.75), cost, L, kind, i });
      }
      const spA = dRaw.match(/(?:its attacks|these spirits|attacks) (?:deal|steal) (\d+(?:\.\.\.\d+)?) (?:damage|health)/);
      if (spA && /ritual|signet/i.test(s.t) && /spirit/.test(dRaw)) {
        const dmgS = at(spA[1], r), life = lifeM ? at(lifeM[1], r) : (d.match(/\((\d+)[- ]second lifespan\)/) || [0, 30])[1] * 1;
        const cnt = (d.match(/creates (\d) level/) || [0, 1])[1] * 1;
        // Geister stehen fest und müssen in jedem Kampf neu gesetzt werden: 70 % der Zeit im Einsatz (Annahme)
        parts.push({ kind: "Geist", per: dmgS * 0.5 * life * cnt * 0.7 * (/double damage to hexed/.test(dRaw) ? 1.5 : 1), dur: life, aoe: 1, label: cnt + (cnt > 1 ? " Geister" : " Geist") + ", " + dmgS + " alle 2 s, 70 % im Einsatz" });
      }
      // Gunst der Götter: Mönchszauber auf Verbündete heilen zusätzlich 3,2 je Rang (Wiki "Divine Favor")
      if (bar.pri === 3 && s.p === 3 && /spell/i.test(s.t) && /Verbündete/.test(dd) && rank(16) > 0) parts.push({ kind: "Heilung", per: Math.round(3.2 * rank(16)), dur: 0, aoe: 1, label: "Gunst der Götter " + Math.round(3.2 * rank(16)) });
      const isMinion = minions.some(m => m.i === i);
      const isCtrl = s.n === "Panic" || /knock[s]?[- ]?down|interrupt|Dazed|Blind|disable/i.test(s.d || "") && !/enchantment|stance|shout|chant|form/i.test(s.t.replace(/hex/i, "")) || /Dazed|Blind|knock/i.test(s.d || "") && /attack|shout/i.test(s.t);
      if (!parts.length && !gain && !isMinion && !isCtrl) continue;
      // Wie oft wird die Fertigkeit genutzt? Effekte mit Dauer werden nur gehalten, nicht gestapelt.
      const holds = parts.length > 0 && parts.every(p => p.dur > 0 && p.kind !== "Direkt");
      let rate = 1 / (holds ? Math.max(T, parts[0].dur) : T);
      if (isMinion) rate = Math.min(rate, DEATH);
      if (adr) rate = Math.min(rate, attackRate / adr);
      const lim = parts.find(p => p.limit != null); if (lim) rate = Math.min(rate, lim.limit);
      rate *= condP; // bedingte Fertigkeiten (Unterbrechung, Entfernung) werden nur halb so oft gewirkt und kosten dann auch nur halb so viel
      const isAtk = /attack/i.test(s.t) && !/pet attack/i.test(s.t);
      uses.push({ s, i, rate, cost, gain, parts, holds, isAtk, time: isAtk ? 0 : ac + (/spell/i.test(s.t) ? 0.75 : 0), minion: isMinion });
    }
    // Energie: Grundregeneration plus Seelensammlung, Kritische Stöße, Führung, eigene Energie-Fertigkeiten und Blut ist Kraft aus dem Team
    let extra = 0; const eNotes = [];
    if (bar.pri === 4 && rank(6) > 0) { const v = rank(6) * Math.min(3 / 15, DEATH); extra += v; eNotes.push("Seelensammlung +" + v.toFixed(1)); }
    if (bar.pri === 7 && w && rank(35) >= 3) { const e = rank(35) >= 13 ? 3 : rank(35) >= 8 ? 2 : 1, v = attackRate * (critChance || 0) * e; extra += v; eNotes.push("Kritische Stöße +" + v.toFixed(1)); }
    if (w && hitEnergy) { const v = attackRate * hitEnergy; extra += v; eNotes.push("Energie je Treffer +" + v.toFixed(1)); }
    if (w && critEnergy) { const v = attackRate * (critChance || 0) * critEnergy; extra += v; eNotes.push("Energie je kritischem Treffer +" + v.toFixed(1)); }
    if (opts.bipPips) { extra += opts.bipPips / 3; eNotes.push("Energie aus dem Team +" + (opts.bipPips / 3).toFixed(1)); }
    const corpse = minions.length ? Math.min(1, DEATH / uses.filter(u => u.minion).reduce((a, u) => a + u.rate, 0)) : 1;
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
    // Stärke (Wiki "Strength"): 1 % Rüstungsdurchdringung je Rang, nur bei Angriffsfertigkeiten. Wirkt auf den Waffenschaden dieser Treffer.
    if (bar.pri === 1 && rank(17) > 0 && wIdx >= 0 && attackRate > 0) {
      const share = Math.min(1, uses.filter(u => u.isAtk).reduce((a, u) => a + u.rate, 0) / attackRate), fac = Math.pow(2, AR * rank(17) / 100 / 40) - 1, v = out[wIdx].dps * share * fac;
      if (v > 0.05) out.push({ name: "Stärke", dps: v, cat: "dmg", kind: "Waffe", detail: rank(17) + " % Rüstungsdurchdringung bei " + Math.round(share * 100) + " % der Treffer (Angriffsfertigkeiten)" });
    }
    for (const u of uses) {
      const rate = u.rate;
      let dps = 0; const det = [];
      for (const p of u.parts) {
        if (p.kind === "Pro Angriff") { const up = Math.min(1, p.dur * rate); const v = p.perAttack * attackRate * up * p.aoe; dps += v; det.push(p.label + " " + p.perAttack + (attackRate ? "" : " (keine Waffe erkannt)")); }
        else if (p.dur > 0) { const up = Math.min(1, p.dur * rate); const v = (p.per / p.dur) * up * p.aoe; dps += v; det.push(p.label + " " + Math.round(up * 100) + " % Laufzeit"); }
        else { const v = p.per * rate * p.aoe; dps += v; det.push(p.label + " " + Math.round(p.per) + " alle " + (1 / rate).toFixed(1) + " s"); }
      }
      // nach Art aufteilen
      const by = { dmg: 0, heal: 0, prot: 0 };
      u.parts.forEach((p, j) => { const v = p.kind === "Pro Angriff" ? p.perAttack * attackRate * Math.min(1, p.dur * rate) * p.aoe : p.dur > 0 ? (p.per / p.dur) * Math.min(1, p.dur * rate) * p.aoe : p.per * rate * p.aoe; by[p.kind === "Heilung" ? "heal" : p.kind === "Schutz" ? "prot" : "dmg"] += v; });
      for (const k of ["dmg", "heal", "prot"]) if (by[k] > 0.05) out.push({ name: u.s.de || u.s.n, sid: u.s.id, dps: by[k], cat: k, kind: u.parts.filter(p => (p.kind === "Heilung" ? "heal" : p.kind === "Schutz" ? "prot" : "dmg") === k).map(p => p.kind).join("/"), detail: det.filter((x, j) => (u.parts[j].kind === "Heilung" ? "heal" : u.parts[j].kind === "Schutz" ? "prot" : "dmg") === k).join(", ") });
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
      const add = (v, label) => { if (v > 0.005) out.push({ name: sx.de || sx.n, sid: sx.id, dps: v, cat: "ctrl", kind: "Kontrolle", detail: label }); };
      if (sx.n === "Panic") { const dur = secs(/\((\d+(?:\.\.\.\d+)?) seconds?/), up = Math.min(1, dur * rate), frac = n > 1 ? Math.min(0.8, (n - 1) * (opts.foeRate || 0.5) * 0.8) : 0; add(up * n * frac, "Panik: " + Math.round(frac * 100) + " % der Fertigkeiten von " + n + " Gegnern scheitern, " + Math.round(up * 100) + " % Laufzeit"); continue; }
      const kd = /caus\w* knock[- ]?down|knocks? down|is knocked down for|are knocked down(?! foe)|knock(?:ed)?[- ]down (?:target|all|that|nearby|adjacent)|and knocked down/i.test(d) && !/cannot be knocked|if you are knocked|you are knocked down|immune/i.test(d);
      if (kd) { const dur = secs(/knock[- ]?down[^.]*?\((\d+(?:\.\.\.\d+)?) seconds?\)/i) || secs(/for (\d+(?:\.\.\.\d+)?) seconds?[^.]*knock/i) || 2; const c = /if|unless|moving|attacking|casting|using a skill|\d+% chance/i.test(d) ? 0.5 : 1; add(rate * dur * Math.max(1, aoeMul(d, n)) * c, "Niederschlag " + dur + " s" + (c < 1 ? ", an Bedingung geknüpft" : "")); }
      if (/interrupt/i.test(d) && !/easily interrupted|cannot be interrupted|not interrupt|if interrupted|is interrupted/i.test(d)) add(rate * 2 * 0.5 * Math.max(1, /all (other )?(nearby|adjacent) foes|foes in the area/i.test(d) ? aoeMul(d, n) : 1), "Unterbrechung: je Treffer 2 s verloren, jede zweite sitzt (Annahme)");
      if (/Dazed/.test(d) && /inflict|causes?|are Dazed|is Dazed|become/i.test(d)) { const dur = secs(/Dazed[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?\)/) || secs(/Dazed (?:condition )?for (\d+(?:\.\.\.\d+)?) seconds?/) || 5; add(Math.min(1, rate * dur) * 0.75 * CAST * cond * Math.max(1, aoeMul(d, n)), "Benommenheit " + dur + " s: Zauberer fast ausgeschaltet"); }
      if (/Blind/.test(d) && /inflict|causes?|are Blinded|become Blind|Blindness/i.test(d) && !/remove|lose|cure|if you are blind/i.test(d)) { const dur = secs(/Blind(?:ness|ed)?[^.(]*\((\d+(?:\.\.\.\d+)?) seconds?\)/) || secs(/Blind(?:ness|ed)? (?:condition )?for (\d+(?:\.\.\.\d+)?) seconds?/) || 5; add(Math.min(1, rate * dur) * 0.9 * MELEE * cond * Math.max(1, aoeMul(d, n)), "Blindheit " + dur + " s: 90 % der Angriffe gehen daneben"); }
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
      let left = cap; const got = [];
      minions.sort((a, b) => a.max - b.max).forEach(m => { const u = uses.find(x => x.i === m.i); const want = Math.min(m.max, (u ? u.rate : 0) * m.count * life(m.L) / 2); const share = Math.min(want, left); left -= share; if (share > 0.05) { got.push(share); out.push({ name: m.s.de || m.s.n, sid: m.s.id, dps: share * m.per * af, cat: "dmg", kind: "Diener", detail: share.toFixed(1) + " Diener im Schnitt, Stufe " + m.L + ", je " + m.per.toFixed(1) + "/s" }); } });
      notes.push("Diener: Im Schnitt " + got.reduce((a, b) => a + b, 0).toFixed(1) + " von höchstens " + cap + ". Gerechnet mit einer Leiche alle 6 s. Lebensdauer: die Hälfte der Zerfallszeit laut Wiki, weil Diener im Kampf auch durch Gegner sterben (Annahme).");
    }
    // Tiergefährte (Wiki "Animal companion"): Stufe 20, im Schnitt 24,4 je Treffer bei Tierbeherrschung 12, +33 % in PvE, ein Angriff alle 2 s
    if (sk.some(x => ["Charm Animal", "Comfort Animal", "Heal as One"].includes(x[1].n))) {
      const bm = rank(22), per = 24.4 * 1.33 * af * strikeFactor(bm) / strikeFactor(12), iv = 2 * (1 - petIas / 100);
      out.push({ name: "Tiergefährte", dps: per / iv, cat: "dmg", kind: "Tier", detail: Math.round(per) + " je Treffer, alle " + iv.toFixed(2) + " s" + (petIas ? " (Angriffstempo +" + Math.round(petIas) + " %)" : "") });
      notes.push("Tiergefährte: Wiki-Messwert für Tierbeherrschung 12, auf deinen Rang umgerechnet wie Waffenschaden. Diese Umrechnung ist eine Annahme.");
    }
    if (fleeUsed) notes.push("Flächenzauber am Boden zählen mit halber Dauer, weil Gegner herauslaufen (Annahme).");
    if (fcUsed) notes.push("Schnellwirkung " + rank(0) + ": Wirkzeit " + Math.round(Math.pow(0.5, rank(0) / 15) * 100) + " %, Aufladezeit der Mesmer-Zauber " + Math.round(Math.max(0.4, 1 - 0.03 * rank(0)) * 100) + " %.");
    if (AR !== 60) notes.push("Zielrüstung " + AR + ": Waffen-, Diener-, Tier- und Elementarschaden zählen zu " + Math.round(af * 100) + " %. Rüstungsignorierender Schaden bleibt voll.");
    if (usedTitle) notes.push("Titel-Fertigkeiten sind mit maximalem Titelrang gerechnet.");
    out.forEach(o => { if (!o.cat) o.cat = "dmg"; });
    const sum = c => out.filter(o => o.cat === c).reduce((a, o) => a + o.dps, 0);
    // Schutz überlappt: Ein geblockter Treffer kann nicht noch einmal gedeckelt werden. Zusammen nie mehr als der Schaden, der ankommt.
    { const ps = out.filter(o => o.cat === "prot" && o.dps > 0), raw = ps.reduce((a, o) => a + o.dps, 0); if (raw > 0) { const comb = INC * (1 - ps.reduce((a, o) => a * (1 - Math.min(0.95, o.dps / INC)), 1)); ps.forEach(o => { o.dps *= comb / raw; }); } }
    const total = sum("dmg"), heal = sum("heal"), prot = sum("prot"), ctrl = Math.min(n, sum("ctrl"));
    if (ctrl > 0.05) notes.push("Kontrolle: Im Schnitt " + ctrl.toFixed(1).replace(".", ",") + " von " + n + " Gegnern ausgeschaltet. Annahmen: Die Hälfte der Gegner zaubert, die Hälfte greift an. Eine Unterbrechung kostet 2 s und jede zweite sitzt.");
    return { total, heal, prot, ctrl, incoming: INC, parts: out.filter(o => o.dps > (o.cat === "ctrl" ? 0.005 : 0.05)).sort((a, b) => b.dps - a.dps), notes, attackRate, physical: w ? attackRate : 0, energyF: f };
  };
  // Effektive Ränge aus Grundwerten plus Runen der Ausrüstungsempfehlung
  GW.effRanks = function (bar, runes) {
    const m = new Map(bar.attrs.filter(a => a[1] > 0));
    const add = { "Kopfteil +1": 1, "Überlegene Rune (+3)": 3, "Höhere Rune (+2)": 2, "Kleinere Rune (+1)": 1 };
    const seen = new Set();
    const prim = new Set(GW.PROF_ATTRS[bar.pri] || []);
    (runes || []).forEach(r => { if (!prim.has(r.attr)) return; const k = r.attr + "|" + (r.item === "Kopfteil +1" ? "h" : "r"); if (seen.has(k)) return; seen.add(k); m.set(r.attr, (m.get(r.attr) || 0) + (add[r.item] || 0)); });
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
