# v16.2 beta notes (soccer-sim-beta)

Beta repo: Jasabalza/soccer-sim-beta (live game soccer-sim v16.1.4 stays untouched). Storage is isolated from the live game.
Build: `node tools/build.js --site` -> docs/. Tests: `bash tools/check_all.sh` (~6 min; goldens seeds 1-3, api 640 calls 0 diff).

## What changed
- Season flow: season -> summer -> awards -> Hall of Fame -> Graduates -> Moves -> next season. Graduates now come BEFORE Moves (engine: season_end = _make_youth; poach; xleague_market; $mods.bids.run; a_flow order in app_v11.js). Goldens re-recorded once with tools/make_golden.sh.
- Scores page: Leagues | Competitions switch; competition and nation cards with sim a week / sim to the end; leagues as chips. Fixtures use .fx3 with Preview links.
- Favorites (w.favs, fav_nations, fav_clubs, hof_seen) mirrored in localStorage `ssb_favmem`; no picker on every load. League hero hue from LHUE table.
- World Cup: generated rotating host banner (wclogo.js, emblems.js hostFor/wcBanner, fixed 18-nation rotation).
- Logo pack: {"format":"soccersim-logos","version":2,"mime":"image/webp", clubs/nations/leagues/comps, yearSlots}. Values are data:image/webp;base64,... ; import merges. Combined pack = 304 clubs, 107 nations, 15 leagues, 12 comps. See docs/LOGOS.md.

## Known gaps
- No logos for Russia, Guinea, New Caledonia, Scottish Premiership, World Cup, OFC Nations Cup, CONMEBOL/CAF/AFC/OFC Nations League (generated emblems used).
- Players table pages, News/Moves/Hall headers not pixel-matched to mockups b00-b25.
- Nation cards sim every national-team competition in the confederation (no per-nation sim).
- tools/t_flow_ui.js is stale for the v16.2 layout.

## Phone tests pending
Hall of Fame flow, Rest of season stopping at summer, Graduates->Moves order, Scores switch, favorites memory (pick once in beta), importing the combined logo pack.
