// Team form: does a small capped nudge leave the world statistically the same? Usage: node tools/t_form.js [seasons] [seed] [caps, e.g. 0,1,2,3]
const fs = require("fs"), vm = require("vm"), D = __dirname + "/../data/";
globalThis.__DATA = {}; for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(__dirname + "/../dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,A:$mods.app_v11,riv:$mods.rivals};");
(async () => {
  const R = globalThis.__R; await R.init(); const N = +(process.argv[2] || 4), seed = process.argv[3] || "3", caps = (process.argv[4] || "0,1,2,3").split(",").map(Number);
  for (const cap of caps) {
    await R.request("/api/new", cap ? { seed, form: "1" } : { seed });
    const w = R.A.ST.world; if (cap) w.fm.cap = cap;
    let g = 0, n = 0, h = 0, d = 0, a = 0, fav = 0, favn = 0, upset = 0, titles = {}, hotMax = 0, shifts = [];
    for (let s = 0; s < N; s++) {
      await R.request("/api/sim", { scope: "world", to_end: true });
      for (const [cid, c] of w.comps.itemsArr()) if (c.kind === "league" && c.results) {
        for (const wk of c.results) for (const m of wk) { n++; g += m[2] + m[3]; if (m[2] > m[3]) h++; else if (m[2] < m[3]) a++; else d++;
          const o = R.riv.odds(c.eff.get_(m[0]), c.eff.get_(m[1]), 0, false); if (Math.abs(o.home - o.away) > 0.15) { favn++; const fh = o.home > o.away; if ((fh && m[2] > m[3]) || (!fh && m[3] > m[2])) fav++; } }
        const st = c.standings(); titles[st[0]] = (titles[st[0]] || 0) + 1;
        if (cap && s === 1) for (const t of st) shifts.push(Math.abs(R.riv.formfx(w, t)));
      }
      await R.request("/api/rollover", {}); for (const st of ["graduates", "transfers", "done"]) await R.request("/api/flow", { step: st }).catch(() => 0);
    }
    const top = Object.values(titles).sort((x, y) => y - x), tot = top.reduce((x, y) => x + y, 0);
    console.log(`cap ${cap}: games ${n}  goals/game ${(g / n).toFixed(3)}  H/D/A ${(100 * h / n).toFixed(1)}/${(100 * d / n).toFixed(1)}/${(100 * a / n).toFixed(1)}  clear favourite wins ${(100 * fav / favn).toFixed(1)}% (${favn})  title winners ${top.length}, top 10 clubs hold ${(100 * top.slice(0, 10).reduce((x, y) => x + y, 0) / tot).toFixed(0)}%` + (cap ? `  avg |form| ${(shifts.reduce((x, y) => x + y, 0) / shifts.length).toFixed(2)}, ${(100 * shifts.filter((x) => x >= 1).length / shifts.length).toFixed(0)}% of clubs hot or cold (|form| 1 or more), ${(100 * shifts.filter((x) => x >= 2).length / shifts.length).toFixed(0)}% at the cap` : ""));
  }
})();
