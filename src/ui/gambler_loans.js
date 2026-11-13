// BAIT Bets loans. Money now, time and interest later. Every lender also takes weeks off your clock: bills and the quota deadline
// move closer while the world stands still. Debt is taken off your quota (it counts net), so borrowing buys betting power, never a pass.
const GB_LENDERS = {
  family: { name: "Mom (via Venmo)", cap: 500, rate: 0.05, weeks: 1, due: 8, credit: 0, blurb: "Low rate. Lots of guilt.", def: "A perk goes missing from your life (or a strike, if you have none)." },
  bank:   { name: "First National Bank of Probably", cap: 1000, rate: 0.12, weeks: 2, due: 8, credit: 700, blurb: "Needs a credit score of 700.", def: "Strike, and your credit score drops 100." },
  vinny:  { name: "Vinny", cap: 2500, rate: 0.35, weeks: 3, due: 6, credit: 0, blurb: "No questions. He already knows where you live.", def: "Strike, and half your bankroll 'disappears'." },
  sal:    { name: "Uncle Sal's Friends", cap: 6000, rate: 0.5, weeks: 4, due: 12, credit: 0, blurb: "Do not ask who the friends are.", def: "Two strikes, and the debt follows you, plus 50%." },
};
const gbDebt = (r) => (r.loans || []).reduce((n, l) => n + l.balance, 0);
const gbNet = (r) => Math.round((r.bankroll - gbDebt(r)) * 100) / 100;
function gbBorrow(key, amount) {
  const r = GB.run, L = GB_LENDERS[key], amt = Math.floor(+amount || 0);
  if (amt < 50) { GBU.msg = "Borrow at least $50."; return gbViewHome(); }
  if (amt > L.cap) { GBU.msg = L.name + " lends up to " + gbMoney(L.cap) + "."; return gbViewHome(); }
  if ((r.credit == null ? 720 : r.credit) < L.credit) { GBU.msg = L.name + " wants a credit score of " + L.credit + ". Yours is " + r.credit + "."; return gbViewHome(); }
  if ((r.loans || []).some((l) => l.lender === key)) { GBU.msg = "You already owe " + L.name + "."; return gbViewHome(); }
  r.loans = r.loans || []; r.t = r.t || 0;
  r.loans.push({ id: r.nid++, lender: key, principal: amt, balance: Math.round(amt * (1 + L.rate)), due: r.t + L.weeks + L.due });
  r.bankroll = Math.round((r.bankroll + amt) * 100) / 100;
  const out = [`${L.name} lent you ${gbMoney(amt)}. You owe ${gbMoney(Math.round(amt * (1 + L.rate)))} in ${L.due} weeks.`, `${L.weeks} week${L.weeks > 1 ? "s" : ""} of your clock go with it..`];
  for (let i = 0; i < L.weeks && r.strikes < GB_MAX_STRIKES; i++) out.push(...gbAfterWeek(r));
  GBU.msg = out.join("<br>"); gbPersist().then(() => gbViewHome());
}
function gbRepay(id) {
  const r = GB.run, l = (r.loans || []).find((x) => x.id === id); if (!l) return;
  if (r.bankroll < l.balance) { GBU.msg = "You need " + gbMoney(l.balance) + " to pay that off."; return gbViewHome(); }
  r.bankroll = Math.round((r.bankroll - l.balance) * 100) / 100; r.loans = r.loans.filter((x) => x.id !== id);
  r.credit = Math.min(800, (r.credit == null ? 720 : r.credit) + 10);
  GBU.msg = "Paid off " + GB_LENDERS[l.lender].name + ". Credit score " + r.credit + "."; gbPersist().then(() => gbViewHome());
}
// called every week: collect what is due, and handle defaults
function gbCollect(r, out) {
  const keep = [];
  for (const l of r.loans || []) {
    if (r.t < l.due) { keep.push(l); continue; }
    const L = GB_LENDERS[l.lender];
    if (r.bankroll >= l.balance) { r.bankroll = Math.round((r.bankroll - l.balance) * 100) / 100; r.credit = Math.min(800, (r.credit == null ? 720 : r.credit) + 10); out.push(`${L.name} collected ${gbMoney(l.balance)}.`); continue; }
    out.push(`<b>Default on ${L.name}.</b>`);
    if (l.lender === "family") { const ps = r.perks || []; if (ps.length) { const i = Math.floor(gbH([r.seed, r.t, "mom"].join("|")) * ps.length), lost = ps.splice(i, 1)[0]; out.push("Mom 'borrowed' your " + GB_PERKS[lost.id].name + "."); } else gbStrike(r, out, "Mom is disappointed."); }
    else if (l.lender === "bank") { gbStrike(r, out, "The bank noted it."); r.credit = Math.max(300, (r.credit == null ? 720 : r.credit) - 100); }
    else if (l.lender === "vinny") { gbStrike(r, out, "Vinny stopped by."); r.bankroll = Math.round(r.bankroll * 0.5 * 100) / 100; out.push("Half your bankroll is gone."); }
    else { gbStrike(r, out, "Sal's friends stopped by."); gbStrike(r, out, "They came back."); keep.push({ ...l, balance: Math.round(l.balance * 1.5), due: r.t + 12 }); out.push("The debt follows you: now " + gbMoney(Math.round(l.balance * 1.5)) + "."); }
  }
  r.loans = keep;
}
function gbLoansHtml() {
  const r = GB.run, credit = r.credit == null ? 720 : r.credit, owes = (k) => (r.loans || []).some((l) => l.lender === k);
  const active = (r.loans || []).map((l) => `<div class="gb-bet open"><div class="gb-bh"><b>${esc(GB_LENDERS[l.lender].name)}</b><span class="gb-st">Owe ${gbMoney(l.balance)}</span></div><div class="gb-sub2">Due in ${Math.max(0, l.due - (r.t || 0))} wk (borrowed ${gbMoney(l.principal)})</div><button class="gb-cash" data-gbrepay="${l.id}">Pay it off (${gbMoney(l.balance)})</button></div>`).join("");
  const cards = Object.keys(GB_LENDERS).map((k) => { const L = GB_LENDERS[k], ok = credit >= L.credit && !owes(k);
    return `<div class="gb-lender"><div class="gb-bh"><b>${esc(L.name)}</b><span>${Math.round(L.rate * 100)}%</span></div><div class="gb-sub2">${esc(L.blurb)} Up to ${gbMoney(L.cap)}. Costs ${L.weeks} wk of your clock. Due ${L.due} wk later.</div><div class="gb-sub2">Default: ${esc(L.def)}</div>
      <div class="gb-stake"><span>$</span><input type="number" id="gb-ln-${k}" min="50" max="${L.cap}" value="${Math.min(L.cap, 250)}" ${ok ? "" : "disabled"}><button class="mini pri" data-gbborrow="${k}" ${ok ? "" : "disabled"}>${owes(k) ? "Already owed" : credit < L.credit ? "Credit too low" : "Borrow"}</button></div></div>`; }).join("");
  return `<div class="gb-sub2">Credit score ${credit}. Debt counts against your quota: borrowing buys betting power, not a pass.</div>${active ? "<h3 class='gb-h'>You owe</h3>" + active : ""}<h3 class="gb-h">Lenders</h3>${cards}`;
}
