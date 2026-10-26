# Ballotty — Devpost submission draft

**Tagline:** Your Oregon ballot at a glance, where every point links to the official voters' pamphlet page it came from.

**Links:** Live: https://dalmartin.github.io/ballotty/ · DigitalOcean: https://ballotty-ps377.ondigitalocean.app · Code (MIT): https://github.com/dalmartin/ballotty

**Prize tracks:** Best Use of Gemma 4 (MLH / Google) · Best Open-Source AI Project (MLH / DigitalOcean)

---

## Inspiration

Every Oregon household gets a voters' pamphlet before an election. In Portland that means a 64-page state edition plus a 108-page county pamphlet. Most people don't read it, and the guides that fill the gap ask you to trust their summaries. I wanted the speed of a summary with the trust of the original document: nothing on screen that you can't trace back to an official page.

## What it does

Ballotty turns the official pamphlets for **Eugene, Corvallis and Portland** into a one-page, searchable ballot dashboard for the November 3, 2026 election.

- **Search by issue in everyday words.** "rent" finds Housing, "police" finds Public safety, "climate" finds Environment & energy. Matching points light up across every race, and races that don't mention the issue collapse.
- **Candidates side by side**, in ballot order: occupation, three short points tagged by topic, and endorsements, all **labeled self-reported** because they come from the candidates' own statements. An optional topic table shows who raises what.
- **Measures with both sides on equal terms.** Portland's Measure 26-267 shows "15 arguments for (3 filers), 15 against (8 filers)", with the top points from each side condensed using the same instructions and the same limit.
- **Tap any point** to see the exact pamphlet quote highlighted, the page it's on, and a link to that page of the official PDF.
- **No gap-filling.** Candidates who didn't file a statement say so. Eugene's Measure 20-388 says "No arguments were filed", because Lane County doesn't publish a county pamphlet.
- **Mark your own picks** and print a cheat sheet. Picks stay in the browser. Ballotty never recommends, ranks or scores anyone.

## How I built it

1. **Sources.** 6 official PDFs: the state pamphlet's Lane, Benton and Multnomah editions; the Benton and Multnomah county pamphlets; and Lane County's ballot content. Each is pinned by its sha256 hash. All are text PDFs; a gutter-detection step reads two-column pages in the right order.
2. **Segmentation.** Candidate pages are listed in the config and verified by name. Measure arguments are split deterministically on the pamphlets' own "ARGUMENT IN FAVOR/OPPOSITION" headings and "(This information furnished by …)" lines. **Counts and filer names never come from the model.**
3. **Gemma 4 extraction.** `gemma-4-26b-a4b-it`, with `gemma-4-31b-it` as fallback, called through the Gemini API with `response_schema` structured JSON. Every bullet must come with a verbatim quote and a page number. Every candidate gets the same prompt and limits (3 summary, 5 background, 5 endorsements), and both sides of a measure get the same template and a limit of 3 themes. A second Gemma pass writes 8-word "short" lines and tags each point from a fixed list of 22 topics.
4. **Checks, applied before anything ships:**
   - **Citation check:** the quote must fuzzy-match (≥92%) the page it cites, or the bullet is dropped.
   - **Name and number checks:** every proper name and number in a summary must appear in its quote.
   - **Loaded-language check:** a Gemma 4 pass plus a word list. Flagged paraphrases are replaced by the speaker's exact words.
   - **Relocation:** statewide statements are re-cited to each city's own pamphlet edition.
5. **Result:** 170 points shown, 15 removed by the checks, 8 replaced with exact quotes. 18 acceptance tests cover the safeguards. Two examples caught in the real run:
   - Gemma claimed a mayoral candidate cited "nearly 2,000 new units", a number not in his quote, so it was removed.
   - A supporters' theme was attributed to an argument it didn't come from, so it was removed.
6. **Frontend.** A static vanilla-JS dashboard: Archivo for Ballotty's own voice, Source Serif only for official text, and contest colors chosen to avoid red and blue, which read as party colors. It's hosted free as a **DigitalOcean App Platform static site** and on GitHub Pages.

## Challenges

- **The ballot didn't match the brief.** There are no statewide measures in November 2026, and Lane County publishes no pamphlet, so Eugene has no official for/against arguments at all. Adding Corvallis and Portland, where the county pamphlets do include arguments, fixed that, and the empty states became a feature.
- **Uneven depth reads as bias.** Early runs gave one candidate 1 point and another 4, even though every point passed the checks. I added a "thin answer" retry across both models so candidates get comparable coverage.
- **Plausible but unsupported paraphrases.** A quote can exist on the page while the summary adds names it doesn't contain, for example an endorsement bullet listing senators whose quote was just "PROUDLY ENDORSED BY:". That's why I added the name and number checks.
- **API instability.** Gemini returned 503, 500 and timeout errors during batch runs. The pipeline uses per-item caching, a 90-second timeout, retries, model fallback and per-item failure isolation, and the site ships precomputed data, so the demo never depends on a live call.

## What I learned

Grounding is a pipeline, not a prompt. Asking the model to "only use the text" isn't enough; what made the output trustworthy was requiring a quote for every claim and then checking it mechanically.

## What's next

- More of the ballot: Portland City Council districts, all Corvallis wards, and other Oregon counties. Each is a config entry plus a batch run.
- Spanish and other languages the state already translates.
- A scheduled job that detects new or corrected PDFs by hash, rebuilds, and opens a pull request for human review before anything is published.
- Self-hosting Gemma on a DigitalOcean GPU Droplet, so a county or nonprofit could run and audit the whole pipeline on its own hardware.

## Prize track fit

**Best Use of Gemma 4.** Gemma 4 does all of the content work: structured extraction with verbatim quotes from messy two-column pages, condensing 15 vs 15 filed arguments into attributed themes, short lines and topic tags for search, and a second pass that audits its own wording for loaded language. The in-app "How we checked" panel shows Gemma's output being verified and, in real cases, rejected. Open weights matter for civic tech: the same model can be self-hosted and audited.

**Best Open-Source AI Project.** The project is MIT-licensed, and `make data` rebuilds every city from the official PDFs. Sources are pinned by hash, every displayed sentence carries its quote and page, and the checks log is published. It's hosted on **DigitalOcean App Platform** as a free static site, and adding a city is a config change.

## Built with

Gemma 4 (Gemini API) · Python · google-genai · Pydantic · pdfplumber · rapidfuzz · pytest · FastAPI (local dev) · vanilla JavaScript · Lucide icons · DigitalOcean App Platform · GitHub Pages

## Disclaimer

Ballotty is not affiliated with the Oregon Secretary of State, any county elections office, any city, or any campaign. Summaries can contain errors; always verify with the official pamphlet. Ballotty does not recommend how to vote.
