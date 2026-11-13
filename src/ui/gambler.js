// BAIT Bets (v17): the gambler mode. Milestone 0: the Sim / Gambler switch, gambler saves kept apart from sim saves,
// and an empty phone home screen. Gambler state lives in its own record (never inside the world save).
const GB_START = 1000;                              // starting bankroll, dollars
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
function gbNewRecord(name, seed) { return { name, seed: +seed || 1, bankroll: GB_START, week: 1, created: Date.now(), v: 1 }; }
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
    <div class="meta">Play money only. You start with <b>${gbMoney(GB_START)}</b> and a quota to hit by the end of the season. The sim runs underneath; you just bet on it.</div>
    <div class="field"><label for="gb-seed">Seed<span class="meta" style="display:block">same seed, same world</span></label><span class="seedrow"><input type="number" id="gb-seed" value="1" min="1"><button id="gb-seed-rnd">Random</button></span></div>
    <button class="pri wide" id="gb-go">Start a run</button></div>`;
}
function gbWireStart() {
  document.querySelectorAll("[data-gbmode]").forEach((b) => b.onclick = async () => { gbSetMode(b.dataset.gbmode); await viewStart(); });
}
function gbWireNew() {
  const rnd = document.getElementById("gb-seed-rnd"); if (rnd) rnd.onclick = () => (document.getElementById("gb-seed").value = 1 + Math.floor(Math.random() * 99999));
  const go = document.getElementById("gb-go"); if (!go) return;
  go.onclick = async () => {
    const seed = document.getElementById("gb-seed").value;
    GB.run = gbNewRecord("gb_autosave", seed);             // set first: the engine's autosave after "new" must land under a gb_ name
    const ok = await busy("Building the world (about 2 seconds)...", () => api("/api/new", { seed, rules: {} }));
    if (!ok) { GB.run = null; return; }
    await gbStore();
    location.hash = "#/gambler"; await refreshStatus(); await route();
  };
}
// the phone home screen (empty for now: the slate, slip, bank and the rest arrive in the next milestones)
async function gbViewHome() {
  const r = GB.run;
  if (!r) { location.hash = "#/world"; return; }
  gbSetMode("gambler");
  const h = (STATUS && STATUS.header) || {};
  $("#view").innerHTML = `<div class="gb-home">
    <div class="gb-top"><div class="gb-brand">BAIT <span>Bets</span></div><div class="gb-sub">Bet Anything, It's Totally fine</div></div>
    <div class="gb-bank"><div class="gb-lbl">Bankroll</div><div class="gb-amt">${gbMoney(r.bankroll)}</div><div class="gb-lbl">Week ${r.week}${h.season_label ? " &middot; " + esc(h.season_label) : ""}</div></div>
    <div class="card"><h3>This week</h3><div class="empty">The betting slate opens in the next update. Your run is saved and the sim is running underneath.</div></div>
    <div class="gb-note">Play money only. No real gambling.</div></div>`;
}
