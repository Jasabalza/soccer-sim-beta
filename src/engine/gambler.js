// BAIT Bets (v17). Plain JS (not generated). READS the world and plays games only through the existing per-fixture call
// (comp.play_fixture), which already gives every game its own seeded stream. Nothing here draws from a running RNG:
// slots come from a keyed hash, prices from the same odds() the Preview page uses.
$mods["gambler"] = (function () {
  const MARGIN = 0.07, MIN_ODDS = 1.05, LINE = 2.5, SAME_MATCH = 0.85;
  const SLOTS = ["Morning", "Midday", "Night"];
  const gv = (x, k) => (x instanceof $Dict ? x.get_(k) : x[k]);
  const fail = (m, c) => { throw $new($mods.app_v11.ApiError, [m, c || 400]); };
  // keyed hash -> [0,1): same inputs, same number, no state
  function h01(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
  // kickoff slot weights by league (US viewing hours): Premier League mornings, La Liga midday, MLS nights
  function slotWeights(league) {
    const n = String(league).toLowerCase();
    if (n.includes("premier league") && !n.includes("saudi")) return [0.6, 0.3, 0.1];
    if (n.includes("la liga") || n.includes("laliga")) return [0.2, 0.6, 0.2];
    if (n.includes("serie a") || n.includes("bundesliga") || n.includes("ligue 1")) return [0.3, 0.5, 0.2];
    if (n.includes("major league soccer") || n === "mls") return [0.05, 0.15, 0.8];
    return [0.35, 0.4, 0.25];
  }
  function slotFor(w, league, week, h, a, marquee) {
    let wt = slotWeights(league).slice();
    if (marquee) { const m = wt[0] * 0.4; wt = [wt[0] - m, wt[1], wt[2] + m]; }       // big games drift to the Night slot
    const x = h01([w.seed, w.season, league, week, h, a, "slot"].join("|"));
    return x < wt[0] ? 0 : x < wt[0] + wt[1] ? 1 : 2;
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const price = (p) => Math.max(MIN_ODDS, r2((1 - MARGIN) / Math.max(0.001, p)));
  // 1X2, goals over/under 2.5 and both-teams-to-score, all from the two Poisson means odds() already works out
  function markets(o) {
    const [hl, al] = o.exp, tot = hl + al;
    let under = 0; for (let k = 0; k <= 2; k++) under += $mods.rivals.poissonPmf(tot, k);
    const bt = (1 - Math.exp(-hl)) * (1 - Math.exp(-al));
    return { home: price(o.home), draw: price(o.draw), away: price(o.away), over: price(1 - under), under: price(under), yes: price(bt), no: price(1 - bt),
      p: { home: o.home, draw: o.draw, away: o.away, over: 1 - under, btts: bt } };
  }
  function matchOdds(w, c, h, a) {
    const lab = $mods.rivals.label(w, h, a);
    const eh = c.eff ? gv(c.eff, h) : gv(w.clubs.get_(h), "eff"), ea = c.eff ? gv(c.eff, a) : gv(w.clubs.get_(a), "eff");
    return { o: $mods.rivals.odds(eh, ea, lab ? lab.intensity : 0, false), lab };
  }
  // the calendar week the world will play next (the earliest next event across everything still running), and the same peek step() uses
  function worldWeek(w) {
    let wk = null;
    for (const c of $iter(w.active(null))) { if ($T(w.missing(c))) continue; const n = c.next_week(); if (wk === null || n < wk) wk = n; }
    return wk;
  }
  const openLeague = (c, wk) => c.kind === "league" && c.ptr < c.rounds.length && c.next_week() === wk;
  // this week's slate: every league with a matchweek still open, each game with its slot and prices
  function slate(w) {
    const out = [], wk = worldWeek(w);
    let left = 0;
    for (const [cid, c] of w.comps.itemsArr()) {
      if (c.kind === "league" && c.ptr < c.rounds.length) left++;
      if (!openLeague(c, wk)) continue;
      const name = cid.slice(2), order = c.standings(), week = c.ptr + 1;
      const played = new Map((c.partial || []).map((r) => [r[0] + "|" + r[1], r]));
      let ovr = 0, n = 0; const rows = [];
      for (const [h, a] of c.rounds[c.ptr]) {
        const { o, lab } = matchOdds(w, c, h, a), done = played.get(h + "|" + a);
        const hp = order.indexOf(h) + 1, ap = order.indexOf(a) + 1, marquee = (lab && lab.intensity >= 0.5) || (hp <= 4 && ap <= 4);
        const mk = markets(o); delete mk.p;
        ovr += gv(w.clubs.get_(h), "ovr") + gv(w.clubs.get_(a), "ovr"); n += 2;
        rows.push({ id: [name, week, h, a].join("|"), league: name, week, h, a, hpos: hp, apos: ap, slot: slotFor(w, name, week, h, a, marquee), marquee: !!marquee,
          rivalry: lab ? lab.name : null, done: !!done, hg: done ? done[2] : null, ag: done ? done[3] : null, odds: mk });
      }
      out.push({ name, week, weeks: c.rounds.length, avg: n ? Math.round(ovr / n * 10) / 10 : 0, left: rows.filter((r) => !r.done).length, rows });
    }
    out.sort((x, y) => y.avg - x.avg);
    return { slots: SLOTS, leagues: out, margin: MARGIN, line: LINE, wk, leaguesLeft: left };
  }
  // play every unplayed game in one slot (all leagues), always in list order
  function playSlot(w, slot) {
    let played = 0;
    const wk = worldWeek(w);
    for (const [cid, c] of w.comps.itemsArr()) {
      if (!openLeague(c, wk)) continue;
      const name = cid.slice(2), week = c.ptr + 1;
      for (const [h, a] of c.unplayed().map((f) => [f[0], f[1]])) {
        const { lab } = matchOdds(w, c, h, a), order = c.standings();
        const marquee = (lab && lab.intensity >= 0.5) || (order.indexOf(h) < 4 && order.indexOf(a) < 4);
        if (slot !== "all" && slotFor(w, name, week, h, a, marquee) !== slot) continue;
        c.play_fixture(h, a); played++;
      }
    }
    return { ok: true, played };
  }
  // finish the calendar week: play whatever is still open this week (games not simmed one by one, cups, etc.), never the next week
  function finishWeek(w, wk) {
    const wk0 = wk == null ? worldWeek(w) : wk; let n = 0;
    while (wk0 !== null && worldWeek(w) === wk0 && n++ < 30) { if (w.step(null) == null) break; }
    return { ok: true, wk: worldWeek(w) };
  }
  function result(w, league, week, h, a) {
    const c = w.comps.has("L:" + league) ? w.comps.get_("L:" + league) : null; if (!c) return null;
    const rows = week - 1 === c.ptr ? (c.partial || []) : week - 1 < c.ptr ? (c.results[week - 1] || []) : [];
    for (const m of rows) if (m[0] === h && m[1] === a) return [m[2], m[3]];
    return null;
  }

  // ---------------------------------------------------------------- match detail and props (milestone 2)
  // Scorers: the SAME keyed draw comp_stats uses (same seed string, same pool, same order of draws), so a bet on a scorer settles
  // exactly the way the season's scorer table is built. Everything else (minutes, half-time, corners, cards) is GENERATED here
  // from a keyed stream and is consistent with the final score by construction.
  const COR_LINE = 9.5, CRD_LINE = 3.5, FIRST_HALF = 0.45;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const poisCdf = (lam, k) => { let s2 = 0; for (let i = 0; i <= k; i++) s2 += $mods.rivals.poissonPmf(lam, i); return s2; };
  function pois(r, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r.random(); } while (p > L); return k - 1; }
  function params(w, c, h, a) {
    const { o, lab } = matchOdds(w, c, h, a), [hl, al] = o.exp, d = hl - al;
    return { o, hl, al, corH: clamp(5.4 + 0.9 * d, 3, 8), corA: clamp(4.6 - 0.9 * d, 2.5, 7), cards: 3.5 + 1.6 * (lab ? lab.intensity : 0) };
  }
  // one team's scoring pool, built exactly as comp_stats builds it
  function teamPool(w, team, squads) {
    const CS = $mods.compstats, sq = $M.get(squads, team, []).slice().sort((x, y) => (y.ovr - x.ovr) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    const [xi, bench] = $iter(CS._xi(sq)), pool = xi.map((p) => [p, 1.0]).concat(bench.map((p) => [p, 0.2]));
    return { pool, gw: pool.map(([p, m]) => CS.GOAL_W.get_(p.pos) * m * Math.pow(p.ovr / 70, 6)), aw: pool.map(([p, m]) => CS.ASSIST_W.get_(p.pos) * m * Math.pow(p.ovr / 70, 4)) };
  }
  // who scored for `team` in league matchweek index mi, given that it scored gf goals: [[player, goals], ...]
  function scorersFor(w, cid, mi, team, gf, squads) {
    if (gf <= 0) return [];
    const CS = $mods.compstats, tp = teamPool(w, team, squads);
    const r = $py.random.Random(String(w.seed) + "|" + w.season + "|cs|" + cid + "|m" + mi + "|" + team);
    const out = [];
    for (const [i, n] of $iter($M.items(CS._draw(r, gf, tp.gw)))) out.push([tp.pool[i][0], n]);
    out.sort((x, y) => (x[0].name < y[0].name ? -1 : 1));
    return out;
  }
  // everything that happened in one finished game
  function detail(w, league, week, h, a, hg, ag, squads) {
    const cid = "L:" + league, c = w.comps.get_(cid), P = params(w, c, h, a);
    squads = squads || w.squads(); w.ensure_uids();
    const key = [w.seed, w.season, "gbd", cid, week, h, a].join("|"), r = $py.random.Random(key);
    const goals = [];
    for (const [team, side, gf] of [[h, "H", hg], [a, "A", ag]]) {
      const list = []; for (const [p, n] of scorersFor(w, cid, week - 1, team, gf, squads)) for (let i = 0; i < n; i++) list.push(p);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }        // which goal was whose
      for (const p of list) goals.push({ min: 1 + Math.floor(r.random() * 90), side, uid: p.uid, name: p.name, team });
    }
    goals.sort((x, y) => x.min - y.min);
    const ht = [goals.filter((g) => g.side === "H" && g.min <= 45).length, goals.filter((g) => g.side === "A" && g.min <= 45).length];
    const corners = [pois(r, P.corH), pois(r, P.corA)], cards = [pois(r, P.cards * 0.52), pois(r, P.cards * 0.48)];
    return { goals, ht, corners, cards };
  }
  // the extra markets of one game, priced (called when a player opens a match)
  function props(w, league, week, h, a) {
    const cid = "L:" + league; if (!w.comps.has(cid)) fail("unknown league", 404);
    const c = w.comps.get_(cid), P = params(w, c, h, a), squads = w.squads(); w.ensure_uids();
    let ph = 0, pd = 0, pa = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const q = $mods.rivals.poissonPmf(P.hl * FIRST_HALF, i) * $mods.rivals.poissonPmf(P.al * FIRST_HALF, j); if (i > j) ph += q; else if (i === j) pd += q; else pa += q; }
    const t = ph + pd + pa; ph /= t; pd /= t; pa /= t;
    const side = (team, lam) => { const tp = teamPool(w, team, squads), sum = tp.gw.reduce((x, y) => x + y, 0);
      return tp.pool.map(([p], i) => ({ uid: p.uid, name: p.name, pos: p.pos, ovr: p.ovr, p: 1 - Math.exp(-lam * tp.gw[i] / sum) })).filter((x) => x.p > 0.02).sort((x, y) => y.p - x.p).slice(0, 6).map((x) => ({ uid: x.uid, name: x.name, pos: x.pos, odds: price(x.p) })); };
    const co = 1 - poisCdf(P.corH + P.corA, Math.floor(COR_LINE)), cd = 1 - poisCdf(P.cards, Math.floor(CRD_LINE));
    return { id: [league, week, h, a].join("|"), h, a, ht: { H: price(ph), D: price(pd), A: price(pa) },
      corners: { line: COR_LINE, over: price(co), under: price(1 - co), mean: Math.round((P.corH + P.corA) * 10) / 10 },
      cards: { line: CRD_LINE, over: price(cd), under: price(1 - cd), mean: Math.round(P.cards * 10) / 10 },
      scorers: { H: side(h, P.hl), A: side(a, P.al) } };
  }

  // ---------------------------------------------------------------- title bets (milestone 4)
  // The title chance comes from playing the rest of the league season many times over with a keyed stream (same world and same
  // games played = same quote). It never touches the real sim: it only reads standings and the open fixtures.
  const TITLE_MARGIN = 0.10, TITLE_SIMS = 300;
  const titlePrice = (p) => Math.min(500, Math.max(MIN_ODDS, r2((1 - TITLE_MARGIN) / Math.max(0.0005, p))));
  function titleChances(w, league) {
    const cid = "L:" + league; if (!w.comps.has(cid)) return null;
    const c = w.comps.get_(cid), order = c.standings(), done = c.ptr >= c.rounds.length;
    const base = {}; for (const t of order) { const st = c.st.get_(t); base[t] = [gv(st, "pts"), gv(st, "gf") - gv(st, "ga"), gv(st, "gf")]; }
    if (done) { const p = {}; for (const t of order) p[t] = t === order[0] ? 1 : 0; return { c, order, base, p, left: 0, done: true }; }
    const played = new Set((c.partial || []).map((r) => r[0] + "|" + r[1])), fx = [];
    for (let i = c.ptr; i < c.rounds.length; i++) for (const [h, a] of c.rounds[i]) { if (i === c.ptr && played.has(h + "|" + a)) continue; fx.push([h, a, matchOdds(w, c, h, a).o.exp]); }
    const r = $py.random.Random([w.seed, w.season, league, c.ptr, played.size, "title"].join("|")), wins = {}; for (const t of order) wins[t] = 0;
    for (let n = 0; n < TITLE_SIMS; n++) {
      const pts = {}, gd = {}, gf = {}; for (const t of order) { pts[t] = base[t][0]; gd[t] = base[t][1]; gf[t] = base[t][2]; }
      for (const [h, a, [hl, al]] of fx) { const x = pois(r, hl), y = pois(r, al); gf[h] += x; gf[a] += y; gd[h] += x - y; gd[a] += y - x; if (x > y) pts[h] += 3; else if (x < y) pts[a] += 3; else { pts[h]++; pts[a]++; } }
      let best = order[0]; for (const t of order) if (pts[t] > pts[best] || (pts[t] === pts[best] && (gd[t] > gd[best] || (gd[t] === gd[best] && gf[t] > gf[best])))) best = t;
      wins[best]++;
    }
    const p = {}; for (const t of order) p[t] = wins[t] / TITLE_SIMS;
    return { c, order, base, p, left: fx.length, done: false };
  }
  function titleQuote(w, league) {
    const T = titleChances(w, league); if (!T) fail("unknown league", 404);
    const rows = T.order.map((t, i) => ({ club: t, pos: i + 1, pts: T.base[t][0], p: T.p[t], odds: titlePrice(Math.max(T.p[t], 0)) })).filter((x) => x.p > 0 || x.pos <= 3);
    rows.sort((x, y) => y.p - x.p || x.pos - y.pos);
    return { league, week: T.c.ptr + 1, weeks: T.c.rounds.length, left: T.left, done: T.done, rows: rows.slice(0, 12), margin: TITLE_MARGIN };
  }
  // each open title bet: still open (with its chance now) or settled
  function titleCheck(w, bets) {
    const cache = {};
    return bets.map((b) => {
      const T = cache[b.league] || (cache[b.league] = titleChances(w, b.league));
      if (!T) return { id: b.id, status: "void", p: 0 };
      if (T.done) return { id: b.id, status: T.order[0] === b.club ? "won" : "lost", p: T.p[b.club] || 0 };
      return { id: b.id, status: "open", p: T.p[b.club] || 0 };
    });
  }

  // ---------------------------------------------------------------- tips (the Chirp feed and the tip shop)
  // A tip is a claim about a game that has not been played. The game's real result is already fixed by its own stream, so we can
  // look at it without playing it (the same call comp._fixture makes, minus the table update). A source with reliability rho is
  // right that often, decided by a keyed hash, never by chance at the time you look.
  function peek(w, c, h, a) { return $mods.comps.score(c.fixture_rng(h, a), c.eff.get_(h), c.eff.get_(a), false, 1.0, $mods.rivals.effect(w, h, a, 1.0)); }
  const MK_PICKS = { "1x2": ["H", "D", "A"], ou: ["O", "U"], btts: ["Y", "N"] };
  const realPick = (mk, hg, ag) => mk === "1x2" ? (hg > ag ? "H" : hg === ag ? "D" : "A") : mk === "ou" ? (hg + ag > LINE ? "O" : "U") : (hg > 0 && ag > 0 ? "Y" : "N");
  function tip(w, src, rho, salt) {
    const wk = worldWeek(w), open = [];
    for (const [cid, c] of w.comps.itemsArr()) { if (!openLeague(c, wk)) continue; for (const f of c.unplayed()) open.push([cid.slice(2), c, f[0], f[1]]); }
    if (!open.length) return { none: true };
    const key = [w.seed, w.season, wk, src, salt].join("|"), [league, c, h, a] = open[Math.floor(h01(key + "|m") * open.length)];
    const mk = ["1x2", "ou", "btts"][Math.floor(h01(key + "|k") * 3)], [hg, ag] = peek(w, c, h, a), real = realPick(mk, hg, ag);
    let pick = real; if (h01(key + "|t") >= rho) { const others = MK_PICKS[mk].filter((x) => x !== real); pick = others[Math.floor(h01(key + "|o") * others.length)]; }
    return { id: [league, c.ptr + 1, h, a].join("|"), league, week: c.ptr + 1, h, a, market: mk, pick };
  }
  // does one leg win? null = not played yet
  function settleLeg(leg, hg, ag, det) {
    if (hg == null) return null;
    if (leg.market === "ht") { if (!det) return null; const [x, y] = det.ht; return (leg.pick === "H" && x > y) || (leg.pick === "D" && x === y) || (leg.pick === "A" && x < y); }
    if (leg.market === "cor") { if (!det) return null; const t2 = det.corners[0] + det.corners[1]; return leg.pick === "O" ? t2 > COR_LINE : t2 < COR_LINE; }
    if (leg.market === "crd") { if (!det) return null; const t2 = det.cards[0] + det.cards[1]; return leg.pick === "O" ? t2 > CRD_LINE : t2 < CRD_LINE; }
    if (leg.market === "scr") { if (!det) return null; return det.goals.some((g) => String(g.uid) === String(leg.uid)); }
    const t = hg + ag;
    if (leg.market === "1x2") return (leg.pick === "H" && hg > ag) || (leg.pick === "D" && hg === ag) || (leg.pick === "A" && hg < ag);
    if (leg.market === "ou") return leg.pick === "O" ? t > LINE : t < LINE;
    if (leg.market === "btts") return leg.pick === "Y" ? hg > 0 && ag > 0 : !(hg > 0 && ag > 0);
    return null;
  }
  // combined price of a slip: legs multiply; extra legs on the same match are worth less (they are not independent)
  function combine(legs) {
    const seen = new Map(); let m = 1;
    for (const l of legs) { const k = l.league + "|" + l.week + "|" + l.h + "|" + l.a; const n = seen.get(k) || 0; seen.set(k, n + 1); m *= l.odds * (n ? SAME_MATCH : 1); }
    return r2(m);
  }
  const NEED_DETAIL = new Set(["ht", "cor", "crd", "scr"]);
  function settle(w, bets) {
    const memo = new Map(); let squads = null;
    const det = (l, r) => { const k = [l.league, l.week, l.h, l.a].join("|"); if (!memo.has(k)) { squads = squads || w.squads(); memo.set(k, detail(w, l.league, l.week, l.h, l.a, r[0], r[1], squads)); } return memo.get(k); };
    return bets.map((b) => {
      let lost = false, pending = false;
      const legs = b.legs.map((l) => {
        const r = result(w, l.league, l.week, l.h, l.a), ok = r ? settleLeg(l, r[0], r[1], NEED_DETAIL.has(l.market) ? det(l, r) : null) : null;
        if (ok === null) pending = true; else if (!ok) lost = true;
        return { hg: r ? r[0] : null, ag: r ? r[1] : null, ok, ...(r && NEED_DETAIL.has(l.market) ? { note: noteFor(l, det(l, r)) } : {}) };
      });
      const status = lost ? "lost" : pending ? "open" : "won";
      return { id: b.id, status, legs, payout: status === "won" ? r2(b.stake * combine(b.legs)) : 0 };
    });
  }
  function noteFor(l, d) {
    if (l.market === "ht") return "HT " + d.ht[0] + "-" + d.ht[1];
    if (l.market === "cor") return d.corners[0] + d.corners[1] + " corners";
    if (l.market === "crd") return d.cards[0] + d.cards[1] + " cards";
    return d.goals.length ? "Goals: " + d.goals.map((g) => g.name + " " + g.min + "'").join(", ") : "No goals";
  }
  function api(w, path, q, body) {
    if (path === "/api/gb_props") { const [lg, wk, h, a] = String(q.id).split("|"); return props(w, lg, +wk, h, a); }
    if (path === "/api/gb_detail") { const [lg, wk, h, a] = String(q.id).split("|"), r = result(w, lg, +wk, h, a); if (!r) fail("not played yet", 409); return detail(w, lg, +wk, h, a, r[0], r[1]); }
    if (path === "/api/gb_tip") return tip(w, String(body.src), +body.rho, String(body.salt || 0));
    if (path === "/api/gb_title") return titleQuote(w, q.league);
    if (path === "/api/gb_titles") return { bets: titleCheck(w, body.bets || []) };
    if (path === "/api/gb_slate") return slate(w);
    if (path === "/api/gb_slot") return playSlot(w, body.slot === "all" ? "all" : +body.slot);
    if (path === "/api/gb_play") {                                                    // one chosen game (comp.play_fixture gives it its own stream, so order never matters)
      const [lg, wk, h, a] = String(body.id).split("|"), c = w.comps.has("L:" + lg) ? w.comps.get_("L:" + lg) : null;
      if (!c || +wk - 1 !== c.ptr) fail("That game is not on this week's slate.", 409);
      try { const r = c.play_fixture(h, a); return { ok: true, hg: r[2], ag: r[3] }; } catch (e) { if (e instanceof ValueError) fail(e.message); throw e; }
    }
    if (path === "/api/gb_finish") return finishWeek(w, body.wk);
    if (path === "/api/gb_settle") return { bets: settle(w, body.bets || []) };
    return null;
  }
  return { api, tip, peek, titleChances, titleQuote, titleCheck, props, detail, scorersFor, slate, playSlot, settle, settleLeg, combine, price, markets, slotFor, slotWeights, h01, SLOTS, MARGIN, LINE };
})();
