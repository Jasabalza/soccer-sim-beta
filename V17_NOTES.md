# v17 beta: BAIT Bets (gambler mode)

Branch `gambler`. Pick Sim or Gambler on the start screen; each has its own saves (gambler saves are named `gb_...`, the run record lives beside them).

## How a run works
Start with $1,000 and a starting perk pick. Bet on each week's slate (Morning/Midday/Night slots). Every 4 weeks a bill is due; every 8 weeks the level's quota is checked (net of debt). Clear it for a perk and a higher quota; miss it and take a strike. Three strikes ends the run. Endless.

## Built
Slate and slip (1X2, over/under 2.5, both teams score, parlays), props (anytime scorer = same draw as the scorer table; half-time, corners, cards generated), sim by slot or by single game, cash-out (locked while a slot is mid-reveal), title bets (season Monte Carlo), loans (Mom, bank, Vinny, Uncle Sal), 9 perks, Chirp feed and tip shop (hidden reliability), 4 apps (BAIT Bets, Predictr, Isla Verde, totally-real-sports.biz) with stake limits and suspicion, momentum (hot/cold teams, opt-in per world), run history.

## Engine changes
- `src/engine/gambler.js` (new, read-only except `play_fixture`): slate, pricing, settlement, props, titles, tips, momentum.
- `comps.js`: `LeagueComp.fx_eff()` (momentum hook, off unless `w.gb_mom`). Sim goldens unchanged.
- `shim_web.js`: `kv` records, gambler API routes. `build.js`: scripts and `SIM.kv`.
- Tests: `node tools/t_gambler.js` (rules, settlement, scorer draw equals comp_stats, title chances, tips, momentum order independence). `bash tools/check_all.sh` still passes.

## Known gaps
Cup and continental markets, Dave's pick on the slate, more perk variety, balance tuning (only weak bots so far), Parlay Insurance / Strike Shield not yet exercised in real play, bust screen is plain, phone layout of the tab row is tight.
