#!/bin/zsh
# Runs both comparisons and stores the output as the next numbered file in benchmark/compare/results/.
#   benchmark/compare/run_all.sh
# Deterministic except the latency table (fixed seeds, no network, no clock in the quality measurements; the date is only in the header).
set -e
cd "$(dirname "$0")/../.."
python3 -I submissions/build_knowledge_index.py >/dev/null      # the KB index is built, not committed (approved-only, same as CI)
dir=benchmark/compare/results; mkdir -p "$dir"
n=$(printf "%03d" $(( $(ls "$dir" | wc -l | tr -d ' ') + 1 )))
out="$dir/${n}_$(date +%Y-%m-%d).md"
dirty=""; git diff --quiet HEAD -- submissions/ui/chatbot.html submissions/ui/programmes.json tests benchmark crates || dirty=" +UNCOMMITTED CHANGES"
{
  echo "# Benchmark run $n"
  echo
  echo "- date: $(date +%Y-%m-%d) · commit: $(git rev-parse --short HEAD)$dirty · node $(node -v) · $(uname -sm)"
  echo "- reproduce: \`benchmark/compare/run_all.sh\` (quality numbers are fully determined by the commit - seeds are fixed; only the latency table varies by machine)"
  echo
  node benchmark/compare/compare_retrievers.mjs
  echo
  node benchmark/compare/programme_names.mjs
  echo
  echo '## Language and out-of-scope probe (hand-written, tiny sets: a probe, not a benchmark)'
  echo
  node benchmark/compare/decision_rule.mjs
  echo
  node benchmark/compare/latency.mjs 2>/dev/null
} > "$out"
echo "$out"
