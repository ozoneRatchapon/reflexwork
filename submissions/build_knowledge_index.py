#!/usr/bin/env python3
"""Build a compact knowledge index JSON from the knowledge/*.md files.

Reads frontmatter (title, source_url, faq number, category, approval_status)
+ the body answer, emits submissions/ui/knowledge-index.json for the
in-browser fast-path responder.

By default ONLY entries with `approval_status: "approved"` are included, so
the other team's pending data is never published to a public deploy.

Run:  python3 submissions/build_knowledge_index.py          # approved-only (publish-safe)
      python3 submissions/build_knowledge_index.py --all    # everything (local dev / internal demo)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Two knowledge sources, both scanned:
#  - ui/knowledge/        : other team's data (gitignored, approval gated)
#  - ui/knowledge-public/ : our own, from the official public FAQ (approved)
KN_DIRS = [HERE / "ui" / "knowledge", HERE / "ui" / "knowledge-public"]
OUT = HERE / "ui" / "knowledge-index.json"

FM_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def parse_fm(block: str) -> dict:
    fm = {}
    for line in block.splitlines():
        m = re.match(r'^([a-z_]+):\s*"?(.*?)"?\s*$', line)
        if m:
            fm[m.group(1)] = m.group(2)
    return fm


def main() -> int:
    # Default: publish ONLY entries whose owner has approved them, so the
    # other team's "pending_owner_approval" data never leaks into a public
    # deploy. Pass --all to include everything (local dev / internal demo).
    publish_all = "--all" in sys.argv

    if not any(d.is_dir() for d in KN_DIRS):
        print(f"no knowledge dirs at {[str(d) for d in KN_DIRS]}", file=sys.stderr)
        return 1

    entries = []
    skipped = []
    md_files = []
    for d in KN_DIRS:
        if d.is_dir():
            md_files.extend(sorted(d.glob("*.md")))
    for md in md_files:
        text = md.read_text(encoding="utf-8")
        m = FM_RE.match(text)
        if not m:
            continue
        fm = parse_fm(m.group(1))
        body = m.group(2).strip()

        approval = fm.get("approval_status", "")
        if not publish_all and approval != "approved":
            skipped.append((md.stem, approval or "(no approval_status)"))
            continue

        # Title line (## ...) + the English keyword line + first paragraph.
        title = fm.get("title", md.stem)
        kw_match = re.search(r"คำค้นภาษาอังกฤษ:\s*(.+)", body)
        en_keywords = kw_match.group(1).strip() if kw_match else ""
        # First substantive paragraph = the answer summary.
        paras = [p.strip() for p in body.split("\n\n") if p.strip()]
        answer = ""
        for p in paras:
            if p.startswith("##") or p.startswith("คำค้น"):
                continue
            answer = p
            break

        entries.append({
            "id": md.stem,
            "title": title,
            "category": fm.get("category", ""),
            "keywords": (title + " " + en_keywords).lower(),
            "answer": answer,
            "source_url": fm.get("source_url", ""),
            "faq_number": fm.get("source_faq_number", ""),
            "approval_status": approval,
        })

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    mode = "ALL (dev/demo)" if publish_all else "approved-only (publish-safe)"
    print(f"wrote {len(entries)} entries → {OUT}  [mode: {mode}]")
    if skipped and not publish_all:
        print(f"skipped {len(skipped)} unapproved entr{'y' if len(skipped)==1 else 'ies'}:")
        for sid, status in skipped:
            print(f"  - {sid}  ({status})")
        print("  → set `approval_status: \"approved\"` in each file's frontmatter to publish it,")
        print("    or run with --all for a local/internal build.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
