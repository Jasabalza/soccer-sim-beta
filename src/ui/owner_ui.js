"use strict";
/* Owner Mode screens (beta). Plain JS; uses api(), esc(), money(), busy(), toast(), openModal() from app.js. Route: #/owner/<tab> */
const OWT = { tab: "hub", mq: { q: "", pos: "", grads: false, expiring: false, free: false, sort: "ovr" }, sq: "all", ST: null };
const owM = (x) => money(x);
const owBar = (v, label, hint) => `<div class="owm"><div class="owm-t"><span>${label}</span><b>${Math.round(v)}</b></div><div class="owm-b"><i style="width:${Math.max(2, Math.min(100, v))}%;background:${v < 30 ? "#e05a4f" : v < 50 ? "#e0b44f" : "#4fbf7a"}"></i></div>${hint ? `<div class="dim small">${hint}</div>` : ""}</div>`;
async function owPost(path, body, ok) {
  try { const r = await api(path, body || {}); if (ok) toast(ok, true); return r; } catch (e) { toast(e.message); return null; }
}
async function viewOwner(tab) {
  const st = await api("/api/ow_state"); OWT.ST = st;
  if (!st.active) { location.hash = "#/"; return; }
  if (st.state === "ended") return owEnded(st);
  if (st.state === "start" || st.state === "between") return await owBuy(st);
  const tabs = [["hub", "Hub"], ["sched", "Schedule"], ["window", "Window"], ["squad", "Squad"], ["staff", "Staff"], ["money", "Money"], ["board", "Board"]];
  if (st.apex && st.apex.on && st.apex.state !== "pre") tabs.splice(5, 0, ["apex", "Apex"]);
  OWT.tab = tabs.some((t) => t[0] === tab) ? tab : OWT.tab || "hub";
  const sched0 = OWT.tab === "hub" && st.state !== "ended" ? await api("/api/ow_schedule").catch(() => null) : null;
  if (sched0 && sched0.last) { const l = sched0.last; try { const r = await api(`/api/match_scorers?comp=${enc(l.cid)}&home=${enc(l.h)}&away=${enc(l.a)}`); sched0.lastScorers = (r.games || []).find((x) => x.hg === l.hg && x.ag === l.ag && x.h === l.h && (x.label === l.label || (/^Matchweek/.test(x.label) && l.kind === "league"))) || null; } catch (e) { /* no scorers */ } }
  const body = OWT.tab === "hub" ? owHub(st, sched0) : OWT.tab === "sched" ? await owSched(st) : OWT.tab === "window" ? await owWindow(st) : OWT.tab === "squad" ? await owSquad(st) : OWT.tab === "staff" ? await owStaff(st) : OWT.tab === "money" ? await owMoney(st) : OWT.tab === "apex" ? await owApex(st) : owBoard(st);
  $("#view").innerHTML = `<div class="v2 ow"><div class="dim small">${esc(st.name)} &middot; ${esc(st.back)} &middot; age ${st.age} &middot; ${st.mode === "sandbox" ? "Sandbox" : "Classic"}</div>
    <h1>${esc(st.club.name)}</h1>
    <div class="owtop"><div><span class="dim small">Your money</span><b>${owM(st.wealth)}</b></div><div><span class="dim small">Club cash</span><b>${owM(st.club.cash)}</b></div><div><span class="dim small">Debt</span><b>${st.club.debt ? owM(st.club.debt) : "none"}</b></div></div>
    <div class="owgame"><button class="mini" id="ow-save">Save game</button><button class="mini" id="ow-start">Start screen</button></div>
    <nav class="tabs2 lgtabs">${tabs.map(([k, t]) => `<a href="#/owner/${k}" class="${OWT.tab === k ? "on" : ""}">${t}${(k === "window" && (st.window || st.reneg)) || (k === "apex" && st.apex.offer && !st.apex.offer.choice) ? " &bull;" : ""}</a>`).join("")}</nav>${body}</div>`;
  owWire(st);
  if (OWT.tab === "sched") { try { wireBrackets($("#view")); } catch (e) { /* no bracket on this tab */ } }
}
// ---- start (new owner world) ----
function owStartCard() {
  return `<div class="card"><h3>Owner mode <small>beta</small></h3><div class="dim small" style="margin-bottom:8px">You are the owner. Buy or inherit a club, hire the right people, run the transfer window, answer to the board. Your career ends when you die, go broke or retire.</div>
    <div class="field"><label>Name</label><input id="ow-name" value="The Owner" maxlength="30" style="width:170px"></div>
    <div class="field"><label>Seed</label><input type="number" id="ow-seed" value="1" min="1" style="width:90px"></div>
    <div class="field"><label>Form</label><label class="check"><input type="checkbox" id="ow-form" checked> Hot and cold runs (small nudge)</label></div>
    <div class="field"><label>Apex</label><label class="check"><input type="checkbox" id="ow-apex"> Apex League: a breakaway league of the biggest clubs (beta, set when the world is made)</label></div>
    <div class="field"><label>Mode</label><select id="ow-mode"><option value="classic">Classic (injections capped)</option><option value="sandbox">Sandbox (no caps)</option></select></div>
    <div class="ow-back" id="ow-back">${[["selfmade", "Self-made", 32, "700M", "Little money, lots of time"], ["trust", "Trust fund", 35, "1.2B", "A family club, handed down"], ["founder", "Founder", 42, "2B", "A big exit and a big ego"], ["fan", "Local fan", 48, "500M", "Save the club you grew up with"], ["veteran", "Veteran", 62, "4B", "Rich, with little time left"]]
      .map(([k, t, a, m, d], i) => `<label class="owb"><input type="radio" name="owb" value="${k}" ${i === 0 ? "checked" : ""}><span><b>${t}</b> &middot; age ${a} &middot; ${m}<br><span class="dim small">${d}</span></span></label>`).join("")}</div>
    <button class="pri wide" id="ow-go">Start owner run</button></div>`;
}
function owWireStart() {
  const go = $("#ow-go"); if (!go) return;
  go.onclick = async () => {
    const back = document.querySelector("input[name=owb]:checked").value;
    const ok = await busy("Building the world (about 2 seconds)...", () => api("/api/ow_new", { seed: $("#ow-seed").value, backstory: back, name: $("#ow-name").value, mode: $("#ow-mode").value, form: $("#ow-form") && $("#ow-form").checked ? "1" : "", apex: $("#ow-apex") && $("#ow-apex").checked ? "1" : "" }));
    if (ok) { PICK_ASKED = false; await refreshStatus(); location.hash = "#/owner"; await route(); }
  };
}
async function owBuy(st) {
  const d = await api("/api/ow_clubs"), inh = st.back === "Trust fund" && st.clubs.length === 0;
  const F = OWT.bf || (OWT.bf = { q: "", lg: "", sort: "best", open: true }), ord = { open: 0, rep: 1, money: 2, member: 3 };
  const leagues = [...new Set(d.rows.map((r) => r.league))].sort();
  let rows = d.rows.filter((r) => (inh ? r.stature >= 40 && r.stature <= 80 && !r.member : true));
  if (F.q) rows = rows.filter((r) => r.club.toLowerCase().includes(F.q.toLowerCase()));
  if (F.lg) rows = rows.filter((r) => r.league === F.lg);
  if (F.open && !inh) rows = rows.filter((r) => r.status === "open");
  rows.sort(F.sort === "price" ? (x, y) => y.price - x.price : F.sort === "cheap" ? (x, y) => x.price - y.price : F.sort === "name" ? (x, y) => (x.club < y.club ? -1 : 1) : F.sort === "league" ? (x, y) => (x.league < y.league ? -1 : x.league > y.league ? 1 : y.stature - x.stature) : (x, y) => ord[x.status] - ord[y.status] || y.stature - x.stature);
  const tag = (r) => r.member ? `<span class="dim small">member-owned</span>` : r.status === "rep" ? `<span class="dim small">needs reputation ${r.need_rep}</span>` : r.status === "money" ? `<span class="dim small">too expensive</span>` : `<button class="pri mini" data-buy="${esc(r.club)}">${inh ? "Take over" : "Buy"}</button>`;
  $("#view").innerHTML = `<div class="v2 ow"><h1>${st.state === "between" ? "Buy another club" : inh ? "Your family club" : "Buy a club"}</h1>
    <div class="owtop"><div><span class="dim small">Your money</span><b>${owM(st.wealth)}</b></div><div><span class="dim small">Reputation</span><b>${st.rep}</b></div><div><span class="dim small">Age</span><b>${st.age}</b></div></div>
    <div class="dim small" style="margin:8px 0">${inh ? "Pick the club your family has held. You get it without paying." : "You must keep 15% of your money in reserve. Bigger clubs need a bigger reputation. Member-owned clubs are not for sale."}</div>
    <div class="owf"><input id="bf-q" placeholder="Search club" value="${esc(F.q)}"><select id="bf-lg"><option value="">All leagues</option>${leagues.map((l) => `<option ${F.lg === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><select id="bf-sort">${[["best", "Biggest first"], ["price", "Price: high"], ["cheap", "Price: low"], ["league", "By league"], ["name", "A to Z"]].map(([k, t]) => `<option value="${k}" ${F.sort === k ? "selected" : ""}>${t}</option>`).join("")}</select>${inh ? "" : `<label class="check"><input type="checkbox" id="bf-open" ${F.open ? "checked" : ""}> Can buy now</label>`}</div><div class="dim small">${rows.length} clubs</div>
    <div class="card">${rows.map((r) => `<div class="row"><span class="rl"><span class="rt"><b>${esc(r.club)}</b><div class="meta">${esc(r.league)} &middot; income ${owM(r.income)}${r.debt ? " &middot; debt " + owM(r.debt) : ""}</div></span></span><span class="prow"><b>${inh ? "free" : owM(r.price)}</b> ${tag(r)}</span></div>`).join("")}</div></div>`;
  const bf = (id, k, ev, f) => { const e = $(id); if (e) e[ev] = () => { OWT.bf[k] = f ? e.checked : e.value; owBuy(st); }; };
  bf("#bf-q", "q", "onchange"); bf("#bf-lg", "lg", "onchange"); bf("#bf-sort", "sort", "onchange"); bf("#bf-open", "open", "onchange", true);
  document.querySelectorAll("[data-buy]").forEach((b) => (b.onclick = async () => { if (await owPost("/api/ow_buy", { club: b.dataset.buy }, "Done.")) { await refreshStatus(); location.hash = "#/owner/hub"; await route(); } }));
}
function owEnded(st) {
  const e = st.ended;
  $("#view").innerHTML = `<div class="v2 ow"><h1>${e.why === "death" ? "Your story ends" : "You retire"}</h1><div class="dim small">Age ${e.age} &middot; ${e.years} seasons as an owner</div>
    <div class="card"><div class="row"><span>Net worth</span><b>${owM(e.wealth)}</b></div><div class="row"><span>Started with</span><span>${owM(e.start_wealth)}</span></div><div class="row"><span>Peak</span><span>${owM(e.peak)}</span></div>
    <div class="row"><span>Put into clubs</span><span>${owM(e.injected)}</span></div><div class="row"><span>Taken out as dividends</span><span>${owM(e.dividends)}</span></div><div class="row"><span>Titles</span><span>${e.titles}</span></div><div class="row"><span>Clubs owned</span><span>${e.clubs}</span></div><div class="row"><span>Bankruptcies</span><span>${e.bankrupt}</span></div><div class="row"><span>Reputation</span><span>${e.rep}</span></div></div>
    <div class="card"><h3>Your clubs</h3>${st.clubs.map((c) => `<div class="row"><span>${clubLink(c.club)}</span><span class="dim small">${c.from}-${c.to || "now"} &middot; ${esc(c.how)}${c.how2 ? ", " + esc(c.how2) : ""}</span></div>`).join("")}</div>
    <button class="pri wide" onclick="location.hash='#/'">New run</button></div>`;
}
// ---- schedule: your games in the league and in every other competition your club is in ----
OWT.sc = "";
const owGoals = (arr) => (arr.length ? arr.map((x) => esc(x.name) + " " + x.min + "'").join("<br>") : '<span class="dim small">-</span>');
const owEmb = (c, size) => { try { return compEmb(c.title, c.emblem, size || 16); } catch (e) { return ""; } };
const owTeam = (n, me, size) => `<span class="owt">${crest(n, size || 18)}<span>${n === me ? "<b>" + esc(n) + "</b>" : esc(n)}</span></span>`;
const owTeams = (g, me) => (g.h ? `${owTeam(g.h, me)}<span class="dim small"> v </span>${owTeam(g.a, me)}` : `<span>${esc(g.label)}</span>`);
const owScore = (g, me, ext) => {
  const mine = g.h === me ? g.hg - g.ag : g.ag - g.hg, cls = g.winner ? (g.winner === me ? "w" : "l") : mine > 0 ? "w" : mine < 0 ? "l" : "d";
  const x = g.winner ? `<span class="small owagg" style="color:${g.winner === me ? "#4fbf7a" : "#e05a4f"}">${g.winner === me ? "You go through" : esc(g.winner) + " go through"}${g.agg ? ", " + g.agg[0] + "-" + g.agg[1] + " on aggregate" : ""}${g.how ? " (" + esc(g.how) + ")" : ""}</span>` : "";
  return `<b class="owres ${cls}">${g.hg}-${g.ag}</b>${ext === false ? "" : x}`;
};
// one game of the owner's club: date, competition, both teams with crests, and either the score or home/away
function owGameRow(g, me, emb, showComp) {
  const side = g.played ? `<span class="owsd">${owScore(g, me)}</span>` : g.tentative && !g.h ? '<span class="dim small">if still in</span>' : `<span class="dim small">${g.neutral ? "neutral" : g.h === me ? "home" : "away"}</span>`;
  return `<div class="row owg"><span class="rt"><div class="dim small owgh">${esc(g.date ? g.date.text : "")}${showComp ? " &middot; " + (emb || "") + " " + esc(g.comp) : ""}${g.label ? " &middot; " + esc(g.label) : ""}</div>${g.h ? `<div>${owTeam(g.h, me)}</div><div>${owTeam(g.a, me)}</div>` : '<div class="dim small">Opponent not known yet</div>'}</span>${side}</div>`;
}
const OW_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// games grouped under a month heading, like a calendar
function owByMonth(list, me, embOf, showComp) {
  let out = "", cur = "";
  for (const g of list) {
    const iso = g.date && g.date.iso, m = iso ? OW_MONTHS[+iso.slice(5, 7) - 1] + " " + iso.slice(0, 4) : "Date to be set";
    if (m !== cur) { cur = m; out += `<div class="owmon">${m}</div>`; }
    out += owGameRow(g, me, embOf && embOf[g.cid], showComp);
  }
  return out;
}
async function owSched(st) {
  const d = await api("/api/ow_schedule"), me = st.club.name, W = d.cwc;
  const chips = [["ALL", "All"], ...d.comps.map((c) => [c.id, c.title, owEmb(c, 16)]), ...(d.comps.some((c) => c.kind === "cwc") ? [] : [["CWC", "Club World Cup"]])];
  if (!OWT.sc || !chips.some((c) => c[0] === OWT.sc)) OWT.sc = "ALL";
  const embOf = {}; d.comps.forEach((c) => (embOf[c.id] = owEmb(c, 14)));
  let body;
  if (OWT.sc === "ALL") {
    const up = d.all.filter((g) => !g.played), pl = d.all.filter((g) => g.played).reverse();
    body = `<div class="dim small" style="margin-bottom:6px">Every competition in date order. Cup rounds marked <i>if still in</i> only happen if your club keeps winning.</div>
      <h3>Coming up</h3>${owByMonth(up, me, embOf, true) || '<div class="dim small">Nothing left this season.</div>'}
      <details class="owdone" style="margin-top:12px"><summary><b>Played</b> <span class="dim small">${pl.length} game${pl.length === 1 ? "" : "s"}, tap to open</span></summary>${owByMonth(pl, me, embOf, true) || '<div class="dim small">No games played yet.</div>'}</details>`;
  } else if (OWT.sc === "CWC") {
    const f = W, tag = f.status === "qualified" || f.status === "in a qualifying place" ? "#4fbf7a" : f.status === "just outside" ? "#e0b44f" : "#e05a4f";
    body = `<div class="row"><span>Next Club World Cup</span><b>Season ${f.season}${f.this_season ? " (this season)" : ""}</b></div>
      <div class="row"><span>Your status</span><b style="color:${tag}">${esc(f.status)}</b></div>
      <div class="row"><span>${esc(f.confed)} places</span><span>${f.slots}${f.champion ? " &middot; you hold the continental cup" : ""}</span></div>
      <div class="row"><span>Your ranking</span><span>#${f.rank} in ${esc(f.confed)} (score ${f.score})${f.gap > 0 ? ", " + f.gap + " behind the last place" : ""}</span></div>
      <div class="dim small" style="margin:6px 0">${esc(f.cup)} winners go in. The other places go to the best four-season records (league finishes and continental cup runs) in ${esc(f.confed)}.${f.field_set ? "" : " The field is set after the continental cups end."}</div>
      <h3>Who is in the places</h3>${f.top.map((t) => `<div class="row"><span class="owt">${crest(t.club, 18)}<span ${t.club === me ? 'style="font-weight:800"' : ""}>${esc(t.club)}</span></span><span class="dim small">${t.score}${t.in ? " &middot; in" : ""}</span></div>`).join("")}`;
  } else {
    const c = d.comps.find((x) => x.id === OWT.sc), mineAll = d.all.filter((g) => g.cid === c.id);
    if (c.kind === "league") body = `${await owTable(st, true)}<h3 style="margin-top:12px">Next games</h3>${owByMonth(mineAll.filter((g) => !g.played), me) || '<div class="dim small">No games left this season.</div>'}<details class="owdone" style="margin-top:12px"><summary><b>Results</b> <span class="dim small">${mineAll.filter((g) => g.played).length} played, tap to open</span></summary>${owByMonth(mineAll.filter((g) => g.played).reverse(), me) || '<div class="dim small">No games played yet.</div>'}</details>`;
    else if (c.notIn) body = `<div class="row"><span>Your status</span><b style="color:${c.pos && c.pos <= c.slots ? "#4fbf7a" : "#e0b44f"}">${c.pos && c.pos <= c.slots ? "in a qualifying place" : "not in this season's field"}</b></div><div class="dim small" style="margin-top:6px">The top ${c.slots} of ${esc(c.league)} qualify for the ${esc(c.title)}. ${c.pos ? "You are " + c.pos + (["th", "st", "nd", "rd"][(c.pos % 100 > 10 && c.pos % 100 < 14) ? 0 : (c.pos % 10 < 4 ? c.pos % 10 : 0)]) + " this season." : ""}</div>`;
    else {
      const left = mineAll.filter((g) => !g.played);
      const status = c.out ? "Your club is out." : c.winner ? "Finished." : left.length ? "Your club is still in." : "Not started";
      let bracket = "";
      if (c.kind === "cup" || c.kind === "cwc") {
        try {
          const x = await api("/api/comp?id=" + enc(c.id)), gm = await api("/api/games?comp=" + enc(c.id)).catch(() => null);
          const mg = (x.groups || []).find((g) => g.teams.some((r) => r.nation === me));
          if (mg) bracket += `<h3 style="margin-top:12px">Your group</h3><div class="ow-tbl"><div class="ow-tr g5 ow-th"><span>#</span><span class="cl">Club</span><span>P</span><span>GD</span><span>Pts</span></div>${mg.teams.map((r, i) => `<div class="ow-tr g5${r.nation === me ? " me" : ""}"><span>${i + 1}</span><span class="cl">${esc(r.nation)}</span><span>${r.p}</span><span>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</span><b>${r.pts}</b></div>`).join("")}</div><div class="dim small">Top two go through.</div>`;
          if (x.bracket && x.bracket.rounds && x.bracket.rounds.length) bracket += `<h3 style="margin-top:12px">Knockout bracket</h3>` + bracketHTML(liveBracket(x.bracket, gm), false, { cid: c.id, ready: false }).replace(/<a [^>]*>|<\/a>/g, "");
        } catch (e) { /* no bracket yet */ }
      }
      body = `<div class="dim small">${status}${c.progress && c.progress.next ? " Next round: " + esc(c.progress.next) + (c.progress.next_date ? " &middot; " + c.progress.next_date.text : "") : ""}</div>
        ${c.winner ? `<div class="row"><span>Winner</span><b class="owt">${crest(c.winner, 18)}${esc(c.winner)}</b></div>` : ""}
        <h3 style="margin-top:10px">Your games</h3>${mineAll.map((g) => owGameRow(g, me)).join("") || '<div class="dim small">Your club has no games here yet.</div>'}${bracket}`;
    }
  }
  return `<div class="card"><nav class="chips">${chips.map(([id, t, e]) => `<button class="${id === OWT.sc ? "on" : ""}" data-sc="${esc(id)}">${e || ""} ${esc(t)}</button>`).join("")}</nav><div style="margin-top:10px">${body}</div></div>`;
}
// ---- league: table, next games, and the way into every competition page ----
async function owTable(st, inner) {
  const d = await api("/api/league?name=" + enc(st.club.league)), me = st.club.name;
  const links = "";
  const nx = (d.next || []).filter((g) => g.h === me || g.a === me)[0];
  if (inner) return `${links}<div class="ow-tbl"><div class="ow-tr ow-th"><span>#</span><span class="cl">Club</span><span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>Pts</span></div>${d.rows.map((r) => `<div class="ow-tr${r.club === me ? " me" : ""}"><span>${r.pos}</span><span class="cl">${esc(r.club)}</span><span>${r.p}</span><span>${r.w}</span><span>${r.d}</span><span>${r.l}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><b>${r.pts}</b></div>`).join("")}</div>`;
  return `<div class="card"><h3>${esc(st.club.league)} <small>${esc(STATUS.header.season_label || "")}</small></h3>${links}
    ${nx ? `<div class="dim small" style="margin-top:6px">Next game: <b>${esc(nx.h)}</b> v <b>${esc(nx.a)}</b>${d.next_date ? " &middot; " + d.next_date.text : ""}</div>` : ""}
    <div class="ow-tbl"><div class="ow-tr ow-th"><span>#</span><span class="cl">Club</span><span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>Pts</span></div>
    ${d.rows.map((r) => `<div class="ow-tr${r.club === me ? " me" : ""}"><span>${r.pos}</span><span class="cl">${esc(r.club)}</span><span>${r.p}</span><span>${r.w}</span><span>${r.d}</span><span>${r.l}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><b>${r.pts}</b></div>`).join("")}</div>
    <div class="dim small" style="margin-top:6px">Playing games happens on the Hub. Competitions your club is in (cups, continental) are under All competitions.</div></div>`;
}
// ---- roster fit, squad needs, money chart, history ----
const owFit = (f) => f ? `<span class="owfit ${f.role.toLowerCase()}">${f.role}</span>${f.role === "Starter" && f.repl ? ` <span class="dim small">pushes out ${esc(f.repl.name)} (${f.repl.ovr})</span>` : ""}` : "";
function owNeeds(st) {
  const n = st.needs; if (!n) return "";
  const lv = { short: "Short", weak: "Weak", light: "Light", ok: "OK" };
  return `<div class="card"><h3>Squad needs <small>${n.n}/${n.max} &middot; ${n.free} free</small></h3>
    <div class="dim small">${n.under25} players under 25 &middot; first XI averages ${n.avg_xi}. Tap a position to filter the market.</div>
    ${n.pos.map((x) => `<div class="row owneed" data-needpos="${x.pos}"><span><b>${x.pos}</b> <span class="dim small">${x.label}</span></span><span class="owm-b" style="width:70px;display:inline-block"><i style="width:${Math.min(100, Math.round(100 * x.have / x.want))}%;background:${x.level === "ok" ? "#4fbf7a" : x.level === "light" ? "#7dc7a0" : x.level === "weak" ? "#e0b44f" : "#e06a5a"}"></i></span><span class="small">${x.have}/${x.want} &middot; best ${x.best || "-"}</span><span class="owlv ${x.level}">${lv[x.level]}</span></div>`).join("")}
    <div class="dim small" style="margin-top:4px">Short: too few bodies for the XI and bench. Weak: your weakest starter is well below the team. Light: fewer than the ideal 25-man mix.</div></div>`;
}
function owLine(pts, k, col, label) {
  const W = 340, H = 96, P = 6, v = pts.map((x) => x[k]), ok = v.filter((x) => x !== null && x !== undefined);
  if (ok.length < 2) return "";
  const lo = Math.min(...ok), hi = Math.max(...ok), rng = hi - lo || Math.max(1, Math.abs(hi) * 0.1), pad = rng * 0.1;
  const X = (i) => P + (W - 2 * P) * i / (pts.length - 1), Y = (x) => H - P - (H - 2 * P) * (x - (lo - pad)) / (rng + 2 * pad);
  let d = "", on = false; v.forEach((x, i) => { if (x === null || x === undefined) { on = false; return; } d += (on ? "L" : "M") + X(i).toFixed(1) + " " + Y(x).toFixed(1); on = true; });
  const ticks = pts.map((x, i) => (i === 0 || x.s !== pts[i - 1].s ? `<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${P}" y2="${H - P}" stroke="currentColor" opacity=".12"/><text x="${(X(i) + 2).toFixed(1)}" y="${H - 8}" font-size="9" fill="currentColor" opacity=".55">S${x.s}</text>` : "")).join("");
  const last = ok[ok.length - 1], first = ok[0], dl = last - first;
  return `<div class="row" style="border:0;padding-bottom:0"><span><i class="owdot" style="background:${col}"></i><b>${label}</b></span><span class="small">${owM(last)} <b class="${dl >= 0 ? "owup" : "owdn"}">${dl >= 0 ? "+" : "-"}${owM(Math.abs(dl))}</b></span></div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${ticks}<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/></svg><div class="dim small" style="display:flex;justify-content:space-between"><span>low ${owM(lo)}</span><span>high ${owM(hi)}</span></div>`;
}
function owChart(pts) {
  if (!pts || pts.length < 2) return '<div class="dim small">Nothing to chart yet. It fills in as money moves.</div>';
  return owLine(pts, "w", "#4fbf7a", "Your money") + '<div style="height:10px"></div>' + (owLine(pts, "c", "#5aa9ff", "Club cash") || "");
}
const owDelta = (v) => (v ? `<b class="${v > 0 ? "owup" : "owdn"}">${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}</b>` : '<span class="dim">0</span>');
function owHistory(st) {
  const h = st.hist || [], lg = h.filter((x) => x.champ).length, cups = h.reduce((a, x) => a + x.cups.filter((c) => c.res === "Winners").length, 0), fin = h.filter((x) => x.cups.some((c) => c.res === "Runners-up")).length;
  const best = h.filter((x) => x.finish).sort((a, b) => a.finish - b.finish)[0];
  const ord = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || "th");
  return `<div class="card"><h3>Honours <small>${st.name ? esc(st.name) : ""}</small></h3>
    <div class="owhon"><div><b>${lg}</b><span>League titles</span></div><div><b>${cups}</b><span>Cups won</span></div><div><b>${fin}</b><span>Cup finals lost</span></div><div><b>${best ? ord(best.finish) : "-"}</b><span>Best finish</span></div></div>
    ${h.length ? h.slice().reverse().map((x) => `<div class="row"><span><b>S${x.season}</b> <span class="small">${esc(x.club)}</span></span><span class="small">${x.finish ? ord(x.finish) : "-"}${x.champ ? ' <b style="color:#e0b44f">&#9733; Champions</b>' : ""}${x.cups.map((c) => `<br>${c.res === "Winners" ? '<b style="color:#e0b44f">&#9733;</b> ' : ""}${esc(c.name)}: ${c.res}`).join("")}</span></div>`).join("") : '<div class="dim small" style="margin-top:6px">Your first season is not finished yet. Honours and finishes appear here after each season.</div>'}</div>
    ${st.clubs && st.clubs.length ? `<div class="card"><h3>Clubs you have owned</h3>${st.clubs.map((c) => `<div class="row"><span>${esc(c.name || c.club || "")}</span><span class="dim small">S${c.from || ""}${c.to ? " to S" + c.to : " to now"}${c.how2 ? " &middot; " + esc(c.how2) : ""}</span></div>`).join("")}</div>` : ""}`;
}
// ---- hub ----
function owHub(st, sc) {
  const h = STATUS.header, off = !!h.flow, p = st.pressure;
  const staffAlert = st.no_coach ? "You have no coach. Hire one on the Staff tab." : st.coach_expired ? "Your coach's contract has run out. Renew or replace him on the Staff tab." : "";
  const phase = st.reneg ? "Contract talks" : st.window && st.window.open ? "Transfer window" : off ? "Off-season" : "In season";
  let act = "";
  if (st.reneg) act = `<button class="pri wide" data-tab="window">Open contract talks (week ${st.reneg.round} of ${st.reneg.rounds})</button>`;
  else if (st.window && st.window.open) act = `<button class="pri wide" data-tab="window">Open the transfer window (round ${st.window.round} of ${st.window.rounds})</button>`;
  else if (off) act = `<div class="dim small" style="margin-bottom:6px">Awards and graduates are in the usual pages.</div><button class="pri wide" id="ow-next">Start season ${h.season}</button>`;
  else act = `<div class="ow-speed">${["week", "month", "season"].map((k) => `<button class="${st.speed === k ? "on" : ""}" data-speed="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div><button class="pri wide" id="ow-adv">Play ${st.speed === "season" ? "the season" : "a " + st.speed}</button><div class="dim small">${seasonLine(h)}</div>`;
  let nextCard = "";
  if (sc && !st.reneg && !(st.window && st.window.open) && !off) {
    const me = st.club.name, n = sc.next, l = sc.last, cc = (x) => sc.comps.find((c) => c.id === x.cid), em = (x) => { const c = cc(x); return c ? owEmb(c, 14) : ""; };
    nextCard = `<div class="card"><h3>Next game${n ? `<small>${esc(n.date ? n.date.text : "")}</small>` : ""}</h3>${n ? `<div class="dim small">${em(n)} ${esc(n.comp)} &middot; ${esc(n.label || "")}</div><div class="owbig">${n.h ? owTeams(n, me) : "<span>" + esc(n.label) + " <span class='dim small'>(if still in)</span></span>"}</div><div class="dim small">${n.h ? (n.neutral ? "Neutral ground" : n.h === me ? "Home" : "Away") : ""}</div><button class="pri wide" id="ow-game" style="margin-top:8px">Play this game</button>` : '<div class="dim small">No games left this season.</div>'}
      ${l ? `<h3 style="margin-top:14px">Last result</h3><div class="dim small">${em(l)} ${esc(l.comp)} &middot; ${esc(l.label || "")} &middot; ${esc(l.date ? l.date.text : "")}</div><div class="owbig">${owTeam(l.h, me)} ${owScore(l, me, false)} ${owTeam(l.a, me)}</div>${l.winner ? `<div style="margin-top:2px">${owScore({ ...l, hg: "", ag: "" }, me).replace(/<b class="owres[^>]*>[^<]*<\/b>/, "")}</div>` : ""}${sc.lastScorers ? `<div class="scr-c"><div>${owGoals(sc.lastScorers.hs)}</div><div>${owGoals(sc.lastScorers.as)}</div></div>` : ""}` : ""}</div>`;
  }
  const bo = st.buyout ? `<div class="card ow-alert"><h3>Buyout offer</h3>The board offers <b>${owM(st.buyout.offer)}</b> for the club.<div class="owbtns"><button data-bo="accept">Accept</button><button data-bo="counter" ${st.buyout.counter ? "disabled" : ""}>Counter (+15%)</button><button data-bo="refuse">Refuse</button></div><div class="dim small">Refusing makes the next offer worse.</div></div>` : "";
  const apexAlert = st.apex && st.apex.offer && !st.apex.offer.choice ? `<div class="card ow-alert"><h3>Apex League contract</h3>Your club has been offered a place in the Apex League. You must answer before this season ends. <button class="mini" data-tab="apex">Open</button></div>` : "";
  return `${bo}${apexAlert}${nextCard}${staffAlert ? `<div class="card ow-alert">${staffAlert} <button class="mini" data-tab="staff">Open staff</button></div>` : ""}<div class="card"><h3>${phase}<small>Season ${st.season}</small></h3>${act}</div>
    <div class="card"><h3>Pressure <small>${esc(p.ladder_name)}</small></h3>${owBar(p.board, "Board")}${owBar(p.fans, "Fans")}${owBar(p.players, "Players", p.money_only ? "Upset about money, but winning: the board stays neutral." : "")}</div>
    <div class="card"><h3>Coach</h3><div class="row"><span>${esc(st.coach.name)}</span><span class="dim small">prestige ${st.coach.prestige}</span></div><div class="row"><span>Trust in you</span><b>${st.trust}</b></div></div>
    <div class="card"><h3>News</h3>${st.feed.slice(0, 8).map((f) => `<div class="row"><span class="small">${esc(f.t)}</span><span class="dim small">S${f.season}</span></div>`).join("") || '<div class="dim small">Nothing yet.</div>'}</div>
    <div class="card"><button class="btn wide" id="ow-retire">Retire from ownership</button></div>`;
}
// ---- Apex League (stage 1: the countdown, the rumours and the two contracts) ----
async function owApex(st) {
  const A = st.apex, me = st.club.name;
  const log = A.log.length ? `<div class="card"><h3>News</h3>${A.log.map((f) => `<div class="row"><span class="small">${esc(f.t)}</span><span class="dim small">S${f.season}</span></div>`).join("")}</div>` : "";
  const said = { signed: "#4fbf7a", staying: "#e0b44f", "very likely": "#e06a5a", likely: "#e0b44f", possible: "#9aa3a8" };
  const rum = A.rumours ? `<div class="card"><h3>${A.state === "contracts" ? "Who has been approached" : "Rumoured founders"}</h3>${A.rumours.map((r) => `<div class="row"><span class="owt">${crest(r.club, 18)}<span ${r.club === me ? 'style="font-weight:800"' : ""}>${esc(r.club)}</span> <span class="dim small">${esc(r.league)}</span></span><b class="small" style="color:${said[r.said] || "#9aa3a8"}">${esc(r.said)}</b></div>`).join("")}</div>` : "";
  let main = "";
  if (A.state === "rumour") main = `<div class="card"><h3>Apex League <small>${A.seasons_left} season${A.seasons_left === 1 ? "" : "s"} to the first one</small></h3><div class="dim small">Word is out. The world's biggest clubs are planning a breakaway league of up to ${A.max} clubs: every match a giant against a giant. Contracts go out in season ${A.inaugural - 1}. Clubs that sign leave their domestic league.</div></div>`;
  else if (A.state === "contracts") {
    const o = A.offer, S = A.strength;
    main = `<div class="card"><h3>Apex League <small>first season ${A.inaugural}</small></h3><div class="dim small">Contracts are out. The league goes ahead only if the clubs that sign are strong enough: ${S.n} signed, average stature ${S.mean}, needs ${S.need}.${A.delays ? " (delayed " + A.delays + " time" + (A.delays === 1 ? "" : "s") + ")" : ""}</div>
      <div class="owm-b"><i style="width:${Math.min(100, Math.round(100 * S.mean / Math.max(1, S.need)))}%;background:${S.go ? "#4fbf7a" : "#e0b44f"}"></i></div></div>`;
    if (o) main += `<div class="card"><h3>Your decision <small>answer before the season ends</small></h3>
      <div class="row"><span><b>Apex League</b><div class="dim small">${o.years} years. Leave ${esc(o.league)}. Fans take it badly (about -${o.fan_hit} at first, fading if you win). Travel costs and fatigue.</div></span><b style="white-space:nowrap">+${owM(o.apex_pay)}/yr</b></div>
      <div class="row"><span><b>Stay in ${esc(o.league)}</b><div class="dim small">${o.years} years. A guaranteed place and the fans on side. ${esc(o.league)} is ${o.league_rel}% as rich as the richest league, so its offer is ${Math.round(100 * o.dom_pay / o.apex_pay)}% of the Apex money.</div></span><b style="white-space:nowrap">+${owM(o.dom_pay)}/yr</b></div>
      <div class="owbtns"><button class="${o.choice === "apex" ? "pri" : ""}" data-apex="apex">${o.choice === "apex" ? "Chosen: " : ""}Join the Apex League</button><button class="${o.choice === "stay" ? "pri" : ""}" data-apex="stay">${o.choice === "stay" ? "Chosen: " : ""}Stay in ${esc(o.league)}</button></div>
      <div class="dim small" style="margin-top:6px">Either contract locks the club in. Leaving early costs fines and sanctions, depending on relations. You can change your answer until the season ends.</div></div>`;
    else main += `<div class="card"><div class="dim small">Your club has not been approached. Strong seasons and a bigger name bring an invitation.</div></div>`;
    main += `<div class="card"><h3>Signed so far</h3>${A.signed.map((x) => `<div class="row"><span class="owt">${crest(x.club, 18)}${esc(x.club)}</span><span class="dim small">stature ${x.stature}${x.mine ? " &middot; you" : ""}</span></div>`).join("") || '<div class="dim small">Nobody yet.</div>'}</div>`;
  } else if (A.state === "live") {
    let tbl = "";
    try {
      const d = await api("/api/league?name=" + enc("Apex League"));
      tbl = `<div class="ow-tbl"><div class="ow-tr ow-th"><span>#</span><span class="cl">Club</span><span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>Pts</span></div>${d.rows.map((r) => `<div class="ow-tr${r.club === me ? " me" : ""}"><span>${r.pos}</span><span class="cl">${esc(r.club)}</span><span>${r.p}</span><span>${r.w}</span><span>${r.d}</span><span>${r.l}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><b>${r.pts}</b></div>`).join("")}</div>`;
    } catch (e) { tbl = ""; }
    const hcol = A.health >= 60 ? "#4fbf7a" : A.health >= 40 ? "#e0b44f" : "#e06a5a", mi = A.mine, vtxt = { renew: "On track to be renewed", review: "Likely to be put on review", release: "At risk of being let go" };
    const mine = mi ? `<div class="card"><h3>Your contract</h3><div class="row"><span>Years left</span><b>${mi.years}</b></div><div class="row"><span>Pay a year</span><b>${money(mi.pay)}</b></div><div class="row"><span>Apex file score</span><b>${mi.file}</b></div><div class="dim small" style="margin-top:6px">${mi.years <= 1 ? vtxt[mi.verdict] + " when the contract ends." : "The review comes when the contract ends. League finish, stature, squad rating, cup runs and summer games all count."}</div>${mi.years <= 1 ? `<div class="small" style="margin-top:8px">Your stance at the review:</div><div class="owbtns">${btn("ask", "Ask for more", A.stance === "ask")}${btn("std", "Standard", A.stance === "std")}${btn("safe", "Take any deal", A.stance === "safe")}</div><div class="dim small">Asking for more pays 15% extra if they renew, but raises the bar. Taking any deal keeps a weaker club on review at lower pay.</div>` : ""}<div class="small" style="margin-top:8px">Summer benchmark games:</div><div class="owbtns">${btn("friendly_on", "Play", A.friendly !== "off")}${btn("friendly_off", "Decline", A.friendly === "off")}</div></div>` : "";
    const note = A.note ? `<div class="card"><div class="small"><b>${esc(A.note.t)}</b></div></div>` : "";
    const scol = ["#9aa3a8", "#e0b44f", "#e0954f", "#e06a5a", "#c43d3d"];
    const relc = A.rel && A.rel.length ? `<div class="card"><h3>Domestic leagues</h3><div class="dim small" style="margin-bottom:4px">How the leagues that lost clubs feel about the Apex. Anger builds for a few seasons, then slowly fades. Fines, then blocked transfers, then a boycott across the confederation. Free agents are always open.</div>${A.rel.map((r) => `<div class="row"><span class="small"${r.mine ? ' style="font-weight:800"' : ""}>${esc(r.league)} <span class="dim">(${r.clubs} gone)</span></span><b class="small" style="color:${scol[r.level]}">${r.label} &middot; ${Math.round(r.rel)}</b></div>`).join("")}</div>` : "";
const cups = A.deals ? `<div class="card"><h3>Cups and FIFA</h3>${A.deals.map((d) => `<div class="row"><span class="small">${esc(d.confed)} <span class="dim">(${d.clubs} member${d.clubs === 1 ? "" : "s"})</span></span><b class="small" style="color:${d.slots ? "#4fbf7a" : "#e06a5a"}">${d.slots ? d.slots + " place" + (d.slots === 1 ? "" : "s") + " to S" + d.until : "no deal"}</b></div>`).join("")}<div class="row"><span class="small">FIFA Club World Cup bids</span><b class="small">${A.fifa}</b></div>${A.cont ? `<div class="dim small" style="margin-top:6px">Last season in the cups: ${A.cont.perf} against an expected ${A.cont.expect}. ${A.cont.perf >= A.cont.expect ? "Beating it lifts" : "Missing it lowers"} league health.</div>` : ""}<div class="dim small" style="margin-top:4px">Each confederation decides whether its clubs in the ${"Apex"} may enter its cup. A boycott ends any deal. The best placed members take the places.</div></div>` : "";
    const btn = (act, label, on) => `<button class="mini ${on ? "pri" : ""}" data-apex="${act}">${label}</button>`;
    const inv = A.invite ? `<div class="card"><h3>Invitation</h3><div class="small">The board voted for your club: <b>${money(A.invite.pay)}</b> a year for <b>${A.invite.years}</b> seasons. You join at the end of this season. Joining costs fan goodwill for a while.</div><div class="owbtns" style="margin-top:8px">${btn("accept", A.invite.answer === "apex" ? "Accepted" : "Accept", A.invite.answer === "apex")}${btn("decline", A.invite.answer === "stay" ? "Declined" : "Decline", A.invite.answer === "stay")}</div></div>` : "";
    const ap = A.apply && !A.invite ? `<div class="card"><h3>Tryout</h3><div class="small">${A.apply.open ? (A.apply.applied ? "Applied. Your tryout against an Apex club is played in the summer." : `Apply for a tryout (fee <b>${money(A.apply.fee)}</b>). Win or come close and you become a candidate when a seat opens. A hostile league may fine you for applying.`) : esc(A.apply.league) + " has lost as many clubs as it can. You cannot apply."}</div>${A.apply.open && !A.apply.applied ? `<div class="owbtns" style="margin-top:8px">${btn("apply", "Apply", true)}</div>` : ""}${(A.cands || []).some((c) => c.mine) ? `<div class="small" style="margin-top:6px"><b>You are a candidate for the next open seat.</b></div>` : ""}</div>` : "";
    const sum = A.summer && A.summer.games.length ? `<div class="card"><h3>Summer games <small>after S${A.summer.season}</small></h3>${A.summer.games.map((g) => `<div class="row"><span class="small">${g.k === "tryout" ? "Tryout" : "Benchmark"}: ${esc(g.h)} v ${esc(g.a)}</span><b class="small">${g.note ? esc(g.note) : g.hg + "-" + g.ag}</b></div>`).join("")}${A.cands && A.cands.length ? `<div class="dim small" style="margin-top:6px">Candidates: ${A.cands.map((c) => esc(c.club)).join(", ")}</div>` : ""}</div>` : "";
        main = note + inv + ap + `<div class="card"><h3>League health <small>${A.health}</small></h3><div style="height:8px;border-radius:4px;background:#1b2a24;overflow:hidden"><div style="height:8px;width:${A.health}%;background:${hcol}"></div></div><div class="dim small" style="margin-top:6px">Strong fields keep it healthy. A weak field or empty seats pull it down, and a sick league runs with fewer clubs (about ${A.want} now).</div></div>` + mine + sum + cups + relc + `<div class="card"><h3>Apex League <small>founded season ${A.inaugural}</small></h3>${tbl}<div class="dim small" style="margin-top:6px">${A.members.length} clubs. Every match is a heavyweight.</div></div><div class="card"><h3>Contracts</h3>${A.members.map((m) => `<div class="row"><span class="owt">${crest(m.club, 18)}<span ${m.mine ? 'style="font-weight:800"' : ""}>${esc(m.club)}</span></span><span class="dim small">${m.years} yr left &middot; file ${m.file}</span></div>`).join("")}</div>`;
  } else main = `<div class="card"><h3>Apex League</h3><div class="dim small">The league collapsed before it started: too few big clubs signed.</div></div>`;
  const art = `<div style="text-align:center;padding:4px 0 10px"><img src="${A.mine ? APEX_ART.badge : APEX_ART.mark}" height="${A.mine ? 84 : 56}" alt="Apex League"></div>`;
  return art + main + (A.state === "contracts" || A.state === "live" ? "" : rum) + (A.state === "contracts" ? rum : "") + log;
}
// ---- window ----
async function owWindow(st) {
  if (st.reneg) {
    const R = st.reneg;
    return `<div class="card"><h3>Contract talks <small>week ${R.round} of ${R.rounds}</small></h3><div class="dim small">These players are out of contract. Your coach has a view on each. Anyone left unresolved reaches free agency when the talks end.</div>
      ${R.list.map((x) => `<div class="row ow-deal"><span class="rt"><b>${esc(x.name)}</b> ${ovr(x.ovr)} <span class="dim small">${x.pos} &middot; ${x.age}</span><div class="meta">${x.state === "open" ? `${x.coach === "nodeal" ? "Coach: <b>no deal</b>, he wants to leave the club" : "Coach says: <b>" + (x.coach === "resign" ? "re-sign" : "let him walk") + "</b>"} &middot; wants ${owM(x.ask)}/yr for ${x.years} yr (now ${owM(x.now)})<div class="owm-b" style="max-width:160px"><i style="width:${x.annoyed}%;background:${x.annoyed > 60 ? "#e05a4f" : "#e0b44f"}"></i></div><span class="dim small">annoyed ${x.annoyed}</span>` : x.state === "signed" ? "Re-signed at " + owM(x.wage) : "Gone"}</div></span>
      ${x.state === "open" ? `<span class="owbtns"><button class="pri mini" data-rg="approve" data-uid="${x.uid}">Approve</button><button class="mini" data-rg="counter" data-uid="${x.uid}" data-ask="${x.ask}">Counter</button><button class="mini" data-rg="walk" data-uid="${x.uid}">Let walk</button></span>` : ""}</div>`).join("")}
      <button class="btn wide" id="ow-round">${R.round < R.rounds ? "Next week" : "End talks and open the window"}</button></div>`;
  }
  const W = st.window; if (!W || !W.open) return `<div class="card"><h3>Transfer window</h3><div class="dim small">The window opens after the season ends. ${STATUS.header.flow ? "It is closed now." : "Play the season first."}</div></div>`;
  const deals = W.deals.map((d) => `<div class="row ow-deal"><span class="rt"><b>${esc(d.name)}</b> ${ovr(d.ovr)} <span class="dim small">${d.pos} &middot; ${d.age} &middot; coach sees potential ${d.pot}</span><div class="meta">${esc(d.tag)} &middot; ${owFit(d.fit)} &middot; from ${clubLink(d.club)}<br>${owM(d.fee)} fee &middot; ${owM(d.wage)}/yr &middot; ${d.years} yr</div></span>
    <span class="owbtns"><button class="pri mini" data-deal="approve" data-id="${d.id}">Approve</button><button class="mini" data-deal="counter" data-id="${d.id}" data-fee="${d.fee}">Counter</button><button class="mini" data-deal="veto" data-id="${d.id}">Veto</button></span></div>`).join("");
  const inbox = W.inbox.map((x) => `<div class="row ow-deal"><span class="rt"><b>${esc(x.name)}</b><div class="meta">${esc(x.club)} offer ${owM(x.fee)}</div></span><span class="owbtns"><button class="pri mini" data-ib="accept" data-uid="${x.uid}">Accept</button><button class="mini" data-ib="counter" data-uid="${x.uid}" ${x.once ? "disabled" : ""}>Ask more</button><button class="mini" data-ib="decline" data-uid="${x.uid}">Decline</button></span></div>`).join("");
  const wars = W.wars.map((x) => `<div class="row"><span><b>${esc(x.name)}</b> <span class="dim small">${esc(x.rival)} bid ${owM(x.bid)}</span></span><span class="dim small">beat it this round</span></div>`).join("");
  const m = await api("/api/ow_market?" + new URLSearchParams(Object.entries(OWT.mq).filter(([k, v]) => v)).toString());
  const q = OWT.mq;
  return `<div class="card"><h3>Round ${W.round} of ${W.rounds} <small>${W.deadline ? "DEADLINE DAY" : ""}</small></h3><div class="dim small">Squad ${st.club.squad}/25. Fair value is what a player is worth; sellers ask more, and lowballing locks you out.</div>
      <div class="owbtns"><button class="pri" id="ow-round">${W.deadline ? "Deadline passes: close window" : "Next round"}</button><button id="ow-endw">End window now</button></div></div>
    ${W.requests && W.requests.length ? `<div class="card ow-alert"><h3>Asked to leave</h3><div class="dim small">These players are unhappy and want out. Sell them (buyers pay a little less), or talk them round on the Squad tab. Keeping them hurts the players' mood.</div>${W.requests.map((x) => `<div class="row"><span><b>${esc(x.name)}</b> ${ovr(x.ovr)}</span><button class="mini" data-tab="squad">Open squad</button></div>`).join("")}</div>` : ""}
    ${wars ? `<div class="card ow-alert"><h3>Bidding wars</h3>${wars}</div>` : ""}
    ${owNeeds(st)}
    <div class="card"><h3>Your coach's deals</h3>${deals || '<div class="dim small">No deals right now. The coach may find something next round.</div>'}</div>
    ${inbox ? `<div class="card"><h3>Offers for your players</h3>${inbox}</div>` : ""}
    <div class="card"><h3>Market</h3>
      <div class="owf"><input id="mq-q" placeholder="Search name" value="${esc(q.q)}"><select id="mq-pos"><option value="">Any</option>${["GK", "DEF", "MID", "FWD"].map((x) => `<option ${q.pos === x ? "selected" : ""}>${x}</option>`).join("")}</select>
      <select id="mq-sort">${[["ovr", "Best"], ["value", "Cheapest"], ["age", "Youngest"]].map(([k, t]) => `<option value="${k}" ${q.sort === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="owf">${[["grads", "Graduates"], ["expiring", "Expiring"], ["free", "Free agents"]].map(([k, t]) => `<label class="check"><input type="checkbox" data-mqf="${k}" ${q[k] ? "checked" : ""}> ${t}</label>`).join("")}</div>
      ${m.rows.map((p) => `<div class="row"><span class="rt">${playerLink(p)} ${ovr(p.ovr)} <span class="dim small">${p.pos} &middot; ${p.age}${p.coach_pot ? " &middot; coach: pot " + p.coach_pot : ""}${p.grad ? " &middot; <b>graduate</b>" : ""}</span><div class="meta">${owFit(p.fit)} &middot; ${p.club ? esc(p.club) + " (" + p.rel + ")" : "free agent"}${p.blocked ? ' &middot; <b style="color:#e06a5a">sanctions: will not deal</b>' : ""} &middot; value ${owM(p.value)} &middot; wage ${owM(p.wage)} &middot; ${p.contract}y${p.last ? " &middot; " + p.last.g + "g " + p.last.a + "a" : ""}</div></span>
      <button class="mini ${p.locked || p.blocked ? "" : "pri"}" ${p.blocked ? "disabled" : ""} data-bid="${p.uid}" data-name="${esc(p.name)}" data-val="${p.value}" data-wage="${p.wage}" data-pos="${p.pos}" data-role="${p.fit ? p.fit.role : ""}" data-repl="${p.fit && p.fit.repl ? esc(p.fit.repl.name) + " (" + p.fit.repl.ovr + ")" : ""}" data-age="${p.age}" data-ovr="${p.ovr}" data-yrs="${p.contract}" data-free="${p.club ? "" : "1"}" ${p.locked ? "disabled" : ""}>${p.locked ? "Locked" : p.war ? "War!" : p.club ? "Bid" : "Sign"}</button></div>`).join("") || '<div class="dim small">No players match.</div>'}</div>`;
}
// ---- squad (own players: sell, release; graduates) ----
async function owSquad(st) {
  const d = await api("/api/ow_squad"), rows = d.rows.filter((p) => OWT.sq !== "grads" || p.grad), W = st.window && st.window.open;
  return `${owNeeds(st)}<div class="card"><h3>Squad <small>${d.rows.length}/25</small></h3><nav class="chips"><button class="${OWT.sq === "all" ? "on" : ""}" data-sq="all">All</button><button class="${OWT.sq === "grads" ? "on" : ""}" data-sq="grads">Graduates</button></nav>
    <div class="dim small" style="margin:6px 0">${W ? "Sell to another club, or release (you pay half the wages left). Graduates stay with you unless you sell or release them." : "Selling and releasing happen in the transfer window."}</div>
    ${rows.map((p) => `<div class="row"><span class="rt">${playerLink(p)} ${ovr(p.ovr)} <span class="dim small">${p.pos} &middot; ${p.age}${p.coach_pot ? " &middot; pot " + p.coach_pot : ""}${p.grad ? " &middot; <b>graduate</b>" : ""}${p.req ? " &middot; <b style=\"color:#e0b44f\">asked to leave</b>" : ""}</span><div class="meta">value ${owM(p.value)} &middot; wage ${owM(p.wage)} &middot; ${p.contract}y${p.req && W ? ` <button class="mini" data-pers="${p.uid}">Talk him round</button>` : ""}${p.offers ? "<br>" + p.offers.map((o) => `<button class="mini pri" data-sell="${p.uid}" data-club="${esc(o.club)}">${esc(o.club)} ${owM(o.fee)}</button>`).join(" ") + ` <button class="mini" data-ask="${p.uid}">Ask more</button>` : ""}</div></span>
      ${W && !p.offers ? `<span class="owbtns"><button class="mini" data-selll="${p.uid}">Sell</button><button class="mini" data-rel="${p.uid}" data-name="${esc(p.name)}">Release</button></span>` : ""}</div>`).join("")}</div>`;
}
// ---- staff ----
const owRt = (x) => `<div class="ow-rt">${[["scout", "Finds players"], ["dev", "Develops youth"], ["keep", "Keeps veterans"]].map(([k, t]) => `<div class="row"><span class="small">${t}</span><span class="owm-b" style="width:90px;display:inline-block"><i style="width:${x[k]}%;background:#4fbf7a"></i></span><b class="small">${x[k]}</b></div>`).join("")}</div>`;
async function owStaff(st) {
  const d = await api("/api/ow_staff"), c = d.current;
  return `<div class="card"><h3>Your coach <small>${c ? "contract " + (c.contract > 0 ? c.contract + "y" : "expired") : "vacant"}</small></h3>
    ${c ? `<div class="row"><span><a href="#/coach/${c.id}">${esc(c.name)}</a> <span class="dim small">age ${c.age} &middot; prestige ${c.prestige} &middot; ${esc(c.personality)}</span></span><b>${owM(c.wage)}/yr</b></div>${owRt(c)}
      <div class="dim small">Prestige lifts the team on the pitch. Scouting finds cheaper talent and sees potential. Development makes your young players improve. Keeping slows the fade of older players.</div>
      <div class="owbtns">${c.expired ? `<button class="pri mini" data-cc="renew">Renew at his price</button><button class="mini" data-cc="renewc">Counter</button>` : ""}<button class="mini" data-cc="fire">Fire (severance)</button></div>` : '<div class="dim small">Hire one below.</div>'}</div>
    <div class="card"><h3>Coaches looking for work</h3>${d.candidates.map((x) => `<div class="row ow-deal"><span class="rt"><a href="#/coach/${x.id}">${esc(x.name)}</a> <span class="dim small">age ${x.age} &middot; prestige ${x.prestige} &middot; ${esc(x.personality)}</span>${owRt(x)}</span><span>${owM(x.ask)}/yr<br><button class="mini pri" data-hire="${x.id}" data-ask="${x.ask}" data-name="${esc(x.name)}">Offer</button></span></div>`).join("") || '<div class="dim small">Nobody is looking for work right now. More coaches appear after the season ends.</div>'}</div>`;
}
// ---- money ----
async function owMoney(st) {
  const sp = await api("/api/ow_sponsors"), c = st.club;
  const mlog = (st.money || []).slice().reverse();
  return `<div class="card"><h3>Money over time</h3>${owChart(st.money)}</div><div class="card"><h3>Two wallets</h3><div class="row"><span>Your money</span><b>${owM(st.wealth)}</b></div><div class="row"><span>Club cash</span><b>${owM(c.cash)}</b></div>
    <div class="row"><span>Put into the club (all time)</span><span>${owM(st.injected)}</span></div><div class="row"><span>Taken out (all time)</span><span>${owM(st.dividends)}</span></div>
    <div class="owf"><input type="number" id="ow-amt" placeholder="Amount (M)" style="width:120px"><button id="ow-inj">Put in</button><button id="ow-div">Take out</button></div>${c.inj_left !== null ? `<div class="dim small">Classic: ${owM(c.inj_left)} left to put in this year. The club must keep 15% of its income as cash.</div>` : '<div class="dim small">Sandbox: no limits.</div>'}</div>
    <div class="card"><h3>Sponsors</h3>${st.sponsors.map((s) => `<div class="row"><span>${esc(s.name)}</span><span>${owM(s.per_year)}/yr &middot; ${s.left}y left</span></div>`).join("") || '<div class="dim small">None signed.</div>'}
      ${sp.rows.map((s) => `<div class="row"><span class="rt"><b>${esc(s.name)}</b><div class="meta">${esc(s.note)}</div></span><span>${owM(s.per_year)}/yr &middot; ${s.years}y <button class="mini pri" data-sp="${s.id}">Sign</button></span></div>`).join("")}</div>
    <div class="card"><h3>Lifestyle <small>status ${st.status}</small></h3><div class="dim small">Money you spend on yourself. Fans notice, and so does your reputation.</div>${st.lifestyle.map((l) => `<div class="row"><span>${esc(l.label)}</span><span>${owM(l.cost)} <button class="mini" data-life="${l.id}" ${l.owned ? "disabled" : ""}>${l.owned ? "Owned" : "Buy"}</button></span></div>`).join("")}</div>
    <div class="card"><h3>Money log <small>newest first</small></h3><div class="dim small">Every change to your wealth and the club's cash.</div>${mlog.slice(0, 40).map((m) => `<div class="row owml"><span class="small">${esc(m.t)}<div class="dim small">S${m.s}</div></span><span class="owmd"><span class="dim small">You</span> ${owDelta(m.dw)}<br><span class="dim small">Club</span> ${owDelta(m.dc)}</span></div>`).join("") || '<div class="dim small">Nothing yet.</div>'}</div>
    <div class="card"><h3>Your ledger</h3><div class="dim small">Your income swings from year to year.</div>${st.ledger.slice().reverse().map((l) => `<div class="row"><span>S${l.season}${l.club ? " &middot; " + esc(l.club) : ""}</span><span class="small">income ${owM(l.income)} &middot; divs ${owM(l.dividends)} &middot; in ${owM(l.injections)} &middot; worth ${owM(l.wealth)}</span></div>`).join("")}</div>`;
}
function owBoard(st) {
  const p = st.pressure, steps = ["Calm", "Concern", "Pressure", "Buyout offers"];
  return `<div class="card"><h3>Who is watching</h3>${owBar(p.board, "Board", "The most powerful group. The board decides whether you stay.")}${owBar(p.fans, "Fans", "They have the least power but hit tickets and sponsors.")}${owBar(p.players, "Players", "Unhappy players make the board uneasy, unless it is only about money and the team is winning.")}</div>
    <div class="card"><h3>The ladder</h3>${steps.map((s, i) => `<div class="row"><span style="${i === p.ladder ? "font-weight:800" : "opacity:.6"}">${i === p.ladder ? "&#9658; " : ""}${s}</span></div>`).join("")}<div class="dim small" style="margin-top:6px">Nobody can force you out. At the top of the ladder the board offers to buy you out, and each offer you refuse is lower than the last. A club that keeps losing money ends in administration.</div></div>
    <div class="card"><h3>Reputation <small>${st.rep}</small></h3><div class="dim small">Titles raise it. Administration costs a lot. Bigger clubs need a higher reputation to buy.</div></div>${owHistory(st)}`;
}
// ---- wiring ----
function owWire(st) {
  const go = (p, b, ok) => owPost(p, b, ok).then(async (r) => { if (r) { await refreshStatus(); await route(); } return r; });
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => (location.hash = "#/owner/" + b.dataset.tab)));
  document.querySelectorAll("[data-speed]").forEach((b) => (b.onclick = () => go("/api/ow_settings", { speed: b.dataset.speed })));
  const adv = $("#ow-adv"); if (adv) adv.onclick = async () => { const r = await busy("Playing...", () => api("/api/ow_advance", { unit: st.speed })); if (r) { await refreshStatus(); if (r.rolled) toast("Season over. The off-season begins.", true); await route(); } };
  const sv = $("#ow-save"); if (sv) sv.onclick = () => saveDialog();
  const stt = $("#ow-start"); if (stt) stt.onclick = () => { location.hash = "#/start"; };
  const pg = $("#ow-game"); if (pg) pg.onclick = async () => { const r = await busy("Playing...", () => api("/api/ow_playgame", {})); if (r) { await refreshStatus(); if (r.rolled) toast("Season over. The off-season begins.", true); await route(); } };
  const nx = $("#ow-next"); if (nx) nx.onclick = async () => { try { const f = STATUS.header.flow; if (f) { for (const s of ["graduates", "transfers", "done"]) await api("/api/flow", { step: s }).catch(() => 0); } } catch (e) { toast(e.message); } await refreshStatus(); await route(); };
  const rt = $("#ow-retire"); if (rt) rt.onclick = async () => { if (confirm("Retire from ownership? This ends the run.")) await go("/api/ow_retire"); };
  document.querySelectorAll("[data-bo]").forEach((b) => (b.onclick = async () => { const r = await owPost("/api/ow_buyout", { action: b.dataset.bo }); if (r) { toast(r.msg || "Done", true); await refreshStatus(); await route(); } }));
  const rd = $("#ow-round"); if (rd) rd.onclick = () => go("/api/ow_round");
  const ew = $("#ow-endw"); if (ew) ew.onclick = () => go("/api/ow_endwindow");
  document.querySelectorAll("[data-rg]").forEach((b) => (b.onclick = async () => {
    let body = { uid: +b.dataset.uid, action: b.dataset.rg };
    if (b.dataset.rg === "counter") { const v = prompt("Your wage offer per year (M). He asks " + b.dataset.ask + "M.", b.dataset.ask); if (!v) return; body.wage = +v; }
    const r = await owPost("/api/ow_reneg", body); if (r) { toast(r.msg || "Done", true); await route(); }
  }));
  document.querySelectorAll("[data-deal]").forEach((b) => (b.onclick = async () => {
    const id = +b.dataset.id, act = b.dataset.deal; let body = { id, action: act };
    if (act === "counter") {
      const v = prompt("Your counter fee (M). Their agreed price is " + b.dataset.fee + "M.", b.dataset.fee); if (!v) return;
      const pv = await owPost("/api/ow_deal", { id, action: "preview", fee: +v }); if (!pv) return;
      if (!confirm("Counter " + v + "M?\nChance the other club walks away: " + Math.round(pv.collapse * 100) + "%\nYour coach loses trust (" + pv.trust_loss + ").\nRelation with the club cools.\nRounds left: " + pv.rounds_left)) return;
      body.fee = +v;
    }
    const r = await owPost("/api/ow_deal", body); if (r) { toast(r.msg || "Done", r.status === "done"); await route(); }
  }));
  document.querySelectorAll("[data-ib]").forEach((b) => (b.onclick = async () => { const r = await owPost("/api/ow_inbox", { uid: +b.dataset.uid, action: b.dataset.ib }); if (r) { toast(r.msg || "Done", true); await route(); } }));
  document.querySelectorAll("[data-bid]").forEach((b) => (b.onclick = () => owBidDialog(b.dataset)));
  const mq = (k, el, ev) => { const e = $(el); if (e) e[ev] = () => { OWT.mq[k] = e.type === "checkbox" ? e.checked : e.value; route(); }; };
  mq("q", "#mq-q", "onchange"); mq("pos", "#mq-pos", "onchange"); mq("sort", "#mq-sort", "onchange");
  document.querySelectorAll("[data-mqf]").forEach((c) => (c.onchange = () => { OWT.mq[c.dataset.mqf] = c.checked; route(); }));
  document.querySelectorAll("[data-apex]").forEach((b) => (b.onclick = async () => { const r = await owPost("/api/ow_apex", { action: b.dataset.apex }); if (r) { toast(r.msg || (b.dataset.apex === "apex" ? "You will join the Apex League." : "You will stay."), true); await route(); } }));
  document.querySelectorAll("[data-needpos]").forEach((r) => (r.onclick = () => { OWT.mq.pos = r.dataset.needpos; if (OWT.tab !== "window") location.hash = "#/owner/window"; else route(); }));
  document.querySelectorAll("[data-pers]").forEach((b) => (b.onclick = async () => { const pv = await owPost("/api/ow_persuade", { uid: +b.dataset.pers }); if (!pv) return; if (!confirm(pv.msg + "\nTry it?")) return; const r = await owPost("/api/ow_persuade", { uid: +b.dataset.pers, confirm: true }); if (r) { toast(r.msg, r.status === "stays"); await route(); } }));
  document.querySelectorAll("[data-cc]").forEach((b) => (b.onclick = async () => {
    const a = b.dataset.cc; let body = { action: a === "renewc" ? "renew" : a };
    if (a === "renewc") { const v = prompt("Your wage offer per year (M)"); if (!v) return; body.counter = true; body.wage = +v; }
    if (a === "fire" && !confirm("Fire your coach? You pay severance.")) return;
    const r = await owPost("/api/ow_coach", body); if (r) { toast(r.msg || "Done", r.status === "signed" || r.status === "fired"); await route(); }
  }));
  document.querySelectorAll("[data-hire]").forEach((b) => (b.onclick = async () => {
    const v = prompt("Offer " + b.dataset.name + " a wage per year (M). He asks " + b.dataset.ask + "M. Hiring him replaces your current coach (severance applies).", b.dataset.ask); if (!v) return;
    const r = await owPost("/api/ow_coach", { action: "hire", id: +b.dataset.hire, wage: +v, years: 3 }); if (r) { toast(r.msg || "Done", r.status === "hired"); await route(); }
  }));
  document.querySelectorAll("[data-sc]").forEach((b) => (b.onclick = () => { OWT.sc = b.dataset.sc; route(); }));
  document.querySelectorAll("[data-sq]").forEach((b) => (b.onclick = () => { OWT.sq = b.dataset.sq; route(); }));
  document.querySelectorAll("[data-selll]").forEach((b) => (b.onclick = async () => { const r = await owPost("/api/ow_sell", { uid: +b.dataset.selll }); if (r) { if (r.msg) toast(r.msg); await route(); } }));
  document.querySelectorAll("[data-sell]").forEach((b) => (b.onclick = async () => { const r = await owPost("/api/ow_sellreply", { uid: +b.dataset.sell, club: b.dataset.club, action: "accept" }); if (r) { toast(r.msg || "Done", r.status === "done"); await route(); } }));
  document.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = async () => { const r = await owPost("/api/ow_sellreply", { uid: +b.dataset.ask, action: "ask" }); if (r) { toast(r.msg || "New offers."); await route(); } }));
  document.querySelectorAll("[data-rel]").forEach((b) => (b.onclick = async () => { if (confirm("Release " + b.dataset.name + "? You pay half of his remaining wages.")) { const r = await owPost("/api/ow_release", { uid: +b.dataset.rel }); if (r) { toast("Released (" + owM(r.cost) + ")", true); await route(); } } }));
  const amt = () => +$("#ow-amt").value;
  const inj = $("#ow-inj"); if (inj) inj.onclick = () => go("/api/ow_inject", { amount: amt() }, "Money put in.");
  const dv = $("#ow-div"); if (dv) dv.onclick = () => go("/api/ow_dividend", { amount: amt() }, "Dividend taken.");
  document.querySelectorAll("[data-sp]").forEach((b) => (b.onclick = () => go("/api/ow_sponsor", { id: +b.dataset.sp }, "Signed.")));
  document.querySelectorAll("[data-life]").forEach((b) => (b.onclick = () => go("/api/ow_life", { item: b.dataset.life })));
}
function owBidDialog(d) {
  const val = +d.val, wage = +d.wage, free = d.free === "1", st = OWT.ST, n = st && st.needs ? st.needs.n : null;
  const sl = (id, label, v, min, max, step, fmt) => `<div class="field owsl"><label>${label} <b id="${id}-v">${fmt(v)}</b></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
  const fee0 = Math.max(0.1, +(val * 1.25).toFixed(1)), wage0 = Math.max(0.1, +(wage * 1.1).toFixed(1)), feeMax = Math.max(5, Math.ceil(val * 3)), wMax = Math.max(1, Math.ceil(wage * 2.5));
  openModal(`<div class="ow-dlg"><h3>${esc(d.name)} <span class="dim small">${esc(d.pos || "")} &middot; ${esc(d.age || "")} &middot; ${esc(d.ovr || "")}</span></h3>
    <div class="owfitbox">${d.role ? `<span class="owfit ${d.role.toLowerCase()}">${esc(d.role)}</span> ${d.role === "Starter" ? "He would start" + (d.repl ? ", pushing out " + esc(d.repl) : "") : d.role === "Reserve" ? "He would be on the bench" : "He would sit outside the matchday squad"}.` : ""}${n !== null ? `<div class="dim small">Squad ${n} &rarr; ${n + 1} of 25${n >= 25 ? " (full: sell or release someone first)" : ""}</div>` : ""}</div>
    <div class="dim small">Fair value ${owM(val)}. Expect to pay more. Rival clubs may jump in.</div>
    ${free ? '<div class="dim small">Free agent: no fee, just wages.</div><input type="hidden" id="bd-fee" value="0">' : sl("bd-fee", "Fee", fee0, 0, feeMax, feeMax > 60 ? 0.5 : 0.1, (v) => owM(+v))}
    ${sl("bd-wage", "Wage per year", wage0, 0, wMax, 0.1, (v) => owM(+v))}
    ${sl("bd-yrs", "Years", 3, 1, 5, 1, (v) => v + " yr")}
    <div id="bd-msg" class="small" style="margin:8px 0"></div>
    <div class="owbtns"><button class="pri" id="bd-go">Send offer</button><button id="bd-x">Close</button></div></div>`);
  const bind = (id, fmt) => { const el = $("#" + id); el.oninput = () => ($("#" + id + "-v").textContent = fmt(+el.value)); };
  if (!free) bind("bd-fee", (v) => owM(v)); bind("bd-wage", (v) => owM(v)); bind("bd-yrs", (v) => v + " yr");
  const setv = (id, v, fmt) => { const el = $("#" + id); if (!$("#" + id + "-v")) return; if (+v > +el.max) el.max = Math.ceil(+v * 1.5); el.value = v; $("#" + id + "-v").textContent = fmt(+v); };
  $("#bd-x").onclick = closeModal;
  $("#bd-go").onclick = async () => {
    const r = await owPost("/api/ow_bid", { uid: +d.bid, fee: +$("#bd-fee").value, wage: +$("#bd-wage").value, years: +$("#bd-yrs").value }); if (!r) return;
    $("#bd-msg").innerHTML = `<b>${esc(r.msg || r.status)}</b>${r.ask ? " (they ask " + owM(r.ask) + ")" : ""}${r.need ? " (needs " + owM(r.need) + ")" : ""}${r.need_wage ? " (wage " + owM(r.need_wage) + ")" : ""}${r.patience !== undefined ? " &middot; patience left " + Math.max(0, r.patience) : ""}`;
    if (r.ask) setv("bd-fee", r.ask, (v) => owM(v)); if (r.need) setv("bd-fee", r.need, (v) => owM(v)); if (r.need_wage) setv("bd-wage", r.need_wage, (v) => owM(v));
    if (r.status === "done") { setTimeout(async () => { closeModal(); await route(); }, 900); } else if (r.status === "locked") { await route(); }
  };
}
