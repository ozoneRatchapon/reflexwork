#!/bin/zsh
# Runs both comparisons and stores the output as the next numbered file in benchmark/compare/results/.
#   benchmark/compare/run_all.sh
# Deterministic: fixed seeds, no network, no clock in the measurements (the date is only in the file header).
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
  echo "- reproduce: \`benchmark/compare/run_all.sh\` (numbers below are fully determined by the commit; seeds are fixed)"
  echo
  node benchmark/compare/compare_retrievers.mjs
  echo
  node benchmark/compare/programme_names.mjs
} > "$out"
echo "$out"
