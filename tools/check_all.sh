#!/bin/bash
# Run after any engine change. Intentional behaviour changes need new golden files (tools/make_golden.sh).
cd "$(dirname "$0")/.." && node tools/build.js >/dev/null || exit 1
T=${TMPDIR:-/tmp}; fail=0
for a in "1 5" "2 9" "3 12"; do set -- $a
  node tools/dump_js.js $1 $2 > $T/js_s$1.json 2>/dev/null; zcat golden/state_s$1.json.gz > $T/gold_s$1.json
  r=$(python3 tools/cmp.py $T/gold_s$1.json $T/js_s$1.json | tail -1); echo "state seed $1: $r"; [[ "$r" == *IDENTICAL* ]] || fail=1
done
node tools/api_js_run.js $T/api_js.json >/dev/null 2>&1; zcat golden/api_crawl.json.gz > $T/api_gold.json
r=$(python3 golden/api_cmp.py $T/api_gold.json $T/api_js.json | tail -1); echo "api: $r"; [[ "$r" == *"differing 0"* ]] || fail=1
echo "order independence:"; node tools/t_order.js > $T/order.txt; sed 's/^/  /' $T/order.txt; grep -q DIFFERENT $T/order.txt && fail=1
echo "tournament single games, any order:"; node tools/t_order2.js 1,2 5 > $T/order2.txt; sed 's/^/  /' $T/order2.txt; grep -q DIFFERENT $T/order2.txt && fail=1
node tools/t_games_api.js > $T/games_api.txt 2>&1; tail -1 $T/games_api.txt | sed 's/^/  games api: /'; grep -q "ALL OK" $T/games_api.txt || fail=1
echo "v15 modules:"
for t in t_finance t_cwc t_fed t_rivals_v15 t_market_v15 t_flow t_groups t_pages_v152 t_cwc_migrate t_hof t_hof_api t_moves; do node tools/$t.js > $T/$t.txt 2>&1; r=$(tail -1 $T/$t.txt); echo "  $t: $r"; grep -qi "fail\|error\|ERR " $T/$t.txt && fail=1; done
echo "owner mode:"; node tools/t_owner.js 8 7 selfmade > $T/owner.txt 2>&1; echo "  t_owner: $(tail -1 $T/owner.txt)"; grep -q "OWNER OK" $T/owner.txt || fail=1
echo "sim update (goalscorers, form):"; node tools/t_scorers.js > $T/scorers.txt 2>&1; echo "  t_scorers: $(tail -1 $T/scorers.txt)"; grep -q "SCORERS OK" $T/scorers.txt || fail=1
node tools/t_form.js 2 3 0,2 > $T/form.txt 2>&1; echo "  t_form: $(tail -1 $T/form.txt | cut -c1-120)"; [ "$(grep -c "^cap" $T/form.txt)" = 2 ] || fail=1
if [ -n "$OLD_BUNDLE" ]; then node tools/t_migrate_v15.js "$OLD_BUNDLE" > $T/mig.txt 2>&1; echo "  old save migration: $(tail -1 $T/mig.txt)"; grep -q "ALL OK" $T/mig.txt || fail=1; fi
node tools/t_owner_cwc.js 7 > $T/cwco.txt 2>&1; echo "  t_owner_cwc: $(tail -1 $T/cwco.txt)"; grep -q "CWC OWNER OK" $T/cwco.txt || fail=1
node tools/t_apex.js 7 3 > $T/apex.txt 2>&1; echo "  t_apex: $(tail -1 $T/apex.txt)"; grep -q "APEX OK" $T/apex.txt || fail=1
[ $fail = 0 ] && echo "ALL CHECKS PASSED" || echo "CHECKS FAILED"
