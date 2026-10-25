"""Config + page text -> data/segments.json.

Candidates: the config names the pages; we verify the name really is on them.
Measures: the ballot title text, plus arguments split deterministically by the
"ARGUMENT IN FAVOR/OPPOSITION" headers and the "(This information furnished by X)"
line that closes every filed argument. Counts and filers never come from the model.
"""

import re
import sys

from .common import SEGMENTS, load_config, normalize, page_text, write_json

HEADER = re.compile(r"^\s*argument\s+in\s+(favor|opposition)\s*$", re.I)
FURNISHED = re.compile(r"^\s*\(this information furnished by", re.I)


def all_contests(config):
    """Yield (contest_config, city_or_None) for shared and city-specific contests, once each."""
    for contest in config["shared_contests"]:
        yield contest, None
    for city_id, city in config["cities"].items():
        for contest in city["contests"]:
            if "shared" not in contest:
                yield contest, city_id


def candidate_segments(contest):
    out = []
    for order, cand in enumerate(contest["candidates"], start=1):
        filed = cand.get("statement_filed", True)
        seg = {
            "id": f"{contest['id']}/{cand['name'].lower().replace(' ', '-')}",
            "type": "candidate",
            "contest_id": contest["id"],
            "contest": contest["contest"],
            "name": cand["name"],
            "ballot_party_label": cand["party"],
            "ballot_order": order,
            "statement_filed": filed,
            "doc": contest["doc"],
            "pages": cand.get("pages", []),
        }
        for n in seg["pages"]:
            if normalize(cand["name"]) not in normalize(page_text(contest["doc"], n)):
                sys.exit(f"segment: {cand['name']!r} not found on {contest['doc']} page {n}")
        out.append(seg)
    return out


def is_noise(line, contest):
    s = line.strip()
    if not s or s.isdigit():
        return True
    if ("PAMPHLET" in s.upper() and "2026" in s) or re.match(r"^\d+\s+[A-Z ]*COUNTY VOTE", s):
        return True
    jur = contest["jurisdiction"]
    if s == f"Measure {contest['measure']}" or (len(s) >= 3 and (jur.startswith(s) or jur.endswith(s))):
        return True
    return False


def title_text(contest):
    text = "\n".join(page_text(contest["doc"], n) for n in contest["title_pages"])
    # The Lane ballot content PDF lists many measures per page; keep only this one.
    m = re.search(rf"Measure No: {re.escape(contest['measure'])}(.*?)(Contest Total|Measure No:|$)", text, re.S)
    if m:
        text = f"Measure No: {contest['measure']}" + m.group(1)
    return "\n".join(line for line in text.splitlines() if not is_noise(line, contest))


def split_arguments(contest):
    args, cur, side = [], None, None
    lines = [(n, line) for n in contest["argument_pages"] for line in page_text(contest["doc"], n).splitlines()]
    i = 0
    while i < len(lines):
        n, line = lines[i]
        header = HEADER.match(line)
        if header:
            # The first side header inside an argument decides its side; repeats are running headers.
            if cur is None:
                cur = {"side": None, "lines": [], "pages": []}
            if cur["side"] is None:
                cur["side"] = side = "for" if header.group(1).lower() == "favor" else "against"
            i += 1
            continue
        if is_noise(line, contest):
            i += 1
            continue
        if cur is None:
            cur = {"side": None, "lines": [], "pages": []}
        if FURNISHED.match(line):
            block = line
            while ")" not in block and i + 1 < len(lines):
                i += 1
                block += " " + lines[i][1].strip()
            filer = re.sub(r"^\s*\(this information furnished by\s*", "", block, flags=re.I)
            cur["filed_by"] = filer.split(")")[0].strip().rstrip(".")
            cur["side"] = cur["side"] or side
            if n not in cur["pages"]:
                cur["pages"].append(n)
            args.append(cur)
            cur = None
        else:
            cur["lines"].append(line)
            if n not in cur["pages"]:
                cur["pages"].append(n)
        i += 1
    out = []
    for k, a in enumerate(args, start=1):
        out.append({"id": f"A{k}", "side": a["side"], "filed_by": a["filed_by"], "pages": a["pages"], "text": "\n".join(a["lines"])})
    return out


def measure_segment(contest):
    arguments = split_arguments(contest) if contest["argument_pages"] else []
    counts = {"for": sum(a["side"] == "for" for a in arguments), "against": sum(a["side"] == "against" for a in arguments)}
    if counts != contest["expected_arguments"]:
        sys.exit(f"segment: {contest['id']} argument counts {counts} != expected {contest['expected_arguments']}")
    return {
        "id": contest["id"],
        "type": "measure",
        "measure_number": contest["measure"],
        "jurisdiction": contest["jurisdiction"],
        "doc": contest["doc"],
        "title_pages": contest["title_pages"],
        "title_text": title_text(contest),
        "arguments": arguments,
        "arguments_filed": counts,
        "no_arguments_note": contest.get("no_arguments_note"),
    }


def main():
    config = load_config()
    segments = []
    for contest, _city in all_contests(config):
        segments += [measure_segment(contest)] if "measure" in contest else candidate_segments(contest)
    write_json(SEGMENTS, segments)
    cands = [s for s in segments if s["type"] == "candidate"]
    print(f"segment: {len(cands)} candidates ({sum(not c['statement_filed'] for c in cands)} without statements)")
    for s in segments:
        if s["type"] == "measure":
            print(f"segment: measure {s['measure_number']}: {s['arguments_filed']}, title {len(s['title_text'])} chars")


if __name__ == "__main__":
    main()
