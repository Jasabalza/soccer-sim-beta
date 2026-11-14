// BAIT Bets: the phone. A run opens on a home screen of app tiles; each app is its own screen with its own look
// (dark BAIT Bets and Bank, a white Chirp feed, a cream Hustle Shop). The sim's header and tab bar are not used here.
const GB_SVG = {
  chirp: '<path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l8-8"/>', shop: '<path d="M6 8h12l1 12H5zM9 8a3 3 0 0 1 6 0"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>', bets: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  teams: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>', players: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6"/>',
  perks: '<path d="M3 12l9-9h8v8l-9 9zM16 8h.01"/>', gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  mail: '<path d="M3 6h18v12H3zM3 7l9 7 9-7"/>', lock: '<path d="M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3"/>', back: '<path d="M15 5l-7 7 7 7"/>', slate: '<path d="M4 6h16M4 12h16M4 18h10"/>',
};
const gbSvg = (k, s) => `<svg width="${s || 24}" height="${s || 24}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GB_SVG[k]}</svg>`;
const gbTile = (href, label, color, inner, badge, attr) => `<a class="gbt" href="${href}" ${attr || ""}><span class="gbt-i" style="background:${color}">${inner}${badge ? `<em>${badge}</em>` : ""}</span>${label}</a>`;
const GB_APP_COLORS = { predict: "#7DD3FC", offshore: "#F59E0B", wild: "#EC4899" };
const gbBillLine = (r) => {
  const bd = GB_BILL_EVERY - (r.lw % GB_BILL_EVERY), bill = gbBill(r) + r.owed;
  const l = (r.loans || [])[0];
  return l ? `Owe ${gbMoney(l.balance)} to ${GB_LENDERS[l.lender].name} &middot; due in ${Math.max(0, l.due - (r.t || 0))} wk` : `Bill ${gbMoney(bill)} in ${bd} wk`;
};
function gbQuotaCard(r) {
  const net = gbNet(r), pct = Math.max(0, Math.min(100, Math.round(net / r.quota * 100))), wl = GB_LEVEL - r.lw;
  return `<div class="gbq"><div class="gbq-h"><span>QUOTA &middot; END OF LEVEL ${r.level}</span><span>${pct}%</span></div>
    <div class="gbq-a">${gbMoney(net)} <small>of ${gbMoney(r.quota)}</small></div><div class="gbq-bar"><i style="width:${pct}%"></i></div>
    <div class="gbq-f"><span>${wl} week${wl === 1 ? "" : "s"} left</span><span class="warn">${gbBillLine(r)}</span></div>
    <div class="gbq-f"><span class="mut">${"&#10006;".repeat(r.strikes)}${"&#9675;".repeat(Math.max(0, GB_MAX_STRIKES - r.strikes))} strikes</span>${gbDebt(r) ? `<span class="mut">debt ${gbMoney(gbDebt(r))}</span>` : ""}</div></div>`;
}
function gbHomeHtml(r) {
  const d = r.wkDelta || 0, tips = (r.tips || []).filter((t) => t.status === "open"), dv = tips.slice().reverse().find((t) => t.src === "dave");
  const nOpen = gbOpenBets().length + gbOpenTitles().length, offers = r.offer && r.offer.length ? r.offer.length : 0;
  const alt = Object.keys(GB_APPS).filter((k) => k !== "bait").map((k) => { const A = GB_APPS[k];
    return gbAppOpen(k) ? gbTile("#/gambler/slate", A.brand.length > 9 ? A.brand.slice(0, 9) : A.brand, GB_APP_COLORS[k], `<b class="gbt-l">${esc(A.brand[0])}</b>`, 0, `data-gbapp="${k}"`)
      : `<div class="gbt lockd"><span class="gbt-i">${gbSvg("lock", 26)}</span>${esc(A.brand.length > 9 ? A.brand.slice(0, 9) : A.brand)}<small>level ${A.unlock}</small></div>`; }).join("");
  return `<div class="gbh-top"><span>WEEK ${r.week} &middot; LEVEL ${r.level}</span><span>SEED ${esc(String(r.seed))}</span></div>
    <div class="gbh-amt">${gbMoney(r.bankroll)}</div><div class="gbh-sub ${d >= 0 ? "up" : "dn"}">Bankroll &middot; ${d >= 0 ? "up " : "down "}${gbMoney(Math.abs(d))} last week</div>
    ${gbQuotaCard(r)}
    <a class="gbmsg" href="#/gambler/chirp"><span class="av">D</span><span><small>Messages &middot; Dave</small>${dv ? `"${esc(gbTipLabel(dv))} in ${esc(dv.h)} v ${esc(dv.a)}. Trust me."` : `"${esc(GB_ACCTS.dave.line)}"`}</span></a>
    ${GBU.msg ? `<div class="gb-msg">${GBU.msg}</div>` : ""}
    <div class="gbgrid">
      ${gbTile("#/gambler/slate", "BAIT Bets", "#B6FF3C", '<b class="gbt-l">B</b>', 0, 'data-gbapp="bait"')}
      ${gbTile("#/gambler/chirp", "Chirp", "#3B82F6", gbSvg("chirp", 30), tips.length)}
      ${gbTile("#/gambler/shop", "Hustle Shop", "#FF8A3D", gbSvg("shop", 30))}
      ${gbTile("#/gambler/chirp", "Messages", "#34D399", gbSvg("mail", 30), dv ? 1 : 0)}
      ${gbTile("#/gambler/loans", "Bank", "#A78BFA", gbSvg("bank", 30), (r.loans || []).length)}
      ${gbTile("#/gambler/bets", "My Bets", "#F2F5FA", gbSvg("bets", 30), nOpen)}
      ${gbTile("#/gambler/perks", "Perks", "#F472B6", gbSvg("perks", 30), offers || (r.perks || []).length)}
      ${gbTile("#/gambler/menu", "Settings", "#2B3345", gbSvg("gear", 30)).replace("gbt-i","gbt-i lt")}
      ${alt}
    </div>${offers ? `<a class="gbbanner" href="#/gambler/perks">${offers} perk offers waiting. Pick one.</a>` : ""}<div class="gb-note">Play money only. No real gambling.</div>`;
}
const gbHead = (title, right, back) => `<div class="gbhd"><a class="gbback" href="${back || "#/gambler"}" aria-label="Back">${gbSvg("back", 22)}</a><div class="gbhd-t">${title}</div>${right === undefined ? `<div class="gbpill">${gbMoney(GB.run.bankroll)}</div>` : right}</div>`;
function gbNextSim() {
  const L = (GBU.slate && GBU.slate.leagues) || [];
  for (let s = 0; s < 3; s++) if (L.some((lg) => lg.rows.some((m) => m.slot === s && !m.done))) return { slot: s, label: GB_SLOTS[s] };
  return { slot: -1, label: "Next week" };
}
function gbNav(cur) {
  const n = gbNextSim(), it = [["slate", "#/gambler/slate", "Slate", "slate"], ["bets", "#/gambler/bets", "My Bets", "bets"]], it2 = [["chirp", "#/gambler/chirp", "Chirp", "chirp"], ["loans", "#/gambler/loans", "Bank", "bank"]];
  const a = ([k, h, tx, ic]) => `<a href="${h}" class="${cur === k ? "on" : ""}">${gbSvg(ic, 22)}${tx}</a>`;
  return `<nav class="gbnav">${it.map(a).join("")}<button class="gbsim" id="gb-navsim" data-slot="${n.slot}"><span>&#9654;</span>${n.slot < 0 ? "Next week" : "Sim " + n.label}</button>${it2.map(a).join("")}</nav>`;
}
function gbPerksHtml(r) {
  const have = {}; for (const p of r.perks || []) have[p.id] = (have[p.id] || 0) + 1;
  const own = Object.keys(have).map((id) => `<div class="gb-lender"><div class="gb-bh"><b>${esc(GB_PERKS[id].name)}${have[id] > 1 ? " x" + have[id] : ""}${id === "insure" ? " (" + gbPerkUses("insure") + " left)" : id === "shield" ? " (" + gbPerkUses("shield") + " left)" : ""}</b></div><div class="gb-sub2">${esc(GB_PERKS[id].text)}</div></div>`).join("");
  return (r.offer && r.offer.length ? gbOfferHtml(r) : "") + `<h3 class="gb-h">Your perks</h3>` + (own || '<div class="empty">No perks yet. Clear a level to pick one.</div>') + (r.bonus ? `<div class="gb-chip bonus">Bonus bets ${gbMoney(r.bonus)}</div>` : "");
}
async function gbViewHome() {
  const r = GB.run;
  if (!r) { location.hash = "#/world"; return; }
  gbSetMode("gambler");
  if (!GBU.slate) await gbLoadSlate();
  await gbEnsureTips();
  const part = (location.hash.replace(/^#\/?/, "").split("/")[1]) || "";
  const tabs = ["slate", "titles", "bets", "loans", "chirp", "shop", "perks", "menu"], tab = tabs.includes(part) ? part : "home";
  GBU.tab = tab === "home" ? "home" : tab;
  const L = GBU.slate.leagues, lg = L.find((x) => x.name === GBU.league);
  const over = (r.bankroll < 5 && !gbOpenBets().length && !gbOpenTitles().length) || r.strikes >= GB_MAX_STRIKES;
  const ended = !GBU.slate.leaguesLeft, idle = !ended && !L.length, offerP = !!(r.offer && r.offer.length);
  document.body.classList.toggle("gb-lt", tab === "chirp"); document.body.classList.toggle("gb-cr", tab === "shop");
  let html = "", theme = "dark";
  if (over) {
    gbRecordRun(r, r.strikes >= GB_MAX_STRIKES ? "three strikes" : "broke");
    html = `<div class="gbbust"><div class="gbh-top"><span>LEVEL ${r.level} &middot; WEEK ${r.t || 0}</span><span>SEED ${esc(String(r.seed))}</span></div>
      <div class="gbbust-t">${r.strikes >= GB_MAX_STRIKES ? "THREE STRIKES" : "BUSTED"}</div>
      <p>${r.strikes >= GB_MAX_STRIKES ? "Three missed quotas. Congratulations! As a thank you for playing, here is <b>10% off your next deposit.*</b>" : "You are out of money and have nothing riding. The house thanks you for your service."}</p><p class="mut">*There is still no deposit. It is a game.</p>
      <div class="gbq dashed"><div class="gbq-h"><span class="lime">BAIT</span><span>RUN CARD &middot; SEED ${esc(String(r.seed))}</span></div>
      <div class="gbstats"><div><b>${r.level}</b><small>level</small></div><div><b>${r.t || 0}</b><small>weeks</small></div><div><b>${gbMoney(r.best || GB_START)}</b><small>best bankroll</small></div></div>
      <div class="gbq-f"><span class="mut">${(r.perks || []).length} perks &middot; ${r.bets.length} bets</span></div></div>
      <button class="pri wide gbbig" id="gb-newrun">Start a new run</button></div>`;
  } else if (tab === "home") {
    html = gbHomeHtml(r);
  } else {
    let body = "", title = "", right, cur = "", extra = "";
    const slateLike = tab === "slate" || tab === "titles";
    if (slateLike && offerP) { body = gbOfferHtml(r); title = "Perks"; cur = ""; }
    else if (tab === "slate" || tab === "titles") {
      title = esc(gbApp().brand) + ((r.app || "bait") === "bait" ? ' <span>Bets</span>' : ""); cur = "slate";
      const sub = `<div class="gbtabs"><a href="#/gambler/slate" class="${tab === "slate" ? "on" : ""}">Matches</a><a href="#/gambler/titles" class="${tab === "titles" ? "on" : ""}">Titles</a><span>Week ${r.week} &middot; Match day</span></div>`;
      if (ended) body = `<div class="card"><h3>Season break</h3><div class="meta">The league season is over. Your level carries on.</div><button class="pri wide" id="gb-next">Start next season</button></div>`;
      else if (idle && tab === "slate") body = `<div class="card"><h3>No league games this week</h3><div class="meta">Cups and international games only.</div><button class="pri wide" id="gb-finish">Finish week</button></div>`;
      else if (tab === "titles") body = await gbTitlesHtml();
      else {
        const chips = L.map((x) => `<button class="gb-lc${x.name === GBU.league ? " on" : ""}" data-gblg="${esc(x.name)}">${esc(x.name)}<small>${x.left} left</small></button>`).join("");
        const rows = lg ? lg.rows.filter((m) => GBU.slot === "all" || m.slot === GBU.slot) : [];
        body = gbSlotBar() + `<div class="gb-leagues">${chips}</div>` + (rows.length ? rows.map(gbMatchHtml).join("") : `<div class="empty">No games in this slot.</div>`);
      }
      extra = `${sub}<div class="gbline">${esc(gbApp().blurb)}${gbLimited() ? " <b>You are limited here: max stake $20 until the heat drops.</b>" : gbApp().max < 1e5 ? " Max stake " + gbMoney(gbApp().max) + "." : ""} &middot; ${gbBillLine(r)} &middot; ${"&#10006;".repeat(r.strikes)}${"&#9675;".repeat(Math.max(0, GB_MAX_STRIKES - r.strikes))}</div>`;
    } else if (tab === "bets") { title = "My Bets"; cur = "bets"; const ob = gbOpenBets().length + gbOpenTitles().length, at = [...gbOpenBets(), ...gbOpenTitles()].reduce((s, b) => s + (b.free ? 0 : b.stake), 0); extra = `<div class="gbline"><b>${ob}</b> open &middot; <b>${gbMoney(at)}</b> riding &middot; sim from the button below</div>`; body = gbBetsHtml(); }
    else if (tab === "loans") { title = "Bank"; cur = "loans"; right = `<div class="gbpill pur">Credit ${r.credit == null ? 720 : r.credit}</div>`; extra = gbQuotaCard(r); body = gbLoansHtml(); }
    else if (tab === "chirp") { theme = "light"; title = "Chirp"; right = `<div class="gbpill ink">You</div>`; body = gbChirpHtml(); }
    else if (tab === "shop") { theme = "cream"; title = "The Hustle Shop"; body = gbShopHtml(); }
    else if (tab === "perks") { title = "Perks"; body = gbPerksHtml(r); }
    else if (tab === "menu") { title = "Settings"; body = gbMenuHtml(); }
    html = gbHead(title, right) + extra + (GBU.msg ? `<div class="gb-msg">${GBU.msg}</div>` : "") + `<div class="gbbody">${body}</div>`
      + ((tab === "slate" && !ended && !idle && !offerP) ? gbSlipHtml() : "") + (cur ? gbNav(cur) : "");
    if (theme === "light") html += `<nav class="gbnav chn"><a href="#/gambler/chirp" class="on">Feed</a><a href="#/gambler/shop">Shop</a><a href="#/gambler/slate">BAIT Bets</a><a href="#/gambler">Home</a></nav>`;
  }
  $("#view").innerHTML = `<div class="gbx ${theme} t-${tab}${GBU.slip.length && tab === "slate" ? " hasslip" : ""}${GBU.tab === "titles" && GBU.tpick ? " hasslip" : ""}">${html}</div>`;
  GBU.msg = "";
  gbWire();
}
