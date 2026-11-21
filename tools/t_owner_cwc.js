// Club World Cup rows for the owner: plays an owner at a top club week by week and checks the schedule shows opponents, scores and a sane bracket.
const fs = require("fs"), vm = require("vm"), D = __dirname + "/../data/";
globalThis.__DATA = {}; for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(__dirname + "/../dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,A:$mods.app_v11};");
(async () => {
  const R = globalThis.__R; await R.init(); const fail = [];
  const call = async (p, b) => { const r = await R.request(p, b); if (r.code !== 200) throw new Error(p + " " + r.code + " " + JSON.stringify(r.body)); return r.body; };
  await call("/api/ow_new", { seed: process.argv[2] || "7", backstory: "veteran", name: "Bot", mode: "sandbox" });
  const w = R.A.ST.world, rows = (await call("/api/ow_clubs")).rows;
  const top = rows.filter((r) => r.status === "open").sort((a, b) => b.stature - a.stature)[0]; await call("/api/ow_buy", { club: top.club }); console.log("owner at", top.club);
  let seen = 0, shown = new Set();
  for (let wk = 0; wk < 700 && seen < 4; wk++) {
    const st = await call("/api/ow_state"); if (st.window && st.window.open) await call("/api/ow_endwindow", {}); if (w.flow) { await call("/api/flow", { step: "graduates" }); await call("/api/flow", { step: "transfers" }); await call("/api/flow", { step: "done" }); }
    const sc = await call("/api/ow_schedule"), c = sc.comps.find((x) => x.kind === "cwc");
    if (c) {
      const key = c.games.map((g) => (g.played ? "P" : g.tentative ? "T" : "U")).join("");
      if (!shown.has(key)) { shown.add(key); seen++; console.log("CWC", c.id, "out", c.out, "winner", c.winner); for (const g of c.games) console.log("  ", g.date ? g.date.text : "-", g.label, g.h ? g.h + " v " + g.a : "(tentative)", g.played ? g.hg + "-" + g.ag + (g.how ? " " + g.how : "") : ""); 
        if (c.games.some((g) => g.label.startsWith("Group") && !g.h)) fail.push("group game without opponent");
        const x = await call("/api/comp?id=" + encodeURIComponent(c.id)); if (!x.groups || !x.groups.length) fail.push("no groups on comp page"); }
    }
    try { await call("/api/ow_advance", { unit: "week" }); } catch (e) { fail.push("advance: " + e.message.slice(0, 80)); break; }
    const st2 = await call("/api/ow_state"); if (st2.state === "ended") break;
  }
  if (!seen) fail.push("never saw a Club World Cup for the owner (try another seed)");
  console.log(fail.length ? "CWC OWNER FAIL: " + fail.join("; ") : "CWC OWNER OK");
})().catch((e) => { console.log("CWC OWNER FAIL (exception)", e && e.stack || e); process.exit(1); });
