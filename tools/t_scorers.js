// Goalscorers on finished matches: same every time, add up to the competition's own goal table, never change a score.
const fs = require("fs"), vm = require("vm"), D = __dirname + "/../data/";
globalThis.__DATA = {}; for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(__dirname + "/../dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,A:$mods.app_v11,cs:$mods.compstats};");
(async () => {
  const R = globalThis.__R; await R.init(); await R.request("/api/new", { seed: "4" });
  const w = R.A.ST.world; await R.request("/api/sim", { scope: "world", to_end: true });
  let fails = 0, games = 0, goals = 0;
  for (const cid of ["L:La Liga", "C:UEFA"]) {
    const c = w.comps.get(cid), teams = cid[0] === "L" ? Array.from(c.clubs) : Array.from(c.field);
    const tot = {}, seen = new Set();
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
      const g1 = R.cs.scorers_between(w, cid, teams[i], teams[j]), g2 = R.cs.scorers_between(w, cid, teams[j], teams[i]);
      if (JSON.stringify(g1) !== JSON.stringify(g2.map((g) => g)) && g1.length) { fails++; console.log("order differs", teams[i], teams[j]); }
      for (const g of g1) { games++; if (g.hs.length !== g.hg || g.as.length !== g.ag) { fails++; console.log("goal count mismatch", g.h, g.a); } for (const s of g.hs.concat(g.as)) { const k = $id(w.player_by_uid(s.uid)); tot[k] = (tot[k] || 0) + 1; goals++; } }
    }
    const st = R.cs.comp_stats(w, cid).get("_stats"); let bad = 0, n = 0;
    for (const [pid, v] of st.itemsArr()) { n++; if ((v[0] || 0) !== (tot[pid] || 0)) bad++; }
    console.log(cid, "players", n, "totals differing from the goal table:", bad);
    if (bad) fails++;
  }
  console.log(fails ? "SCORERS FAIL " + fails : `SCORERS OK: ${games} games, ${goals} goals, same on reopen, totals match the competition tables`);
  process.exit(fails ? 1 : 0);
})();
