# Ballotty

**Your Oregon ballot, condensed. Every sentence links to the official voters' pamphlet page it came from.**

Ballotty summarizes the November 3, 2026 ballot for **Eugene**, **Corvallis** and **Portland** (Multnomah County portion) from the official state and county voters' pamphlets. Gemma 4 condenses and attributes; a citation checker drops anything whose quote can't be found on the cited page.

- Candidate summaries, background and endorsements are labeled **self-reported**: they come from the candidates' own pamphlet statements.
- Measure arguments are condensed into at most 3 themes per side, using the same prompt and the same cap for both sides. Each theme is attributed to the people who filed those arguments, and the counts of filed arguments are computed by regex, not by the model.
- No party-leaning labels and no recommendations. Party nominations are shown exactly as printed on the ballot.

## How it works

```
official PDFs ─► fetch (sha256-pinned) ─► extract (per page, column order) ─► segment
   ─► Gemma 4 structured extraction (verbatim quote + page per bullet)
   ─► validate: citation checker · number check · equal caps · loaded-language pass · relocation
   ─► data/out/{eugene,corvallis,portland}.json ─► FastAPI + vanilla JS ─► DigitalOcean App Platform
```

| Safeguard | What it does |
|---|---|
| Citation checker | Each quote must fuzzy-match (≥92%, normalized) the **cited page**. Otherwise the bullet is dropped and logged. |
| Number check | Any number in a summary must appear in its quote. |
| Symmetry | One template and identical caps for every candidate (3 summary / 5 background / 5 endorsements) and for both sides of a measure (3 themes). Candidates appear in ballot order. |
| Loaded-language pass | A second Gemma 4 call plus a wordlist. A flagged paraphrase is replaced by the attributed verbatim quote. |
| No gap-filling | "Chose not to submit a statement", "No information filed in the official pamphlet", and the pamphlet's own "No arguments … were filed" text. |
| Relocation | Statewide statements are extracted once, then re-cited to each city's own state edition (Book 4 / 6 / 13). |
| Verify link | Every item links to the exact PDF page. Every page has a "How we checked" log. |

## Run it

```bash
make setup                 # uv venv + requirements-pipeline.txt
echo "GEMINI_API_KEY=..." > .env
make data                  # fetch → extract → segment → gemma → validate (Gemma calls are cached)
make test                  # acceptance tests for the safeguards
make serve                 # http://localhost:8000
```

Models: `gemma-4-26b-a4b-it` (primary) with `gemma-4-31b-it` as fallback, via the Gemini API with `response_schema` JSON output.

**Live:** https://ballotty-ps377.ondigitalocean.app (DigitalOcean App Platform, `.do/app.yaml`). The web service only needs `requirements.txt`; the precomputed JSON in `data/out/` is committed. After pushing, redeploy with `doctl apps create-deployment <app-id>`.

## Sources (Nov 3, 2026 General Election)

| City | State pamphlet | County source |
|---|---|---|
| Eugene | [Book 4, Lane County edition](https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book4_web.pdf) | Lane County publishes no pamphlet; [ballot content](https://www.lanecounty.org/UserFiles/Servers/Server_3585797/File/County%20Clerk/Elections/Dated%20Elections/November%203,%202026/GE26_E_019%20Web.pdf) |
| Corvallis | [Book 6, Benton County edition](https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book6_web.pdf) | [Benton County Voters' Pamphlet](https://re.bentoncountyor.gov/wp-content/uploads/2026/09/2026Nov03-Benton-County-Voters-Pamphlet.pdf) |
| Portland | [Book 13, Multnomah County edition](https://sos.oregon.gov/elections/Voters-Pamphlet/Documents/VP_G26-Book13_web.pdf) | [Multnomah County Voters' Pamphlet](https://multco.us/file/multnomah_county_voters'_pamphlet_-_november_2026_general_election/download) |

Add a city by adding an entry to `config/cities.yaml`.

## Disclaimers

Ballotty is **not affiliated** with the Oregon Secretary of State, any county elections office, any city, or any campaign. Summaries are machine-generated and may contain errors; **always verify with the official voters' pamphlet**. Ballotty makes **no voting recommendations**.

MIT licensed.
