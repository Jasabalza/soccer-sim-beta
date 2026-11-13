// BAIT Bets (v17): the gambler mode. Milestone 0: the Sim / Gambler switch, gambler saves kept apart from sim saves,
// and an empty phone home screen. Gambler state lives in its own record (never inside the world save).
const GB_START = 1000;
// a level is 8 game weeks: a bill after weeks 4 and 8, then the quota. The quota only ever goes up (Lethal Company style).
const GB_LEVEL = 8, GB_BILL_EVERY = 4, GB_MAX_STRIKES = 3, GB_LATE = 0.1;
const gbQuotaFor = (n) => Math.round(1050 * Math.pow(1.25, n - 1) / 50) * 50;
const gbBillFor = (n) => Math.round(75 * Math.pow(1.15, n - 1) / 5) * 5;                              // starting bankroll, dollars
const GB = { run: null };                           // the open run: { name, seed, bankroll, week, created }
const gbIsName = (n) => /^gb_/.test(String(n || ""));
function gbMode() { try { return localStorage.getItem("ssb_mode") === "gambler" ? "gambler" : "sim"; } catch (e) { return "sim"; } }
function gbSetMode(m) { try { localStorage.setItem("ssb_mode", m); } catch (e) { /* private mode */ } }
// are we dealing with gambler saves right now? (inside a run, or choosing on the start screen)
function gbOnStart() { const r = location.hash.replace(/^#\/?/, "").split("/")[0]; return !(STATUS && STATUS.has_world) || r === "" || r === "start"; }
function gbActive() { return gbOnStart() ? gbMode() === "gambler" : !!GB.run; }
function gbFilterSaves(saves) { const g = gbActive(); return (saves || []).filter((s) => gbIsName(s.name) === g); }
function gbSlot(name) { name = String(name || "").replace(/[^A-Za-z0-9_\- ]/g, "").trim().slice(0, 36) || "run"; return gbIsName(name) ? name : "gb_" + name; }
const gbShow = (n) => String(n).replace(/^gb_/, "");
const gbMoney = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
function gbNewRecord(name, seed) { return { name, seed: +seed || 1, bankroll: GB_START, week: 1, level: 1, lw: 0, t: 0, tips: [], srcRec: {}, tipWeek: null, tipSalt: 0, noise: [], credit: 720, loans: [], perks: [], bonus: 0, offer: null, quota: gbQuotaFor(1), strikes: 0, owed: 0, seasons: 1, bets: [], nid: 1, created: Date.now(), v: 3 }; }
async function gbStore() { if (GB.run && SIM.kv) { try { await SIM.kv.put("gbrun_" + GB.run.name, GB.run); } catch (e) { /* storage full: the run still lives in memory */ } } }
// called after any save of the world: keep the run record next to it under the same name
async function gbSavedAs(name) { if (GB.run && gbIsName(name) && SIM.kv) { try { await SIM.kv.put("gbrun_" + name, Object.assign({}, GB.run, { name })); } catch (e) { /* ignore */ } } }
async function gbLoaded(name) {
  if (!gbIsName(name)) { GB.run = null; return; }
  let rec = null; try { rec = SIM.kv ? await SIM.kv.get("gbrun_" + name) : null; } catch (e) { rec = null; }
  GB.run = rec || gbNewRecord(name, 1);
  GB.run.name = name;
}
async function gbDeleted(name) { if (gbIsName(name) && SIM.kv) await SIM.kv.del("gbrun_" + name); }

function gbSwitchHtml() {
  const g = gbMode() === "gambler";
  return `<div class="gb-switch" role="tablist"><button data-gbmode="sim" class="${g ? "" : "on"}">Sim</button><button data-gbmode="gambler" class="${g ? "on" : ""}">Gambler <span class="gb-tag">BAIT Bets</span></button></div>`;
}
function gbNewCardHtml() {
  return `<div class="card gb-new"><h3>New run</h3>
    <div class="meta">Play money only. You start with <b>${gbMoney(GB_START)}</b> and a quota to hit every 8 weeks, and bills due every 4. Miss the quota three times and the run is over. The sim runs underneath; you just bet on it.</div>
    <div class="field"><label for="gb-seed">Seed<span class="meta" style="display:block">same seed, same world</span></label><span class="seedrow"><input type="number" id="gb-seed" value="1" min="1"><button id="gb-seed-rnd">Random</button></span></div>
    <button class="pri wide" id="gb-go">Start a run</button></div><div id="gb-hist"></div>`;
}
// run history: kept in its own record, shown on the gambler start screen
async function gbProfile() { try { return (SIM.kv && await SIM.kv.get("gbprofile")) || { runs: [] }; } catch (e) { return { runs: [] }; } }
async function gbRecordRun(r, why) {
  if (r.recorded) return; r.recorded = true;
  const prof = await gbProfile(); prof.runs.unshift({ when: Date.now(), level: r.level, weeks: r.t || 0, best: Math.round(r.best || GB_START), why, perks: (r.perks || []).length });
  prof.runs = prof.runs.slice(0, 20); try { await SIM.kv.put("gbprofile", prof); } catch (e) { /* ignore */ }
  await gbStore();
}
async function gbShowHistory() {
  const el = document.getElementById("gb-hist"); if (!el) return;
  const prof = await gbProfile(); if (!prof.runs.length) { el.innerHTML = ""; return; }
  const best = Math.max(...prof.runs.map((x) => x.level));
  el.innerHTML = `<div class="card"><h3>Past runs</h3><div class="meta">Best level ${best} &middot; ${prof.runs.length} run${prof.runs.length > 1 ? "s" : ""}</div>${prof.runs.slice(0, 6).map((x) => `<div class="row"><span>Level ${x.level}, ${x.weeks} weeks, peak ${gbMoney(x.best)}</span><span class="meta">${esc(x.why)}</span></div>`).join("")}</div>`;
}
function gbWireStart() {
  document.querySelectorAll("[data-gbmode]").forEach((b) => b.onclick = async () => { gbSetMode(b.dataset.gbmode); await viewStart(); });
}
function gbWireNew() {
  gbShowHistory();
  const rnd = document.getElementById("gb-seed-rnd"); if (rnd) rnd.onclick = () => (document.getElementById("gb-seed").value = 1 + Math.floor(Math.random() * 99999));
  const go = document.getElementById("gb-go"); if (!go) return;
  go.onclick = async () => {
    const seed = document.getElementById("gb-seed").value;
    GB.run = gbNewRecord("gb_autosave", seed);             // set first: the engine's autosave after "new" must land under a gb_ name
    const ok = await busy("Building the world (about 2 seconds)...", () => api("/api/new", { seed, rules: {} }));
    if (!ok) { GB.run = null; return; }
    await api("/api/gb_mode", { momentum: true });          // hot and cold teams are part of this mode
    await gbLoadSlate();
    GB.run.offer = gbOfferFor(GB.run);                      // a run starts with a perk pick, like any roguelike
    await gbStore();
    location.hash = "#/gambler"; await refreshStatus(); await route();
  };
}

// ---------------------------------------------------------------- the betting screens (milestone 1)
const GBU = { props: {}, open: null, slate: null, slip: [], league: null, slot: "all", tab: "slate", stake: 25, msg: "" };
const GB_SLOTS = ["Morning", "Midday", "Night"], GB_ICON = ["&#9728;", "&#9788;", "&#9790;"];
const gbOdds = (x) => (+x).toFixed(2);
async function gbPersist() {
  await gbStore();
  try { await SIM.request("/api/save", { name: "gb_autosave" }); await gbSavedAs("gb_autosave"); } catch (e) { /* the run record is already kept */ }
}
async function gbLoadSlate() { GBU.tq = null; GBU.props = {}; GBU.open = null; GBU.slate = await api("/api/gb_slate"); GB.run.tips = GB.run.tips || []; for (const lg of GBU.slate.leagues) for (const m of lg.rows) { m.f = gbFactor(m.id); for (const k of Object.keys(m.odds)) m.odds[k] = gbAdj(m.odds[k], m.id); } const ls = GBU.slate.leagues; if (!GBU.league || !ls.some((l) => l.name === GBU.league)) GBU.league = ls.length ? ls[0].name : null; }
const gbLegLabel = (l) => l.market === "scr" ? (l.pname || "Player") + " to score" : ({ "1x2": { H: l.h + " win", D: "Draw", A: l.a + " win" }, ou: { O: "Over 2.5 goals", U: "Under 2.5 goals" }, btts: { Y: "Both teams score", N: "Not both score" },
  ht: { H: "Half-time: " + l.h, D: "Half-time: draw", A: "Half-time: " + l.a }, cor: { O: "Over 9.5 corners", U: "Under 9.5 corners" }, crd: { O: "Over 3.5 cards", U: "Under 3.5 cards" } }[l.market][l.pick]);
const gbOpenBets = () => GB.run.bets.filter((b) => b.status === "open" && !b.kind);
const gbOpenTitles = () => GB.run.bets.filter((b) => b.status === "open" && b.kind === "title");
function gbSlipToggle(m, market, pick, odds, extra) {
  const k = (l) => l.id === m.id && l.market === market && (market !== "scr" || l.pick === pick);
  const i = GBU.slip.findIndex(k);
  if (i >= 0) { const same = GBU.slip[i].pick === pick; GBU.slip.splice(i, 1); if (same) return; }
  GBU.slip.push(Object.assign({ id: m.id, league: m.league, week: m.week, h: m.h, a: m.a, market, pick, odds, p: Math.min(0.97, (1 - 0.07) / (odds / (m.f || 1))) }, extra || {}));
}
const gbOn = (m, market, pick) => GBU.slip.some((l) => l.id === m.id && l.market === market && l.pick === pick);
function gbBtn(m, market, pick, label, odds, lock, pname) {
  return `<button class="gb-o${gbOn(m, market, pick) ? " on" : ""}" ${lock ? "disabled" : ""} data-gbl="${esc(m.id)}" data-mk="${market}" data-pk="${esc(pick)}" data-od="${odds}"${pname ? ` data-pn="${esc(pname)}"` : ""}><span>${esc(label)}</span><b>${gbOdds(odds)}</b></button>`;
}
function gbPropsHtml(m, p) {
  const sc = (side, team) => `<div class="gb-sc"><div class="gb-sub2"><b>${esc(team)}</b> to score</div>${p.scorers[side].map((x) => gbBtn(m, "scr", String(x.uid), x.name.split(" ").slice(-1)[0] + " " + x.pos, x.odds, false, x.name)).join("")}</div>`;
  return `<div class="gb-props"><div class="gb-sub2">Half-time result <span class="gb-gen">generated</span></div><div class="gb-row3">${gbBtn(m, "ht", "H", "HT " + m.h.split(" ")[0], p.ht.H)}${gbBtn(m, "ht", "D", "HT draw", p.ht.D)}${gbBtn(m, "ht", "A", "HT " + m.a.split(" ")[0], p.ht.A)}</div>
    <div class="gb-sub2">Corners (avg ${p.corners.mean}) and cards (avg ${p.cards.mean}) <span class="gb-gen">generated</span></div>
    <div class="gb-row4">${gbBtn(m, "cor", "O", "Over 9.5 corners", p.corners.over)}${gbBtn(m, "cor", "U", "Under 9.5", p.corners.under)}${gbBtn(m, "crd", "O", "Over 3.5 cards", p.cards.over)}${gbBtn(m, "crd", "U", "Under 3.5", p.cards.under)}</div>
    <div class="gb-sub2">Anytime goalscorer <span class="gb-gen">same draw as the scorer table</span></div><div class="gb-scs">${sc("H", m.h)}${sc("A", m.a)}</div></div>`;
}
const gbHeat = (v) => v >= 0.5 ? ` <span class="gb-hot" title="Hot: winning more than the ratings say">&#128293;</span>` : v <= -0.5 ? ` <span class="gb-cold" title="Cold: losing more than the ratings say">&#10052;</span>` : "";
function gbMatchHtml(m) {
  const lock = m.done, o = m.odds;
  const score = m.done ? `<span class="gb-fin">${m.hg} - ${m.ag}</span>` : `<span class="gb-slotchip">${GB_ICON[m.slot]} ${GB_SLOTS[m.slot]}</span>`;
  return `<div class="gb-match${m.done ? " done" : ""}">
    <div class="gb-mh"><span class="gb-teams"><b>${esc(m.h)}</b>${gbHeat(m.mh)} <i>v</i> <b>${esc(m.a)}</b>${gbHeat(m.ma)}</span>${score}</div>
    <div class="gb-sub2">${m.hpos ? "#" + m.hpos + " v #" + m.apos : ""}${m.rivalry ? " &middot; " + esc(m.rivalry) : ""}${m.marquee && !m.rivalry ? " &middot; big one" : ""}</div>
    <div class="gb-row3">${gbBtn(m, "1x2", "H", "1", o.home, lock)}${gbBtn(m, "1x2", "D", "X", o.draw, lock)}${gbBtn(m, "1x2", "A", "2", o.away, lock)}</div>
    <div class="gb-row4">${gbBtn(m, "ou", "O", "Over 2.5", o.over, lock)}${gbBtn(m, "ou", "U", "Under 2.5", o.under, lock)}${gbBtn(m, "btts", "Y", "Both score", o.yes, lock)}${gbBtn(m, "btts", "N", "Not both", o.no, lock)}</div>
    ${lock ? "" : `<button class="gb-one" data-gbone="${esc(m.id)}">Sim this game</button><button class="gb-more" data-gbmore="${esc(m.id)}">${GBU.open === m.id ? "Hide" : "More markets and scorers"}</button>`}${GBU.open === m.id && GBU.props[m.id] ? gbPropsHtml(m, GBU.props[m.id]) : ""}</div>`;
}
function gbSlipHtml() {
  const legs = GBU.slip; if (!legs.length) return "";
  if (!GBU.slipOpen) return `<button class="gb-slipbar" id="gb-slipopen"><span>Bet slip &middot; ${legs.length} pick${legs.length > 1 ? "s" : ""}</span><b>${gbOdds(gbCombo(legs))} &rarr;</b></button>`;
  const comb = gbCombo(legs), free = !!GBU.free && (GB.run.bonus || 0) > 0;
  const st = Math.max(0, +GBU.stake || 0), win = gbPayout(st, comb, free), many = legs.length > 1;
  const rows = legs.map((l, i) => `<div class="gb-leg"><span><b>${esc(gbLegLabel(l))}</b><i>${esc(l.h)} v ${esc(l.a)}</i></span><span>${gbOdds(l.odds)} <button class="mini" data-gbx="${i}">x</button></span></div>`).join("");
  return `<div class="gb-slip"><div class="gb-sliph"><b>Bet slip &middot; ${legs.length}</b><span><button class="mini" id="gb-clear">Clear</button> <button class="mini" id="gb-slipclose">Close</button></span></div><div class="gb-legs">${rows}</div>
    ${many ? `<div class="gb-sub2">${new Set(legs.map((l) => l.id)).size < legs.length ? "Same-game legs pay x0.85 each. " : ""}Parlay odds <b>${gbOdds(comb)}</b></div>` : ""}
    ${(GB.run.bonus || 0) > 0 ? `<label class="check"><input type="checkbox" id="gb-free" ${free ? "checked" : ""}> Use bonus bets (${gbMoney(GB.run.bonus)} left, stake not returned)</label>` : ""}
    <div class="gb-stake"><span>Stake $</span><input id="gb-stake" type="number" min="1" value="${esc(GBU.stake)}">${[10, 25, 50, 100].map((v) => `<button class="mini" data-gbs="${v}">${v}</button>`).join("")}<button class="mini" data-gbs="all">All in</button></div>
    <div class="gb-sub2">To win ${many ? "(parlay) " : ""}<b id="gb-win" data-c="${comb}">${gbMoney(win)}</b>${many ? "" : " &middot; pays " + gbMoney(win - st) + " profit"}</div>
    <div class="gb-place"><button class="pri" id="gb-place">${many ? "Place parlay" : "Place bet"}</button>${many ? `<button id="gb-singles">Place ${legs.length} singles</button>` : ""}</div></div>`;
}
// which slots have some games played and some not: bets with a leg still waiting in one of those cannot be cashed out yet
function gbSlotsInProgress() {
  const st = [[0, 0], [0, 0], [0, 0]];
  for (const lg of GBU.slate.leagues) for (const m of lg.rows) st[m.slot][m.done ? 0 : 1]++;
  return st.map(([d, u]) => d > 0 && u > 0);
}
function gbCashQuote(b) {
  if (b.kind === "title") { const inprog = gbSlotsInProgress().map((x, i) => x ? i : -1).filter((i) => i >= 0); return { value: Math.round(b.stake * b.odds * (b.p || 0) * 0.9 * 100) / 100, locked: inprog, pend: 1 }; }
  const pend = b.legs.filter((l, i) => !(b.res && b.res[i] && b.res[i].ok === true));
  let pr = 1; for (const l of pend) pr *= l.p || 0.5;
  const locked = [], prog = gbSlotsInProgress();
  for (const l of pend) { const lg = GBU.slate.leagues.find((x) => x.name === l.league), m = lg && lg.rows.find((x) => x.id === l.id); if (m && !m.done && prog[m.slot] && !locked.includes(m.slot)) locked.push(m.slot); }
  let v = b.stake * b.odds * pr * 0.95; if (b.free) v = Math.max(0, v - b.stake);
  return { value: Math.round(v * 100) / 100, locked, pend: pend.length };
}
function gbCashOut(id) {
  const r = GB.run, b = r.bets.find((x) => x.id === id); if (!b || b.status !== "open") return;
  const q = gbCashQuote(b); if (q.locked.length) { GBU.msg = "Locked: " + q.locked.map((i) => GB_SLOTS[i]).join(" and ") + " games are mid-reveal. Finish the slot first."; return gbViewHome(); }
  b.status = "cashed"; b.payout = q.value; r.bankroll = Math.round((r.bankroll + q.value) * 100) / 100; r.best = Math.max(r.best || GB_START, r.bankroll);
  GBU.msg = "Cashed out " + gbMoney(q.value) + " on a " + gbMoney(b.stake) + " stake."; gbStore(); gbViewHome();
}
function gbCashHtml(b) {
  const q = gbCashQuote(b);
  return q.locked.length ? `<button class="gb-cash" disabled>Cash out locked: ${q.locked.map((i) => GB_SLOTS[i]).join(" + ")} mid-reveal</button>` : `<button class="gb-cash" data-gbcash="${b.id}">Cash out ${gbMoney(q.value)}</button>`;
}
async function gbTitlesHtml() {
  const L = GBU.slate.leagues, lg = GBU.tleague && L.some((x) => x.name === GBU.tleague) ? GBU.tleague : (L[0] && L[0].name);
  if (!lg) return `<div class="empty">No league is running right now.</div>`;
  GBU.tleague = lg;
  const key = lg + "|" + L.find((x) => x.name === lg).week + "|" + L.find((x) => x.name === lg).left;
  if (!GBU.tq || GBU.tq.key !== key) GBU.tq = { key, d: await api("/api/gb_title?league=" + enc(lg)) };
  const d = GBU.tq.d, chips = L.map((x) => `<button class="gb-lc${x.name === lg ? " on" : ""}" data-gbtl="${esc(x.name)}">${esc(x.name)}</button>`).join("");
  const rows = d.rows.map((x) => `<div class="gb-trow"><span class="gb-tpos">${x.pos}</span><span class="gb-tclub"><b>${esc(x.club)}</b><i>${x.pts} pts &middot; ${(x.p * 100).toFixed(x.p < 0.1 ? 1 : 0)}%</i></span><button class="gb-o${GBU.tpick === x.club ? " on" : ""}" data-gbtp="${esc(x.club)}" data-od="${x.odds}" data-pp="${x.p}"><b>${gbOdds(gbAdj(x.odds, lg + "|" + x.club))}</b></button></div>`).join("");
  const pick = d.rows.find((x) => x.club === GBU.tpick), st = Math.max(0, Math.floor(+GBU.stake || 0));
  const panel = pick ? `<div class="gb-slip gb-tpanel"><div class="gb-sliph"><b>${esc(pick.club)} to win the ${esc(lg)}</b></div><div class="gb-stake"><span>Stake $</span><input id="gb-stake" type="number" min="1" value="${esc(GBU.stake)}">${[10, 25, 50, 100].map((v) => `<button class="mini" data-gbs="${v}">${v}</button>`).join("")}</div>
    <div class="gb-sub2">To win <b>${gbMoney(gbPayout(st, gbAdj(pick.odds, lg + "|" + pick.club), false))}</b> if they finish top. Odds move all season; cash out between slots.</div><div class="gb-place"><button class="pri" id="gb-tplace">Place title bet</button></div></div>` : "";
  return `<div class="gb-sub2">${d.done ? "Season finished." : d.left + " games left to play. Chances come from playing the rest of the season 300 times."}</div><div class="gb-leagues">${chips}</div><div class="gb-ttable">${rows}</div>${panel}`;
}
function gbTitleBetHtml(b) {
  const fair = b.p > 0 ? gbOdds(0.9 / b.p) : "-";
  const q = b.status === "open" ? gbCashQuote(b) : null;
  return `<div class="gb-bet ${b.status}"><div class="gb-bh"><b>Title: ${esc(b.club)}</b><span class="gb-st">${b.status === "open" ? "Open" : b.status === "won" ? "Won " + gbMoney(b.payout) : b.status === "cashed" ? "Cashed out " + gbMoney(b.payout) : "Lost"}</span></div>
    <div class="gb-sub2">To win the ${esc(b.league)} &middot; stake ${gbMoney(b.stake)} at ${gbOdds(b.odds)} &middot; placed week ${b.week}</div>${b.status === "open" ? `<div class="gb-sub2">Chance now ${(b.p * 100).toFixed(b.p < 0.1 ? 1 : 0)}% (price ${fair})</div>${gbCashHtml(b)}` : ""}</div>`;
}
function gbBetsHtml() {
  const bets = GB.run.bets.slice().reverse();
  if (!bets.length) return `<div class="empty">No bets yet. Go to the slate and pick something.</div>`;
  return bets.map((b) => b.kind === "title" ? gbTitleBetHtml(b) : `<div class="gb-bet ${b.status}"><div class="gb-bh"><b>${b.legs.length > 1 ? b.legs.length + "-leg parlay" : "Single"}</b><span class="gb-st">${b.status === "open" ? "Open" : b.status === "won" ? "Won " + gbMoney(b.payout) : b.status === "refunded" ? "Refunded" : b.status === "cashed" ? "Cashed out " + gbMoney(b.payout) : "Lost"}</span></div>
    ${b.legs.map((l, i) => `<div class="gb-leg"><span><b>${esc(gbLegLabel(l))}</b><i>${esc(l.h)} v ${esc(l.a)}${b.res && b.res[i] && b.res[i].hg != null ? " &middot; " + b.res[i].hg + "-" + b.res[i].ag : ""}${b.res && b.res[i] && b.res[i].note ? " &middot; " + esc(b.res[i].note) : ""}</i></span><span class="${b.res && b.res[i] && b.res[i].ok === true ? "gb-w" : b.res && b.res[i] && b.res[i].ok === false ? "gb-l" : ""}">${gbOdds(l.odds)}</span></div>`).join("")}
    <div class="gb-sub2">${b.free ? "Bonus bet " : "Stake "}${gbMoney(b.stake)} &middot; odds ${gbOdds(b.odds)} &middot; week ${b.week}</div>${b.status === "open" ? gbCashHtml(b) : ""}</div>`).join("");
}
function gbSlotBar() {
  const L = GBU.slate.leagues, cnt = [0, 0, 0], left = [0, 0, 0];
  for (const lg of L) for (const m of lg.rows) { cnt[m.slot]++; if (!m.done) left[m.slot]++; }
  const mine = [0, 0, 0]; for (const b of gbOpenBets()) for (const l of b.legs) { const lg = L.find((x) => x.name === l.league), m = lg && lg.rows.find((r) => r.id === [l.league, l.week, l.h, l.a].join("|")); if (m && !m.done) mine[m.slot]++; }
  return `<div class="gb-slots"><button class="gb-sl${GBU.slot === "all" ? " on" : ""}" data-gbslot="all">All</button>${GB_SLOTS.map((n, i) => `<button class="gb-sl${GBU.slot === i ? " on" : ""}" data-gbslot="${i}">${GB_ICON[i]} ${n}<small>${left[i] ? left[i] + " games" : "played"}${mine[i] ? " &middot; " + mine[i] + " bet" + (mine[i] > 1 ? "s" : "") : ""}</small></button>`).join("")}</div>
    <div class="gb-sim">${GB_SLOTS.map((n, i) => left[i] ? `<button class="mini pri" data-gbsim="${i}">Sim ${n}</button>` : "").join("")}<button class="mini" id="gb-finish">Finish week</button></div>`;
}
// gbViewHome lives in gambler_shell.js (the phone home screen and the app screens)
function gbWire() {
  const q = (s) => document.querySelectorAll(s), on = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
  const redraw = () => gbViewHome();
  q("[data-gblg]").forEach((b) => b.onclick = () => { GBU.league = b.dataset.gblg; redraw(); });
  q("[data-gbslot]").forEach((b) => b.onclick = () => { GBU.slot = b.dataset.gbslot === "all" ? "all" : +b.dataset.gbslot; redraw(); });
  q("[data-gbl]").forEach((b) => b.onclick = () => {
    const lg = GBU.slate.leagues.find((x) => x.name === GBU.league), m = lg && lg.rows.find((x) => x.id === b.dataset.gbl); if (!m) return;
    gbSlipToggle(m, b.dataset.mk, b.dataset.pk, +b.dataset.od, b.dataset.mk === "scr" ? { uid: b.dataset.pk, pname: b.dataset.pn } : null); const y = window.scrollY; redraw().then(() => window.scrollTo(0, y));
  });
  q("[data-gbtl]").forEach((b) => b.onclick = () => { GBU.tleague = b.dataset.gbtl; GBU.tpick = null; redraw(); });
  q("[data-gbtp]").forEach((b) => b.onclick = () => { GBU.tpick = GBU.tpick === b.dataset.gbtp ? null : b.dataset.gbtp; redraw(); });
  on("gb-tplace", gbPlaceTitle);
  q("[data-gbborrow]").forEach((b) => b.onclick = () => gbBorrow(b.dataset.gbborrow, document.getElementById("gb-ln-" + b.dataset.gbborrow).value));
  q("[data-gbrepay]").forEach((b) => b.onclick = () => gbRepay(+b.dataset.gbrepay));
  q("[data-gbbuy]").forEach((b) => b.onclick = () => gbBuyTip(b.dataset.gbbuy));
  q("[data-gbtipbet]").forEach((b) => b.onclick = () => {
    const t = GB.run.tips.find((x) => x.n === +b.dataset.gbtipbet), lg = GBU.slate.leagues.find((x) => x.name === t.league), m = lg && lg.rows.find((x) => x.id === t.id); if (!m) return;
    const o = t.market === "1x2" ? { H: m.odds.home, D: m.odds.draw, A: m.odds.away }[t.pick] : t.market === "ou" ? { O: m.odds.over, U: m.odds.under }[t.pick] : { Y: m.odds.yes, N: m.odds.no }[t.pick];
    if (!GBU.slip.some((l) => l.id === m.id && l.market === t.market && l.pick === t.pick)) gbSlipToggle(m, t.market, t.pick, o, null);
    GBU.league = t.league; location.hash = "#/gambler/slate"; });
  q("[data-gbapp]").forEach((b) => b.onclick = async (e) => { e.preventDefault(); if (b.dataset.gbapp !== (GB.run.app || "bait")) { GB.run.app = b.dataset.gbapp; GBU.slip = []; await gbLoadSlate(); await gbStore(); } if (location.hash !== "#/gambler/slate") location.hash = "#/gambler/slate"; else redraw(); });
  q("[data-gbone]").forEach((b) => b.onclick = () => gbSimGame(b.dataset.gbone));
  q("[data-gbcash]").forEach((b) => b.onclick = () => gbCashOut(+b.dataset.gbcash));
  q("[data-gbmore]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.gbmore; if (GBU.open === id) { GBU.open = null; return redraw(); }
    if (!GBU.props[id]) { try { GBU.props[id] = await api("/api/gb_props?id=" + enc(id)); const pp = GBU.props[id]; for (const k of Object.keys(pp.ht)) pp.ht[k] = gbAdj(pp.ht[k], id); for (const k of ["corners", "cards"]) { pp[k].over = gbAdj(pp[k].over, id); pp[k].under = gbAdj(pp[k].under, id); } for (const sd of ["H", "A"]) for (const x of pp.scorers[sd]) x.odds = gbAdj(x.odds, id); } catch (e) { toast(e.message); return; } }
    GBU.open = id; redraw();
  });
  q("[data-gbx]").forEach((b) => b.onclick = () => { GBU.slip.splice(+b.dataset.gbx, 1); redraw(); });
  q("[data-gbs]").forEach((b) => b.onclick = () => { GBU.stake = b.dataset.gbs === "all" ? Math.floor(GB.run.bankroll) : +b.dataset.gbs; redraw(); });
  const si = document.getElementById("gb-stake"); if (si) si.oninput = () => { GBU.stake = Math.max(0, Math.floor(+si.value || 0)); const w = document.getElementById("gb-win"); if (w) w.textContent = gbMoney(gbPayout(GBU.stake, +w.dataset.c, !!GBU.free && (GB.run.bonus || 0) > 0)); };
  const fr = document.getElementById("gb-free"); if (fr) fr.onchange = () => { GBU.free = fr.checked; redraw(); };
  q("[data-gbperk]").forEach((b) => b.onclick = async () => { gbGivePerk(GB.run, b.dataset.gbperk); GBU.msg = "Perk taken: " + GB_PERKS[b.dataset.gbperk].name + "."; await gbLoadSlate(); await gbPersist(); redraw(); });
  on("gb-clear", () => { GBU.slip = []; GBU.slipOpen = false; redraw(); });
  on("gb-slipopen", () => { GBU.slipOpen = true; redraw(); }); on("gb-slipclose", () => { GBU.slipOpen = false; redraw(); });
  on("gb-place", () => gbPlace(false)); on("gb-singles", () => gbPlace(true));
  q("[data-gbsim]").forEach((b) => b.onclick = () => gbSimSlot(+b.dataset.gbsim));
  on("gb-save", () => saveDialog()); on("gb-leave", () => { GBU.slate = null; GBU.slip = []; location.hash = "#/start"; route(); });
  on("gb-finish", gbFinishWeek); on("gb-newrun", gbRestart); on("gb-next", gbNextSeason);
}
function gbPlace(singles) {
  const r = GB.run, legs = GBU.slip, st = Math.floor(+GBU.stake || 0);
  const total = singles ? st * legs.length : st, free = !!GBU.free && (r.bonus || 0) > 0;
  if (!legs.length) return;
  if (st < 1) { GBU.msg = "Pick a stake of at least $1."; return gbViewHome(); }
  if (st > gbMaxStake()) { GBU.msg = gbApp().name + " caps stakes at " + gbMoney(gbMaxStake()) + (gbLimited() ? " (you are limited)." : "."); return gbViewHome(); }
  if (total > (free ? r.bonus : r.bankroll)) { GBU.msg = "You only have " + gbMoney(free ? r.bonus : r.bankroll) + (free ? " in bonus bets." : "."); return gbViewHome(); }
  const mk = (ls) => ({ id: r.nid++, week: r.week, stake: st, free, legs: ls.map((l) => Object.assign({}, l)), odds: gbCombo(ls), status: "open", payout: 0, app: r.app || "bait" });
  const made = singles ? legs.map((l) => mk([l])) : [mk(legs)];
  for (const b of made) r.bets.push(b);
  if (free) { r.bonus = Math.round((r.bonus - total) * 100) / 100; if (r.bonus <= 0) GBU.free = false; } else r.bankroll = Math.round((r.bankroll - total) * 100) / 100; GBU.slip = []; GBU.msg = made.length > 1 ? made.length + " singles placed." : "Bet placed.";
  gbStore(); gbViewHome();
}
// settle every open bet against the games now played; pays out winners
function gbPlaceTitle() {
  const r = GB.run, d = GBU.tq && GBU.tq.d, row = d && d.rows.find((x) => x.club === GBU.tpick), st = Math.floor(+GBU.stake || 0);
  if (!row) return;
  if (st < 1) { GBU.msg = "Pick a stake of at least $1."; return gbViewHome(); }
  if (st > gbMaxStake()) { GBU.msg = gbApp().name + " caps stakes at " + gbMoney(gbMaxStake()) + "."; return gbViewHome(); }
  if (st > r.bankroll) { GBU.msg = "You only have " + gbMoney(r.bankroll) + "."; return gbViewHome(); }
  r.bets.push({ id: r.nid++, kind: "title", week: r.week, league: GBU.tleague, club: row.club, stake: st, odds: gbAdj(row.odds, GBU.tleague + "|" + row.club), app: r.app || "bait", p: row.p, status: "open", payout: 0, legs: [] });
  r.bankroll = Math.round((r.bankroll - st) * 100) / 100; GBU.tpick = null; GBU.msg = "Title bet placed on " + row.club + "."; gbStore(); location.hash = "#/gambler/titles"; gbViewHome();
}
// title bets: settle when a league is finished, otherwise just refresh each one's chance
async function gbSettleTitles() {
  const r = GB.run, open = gbOpenTitles(); if (!open.length) return { won: 0, lost: 0, paid: 0 };
  const res = await api("/api/gb_titles", { bets: open.map((b) => ({ id: b.id, league: b.league, club: b.club })) });
  let won = 0, lost = 0, paid = 0;
  for (const x of res.bets) {
    const b = r.bets.find((y) => y.id === x.id); b.p = x.p;
    if (x.status === "won") { b.status = "won"; b.payout = gbPayout(b.stake, b.odds, false); r.bankroll = Math.round((r.bankroll + b.payout) * 100) / 100; won++; paid += b.payout; }
    else if (x.status === "lost" || x.status === "void") { b.status = x.status === "void" ? "lost" : "lost"; lost++; }
  }
  return { won, lost, paid };
}
async function gbSettleAll() {
  const r = GB.run, open = gbOpenBets(); if (!open.length) { const t0 = await gbSettleTitles(); await gbResolveTips(); return t0; }
  const res = await api("/api/gb_settle", { bets: open.map((b) => ({ id: b.id, stake: b.stake, legs: b.legs })) });
  let won = 0, lost = 0, paid = 0;
  for (const x of res.bets) {
    const b = r.bets.find((y) => y.id === x.id); b.res = x.legs;
    if (x.status === "open") continue;
    if (x.status === "lost" && b.legs.length >= 3 && gbPerkUses("insure") > 0) {         // Parlay Insurance waits until every leg is known
      if (x.legs.some((l) => l.ok === null)) continue;
      if (x.legs.filter((l) => l.ok === false).length === 1) {
        const ins = r.perks.find((p) => p.id === "insure" && p.uses > 0); ins.uses--;
        b.status = "refunded"; b.payout = b.stake; r.bankroll = Math.round((r.bankroll + (b.free ? 0 : b.stake)) * 100) / 100; if (b.free) r.bonus = (r.bonus || 0) + b.stake; GBU.note = "Parlay Insurance paid out."; continue;
      }
    }
    b.status = x.status;
    if (x.status === "won") { b.payout = gbPayout(b.stake, b.odds, b.free); if ((b.app || "bait") === "offshore" && gbH([r.seed, b.id, "review"].join("|")) < 1 / 6) { b.payout = Math.round(b.payout * 0.6 * 100) / 100; GBU.note = "Isla Verde put a win under review and paid 60%."; } gbSusWin(b, b.payout - b.stake); r.bankroll = Math.round((r.bankroll + b.payout) * 100) / 100; won++; paid += b.payout; } else lost++;
  }
  const t = await gbSettleTitles(); won += t.won; lost += t.lost; paid += t.paid; await gbResolveTips();
  r.best = Math.max(r.best || GB_START, r.bankroll);
  return { won, lost, paid };
}
const gbSummary = (s, n) => (s.won + s.lost ? `${n}: ${s.won} bet${s.won === 1 ? "" : "s"} won, ${s.lost} lost${s.paid ? ", paid " + gbMoney(s.paid) : ""}.` : `${n}: played.`);
// the league round(s) finished: play out anything else on the calendar this week, then do the weekly bookkeeping
async function gbWeekRolled(wasWk, s, label) {
  await busy("On to next week...", () => api("/api/gb_finish", { wk: wasWk }));
  await refreshStatus(); await gbLoadSlate(); GB.run.week = GBU.slate.wk || GB.run.week + 1; GBU.slip = [];
  const lines = [gbSummary(s, label)].concat(gbAfterWeek(GB.run));
  if (!GBU.slate.leaguesLeft && GB.run.strikes < GB_MAX_STRIKES) { await gbRollSeason(); lines.push("New league season."); }
  GBU.msg = lines.join("<br>");
}
// after any games were played: settle, and notice if that was the last game of the week
async function gbAfterPlay(wasWk, label) {
  const s = await gbSettleAll(); await gbLoadSlate();
  if (GBU.slate.wk !== wasWk) await gbWeekRolled(wasWk, s, label); else GBU.msg = gbSummary(s, label);
  await gbPersist(); await gbViewHome();
}
async function gbSimSlot(i) {
  const wasWk = GBU.slate.wk;
  await busy(`Playing ${GB_SLOTS[i]} games...`, async () => { await api("/api/gb_slot", { slot: i }); });
  await gbAfterPlay(wasWk, GB_SLOTS[i]);
}
async function gbSimGame(id) {
  const wasWk = GBU.slate.wk; let r;
  try { r = await api("/api/gb_play", { id }); } catch (e) { toast(e.message); return; }
  await gbAfterPlay(wasWk, id.split("|")[2] + " " + r.hg + "-" + r.ag + " " + id.split("|")[3]);
}
async function gbFinishWeek() {
  const wasWk = GBU.slate.wk;
  await busy("Playing out the week...", async () => { await api("/api/gb_slot", { slot: "all" }); });
  const s = await gbSettleAll();
  await gbWeekRolled(wasWk, s, "Week " + wasWk);
  await gbPersist(); await gbViewHome();
}
// bills and quota: called after every finished week
function gbAfterWeek(r) {
  const out = []; r.wkDelta = Math.round((r.bankroll - (r.wkMark == null ? GB_START : r.wkMark)) * 100) / 100; r.wkMark = r.bankroll; r.lw++; gbSusDecay(r); r.t = (r.t || 0) + 1;
  const sp = gbPerkCount("sponsor"); if (sp) { r.bankroll = Math.round((r.bankroll + 40 * sp) * 100) / 100; out.push("Sponsorship: +" + gbMoney(40 * sp) + "."); }
  if (r.lw % GB_BILL_EVERY === 0) {
    const due = gbBill(r) + r.owed;
    if (r.bankroll >= due) { r.bankroll = Math.round((r.bankroll - due) * 100) / 100; r.owed = 0; out.push("Bill paid: " + gbMoney(due) + " (rent, probably)."); }
    else { r.owed = Math.round(due * (1 + GB_LATE)); gbStrike(r, out, "Couldn't cover the " + gbMoney(due) + " bill. Late fee added: it is now " + gbMoney(r.owed) + "."); }
  }
  gbCollect(r, out);
  if (r.lw >= GB_LEVEL) {
    r.lw = 0;
    if (gbNet(r) >= r.quota) { r.level++; r.quota = gbQuotaFor(r.level); out.push("<b>Quota hit.</b> Level " + r.level + " starts now: quota " + gbMoney(r.quota) + "."); r.offer = gbOfferFor(r); }
    else { gbStrike(r, out, "<b>Quota missed</b> (" + gbMoney(r.quota) + ")."); if (r.strikes < GB_MAX_STRIKES) out.push("Same quota, one more try."); }
  }
  r.best = Math.max(r.best || GB_START, r.bankroll);
  return out;
}
async function gbRollSeason() {
  GB.allow = true;
  try { await busy("Wrapping up the season...", async () => { await api("/api/sim", { scope: "world", to_end: true }); await api("/api/rollover", {}); await api("/api/flow", { step: "done" }); }); } finally { GB.allow = false; }
  GB.run.seasons++; await refreshStatus(); await gbLoadSlate(); GBU.slip = [];
}
async function gbNextSeason() { await gbRollSeason(); GBU.msg = "New league season."; await gbPersist(); await gbViewHome(); }
function gbMenuHtml() {
  const r = GB.run;
  return `<div class="card"><h3>Run</h3><div class="meta">Level ${r.level} &middot; ${r.t || 0} weeks played &middot; ${r.perks.length} perks &middot; ${r.bets.length} bets</div>
    <p><button class="wide" id="gb-save">Save this run</button></p><p><button class="wide" id="gb-leave">Leave to the start screen</button></p></div>
    <div class="card"><h3>How it works</h3><div class="meta">Bet on the slate. Every 4 weeks a bill is due. Every 8 weeks you need the quota, counted after debt. Miss it and you take a strike; three strikes ends the run. Clear it for a perk and a harder quota. Leagues and Players are for scouting: you cannot sim from there.</div></div>`;
}
async function gbRestart() { gbSetMode("gambler"); GB.run = null; GBU.slate = null; GBU.slip = []; location.hash = "#/start"; await route(); }
