// Owner Mode (beta). Plain JS. You are the club OWNER: two wallets (club cash vs your own wealth), a yearly transfer window with six rounds,
// coaches who bring you deals, and pressure from fans, players and the board. All state lives on the world as `w.ow` (a plain object), so a
// save keeps the run. Every hook into the sim is inert when `w.ow` is missing, so normal worlds are unchanged. Money here is in euros (millions).
// Randomness is keyed (a hash of seed + season + player + round + attempt), never a running RNG: reloading a save gives the same answers.
$mods["owner"] = (function () {
  const H = (s) => $crc32($utf8(s)) / 4294967296;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
  const ROUNDS = 6;                       // tunable: the last round is deadline day
  const PATIENCE = 3, COUNTERS = 2;
  const BACK = {
    selfmade: { label: "Self-made", age: 32, wealth: 700, income: 35, rep: 20, blurb: "Built a company young. Little money, lots of time." },
    trust:    { label: "Trust fund", age: 35, wealth: 1200, income: 50, rep: 45, blurb: "The club has been in your family for generations.", inherit: true },
    founder:  { label: "Founder", age: 42, wealth: 2000, income: 70, rep: 40, blurb: "A tech founder with a big exit." },
    fan:      { label: "Local fan", age: 48, wealth: 500, income: 25, rep: 15, blurb: "Made money locally and wants to save the club you grew up with." },
    veteran:  { label: "Veteran", age: 62, wealth: 4000, income: 120, rep: 60, blurb: "A lot of money, not much time." },
  };
  const LIFE = { mansion: { label: "Mansion", cost: 25, status: 2 }, jet: { label: "Private jet", cost: 40, status: 3 }, yacht: { label: "Superyacht", cost: 80, status: 5 } };
  const MEMBER = new Set(["Real Madrid", "Barcelona", "Athletic Club", "Osasuna"]);
  const X = (w) => w.cfg.money_x;
  const club = (w) => (w.ow && w.ow.club ? w.clubs.get(w.ow.club) : null);
  const key = (w, ...a) => w.seed + "|" + w.season + "|" + a.join("|");
  const uidMap = (w) => { w.ensure_uids(); const m = new Map(); for (const p of w.players) m.set(p.uid, p); return m; };
  const find = (w, uid) => { w.ensure_uids(); for (const p of w.players) if (p.uid === uid) return p; return null; };
  const fail = (m, c) => { throw $new($mods.app_v11.ApiError, [m, c === undefined ? 400 : c]); };
  const wageFor = (p) => $mods.sim_core.wage_for(p.ovr, p.age);
  const log = (w, t) => { w.ow.feed.unshift({ season: w.season, t }); if (w.ow.feed.length > 60) w.ow.feed.length = 60; };

  // ---- values --------------------------------------------------------------------------------------------------------------------------
  const fair = (w, p) => w.fee_for(p) * X(w) * (p.contract <= 1 ? 0.6 : 1);           // expiring contracts are cheaper
  const squadOf = (w, n) => w.players.filter((p) => p.club === n);
  const payroll = (w, n) => squadOf(w, n).reduce((a, p) => a + p.wage, 0) * X(w);
  const clubValue = (w, n) => { const c = w.clubs.get(n); return Math.max(0, 2.0 * c.get("income") * X(w) - c.get("debt", 0) * X(w)); };
  const price = (w, n) => Math.round(clubValue(w, n) / 5) * 5;
  const repNeed = (w, n) => clamp(Math.round(w.clubs.get(n).get("stature") - 30), 0, 70);
  const memberOwned = (w, n) => MEMBER.has(n) || w.leagues.get(w.clubs.get(n).get("league")).get("country") === "Germany";
  const rel = (w, n) => (w.ow.rel[n] || 0);
  const relName = (v) => (v > 0.5 ? "Warm" : v < -0.5 ? "Cold" : "Neutral");
  const stature = (w, n) => w.clubs.get(n).get("stature");

  // a coach has three abilities besides prestige (which lifts the team on the pitch): finding players, developing the young, keeping veterans from fading
  function ratings(w, co) {
    const base = 25 + 0.65 * co.prestige, f = (k) => clamp(Math.round(base + 36 * (H(w.seed + "|cr|" + co.name + "|" + co.age + "|" + k) - 0.5)), 5, 99);
    return { scout: f("s"), dev: f("d"), keep: f("k") };
  }
  const coachAsk = (w, co) => { const rt = ratings(w, co); return r2((0.4 + 0.1 * co.prestige + 0.03 * (rt.scout + rt.dev + rt.keep) / 3) * (co.personality === "money" ? 1.15 : 1) * (0.95 + 0.2 * H(w.seed + "|ca|" + co.name + "|" + co.age))); };
  function coachInfo(w) {
    const c = club(w); const co = c ? c.get("coach") : null;
    if (!co) return { name: "No coach", prestige: 0, personality: "", scout: 0, dev: 0, keep: 0 };
    const rt = ratings(w, co); return { name: co.name, prestige: Math.round(co.prestige), personality: co.personality, scout: rt.scout, dev: rt.dev, keep: rt.keep };
  }
  // what the coach says about a player's hidden potential: the better the coach, the smaller the error
  function scoutPot(w, p) {
    const co = coachInfo(w), amp = Math.max(0, (75 - co.scout) / 10);
    return clamp(Math.round(p.pot + (H(w.seed + "|scout|" + p.uid + "|" + co.name) * 2 - 1) * amp), p.ovr, 99);
  }
  function publicRow(w, p) {
    const c = w.clubs.get(p.club); const st = (p.stats && p.stats.length) ? p.stats[p.stats.length - 1] : null;
    const isGrad = !!(c && (c.get("grads", []) || []).includes(p));
    const row = { uid: p.uid, name: p.name, age: p.age, pos: p.pos, ovr: p.ovr, nat: p.nat, club: p.club || "", league: p.league || "", wage: r2(p.wage * X(w)), contract: p.contract,
      value: r1(fair(w, p)), grad: isGrad, last: st ? { g: st[2], a: st[3] } : null, mine: !!(w.ow && p.club === w.ow.club) };
    if (p.age <= 28) row.coach_pot = scoutPot(w, p);                 // only the coach sees potential
    return row;
  }

  // ---- creating a run ------------------------------------------------------------------------------------------------------------------
  function create(w, o) {
    const b = BACK[o.backstory] || BACK.selfmade;
    w.ow = { v: 1, name: String(o.name || "The Owner").slice(0, 30), back: o.backstory in BACK ? o.backstory : "selfmade", mode: o.mode === "sandbox" ? "sandbox" : "classic",
      start_season: w.season, age: b.age, start_age: b.age, wealth: b.wealth, income: b.income, rep: b.rep, club: null, club_since: null, clubs: [], state: "start",
      speed: "month", limit: 0, trust: 60, dec: 0, bankrupt: 0, buyout: null, ladder: 0, board: 60, fans: 55, players: 55, pl_money: 0, pl_perf: 0,
      ledger: [], feed: [], rel: {}, sponsors: [], offers_s: [], life: [], status: 0, injected: 0, dividends: 0, inj_year: {}, div_year: {}, peak: b.wealth, start_wealth: b.wealth,
      win: null, ended: null, titles: [], last_expect: null, debt_years: 0 };
    log(w, "You become an owner: " + b.label + ", age " + b.age + ", " + r1(b.wealth) + "M of your own money.");
    return w.ow;
  }
  function priceList(w) {
    const o = w.ow, rows = [];
    for (const n of w.clubs.keysArr()) {
      const c = w.clubs.get(n), pr = price(w, n), need = repNeed(w, n), mem = memberOwned(w, n);
      const afford = o.wealth * 0.85 >= pr, ok = o.rep >= need;
      rows.push({ club: n, league: c.get("league"), stature: r1(c.get("stature")), income: r1(c.get("income") * X(w)), price: pr, need_rep: need, member: mem,
        status: mem ? "member" : !ok ? "rep" : !afford ? "money" : "open", debt: r1(c.get("debt", 0) * X(w)) });
    }
    rows.sort((a, b) => b.stature - a.stature);
    return rows;
  }
  function buy(w, name) {
    const o = w.ow; if (o.ended) fail("This run is over.", 409); if (o.club) fail("You already own a club.", 409);
    if (!w.clubs.has(name)) fail("unknown club", 404);
    const row = priceList(w).find((r) => r.club === name), inh = BACK[o.back].inherit && o.clubs.length === 0;
    if (row.member && !inh) fail(name + " is member-owned and not for sale.", 403);
    if (inh) { if (!(row.stature >= 40 && row.stature <= 80)) fail("Pick a family club (mid-sized, not a giant).", 403); }
    else {
      if (row.status === "rep") fail("Your reputation (" + Math.round(o.rep) + ") is too low for " + name + " (needs " + row.need_rep + ").", 403);
      if (row.status === "money") fail("You cannot afford " + name + " (price " + row.price + "M, you keep a 15% reserve).", 403);
      o.wealth -= row.price;
    }
    const c = w.clubs.get(name); o.club = name; o.club_since = w.season; o.clubs.push({ club: name, from: w.season, to: null, how: inh ? "inherited" : "bought", paid: inh ? 0 : row.price });
    o.state = "club"; o.board = 60; o.fans = 55; o.players = 55; o.ladder = 0; o.buyout = null; o.declines = 0; o.debt_years = 0; o.trust = 60;
    log(w, (inh ? "You inherit " : "You buy ") + name + (inh ? "." : " for " + row.price + "M."));
    if (o.state === "club" && !o.win) o.win = null;
    return { ok: true };
  }

  // ---- owner money ---------------------------------------------------------------------------------------------------------------------
  function dividend(w, amt) {
    const o = w.ow, c = club(w); amt = Number(amt); if (!c) fail("No club.", 409); if (!(amt > 0)) fail("Enter an amount.");
    const funds = c.get("funds") * X(w), floor = 0.15 * c.get("income") * X(w);
    if (c.get("debt", 0) > 0) fail("The club has debt. It cannot pay dividends.", 409);
    if (funds - amt < floor && o.mode === "classic") fail("Classic mode: the club must keep " + r1(floor) + "M in cash.", 409);
    if (amt > funds) fail("The club does not have that much cash.", 409);
    c.set("funds", c.get("funds") - amt / X(w)); o.wealth += amt; o.dividends += amt; o.div_year[w.season] = (o.div_year[w.season] || 0) + amt;
    log(w, "Dividend: you take " + r1(amt) + "M out of the club."); return { ok: true };
  }
  function inject(w, amt) {
    const o = w.ow, c = club(w); amt = Number(amt); if (!c) fail("No club.", 409); if (!(amt > 0)) fail("Enter an amount.");
    if (amt > o.wealth) fail("You do not have that much.", 409);
    if (o.mode === "classic") {
      const cap = 0.25 * c.get("income") * X(w), used = o.inj_year[w.season] || 0;
      if (used + amt > cap + 1e-9) fail("Classic mode: you can put in at most " + r1(cap) + "M a year (" + r1(cap - used) + "M left).", 409);
    }
    o.wealth -= amt; o.injected += amt; o.inj_year[w.season] = (o.inj_year[w.season] || 0) + amt;
    let cash = c.get("funds") * X(w) + amt, debt = c.get("debt", 0) * X(w);
    if (debt > 0) { const rep = Math.min(debt, cash); debt -= rep; cash -= rep; c.set("debt", debt / X(w)); }
    c.set("funds", cash / X(w)); log(w, "You inject " + r1(amt) + "M into the club."); return { ok: true };
  }
  function lifestyle(w, item) {
    const o = w.ow, L = LIFE[item]; if (!L) fail("unknown item"); if (o.life.includes(item)) fail("You already have that.", 409);
    if (L.cost > o.wealth) fail("You cannot afford it.", 409);
    o.wealth -= L.cost; o.life.push(item); o.status += L.status; log(w, "You buy a " + L.label.toLowerCase() + " (" + L.cost + "M). Fans notice."); return { ok: true };
  }
  function sponsorOffers(w) {
    const o = w.ow, c = club(w); if (!c) return [];
    if (o.offers_s && o.offers_s.season === w.season) return o.offers_s.list;
    const base = c.get("income") * X(w), list = [];
    const names = ["Nova Telecom", "Meridian Air", "Crestline Bank", "Atlas Motors", "Helio Energy", "Tidewater Beer", "Pinecone Games", "Orbit Pay"];
    for (let i = 0; i < 3; i++) {
      const h = H(key(w, "spons", i)), mult = (0.03 + 0.07 * h) * (0.8 + 0.004 * o.fans + 0.004 * o.status * 4), years = 1 + Math.floor(H(key(w, "sy", i)) * 4);
      const nm = names[Math.floor(H(key(w, "sn", i)) * names.length)];
      list.push({ id: i, name: nm, per_year: r1(base * mult), years, kind: i === 2 ? "player" : "cash", note: i === 2 ? "Wants a star: it will help you attract a player (lowers wage demands 8% this window)" : "Cash only" });
    }
    o.offers_s = { season: w.season, list }; return list;
  }
  function takeSponsor(w, id) {
    const o = w.ow; const list = sponsorOffers(w), s = list.find((x) => x.id === Number(id)); if (!s) fail("No such offer.", 404);
    if (o.sponsors.length >= 3) fail("You already have three sponsors.", 409);
    if (o.sponsors.some((x) => x.name === s.name)) fail("Already signed.", 409);
    o.sponsors.push({ name: s.name, per_year: s.per_year, left: s.years, kind: s.kind }); o.offers_s.list = list.filter((x) => x.id !== s.id);
    log(w, "Sponsor signed: " + s.name + ", " + s.per_year + "M a year for " + s.years + " years."); return { ok: true };
  }

  // ---- the transfer window -----------------------------------------------------------------------------------------------------------------
  function openWindow(w) {
    const o = w.ow; if (!o.club) return;
    const reqs = []; const pq = clamp(0.03 + 0.45 * Math.max(0, 48 - o.players) / 48 + (o.fans < 25 ? 0.06 : 0), 0.02, 0.5);
    for (const p of squadOf(w, o.club).sort((x, y) => y.ovr - x.ovr)) if (p.ovr >= 60 && reqs.length < 3 && H(w.seed + "|req|" + w.season + "|" + p.uid) < pq) reqs.push(p.uid);
    o.win = { req: reqs, season: w.season, round: 1, open: true, att: {}, pat: {}, cnt: {}, wars: {}, sale: {}, deals: [], inbox: [], done: [], dealId: 0, rounds: ROUNDS };
    genRound(w);
  }
  const needWin = (w) => { const o = w.ow; if (!o || !o.club) fail("No club.", 409); if (o.reneg && !o.reneg.done) fail("Finish the contract talks first.", 409); if (!o.win || !o.win.open) fail("The transfer window is closed.", 409); return o.win; };
  const deadline = (W) => W.round >= W.rounds;

  // market price a seller wants (euro M) for this owner, this round
  function reservation(w, p, W, attempt) {
    const o = w.ow, me = o.club, seller = p.club, k = key(w, "res", p.uid, W.round, attempt);
    const rivals = Math.floor(H(key(w, "riv", p.uid, W.round)) * (p.ovr >= 78 ? 3 : 2));
    const sizeUp = stature(w, seller) > stature(w, me) + 15 ? 1.08 : 1.0;
    let v = fair(w, p) * (1.05 + 0.25 * H(k)) * (1 + 0.08 * rivals) * sizeUp * [1.1, 1.05, 1.0, 0.97, 0.94][clamp(Math.round(rel(w, seller)) + 2, 0, 4)];
    if (deadline(W)) v *= 0.96;
    return { v, rivals };
  }
  function playerWage(w, p) {
    const o = w.ow, me = o.club; let ask = wageFor(p) * X(w) * (1 + 0.15 * H(w.seed + "|wd|" + p.uid));
    const gap = stature(w, me) - stature(w, p.club);
    ask *= gap < -15 ? 1.15 : gap > 15 ? 0.92 : 1.0;
    if (o.sponsors.some((s) => s.kind === "player")) ask *= 0.92;
    return r2(ask);
  }
  function relShift(w, n, d) { w.ow.rel[n] = clamp((w.ow.rel[n] || 0) + d, -2, 2); }

  function market(w, q) {
    const o = w.ow, W = o.win; w.ensure_uids();
    let rows = w.players.filter((p) => (q.free ? !p.club && p.age >= 17 : p.club && p.club !== o.club));
    if (q.pos) rows = rows.filter((p) => p.pos === q.pos);
    if (q.club) rows = rows.filter((p) => p.club === q.club);
    if (q.grads) rows = rows.filter((p) => { const c = w.clubs.get(p.club); return (c.get("grads", []) || []).includes(p); });
    if (q.expiring) rows = rows.filter((p) => p.contract <= 1);
    if (q.minOvr) rows = rows.filter((p) => p.ovr >= +q.minOvr);
    if (q.maxAge) rows = rows.filter((p) => p.age <= +q.maxAge);
    if (q.q) { const s = String(q.q).toLowerCase(); rows = rows.filter((p) => p.name.toLowerCase().includes(s)); }
    const by = q.sort || "ovr";
    rows.sort((a, b) => (by === "age" ? a.age - b.age : by === "value" ? fair(w, a) - fair(w, b) : b.ovr - a.ovr || (a.name < b.name ? -1 : 1)));
    return rows.slice(0, 60).map((p) => { const r = publicRow(w, p); r.locked = !!(W && (W.pat[p.club + "|" + p.uid] || PATIENCE) <= 0); r.war = !!(W && W.wars[p.uid]); r.rel = relName(rel(w, p.club)); return r; });
  }
  function bid(w, body) {
    const W = needWin(w), o = w.ow, me = o.club; const p = find(w, +body.uid); if (!p || p.club === me) fail("Player not available.", 404);
    if (!p.club) {        // a free agent: no fee, just terms
      const W0 = playerWage(w, p), wg = Number(body.wage), yrs = clamp(Math.round(Number(body.years) || 2), 1, 5);
      if (wg < 0.9 * W0) return { status: "terms", msg: p.name + " wants about " + W0 + "M a year.", need_wage: W0 };
      if (squadOf(w, me).length >= 25) return { status: "full", msg: "Your squad is full (25). Sell or release someone first." };
      p.club = me; p.league = club(w).get("league"); p.wage = wg / X(w); p.contract = yrs; p.prot = 0; p.pref = null;
      W.done.push({ k: "buy", uid: p.uid, name: p.name, club: "free agent", fee: 0, round: W.round }); log(w, "Signed free agent " + p.name + " (" + p.ovr + ")."); return { status: "done", msg: p.name + " joins on a free.", fee: 0 };
    }
    const fee = Number(body.fee), wage = Number(body.wage), years = clamp(Math.round(Number(body.years) || 3), 1, 5);
    if (!(fee > 0)) fail("Enter a fee."); const seller = p.club, pk = seller + "|" + p.uid;
    const pat = W.pat[pk] === undefined ? PATIENCE : W.pat[pk];
    if (pat <= 0) return { status: "locked", msg: seller + " will not talk about " + p.name + " again this window." };
    W.att[p.uid] = (W.att[p.uid] || 0) + 1; const att = W.att[p.uid];
    // an open war: beat the rival's bid and it is done
    const war = W.wars[p.uid];
    const R = reservation(w, p, W, war ? 0 : Math.min(att, 3)), res = Math.max(R.v, war ? war.bid : 0);
    if (war && fee < war.bid) return { status: "war", msg: war.rival + " have bid " + r1(war.bid) + "M. Beat it before the round ends.", need: r1(war.bid) };
    const untouch = stature(w, seller) > stature(w, me) + 10 && squadOf(w, seller).sort((a, b) => b.ovr - a.ovr).indexOf(p) < 3 && H(key(w, "un", p.uid)) < 0.4;
    const q = fee / res;
    if (untouch && fee < 2.2 * fair(w, p)) { W.pat[pk] = pat - 1; relShift(w, seller, -0.1); return { status: "notsale", msg: seller + " say " + p.name + " is not for sale.", patience: W.pat[pk] }; }
    if (q >= 1) {
      const W0 = playerWage(w, p);
      if (wage < 0.9 * W0) return { status: "terms", msg: p.name + " wants about " + W0 + "M a year in wages.", need_wage: W0, fee_ok: true };
      if (!war && !W.wars[p.uid] && H(key(w, "war", p.uid, W.round, att)) < clamp(0.08 + 0.12 * R.rivals + (p.ovr >= 80 ? 0.1 : 0), 0, 0.5) && !deadline(W)) {
        const riv = rivalFor(w, p), b = r1(fee * 1.1);
        if (riv) { W.wars[p.uid] = { rival: riv, bid: b, round: W.round }; return { status: "war", msg: riv + " have jumped in with " + b + "M. Raise your bid before the round ends.", need: b }; }
      }
      return finishBuy(w, p, fee, wage, years, W);
    }
    if (q >= 0.88) {
      W.cnt[p.uid] = (W.cnt[p.uid] || 0) + 1;
      if (W.cnt[p.uid] > COUNTERS) { W.pat[pk] = pat - 1; return { status: "final", msg: seller + " will not move again. Their last price was " + r1(res) + "M.", ask: r1(res), patience: W.pat[pk] }; }
      return { status: "counter", msg: seller + " want " + r1(res) + "M.", ask: r1(res), patience: pat };
    }
    if (q >= 0.65) { W.pat[pk] = pat - 1; relShift(w, seller, -0.05); return { status: "no", msg: seller + " are not interested at that price.", patience: W.pat[pk] }; }
    W.pat[pk] = pat - 2; relShift(w, seller, -0.3);
    return { status: "insulted", msg: seller + " are insulted by that offer.", patience: W.pat[pk] };
  }
  function rivalFor(w, p) {
    const names = w.clubs.keysArr().filter((n) => n !== p.club && n !== w.ow.club && w.clubs.get(n).get("league") === p.league);
    if (!names.length) return null; names.sort((a, b) => stature(w, b) - stature(w, a)); return names[Math.floor(H(key(w, "rv", p.uid)) * Math.min(4, names.length))];
  }
  function finishBuy(w, p, fee, wage, years, W, quiet) {
    const o = w.ow, me = o.club, c = club(w), seller = p.club;
    if (c.get("funds") * X(w) < fee) return { status: "nofunds", msg: "The club only has " + r1(c.get("funds") * X(w)) + "M in cash. Put money in or lower the price.", need: r1(fee) };
    if (squadOf(w, me).length >= 25) return { status: "full", msg: "Your squad is full (25). Sell or release someone first." };
    const e = fee / X(w);
    w._pay(me, seller, e); w._log_transfer(p, seller, me, e, "bid");
    p.club = me; p.league = c.get("league"); p.wage = wage / X(w); p.contract = years; p.prot = 0; p.pref = null;
    relShift(w, seller, 0.25); delete W.wars[p.uid];
    W.done.push({ k: "buy", uid: p.uid, name: p.name, club: seller, fee: r1(fee), round: W.round });
    log(w, "Signed " + p.name + " (" + p.ovr + ") from " + seller + " for " + r1(fee) + "M."); w.news("transfer", me + " sign " + p.name + " (OVR " + p.ovr + ") from " + seller);
    return { status: "done", msg: p.name + " joins for " + r1(fee) + "M.", fee: r1(fee) };
  }
  function release(w, uid) {
    const W = needWin(w), o = w.ow, p = find(w, +uid); if (!p || p.club !== o.club) fail("Not your player.", 404);
    const cost = 0.5 * p.wage * X(w) * p.contract, c = club(w);
    c.set("funds", c.get("funds") - cost / X(w)); p.club = null; p.pref = null; log(w, "Released " + p.name + " (settlement " + r1(cost) + "M).");
    return { ok: true, cost: r1(cost) };
  }

  // ---- selling -------------------------------------------------------------------------------------------------------------------------
  function sellOffers(w, p, W, tries) {
    const o = w.ow, V = fair(w, p), out = [];
    for (const n of w.clubs.keysArr()) {
      if (n === o.club || n === p.club) continue; const c = w.clubs.get(n);
      if (c.get("funds") * X(w) < V * 0.7 || squadOf(w, n).length >= 25) continue;
      const sq = squadOf(w, n).map((x) => x.ovr).sort((a, b) => b - a), floor = sq.length >= 11 ? sq[10] : 0;
      if (p.ovr < floor + 1) continue;
      const h = H(key(w, "sell", p.uid, n, W.round, tries)), want = (p.ovr - floor) + 6 * h;
      out.push({ club: n, fee: r1(Math.min(c.get("funds") * X(w), V * (0.8 + 0.4 * h) * (1 + 0.04 * tries) * ((W.req || []).includes(p.uid) ? 0.92 : 1))), want: want + ((W.req || []).includes(p.uid) ? 2 : 0), round: W.round });
    }
    out.sort((a, b) => b.want - a.want || (a.club < b.club ? -1 : 1)); return out.slice(0, 3).map(({ club, fee, round }) => ({ club, fee, round }));
  }
  function sell(w, uid) {
    const W = needWin(w), o = w.ow, p = find(w, +uid); if (!p || p.club !== o.club) fail("Not your player.", 404);
    const offers = sellOffers(w, p, W, 0);
    W.sale[p.uid] = { offers, tries: 0, name: p.name }; return { offers, msg: offers.length ? "" : "Nobody wants " + p.name + " at the moment." };
  }
  function sellReply(w, body) {
    const W = needWin(w), o = w.ow, p = find(w, +body.uid), S = p && W.sale[p.uid]; if (!S) fail("No offers for him.", 404);
    if (body.action === "ask") {
      if (S.tries >= 2) return { offers: S.offers, msg: "Nobody will pay more." };
      S.tries++; const next = sellOffers(w, p, W, S.tries); S.offers = next.filter((x) => H(key(w, "walk", p.uid, x.club, S.tries)) > 0.3);
      return { offers: S.offers, msg: S.offers.length ? "" : "They all walked away." };
    }
    const off = S.offers.find((x) => x.club === body.club); if (!off) fail("That club has no offer.", 404);
    return doSell(w, p, off, W);
  }
  function doSell(w, p, off, W) {
    const o = w.ow, e = off.fee / X(w), me = o.club;
    if (w.clubs.get(off.club).get("funds") < e) { if (W.sale[p.uid]) W.sale[p.uid].offers = W.sale[p.uid].offers.filter((x) => x.club !== off.club); return { status: "nofunds", msg: off.club + " can no longer afford it." }; }
    w._pay(off.club, me, e); w._log_transfer(p, me, off.club, e, "bid");
    p.club = off.club; p.league = w.clubs.get(off.club).get("league"); p.contract = Math.max(2, p.contract); p.prot = 0; p.pref = null;
    relShift(w, off.club, 0.25); delete W.sale[p.uid]; W.done.push({ k: "sell", uid: p.uid, name: p.name, club: off.club, fee: off.fee, round: W.round });
    log(w, "Sold " + p.name + " (" + p.ovr + ") to " + off.club + " for " + off.fee + "M."); w.news("transfer", off.club + " sign " + p.name + " (OVR " + p.ovr + ") from " + me);
    return { status: "done", msg: p.name + " sold for " + off.fee + "M.", fee: off.fee };
  }

  function persuade(w, b) {
    const W = needWin(w), o = w.ow, p = find(w, +b.uid); if (!p || p.club !== o.club || !(W.req || []).includes(p.uid)) fail("He has not asked to leave.", 404);
    const raise = p.wage * 0.25 * X(w), c = club(w);
    if (b.confirm !== true) return { status: "preview", cost: r2(raise), chance: 50, msg: "A 25% raise (" + r2(raise) + "M a year) gives a 50% chance he stays." };
    p.wage *= 1.25; if (H(key(w, "pers", p.uid, W.round)) < 0.5) { W.req = W.req.filter((u) => u !== p.uid); log(w, p.name + " withdraws his transfer request."); return { status: "stays", msg: p.name + " agrees to stay." }; }
    return { status: "no", msg: p.name + " takes the raise but still wants out." };
  }

  // ---- coach deals ---------------------------------------------------------------------------------------------------------------------
  function genRound(w) {
    const o = w.ow, W = o.win, c = club(w); if (!c) return; const co = coachInfo(w), me = o.club;
    W.inbox = W.inbox.filter((x) => false);
    // offers for your players
    const mine = squadOf(w, me).filter((p) => p.ovr >= 66).sort((a, b) => b.ovr - a.ovr);
    for (let i = 0; i < Math.min(2, mine.length); i++) {
      const p = mine[Math.floor(H(key(w, "in", W.round, i)) * Math.min(8, mine.length))];
      if (!p || W.inbox.some((x) => x.uid === p.uid) || H(key(w, "ino", W.round, i, p.uid)) > 0.45) continue;
      const offs = sellOffers(w, p, W, 0); if (offs.length) W.inbox.push({ uid: p.uid, name: p.name, club: offs[0].club, fee: offs[0].fee, once: false });
    }
    // coach deals (agreed in principle), unrequested bargains for the cheapest talent
    W.deals = W.deals.filter((d) => d.round >= W.round - 1 && d.live);
    if (H(key(w, "cd", W.round)) < clamp(0.3 + 0.006 * co.scout, 0, 0.9)) {
      const xi = squadOf(w, me).map((p) => p.ovr).sort((a, b) => b - a), floor = xi.length >= 11 ? xi[10] : 55;
      const pool = w.players.filter((p) => p.club && p.club !== me && p.age <= 31 && p.ovr >= floor - 1 && p.ovr <= (xi[0] || 70) + 4 && !W.deals.some((d) => d.uid === p.uid) && !W.done.some((d) => d.uid === p.uid));
      pool.sort((a, b) => ((scoutPot(w, b) - b.ovr) * 1.5 + b.ovr - fair(w, b) * 0.1) - ((scoutPot(w, a) - a.ovr) * 1.5 + a.ovr - fair(w, a) * 0.1) || (a.uid - b.uid));
      const p = pool[Math.floor(H(key(w, "cdp", W.round)) * Math.min(12, pool.length))];
      if (p) {
        const disc = 0.75 + 0.15 * (1 - co.scout / 100), bargain = p.contract <= 1;
        W.deals.push({ id: ++W.dealId, uid: p.uid, name: p.name, age: p.age, pos: p.pos, ovr: p.ovr, pot: scoutPot(w, p), club: p.club, fee: r1(fair(w, p) * (bargain ? 1 : disc) * 1.1), wage: r2(playerWage(w, p) * 0.97), years: 3, round: W.round, live: true, tag: bargain ? "Bargain: contract running out" : "Agreed in principle" });
      }
    }
  }
  function dealPreview(w, d, counterFee) {
    const o = w.ow, c = clamp(0.15 + 0.6 * (1 - counterFee / d.fee), 0.05, 0.95), roundsLeft = o.win.rounds - o.win.round;
    return { collapse: counterFee >= d.fee ? 0 : r1(c), trust_loss: 6, relation: "-1 step with " + d.club, rounds_left: roundsLeft };
  }
  function dealAct(w, body) {
    const W = needWin(w), o = w.ow; const d = W.deals.find((x) => x.id === +body.id && x.live); if (!d) fail("That deal is gone.", 404);
    const p = find(w, d.uid); if (!p || !p.club) { d.live = false; fail("The player is no longer available.", 409); }
    if (body.action === "preview") return dealPreview(w, d, Number(body.fee) || d.fee);
    if (body.action === "veto") { d.live = false; o.trust = clamp(o.trust - 1, 0, 100); if (W.round < W.rounds && H(key(w, "back", d.id)) < 0.35) W.deals.push({ ...d, id: ++W.dealId, round: W.round + 1, live: true, tag: "The coach is back with it" }); return { status: "vetoed", msg: "Deal vetoed." }; }
    if (body.action === "approve") { const r = finishBuy(w, p, d.fee, d.wage, d.years, W); if (r.status === "done") { d.live = false; o.trust = clamp(o.trust + 2, 0, 100); } return r; }
    if (body.action === "counter") {
      const f = Number(body.fee); if (!(f > 0)) fail("Enter a fee."); const pv = dealPreview(w, d, f);
      o.trust = clamp(o.trust - 6, 0, 100); relShift(w, d.club, -0.5);
      if (f < d.fee && H(key(w, "cc", d.id, f)) < pv.collapse) { d.live = false; relShift(w, d.club, -0.5); return { status: "collapsed", msg: d.club + " walked away: they thought the price was agreed." }; }
      const r = finishBuy(w, p, Math.min(f, d.fee), d.wage, d.years, W); if (r.status === "done") d.live = false; return r;
    }
    fail("unknown action");
  }
  function inboxAct(w, body) {
    const W = needWin(w), x = W.inbox.find((i) => i.uid === +body.uid); if (!x) fail("That offer is gone.", 404);
    const p = find(w, x.uid); if (!p || p.club !== w.ow.club) { W.inbox = W.inbox.filter((i) => i !== x); fail("He is not yours any more.", 409); }
    if (body.action === "decline") { W.inbox = W.inbox.filter((i) => i !== x); return { status: "declined" }; }
    if (body.action === "counter") {
      if (x.once) return { status: "no", msg: "They will not move again." };
      x.once = true; if (H(key(w, "ic", x.uid, W.round)) < 0.55) { x.fee = r1(x.fee * 1.12); return { status: "counter", msg: x.club + " raise to " + x.fee + "M.", fee: x.fee }; }
      W.inbox = W.inbox.filter((i) => i !== x); return { status: "walked", msg: x.club + " walked away." };
    }
    const r = doSell(w, p, { club: x.club, fee: x.fee }, W); W.inbox = W.inbox.filter((i) => i !== x); return r;
  }
  function autoApprove(w, W) {
    const o = w.ow; if (!(o.limit > 0) || o.trust < 40) return;
    for (const d of W.deals) { if (!d.live || d.fee > o.limit) continue; const p = find(w, d.uid); if (!p || !p.club) continue; const r = finishBuy(w, p, d.fee, d.wage, d.years, W); if (r.status === "done") { d.live = false; log(w, "Auto-approved by your limit: " + d.name + "."); } }
  }
  function nextRound(w) {
    if (w.ow.reneg && !w.ow.reneg.done) return renegRound(w);
    const W = needWin(w), o = w.ow; autoApprove(w, W);
    for (const uid of Object.keys(W.wars)) {                  // unanswered wars: the rival signs him
      const war = W.wars[uid], p = find(w, +uid);
      if (p && p.club && p.club !== o.club && w.clubs.has(war.rival)) {
        const e = war.bid / X(w), seller = p.club;
        if (w.clubs.get(war.rival).get("funds") >= e) { w._pay(war.rival, seller, e); w._log_transfer(p, seller, war.rival, e, "bid"); p.club = war.rival; p.league = w.clubs.get(war.rival).get("league"); log(w, war.rival + " signed " + p.name + " for " + war.bid + "M. You were too slow."); }
      }
      delete W.wars[uid];
    }
    if (W.round >= W.rounds) return closeWindow(w);
    W.round++; genRound(w); return { ok: true, round: W.round, deadline: deadline(W) };
  }
  function closeWindow(w) {
    const o = w.ow, W = o.win; if (!W || !W.open) return { ok: true };
    W.open = false; squadRules(w); return { ok: true, closed: true };
  }
  function squadRules(w) {
    const o = w.ow, me = o.club; if (!me) return;
    // squad rules: at most 25; at least 18 (the cheapest free agents fill the gap)
    let sq = squadOf(w, me).sort((a, b) => a.ovr - b.ovr);
    while (sq.length > 25) { const p = sq.shift(); p.club = null; p.pref = null; log(w, "Squad over 25: " + p.name + " released."); }
    if (sq.length < 18) {
      const fa = w.players.filter((p) => !p.club && p.age >= 17).sort((a, b) => b.ovr - a.ovr || a.uid - b.uid).slice(0, 60);
      let need = 18 - sq.length; const c = club(w);
      for (const p of fa) { if (!need) break; p.club = me; p.league = c.get("league"); p.wage = wageFor(p); p.contract = 2; p.pref = null; need--; log(w, "Free agent " + p.name + " signed to fill the squad."); }
    }
    w.recompute_clubs();
  }


  // ---- contract talks: two weeks before free agency, your expiring players ask for new terms ------------------------------------------------
  function openReneg(w) {
    const o = w.ow, me = o.club, all = squadOf(w, me).sort((a, b) => b.ovr - a.ovr), xs = all.filter((p) => p.contract <= 0), cut = all.length >= 15 ? all[14].ovr : 0;
    if (!xs.length) { o.reneg = null; return openWindow(w); }
    o.reneg = { round: 1, rounds: 2, done: false, list: xs.map((p) => ({ uid: p.uid, name: p.name, age: p.age, pos: p.pos, ovr: p.ovr, now: r2(p.wage * X(w)),
      ask: r2(wageFor(p) * X(w) * (1 + 0.1 * H(w.seed + "|rn|" + p.uid)) * (o.players < 40 ? 1.1 : 1)), years: p.age >= 33 ? 1 : p.age >= 30 ? 2 : 3,
      coach: p.ovr >= cut && p.age <= 34 ? "resign" : "letgo", state: "open", tries: 0, annoyed: 10, out: false })) };
    // some players will not re-sign: the coach could not get a deal, the player just wants to leave. He starts high on the annoyed bar and asks a lot.
    const pOut = clamp(0.06 + 0.4 * Math.max(0, 50 - o.players) / 50 + (o.ladder >= 2 ? 0.1 : 0), 0.04, 0.55);
    for (const x of o.reneg.list) if (H(w.seed + "|rwo|" + w.season + "|" + x.uid) < pOut) { x.out = true; x.coach = "nodeal"; x.annoyed = 70; x.ask = r2(x.ask * 1.35); }
    log(w, "Contract talks: " + xs.length + " players are out of contract. Two weeks before they reach free agency.");
  }
  function renegAct(w, b) {
    const o = w.ow, R = o.reneg; if (!R || R.done) fail("No contract talks now.", 409);
    const x = R.list.find((i) => i.uid === +b.uid && i.state === "open"), p = find(w, +b.uid); if (!x || !p) fail("That talk is closed.", 404);
    const sign = (wage, yrs) => { p.wage = wage / X(w); p.contract = yrs; p.prot = 0; x.state = "signed"; x.wage = r2(wage); log(w, "Re-signed " + p.name + " (" + r2(wage) + "M, " + yrs + " yrs)."); return { status: "signed", msg: p.name + " signs a new deal.", wage: r1(wage) }; };
    const years = clamp(Math.round(Number(b.years) || x.years), 1, 5);
    if (b.action === "walk") { p.club = null; p.pref = null; x.state = "walked"; if (x.coach === "resign") o.trust = clamp(o.trust - 1, 0, 100); log(w, "You let " + p.name + " walk."); return { status: "walked", msg: p.name + " leaves on a free." }; }
    const leave = (msg) => { p.club = null; p.pref = null; x.state = "walked"; log(w, p.name + " leaves: " + msg); return { status: "walked", msg: p.name + " " + msg }; };
    const refuses = () => x.out && H(key(w, "rw", x.uid, x.tries)) < x.annoyed / 130;           // he wants out, whatever you offer
    if (b.action === "approve") {
      if (refuses()) { x.tries++; x.annoyed = Math.min(100, x.annoyed + 20); if (x.annoyed >= 100) return leave("will not stay. He wants to leave the club."); return { status: "no", msg: p.name + " is not interested in staying, whatever the money.", annoyed: x.annoyed }; }
      if (x.coach === "resign") o.trust = clamp(o.trust + 1, 0, 100); return sign(x.ask, x.years);
    }
    if (b.action === "counter") {
      const wage = Number(b.wage); if (!(wage > 0)) fail("Enter a wage.");
      if (x.coach === "resign") o.trust = clamp(o.trust - 3, 0, 100);            // second-guessing the coach's agreed terms
      if (!refuses() && wage >= x.ask * (0.9 + 0.07 * H(key(w, "rg", x.uid, x.tries)))) return sign(wage, years);
      x.tries++; x.annoyed = Math.min(100, x.annoyed + 30);
      if (x.annoyed >= 100) return leave(x.out ? "walks away. He never wanted to stay." : "is insulted and walks away.");
      return { status: "no", msg: p.name + " wants about " + x.ask + "M." + (x.out ? " He is looking for the door." : " One more try."), ask: x.ask, annoyed: x.annoyed };
    }
    fail("unknown action");
  }
  function finishReneg(w, open) {
    const o = w.ow, R = o.reneg; if (!R) return;
    for (const x of R.list) if (x.state === "open") { const p = find(w, x.uid); if (p && p.club === o.club && p.contract <= 0) { p.club = null; p.pref = null; } x.state = "walked"; log(w, x.name + " runs down his contract and leaves."); }
    R.done = true; if (open && o.club) openWindow(w);
  }
  function renegRound(w) { const R = w.ow.reneg; if (R.round < R.rounds) { R.round++; return { ok: true, talks: true, round: R.round }; } finishReneg(w, true); return { ok: true, talks: false, window: true }; }


  // ---- staff: the coach, his abilities, his contract --------------------------------------------------------------------------------------------
  function wageOfCoach(w) { const o = w.ow, c = club(w), co = c ? c.get("coach") : null; if (!co) return 0; if (o.coach_wage === undefined || o.coach_for !== co.name) { o.coach_wage = coachAsk(w, co); o.coach_for = co.name; } return o.coach_wage; }
  function staffView(w) {
    const o = w.ow, c = club(w), co = c ? c.get("coach") : null; w.ensure_coach_ids();
    const row = (x) => ({ id: x.cid, name: x.name, age: x.age, prestige: Math.round(x.prestige), personality: x.personality, ...ratings(w, x), ask: coachAsk(w, x), contract: x.contract, titles: x.titles || 0 });
    const cand = w.coach_pool.filter((x) => x.age <= 66).sort((a, b) => b.prestige - a.prestige || (a.name < b.name ? -1 : 1)).slice(0, 14).map(row);
    return { current: co ? { ...row(co), wage: r2(wageOfCoach(w)), expired: co.contract <= 0 } : null, candidates: cand, annoyed: (o.staffTalk || {}).annoyed || 0 };
  }
  function coachAct(w, b) {
    const o = w.ow, me = o.club, c = club(w); if (!me) fail("No club.", 409); w.ensure_coach_ids(); const co = c.get("coach");
    const sev = co ? r2(0.5 * wageOfCoach(w) * Math.max(1, co.contract)) : 0;
    if (b.action === "renew") {
      if (!co || co.contract > 0) fail("His contract has not run out.", 409); const ask = coachAsk(w, co) * 1.1, T = o.staffTalk || (o.staffTalk = { annoyed: 10 });
      const yrs = clamp(Math.round(Number(b.years) || 3), 1, 5), wage = b.counter ? Number(b.wage) : ask;
      if (!b.counter || wage >= ask * (0.9 + 0.07 * H(key(w, "cr", T.annoyed)))) { co.contract = yrs; o.coach_wage = r2(wage); o.coach_for = co.name; o.staffTalk = null; log(w, "Coach " + co.name + " renews for " + yrs + " years."); return { status: "signed", msg: co.name + " stays." }; }
      T.annoyed += 30; if (T.annoyed >= 100) { w._vacate(me, "left"); o.staffTalk = null; log(w, co.name + " leaves the club."); return { status: "left", msg: co.name + " walks away. You need a new coach." }; }
      return { status: "no", msg: co.name + " wants about " + r2(ask) + "M a year.", ask: r2(ask), annoyed: T.annoyed };
    }
    if (b.action === "fire") { if (!co) fail("No coach.", 409); c.set("funds", c.get("funds") - sev / X(w)); w._vacate(me, "fired"); log(w, "You fire " + co.name + " (severance " + sev + "M)."); return { status: "fired", msg: "Fired. Severance " + sev + "M. Hire a new coach.", cost: sev }; }
    if (b.action === "hire") {
      const cand = w.coach_pool.find((x) => x.cid === +b.id); if (!cand) fail("That coach is not available.", 404);
      const ask = coachAsk(w, cand), wage = Number(b.wage), yrs = clamp(Math.round(Number(b.years) || 3), 1, 5);
      if (wage < ask * 0.92) return { status: "no", msg: cand.name + " wants about " + ask + "M a year.", ask };
      if (co) { c.set("funds", c.get("funds") - sev / X(w)); w._vacate(me, "fired"); log(w, "You replace " + co.name + " (severance " + sev + "M)."); }
      w.coach_pool = w.coach_pool.filter((x) => x !== cand); w._hire(me, cand); cand.contract = yrs; o.coach_wage = r2(wage); o.coach_for = cand.name; o.staffTalk = null;
      log(w, "New coach: " + cand.name + "."); return { status: "hired", msg: cand.name + " takes over." };
    }
    fail("unknown action");
  }
  function beforeRollover(w) { const o = w.ow; if (!o || !o.club) return; o.snap = {}; for (const p of squadOf(w, o.club)) o.snap[p.uid] = p.ovr; }
  function applyStaff(w) {
    const o = w.ow, me = o.club, c = club(w); if (!me || !c.get("coach")) return; const ci = coachInfo(w); let up = 0, kept = 0;
    for (const p of squadOf(w, me)) {
      if (p.age <= 23 && p.ovr < p.pot && H(key(w, "dv", p.uid)) < 0.03 + 0.14 * ci.dev / 100) { p.ovr += 1; up++; }
      else if (p.age >= 29 && o.snap && o.snap[p.uid] !== undefined && p.ovr < o.snap[p.uid] && H(key(w, "kp", p.uid)) < 0.1 + 0.45 * ci.keep / 100) { p.ovr += 1; kept++; }
    }
    o.snap = null; if (up || kept) log(w, "Your coach: " + up + " youngsters improved more than expected, " + kept + " veterans held their level.");
    const wage = wageOfCoach(w); c.set("funds", c.get("funds") - wage / X(w)); o.staff_paid = wage;
  }
  function staffAuto(w) {      // a coach with no contract, or no coach at all, is sorted out for you when you move on
    const o = w.ow, me = o.club, c = club(w); if (!me) return; let co = c.get("coach");
    if (co && co.contract <= 0) coachAct(w, { action: "renew", years: 2 });
    if (!c.get("coach")) { w.ensure_coach_ids(); const best = w.coach_pool.filter((x) => x.age <= 66).sort((a, b) => b.prestige - a.prestige)[0]; if (best) coachAct(w, { action: "hire", id: best.cid, wage: coachAsk(w, best), years: 2 }); }
  }

  // ---- season hook (called at the end of rollover) ---------------------------------------------------------------------------------------
  function deathChance(age) { return clamp((age - 72) / 16, 0, 1) ** 1.2; }
  function afterRollover(w, rec) {
    const o = w.ow; if (!o || o.ended) return; const fin = rec.get("season"); w.ensure_uids();
    o.reqKept = o.win && o.win.req && o.club ? o.win.req.filter((u) => { const q = find(w, u); return q && q.club === o.club; }).length : 0;
    o.age += 1; for (const k of Object.keys(o.rel)) o.rel[k] *= 0.75;
    const c = club(w);
    // personal income swings from year to year
    const swing = 0.4 + 1.4 * H(w.seed + "|inc|" + fin), inc = r1(o.income * swing), upkeep = o.life.reduce((a, k) => a + LIFE[k].cost * 0.05, 0);
    o.wealth += inc - upkeep; let sp = 0, div = 0, injct = 0;
    const row = { season: fin, income: inc, upkeep: r1(upkeep), sponsor: 0, dividends: r1(o.div_year[fin] || 0), injections: r1(o.inj_year[fin] || 0), club: o.club, profit: 0, finish: null };
    if (c) {
      const led = c.get("ledger", []), last = led.length ? led[led.length - 1] : null;
      if (last && last.get_ ? last.get("season") === fin : last && last.season === fin) {
        const get = (k) => (last.get_ ? last.get(k) : last[k]);
        const payout = get("payout") || 0;                                    // the engine pays surplus cash out: an owner decides that himself
        c.set("funds", c.get("funds") + payout); if (last.set) last.set("payout", 0); else last.payout = 0;
        row.profit = r1((get("profit") || 0) * X(w)); row.revenue = r1((get("income") || 0) * X(w));
      }
      for (const s of o.sponsors) { c.set("funds", c.get("funds") + s.per_year / X(w)); sp += s.per_year; s.left--; }
      o.sponsors = o.sponsors.filter((s) => s.left > 0); row.sponsor = r1(sp);
      row.finish = c.get("last_finish", null); row.staff = r2(o.staff_paid || 0);
      pressure(w, rec, c, row);
    }
    o.peak = Math.max(o.peak, o.wealth); row.wealth = r1(o.wealth); row.cash = c ? r1(c.get("funds") * X(w)) : 0; o.ledger.push(row); if (o.ledger.length > 40) o.ledger.shift();
    o.trust += (60 - o.trust) * 0.15;
    // death
    if (H(w.seed + "|death|" + o.age) < deathChance(o.age)) return end(w, "death");
    if (o.club) applyStaff(w);
    if (o.club) openReneg(w);
    sponsorOffers(w);
  }
  function pressure(w, rec, c, row) {
    const o = w.ow, me = o.club, L = w.leagues.get(c.get("league")), size = L.get("clubs").length;
    const exp = w.clubs.keysArr().filter((n) => w.clubs.get(n).get("league") === c.get("league")).sort((a, b) => stature(w, b) - stature(w, a)).indexOf(me) + 1;
    const fin = c.get("last_finish", exp), res = clamp((exp - fin) / Math.max(3, size / 2), -1, 1);
    const champ = rec.get("champs").get(c.get("league")) === me; const RS = rec.get("season");
    if (champ) { o.titles.push({ season: RS, what: c.get("league") }); o.rep = clamp(o.rep + 5, 0, 100); } else if (fin <= 4) o.rep = clamp(o.rep + 1, 0, 100); else o.rep = clamp(o.rep + 0.3, 0, 100);
    const income = c.get("income") * X(w), pay = payroll(w, me), bud = c.get("budget") * X(w), debt = c.get("debt", 0) * X(w);
    const divShare = (o.div_year[RS] || 0) / Math.max(1, income);
    o.fans = clamp(o.fans + (50 - o.fans) * 0.25 + 16 * res + (champ ? 10 : 0) + 0.5 * o.status - 6 * divShare * 10, 0, 100);
    o.pl_perf = clamp(o.pl_perf * 0.5 + 15 * res, -30, 30);
    o.pl_money = clamp((pay / Math.max(1, bud) - 0.5) * 40 - 15 * divShare * 10, -25, 15);
    o.players = clamp(50 + o.pl_perf + o.pl_money - 4 * (o.reqKept || 0), 0, 100);
    const feed = (res > 0 && o.pl_money < 0) ? o.pl_perf : o.pl_perf + o.pl_money;        // winning and only upset about money: the board stays neutral
    const debtPen = clamp(debt / Math.max(1, income) * 40, 0, 30);
    const target = 50 + 38 * res + 0.3 * (o.fans - 50) + 0.4 * feed - debtPen + (champ ? 10 : 0) - (res < 0.25 ? 60 * divShare : 0);
    o.board = clamp(o.board * 0.55 + target * 0.45, 0, 100);
    const off = Math.min(10, o.wealth / 400);                                               // richer owners get more patience
    o.ladder = o.board < 22 - off ? 3 : o.board < 32 - off ? 2 : o.board < 42 - off ? 1 : 0;
    const bad = debt > 0.8 * income; o.debt_years = bad ? o.debt_years + 1 : 0;
    row.board = r1(o.board); row.fans = r1(o.fans); row.players = r1(o.players);
    if (o.debt_years >= 2 || debt > 1.6 * income) { o.bankrupt++; log(w, me + " go into administration. You lose the club."); const lost = me; leave(w, "bankrupt"); o.rep = clamp(o.rep - 30, 0, 100); w.news("collapse", lost + " enter administration"); return; }
    if (o.ladder === 3) {
      o.declines = o.declines || 0; const v = clubValue(w, me), offer = Math.round(v * 0.9 * Math.pow(0.9, o.declines) / 5) * 5;
      o.buyout = { offer, season: RS, counter: false }; log(w, "The board offers to buy you out: " + offer + "M.");
    } else o.buyout = null;
    if (o.ladder === 1) log(w, "The board is concerned."); if (o.ladder === 2) log(w, "The board is putting you under pressure.");
    c.set("fans", c.get("fans") * (1 + 0.001 * (o.fans - 50)));
  }
  function leave(w, how) { const o = w.ow, h = o.clubs[o.clubs.length - 1]; if (h) { h.to = w.season; h.how2 = how; } o.club = null; o.state = "between"; o.win = null; o.buyout = null; o.sponsors = []; o.ladder = 0; }
  function buyoutAct(w, action) {
    const o = w.ow, b = o.buyout; if (!b || !o.club) fail("No offer.", 409);
    if (action === "accept") { o.wealth += b.offer; log(w, "You accept the buyout: " + b.offer + "M."); leave(w, "sold"); return { ok: true, msg: "You sold the club for " + b.offer + "M. You can buy another." }; }
    if (action === "counter") {
      if (b.counter) fail("You can counter once.", 409); b.counter = true;
      if (H(key(w, "bo", o.declines || 0)) < 0.5) { b.offer = Math.round(b.offer * 1.15 / 5) * 5; return { ok: true, msg: "The board agrees to " + b.offer + "M." }; }
      o.board = clamp(o.board - 8, 0, 100); return { ok: true, msg: "The board refused and is angrier." };
    }
    if (action === "refuse") { o.declines = (o.declines || 0) + 1; o.buyout = null; return { ok: true, msg: "You refuse. The next offer will be lower." }; }
    fail("unknown action");
  }
  function end(w, why) {
    const o = w.ow; const years = w.season - o.start_season; o.ended = { why, season: w.season, age: o.age, years, wealth: r1(o.wealth), peak: r1(o.peak), start_wealth: o.start_wealth, injected: r1(o.injected), dividends: r1(o.dividends), titles: o.titles.length, clubs: o.clubs.length, bankrupt: o.bankrupt, rep: Math.round(o.rep) };
    o.state = "ended"; if (o.club) leave(w, why); o.win = null; log(w, why === "death" ? "You die at " + o.age + "." : "You retire."); return o.ended;
  }
  function retire(w) { const o = w.ow; if (o.ended) fail("Already over.", 409); return end(w, "retired"); }

  // ---- views ---------------------------------------------------------------------------------------------------------------------------
  function view(w) {
    const o = w.ow; if (!o) return { active: false };
    const c = club(w), W = o.win, co = coachInfo(w);
    const out = { active: true, state: o.state, name: o.name, back: BACK[o.back].label, mode: o.mode, age: o.age, wealth: r1(o.wealth), income: o.income, rep: Math.round(o.rep), season: w.season,
      injected: r1(o.injected), dividends: r1(o.dividends), speed: o.speed, limit: o.limit, coach_expired: !!(c && c.get("coach") && c.get("coach").contract <= 0), no_coach: !!(c && !c.get("coach")), trust: Math.round(o.trust), life: o.life, status: o.status, feed: o.feed.slice(0, 25), ledger: o.ledger.slice(-15), ended: o.ended,
      titles: o.titles, clubs: o.clubs, coach: co, sponsors: o.sponsors, backstories: Object.entries(BACK).map(([k, v]) => ({ id: k, ...v })), lifestyle: Object.entries(LIFE).map(([k, v]) => ({ id: k, ...v, owned: o.life.includes(k) })) };
    if (c) {
      const inc = c.get("income") * X(w);
      out.club = { name: o.club, league: c.get("league"), cash: r1(c.get("funds") * X(w)), debt: r1(c.get("debt", 0) * X(w)), income: r1(inc), payroll: r1(payroll(w, o.club)), value: price(w, o.club), squad: squadOf(w, o.club).length,
        inj_left: o.mode === "classic" ? r1(Math.max(0, 0.25 * inc - (o.inj_year[w.season] || 0))) : null };
      out.pressure = { fans: Math.round(o.fans), players: Math.round(o.players), board: Math.round(o.board), ladder: o.ladder, ladder_name: ["Calm", "Concern", "Pressure", "Buyout offers"][o.ladder], money_only: o.pl_money < 0 && o.pl_perf > 0 };
      out.buyout = o.buyout;
    }
    if (o.reneg && !o.reneg.done) out.reneg = o.reneg;
    if (W) out.window = { requests: (W.req || []).map((u) => { const p = find(w, u); return p && p.club === o.club ? { uid: u, name: p.name, ovr: p.ovr } : null; }).filter(Boolean), open: W.open, round: W.round, rounds: W.rounds, deadline: deadline(W), deals: W.deals.filter((d) => d.live), inbox: W.inbox, wars: Object.entries(W.wars).map(([u, x]) => ({ uid: +u, name: (find(w, +u) || {}).name, ...x })), done: W.done.slice(-12) };
    return out;
  }
  function squadView(w) {
    const o = w.ow; if (!o.club) return { rows: [] }; w.ensure_uids(); const c = club(w), g = new Set((c.get("grads", []) || []).map((p) => p.uid));
    return { rows: squadOf(w, o.club).sort((a, b) => b.ovr - a.ovr).map((p) => ({ ...publicRow(w, p), grad: g.has(p.uid), req: !!(o.win && (o.win.req || []).includes(p.uid)), sale: !!(o.win && o.win.sale[p.uid]), offers: o.win && o.win.sale[p.uid] ? o.win.sale[p.uid].offers : null })) };
  }
  function setSpeed(w, b) { const o = w.ow; if (b.speed) { if (!["season", "month", "week"].includes(b.speed)) fail("bad speed"); o.speed = b.speed; } if (b.limit !== undefined) o.limit = Math.max(0, Number(b.limit) || 0); return { ok: true }; }
  function afterFlowDone(w) { const o = w.ow; if (!o) return; if (o.club) staffAuto(w); if (o.reneg && !o.reneg.done) finishReneg(w, false); if (o.win && o.win.open) closeWindow(w); squadRules(w); }
  // stays out of the owner's way: the AI market must not buy from, or sell to, the owner's club
  const blocked = (w, ...names) => !!(w && w.ow && w.ow.club && names.includes(w.ow.club));
  return { create, buy, priceList, dividend, inject, lifestyle, sponsorOffers, takeSponsor, market, bid, release, sell, sellReply, dealAct, inboxAct, nextRound, renegAct, persuade, staffView, coachAct, beforeRollover, closeWindow, afterRollover, buyoutAct, retire, view, squadView, setSpeed, afterFlowDone, blocked, BACK, ROUNDS, openWindow };
})();
