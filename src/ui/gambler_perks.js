// BAIT Bets perks: what you pick when you clear a level. Each one bends one rule a little; a run is the pile of them you end up with.
// Small, stackable, and a bit insulting about it, like the real "loyalty rewards".
const GB_PERKS = {
  vip:      { name: "VIP Rewards Tier", text: "All odds +2%.", flavor: "You are now a Valued Customer. It costs you nothing, which is what they think of you." },
  boost:    { name: "Profit Boost Token", text: "+10% on every winning payout's profit.", flavor: "Valid on bets you were going to win anyway." },
  sponsor:  { name: "Sponsorship Deal", text: "+$40 every week.", flavor: "Brought to you by Vinny's Gutter Cleaning. Your face is on a van." },
  landlord: { name: "Landlord's Nephew", text: "Bills cost 25% less.", flavor: "He 'handles the rent now'. Do not ask." },
  insure:   { name: "Parlay Insurance", text: "A 3+ leg parlay that loses by exactly one leg gets its stake back (2 uses).", flavor: "Terms and conditions apply. They are 40 pages long." },
  shield:   { name: "Strike Shield", text: "Ignore your next strike.", flavor: "A man named Greg made a phone call." },
  freebet:  { name: "Free Bet Bundle", text: "+$100 in bonus bets (stake not returned, winnings are yours).", flavor: "Free money! You only need to wager it 40 times." },
  socks:    { name: "Lucky Socks", text: "Parlays pay x1.10.", flavor: "Unwashed since the cup final. Do not wash." },
  signing:  { name: "Signing Bonus", text: "+$300 right now.", flavor: "For joining the thing you already joined." },
};
const GB_PERK_IDS = Object.keys(GB_PERKS);
const gbPerkCount = (id) => (GB.run.perks || []).filter((p) => p.id === id).length;
const gbPerkUses = (id) => (GB.run.perks || []).filter((p) => p.id === id).reduce((n, p) => n + (p.uses || 0), 0);
function gbH(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
// three offers, chosen by a keyed hash so the same run and level always offer the same three
function gbOfferFor(r) { return GB_PERK_IDS.map((id) => [gbH([r.seed, r.level, id, "perk"].join("|")), id]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]); }
function gbGivePerk(r, id) {
  r.perks = r.perks || [];
  const p = { id, uses: id === "insure" ? 2 : id === "shield" ? 1 : 0 };
  if (id === "signing") r.bankroll = Math.round((r.bankroll + 300) * 100) / 100;
  else if (id === "freebet") r.bonus = (r.bonus || 0) + 100;
  else r.perks.push(p);
  r.offer = null;
}
const gbAdj = (o, key) => Math.max(1.05, Math.round(o * gbFactor(key || "") * 100) / 100);
const gbBill = (r) => Math.round(gbBillFor(r.level) * Math.max(0.25, 1 - 0.25 * gbPerkCount("landlord")));
// combined odds of a list of legs (same-match legs worth less, socks help parlays)
function gbCombo(legs) {
  let m = legs.reduce((x, l, i) => x * l.odds * (legs.slice(0, i).some((y) => y.id === l.id) ? 0.85 : 1), 1);
  if (legs.length > 1) m *= Math.pow(1.1, gbPerkCount("socks"));
  return Math.round(m * 100) / 100;
}
// what a winning bet pays in total (boost tokens add to the profit; a free bet never returns its stake)
function gbPayout(stake, odds, free) {
  const profit = stake * odds - stake, b = 1 + 0.1 * gbPerkCount("boost");
  return Math.round((free ? profit * b : stake + profit * b) * 100) / 100;
}
// a strike lands, unless the shield takes it
function gbStrike(r, out, why) {
  const sh = (r.perks || []).find((p) => p.id === "shield" && p.uses > 0);
  if (sh) { sh.uses--; out.push(why + " Strike Shield took the hit."); return; }
  r.strikes++; out.push(why + " Strike " + r.strikes + " of " + GB_MAX_STRIKES + ".");
}
function gbOfferHtml(r) {
  return `<div class="card gb-offer"><h3>${r.level > 1 ? "Level cleared. " : "Welcome to BAIT Bets. "}Pick a perk.</h3><div class="meta">Three offers, no refunds.</div>
    ${r.offer.map((id) => `<button class="gb-perk" data-gbperk="${id}"><b>${esc(GB_PERKS[id].name)}</b><span>${esc(GB_PERKS[id].text)}</span><i>${esc(GB_PERKS[id].flavor)}</i></button>`).join("")}</div>`;
}
function gbPerksStrip(r) {
  const have = {}; for (const p of r.perks || []) have[p.id] = (have[p.id] || 0) + 1;
  const chips = Object.keys(have).map((id) => `<span class="gb-chip" title="${esc(GB_PERKS[id].text)}">${esc(GB_PERKS[id].name)}${have[id] > 1 ? " x" + have[id] : ""}${id === "insure" ? " (" + gbPerkUses("insure") + ")" : id === "shield" ? " (" + gbPerkUses("shield") + ")" : ""}</span>`).join("");
  return (chips || r.bonus) ? `<div class="gb-perks">${r.bonus ? `<span class="gb-chip bonus">Bonus bets ${gbMoney(r.bonus)}</span>` : ""}${chips}</div>` : "";
}
