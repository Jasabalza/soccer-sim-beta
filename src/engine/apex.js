// Apex League (beta). Plain JS. Stage 1: the world event, the four-season countdown, rumours, the two contracts (Apex or domestic), AI decisions,
// the owner's choice and the field-strength check. State lives on the world as `w[K]` (a plain object, saved with the world).
// Everything is inert when `w[K]` is missing, so normal worlds are unchanged. Money here is euros (millions) = engine units x cfg.money_x.
// Randomness is keyed (a hash of seed + club + season), never a running RNG: reloading a save gives the same answers.
// A breakaway league is built from a config (CF), so the Apex League and later the Omega League share this engine.
$mods["breakaway"] = function (CF) {
  const H = (s) => $crc32($utf8(s)) / 4294967296;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10;
  const COUNTDOWN = CF.countdown, MAXN = CF.maxn, MINN = CF.minn, EXTRA = CF.extra, MAX_DELAYS = CF.max_delays, K = CF.key;
  const X = (w) => w.cfg.money_x;
  const C = (w, n) => w.clubs.get(n);
  const key = (w, ...a) => w.seed + "|" + K + "|" + a.join("|");
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
    const announce = opts.announce ? +opts.announce : start + 1 + Math.floor(H(w.seed + "|" + K + "yr") * 2);
    w[K] = { v: 1, on: true, state: "pre", announce, inaugural: announce + COUNTDOWN - 1, offers: {}, ai: {}, choice: null, pending: null, members: [], delays: 0, founded: null, log: [] };
    return w[K];
  }
  const say = (w, t) => { const a = w[K]; a.log.unshift({ season: w.season, t }); if (a.log.length > 40) a.log.length = 40; w.news(K, t); };

  // ---- the contracts ----------------------------------------------------------------------------------------------------------------------
  function makeOffer(w, n, rel) {
    const c = C(w, n), inc = c.get("income") * X(w), h = H(key(w, "off", n, w.season)), ln = c.get("league");
    const apex_pay = r1(CF.pay * inc * (0.9 + 0.2 * h));                                  // extra money a year on top of today's income
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
    const a = w[K], rel = leagueRel(w), rk = ranking(w), me = w.ow && w.ow.club;
    a.state = "contracts"; const take = rk.slice(0, MAXN + EXTRA);
    for (const t of take) {
      const o = makeOffer(w, t.club, rel); a.offers[t.club] = o;
      if (t.club === me) a.pending = { club: me, season: w.season }; else { a.ai[t.club] = aiChoice(w, o) ? "apex" : "stay"; if (a.ai[t.club] === "apex") say(w, t.club + " signs with the " + NAME + "."); }
    }
    say(w, NAME + " contracts are on the table. The first season is planned for season " + a.inaugural + ".");
  }
  function signedList(w) {
    const a = w[K], me = w.ow && w.ow.club, rk = ranking(w), pos = {}; rk.forEach((r, i) => (pos[r.club] = i));
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
    const a = w[K], me = w.ow && w.ow.club;
    if (!a || a.state !== "contracts" || !a.pending || a.pending.club !== me) fail("There is no " + CF.short + " contract waiting for you.", 409);
    if (action !== "apex" && action !== "stay") fail("Choose apex or stay.");
    a.choice = action; return { ok: true, choice: action };
  }
  function mustDecide(w) { const a = w && w[K]; return !!(a && a.on && a.state === "contracts" && a.pending && !a.choice && w.ow && w.ow.club === a.pending.club && w.season === a.inaugural - 1); }


  // ---- stage 2: the league itself --------------------------------------------------------------------------------------------------------
  const NAME = CF.name, KEEP = CF.keep;                       // a domestic league never drops under 10 clubs
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
    const a = w[K], n = list.length, bases = $dict($kw({}));
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
    const A = $dict($kw({ name: NAME, country: "World", confed: "WORLD", prestige: CF.prestige, games: fullLen(n), foreign: 0.6, clubs: list.slice(), bases, target: avg, start_avg: avg, start_std: sd, tvmult: CF.tvmult, slots: 0, coef_hist: [2.5, 2.5, 2.5, 2.5, 2.5] }));
    A.set("coef0", 12.5);
    w.leagues.set(NAME, A); w.league_clubs.set(NAME, A.get("clubs"));
    for (const nm of w.nations.keysArr()) { const lst = w.prox.get(nm); if (lst && !lst.some((x) => x[0] === NAME)) lst.push([NAME, 0.4]); }
    // 3: the continental cups lose these clubs, and the places pass down each league's table
    const last = w.hist[w.hist.length - 1], tb = last && last.get("tables"), mem = new Set(list);
    if (tb) { const t2 = new $Dict(); for (const ln of tb.keysArr()) t2.set(ln, tb.get(ln).filter((x) => !mem.has(x))); w.compute_cup_fields(t2); }
    // 4: next season's income already includes the contract money
    for (const m of list) { const c = C(w, m), add = a.offers[m].apex_pay / X(w); c.set("income", c.get("income") + add); c.set("budget", Math.max(c.get("budget"), c.get("income"))); }
  }
  // ---- stage 3 (slice 1): health, contract reviews, board votes ----------------------------------------------------------------------------
  const confedOf = (w, n) => w.leagues.get(C(w, n).get("league")).get("confed");
  const apexL = (w) => w.leagues.get(NAME);
  // how healthy the league is (0..100): the strength of its field against the line it needs, and how full it is. It moves slowly.
  function healthNow(w) {
    const a = w[K], l = a.members.map((m) => m.club), st = strength(w, l);
    const strengthPart = clamp((st.mean - 60) * 2.5, 0, 100), sizePart = l.length / MAXN * 100;
    return clamp(0.65 * strengthPart + 0.35 * sizePart, 0, 100);
  }
  const wantSize = (h) => clamp(Math.round(8 + h / 100 * 8), MINN, MAXN);          // a dying league runs smaller
  // a club's file: league finish, stature and squad rating. The owner sees this number before the review.
  function fileScore(w, n) {
    const last = w.hist[w.hist.length - 1], tb = last && last.get("tables"), t = tb && tb.get(NAME), c = C(w, n);
    const i = t ? t.indexOf(n) : -1, fin = i < 0 || t.length < 2 ? 50 : 100 * (1 - i / (t.length - 1));
    return r1(0.4 * fin + 0.35 * c.get("stature") + 0.25 * c.get("eff"));
  }
  const verdictOf = (f, n) => (n <= 8 ? "renew" : f >= 66 ? "renew" : f >= 52 ? "review" : "release");
  function toApex(w, m, offer) {
    const a = w[K], A = apexL(w), c = C(w, m), ln = c.get("league"), L = w.leagues.get(ln), arr = L.get("clubs"), i = arr.indexOf(m);
    if (i >= 0) arr.splice(i, 1);
    L.set("games", Math.min(L.get("games"), fullLen(arr.length)));
    c.set("league", NAME); A.get("clubs").push(m); A.get("bases").set(m, c.get("base")); A.set("games", fullLen(A.get("clubs").length));
    for (const p of w.players) if (p.club === m) p.league = NAME;
    c.set("last_finish", Math.ceil(A.get("clubs").length / 2));
    const add = offer.apex_pay / X(w); c.set("income", c.get("income") + add); c.set("budget", Math.max(c.get("budget"), c.get("income")));
    a.members.push({ club: m, years: offer.years, from: w.season + 1, pay: offer.apex_pay, home: ln });
  }
  function fromApex(w, m) {
    const a = w[K], A = apexL(w), c = C(w, m), rec = a.members.find((x) => x.club === m.club || x.club === m); const n = rec.club;
    const ln = rec.home || (a.offers[n] && a.offers[n].league), L = w.leagues.get(ln), arr = A.get("clubs"), i = arr.indexOf(n);
    if (i >= 0) arr.splice(i, 1);
    A.set("games", fullLen(arr.length));
    L.get("clubs").push(n); L.set("games", fullLen(L.get("clubs").length));
    const cc = C(w, n); cc.set("league", ln); cc.set("income", Math.max(0.5 * cc.get("income"), cc.get("income") - rec.pay / X(w)));
    for (const p of w.players) if (p.club === n) p.league = ln;
    a.members = a.members.filter((x) => x.club !== n);
    return ln;
  }
  // a seat is open: the members vote. Bigger and more famous clubs win more votes, with a lean toward European clubs.
  function boardVote(w) {
    const a = w[K], A = apexL(w), mem = new Set(a.members.map((m) => m.club)), me = w.ow && w.ow.club, rel = leagueRel(w), tried = new Set();
    for (let round = 0; round < 3; round++) {
      const pool = ranking(w).filter((r) => !mem.has(r.club) && r.club !== me && !tried.has(r.club) && w.leagues.get(C(w, r.club).get("league")).get("clubs").length > KEEP).slice(0, 5);
      if (pool.length < 2) return false;
      const tally = {}; pool.forEach((p) => (tally[p.club] = 0));
      for (const m of a.members) {
        let best = null, bs = -1e9;
        for (const p of pool) { const v = p.score + (confedOf(w, p.club) === CF.bloc ? CF.bloc_bias : 0) + H(key(w, "vote", m.club, p.club, w.season)) * 9; if (v > bs) { bs = v; best = p.club; } }
        tally[best]++;
      }
      const win = pool.slice().sort((x, y) => tally[y.club] - tally[x.club] || y.score - x.score)[0].club, o = makeOffer(w, win, rel);
      o.apex_pay = r1(o.apex_pay * (0.8 + 0.4 * a.health / 100)); o.dom_pay = r1(o.apex_pay * o.ratio);
      if (aiChoice(w, o)) { a.offers[win] = o; toApex(w, win, o); say(w, "The " + CF.short + " board votes " + tally[win] + " to " + (a.members.length - 1 - tally[win]) + " to admit " + win + ". They take the open seat."); return true; }
      say(w, win + " turns the " + NAME + " down."); tried.add(win);
    }
    return false;
  }
  // each rollover while the league lives
  function afterSeason(w) {
    const a = w[K]; if (!a || !a.on || a.state !== "live") return;
    const o = w.ow, me = o && o.club;
    for (const m of a.members) { const c = C(w, m.club); if (c) c.set("prize", c.get("prize", 0) + m.pay * (0.8 + 0.4 * (a.health === undefined ? 70 : a.health) / 100) / X(w)); m.years = Math.max(0, m.years - 1); }
    if (o && o[K + "_fans"] > 0) { const back = Math.min(4, o[K + "_fans"]); o[K + "_fans"] -= back; o.fans = clamp(o.fans + back, 0, 100); }
    // health
    const h0 = healthNow(w); a.health = a.health === undefined ? r1(h0) : r1(0.6 * a.health + 0.4 * h0); a.hh = (a.hh || []).concat([{ season: w.season, h: a.health }]).slice(-20);
    // contract reviews
    for (const m of a.members.slice()) {
      if (m.years > 0) continue;
      const f = fileScore(w, m.club), v = verdictOf(f, a.members.length), rel = leagueRel(w);
      if (v === "release") { const ln = fromApex(w, m.club); say(w, "The " + NAME + " lets " + m.club + " go: their contract is up and the file is weak. They return to the " + ln + "."); if (m.club === me) o[K + "_note"] = { season: w.season, t: "The " + NAME + " did not renew your contract. You are back in the " + ln + "." }; continue; }
      const off = makeOffer(w, m.club, rel), mult = (v === "renew" ? 1 + (f - 66) / 100 : 0.85) * (0.8 + 0.4 * a.health / 100);
      m.pay = r1(off.apex_pay * mult); m.years = v === "renew" ? off.years : 1 + Math.floor(H(key(w, "ry", m.club, w.season)) * 2);
      say(w, "The " + NAME + " " + (v === "renew" ? "renews" : "keeps on review") + " " + m.club + " for " + m.years + " season" + (m.years === 1 ? "" : "s") + ".");
      if (m.club === me) o[K + "_note"] = { season: w.season, t: v === "renew" ? "Your " + CF.short + " contract was renewed for " + m.years + " seasons." : "The " + NAME + " kept you on review: one or two more seasons, lower pay." };
    }
    // fill open seats up to the size a league of this health can run
    let guard = 0; while (a.members.length < wantSize(a.health) && guard++ < 4) { if (!boardVote(w)) break; }
    if (a.health < 22 && a.members.length < 6) { /* pause and collapse come in a later slice */ }
  }

  // ---- hooks ------------------------------------------------------------------------------------------------------------------------------
  // the start of a season: word gets out, then the contracts open in the third season of the countdown
  function startSeason(w) {
    const a = w[K]; if (!a || !a.on) return; const s = w.season;
    if (a.state === "pre" && s >= a.announce) { a.state = "rumour"; say(w, "Word is out: the biggest clubs are planning a breakaway " + NAME + ", with a first season planned for season " + a.inaugural + "."); }
    else if (a.state === "rumour" && s > a.announce) {
      const left = a.inaugural - s, rk = ranking(w), who = rk.slice(0, 3 + (COUNTDOWN - left) * 2).map((r) => r.club);
      say(w, CF.short + " rumours: " + who.slice(0, 4).join(", ") + " are said to be in talks. " + left + " season" + (left === 1 ? "" : "s") + " to go.");
    }
    if (a.state === "rumour" && s >= a.inaugural - 1) openContracts(w);
  }
  // the end of the season before the first one: contracts are locked and the league goes ahead, is delayed or never starts
  function resolve(w) {
    const a = w[K]; if (!a || !a.on) return;
    if (a.state === "live") return afterSeason(w);
    if (a.state !== "contracts" || w.season < a.inaugural - 1) return;
    const me = w.ow && w.ow.club; let list = signedList(w);
    if (me && a.pending && !a.choice) a.choice = "stay";
    if (list.length > MAXN) { for (const n of list.slice(MAXN)) { if (n !== me) a.ai[n] = "stay"; } list = list.slice(0, MAXN); }
    list = eligible(w, list);
    const st = strength(w, list);
    if (st.go) {
      a.state = "live"; a.members = list.map((n) => ({ club: n, years: a.offers[n].years, from: a.inaugural, pay: a.offers[n].apex_pay, home: C(w, n).get("league") })); a.founded = a.inaugural; a.health = r1(healthNow(w));
      say(w, "The " + NAME + " is a go: " + list.length + " clubs will play in season " + a.inaugural + ".");
      formLeague(w, list);
      if (me && list.includes(me)) { const o = w.ow; o.fans = clamp(o.fans - CF.fan_hit, 0, 100); o[K + "_fans"] = CF.fan_hit; }
    } else if (a.delays < MAX_DELAYS) {
      a.delays++; a.inaugural++; const rel = leagueRel(w), rk = ranking(w);
      say(w, "The " + NAME + " is delayed: " + list.length + " clubs signed, not enough strength. More invitations go out.");
      for (const t of rk.slice(0, MAXN + EXTRA + 6 * a.delays)) { if (a.offers[t.club]) continue; const o = makeOffer(w, t.club, rel); a.offers[t.club] = o; if (t.club === me) { a.pending = { club: me, season: w.season }; a.choice = null; } else { a.ai[t.club] = aiChoice(w, o) ? "apex" : "stay"; if (a.ai[t.club] === "apex") say(w, t.club + " signs with the " + NAME + "."); } }
    } else { a.state = "dead"; say(w, "The " + NAME + " collapses before it starts: too few big clubs."); }
  }

  // ---- views --------------------------------------------------------------------------------------------------------------------------------
  function view(w) {
    const a = w[K]; if (!a || !a.on) return { on: false };
    const me = w.ow && w.ow.club, rk = ranking(w), rel = leagueRel(w);
    const out = { on: true, state: a.state, announce: a.announce, inaugural: a.inaugural, season: w.season, seasons_left: Math.max(0, a.inaugural - w.season), delays: a.delays, log: a.log.slice(0, 12), max: MAXN, min: MINN };
    if (a.state === "pre") return out;
    out.rumours = rk.slice(0, 16).map((r, i) => ({ club: r.club, rank: i + 1, league: C(w, r.club).get("league"), score: r.score, said: a.ai[r.club] === "apex" ? "signed" : a.ai[r.club] === "stay" ? "staying" : i < 6 ? "very likely" : i < 12 ? "likely" : "possible" }));
    if (a.state === "contracts") {
      const l = signedList(w), st = strength(w, l);
      out.signed = l.map((n) => ({ club: n, stature: Math.round(C(w, n).get("stature")), mine: n === me })); out.strength = st;
      if (a.pending && me && a.pending.club === me) { const o = a.offers[me]; out.offer = { apex_pay: o.apex_pay, dom_pay: o.dom_pay, years: o.years, league: o.league, league_rel: Math.round((rel[o.league] || 0) * 100), choice: a.choice, fan_hit: CF.fan_hit, deadline: a.inaugural - 1 }; }
    }
    if (a.state === "live") {
      out.health = a.health === undefined ? r1(healthNow(w)) : a.health; out.hh = a.hh || []; out.want = wantSize(out.health);
      out.members = a.members.map((m) => ({ club: m.club, years: m.years, pay: m.pay, file: fileScore(w, m.club), mine: m.club === me }));
      const mm = a.members.find((m) => m.club === me); if (mm) { const f = fileScore(w, me); out.mine = { years: mm.years, pay: mm.pay, file: f, verdict: verdictOf(f, a.members.length) }; }
      out.note = w.ow && w.ow[K + "_note"] || null;
    }
    return out;
  }
  return { NAME, fullLen, init, startSeason, resolve, choose, mustDecide, view, ranking, strength, need, leagueRel };
};
$mods["apex"] = $mods.breakaway({ key: "apex", name: "Apex League", countdown: 4, maxn: 16, minn: 4, extra: 4, max_delays: 2, keep: 10,
  pay: 0.45, prestige: 100, tvmult: 1.1, short: "Apex", bloc: "UEFA", bloc_bias: 4, fan_hit: 14 });
