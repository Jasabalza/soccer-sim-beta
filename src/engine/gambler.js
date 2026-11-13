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
  // does one leg win? null = not played yet
  function settleLeg(leg, hg, ag) {
    if (hg == null) return null;
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
  function settle(w, bets) {
    return bets.map((b) => {
      let lost = false, pending = false;
      const legs = b.legs.map((l) => {
        const r = result(w, l.league, l.week, l.h, l.a), ok = r ? settleLeg(l, r[0], r[1]) : null;
        if (ok === null) pending = true; else if (!ok) lost = true;
        return { hg: r ? r[0] : null, ag: r ? r[1] : null, ok };
      });
      const status = lost ? "lost" : pending ? "open" : "won";
      return { id: b.id, status, legs, payout: status === "won" ? r2(b.stake * combine(b.legs)) : 0 };
    });
  }
  function api(w, path, q, body) {
    if (path === "/api/gb_slate") return slate(w);
    if (path === "/api/gb_slot") return playSlot(w, body.slot === "all" ? "all" : +body.slot);
    if (path === "/api/gb_finish") return finishWeek(w, body.wk);
    if (path === "/api/gb_settle") return { bets: settle(w, body.bets || []) };
    return null;
  }
  return { api, slate, playSlot, settle, settleLeg, combine, price, markets, slotFor, slotWeights, h01, SLOTS, MARGIN, LINE };
})();
