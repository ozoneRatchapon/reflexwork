#!/usr/bin/env python3
"""Compare two programmes.json files (the committed one vs a fresh crawl) and say what changed.

    python3 -I submissions/diff_programmes.py OLD.json NEW.json

Prints a markdown summary. Exit code:
    0   no difference an applicant would notice
    10  data changed (status / announcements / fees / plans ...)  -> worth a pull request
    2   the NEW file looks structurally broken (the site's HTML probably changed under the parser) -> do NOT publish

"Broken" is judged by ratios against OLD, not absolute numbers, so a real shrinkage of the offer is not mistaken for a parser failure:
fewer than 300 programmes, or fewer than half of the previous announcements, or fewer than 80 % of the previous announcements that
had plans AND eligibility. A parser that silently returns empty sections is the failure this guards against.
"""
from __future__ import annotations

import json
import sys

FULL = ("แผนการศึกษาที่เปิดรับสมัคร", "คุณสมบัติของผู้มีสิทธิ์สมัคร")
FEE = "ค่าธรรมเนียมการศึกษา"


def load(path: str) -> dict:
    with open(path, encoding="utf8") as f:
        return json.load(f)


def by_code(doc: dict) -> dict[str, dict]:
    return {p["code"]: p for p in doc["programmes"]}


def ann(p: dict) -> dict | None:
    return p.get("announcement")


def full(p: dict) -> bool:
    a = ann(p)
    return bool(a) and all(a.get("sections", {}).get(h) for h in FULL)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 64
    old_doc, new_doc = load(sys.argv[1]), load(sys.argv[2])
    old, new = by_code(old_doc), by_code(new_doc)

    n_old_ann = sum(1 for p in old.values() if ann(p))
    n_new_ann = sum(1 for p in new.values() if ann(p))
    n_old_full = sum(1 for p in old.values() if full(p))
    n_new_full = sum(1 for p in new.values() if full(p))
    broken = []
    if len(new) < 300:
        broken.append(f"only {len(new)} programmes (expected 300+)")
    if n_old_ann and n_new_ann < 0.5 * n_old_ann:
        broken.append(f"announcements fell {n_old_ann} -> {n_new_ann}")
    if n_old_full and n_new_full < 0.8 * n_old_full:
        broken.append(f"announcements with plans+eligibility fell {n_old_full} -> {n_new_full}")
    if broken:
        print("## ❌ The new crawl looks structurally broken - not publishing\n")
        print("\n".join(f"- {b}" for b in broken))
        print("\nThe Graduate School site's HTML has probably changed; fix `submissions/build_programme_catalogue.py` first.")
        return 2

    added, removed = sorted(set(new) - set(old)), sorted(set(old) - set(new))
    appeared = sorted(c for c in new if c in old and ann(new[c]) and not ann(old[c]))
    vanished = sorted(c for c in new if c in old and ann(old[c]) and not ann(new[c]))
    status = [(c, (ann(old[c]) or {}).get("status", ""), (ann(new[c]) or {}).get("status", "")) for c in new if c in old and ann(old[c]) and ann(new[c])]
    status = [(c, a, b) for c, a, b in status if a != b]
    fee = [c for c in new if c in old and ann(old[c]) and ann(new[c]) and old[c]["announcement"].get("sections", {}).get(FEE) != new[c]["announcement"].get("sections", {}).get(FEE)]
    other = [c for c in new if c in old and ann(old[c]) and ann(new[c]) and c not in fee and old[c]["announcement"].get("sections") != new[c]["announcement"].get("sections")]
    changed = bool(added or removed or appeared or vanished or status or fee or other)

    title = lambda c: (new.get(c) or old.get(c))["title"]
    out = [f"## Programme catalogue: {old_doc['fetched_at']} → {new_doc['fetched_at']}\n",
           f"{len(old)} → {len(new)} programmes · announcements {n_old_ann} → {n_new_ann} · open "
           f"{sum(1 for p in old.values() if (ann(p) or {}).get('status') == 'กำลังเปิดรับสมัคร')} → "
           f"{sum(1 for p in new.values() if (ann(p) or {}).get('status') == 'กำลังเปิดรับสมัคร')}\n"]
    if not changed:
        out.append("No change an applicant would notice.")
    for label, items in (("Programmes added", added), ("Programmes removed", removed), ("Announcement appeared", appeared), ("Announcement gone", vanished)):
        if items:
            out.append(f"**{label} ({len(items)})**\n" + "\n".join(f"- `{c}` {title(c)}" for c in items[:30]))
    if status:
        out.append(f"**Status changed ({len(status)})**\n" + "\n".join(f"- `{c}` {title(c)}: {a or '-'} → {b or '-'}" for c, a, b in status[:40]))
    if fee:
        out.append(f"**Fee table changed ({len(fee)})**\n" + "\n".join(f"- `{c}` {title(c)}" for c in fee[:30]))
    if other:
        out.append(f"**Other announcement text changed ({len(other)})** e.g. " + ", ".join(f"`{c}`" for c in other[:12]))
    print("\n\n".join(out))
    return 10 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
