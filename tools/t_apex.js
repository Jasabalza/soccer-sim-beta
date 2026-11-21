// Apex League stage 1: node tools/t_apex.js [seasons=7] [seed=3]. World event, countdown, contracts, AI choices, field check; owner choice and the rollover block.
const fs = require("fs"), vm = require("vm"), D = __dirname + "/../data/";
globalThis.__DATA = {}; for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(__dirname + "/../dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,A:$mods.app_v11,ap:$mods.apex};");
(async () => {
  const R = globalThis.__R, fail = [], N = +(process.argv[2] || 7), seed = process.argv[3] || "3";
  await R.init();
  const call = async (p, b) => { const r = await R.request(p, b); if (r.code !== 200) throw new Error(p + " " + r.code + " " + JSON.stringify(r.body)); return r.body; };
  // 1: a world made without the switch has no Apex state at all
  await call("/api/new", { seed }); if (R.A.ST.world.apex) fail.push("apex state in a normal world");
  // 2: a world with it
  await call("/api/new", { seed, apex: "1", apex_year: 2 }); const w = R.A.ST.world;
  if (!w.apex || w.apex.announce !== 2 || w.apex.inaugural !== 5) fail.push("announce/inaugural wrong " + JSON.stringify(w.apex && [w.apex.announce, w.apex.inaugural]));
  const states = [];
  for (let s = 0; s < N; s++) {
    const v = await call("/api/apex"); states.push("S" + w.season + ":" + v.state);
    if (v.state === "contracts") { if (!v.signed || !v.strength) fail.push("contracts without signed/strength"); }
    await call("/api/sim", { scope: "world", to_end: true });
    await call("/api/rollover", {}); for (const st of ["graduates", "transfers", "done"]) await call("/api/flow", { step: st }).catch(() => 0);
  }
  console.log(states.join(" "));
  const v = await call("/api/apex"); console.log("final", v.state, "delays", v.delays, "members", (v.members || []).map((m) => m.club).join(", "));
  if (!states.some((x) => x.endsWith("rumour"))) fail.push("never in rumour state");
  if (!states.some((x) => x.endsWith("contracts"))) fail.push("never reached contracts");
  if (!["live", "dead", "contracts"].includes(v.state)) fail.push("unexpected final state " + v.state);
  if (v.state === "live") { if (v.members.length < 4 || v.members.length > 16) fail.push("member count " + v.members.length); }
  if (!w.news_log.some((n) => n[2] === "apex")) fail.push("no apex news");
  // 2b: stage 2: the league is real, members left their leagues, everything still answers
  if (v.state === "live") {
    const AL = w.leagues.get("Apex League"), mem = AL.get("clubs"), set = new Set(mem);
    if (mem.length !== v.members.length) fail.push("league clubs != members");
    for (const m of mem) if (w.clubs.get(m).get("league") !== "Apex League") fail.push(m + " still in an old league");
    for (const ln of w.leagues.keysArr()) { if (ln === "Apex League") continue; const L = w.leagues.get(ln); for (const m of L.get("clubs")) if (set.has(m)) fail.push(m + " listed in " + ln); }
    for (const ln of new Set(mem.map((m) => w.apex.offers[m].league))) { const L = w.leagues.get(ln); if (L.get("games") > R.ap.fullLen(L.get("clubs").length)) fail.push(ln + " games " + L.get("games") + " for " + L.get("clubs").length + " clubs"); }
    const lc = w.comps.get("L:Apex League"); if (!lc || lc.st.size !== mem.length) fail.push("no Apex comp or wrong size");
    const champs = w.hist.map((r) => r.get("champs").get("Apex League")).filter(Boolean); if (champs.length < 2) fail.push("Apex champions not recorded (" + champs.length + ")");
    for (const [cf, f] of w.cup_fields.itemsArr()) for (const m of f) if (set.has(m)) fail.push(m + " in the " + cf + " cup field");
    const tab = (await call("/api/league?name=" + "Apex League")); if (!tab.rows || tab.rows.length !== mem.length) fail.push("league page rows");
    const bad = [];
    for (const u of ["/api/world", "/api/status", "/api/news", "/api/nations", "/api/awards", "/api/trophies", "/api/worldmoney", "/api/leaguemoney", "/api/records", "/api/years", "/api/charts", "/api/halloffame", "/api/hof_clubs", "/api/comp?id=" + "L:Apex League", "/api/club?name=" + mem[0], "/api/money?club=" + mem[0], "/api/compstats?id=" + "L:Apex League", "/api/comphist?id=" + "L:Apex League", "/api/fixtures?comp=" + "L:Apex League", "/api/league?name=Premier League", "/api/hofleague?league=" + "Apex League", "/api/moves", "/api/movemoney"]) {
      let r; try { r = await R.request(u); } catch (e) { bad.push(u + " threw " + String(e.message).slice(0, 60)); continue; } if (r.code >= 500) bad.push(u + " " + r.code + " " + JSON.stringify(r.body).slice(0, 80));
    }
    if (bad.length) fail.push("endpoints: " + bad.join(" | "));
    if (typeof v.health !== "number") fail.push("no health score");
    const txt = JSON.stringify(w.news_log); const rv = (txt.match(/Apex League (renews|keeps on review|lets)/g) || []).length, vt = (txt.match(/Apex board votes/g) || []).length;
    console.log("health", v.health, "want", v.want, "reviews", rv, "board votes", vt);
    if (N >= 14 && rv < 3) fail.push("contract reviews never happened (" + rv + ")");
    const sl = (v.rel || []).map((r) => r.league + ":" + r.label + "(" + r.rel + ")").join(" "); console.log("relations", sl);
    if (N >= 12 && !(v.rel || []).some((r) => r.level >= 2)) fail.push("no sanctions after " + N + " seasons");
    for (const r of v.rel || []) { const L = w.leagues.get(r.league), n = L.get("clubs").length; if (n < 12 && r.clubs > 0) fail.push(r.league + " down to " + n + " clubs"); if (R.ap.lostFrom(w, r.league) > Math.max(1, Math.floor(0.25 * (n + R.ap.lostFrom(w, r.league))))) fail.push(r.league + " lost too many"); }
    // a blocked pair never trades: check this season's transfers
    const bl = w.transfers.filter((t) => t.get("season") === w.season - 1 && t.get("frm") && R.ap.blocked(w, t.get("frm"), t.get("to"))).length; console.log("transfers last season across a block:", bl);
    const dup = mem.filter((m, i) => mem.indexOf(m) !== i); if (dup.length) fail.push("duplicate members " + dup.join());
    const prem = w.leagues.get("Premier League").get("clubs").length; console.log("Apex", mem.length, "clubs; Premier League now", prem, "clubs; champions", champs.join(", "));
  }
  // 3: determinism and save round trip
  const w2 = $deser($ser(w)); if (JSON.stringify(w2.apex) !== JSON.stringify(w.apex)) fail.push("save round trip changed apex state");
  // 4: an owner at a giant gets an offer and cannot end the season without answering
  await call("/api/ow_new", { seed, backstory: "veteran", name: "T", mode: "sandbox", apex: "1", apex_year: 2 });
  const w3 = R.A.ST.world, rows = (await call("/api/ow_clubs")).rows, openRows = rows.filter((r) => r.status === "open"), rk = R.ap.ranking(w3).map((r) => r.club), tr = openRows.sort((a, b) => rk.indexOf(a.club) - rk.indexOf(b.club))[0], top = tr && tr.club;
  if (!tr || tr.status !== "open") { console.log("owner part skipped: top club not buyable (" + top + ")"); }
  else {
    await call("/api/ow_buy", { club: top }); let blocked = false, seen = false;
    for (let s = 0; s < 4 && !seen; s++) {
      const st = await call("/api/ow_state"); if (st.apex && st.apex.offer) { seen = true; break; }
      for (let k = 0; k < 60; k++) { const a = await call("/api/ow_advance", { unit: "season" }); if (a.rolled) break; }
      if (w3.flow) { await call("/api/flow", { step: "graduates" }); await call("/api/flow", { step: "transfers" }); await call("/api/flow", { step: "done" }); }
      const s2 = await call("/api/ow_state"); if (s2.window && s2.window.open) await call("/api/ow_endwindow", {});
    }
    if (!seen) fail.push("owner at the top club never got an offer");
    else {
      const st = await call("/api/ow_state"); if (!(st.apex.offer.apex_pay > st.apex.offer.dom_pay)) fail.push("domestic counter not smaller than Apex pay");
      try { for (let k = 0; k < 80; k++) { const a = await call("/api/ow_advance", { unit: "season" }); if (a.rolled) break; } } catch (e) { blocked = /Apex/.test(e.message); }
      if (!blocked) fail.push("season ended without an Apex answer");
      const r = await call("/api/ow_apex", { action: "apex" }); if (r.choice !== "apex") fail.push("choice not stored");
      const w4 = R.A.ST.world; const f0 = w4.ow.fans; for (let k = 0; k < 80; k++) { const a = await call("/api/ow_advance", { unit: "season" }); if (a.rolled) break; }
      const v2 = await call("/api/apex"); console.log("owner chose apex ->", v2.state, (v2.members || []).some((m) => m.mine) ? "in the league" : "not in the field");
      if (v2.state === "live" && (v2.members || []).some((m) => m.mine) && !(w4.ow.fans < f0 + 1)) console.log("note: fans", f0, "->", w4.ow.fans);
    }
  }
  console.log(fail.length ? "APEX FAIL: " + fail.join("; ") : "APEX OK");
})().catch((e) => { console.log("APEX FAIL (exception)", e && e.stack || e); process.exit(1); });
