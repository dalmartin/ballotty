// Ballotty UI: renders precomputed, citation-checked ballot JSON. No model calls happen here.
const CITIES = [
  { id: "eugene", name: "Eugene" },
  { id: "corvallis", name: "Corvallis" },
  { id: "portland", name: "Portland" },
];
const NO_INFO = "No information filed in the official pamphlet.";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const docShort = (doc) => ({ book4: "Book 4", book6: "Book 6", book13: "Book 13", lane_ballot: "Lane ballot", benton_vp: "Benton VP", multnomah_vp: "Multnomah VP" })[doc] || doc;

function citeLinks(citations) {
  const seen = new Set();
  return citations
    .filter((c) => !seen.has(c.doc + c.page) && seen.add(c.doc + c.page))
    .map((c) => `<a class="cite" href="${esc(c.url)}" target="_blank" rel="noopener" title="Source quote: “${esc(c.quote)}”${c.filed_by ? " (filed by " + esc(c.filed_by) + ")" : ""}">${esc(docShort(c.doc))}, ${esc(c.page_label)}</a>`)
    .join("");
}

function bulletList(bullets) {
  if (!bullets.length) return `<p class="empty">${NO_INFO}</p>`;
  return `<ul class="bullets">${bullets
    .map((b) => `<li>${esc(b.text)}${citeLinks(b.citations)}${b.loaded_terms.length ? `<span class="flag" title="Loaded-language check flagged: ${esc(b.loaded_terms.join(", "))}. Shown as a verbatim quote instead.">⚑ verbatim</span>` : ""}</li>`)
    .join("")}</ul>`;
}

function checksPanel(item) {
  const c = item.checks;
  if (!c) return "";
  const n = c.dropped.length + c.flagged.length + c.corrected.length;
  const rows = [
    ...c.dropped.map((d) => `<li><span class="reason">Dropped</span> (${esc(d.section)}): “${esc(d.text)}” · ${esc(d.reason)}</li>`),
    ...c.flagged.map((f) => `<li><span class="reason">Flagged</span> (${esc(f.section)}): “${esc(f.text)}” · loaded terms: ${esc(f.loaded_terms.join(", "))} → replaced with the verbatim quote</li>`),
    ...c.corrected.map((f) => `<li><span class="reason">Page corrected</span> (${esc(f.section)}): quote cited on p. ${f.cited_page}, found on p. ${f.found_page}</li>`),
  ];
  return `<details class="checks"><summary>How we checked: ${n ? `${c.dropped.length} dropped, ${c.flagged.length} flagged, ${c.corrected.length} page-corrected` : "every point passed the citation checker"}</summary>
    <ul>${rows.join("") || "<li>Every point's quote was found on its cited page. No loaded language detected.</li>"}</ul></details>`;
}

function verifyLink(item) {
  return `<a class="verify" href="${esc(item.verify_url)}" target="_blank" rel="noopener">Verify in official pamphlet → ${esc(item.source.title)}${item.verify_label ? ", " + esc(item.verify_label) : ""}</a>`;
}

function candidateCard(item) {
  const head = `<h3>${esc(item.name)}</h3><p class="sub">On the ballot as: ${esc(item.ballot_party_label)}${item.furnished_by ? ` · Statement furnished by ${esc(item.furnished_by)}` : ""}</p>`;
  if (!item.statement_filed) {
    return `<article class="card">${head}<p class="empty">Chose not to submit a statement to the voters' pamphlet. Ballotty does not fill this gap.</p></article>`;
  }
  return `<article class="card">${head}
    <h4>What they say <span class="sr">(self-reported)</span></h4>${bulletList(item.summary)}
    <h4>Background <span class="sr">(self-reported)</span></h4>${bulletList(item.background)}
    <h4>Endorsements <span class="sr">(self-reported)</span></h4>${bulletList(item.endorsements)}
    ${verifyLink(item)}${checksPanel(item)}</article>`;
}

function side(item, key, label) {
  const filed = item.arguments_filed[key];
  const filers = item.filers[key];
  let body;
  if (!filed) {
    body = `<p class="empty">${esc(item.no_arguments_note || `No arguments ${key === "for" ? "in favor" : "in opposition"} were filed for this measure.`)}</p>`;
  } else if (!item[key].length) {
    body = `<p class="empty">Could not verify a summary. See the official pamphlet.</p>`;
  } else {
    body = item[key]
      .map((t) => `<div class="theme">${esc(t.text)}${citeLinks(t.citations)}${t.loaded_terms.length ? `<span class="flag">⚑ verbatim</span>` : ""}<div class="by">Made in arguments filed by: ${t.filed_by.map(esc).join("; ")}</div></div>`)
      .join("");
  }
  return `<section class="side"><h5>${label}: ${filed} filed</h5>${filed ? `<p class="filers">${filers.length} filer${filers.length === 1 ? "" : "s"}</p>` : ""}${body}</section>`;
}

function measureCard(item) {
  const title = item.caption || item.question
    ? `<div class="ballot-title"><span class="label">Ballot title (verbatim)</span>${item.caption ? `<p><strong>${esc(item.caption)}</strong></p>` : ""}${item.question ? `<p>${esc(item.question)}</p>` : ""}</div>`
    : `<p class="empty">Could not verify the ballot title text. See the official source.</p>`;
  const f = item.arguments_filed;
  return `<article class="card">${title}
    <h4>What it would do</h4>${bulletList(item.summary)}
    <p class="counts">Arguments in the official pamphlet: ${f.for} in favor · ${f.against} in opposition</p>
    <div class="sides">${side(item, "for", "In favor")}${side(item, "against", "In opposition")}</div>
    ${verifyLink(item)}${checksPanel(item)}</article>`;
}

function render(data) {
  const main = document.getElementById("main");
  const toc = data.contests.map((c) => `<li><a href="#${data.city}/${c.id}">${esc(c.name)}</a></li>`).join("");
  const contests = data.contests
    .map((c) => {
      const tags = [c.district_label && `<span class="tag muted">${esc(c.district_label)}</span>`, c.ranked_choice && `<span class="tag">Ranked choice</span>`]
        .filter(Boolean).join("");
      const items = c.items.map((i) => (i.type === "measure" ? measureCard(i) : candidateCard(i))).join("");
      return `<details class="contest" id="${data.city}/${c.id}"><summary>${esc(c.name)} ${tags}</summary><div class="contest-body">${items}</div></details>`;
    })
    .join("");
  main.innerHTML = `
    <p class="city-meta">${esc(data.name)}, ${esc(data.county)} · General Election, November 3, 2026 · Candidates in ballot order</p>
    ${data.coverage_note ? `<p class="note">${esc(data.coverage_note)}</p>` : ""}
    <ul class="toc">${toc}</ul>${contests}`;
  document.getElementById("sources").innerHTML = `<div class="sources"><strong>Official sources used for ${esc(data.name)}:</strong><ul>${data.sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> (${esc(s.publisher)}) <code>sha256 ${esc(s.sha256.slice(0, 12))}…</code></li>`)
    .join("")}</ul>Generated ${esc(data.generated_at)}</div>`;
}

const cache = {};
async function show(cityId, anchor) {
  document.querySelectorAll(".cities button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.city === cityId)));
  if (!cache[cityId]) {
    const res = await fetch(`/api/${cityId}`);
    cache[cityId] = await res.json();
  }
  render(cache[cityId]);
  if (anchor) {
    const el = document.getElementById(anchor);
    if (el) { el.open = true; el.scrollIntoView({ block: "start" }); }
  }
}

function route() {
  const [city] = location.hash.slice(1).split("/");
  const cityId = CITIES.some((c) => c.id === city) ? city : "eugene";
  show(cityId, location.hash.includes("/") ? location.hash.slice(1) : null);
}

document.getElementById("cities").innerHTML = CITIES.map((c) => `<button type="button" data-city="${c.id}" aria-pressed="false">${c.name}</button>`).join("");
document.getElementById("cities").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) location.hash = b.dataset.city;
});
window.addEventListener("hashchange", route);
route();
