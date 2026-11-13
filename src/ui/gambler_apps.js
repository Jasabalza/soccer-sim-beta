// BAIT Bets: more places to bet. Each app changes the prices and the rules. The easy app gets suspicious fast; the shady ones do not care.
// Winning too much on an app builds suspicion; at the limit it caps your stake until things cool off.
const GB_APPS = {
  bait:    { name: "BAIT Bets", brand: "BAIT", tag: "Bet Anything, It's Totally fine", mult: () => 1, max: 100000, susAt: 70, blurb: "The normal one. Fair prices (for a casino).", unlock: 1 },
  predict: { name: "Predictr", brand: "Predictr", tag: "Trade the future*  (*it is gambling)", mult: () => 1.06, max: 250, susAt: 140, blurb: "Sharper prices, small stake limit. They call bets 'positions'.", unlock: 2 },
  offshore:{ name: "Isla Verde Sportsbook", brand: "Isla Verde", tag: "Licensed in a country that is a boat", mult: () => 1.12, max: 100000, susAt: 1e9, blurb: "Big odds, no limits, no ban. One win in six is 'under review'.", unlock: 3 },
  wild:    { name: "totally-real-sports.biz", brand: "TOTALLY REAL", tag: "Prices set by vibes", mult: (key) => 0.7 + 0.9 * gbH(key + "|wild"), max: 100000, susAt: 1e9, blurb: "Every game's odds are random between x0.7 and x1.6. Pure chaos.", unlock: 4 },
};
const gbApp = () => GB_APPS[(GB.run && GB.run.app) || "bait"];
const gbAppOpen = (k) => GB.run.level >= GB_APPS[k].unlock;
// price factor for one thing (a game, a title pick) on the current app, with perks
const gbFactor = (key) => (1 + 0.02 * gbPerkCount("vip")) * gbApp().mult(String(GB.run.seed) + "|" + (GBU.slate ? GBU.slate.wk : 0) + "|" + key);
const gbLimited = () => ((GB.run.sus || {})[GB.run.app || "bait"] || 0) >= gbApp().susAt;
const gbMaxStake = () => gbLimited() ? 20 : gbApp().max;
function gbSusWin(b, profit) {
  const r = GB.run, k = b.app || "bait"; r.sus = r.sus || {};
  r.sus[k] = (r.sus[k] || 0) + Math.max(0, profit) / 50;
}
function gbSusDecay(r) { r.sus = r.sus || {}; for (const k of Object.keys(r.sus)) r.sus[k] = Math.max(0, r.sus[k] - 4); }
function gbAppsHtml() {
  const r = GB.run, cur = r.app || "bait";
  return `<div class="gb-apps">${Object.keys(GB_APPS).map((k) => { const A = GB_APPS[k], open = gbAppOpen(k), sus = Math.round((r.sus || {})[k] || 0);
    return `<button class="gb-app${k === cur ? " on" : ""}" ${open ? "" : "disabled"} data-gbapp="${k}"><b>${esc(A.brand)}</b><small>${open ? (A.susAt < 1e8 ? "suspicion " + sus + "/" + A.susAt : "no limits") : "level " + A.unlock}</small></button>`; }).join("")}</div>
    <div class="gb-sub2">${esc(gbApp().blurb)}${gbLimited() ? " <b>You are limited here: max stake $20 until the heat drops.</b>" : gbApp().max < 1e5 ? " Max stake " + gbMoney(gbApp().max) + "." : ""}</div>`;
}
