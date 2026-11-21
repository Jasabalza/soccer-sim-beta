# Sim update (beta): team form and goalscorers. Pre-patch notes

Status: built on soccer-sim-beta only. Official repo untouched. Nothing goes to official until Felix approves these notes.

## What changed

1. **Goalscorers on finished matches.** The match page shows a Goalscorers card for every game two teams have played in that competition this season (league matchweeks, cup legs, group games): who scored and the minute. Scores and odds are untouched. The scorers are drawn after the fact with the same seeded draw the competition's goal tables use (`seed|season|cs|cid|key|team`), so a game always shows the same scorers and the per-player totals add up to the top-scorer lists. Minutes use a second seeded draw. Owner Mode's Hub shows the scorers of the last result.
2. **Team form.** A club's form is how its last five league results compare with what its rating said to expect (points won minus expected points), scaled by 1.5 and capped at +-2 rating points. Order independent (a sum), uses only finished matchweeks. It feeds the match sim for league games, cup ties and Club World Cup games, and the win percentages on the match page. National teams have no form in this version. The match page marks a team hot (flame) or cold (snowflake) when its form is +-1 or more, shows "Form +N" on the team card, and says how many win-chance points form moved. Most teams show nothing.
3. **Setting.** "Team form" is a checkbox when making a new world (and in Owner Mode's start card), default on in the UI. The API default is off, so old saves and the API golden are unchanged (640 calls, 0 differing). The choice is stored with the world and survives save and load.
4. **Owner Mode extras in the same push.** Aggregate on cup ties, cup games in All by month, played games in a drop-down, crests, bracket in the cup tab, Hub "Next game" with Play this game and Last result.

## Simulation results (8 seasons, seed 7, every league, 42,960 league games)

| cap | goals/game | home/draw/away % | clear favourite wins | title winners | top 10 clubs hold |
|---|---|---|---|---|---|
| off | 3.102 | 42.3/23.3/34.4 | 52.6% | 59 | 39% |
| 1 | 3.104 | 42.2/23.3/34.5 | 52.6% | 65 | 35% |
| 2 | 3.103 | 42.3/23.2/34.5 | 52.4% | 62 | 36% |
| 3 | 3.104 | 42.3/23.3/34.5 | 52.4% | 64 | 34% |

(Those four runs used a scale of 2.0. The shipped scale is 1.5 with cap 2: 6 seasons, seed 7, goals/game 3.102 both off and on, home/draw/away 42.6/23.0/34.4 off versus 42.6/22.9/34.5 on, clear favourite 53.0% versus 52.7%, 32% of clubs show hot or cold at season end, 3% sit at the cap.)

Cap 2 was chosen: league character is unchanged. A hot club against a cold one at the cap is a 4 point rating gap, about 6 to 7 win-chance points. Felix wanted it small.

## Checks added
- `tools/t_scorers.js`: scorers identical on reopen, goals match scores, per-player totals equal the competition's own goal table (La Liga and the UEFA cup).
- `tools/t_form.js`: form on versus off, goals per game, results split, favourite win rate, title spread.
- Both are in `tools/check_all.sh`; full run passes.

## Known limits
- Scorers come from the current squads, like the top-scorer tables, so a squad change mid-season could change who is credited on an old game.
- Form is league-based, including for cup games. National teams are not covered.
- Scorers cover only the current season's competitions.
