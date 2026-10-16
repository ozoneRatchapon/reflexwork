#!/usr/bin/env bash
# ReflexWork — back up the kernel D1 database (gap_log, entry_conf, kb_draft,
# audit, metrics, feedback_log). Exports to a timestamped .sql kept OUT of git.
#
# Usage:
#   ./backup-d1.sh                # export remote D1 → backups/reflexwork-<date>.sql
#   ./backup-d1.sh --local        # export the local dev D1 instead
#
# Restore (manual, reviewed):
#   npx wrangler d1 execute reflexwork --remote --file backups/<file>.sql
#
# NOTE: the backup contains user feedback + gap samples. gap samples are
# PII-masked at write time, but treat the file as sensitive: never commit it.
set -euo pipefail
cd "$(dirname "$0")/../.."                 # repo root
DB="reflexwork"
OUT_DIR="backups"
mkdir -p "$OUT_DIR"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$OUT_DIR/${DB}-${TS}.sql"

REMOTE="--remote"; [ "${1:-}" = "--local" ] && REMOTE="--local"
echo "→ exporting $DB ($REMOTE) to $OUT"
( cd integrations/kernel-worker && npx wrangler d1 export "$DB" $REMOTE --output "../../$OUT" )
echo "✓ backup written: $OUT"
echo "  (gitignored — do NOT commit; contains user feedback/gap data)"
# keep only the 14 most recent backups
ls -1t "$OUT_DIR"/${DB}-*.sql 2>/dev/null | tail -n +15 | xargs -r rm -f
