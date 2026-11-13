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


ANSWER_CAP = 1500  # chars; multi-section docs (e.g. registration schedules) are cut at a section boundary


def _content_lines(paragraph: str) -> str:
    """Drop heading lines (#...) and the keyword line; keep the real content lines."""
    keep = [ln for ln in paragraph.splitlines()
            if ln.strip() and not ln.lstrip().startswith("#") and not ln.lstrip().startswith("คำค้น")]
    return "\n".join(keep).strip()


_SKIP_SECTIONS = ("แหล่งอ้างอิง", "หมายเหตุ")  # citations / notes-to-the-bot, not student-facing answers


def _bullets(text: str) -> str:
    return "\n".join(("• " + ln[2:] if ln.startswith("- ") else ln) for ln in text.splitlines())


def extract_answer(body: str) -> str:
    """Answer text shown by the chatbot for one KB file.

    Single-answer docs (all hand-written entries): `## title`, keyword line, one plain
    paragraph -> that first paragraph (unchanged behaviour).
    Multi-section docs (imported registration schedules, directories): content may sit in
    the same paragraph as its `## heading`, as the `คำค้น` line, or in separate paragraphs
    after the heading — all of which used to be dropped or mis-picked (empty / title-only /
    provenance-blurb answers). Attach every content paragraph to the heading before it and
    keep the sections in order up to ANSWER_CAP at a section boundary, so a question about
    late fees is not answered with only section one. Notes addressed to an LLM
    ("หมายเหตุ…") and citation blocks are skipped.
    """
    preamble, sections, cur = [], [], None
    for p in (q.strip() for q in body.split("\n\n")):
        if not p:
            continue
        first = p.splitlines()[0].lstrip()
        if first.startswith("##"):
            cur = [first.lstrip("#").strip(), []]
            sections.append(cur)
            rest = _content_lines("\n".join(p.splitlines()[1:]))
            if rest:
                cur[1].append(rest)
        elif first.startswith("#"):
            cur = None  # document title
        else:
            text = _content_lines(p)
            if text:
                (cur[1] if cur else preamble).append(text)
    usable = [(h, c) for h, c in sections if c and not h.startswith(_SKIP_SECTIONS)]
    if len(usable) < 2:  # single-answer layout
        if usable:
            return usable[0][1][0]
        return preamble[0] if preamble else ""
    out = "\n\n".join(preamble)
    for head, paras in usable:
        block = "▪ " + head + "\n" + _bullets("\n".join(paras))
        cand = (out + "\n\n" + block) if out else block
        if out and len(cand) > ANSWER_CAP:
            break
        out = cand
    return out


def main() -> int:
    # Default: publish ONLY entries whose owner has approved them, so the
    # other team's "pending_owner_approval" data never leaks into a public
    # deploy. Pass --all to include everything (local dev / internal demo).
    publish_all = "--all" in sys.argv
    # Optional: build for ANOTHER organisation from its own folder (see docs/adopt.md). The default (no options) is unchanged.
    #   --knowledge-dir DIR   (repeatable)  replaces the built-in source folders
    #   --out FILE                          where to write the index
    global KN_DIRS, OUT
    args = sys.argv[1:]
    custom = [Path(args[i + 1]) for i, x in enumerate(args) if x == "--knowledge-dir" and i + 1 < len(args)]
    if custom:
        KN_DIRS = custom
    for i, x in enumerate(args):
        if x == "--out" and i + 1 < len(args):
            OUT = Path(args[i + 1])

    if not any(d.is_dir() for d in KN_DIRS):
        print(f"no knowledge dirs at {[str(d) for d in KN_DIRS]}", file=sys.stderr)
        return 1

    entries = []
    skipped = []
    errors = []
    supersedes = {}   # new id -> [old ids]
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

        # Title line (## ...) + the keyword line (คำค้นภาษาอังกฤษ: / คำค้นภาษาไทย: ..., as pack-lint reads it) + first paragraph.
        title = fm.get("title", md.stem)
        kw_match = re.search(r"^\s*คำค้น[^:\n]*:\s*(.+)", body, re.M)
        en_keywords = kw_match.group(1).strip() if kw_match else ""
        answer = extract_answer(body)

        # Applicability scope (only when the source states it): lets the chatbot ask
        # "which year/semester?" instead of silently answering with the wrong one.
        scope = {}
        yr = fm.get("academic_year", "").strip()
        if re.fullmatch(r"25\d{2}", yr):
            scope["academic_year"] = yr
        sem = fm.get("semester", "").strip().replace("ภาคฤดูร้อน", "ฤดูร้อน")
        if sem in ("ภาคต้น", "ภาคปลาย", "ฤดูร้อน"):
            scope["semester"] = sem

        # Versioning (optional, docs/adopt.md): `supersedes: "old_id, other_id"` = this entry replaces those files (they are
        # dropped from the index below, so an old announcement can never be the answer); `valid_from` / `valid_to` (YYYY-MM-DD)
        # = when the source says it applies (the chat labels an answer that is not yet / no longer in force).
        for k in ("valid_from", "valid_to"):
            v = fm.get(k, "").strip()
            if v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
                errors.append(f"{md.name}: {k} must be YYYY-MM-DD (Christian era), got {v!r}")
            elif v:
                scope[k] = v
        if scope.get("valid_from") and scope.get("valid_to") and scope["valid_from"] > scope["valid_to"]:
            errors.append(f"{md.name}: valid_from {scope['valid_from']} is after valid_to {scope['valid_to']}")
        sup = [s.strip() for s in fm.get("supersedes", "").split(",") if s.strip()]
        if sup:
            supersedes[md.stem] = sup

        entries.append({
            "id": md.stem,
            "title": title,
            "category": fm.get("category", ""),
            "keywords": (title + " " + en_keywords).lower(),
            "answer": answer,
            "source_url": fm.get("source_url", ""),
            "faq_number": fm.get("source_faq_number", ""),
            "approval_status": approval,
            **scope,
            # Optional guided steps: frontmatter `steps: "a | b | c"` → array.
            # Rendered as an interactive checklist in the chatbot (no AI).
            **({"steps": [s.strip() for s in fm["steps"].split("|") if s.strip()]}
               if fm.get("steps") else {}),
        })

    # supersedes: every named file must exist (approved or not), no entry may replace itself, no chains that loop
    known = {md.stem for md in md_files}
    for new, olds in supersedes.items():
        for old in olds:
            if old == new:
                errors.append(f"{new}.md: supersedes itself")
            elif old not in known:
                errors.append(f"{new}.md: supersedes {old!r}, but there is no {old}.md")
    def _loops(start: str) -> bool:
        seen, todo = set(), list(supersedes.get(start, []))
        while todo:
            x = todo.pop()
            if x == start:
                return True
            if x not in seen:
                seen.add(x)
                todo.extend(supersedes.get(x, []))
        return False
    errors.extend(f"{n}.md: supersedes chain loops back to itself" for n in supersedes if _loops(n))
    if errors:
        print("knowledge index NOT written:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    # drop replaced entries; the newer one names what it replaces (shown under its answer)
    by_id = {e["id"]: e for e in entries}
    published = {e["id"] for e in entries}
    dropped = []
    for new, olds in supersedes.items():
        if new not in published:
            continue   # an unapproved replacement does not hide the entry that is live today
        for old in olds:
            if old in by_id:
                by_id[new].setdefault("supersedes", []).append({"id": old, "title": by_id[old]["title"]})
                dropped.append((old, new))
    gone = {old for old, _ in dropped}
    entries = [e for e in entries if e["id"] not in gone]

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    mode = "ALL (dev/demo)" if publish_all else "approved-only (publish-safe)"
    print(f"wrote {len(entries)} entries → {OUT}  [mode: {mode}]")
    for old, new in dropped:
        print(f"  replaced: {old} → {new} (supersedes)")
    if skipped and not publish_all:
        print(f"skipped {len(skipped)} unapproved entr{'y' if len(skipped)==1 else 'ies'}:")
        for sid, status in skipped:
            print(f"  - {sid}  ({status})")
        print("  → set `approval_status: \"approved\"` in each file's frontmatter to publish it,")
        print("    or run with --all for a local/internal build.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
