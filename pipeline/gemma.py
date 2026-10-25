"""Gemma 4 structured extraction: data/segments.json -> data/raw_extractions/*.json.

Every prompt asks for a verbatim `quote` + `page` per bullet; validate.py then
checks each quote against the cited page and drops anything it can't find.
Results are cached per item, so reruns only call Gemma for new/changed items.
"""

import hashlib
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from .common import EXTRACTIONS, SEGMENTS, load_env, page_text, read_json, write_json

MODELS = ["gemma-4-26b-a4b-it", "gemma-4-31b-it"]  # primary, fallback (31B was slow/503 in testing)

SYSTEM = """You condense official Oregon voters' pamphlet text for voters.
Rules:
- Only restate what the provided text says. Never add facts, context, or opinions.
- Attribute every point to its source ("Says...", "Lists...", "Argues...", "Would...").
- Use plain, neutral words. No evaluative adjectives (e.g. strong, failed, radical, common-sense).
- `quote` must be copied EXACTLY from the provided text: contiguous words, 5 to 40 words, no edits.
- If the text does not contain something, return an empty list or empty string. Never guess."""


class Bullet(BaseModel):
    text: str
    quote: str
    page: int


class CandidateOut(BaseModel):
    summary: list[Bullet]
    background: list[Bullet]
    endorsements: list[Bullet]
    furnished_by: str


class MeasureOut(BaseModel):
    caption: str
    question: str
    summary: list[Bullet]


class ThemeCitation(BaseModel):
    argument_id: str
    quote: str


class Theme(BaseModel):
    text: str
    citations: list[ThemeCitation]


class ThemesOut(BaseModel):
    themes: list[Theme]


class LoadedFlag(BaseModel):
    index: int
    loaded_terms: list[str]


class LoadedOut(BaseModel):
    flags: list[LoadedFlag]


_client = None


def client():
    global _client
    if _client is None:
        load_env()
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"], http_options=types.HttpOptions(timeout=90_000))
    return _client


def parse(text, schema):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)
    return schema.model_validate(json.loads(text))


def generate(prompt, schema, models=MODELS):
    """Call Gemma with JSON schema output. Retries transient errors, retries once on bad JSON
    with the validation error appended, then falls back to the next model."""
    last = None
    for model in models:
        contents = prompt
        for attempt in range(4):
            try:
                resp = client().models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM,
                        temperature=0,
                        response_mime_type="application/json",
                        response_schema=schema,
                    ),
                )
                return parse(resp.text or "", schema), model
            except (ValidationError, json.JSONDecodeError) as e:
                last = e
                contents = f"{prompt}\n\nYour previous answer was invalid JSON for the schema: {str(e)[:500]}\nReturn only valid JSON."
            except Exception as e:  # 429 / 503 / network
                last = e
                time.sleep(2 * (attempt + 1))
        print(f"  {model} failed ({type(last).__name__}); trying next model", file=sys.stderr)
    raise RuntimeError(f"all models failed: {last}")


def pages_block(doc, pages):
    return "\n\n".join(f"=== PAGE {n} ===\n{page_text(doc, n)}" for n in pages)


def candidate_prompt(seg):
    return f"""Candidate: {seg['name']}
Contest: {seg['contest']}

Below is official voters' pamphlet text. A page may also contain OTHER candidates' statements: use ONLY the statement of {seg['name']}.

{pages_block(seg['doc'], seg['pages'])}

Return JSON:
- summary: exactly 3 bullets, each a DIFFERENT point the candidate says they stand for, have done, or will do (fewer only if the statement truly has fewer than 3 points). Start each with "Says".
- background: one bullet for EACH labeled field present in the statement, in this order: Occupation, Occupational Background, Educational Background, Prior Governmental Experience, then any other labeled field (e.g. Civic Leadership). Maximum 5. Start each with "Lists".
- endorsements: up to 5 bullets naming endorsers the statement lists, grouping similar ones (e.g. "Lists endorsements from ..."). The quote must contain the endorser names it supports. Empty list if the statement lists none.
- furnished_by: the text after "This information furnished by" in this candidate's statement, or "".
Refer to the candidate by last name ("{seg['name'].split()[-1]}"), never by pronouns.
Each bullet: text (at most 30 words), quote (exact words from the page that support the bullet), page (the PAGE number where the quote appears)."""


def measure_prompt(seg):
    return f"""Measure {seg['measure_number']} ({seg['jurisdiction']}).
Below is the official ballot title and explanatory text, from page {seg['title_pages'][0]}.

=== PAGE {seg['title_pages'][0]} ===
{seg['title_text']}

Return JSON:
- caption: the ballot title caption, copied exactly.
- question: the ballot title question, copied exactly.
- summary: up to 4 statements (not questions) in plain language on what the measure would do if approved, using only this text. Start each with "If approved, the measure would".
Each bullet: text (at most 30 words), quote (exact words from the text that support the bullet), page ({seg['title_pages'][0]})."""


SIDE_LABEL = {"for": ("in favor of", "Supporters"), "against": ("in opposition to", "Opponents")}


def themes_prompt(seg, side):
    """Identical template for both sides; only the side words change."""
    args = [a for a in seg["arguments"] if a["side"] == side]
    phrase, who = SIDE_LABEL[side]
    listing = "\n\n".join(f"[{a['id']}] (filed by {a['filed_by']})\n{a['text']}" for a in args)
    return f"""Below are all {len(args)} arguments filed {phrase} Measure {seg['measure_number']} ({seg['jurisdiction']}) in the official voters' pamphlet. Each starts with its ID.

{listing}

Return JSON with up to 3 themes: the main points these arguments make, most common first.
Each theme:
- text: at most 30 words, starting with "{who} argue".
- citations: 1 to 4 entries, each an argument_id (like "A3") whose text makes this point, plus a quote copied exactly from that argument.
A theme may only cite arguments that actually make that point."""


# Fixed topic list: every candidate is tagged from the same vocabulary, so the compare view is symmetric.
TOPICS = [
    "Housing", "Cost of living", "Homelessness", "Healthcare", "Education", "Childcare", "Public safety",
    "Jobs & economy", "Small business", "Taxes & budget", "Government accountability", "Environment & energy",
    "Transportation", "Infrastructure", "Civil rights", "Reproductive rights", "Labor & workers", "Immigration",
    "Agriculture & rural", "Veterans", "Seniors & Social Security", "Elections & democracy", "Other",
]


class BriefLine(BaseModel):
    index: int
    short: str
    topics: list[str]


class BriefOut(BaseModel):
    lines: list[BriefLine]


def brief_prompt(sentences, with_topics):
    listing = "\n".join(f"{i}. {t}" for i, t in enumerate(sentences))
    topic_rule = (
        f"- topics: 1 or 2 topics for that sentence, chosen ONLY from this list: {', '.join(TOPICS)}."
        if with_topics else "- topics: always an empty list."
    )
    return f"""Below are numbered, verified sentences condensed from an official voters' pamphlet.

{listing}

For EACH sentence return one line:
- index: the sentence number.
- short: the same point in at most 8 plain words, for a quick-scan list. Keep only facts in that sentence; do not add anything. Drop "Says"/"Lists"/"If approved, the measure would" and start with a verb or noun (e.g. "Audit the state tax code", "Former State Senator"). Keep any numbers exactly. No evaluative or emotional words.
{topic_rule}"""


def loaded_prompt(bullets):
    listing = "\n".join(f"{i}. {b}" for i, b in enumerate(bullets))
    return f"""Check these summary bullets for loaded language: words or phrases that are emotionally charged, evaluative, or partisan characterizations rather than neutral description (examples: radical, extreme, disastrous, common-sense, failed, reckless, heroic, corrupt, job-killing, giveaway).
Attributed neutral verbs like "says" or "argues" are fine. Only flag bullets that contain such terms.

{listing}

Return JSON: flags = list of {{index, loaded_terms}} for bullets with loaded terms (empty list if none)."""


FIELDS = ["occupation:", "occupational background:", "educational background:", "education background:", "prior governmental experience:"]


def is_thin(out, seg):
    text = " ".join(page_text(seg["doc"], n).lower() for n in seg["pages"])
    fields = sum(f in text for f in FIELDS)
    return len(out.summary) < 3 or len(out.background) < min(fields, 4)


def key(prompt):
    return hashlib.sha256(prompt.encode()).hexdigest()[:16]


def cache_path(item_id):
    return EXTRACTIONS / (item_id.replace("/", "__") + ".json")


def run_item(seg, force=False):
    path = cache_path(seg["id"])
    if seg["type"] == "candidate":
        jobs = {"candidate": (candidate_prompt(seg), CandidateOut)}
    else:
        jobs = {"measure": (measure_prompt(seg), MeasureOut)}
        for side in ("for", "against"):
            if seg["arguments_filed"][side]:
                jobs[f"themes_{side}"] = (themes_prompt(seg, side), ThemesOut)
    hashes = {name: key(p) for name, (p, _) in jobs.items()}
    if not force and path.exists() and read_json(path).get("prompt_hashes") == hashes:
        return f"cached {seg['id']}"
    result = {"id": seg["id"], "prompt_hashes": hashes, "models": {}}
    for name, (prompt, schema) in jobs.items():
        out, model = generate(prompt, schema)
        if name == "candidate":
            # Equal treatment: a thin answer for one candidate gets retried on each model; keep the fullest.
            for retry_models in (MODELS[::-1], MODELS):
                if not is_thin(out, seg):
                    break
                retry, retry_model = generate(prompt + "\n\nYour previous answer was missing points. Include 3 summary bullets and one background bullet per labeled field.", schema, models=retry_models)
                if len(retry.summary) + len(retry.background) > len(out.summary) + len(out.background):
                    out, model = retry, retry_model
        result[name] = out.model_dump()
        result["models"][name] = model
    write_json(path, result)
    return f"gemma  {seg['id']} via {sorted(set(result['models'].values()))}"


def main(force=False, only=None):
    segs = [s for s in read_json(SEGMENTS) if s.get("statement_filed", True)]
    if only:
        segs = [s for s in segs if only in s["id"]]
    def safe(seg):
        try:
            return run_item(seg, force)
        except Exception as e:  # one flaky item must not sink the batch
            return f"FAILED {seg['id']}: {str(e)[:200]}"

    with ThreadPoolExecutor(max_workers=4) as pool:
        lines = list(pool.map(safe, segs))
    for line in lines:
        print(line)
    failed = [line for line in lines if line.startswith("FAILED")]
    if failed:
        sys.exit(f"{len(failed)} item(s) failed; rerun to retry (successful items are cached)")


def selftest():
    out, model = generate('Text: "Jane Doe. Occupation: Teacher. I will fix potholes."\nReturn summary (1 bullet), background (1 bullet), endorsements (empty), furnished_by "". Bullets need text, quote, page=1.', CandidateOut)
    print(model, out.model_dump_json())


if __name__ == "__main__":
    if "--test" in sys.argv:
        selftest()
    else:
        only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)
        main(force="--force" in sys.argv, only=only)
