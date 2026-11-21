// Same seed, same number of seasons: a plain world versus a world with an owner bot. League strength and champion variety must stay close.
const fs = require("fs"), vm = require("vm"), D = __dirname + "/../data/";
globalThis.__DATA = {}; for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(__dirname + "/../dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,A:$mods.app_v11};");
(async () => {
  const R = globalThis.__R; await R.init(); const n = +(process.argv[2] || 20), seed = process.argv[3] || "11";
  await R.request("/api/new", { seed }); for (let i = 0; i < n; i++) { await R.request("/api/years", { n: 1 }); }
  const w = R.A.ST.world, A = w.league_avgs(), o = {}; for (const [k, v] of A.itemsArr()) o[k] = Math.round(v * 100) / 100;
  const ch = new Set(); for (const r of w.hist) for (const [l, c] of r.get("champs").itemsArr()) ch.add(l + "|" + c);
  console.log("LAVG " + JSON.stringify(o) + " champs " + ch.size);
})();
