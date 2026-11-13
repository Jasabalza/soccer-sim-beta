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
  console.log(bad ? bad + " failed" : "gambler checks: all passed (" + n + " games checked)");
  process.exit(bad ? 1 : 0);
})();
