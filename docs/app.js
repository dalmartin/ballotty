// Ballotty brief: a quick, scannable ballot. Renders precomputed, citation-checked JSON; no model calls here.
const CITIES = [
  { id: "eugene", name: "Eugene" },
  { id: "corvallis", name: "Corvallis" },
  { id: "portland", name: "Portland" },
];
const ELECTION_DAY = new Date("2026-11-03T20:00:00-08:00");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const $ = (id) => document.getElementById(id);
const clip = (s, n = 160) => (String(s).length > n ? String(s).slice(0, n).trimEnd() + "…" : String(s));

const state = { data: {}, city: null, topic: null, open: {}, picks: {} };
let index = new Map();

/* ---------- Storage (per-viewer convenience only; works without it) ---------- */
function loadPicks(city) {
  try { return JSON.parse(localStorage.getItem(`ballotty-picks-${city}`) || "{}"); } catch { return {}; }
}
function savePicks() {
  try { localStorage.setItem(`ballotty-picks-${state.city}`, JSON.stringify(state.picks)); } catch { /* private mode: picks last for this visit */ }
}

/* ---------- Helpers ---------- */
const sectionsOf = (item) => (item.type === "candidate" ? ["summary", "background", "endorsements"] : ["summary", "for", "against"]);
// Fallback when no checked short line exists: drop the attribution lead-in ("Says Smith", "Lists Smith's occupation as").
function plain(text) {
  const t = text
    .replace(/^Lists\s+(?:[\w.'’-]+(?:'s|’s)\s+)?(?:occupation|occupational background|educational background|prior governmental experience)\s+(?:as|is|includes?)\s+/i, "")
    .replace(/^(?:Says|Lists)\s+(?:that\s+)?(?:[A-Z][\w.'’-]+\s+)?(?=[a-z])/, "")
    .replace(/^If approved, the measure would\s+/i, "");
  return (t.charAt(0).toUpperCase() + t.slice(1)).replace(/\.$/, "");
}
const label = (b) => b.short || plain(b.text);
// A flagged point is shown in the pamphlet's own words; in the brief, clip it so both sides scan at similar length.
function verbatimExcerpt(b, words = 18) {
  const c = b.citations[0];
  const w = c.quote.split(/\s+/);
  const q = w.length > words ? w.slice(0, words).join(" ") + "…" : c.quote;
  return `${c.filed_by ? c.filed_by.split(",")[0] + ": " : ""}“${q}”`;
}
const contestTitle = (c) => (c.type === "measure" ? `Measure ${c.items[0].measure_number}` : c.name);

function daysLeft() {
  const ms = ELECTION_DAY - new Date();
  if (ms <= 0) return "Election Day was November 3, 2026";
  const d = Math.ceil(ms / 86400000);
  return d === 1 ? "Election Day is tomorrow, November 3" : `${d} days until Election Day, November 3`;
}

function register(item, section, b, i) {
  const key = `${item.id}|${section}|${i}`;
  index.set(key, { item, section, bullet: b });
  return key;
}

function cityTopics(data) {
  const counts = new Map();
  for (const c of data.contests) {
    for (const item of c.items) {
      const seen = new Set((item.summary || []).flatMap((b) => b.topics || []));
      seen.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function stats(data) {
  const items = data.contests.flatMap((c) => c.items);
  return {
    points: items.reduce((n, i) => n + sectionsOf(i).reduce((m, s) => m + (i[s]?.length || 0), 0), 0),
    removed: items.reduce((n, i) => n + i.checks.dropped.length, 0),
    quoted: items.reduce((n, i) => n + i.checks.flagged.length, 0),
  };
}

/* ---------- Points ---------- */
function point(item, section, b, i, { topics = false } = {}) {
  const key = register(item, section, b, i);
  const match = state.topic && (b.topics || []).includes(state.topic);
  const verbatim = b.loaded_terms?.length > 0;
  return `<li><button type="button" class="point${verbatim ? " verbatim" : ""}${match ? " match" : ""}" data-key="${esc(key)}" title="See the pamphlet text this came from">
    ${esc(verbatim ? verbatimExcerpt(b) : label(b))}${topics && b.topics?.length ? `<span class="topics">${b.topics.map(esc).join(", ")}</span>` : ""}
  </button></li>`;
}

/* ---------- Candidate races ---------- */
function candidateColumn(contest, item) {
  const picked = state.picks[contest.id] === item.name;
  const pickLabel = picked ? (contest.ranked_choice ? "Your 1st choice" : "Your pick") : contest.ranked_choice ? "Mark 1st choice" : "Mark as my pick";
  const pick = `<button type="button" class="pick" data-pick="${esc(contest.id)}" data-value="${esc(item.name)}" aria-pressed="${picked}">${pickLabel}</button>`;
  const head = `<h3>${esc(item.name)}</h3><p class="party">${esc(item.ballot_party_label)}</p>`;
  if (!item.statement_filed) {
    return `<div class="cand${picked ? " picked" : ""}">${head}<p class="nostmt">Did not submit a statement to the voters' pamphlet.</p><div class="foot-row"><span></span>${pick}</div></div>`;
  }
  const job = item.background[0];
  const hasMatch = state.topic && item.summary.some((b) => (b.topics || []).includes(state.topic));
  const endorsements = item.endorsements.length
    ? `<button type="button" class="linkish endorse" data-open="${esc(contest.id)}" data-what="details">Endorsements listed</button>`
    : `<span class="endorse">No endorsements listed</span>`;
  return `<div class="cand${picked ? " picked" : ""}${hasMatch ? " has-match" : ""}">${head}
    ${job ? `<p class="job">${esc(label(job))}</p>` : ""}
    ${item.summary.length ? `<ul class="points">${item.summary.map((b, i) => point(item, "summary", b, i, { topics: true })).join("")}</ul>` : `<p class="nostmt">No priorities could be verified from the statement.</p>`}
    <div class="foot-row">${endorsements}${pick}</div>
  </div>`;
}

function compareTable(contest) {
  const filed = contest.items.filter((i) => i.statement_filed);
  const topics = [...new Set(filed.flatMap((i) => i.summary.flatMap((b) => b.topics || [])))].sort();
  if (!topics.length) return `<div class="compare"><p class="none" style="padding:12px">No topics to compare.</p></div>`;
  const rows = topics.map((t) => `<tr><th scope="row">${esc(t)}</th>${filed.map((item) => {
    const i = item.summary.findIndex((b) => (b.topics || []).includes(t));
    if (i < 0) return `<td><span class="no" aria-label="Not mentioned">·</span></td>`;
    const key = register(item, "summary", item.summary[i], i);
    return `<td><button type="button" data-key="${esc(key)}" aria-label="${esc(item.name)} on ${esc(t)}: see source"></button></td>`;
  }).join("")}</tr>`).join("");
  return `<div class="compare"><table>
    <thead><tr><th></th>${filed.map((i) => `<th scope="col">${esc(i.name)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
    <caption>A dot means the candidate's own statement raises the topic. Click a dot to read their words.</caption>
  </table></div>`;
}

function fullList(item, section) {
  const list = item[section] || [];
  if (!list.length) return `<p class="none">Nothing filed in the pamphlet.</p>`;
  return `<ul>${list.map((b, i) => {
    const key = register(item, section, b, i);
    const pages = [...new Set(b.citations.map((c) => c.page_label))].join(", ");
    return `<li><button type="button" class="full" data-key="${esc(key)}">${esc(b.text)}<span class="pg">${esc(pages)}</span></button></li>`;
  }).join("")}</ul>`;
}

function checkList(contest) {
  const rows = contest.items.flatMap((item) => {
    const who = item.type === "candidate" ? item.name : `Measure ${item.measure_number}`;
    return [
      ...item.checks.dropped.map((d) => `<li>Removed from ${esc(who)}: ${esc(d.reason)}. <q>${esc(clip(d.text, 120))}</q></li>`),
      ...item.checks.flagged.map((f) => `<li>${esc(who)}: our wording used loaded language (${esc(f.loaded_terms.join(", "))}), so the pamphlet's own words are shown.</li>`),
    ];
  });
  return `<h4>How we checked</h4><p class="none" style="font-style:normal">Every point above was matched to its quote on the cited page.${rows.length ? ` ${plural(rows.length, "item was", "items were")} caught by the safeguards:` : " Nothing was removed or rewritten."}</p>${rows.length ? `<ul class="checks">${rows.join("")}</ul>` : ""}`;
}

function candidateDetails(contest) {
  return `<div class="details">${contest.items.filter((i) => i.statement_filed).map((item) => `
    <p class="who">${esc(item.name)}</p>
    <h4>What they say, in full</h4>${fullList(item, "summary")}
    <h4>Background they list</h4>${fullList(item, "background")}
    <h4>Endorsements they list</h4>${fullList(item, "endorsements")}
    ${item.furnished_by ? `<p class="none" style="font-style:normal">Statement furnished by ${esc(item.furnished_by)}. <a href="${esc(item.verify_url)}" target="_blank" rel="noopener">Open ${esc(item.verify_label)} of the pamphlet</a></p>` : ""}`).join("")}
    ${checkList(contest)}</div>`;
}

function candidateContest(contest) {
  const open = state.open[contest.id] || {};
  const tags = [contest.district_label && `<span class="tag">${esc(contest.district_label)}</span>`, contest.ranked_choice && `<span class="tag rcv">Ranked choice</span>`].filter(Boolean).join("");
  const filed = contest.items.filter((i) => i.statement_filed).length;
  return `<section class="contest" id="c-${esc(contest.id)}">
    <div class="c-head"><h2>${esc(contest.name)}</h2>${tags}</div>
    <p class="c-sub">${plural(contest.items.length, "candidate")} in ballot order. ${filed === contest.items.length ? "All filed statements." : `${filed} filed statements.`} ${contest.ranked_choice ? "You can rank candidates in order of preference." : ""}</p>
    <div class="c-tools">
      ${filed > 1 ? `<button type="button" class="linkish" data-open="${esc(contest.id)}" data-what="compare" aria-expanded="${!!open.compare}">${open.compare ? "Hide topic comparison" : "Compare by topic"}</button>` : ""}
      ${filed ? `<button type="button" class="linkish" data-open="${esc(contest.id)}" data-what="details" aria-expanded="${!!open.details}">${open.details ? "Hide full statements" : "Full statements and sources"}</button>` : ""}
    </div>
    <div class="cands">${contest.items.map((i) => candidateColumn(contest, i)).join("")}</div>
    ${open.compare ? compareTable(contest) : ""}
    ${open.details ? candidateDetails(contest) : ""}
  </section>`;
}

/* ---------- Measures ---------- */
function measureContest(contest) {
  const m = contest.items[0];
  const open = state.open[contest.id] || {};
  const f = m.arguments_filed;
  const max = Math.max(f.for, f.against, 1);
  const pick = state.picks[contest.id];
  const filers = (side) => {
    const n = m.filers[side].length;
    return f[side] ? `${plural(f[side], "argument")} from ${plural(n, "filer")}` : "None filed";
  };
  const side = (key, title) => {
    let body;
    if (!f[key]) body = `<p class="none">${esc(m.no_arguments_note || `No arguments ${key === "for" ? "in favor" : "in opposition"} were filed for this measure.`)}</p>`;
    else if (!m[key].length) body = `<p class="none">No condensed point passed the citation check. Read the arguments in the pamphlet.</p>`;
    else body = `<ul class="points">${m[key].map((t, i) => point(m, key, t, i)).join("")}</ul>`;
    return `<section class="side"><h3>${title}</h3>${f[key] ? `<p class="by">Top points, condensed the same way for both sides</p>` : ""}${body}</section>`;
  };
  const yesNo = (v) => `<button type="button" class="pick" data-pick="${esc(contest.id)}" data-value="${v}" aria-pressed="${pick === v}">${pick === v ? `Your pick: ${v}` : `Mark ${v}`}</button>`;
  return `<section class="contest" id="c-${esc(contest.id)}">
    <div class="c-head"><h2>Measure ${esc(m.measure_number)}</h2><span class="tag">${esc(m.jurisdiction)}</span></div>
    <p class="c-sub">A yes or no vote. The title below is printed exactly as it appears on the ballot.</p>
    <div class="m-card">
      <div class="m-title">
        ${m.caption ? `<p class="caption">${esc(m.caption)}</p>` : `<p class="none">The ballot title could not be matched to the source text.</p>`}
        <p class="attr">${esc(m.source.title)}, ${esc(m.verify_label)}</p>
      </div>
      <div class="m-body">
        <section class="m-pass"><h3>If it passes</h3>${m.summary.length ? `<ul class="points">${m.summary.map((b, i) => point(m, "summary", b, i)).join("")}</ul>` : `<p class="none">No summary passed the citation check.</p>`}</section>
        <section class="balance">
          <h3>Arguments filed in the pamphlet</h3>
          <div class="bal-row" role="img" aria-label="${f.for} arguments in favor, ${f.against} in opposition">
            <span><b>${f.for}</b> for</span>
            <div class="bar"><div class="half l"><i style="width:${(f.for / max) * 100}%"></i></div><div class="mid"></div><div class="half r"><i style="width:${(f.against / max) * 100}%"></i></div></div>
            <span><b>${f.against}</b> against</span>
          </div>
          <div class="bal-note"><span>${filers("for")}</span><span>${filers("against")}</span></div>
        </section>
        ${side("for", "What supporters argue")}
        ${side("against", "What opponents argue")}
        <section class="m-foot"><span class="lbl">Your choice</span>${yesNo("Yes")}${yesNo("No")}
          <button type="button" class="linkish" style="margin-left:auto" data-open="${esc(contest.id)}" data-what="details" aria-expanded="${!!open.details}">${open.details ? "Hide full text and sources" : "Full text and sources"}</button>
        </section>
      </div>
    </div>
    ${open.details ? `<div class="details">
      ${m.question ? `<h4>Ballot question</h4><p style="font-family:var(--serif);margin:4px 0">${esc(m.question)}</p>` : ""}
      <h4>What it would do, in full</h4>${fullList(m, "summary")}
      <h4>Supporters' points, in full</h4>${m.for.length ? `<ul>${m.for.map((t, i) => { const key = register(m, "for", t, i); return `<li><button type="button" class="full" data-key="${esc(key)}">${esc(t.text)}<span class="pg">filed by ${esc(t.filed_by.join("; "))}</span></button></li>`; }).join("")}</ul>` : `<p class="none">None.</p>`}
      <h4>Opponents' points, in full</h4>${m.against.length ? `<ul>${m.against.map((t, i) => { const key = register(m, "against", t, i); return `<li><button type="button" class="full" data-key="${esc(key)}">${esc(t.text)}<span class="pg">filed by ${esc(t.filed_by.join("; "))}</span></button></li>`; }).join("")}</ul>` : `<p class="none">None.</p>`}
      ${checkList(contest)}
    </div>` : ""}
  </section>`;
}

/* ---------- Page ---------- */
function renderMain(data) {
  index = new Map();
  const s = stats(data);
  const topics = cityTopics(data);
  const decided = data.contests.filter((c) => state.picks[c.id]).length;
  const matches = state.topic
    ? data.contests.flatMap((c) => c.items.filter((i) => (i.summary || []).some((b) => (b.topics || []).includes(state.topic))).map((i) => i.name))
    : [];
  $("main").innerHTML = `
    <section class="intro">
      <h1>${esc(data.name)} ballot brief</h1>
      <p>${plural(data.contests.length, "contest")} on your November 3 ballot, condensed from the official voters' pamphlet${data.sources.length > 1 ? "s" : ""}. Tap any point to read the exact words it came from.</p>
      <p class="trust"><b>${s.points} points</b> each traced to a pamphlet page. ${s.removed} removed because their quote couldn't be found, ${s.quoted} shown in the pamphlet's own words.</p>
      ${data.coverage_note ? `<p class="coverage">${esc(data.coverage_note)}</p>` : ""}
    </section>
    ${topics.length ? `<section class="finder" aria-label="Find by topic">
      <h2>What matters to you? <span>Highlight what candidates say about a topic.</span></h2>
      <div class="chips">${topics.map(([t, n]) => `<button type="button" class="chip" data-topic="${esc(t)}" aria-pressed="${state.topic === t}">${esc(t)}<small>${n}</small></button>`).join("")}
        ${state.topic ? `<button type="button" class="clear" data-topic="">Clear</button>` : ""}</div>
      ${state.topic ? `<p class="finder-result">${matches.length ? `${plural(matches.length, "candidate")} raise ${esc(state.topic.toLowerCase())}: ${matches.map(esc).join(", ")}.` : `No candidate statements raise ${esc(state.topic.toLowerCase())}.`}</p>` : ""}
    </section>` : ""}
    <nav class="jump" aria-label="Contests">${data.contests.map((c) => `<a href="#${state.city}" data-jump="${esc(c.id)}" class="${state.picks[c.id] ? "done" : ""}">${esc(contestTitle(c))}</a>`).join("")}</nav>
    <div class="${state.topic ? "filtering" : ""}">${data.contests.map((c) => (c.type === "measure" ? measureContest(c) : candidateContest(c))).join("")}</div>`;
  return decided;
}

function renderPicks(data) {
  const decided = data.contests.filter((c) => state.picks[c.id]).length;
  const total = data.contests.length;
  const expanded = $("picks").classList.contains("expanded");
  $("picks").innerHTML = `
    <button type="button" class="linkish toggle" data-toggle-picks>${expanded ? "Hide" : "Show"}</button>
    <h2>Your picks</h2>
    <p class="progress">${decided} of ${total} contests decided</p>
    <div class="meter"><i style="width:${(decided / total) * 100}%"></i></div>
    <ol>${data.contests.map((c) => `<li><a href="#${state.city}" data-jump="${esc(c.id)}"><b>${esc(contestTitle(c))}</b>${state.picks[c.id] ? esc(state.picks[c.id]) : `<span class="open">Not decided</span>`}</a></li>`).join("")}</ol>
    <div class="actions"><button type="button" class="btn primary" data-print ${decided ? "" : "disabled"}>Print my picks</button>${decided ? `<button type="button" class="btn" data-clear-picks>Clear</button>` : ""}</div>
    <p class="privacy">Your picks stay in this browser. Ballotty never sees them and never suggests a choice.</p>`;
}

function renderSources(data) {
  $("sources").innerHTML = `Official sources for ${esc(data.name)}:<ul>${data.sources
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>, ${esc(s.publisher)} <code>sha256 ${esc(s.sha256.slice(0, 12))}</code></li>`)
    .join("")}</ul>`;
}

function paint() {
  const data = state.data[state.city];
  $("cities").innerHTML = CITIES.map((c) => `<button type="button" role="tab" data-city="${c.id}" aria-selected="${c.id === state.city}">${c.name}</button>`).join("");
  $("when").textContent = daysLeft();
  renderMain(data);
  renderPicks(data);
  renderSources(data);
}

/* ---------- Source drawer ---------- */
let lastFocus = null;
function openDrawer(key) {
  const entry = index.get(key);
  if (!entry) return;
  const { item, section, bullet } = entry;
  lastFocus = document.activeElement;
  const who = item.type === "candidate" ? `${item.name}'s statement` : section === "summary" ? `Measure ${item.measure_number} ballot title` : `Measure ${item.measure_number}, arguments ${section === "for" ? "in favor" : "in opposition"}`;
  const quotes = bullet.citations.map((c) => `
    <blockquote><mark>${esc(c.quote)}</mark></blockquote>
    ${c.filed_by ? `<p class="doc">From the argument filed by ${esc(c.filed_by)}</p>` : ""}
    <p class="doc">${esc(item.source.title)}, ${esc(c.page_label)}</p>
    <p class="ok">Found on this page by the citation check</p>
    <a class="open-pdf" href="${esc(c.url)}" target="_blank" rel="noopener">Open ${esc(c.page_label)} in the PDF</a>`).join(`<div class="sep"></div>`);
  $("drawer").innerHTML = `<button type="button" class="close" data-close>Close</button>
    <h2>Where this came from</h2>
    <p class="said">From ${esc(who)}. Ballotty's summary: <b>${esc(bullet.text)}</b></p>
    ${bullet.loaded_terms?.length ? `<p class="warn">Our wording used loaded language (${esc(bullet.loaded_terms.join(", "))}), so the pamphlet's own words are shown instead.</p>` : ""}
    ${quotes}`;
  $("drawer").hidden = false;
  $("backdrop").hidden = false;
  $("drawer").querySelector(".close").focus();
}
function closeDrawer() {
  $("drawer").hidden = true;
  $("backdrop").hidden = true;
  if (lastFocus) lastFocus.focus();
}

/* ---------- Events ---------- */
function rerender(scrollTo) {
  const y = window.scrollY;
  paint();
  if (scrollTo) document.getElementById(`c-${scrollTo}`)?.scrollIntoView({ block: "start" });
  else window.scrollTo({ top: y });
}

document.addEventListener("click", (e) => {
  const t = e.target;
  const el = (sel) => t.closest(sel);
  if (el("[data-city]")) { location.hash = el("[data-city]").dataset.city; return; }
  if (el("[data-key]")) { openDrawer(el("[data-key]").dataset.key); return; }
  if (el("[data-close]") || t === $("backdrop")) { closeDrawer(); return; }
  if (el("[data-topic]")) {
    const topic = el("[data-topic]").dataset.topic;
    state.topic = !topic || state.topic === topic ? null : topic;
    rerender();
    return;
  }
  if (el("[data-pick]")) {
    const b = el("[data-pick]");
    const id = b.dataset.pick;
    state.picks[id] = state.picks[id] === b.dataset.value ? undefined : b.dataset.value;
    if (!state.picks[id]) delete state.picks[id];
    savePicks();
    rerender();
    return;
  }
  if (el("[data-open]")) {
    const b = el("[data-open]");
    const o = (state.open[b.dataset.open] ||= {});
    o[b.dataset.what] = !o[b.dataset.what];
    rerender();
    return;
  }
  if (el("[data-jump]")) {
    e.preventDefault();
    $("picks").classList.remove("expanded");
    document.getElementById(`c-${el("[data-jump]").dataset.jump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    renderPicks(state.data[state.city]);
    return;
  }
  if (el("[data-toggle-picks]")) { $("picks").classList.toggle("expanded"); renderPicks(state.data[state.city]); return; }
  if (el("[data-clear-picks]")) { state.picks = {}; savePicks(); rerender(); return; }
  if (el("[data-print]")) {
    const data = state.data[state.city];
    $("print-sheet").innerHTML = `<h1>My picks: ${esc(data.name)}, November 3, 2026</h1><ol>${data.contests.map((c) => `<li><b>${esc(contestTitle(c))}</b>: ${esc(state.picks[c.id] || "not decided")}</li>`).join("")}</ol><p>Made with Ballotty. Ballotty does not recommend how to vote.</p>`;
    window.print();
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("drawer").hidden) closeDrawer(); });

async function route() {
  const city = location.hash.slice(1).split("/")[0];
  state.city = CITIES.some((c) => c.id === city) ? city : "eugene";
  state.topic = null;
  state.picks = loadPicks(state.city);
  if (!state.data[state.city]) {
    const res = await fetch(`data/${state.city}.json`);
    if (!res.ok) {
      $("main").innerHTML = `<p class="none">Couldn't load the ${esc(state.city)} ballot (HTTP ${res.status}). Reload the page to try again.</p>`;
      return;
    }
    state.data[state.city] = await res.json();
  }
  paint();
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);
route();
