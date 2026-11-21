// Owner Mode bot run: node tools/t_owner.js [seasons=12] [seed=7] [backstory=selfmade]   ends with "OWNER OK" or "OWNER FAIL"
const fs = require("fs"), vm = require("vm"), D = __dirname + "/../data/";
globalThis.__DATA = {}; for (const k of ["leagues", "nations", "clubs_geo", "rivalries", "rivalries_nat"]) __DATA[k] = fs.readFileSync(D + k + ".json", "utf8");
globalThis.require = require;
vm.runInThisContext(fs.readFileSync(__dirname + "/../dist/bundle_engine.js", "utf8") + "\n;globalThis.__R={request:$mods.shim.request,init:$mods.shim.init,A:$mods.app_v11};");
const BAD = !!process.env.BAD, RECK = !!process.env.RECKLESS, ACC = !!process.env.ACCEPT, SEASONS = +(process.argv[2] || 12), seed = process.argv[3] || "7", back = process.argv[4] || "selfmade";
(async () => {
  const R = globalThis.__R; await R.init(); const fail = [], stat = { buys: 0, sells: 0, wars: 0, collapsed: 0, buyouts: 0, bankrupt: 0, deals: 0 };
  const raw = (p, b) => R.request(p, b);
  const call = async (p, b) => { const r = await raw(p, b); if (r.code !== 200) throw new Error(p + " " + r.code + " " + JSON.stringify(r.body)); return r.body; };
  await call("/api/ow_new", { seed, backstory: back, name: "Bot", mode: "classic" });
  const w = R.A.ST.world; const base = () => w.league_avgs ? 0 : 0;
  const pickClub = async () => {
    const rows = (await call("/api/ow_clubs")).rows;
    let cand = rows.filter((r) => r.status === "open").sort((a, b) => b.stature - a.stature);
    if (back === "trust") cand = rows.filter((r) => r.stature >= 40 && r.stature <= 80);
    if (!cand.length) return null; await call("/api/ow_buy", { club: cand[0].club }); return cand[0].club;
  };
  let club = await pickClub(); if (!club) { console.log("no club to buy"); console.log("OWNER FAIL"); return; }
  for (let s = 0; s < SEASONS; s++) {
    let st = await call("/api/ow_state"); if (st.state === "ended") { console.log("run ended:", JSON.stringify(st.ended)); break; }
    if (st.state === "between") { club = await pickClub(); if (!club) { console.log("cannot buy again"); break; } st = await call("/api/ow_state"); }
    if (BAD && st.club) { const f = st.club.cash - 0.15 * st.club.income; if (f > 1 && st.club.debt === 0) await raw("/api/ow_dividend", { amount: Math.floor(f) }); }
    // play the season
    for (let k = 0; k < 60; k++) { const a = await call("/api/ow_advance", { unit: "season" }); if (a.rolled) break; }
    st = await call("/api/ow_state");
    if (st.state === "ended") { console.log("run ended:", JSON.stringify(st.ended)); break; }
    if (st.state === "between") { stat.bankrupt++; }
    // off-season steps
    if (w.flow) { await call("/api/flow", { step: "graduates" }); await call("/api/flow", { step: "transfers" }); }
    st = await call("/api/ow_state");
    if (st.reneg) { for (const x of st.reneg.list) { if (x.coach === "nodeal") { stat.nodeal = (stat.nodeal || 0) + 1; const r = await call("/api/ow_reneg", { uid: x.uid, action: "approve" }); stat["nodeal_" + r.status] = (stat["nodeal_" + r.status] || 0) + 1; continue; } await call("/api/ow_reneg", { uid: x.uid, action: x.coach === "resign" ? "approve" : "walk" }); } await call("/api/ow_round", {}); await call("/api/ow_round", {}); st = await call("/api/ow_state"); }
    if (st.window && st.window.open) {
      for (let r = 1; r <= 6; r++) {
        const win = (await call("/api/ow_state")).window; if (!win || !win.open) break;
        if (r === 1 && win.requests) for (const q of win.requests) { stat.req = (stat.req || 0) + 1; const x = await call("/api/ow_persuade", { uid: q.uid, confirm: true }); stat["pers_" + x.status] = (stat["pers_" + x.status] || 0) + 1; }
        if (r === 1) { const sq0 = (await call("/api/ow_squad")).rows; for (const p of sq0.slice(-3)) await call("/api/ow_release", { uid: p.uid }); }
        if (BAD && r === 1) { const top = (await call("/api/ow_squad")).rows.slice(0, 4); for (const p of top) { const o = await call("/api/ow_sell", { uid: p.uid }); if (o.offers && o.offers[0]) await call("/api/ow_sellreply", { uid: p.uid, club: o.offers[0].club, action: "accept" }); } }
        stat.maxDeals = Math.max(stat.maxDeals || 0, win.deals.length); if (win.deals.some((d) => !d.fit)) fail.push("deal without fit"); for (const d of (BAD ? [] : win.deals)) {
          const x = await call("/api/ow_deal", { id: d.id, action: "approve" }); if (x.status === "done") stat.deals++;
        }
        if (r === 2 && !BAD) { const m = (await call("/api/ow_market?sort=value&minOvr=70&maxAge=29")).rows;
          for (const p of m.slice(0, 3)) { const x = await call("/api/ow_bid", { uid: p.uid, fee: p.value * 1.4, wage: p.wage * 1.3, years: 3 }); if (x.status === "done") stat.buys++; if (x.status === "war") stat.wars++; } }
        if (RECK && r <= 4) { const m = (await call("/api/ow_market?sort=ovr&minOvr=80")).rows; for (const p of m.slice(0, 4)) { const x = await call("/api/ow_bid", { uid: p.uid, fee: p.value * 3, wage: p.wage * 2, years: 5 }); if (x.status === "done") stat.buys++; } }
        if (r === 3 && !RECK) { const sq = (await call("/api/ow_squad")).rows; const p = sq[sq.length - 1]; if (p) { const o = await call("/api/ow_sell", { uid: p.uid }); if (o.offers && o.offers[0]) { const x = await call("/api/ow_sellreply", { uid: p.uid, club: o.offers[0].club, action: "accept" }); if (x.status === "done") stat.sells++; } } }
        await call("/api/ow_round", {});
      }
      st = await call("/api/ow_state"); if (st.window && st.window.open) { await call("/api/ow_endwindow", {}); }
    }
    if (w.flow) await call("/api/flow", { step: "done" });
    st = await call("/api/ow_state");
    if (st.buyout) { stat.buyouts++; await call("/api/ow_buyout", { action: ACC ? "accept" : "refuse" }); }
    const sq = w.players.filter((p) => p.club === (st.club && st.club.name)).length;
    if (st.club && (sq < 18 || sq > 25)) fail.push("squad " + sq + " in season " + w.season);
    if (!Number.isFinite(st.wealth)) fail.push("wealth not finite");
    if (st.club) console.log("S" + (w.season - 1), st.club.name, "age", st.age, "wealth", st.wealth, "cash", st.club.cash, "debt", st.club.debt, "board", st.pressure.board, "fans", st.pressure.fans, "pl", st.pressure.players, st.pressure.ladder_name, "squad", sq);
    else console.log("S" + (w.season - 1), "no club", st.state, "wealth", st.wealth);
  }
  // new in this build: money log, honours history, squad needs, roster fit, several coach offers
  { const st2 = await call("/api/ow_state");
    if (!st2.money || st2.money.length < 3) fail.push("money log empty");
    else { const bad = st2.money.find((m) => !Number.isFinite(m.w) || !Number.isFinite(m.dw)); if (bad) fail.push("money log has a non-number"); }
    if (!st2.hist || !st2.hist.length) fail.push("no season history");
    if (st2.club) { const n = st2.needs; if (!n || n.pos.length !== 4 || n.n !== st2.club.squad) fail.push("needs wrong"); }
    stat.maxDeals = stat.maxDeals || 0; }
  // save round trip keeps the owner run
  const w1 = $deser($ser(w)); if (!w1.ow || w1.ow.age !== w.ow.age || w1.ow.wealth !== w.ow.wealth) fail.push("save round trip lost the owner state");
  { const A = w.league_avgs(), o = {}; for (const [k, v] of (A.itemsArr ? A.itemsArr() : Object.entries(A))) o[k] = Math.round(v * 100) / 100; const ch = new Set(); for (const r of w.hist) for (const [l, n] of r.get("champs").itemsArr()) ch.add(l + "|" + n); console.log("LAVG " + JSON.stringify(o) + " champs " + ch.size); }
  console.log("stats", JSON.stringify(stat)); console.log(fail.length ? "OWNER FAIL: " + fail.join("; ") : "OWNER OK");
})().catch((e) => { console.log("OWNER FAIL (exception)", e && e.stack || e); process.exit(1); });
