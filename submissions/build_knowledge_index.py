#!/usr/bin/env python3
"""Build a compact knowledge index JSON from the knowledge/*.md files.

Reads frontmatter (title, source_url, faq number, category) + the body answer,
emits submissions/ui/knowledge-index.json for the in-browser fast-path responder.

Run:  python3 submissions/build_knowledge_index.py
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KN_DIR = HERE / "ui" / "knowledge"
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
    if not KN_DIR.is_dir():
        print(f"no knowledge dir at {KN_DIR}", file=sys.stderr)
        return 1

    entries = []
    for md in sorted(KN_DIR.glob("*.md")):
        text = md.read_text(encoding="utf-8")
        m = FM_RE.match(text)
        if not m:
            continue
        fm = parse_fm(m.group(1))
        body = m.group(2).strip()

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
            "approval_status": fm.get("approval_status", ""),
        })

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"wrote {len(entries)} entries → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
