// Apex League (beta). Plain JS. Stage 1: the world event, the four-season countdown, rumours, the two contracts (Apex or domestic), AI decisions,
// the owner's choice and the field-strength check. State lives on the world as `w.apex` (a plain object, saved with the world).
// Everything is inert when `w.apex` is missing, so normal worlds are unchanged. Money here is euros (millions) = engine units x cfg.money_x.
// Randomness is keyed (a hash of seed + club + season), never a running RNG: reloading a save gives the same answers.
$mods["apex"] = (function () {
  const H = (s) => $crc32($utf8(s)) / 4294967296;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10;
  const COUNTDOWN = 4, MAXN = 16, MINN = 4, EXTRA = 4, MAX_DELAYS = 2;
  const X = (w) => w.cfg.money_x;
  const C = (w, n) => w.clubs.get(n);
  const key = (w, ...a) => w.seed + "|apex|" + a.join("|");
  const fail = (m, c) => { throw $new($mods.app_v11.ApiError, [m, c === undefined ? 400 : c]); };

  // ---- the club's pull: size, strength and money (about half stature, a third rating, a fifth income) ---------------------------------------
  function incomeMax(w) { let m = 1; for (const n of w.clubs.keysArr()) m = Math.max(m, C(w, n).get("income")); return m; }
  function score(w, n, im) { const c = C(w, n); return 0.5 * c.get("stature") + 0.3 * c.get("eff") + 0.2 * 100 * c.get("income") / (im || incomeMax(w)); }
  function ranking(w) {
    const im = incomeMax(w), sc = {}; for (const n of w.clubs.keysArr()) sc[n] = score(w, n, im);
    return w.clubs.keysArr().slice().sort((a, b) => sc[b] - sc[a] || (a < b ? -1 : 1)).map((n) => ({ club: n, score: r1(sc[n]) }));
  }
  // how rich a league is next to the richest one (0..1): the domestic counter-offer scales with it
  function leagueRel(w) {
    const avg = {}; let best = 1;
    for (const ln of w.leagues.keysArr()) { const L = w.leagues.get(ln), names = L.get("clubs"); let s = 0; for (const n of names) s += C(w, n).get("income"); avg[ln] = names.length ? s / names.length : 0; best = Math.max(best, avg[ln]); }
    const out = {}; for (const ln of Object.keys(avg)) out[ln] = avg[ln] / best; return out;
  }

  // ---- set up ------------------------------------------------------------------------------------------------------------------------------
  function init(w, opts) {
    opts = opts || {}; const start = w.season;
    const announce = opts.announce ? +opts.announce : start + 1 + Math.floor(H(w.seed + "|apexyr") * 2);
    w.apex = { v: 1, on: true, state: "pre", announce, inaugural: announce + COUNTDOWN - 1, offers: {}, ai: {}, choice: null, pending: null, members: [], delays: 0, founded: null, log: [] };
    return w.apex;
  }
  const say = (w, t) => { const a = w.apex; a.log.unshift({ season: w.season, t }); if (a.log.length > 40) a.log.length = 40; w.news("apex", t); };

  // ---- the contracts ----------------------------------------------------------------------------------------------------------------------
  function makeOffer(w, n, rel) {
    const c = C(w, n), inc = c.get("income") * X(w), h = H(key(w, "off", n, w.season)), ln = c.get("league");
    const apex_pay = r1(0.45 * inc * (0.9 + 0.2 * h));                                  // extra money a year on top of today's income
    const f = clamp(0.35 + 0.65 * (rel[ln] || 0.5), 0.35, 0.98);                          // a rich league can come close; a poor one cannot
    const dom_pay = r1(apex_pay * f), years = 3 + Math.floor(H(key(w, "yrs", n, w.season)) * 3);
    return { club: n, league: ln, apex_pay, dom_pay, years, ratio: r1(f * 100) / 100 };
  }
  // an AI club weighs the extra money against what its league offers, its own size and a little temperament
  function aiChoice(w, o) {
    const c = C(w, o.club), inc = Math.max(1, c.get("income") * X(w));
    const u = (o.apex_pay - o.dom_pay) / inc * 6 + (c.get("stature") - 80) / 30 - 0.35 + (H(key(w, "mood", o.club)) - 0.5) * 1.6;   // a little loyalty to the old league
    return u > 0;
  }
  function openContracts(w) {
    const a = w.apex, rel = leagueRel(w), rk = ranking(w), me = w.ow && w.ow.club;
    a.state = "contracts"; const take = rk.slice(0, MAXN + EXTRA);
    for (const t of take) {
      const o = makeOffer(w, t.club, rel); a.offers[t.club] = o;
      if (t.club === me) a.pending = { club: me, season: w.season }; else { a.ai[t.club] = aiChoice(w, o) ? "apex" : "stay"; if (a.ai[t.club] === "apex") say(w, t.club + " signs with the Apex League."); }
    }
    say(w, "Apex League contracts are on the table. The first season is planned for season " + a.inaugural + ".");
  }
  function signedList(w) {
    const a = w.apex, me = w.ow && w.ow.club, rk = ranking(w), pos = {}; rk.forEach((r, i) => (pos[r.club] = i));
    const l = Object.keys(a.ai).filter((n) => a.ai[n] === "apex" && n !== me);
    if (me && a.pending && a.choice === "apex") l.push(me);
    return l.sort((x, y) => pos[x] - pos[y]).slice(0, MAXN);
  }
  // does the signed field make a league? a few giants can carry a small one; weaker clubs need more of them
  const need = (n) => clamp(92 - 2.2 * (n - MINN), 62, 92);
  function strength(w, list) {
    const n = list.length, mean = n ? list.reduce((s, x) => s + C(w, x).get("stature"), 0) / n : 0;
    return { n, mean: r1(mean), need: r1(need(n)), go: n >= MINN && mean >= need(n) };
  }

  // ---- the owner's choice -----------------------------------------------------------------------------------------------------------------
  function choose(w, action) {
    const a = w.apex, me = w.ow && w.ow.club;
    if (!a || a.state !== "contracts" || !a.pending || a.pending.club !== me) fail("There is no Apex contract waiting for you.", 409);
    if (action !== "apex" && action !== "stay") fail("Choose apex or stay.");
    a.choice = action; return { ok: true, choice: action };
  }
  function mustDecide(w) { const a = w && w.apex; return !!(a && a.on && a.state === "contracts" && a.pending && !a.choice && w.ow && w.ow.club === a.pending.club && w.season === a.inaugural - 1); }


  // ---- stage 2: the league itself --------------------------------------------------------------------------------------------------------
  const NAME = "Apex League", KEEP = 10;                       // a domestic league never drops under 10 clubs
  const fullLen = (n) => (n % 2 === 0 ? 2 * (n - 1) : 2 * n);     // matchweeks of a home-and-away season (an odd field has byes)
  // clubs may only leave while their league keeps enough clubs to play a season
  function eligible(w, list) {
    const out = [], gone = {};
    for (const n of list) {
      const ln = C(w, n).get("league"), size = w.leagues.get(ln).get("clubs").length;
      if (size - (gone[ln] || 0) > KEEP) { gone[ln] = (gone[ln] || 0) + 1; out.push(n); } else say(w, ln + " refuses to let " + n + " go: it would not have enough clubs left to play a season.");
    }
    return out;
  }
  function formLeague(w, list) {
    const a = w.apex, n = list.length, bases = $dict($kw({}));
    // 1: the clubs leave their domestic leagues, and those leagues shrink to a full home-and-away season of what is left
    const touched = new Set();
    for (const m of list) {
      const c = C(w, m), ln = c.get("league"), L = w.leagues.get(ln), arr = L.get("clubs"), i = arr.indexOf(m);
      if (i >= 0) arr.splice(i, 1);                                // in place: league_clubs shares this array
      touched.add(ln); c.set("league", NAME); bases.set(m, c.get("base"));
      for (const p of w.players) if (p.club === m) p.league = NAME;
      c.set("last_finish", list.indexOf(m) + 1);
    }
    for (const ln of touched) { const L = w.leagues.get(ln); L.set("games", Math.min(L.get("games"), fullLen(L.get("clubs").length))); }
    // 2: the league itself: a real entry in the world's league list, so tables, income, awards and history all work
    const avg = list.reduce((s, m) => s + C(w, m).get("base"), 0) / n, sd = Math.sqrt(list.reduce((s, m) => s + Math.pow(C(w, m).get("base") - avg, 2), 0) / n);
    const A = $dict($kw({ name: NAME, country: "World", confed: "WORLD", prestige: 100, games: fullLen(n), foreign: 0.6, clubs: list.slice(), bases, target: avg, start_avg: avg, start_std: sd, tvmult: 1.1, slots: 0, coef_hist: [2.5, 2.5, 2.5, 2.5, 2.5] }));
    A.set("coef0", 12.5);
    w.leagues.set(NAME, A); w.league_clubs.set(NAME, A.get("clubs"));
    for (const nm of w.nations.keysArr()) { const lst = w.prox.get(nm); if (lst && !lst.some((x) => x[0] === NAME)) lst.push([NAME, 0.4]); }
    // 3: the continental cups lose these clubs, and the places pass down each league's table
    const last = w.hist[w.hist.length - 1], tb = last && last.get("tables"), mem = new Set(list);
    if (tb) { const t2 = new $Dict(); for (const ln of tb.keysArr()) t2.set(ln, tb.get(ln).filter((x) => !mem.has(x))); w.compute_cup_fields(t2); }
    // 4: next season's income already includes the contract money
    for (const m of list) { const c = C(w, m), add = a.offers[m].apex_pay / X(w); c.set("income", c.get("income") + add); c.set("budget", Math.max(c.get("budget"), c.get("income"))); }
  }
  // each rollover while the league lives: contract money, and the owner's fan backlash fading
  function afterSeason(w) {
    const a = w.apex; if (!a || !a.on || a.state !== "live") return;
    for (const m of a.members) { const c = C(w, m.club); if (c) c.set("prize", c.get("prize", 0) + m.pay / X(w)); m.years = Math.max(0, m.years - 1); }
    const o = w.ow; if (o && o.apex_fans > 0) { const back = Math.min(4, o.apex_fans); o.apex_fans -= back; o.fans = clamp(o.fans + back, 0, 100); }
  }

  // ---- hooks ------------------------------------------------------------------------------------------------------------------------------
  // the start of a season: word gets out, then the contracts open in the third season of the countdown
  function startSeason(w) {
    const a = w.apex; if (!a || !a.on) return; const s = w.season;
    if (a.state === "pre" && s >= a.announce) { a.state = "rumour"; say(w, "Word is out: the biggest clubs are planning a breakaway Apex League, with a first season planned for season " + a.inaugural + "."); }
    else if (a.state === "rumour" && s > a.announce) {
      const left = a.inaugural - s, rk = ranking(w), who = rk.slice(0, 3 + (COUNTDOWN - left) * 2).map((r) => r.club);
      say(w, "Apex rumours: " + who.slice(0, 4).join(", ") + " are said to be in talks. " + left + " season" + (left === 1 ? "" : "s") + " to go.");
    }
    if (a.state === "rumour" && s >= a.inaugural - 1) openContracts(w);
  }
  // the end of the season before the first one: contracts are locked and the league goes ahead, is delayed or never starts
  function resolve(w) {
    const a = w.apex; if (!a || !a.on) return;
    if (a.state === "live") return afterSeason(w);
    if (a.state !== "contracts" || w.season < a.inaugural - 1) return;
    const me = w.ow && w.ow.club; let list = signedList(w);
    if (me && a.pending && !a.choice) a.choice = "stay";
    if (list.length > MAXN) { for (const n of list.slice(MAXN)) { if (n !== me) a.ai[n] = "stay"; } list = list.slice(0, MAXN); }
    list = eligible(w, list);
    const st = strength(w, list);
    if (st.go) {
      a.state = "live"; a.members = list.map((n) => ({ club: n, years: a.offers[n].years, from: a.inaugural, pay: a.offers[n].apex_pay })); a.founded = a.inaugural;
      say(w, "The Apex League is a go: " + list.length + " clubs will play in season " + a.inaugural + ".");
      formLeague(w, list);
      if (me && list.includes(me)) { const o = w.ow; o.fans = clamp(o.fans - 14, 0, 100); o.apex_fans = 14; }
    } else if (a.delays < MAX_DELAYS) {
      a.delays++; a.inaugural++; const rel = leagueRel(w), rk = ranking(w);
      say(w, "The Apex League is delayed: " + list.length + " clubs signed, not enough strength. More invitations go out.");
      for (const t of rk.slice(0, MAXN + EXTRA + 6 * a.delays)) { if (a.offers[t.club]) continue; const o = makeOffer(w, t.club, rel); a.offers[t.club] = o; if (t.club === me) { a.pending = { club: me, season: w.season }; a.choice = null; } else { a.ai[t.club] = aiChoice(w, o) ? "apex" : "stay"; if (a.ai[t.club] === "apex") say(w, t.club + " signs with the Apex League."); } }
    } else { a.state = "dead"; say(w, "The Apex League collapses before it starts: too few big clubs."); }
  }

  // ---- views --------------------------------------------------------------------------------------------------------------------------------
  function view(w) {
    const a = w.apex; if (!a || !a.on) return { on: false };
    const me = w.ow && w.ow.club, rk = ranking(w), rel = leagueRel(w);
    const out = { on: true, state: a.state, announce: a.announce, inaugural: a.inaugural, season: w.season, seasons_left: Math.max(0, a.inaugural - w.season), delays: a.delays, log: a.log.slice(0, 12), max: MAXN, min: MINN };
    if (a.state === "pre") return out;
    out.rumours = rk.slice(0, 16).map((r, i) => ({ club: r.club, rank: i + 1, league: C(w, r.club).get("league"), score: r.score, said: a.ai[r.club] === "apex" ? "signed" : a.ai[r.club] === "stay" ? "staying" : i < 6 ? "very likely" : i < 12 ? "likely" : "possible" }));
    if (a.state === "contracts") {
      const l = signedList(w), st = strength(w, l);
      out.signed = l.map((n) => ({ club: n, stature: Math.round(C(w, n).get("stature")), mine: n === me })); out.strength = st;
      if (a.pending && me && a.pending.club === me) { const o = a.offers[me]; out.offer = { apex_pay: o.apex_pay, dom_pay: o.dom_pay, years: o.years, league: o.league, league_rel: Math.round((rel[o.league] || 0) * 100), choice: a.choice, fan_hit: 14, deadline: a.inaugural - 1 }; }
    }
    if (a.state === "live") out.members = a.members.map((m) => ({ club: m.club, years: m.years, mine: m.club === me }));
    return out;
  }
  return { NAME, fullLen, init, startSeason, resolve, choose, mustDecide, view, ranking, strength, need, leagueRel };
})();
