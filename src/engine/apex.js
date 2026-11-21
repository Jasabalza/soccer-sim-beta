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
    const a = w[K], o = w.ow, me = o && o.club;
    if (a && a.state === "live" && o && me) {
      const mem = a.members.some((m) => m.club === me);
      if (action === "apply") {
        if (mem) fail("You are already in the " + NAME + ".", 409);
        if (o[K + "_apply"] === w.season) fail("You have already applied this season.", 409);
        if (!canLeave(w, C(w, me).get("league"))) fail("Your league cannot lose another club to the breakaways.", 409);
        const c = C(w, me), fee = applyFee(w, me); if (c.get("funds") * X(w) < fee) fail("The tryout fee is " + fee + "M; the club does not have it.", 409);
        c.set("funds", c.get("funds") - fee / X(w)); o[K + "_apply"] = w.season; return { ok: true, msg: "Application sent (" + fee + "M). Your tryout is played in the summer." };
      }
      if (action === "accept" || action === "decline") { if (!a.invite || a.invite.club !== me) fail("There is no invitation.", 409); a.invite.answer = action === "accept" ? "apex" : "stay"; return { ok: true, msg: action === "accept" ? "Accepted. You join at the end of this season." : "Declined." }; }
      if (["ask", "std", "safe"].includes(action)) { o[K + "_stance"] = action; return { ok: true, msg: "Review stance set." }; }
      if (action === "friendly_on" || action === "friendly_off") { o[K + "_friendly"] = action === "friendly_on" ? "on" : "off"; return { ok: true, msg: "Saved." }; }
    }
    if (!a || a.state !== "contracts" || !a.pending || a.pending.club !== me) fail("There is no " + NAME + " contract waiting for you.", 409);
    if (action !== "apex" && action !== "stay") fail("Choose apex or stay.");
    a.choice = action; return { ok: true, choice: action };
  }
  const applyFee = (w, n) => r1(Math.max(2, 0.04 * C(w, n).get("income") * X(w)));
  function mustDecide(w) { const a = w && w[K]; return !!(a && a.on && a.state === "contracts" && a.pending && !a.choice && w.ow && w.ow.club === a.pending.club && w.season === a.inaugural - 1); }


  // ---- stage 2: the league itself --------------------------------------------------------------------------------------------------------
  const NAME = CF.name, KEEP = CF.keep;                       // a domestic league never drops under 10 clubs
  const fullLen = (n) => (n % 2 === 0 ? 2 * (n - 1) : 2 * n);     // matchweeks of a home-and-away season (an odd field has byes)
  // clubs may only leave while their league keeps enough clubs to play a season
  // how many clubs a domestic league has already lost to every breakaway (Apex and Omega share one cap)
  function lostFrom(w, ln) { let n = 0; for (const k of ["apex", "omega"]) { const b = w[k]; if (b && b.members) for (const m of b.members) if (m.home === ln) n++; } return n; }
  // a league lets a club go only while it keeps at least KEEP clubs and has lost no more than about a quarter of its field
  function canLeave(w, ln, extra) { const size = w.leagues.get(ln).get("clubs").length - (extra || 0), lost = lostFrom(w, ln) + (extra || 0); return size - 1 >= KEEP && lost + 1 <= Math.max(1, Math.floor(0.25 * (size + lost))); }
  function eligible(w, list) {
    const out = [], gone = {}, me = w.ow && w.ow.club;
    for (const n of list) {
      const ln = C(w, n).get("league");
      if (canLeave(w, ln, gone[ln] || 0)) { gone[ln] = (gone[ln] || 0) + 1; out.push(n); }
      else { say(w, ln + " refuses to let " + n + " go: it has already lost as many clubs as it can."); if (n === me) w.ow[K + "_note"] = { season: w.season, t: ln + " refused to let your club leave for the " + NAME + ". It has lost as many clubs as it can. You stay." }; }
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
    const hostile = a.sanc ? Object.values(a.sanc).filter((v) => v >= 3).length : 0;
    return clamp(0.65 * strengthPart + 0.35 * sizePart - 3 * hostile, 0, 100);
  }
  const wantSize = (h) => clamp(Math.round(8 + h / 100 * 8), MINN, MAXN);          // a dying league runs smaller
  // a club's file: league finish, stature and squad rating. The owner sees this number before the review.
  function fileScore(w, n) {
    const last = w.hist[w.hist.length - 1], tb = last && last.get("tables"), t = tb && tb.get(NAME), c = C(w, n);
    const i = t ? t.indexOf(n) : -1, fin = i < 0 || t.length < 2 ? 50 : 100 * (1 - i / (t.length - 1));
    const m = w[K].members.find((x) => x.club === n), cb = (m && m.cont !== undefined ? 8 * (m.cont - 0.4) : 0) + (m && m.mark ? m.mark : 0);
    return r1(0.4 * fin + 0.35 * c.get("stature") + 0.25 * c.get("eff") + cb);
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
    a.rel = a.rel || {}; a.sanc = a.sanc || {}; if (a.rel[ln] === undefined) { a.rel[ln] = 60; a.sanc[ln] = 0; } a.rel[ln] = r1(Math.max(0, a.rel[ln] - 8));
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
      const cands = a.cands || {}, okC = (n) => !mem.has(n) && !tried.has(n) && canLeave(w, C(w, n).get("league")) && (n !== me || cands[n]);
      const rk = ranking(w), pool = rk.filter((r) => okC(r.club) && r.club !== me).slice(0, 5);
      for (const r of rk) if (cands[r.club] && okC(r.club) && !pool.includes(r)) pool.push(r);
      if (pool.length < 2) return false;
      const tally = {}; pool.forEach((p) => (tally[p.club] = 0));
      for (const m of a.members) {
        let best = null, bs = -1e9;
        for (const p of pool) { const v = p.score + ((a.cands || {})[p.club] ? a.cands[p.club].bonus : 0) + (confedOf(w, p.club) === CF.bloc ? CF.bloc_bias : 0) + H(key(w, "vote", m.club, p.club, w.season)) * 9; if (v > bs) { bs = v; best = p.club; } }
        tally[best]++;
      }
      const win = pool.slice().sort((x, y) => tally[y.club] - tally[x.club] || y.score - x.score)[0].club, o = makeOffer(w, win, rel);
      o.apex_pay = r1(o.apex_pay * (0.8 + 0.4 * a.health / 100)); o.dom_pay = r1(o.apex_pay * o.ratio);
      if (win === me) { a.invite = { club: me, offer: o, season: w.season, answer: null }; say(w, "The " + CF.short + " board votes to invite " + me + " to the " + NAME + "."); w.ow[K + "_note"] = { season: w.season, t: "The " + NAME + " board voted for you. Answer the invitation on the " + CF.short + " tab this season: " + o.apex_pay + "M a year for " + o.years + " seasons." }; return true; }
      if (aiChoice(w, o)) { a.offers[win] = o; toApex(w, win, o); delete (a.cands || {})[win]; say(w, "The " + CF.short + " board votes " + tally[win] + " to " + (a.members.length - 1 - tally[win]) + " to admit " + win + ". They take the open seat."); return true; }
      say(w, win + " turns the " + NAME + " down."); tried.add(win);
    }
    return false;
  }
  // ---- sanctions: each domestic league's relations with the breakaway, and the ladder they climb --------------------------------------------
  // 0 none, 1 warning, 2 fines, 3 transfer block with that league, 4 boycott across its whole confederation. One step a season at most.
  const SANC = ["None", "Warning", "Fines", "Transfer block", "Boycott"], LINE = [101, 45, 35, 25, 15];
  function relInit(w) {
    const a = w[K]; a.rel = a.rel || {}; a.sanc = a.sanc || {};
    for (const m of a.members) if (m.home && a.rel[m.home] === undefined) { a.rel[m.home] = r1(Math.max(0, (CF.rel0 || 60) - 8 * a.members.filter((x) => x.home === m.home).length)); a.sanc[m.home] = 0; }
  }
  function sanctions(w) {
    const a = w[K]; relInit(w);
    for (const ln of Object.keys(a.rel)) {
      const still = a.members.filter((m) => m.home === ln).length;
      const age = w.season - (a.founded || w.season);           // anger builds for the first seasons, then slowly fades as everyone gets used to it
      a.rel[ln] = r1(clamp(a.rel[ln] + (!still ? 4 : age < 4 ? -2 - 0.5 * (still - 1) : 1), 0, 100));
      const lv = a.sanc[ln] || 0;
      if (lv < 4 && a.rel[ln] < LINE[lv + 1]) { a.sanc[ln] = lv + 1; say(w, ln + " " + ["", "warns the " + NAME + " clubs", "fines its former clubs in the " + NAME, "blocks all transfers with " + NAME + " clubs", "leads a boycott: every league in " + w.leagues.get(ln).get("confed") + " stops dealing with the " + NAME][lv + 1] + "."); }
      else if (lv > 0 && a.rel[ln] >= LINE[lv] + 10) { a.sanc[ln] = lv - 1; say(w, ln + " eases its sanctions on the " + NAME + " (now: " + SANC[lv - 1].toLowerCase() + ")."); }
    }
    // fines: members whose old league is at level 2 or more pay a share of their income each season
    for (const m of a.members) { const lv = a.sanc[m.home] || 0; if (lv >= 2) { const c = C(w, m.club), f = c.get("income") * (lv === 2 ? 0.03 : lv === 3 ? 0.045 : 0.06); c.set("funds", c.get("funds") - f); m.fined = r1((m.fined || 0) + f * X(w)); } }
  }
  // will club x deal with club y? (both ways). Free agents are never blocked.
  function blocked(w, x, y) {
    const a = w[K]; if (!a || a.state !== "live" || !a.sanc || !x || !y) return false;
    const mem = new Set(a.members.map((m) => m.club)), mx = mem.has(x), my = mem.has(y); if (mx === my) return false;
    const other = mx ? y : x, ol = C(w, other).get("league"), oc = w.leagues.get(ol) ? w.leagues.get(ol).get("confed") : null;
    for (const ln of Object.keys(a.sanc)) {
      const lv = a.sanc[ln]; if (lv >= 3 && ln === ol) return true;
      if (lv >= 4 && w.leagues.get(ln).get("confed") === oc) return true;
      if (lv >= 2 && ln === ol && H(key(w, "refuse", other)) < 0.3) return true;       // some clubs simply refuse
    }
    return false;
  }

  // ---- continental places: the breakaway negotiates with each confederation; FIFA hands out Club World Cup bids --------------------------------
  const clubConfed = (w, n) => C(w, n).get("confed");
  const tableOf = (w, tables) => { const t = tables && $M.get(tables, NAME, null); return t ? Array.from(t) : apexL(w) ? apexL(w).get("clubs").slice() : []; };
  // the members that use this confederation's deal next season: the best placed in the breakaway table
  function cupExtra(w, cf, tables) {
    const a = w[K]; if (!a || a.state !== "live" || !a.deals || !a.deals[cf] || !a.deals[cf].slots) return [];
    const mem = new Set(a.members.map((m) => m.club));
    return tableOf(w, tables).filter((n) => mem.has(n) && clubConfed(w, n) === cf).slice(0, a.deals[cf].slots);
  }
  function fifaBids(a) { const h = a.health === undefined ? 70 : a.health; return clamp((h >= 80 ? 3 : h >= 55 ? 2 : h >= 30 ? 1 : 0) + (a.cwc_won ? 1 : 0) - (CF.fifa_malus || 0), 0, 4); }
  function cwcAuto(w) {
    const a = w[K]; if (!a || a.state !== "live") return [];
    const mem = new Set(a.members.map((m) => m.club)); return tableOf(w, null).filter((n) => mem.has(n)).slice(0, fifaBids(a));
  }
  function negotiate(w) {
    const a = w[K]; a.deals = a.deals || {}; a.cupw0 = a.cupw0 || {};
    const confeds = [...new Set(a.members.map((m) => clubConfed(w, m.club)))];
    for (const cf of w.cups.keysArr()) {
      const cup = w.cups.get(cf); if (a.cupw0[cf] === undefined) a.cupw0[cf] = cup.get("weight", 1.0);
      const M = a.members.filter((m) => clubConfed(w, m.club) === cf), d = a.deals[cf];
      if (!M.length) { if (d) delete a.deals[cf]; cup.set("weight", a.cupw0[cf]); continue; }
      const lns = Object.keys(a.rel || {}).filter((ln) => w.leagues.get(ln) && w.leagues.get(ln).get("confed") === cf);
      const boy = lns.some((ln) => (a.sanc[ln] || 0) >= 4);
      if (boy) { if (d && d.slots) say(w, cf + " cancels its deal with the " + NAME + ": no " + NAME + " club may play in its cup while the boycott lasts."); a.deals[cf] = { slots: 0, until: w.season + 1 }; }
      else if (!d || w.season >= d.until) {
        const relAvg = lns.length ? lns.reduce((x, ln) => x + a.rel[ln], 0) / lns.length : 60, miss = clamp(M.length / 6, 0, 1);
        const p = clamp(0.15 + 0.5 * relAvg / 60 + 0.35 * miss + 0.15 * (a.health - 60) / 40, 0.05, 0.95);
        if (H(key(w, "deal", cf, w.season)) < p) {
          const k = clamp(Math.round(M.length * 0.35 + a.health / 50), 1, Math.min(4, M.length));
          a.deals[cf] = { slots: k, until: w.season + 3 }; say(w, cf + " agrees a deal with the " + NAME + ": " + k + " place" + (k === 1 ? "" : "s") + " in its cup for the next 3 seasons.");
        } else { a.deals[cf] = { slots: 0, until: w.season + 1 }; say(w, "Talks between " + cf + " and the " + NAME + " break down. Its clubs from " + cf + " miss the cup next season."); }
      }
      // the cup is weaker without its giants: less weight in rankings and coefficients
      const out = M.length - ((a.deals[cf] && a.deals[cf].slots) || 0);
      cup.set("weight", r1(a.cupw0[cf] * (1 - 0.3 * clamp(out / 8, 0, 1)) * 100) / 100);
    }
  }
  // how the deal clubs did in the cups and the Club World Cup, against what a league of this health should manage
  function judge(w) {
    const a = w[K], last = w.hist[w.hist.length - 1]; if (!last) return;
    const mem = new Set(a.members.map((m) => m.club)), cd = last.get("cup_detail", null), rs = [];
    if (cd) for (const [cf, dd] of cd.itemsArr()) { const rt = Math.max(1, Math.round(Math.log2(w.cups.get(cf).get("size", 16)))); for (const [n, r] of dd.get("reached").itemsArr()) if (mem.has(n)) { rs.push(r / rt); const m = a.members.find((x) => x.club === n); m.cont = r1(r / rt * 100) / 100; } }
    const cw = last.get("cwc_detail", null); if (cw) { const ch = w.comps.itemsArr().map((x) => x[1]).find((c) => c && c.kind === "cwc" && c.winner); if (ch && mem.has(ch.winner)) { a.cwc_won = w.season; say(w, ch.winner + " win the Club World Cup for the " + NAME + "."); } }
    if (!rs.length) return;
    const perf = rs.reduce((x, y) => x + y, 0) / rs.length, expect = 0.3 + 0.3 * a.health / 100;
    a.health = r1(clamp(a.health + 10 * (perf - expect), 0, 100)); a.cont = { season: w.season, perf: r1(perf * 100), expect: r1(expect * 100) };
    say(w, NAME + " clubs in the continental cups: " + (perf >= expect ? "beat" : "fell short of") + " expectations (" + Math.round(perf * 100) + " vs " + Math.round(expect * 100) + ").");
  }

  // ---- summer: benchmark friendlies and tryouts --------------------------------------------------------------------------------------------
  // a one-off game: home side gets the usual edge; the result is read against the strength gap, so one fluke cannot swing much
  function oneGame(w, h, a_, tag) {
    const r = new $Random(); r.seed(w.seed + "|" + w.season + "|" + K + "|" + tag + "|" + h + "|" + a_);
    const eh = C(w, h).get("eff"), ea = C(w, a_).get("eff"), [hg, ag] = $mods.comps.score(r, eh, ea, false, 1.0, 0);
    return { h, a: a_, hg, ag, exp: r1((eh - ea) / 8 + 0.4) };            // expected goal difference for the home side
  }
  function summer(w) {
    const a = w[K], o = w.ow, me = o && o.club, last = w.hist[w.hist.length - 1], tb = last && last.get("tables"); if (!tb) return;
    a.cands = a.cands || {}; for (const c of Object.keys(a.cands)) if (w.season - a.cands[c].season > 2) delete a.cands[c];
    const games = [], mem = new Set(a.members.map((m) => m.club)), at = tableOf(w, tb);
    // 1: benchmarks: the champion of each league that lost clubs against its best former club
    for (const ln of Object.keys(a.rel || {})) {
      const t = $M.get(tb, ln, null); if (!t || !t.length) continue;
      const champ = Array.from(t)[0], ours = at.filter((n) => mem.has(n) && a.members.find((m) => m.club === n).home === ln)[0]; if (!ours || mem.has(champ)) continue;
      const lv = (a.sanc && a.sanc[ln]) || 0, mineA = ours === me, mineD = champ === me;
      let why = null;
      if (lv >= 3) why = "Forbidden";
      else if (mineA ? o[K + "_friendly"] === "off" : H(key(w, "decA", ours, w.season)) < 0.1) { why = ours + " declined"; const m = a.members.find((x) => x.club === ours); m.mark = (m.mark || 0) - 4; }
      else if (mineD ? o[K + "_friendly"] === "off" : H(key(w, "decD", champ, w.season)) < 0.15) why = champ + " declined";
      if (why) { games.push({ k: "benchmark", h: champ, a: ours, note: why }); continue; }
      const g = oneGame(w, champ, ours, "bm"), surprise = (g.hg - g.ag) - g.exp;         // positive: the domestic side did better than expected
      const m = a.members.find((x) => x.club === ours); m.mark = r1(clamp(-surprise, -2, 2) * 2);
      a.health = r1(clamp(a.health - clamp(surprise, -2, 2), 0, 100));
      if (surprise > -0.5 && canLeave(w, ln)) a.cands[champ] = { season: w.season, bonus: surprise > 1 ? 14 : 8, how: "benchmark" };
      g.k = "benchmark"; games.push(g);
    }
    // 2: tryouts: up to two clubs apply (the owner's club first if it applied). The Apex picks a mid-table opponent; a giant for a big name.
    const apps = []; if (me && o[K + "_apply"] === w.season && !mem.has(me)) apps.push(me);
    for (const r of ranking(w)) { if (apps.length >= 2) break; const n = r.club; if (mem.has(n) || n === me || a.cands[n] || C(w, n).get("stature") < 68) continue; if (H(key(w, "app", n, w.season)) < 0.25 && canLeave(w, C(w, n).get("league"))) apps.push(n); }
    for (const n of apps) {
      const big = C(w, n).get("stature") >= 82, opp = at.filter((x) => mem.has(x))[big ? 1 : Math.floor(at.length / 2)] || at[0]; if (!opp) continue;
      const ln = C(w, n).get("league"), lv = (a.sanc && a.sanc[ln]) || 0;
      if (lv >= 3) { const c = C(w, n); c.set("funds", c.get("funds") - 0.03 * c.get("income")); }      // a hostile league fines a club for applying
      const g = oneGame(w, opp, n, "try"), d = g.ag - g.hg, surprise = -((g.hg - g.ag) - g.exp);
      const bonus = d > 0 ? 15 : d === 0 ? 10 : surprise > 0 ? 6 : d === -1 ? 3 : 0;
      if (bonus) a.cands[n] = { season: w.season, bonus, how: "tryout" }; else delete a.cands[n];
      g.k = "tryout"; g.bonus = bonus; games.push(g);
      if (n === me) o[K + "_note"] = { season: w.season, t: "Your tryout: " + g.h + " " + g.hg + "-" + g.ag + " " + g.a + ". " + (bonus >= 15 ? "A win: you are a strong candidate for the next open seat." : bonus >= 10 ? "A draw against an Apex club: you are a candidate for the next open seat." : bonus >= 6 ? "You lost, but held your own better than expected: you are a candidate." : bonus ? "A close loss: you are a long shot for a seat." : "Not good enough. You can try again next season.") };
    }
    a.summer = { season: w.season, games: games.map((g) => ({ k: g.k, h: g.h, a: g.a, hg: g.hg, ag: g.ag, note: g.note || null, bonus: g.bonus })) };
    for (const g of games) if (g.hg !== undefined) say(w, (g.k === "tryout" ? "Apex tryout: " : "Summer benchmark: ").replace("Apex", CF.short) + g.h + " " + g.hg + "-" + g.ag + " " + g.a + ".");
  }
  // the owner's answer to an invitation made at the last rollover: join now, or the seat goes to someone else
  function settleInvite(w) {
    const a = w[K], o = w.ow, inv = a.invite; if (!inv) return; a.invite = null;
    if (inv.answer === "apex" && o && o.club === inv.club && canLeave(w, C(w, inv.club).get("league"))) {
      a.offers[inv.club] = inv.offer; toApex(w, inv.club, inv.offer); o.fans = clamp(o.fans - CF.fan_hit, 0, 100); o[K + "_fans"] = CF.fan_hit; delete (a.cands || {})[inv.club];
      say(w, inv.club + " accepts the invitation and joins the " + NAME + "."); o[K + "_note"] = { season: w.season, t: "You joined the " + NAME + ". Your first season starts now." };
    } else say(w, inv.club + " turns down the " + NAME + " invitation.");
  }

  // cup places from this season's tables, without the clubs that now play in a breakaway league (they enter only through deals)
  function recomputeCups(w) {
    const last = w.hist[w.hist.length - 1], tb = last && last.get("tables"); if (!tb) return;
    const brk = new Set(); for (const k of ["apex", "omega"]) { const b = w[k]; if (b && b.members) for (const m of b.members) brk.add(m.club); }
    const t2 = new $Dict(); for (const ln of tb.keysArr()) { const L = w.leagues.get(ln); t2.set(ln, L && L.get("confed") === "WORLD" ? tb.get(ln) : tb.get(ln).filter((x) => !brk.has(x))); }
    w.compute_cup_fields(t2);
  }
  // each rollover while the league lives
  function afterSeason(w) {
    const a = w[K]; if (!a || !a.on || a.state !== "live") return;
    const o = w.ow, me = o && o.club;
    for (const m of a.members) { const c = C(w, m.club); if (c) c.set("prize", c.get("prize", 0) + m.pay * (0.8 + 0.4 * (a.health === undefined ? 70 : a.health) / 100) / X(w)); m.years = Math.max(0, m.years - 1); }
    if (o && o[K + "_fans"] > 0) { const back = Math.min(4, o[K + "_fans"]); o[K + "_fans"] -= back; o.fans = clamp(o.fans + back, 0, 100); }
    // health
    const h0 = healthNow(w); a.health = a.health === undefined ? r1(h0) : r1(0.6 * a.health + 0.4 * h0); a.hh = (a.hh || []).concat([{ season: w.season, h: a.health }]).slice(-20);
    settleInvite(w);
    judge(w);
    sanctions(w);
    summer(w);
    // contract reviews
    for (const m of a.members.slice()) {
      if (m.years > 0) continue;
      const f = fileScore(w, m.club), rel = leagueRel(w), st = m.club === me ? (o[K + "_stance"] || "std") : "std";
      let v = verdictOf(f, a.members.length);
      if (st === "ask") v = a.members.length <= 8 ? "renew" : f >= 72 ? "renew" : f >= 58 ? "review" : "release";        // pushing hard raises the bar
      if (st === "safe" && v === "release" && f >= 44) v = "review";                                                          // taking any deal keeps a weak club on review
      m.mark = 0;
      if (v === "release") { const ln = fromApex(w, m.club); say(w, "The " + NAME + " lets " + m.club + " go: their contract is up and the file is weak. They return to " + ln + "."); if (m.club === me) o[K + "_note"] = { season: w.season, t: "The " + NAME + " did not renew your contract. You are back in " + ln + "." }; continue; }
      const off = makeOffer(w, m.club, rel), mult = (v === "renew" ? 1 + (f - 66) / 100 : 0.85) * (0.8 + 0.4 * a.health / 100) * (st === "ask" && v === "renew" ? 1.15 : st === "safe" ? 0.85 : 1);
      m.pay = r1(off.apex_pay * mult); m.years = v === "renew" ? off.years : 1 + Math.floor(H(key(w, "ry", m.club, w.season)) * 2);
      say(w, "The " + NAME + " " + (v === "renew" ? "renews" : "keeps on review") + " " + m.club + " for " + m.years + " season" + (m.years === 1 ? "" : "s") + ".");
      if (m.club === me) o[K + "_note"] = { season: w.season, t: v === "renew" ? "Your " + CF.short + " contract was renewed for " + m.years + " seasons." : "The " + NAME + " kept you on review: one or two more seasons, lower pay." };
    }
    // fill open seats up to the size a league of this health can run
    let guard = 0; while (a.members.length + (a.invite ? 1 : 0) < wantSize(a.health) && guard++ < 4) { if (!boardVote(w)) break; }
    negotiate(w);
    recomputeCups(w);
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
      a.state = "live"; a.members = list.map((n) => ({ club: n, years: a.offers[n].years, from: a.inaugural, pay: a.offers[n].apex_pay, home: C(w, n).get("league") })); a.founded = a.inaugural; relInit(w); a.health = r1(healthNow(w));
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
      out.summer = a.summer || null; out.cands = Object.keys(a.cands || {}).map((c) => ({ club: c, bonus: a.cands[c].bonus, how: a.cands[c].how, mine: c === me }));
      if (w.ow && me) { const o = w.ow; out.stance = o[K + "_stance"] || "std"; out.friendly = o[K + "_friendly"] || "on"; out.invite = a.invite && a.invite.club === me ? { pay: a.invite.offer.apex_pay, years: a.invite.offer.years, answer: a.invite.answer } : null;
        if (!mm) { const ln = C(w, me).get("league"); out.apply = { fee: applyFee(w, me), applied: o[K + "_apply"] === w.season, open: canLeave(w, ln), league: ln }; } }
      out.deals = Object.keys(a.deals || {}).map((cf) => ({ confed: cf, slots: a.deals[cf].slots, until: a.deals[cf].until, clubs: a.members.filter((m) => clubConfed(w, m.club) === cf).length })); out.fifa = fifaBids(a); out.cont = a.cont || null;
      out.rel = Object.keys(a.rel || {}).map((ln) => ({ league: ln, rel: a.rel[ln], level: a.sanc[ln] || 0, label: SANC[a.sanc[ln] || 0], clubs: a.members.filter((m) => m.home === ln).length, mine: !!(mm && mm.home === ln) })).sort((x, y) => y.level - x.level || x.rel - y.rel);
    }
    return out;
  }
  return { NAME, SANC, blocked, cupExtra, cwcAuto, fifaBids, lostFrom, canLeave, fullLen, init, startSeason, resolve, choose, mustDecide, view, ranking, strength, need, leagueRel };
};
$mods["apex"] = $mods.breakaway({ key: "apex", name: "Apex League", countdown: 4, maxn: 16, minn: 4, extra: 4, max_delays: 2, keep: 12,
  pay: 0.45, prestige: 100, tvmult: 1.1, short: "Apex", bloc: "UEFA", bloc_bias: 4, fan_hit: 14 });
