// Gambler layer checks (node tools/build.js first). Prices, settlement rules, slots, and that scorer props are the SAME draw comp_stats uses.
const fs = require("fs"), vm = require("vm"), root = require("path").resolve(__dirname, "..");
const D = root + "/data/"; globalThis.__DATA = {};
for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(root + "/dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,mods:$mods};");
const R = globalThis.__R; let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } };
const call = async (p, b) => { const r = await R.request(p, b); if (r.code !== 200) throw new Error(p + " " + r.code + " " + JSON.stringify(r.body).slice(0, 200)); return r.body; };
(async () => {
  await R.init(); const G = R.mods.gambler;
  // pure rules
  ok(G.settleLeg({ market: "1x2", pick: "H" }, 2, 1) === true && G.settleLeg({ market: "1x2", pick: "D" }, 2, 1) === false, "1x2");
  ok(G.settleLeg({ market: "ou", pick: "O" }, 2, 1) === true && G.settleLeg({ market: "ou", pick: "O" }, 1, 1) === false && G.settleLeg({ market: "ou", pick: "U" }, 1, 1) === true, "over/under 2.5");
  ok(G.settleLeg({ market: "btts", pick: "Y" }, 0, 3) === false && G.settleLeg({ market: "btts", pick: "N" }, 0, 3) === true, "btts");
  ok(G.settleLeg({ market: "1x2", pick: "H" }, null, null) === null, "unplayed = pending");
  ok(G.combine([{ odds: 2, league: "x", week: 1, h: "a", a: "b" }, { odds: 3, league: "x", week: 1, h: "c", a: "d" }]) === 6, "parlay multiplies");
  ok(G.combine([{ odds: 2, league: "x", week: 1, h: "a", a: "b" }, { odds: 2, league: "x", week: 1, h: "a", a: "b" }]) === 3.4, "same-match legs x0.85");
  ok(G.price(0.5) === 1.86 && G.price(0.999) === 1.05, "price margin and floor");
  let w3 = [0, 0, 0]; for (let i = 0; i < 3000; i++) w3[G.slotFor({ seed: 1, season: 1 }, "Major League Soccer", 1, "a" + i, "b", false)]++;
  ok(w3[2] > 2000 && w3[0] < 400, "MLS leans Night " + w3);
  await call("/api/new", { seed: 7, rules: {} });
  const s1 = await call("/api/gb_slate"), s2 = await call("/api/gb_slate");
  ok(JSON.stringify(s1) === JSON.stringify(s2), "slate is deterministic");
  ok(s1.leagues.length > 5 && s1.leagues[0].rows.every((m) => m.odds.home > 1 && m.slot >= 0 && m.slot <= 2), "slate shape");
  // 14 weeks: detail is consistent with the score, and scorer goals add up to comp_stats
  const lg = "Premier League", seen = [];
  for (let wk = 0; wk < 14; wk++) {
    const sl = await call("/api/gb_slate"), L = sl.leagues.find((x) => x.name === lg);
    await call("/api/gb_slot", { slot: "all" });
    if (L) for (const m of L.rows) seen.push(m);
    await call("/api/gb_finish", { wk: sl.wk });
  }
  const w = R.mods.app_v11.need_world(), c = w.comps.get_("L:" + lg), sq = w.squads(), perPlayer = {};
  let n = 0;
  for (const m of seen) {
    const r = G.settle(w, [{ id: 1, stake: 10, legs: [{ league: lg, week: m.week, h: m.h, a: m.a, market: "1x2", pick: "H", odds: 2 }] }])[0].legs[0];
    const d = G.detail(w, lg, m.week, m.h, m.a, r.hg, r.ag, sq);
    ok(d.goals.filter((g) => g.side === "H").length === r.hg && d.goals.filter((g) => g.side === "A").length === r.ag, "goals add up " + m.id);
    ok(d.ht[0] <= r.hg && d.ht[1] <= r.ag, "half-time within final " + m.id);
    ok(d.goals.every((g) => g.min >= 1 && g.min <= 90), "minutes in range");
    const d2 = G.detail(w, lg, m.week, m.h, m.a, r.hg, r.ag, sq); ok(JSON.stringify(d) === JSON.stringify(d2), "detail is deterministic");
    for (const g of d.goals) perPlayer[g.uid] = (perPlayer[g.uid] || 0) + 1; n++;
  }
  const cs = await call("/api/compstats?id=" + encodeURIComponent("L:" + lg));
  const rows = (cs.scorers || cs.top_scorers || cs.goals || []).slice(0, 10);
  ok(rows.length > 0, "comp_stats scorer rows found (keys: " + Object.keys(cs).join(",") + ")");
  let match = 0; for (const r of rows) if (perPlayer[r.uid] === r.goals) match++;
  ok(match === rows.length, "scorer goals equal comp_stats for the top 10 (" + match + "/" + rows.length + ")");
  const pr = G.props(w, lg, c.ptr + 1, c.rounds[c.ptr][0][0], c.rounds[c.ptr][0][1]);
  ok(pr.scorers.H.length > 0 && pr.corners.over > 1 && pr.ht.D > 1, "props priced");
  // title chances: add up to 1, deterministic, favourite is a top-4 side, settle after the last round
  const tq = G.titleQuote(w, lg), tq2 = G.titleQuote(w, lg), T = G.titleChances(w, lg);
  ok(JSON.stringify(tq) === JSON.stringify(tq2), "title quote deterministic");
  ok(Math.abs(Object.values(T.p).reduce((x, y) => x + y, 0) - 1) < 1e-9, "title chances sum to 1");
  ok(tq.rows[0].odds >= 1.05 && tq.rows.length > 2, "title rows priced");
  const t0 = Date.now(); G.titleChances(w, lg); ok(Date.now() - t0 < 1500, "title quote fast enough (" + (Date.now() - t0) + " ms)");
  await call("/api/sim", { scope: "world", to_end: true });
  const fin = G.titleCheck(w, [{ id: 1, league: lg, club: w.comps.get_("L:" + lg).standings()[0] }, { id: 2, league: lg, club: w.comps.get_("L:" + lg).standings()[1] }]);
  ok(fin[0].status === "won" && fin[1].status === "lost", "title settles on the final table");
  // tips: peeking never changes the game, and a rho-reliable source is right about rho of the time
  {
    await call("/api/new", { seed: 11, rules: {} });
    const w2 = R.mods.app_v11.need_world(), sl = await call("/api/gb_slate"), L = sl.leagues[0], c2 = w2.comps.get_("L:" + L.name), m = L.rows[0];
    const pk = G.peek(w2, c2, m.h, m.a), before = JSON.stringify(c2.st.get_(m.h)); G.peek(w2, c2, m.h, m.a);
    ok(JSON.stringify(c2.st.get_(m.h)) === before, "peek leaves the table alone");
    const played = c2.play_fixture(m.h, m.a); ok(played[2] === pk[0] && played[3] === pk[1], "peek equals the real result");
    let right = 0, N = 300;
    for (let i = 0; i < N; i++) { const t = G.tip(w2, "test", 0.8, i); if (t.none) continue; const cc = w2.comps.get_("L:" + t.league), [hg, ag] = G.peek(w2, cc, t.h, t.a); if (G.settleLeg({ market: t.market, pick: t.pick }, hg, ag)) right++; }
    ok(right / N > 0.74 && right / N < 0.86, "tip reliability near 0.8, got " + (right / N).toFixed(2));
    ok(JSON.stringify(G.tip(w2, "x", 0.5, 3)) === JSON.stringify(G.tip(w2, "x", 0.5, 3)), "tip is deterministic");
  }
  // momentum: capped, off by default, and a matchweek's results never depend on the order its games are played
  {
    const mk = async (rev) => { await call("/api/new", { seed: 5, rules: {} }); await call("/api/gb_mode", { momentum: true }); const w5 = R.mods.app_v11.need_world();
      for (let i = 0; i < 9; i++) { const sl = await call("/api/gb_slate"); await call("/api/gb_slot", { slot: "all" }); await call("/api/gb_finish", { wk: sl.wk }); }
      const c5 = w5.comps.get_("L:Premier League"), fx = c5.unplayed().map((f) => [f[0], f[1]]); if (rev) fx.reverse(); const out = [];
      const hot = Object.values(G.momentum(w5, c5)); ok(hot.every((v) => Math.abs(v) <= 3.0001) && hot.some((v) => Math.abs(v) > 0.5), "momentum within the cap and not all zero");
      for (const [h, a] of fx) out.push(c5.play_fixture(h, a).join(",")); return out.sort().join(";"); };
    const A = await mk(false), B = await mk(true); ok(A === B, "momentum: matchweek is order independent");
    await call("/api/new", { seed: 5, rules: {} }); ok(!R.mods.app_v11.need_world().gb_mom, "momentum off by default");
  }
  console.log(bad ? bad + " failed" : "gambler checks: all passed (" + n + " games checked)");
  process.exit(bad ? 1 : 0);
})();
