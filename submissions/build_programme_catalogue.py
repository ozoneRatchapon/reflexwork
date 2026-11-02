#!/usr/bin/env python3
"""Build submissions/ui/programmes.json — one row per graduate programme, so the chatbot can answer
"I want to apply to X" with X's own page instead of a generic how-to-apply answer.

Sources (public, read-only, the same requests a browser makes):
  1. Programme list  : /engine/structure/content/curriculum/curriculumDetail.php   (all programmes, 1 request)
  2. Announcement    : /Admission/announce/announce.php?id=<AAAA><M|D|N|C><G|S>00&y=<year>  (1 request / programme)
The announcement id is derived from the catalogue code (2022M04G -> 2022MG00) and validated on the page
itself: the page must contain that id, otherwise ("No records found") the programme has no announcement
for that year. HTTP 200 proves nothing here - the site answers 200 for ids that do not exist.

Everything stored from a page is VERBATIM text under a known heading; nothing is summarised or inferred
(one exception: contact lines carrying an e-mail are replaced - see scrub()).
Page text is untrusted data: the chatbot must escape it when rendering.

Run:  python3 -I submissions/build_programme_catalogue.py [--year 2570] [--limit N] [--delay 0.4] [--cache DIR]
(-I: do not import from the script/current directory.)  Stdlib only.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://graduate.mahidol.ac.th"
LIST_URL = BASE + "/engine/structure/content/curriculum/curriculumDetail.php"
ANN_URL = BASE + "/Admission/announce/announce.php?id={aid}&lang=th&y={year}"
DETAIL_URL = BASE + "/thai/prospective-students/?p=curriculum&id={code}"
UA = "ReflexWork-catalogue/1 (hackathon research; read-only; contact via github.com/ozoneRatchapon/reflexwork)"
OUT = Path(__file__).resolve().parent / "ui" / "programmes.json"

CODE_RE = re.compile(r"^(\d{4})([MDNC])(\d{2})([GS])$")
LEVELS = {"M": "ปริญญาโท", "D": "ปริญญาเอก", "C": "ประกาศนียบัตรบัณฑิต", "N": "ประกาศนียบัตรบัณฑิตชั้นสูง"}

# Headings on an announcement page, in page order. A section is the lines under its heading up to the next one.
HEADINGS = [
    "แผนการศึกษาที่เปิดรับสมัคร",
    "คุณสมบัติของผู้มีสิทธิ์สมัคร",
    "เกณฑ์คะแนนภาษาอังกฤษของหลักสูตร",
    "เงื่อนไขการยื่นผลคะแนนภาษาอังกฤษสำหรับผู้สมัครหลักสูตรนี้",
    "วิธีการคัดเลือก",
    "กำหนดการสอบคัดเลือก",
    "หลักฐานการสมัคร",
    "วิธีการรับสมัคร",
    "โครงสร้างหลักสูตร",
    "รายละเอียดอื่นๆ",
    "ทุนการศึกษาของหลักสูตร",
    "ค่าธรรมเนียมการศึกษา",
    "ข้อมูลติดต่อ",
]
# Where the last section ends (site footer / next block).
STOP_LINES = ("ติดต่อ", "หน้าหลัก", "ดาวน์โหลด", "ติดตามข่าวสาร", "สมัครเรียน", "ปิดหน้าต่าง")
# cap 0 = the heading only bounds the section before it: the score table is noise as text, the apply-method /
# structure / free-text blocks are generic or link-only, and ข้อมูลติดต่อ is staff names and e-mails (personal data).
MAX_SECTION_LINES = {"กำหนดการสอบคัดเลือก": 60, "เกณฑ์คะแนนภาษาอังกฤษของหลักสูตร": 0, "วิธีการรับสมัคร": 0,
                     "โครงสร้างหลักสูตร": 0, "รายละเอียดอื่นๆ": 0, "ข้อมูลติดต่อ": 0}
DEFAULT_MAX_LINES = 40
# Staff contacts appear inside free text (e.g. "Or contact Asst. Prof. X (x.y@mahidol.ac.th)" in scholarship notes).
# The only edit made to page text: a line carrying an e-mail is a contact line and is replaced WHOLE (the name goes
# with it) - we don't republish personal data; the full announcement, one click away, has it.
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
EMAIL_MASK = "(ติดต่อ: ดูในประกาศฉบับเต็ม)"


def scrub(lines: list[str]) -> list[str]:
    out: list[str] = []
    for ln in lines:
        ln = EMAIL_MASK if EMAIL_RE.search(ln) else ln
        if not (ln == EMAIL_MASK and out and out[-1] == EMAIL_MASK):
            out.append(ln)
    return out


BLOCK = {"p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "br", "textarea", "thead", "tbody", "ul", "ol"}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.pre = 0  # inside <textarea>: its newlines are real line breaks (numbered eligibility items)
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "textarea":
            self.pre += 1
        if tag in BLOCK:
            self.out.append("\n")
        if tag in ("td", "th"):
            self.out.append(" | ")
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag == "textarea":
            self.pre = max(0, self.pre - 1)
        if tag in BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self.skip:
            return
        # Source newlines between tags are layout noise; only block tags (and textarea content) break lines.
        self.out.append(data if self.pre else re.sub(r"\s+", " ", data))


def to_lines(raw: str) -> tuple[list[str], list[str]]:
    p = _Text()
    p.feed(raw.replace("<!--", "<!-- ").replace("-->", " -->"))
    text = "".join(p.out).replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", ln).strip(" |").strip() for ln in text.split("\n")]
    return [ln for ln in lines if ln], p.links


def announce_id(code: str) -> str | None:
    m = CODE_RE.match(code)
    return f"{m.group(1)}{m.group(2)}{m.group(4)}00" if m else None


def fetch(url: str, cache: Path | None, delay: float, retries: int = 2) -> str | None:
    key = cache / (hashlib.sha1(url.encode()).hexdigest() + ".html") if cache else None
    if key and key.exists():
        return key.read_text(encoding="utf8")
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read().decode("utf8", "replace")
            time.sleep(delay)
            if key:
                key.write_text(raw, encoding="utf8")
            return raw
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            print(f"  ! {url[-60:]} attempt {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(1.5 * (attempt + 1))
    return None


def parse_list(raw: str) -> list[dict]:
    """Rows of <faculty heading> + programmes. Programme type comes from the row icon's title attribute."""
    rows: list[dict] = []
    for block in re.split(r"<h3", raw)[1:]:
        fac = re.search(r"</i>\s*([^<]+?)\s*</h3>", block)
        faculty = html.unescape(fac.group(1)).strip() if fac else ""
        for tr in re.finditer(r"<tr>(.*?)</tr>", block, re.S):
            row = tr.group(1)
            icon = re.search(r"<img[^>]*\stitle=\"([^\"]*)\"", row)
            a = re.search(r"href=\"\?p=curriculum&(?:amp;)?id=(\w+)\"[^>]*>\s*(\w+)\s+(.*?)</a>", row, re.S)
            if not a or a.group(1) != a.group(2):
                continue
            # a few anchors carry the English name after a <br>; markup must never reach the title
            parts = re.split(r"<br\s*/?>", a.group(3), maxsplit=1)
            th, en = parts[0], (parts[1] if len(parts) > 1 else "")
            clean = lambda x: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x).replace("&nbsp;", " "))).strip()
            title = clean(th)
            rows.append({
                "code": a.group(1),
                "title": title,
                **({"title_en": clean(en)} if clean(en) else {}),
                "faculty": faculty,
                "kind": "international" if icon and "nternation" in icon.group(1) else "thai",
            })
    return rows


def sections_of(lines: list[str]) -> dict[str, list[str]]:
    idx = {h: i for h, i in ((h, next((k for k, ln in enumerate(lines) if ln == h), -1)) for h in HEADINGS) if i >= 0}
    ordered = sorted(idx.items(), key=lambda kv: kv[1])
    out: dict[str, list[str]] = {}
    for n, (h, i) in enumerate(ordered):
        end = ordered[n + 1][1] if n + 1 < len(ordered) else len(lines)
        body = []
        for ln in lines[i + 1:end]:
            if n + 1 == len(ordered) and any(ln.startswith(s) for s in STOP_LINES):
                break
            body.append(ln)
        cap = MAX_SECTION_LINES.get(h, DEFAULT_MAX_LINES)
        if cap:
            out[h] = scrub(body[:cap])
    return out


def value_after(lines: list[str], label: str) -> str:
    """Value for `label`: same line ("label value" / "label | value") or the next line."""
    for i, ln in enumerate(lines):
        if ln == label:
            return lines[i + 1] if i + 1 < len(lines) else ""
        for sep in (" | ", " "):
            if ln.startswith(label + sep):
                return ln[len(label) + len(sep):].strip()
    return ""


def parse_announce(raw: str, code: str, aid: str, year: str) -> dict | None:
    """None when the programme has no announcement for `year` (page lacks its id, or says No records found)."""
    lines, links = to_lines(raw)
    head_i = next((k for k, ln in enumerate(lines) if re.match(rf"รหัสหลักสูตร\s+{aid}\b", ln)), -1)
    if head_i < 0 or any("No records found" in ln for ln in lines):
        return None
    title_en = next((ln for ln in lines[head_i + 1: head_i + 6] if re.fullmatch(r"[A-Z][A-Z0-9 ,&().'/-]{8,}", ln)), "")
    status = value_after(lines, "สถานะการรับสมัคร").replace("ข้อมูลจากระบบรับสมัครบัณฑิตวิทยาลัย", "").strip()
    sections = sections_of(lines)
    # The programme's own notice (e.g. "หลักสูตรฯ ไม่เปิดรับ นักศึกษาสำหรับรอบนี้ เนื่องจาก …"): the lines between the
    # info table (last row = เว็บไซต์) and the generic site footer. This is exactly what an applicant needs to read.
    notice = []
    web_i = next((k for k in range(head_i, len(lines)) if lines[k].startswith("เว็บไซต์ |")), -1)
    if web_i >= 0:
        for ln in lines[web_i + 1:]:
            if ln.startswith(("ประชาสัมพันธ์หน้าเว็บไซต์", "ต้องการข้อมูลการสมัครเพิ่มเติม")) or ln in HEADINGS or ln in ("จำนวนที่คาดว่าจะรับ", "STUDY PLAN"):
                break  # a normal page: what follows is real content, not a notice
            notice.append(ln)
    notice = scrub(notice[:8])
    # A page shell with no status, no content and no notice carries nothing an applicant can use.
    if not status and not sections and not notice:
        return None
    apply_link = next((h for h in links if "admission-apply" in h), "")
    return {
        "year": year,
        "url": ANN_URL.format(aid=aid, year=year),
        "status": status,                                    # as displayed by the website - not live
        "title_en": title_en,
        "intake": value_after(lines, "จำนวนที่คาดว่าจะรับ"),
        "apply_url": urllib.parse.urljoin(BASE + "/Admission/announce/", apply_link) if apply_link else "",
        "notice": notice,
        "sections": sections,
        "page_sha256": hashlib.sha256("\n".join(lines).encode()).hexdigest(),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", default="2570")
    ap.add_argument("--limit", type=int, default=0, help="only the first N programmes (testing)")
    ap.add_argument("--delay", type=float, default=0.4, help="seconds between requests (politeness)")
    ap.add_argument("--cache", default="", help="directory to cache raw pages (re-runs are free)")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--fetched-at", required=True, help="YYYY-MM-DD stamped into the file (no clock in scripts)")
    a = ap.parse_args()
    cache = Path(a.cache) if a.cache else None
    if cache:
        cache.mkdir(parents=True, exist_ok=True)

    params = urllib.parse.urlencode({"id": 0, "grp": 0, "Faculty": 0, "srcText": "", "curLanguageType": 0, "pageStep": 2, "lang": "thai"})
    raw = fetch(f"{LIST_URL}?{params}", cache, a.delay)
    if not raw:
        print("could not fetch the programme list", file=sys.stderr)
        return 1
    rows = parse_list(raw)
    if len({r["code"] for r in rows}) != len(rows) or len(rows) < 300:
        print(f"unexpected list shape: {len(rows)} rows, {len({r['code'] for r in rows})} distinct", file=sys.stderr)
        return 1
    if a.limit:
        rows = rows[: a.limit]
    print(f"{len(rows)} programmes")

    out, open_n, none_n, bad = [], 0, 0, []
    for n, r in enumerate(rows, 1):
        m = CODE_RE.match(r["code"])
        if not m:
            bad.append(r["code"])
            continue
        aid = announce_id(r["code"])
        row = {**r, "level": LEVELS[m.group(2)], "detail_url": DETAIL_URL.format(code=r["code"]), "announce_id": aid, "announcement": None}
        page = fetch(ANN_URL.format(aid=aid, year=a.year), cache, a.delay)
        if page is None:
            row["announcement_error"] = "fetch_failed"
        else:
            ann = parse_announce(page, r["code"], aid, a.year)
            row["announcement"] = ann
            open_n += bool(ann)
            none_n += not ann
        out.append(row)
        if n % 25 == 0:
            print(f"  {n}/{len(rows)}  with announcement: {open_n}  without: {none_n}")

    doc = {"fetched_at": a.fetched_at, "year": a.year, "source": BASE, "count": len(out), "programmes": out}
    Path(a.out).write_text(json.dumps(doc, ensure_ascii=False, indent=0), encoding="utf8")
    print(f"wrote {len(out)} programmes -> {a.out}; announcements: {open_n}, none: {none_n}, bad codes: {bad or 0}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
