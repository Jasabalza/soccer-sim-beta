# Owner Mode (beta) - pre-patch notes

Beta only. Official v16.2.0 is untouched. Normal worlds are byte-identical to before (golden state, API crawl and every module test pass).

## What it is
Start an owner run from New game (Owner mode card). You are the club owner, not the manager. You buy or inherit a club, run a yearly transfer window, hire and negotiate with the coach, and answer to the board. The run ends when you die, retire, or cannot buy again.

## Rules in v1
- Backstories: Self-made 32, Trust fund 35 (inherits a family club), Founder 42, Local fan 48, Veteran 62. Age is the difficulty. Death risk starts at 72.
- Two wallets: club cash and your own money. Dividends take money out, injections put it in (Classic caps injections at 25% of club income per year, Sandbox has no caps). Your personal income swings each year. Lifestyle purchases cost money and raise status.
- Buying: price is about 2x club income minus debt, you keep a 15% reserve, bigger clubs need more reputation, member-owned clubs (German clubs, Real Madrid, Barcelona, Athletic, Osasuna) are not for sale.
- Off-season order: awards, graduates, then (owner) two weeks of contract talks, then a six-round transfer window (last round is deadline day).
- Contract talks: the coach marks expiring players re-sign, let walk, or no deal (the player wants out: high on the annoyed bar, steep ask). Approve, counter, or let walk. Unresolved players reach free agency.
- Window: buy or sell any player. Clubs accept, counter, refuse or are insulted; each club has patience per player and locks you out at zero; club relationship is Warm/Neutral/Cold and persists. Rivals can start a bidding war. Coach deals arrive "agreed in principle": approve, veto, or counter (hurts coach trust and the other club, can collapse the deal; the chance is shown first). Optional spending limit for hands-off approvals. Players can ask to leave; sell them (a bit cheaper) or talk them round.
- Graduates: your academy graduates stay unless you sell or release them; you can also buy other clubs' graduates (market filter).
- Staff: coaches have Finds players, Develops youth, Keeps veterans. Scouting drives potential reads and deal quality, development lifts under-24s, keeping slows fades. Renew, counter, fire (severance) or hire.
- Pressure: fans, players, board. Board is the strongest. Players upset only about money while winning leave the board neutral. Ladder: Concern, Pressure, Buyout offers (each refusal makes the next worse), administration if debt stays too high. Richer owners get more patience. After a buyout or administration you can buy again (administration costs reputation).
- Speed: play a week, a month or a season at a time.

## Engine touches (all inert without an owner)
sim_core: owner hook at the end of rollover, snapshot before rollover, owner club's expiring contracts and coach are left for the owner. market.allow and bids.run skip the owner club. app_v11: /api/ow_* routes, status adds owner:true only for owner worlds. New files: src/engine/owner.js, src/ui/owner_ui.js, tools/t_owner.js, tools/t_owner_world.js.

## Tests
t_owner (bot run) is in check_all. Bot runs of 40 seasons: normal owner, milking owner, accept-buyout-and-rebuy owner. Same-seed 30-season comparison: league strength difference between a plain world and an owner world (0.79 avg) is within the difference between two plain seeds (0.82).

## Not in v1 / next
Goalscorers on finished matches and the hot/cold form indicator (separate sim update). In-season events for the owner. Attract-player sponsor effects beyond a wage discount. Staff beyond the head coach. A tuning pass on money and buyout numbers.
