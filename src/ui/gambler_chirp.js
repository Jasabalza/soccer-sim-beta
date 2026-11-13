// BAIT Bets: Chirp (the feed) and the tip shop. A tip is a claim about a game nobody has played. Accounts have a hidden reliability;
// the only way to learn it is the record next to the name. Paid sources are better, and the price rises with your level.
const GB_ACCTS = {
  dave:  { name: "Dave (your friend)", handle: "@dave_bets_stuff", rho: 0.55, line: "Dave got a tip from a guy. Dave has never met the guy." },
  lock:  { name: "LockMaster99", handle: "@LOCKS_ONLY", rho: 0.36, line: "LOCK OF THE CENTURY. (He said that last week too.)" },
  sally: { name: "Sharp Sally", handle: "@sharp_sally", rho: 0.62, line: "Posts one pick a week and never explains why." },
};
const GB_SHOP = {
  bar:     { name: "The Guy at the Bar", rho: 0.68, price: 30, blurb: "Knows a guy. Speaks quietly. Takes cash." },
  insider: { name: "Reddit Insider", rho: 0.80, price: 100, blurb: "'Trust me bro' with a screenshot." },
  notcheat:{ name: "Definitely Not Cheating", rho: 0.92, price: 350, blurb: "Do not ask. Do not tell Greg." },
};
const GB_NOISE = [
  "Bankrolls don't grow on trees. They grow on parlays. (Terms apply.)", "Congrats on your Bet of the Month! Your reward: a coupon for another bet.", "BREAKING: a man in Riyadh is 'feeling good' about a Tuesday match.",
  "Your friend invited you to bet. You have no friends. We invited them anyway.", "Reminder: the house always wins. Except when it doesn't. It does though.", "New feature: lose faster with One-Tap Rebet(tm).",
  "Sharps hate this one trick. The trick is not betting.", "Gambling is fun! (Please see the 40 pages.)", "Odds boosted! For you! Specifically! (It's a lie.)", "Local man turns $10 into $11, tells everyone.",
];
const gbTipLabel = (t) => gbLegLabel({ market: t.market, pick: t.pick, h: t.h, a: t.a });
const gbRec = (src) => { const r = (GB.run.srcRec || {})[src]; return r ? `${r[0]} of ${r[1]} right` : "no record yet"; };
const gbShopPrice = (k) => Math.round(GB_SHOP[k].price * Math.pow(1.2, GB.run.level - 1) / 5) * 5;
function gbAddTip(src, name, tip) {
  const r = GB.run; r.tips = r.tips || [];
  r.tips.push({ n: r.nid++, src, name, week: tip.week, id: tip.id, h: tip.h, a: tip.a, league: tip.league, market: tip.market, pick: tip.pick, status: "open", wk: GBU.slate.wk });
  if (r.tips.length > 40) r.tips.splice(0, r.tips.length - 40);
}
// once per world week: each free account posts one tip, and the feed gets a couple of ads
async function gbEnsureTips() {
  const r = GB.run, wk = GBU.slate && GBU.slate.wk; if (wk == null || r.tipWeek === wk || !GBU.slate.leagues.length) return;
  r.tipWeek = wk; r.srcRec = r.srcRec || {};
  for (const [k, A] of Object.entries(GB_ACCTS)) { try { const t = await api("/api/gb_tip", { src: k, rho: A.rho, salt: "free" }); if (!t.none) gbAddTip(k, A.name, t); } catch (e) { /* skip this one */ } }
  r.noise = [0, 1].map((i) => GB_NOISE[Math.floor(gbH([r.seed, wk, "noise", i].join("|")) * GB_NOISE.length)]);
}
async function gbBuyTip(k) {
  const r = GB.run, S = GB_SHOP[k], price = gbShopPrice(k);
  if (r.bankroll < price) { GBU.msg = "You need " + gbMoney(price) + "."; return gbViewHome(); }
  r.tipSalt = (r.tipSalt || 0) + 1;
  let t; try { t = await api("/api/gb_tip", { src: k, rho: S.rho, salt: "buy" + r.tipSalt }); } catch (e) { toast(e.message); return; }
  if (t.none) { GBU.msg = "No open games to tip on right now."; return gbViewHome(); }
  r.bankroll = Math.round((r.bankroll - price) * 100) / 100; gbAddTip(k, S.name, t); r.tips[r.tips.length - 1].paid = price;
  GBU.msg = S.name + " sold you a tip for " + gbMoney(price) + ". No refunds."; await gbPersist(); gbViewHome();
}
// mark tips right or wrong once their game is played (works for weeks that have already rolled over)
async function gbResolveTips() {
  const r = GB.run, open = (r.tips || []).filter((t) => t.status === "open"); if (!open.length) return;
  const res = await api("/api/gb_settle", { bets: open.map((t) => ({ id: t.n, stake: 0, legs: [{ league: t.league, week: t.week, h: t.h, a: t.a, market: t.market, pick: t.pick, odds: 1 }] })) });
  r.srcRec = r.srcRec || {};
  for (const x of res.bets) { if (x.status === "open") continue; const t = r.tips.find((y) => y.n === x.id); t.status = x.status === "won" ? "hit" : "miss"; const rec = r.srcRec[t.src] || [0, 0]; rec[1]++; if (x.status === "won") rec[0]++; r.srcRec[t.src] = rec; }
}
const GB_AV = ["#FFD166", "#9BE7C4", "#F4A6C0", "#A5C8FF", "#D9C2FF"];
const gbInit = (s) => String(s).replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
function gbChirpHtml() {
  const r = GB.run, tips = (r.tips || []).slice().reverse();
  const post = (name, handle, badge, text, note, action, i, cls) => `<div class="ch-p ${cls || ""}"><span class="ch-av" style="background:${GB_AV[i % GB_AV.length]}">${esc(gbInit(name))}</span><div class="ch-b"><div class="ch-n"><b>${esc(name)}</b><span>${esc(handle)}</span>${badge ? `<em>${esc(badge)}</em>` : ""}</div><div class="ch-t">${text}</div>${note ? `<div class="ch-note">${esc(note)}</div>` : ""}${action || ""}</div></div>`;
  const feed = tips.map((t, i) => {
    const lg = GBU.slate.leagues.find((x) => x.name === t.league), m = lg && lg.rows.find((x) => x.id === t.id), live = m && !m.done && t.status === "open";
    return post(t.name, GB_ACCTS[t.src] ? GB_ACCTS[t.src].handle : "@paid_tip", t.status === "hit" ? "HIT" : t.status === "miss" ? "MISSED" : t.paid ? "PAID " + gbMoney(t.paid) : "", `<b>${esc(gbTipLabel(t))}</b> in ${esc(t.h)} v ${esc(t.a)} <i>(${esc(t.league)})</i>`, gbRec(t.src), live ? `<button class="ch-act" data-gbtipbet="${t.n}">Add to slip</button>` : "", i, t.status);
  }).join("");
  const noise = (r.noise || []).map((n, i) => post("BAIT Bets", "@bait_bets", "AD", esc(n), "Sponsored", "", i + 2, "ad")).join("");
  return `<div class="ch-tabs"><span class="on">For You</span><a href="#/gambler/shop">Tips</a><span>Following</span></div>${noise}${feed || '<div class="ch-empty">No posts yet.</div>'}<div class="ch-foot">Free accounts post once a week. Nobody tells you who is any good.</div>`;
}
function gbShopHtml() {
  const marks = { bar: ["#FDE68A", "BAR"], insider: ["#BAE6FD", "r/"], notcheat: ["#FBCFE8", "???"] };
  return `<div class="sh-sale"><span><b>FLASH SALE: 40% OFF TIPS</b><small>Ends in 59:59. Resets at 59:59.</small></span><em>LIMITED*</em></div>
    <div class="sh-grid">${Object.keys(GB_SHOP).map((k) => `<div class="sh-it"><div class="sh-m" style="background:${marks[k][0]}"><b>${marks[k][1]}</b><em>TIP</em></div><div class="sh-n">${esc(GB_SHOP[k].name)}</div><div class="sh-d">${esc(GB_SHOP[k].blurb)} Record: ${esc(gbRec(k))}.</div><div class="sh-pr"><b>${gbMoney(gbShopPrice(k))}</b><button data-gbbuy="${k}">Buy</button></div></div>`).join("")}</div>
    <div class="sh-foot">All sales final. Results not guaranteed. "Guaranteed" is a type of word.</div>`;
}
