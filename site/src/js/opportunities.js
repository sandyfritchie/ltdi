// ---------------------------------------------------------- opportunities
const WEIGHT = {
  '5y': { key: 'priority_5y', label: 'Users in five years', note: 'speakers expected to be online in five years, with a boost where that number is growing fast' },
  now: { key: 'priority_now', label: 'Users today', note: 'speakers who are online today' },
  speakers: { key: 'priority', label: 'All speakers', note: 'every speaker, online or not' },
};
let weight = '5y';
const prio = o => o[WEIGHT[weight].key] ?? o.priority;

const TEAMS = DATA.teams;
const REGION_ORDER = ['Africa', 'South Asia', 'Rest of Asia', 'Europe', 'Americas', 'Oceania'];
const REGIONS = REGION_ORDER.filter(r => LANGS.some(l => l._rg.has(r)));
// Regions are tick-boxes, so several can be looked at together (all of Asia; Africa and South Asia).
// None ticked means every region; ticking them all clears the set.
const regionSel = new Set();
const inRegion = l => !regionSel.size || [...regionSel].some(r => l._rg.has(r));
// Countries: languages spoken there (LinguaMeta's country list), several at once like regions
const countrySel = new Set();
let countryQuery = '';  // what's typed in the country drop-down's search box
const inCountry = l => !countrySel.size || [...countrySel].some(c => l._cc.has(c));
// region, country and tier together (the tier set is shared by every page)
const inView = l => inRegion(l) && inCountry(l) && (!tierSel.size || tierSel.has(tierOf(l)[0]));
const COUNTRY_NAMES = DATA.country_names || {};
// A rank, with "=" where languages share a score (and so a rank): "=1,914"
// Where the rank falls in 90% of re-scorings with other reasonable weights, goalposts and floors (ltdi.sensitivity)
const rangeText = l => l.rr && l.rr[0] !== l.rr[1] ? `${l.rr[0].toLocaleString()}–${l.rr[1].toLocaleString()}` : '';
const rankTitle = l => [l.tied ? `Tied with ${l.tied.toLocaleString()} other ${l.tied === 1 ? 'language' : 'languages'}` : '',
  rangeText(l) ? `Ranks ${rangeText(l)} under other reasonable weightings` : ''].filter(Boolean).join('\n');
const rankLabel = l => l.rank ? `${l.tied ? '=' : ''}${l.rank.toLocaleString()}` : '–';
const COUNTRY_REGION = DATA.country_regions || {}, COUNTRY_ONLINE = DATA.country_online || {};
// Speakers in view: with a region or country chosen, a language counts only its speakers in the
// countries chosen (or the chosen regions' countries), from LinguaMeta's per-country figures; online,
// each country's share of people using the internet. English in Africa is its speakers in Nigeria,
// South Africa and the rest, not its world total.
const narrowed = () => regionSel.size > 0 || countrySel.size > 0;
const countryIn = c => (!countrySel.size || countrySel.has(c)) && (!regionSel.size || regionSel.has(REGION_OF[COUNTRY_REGION[c]]));
function inViewCounts(l) {
  const cs = Object.entries(l._cs), here = cs.filter(([c]) => countryIn(c)), known = here.filter(([, n]) => n);
  if (known.length) return known;
  // no per-country figure: the whole language if all of it is in view (or it has no countries listed)
  return (!cs.length || here.length === cs.length) && l.speakers ? null : [];
}
function vSpk(l) {
  if (!narrowed()) return l.speakers;
  const k = inViewCounts(l);
  return k === null ? l.speakers : k.reduce((n, [, x]) => n + x, 0);
}
function vOn(l) {
  if (!narrowed()) return l.online;
  const k = inViewCounts(l), rate = l.speakers && l.online ? l.online / l.speakers : null;
  if (k === null) return l.online;
  const on = k.reduce((n, [c, x]) => n + x * (COUNTRY_ONLINE[c] ?? rate ?? 0), 0);
  return on || (rate == null ? null : 0);
}
const COUNTRY_N = {};  // languages listed for each country
for (const l of LANGS) for (const c of l._cc) COUNTRY_N[c] = (COUNTRY_N[c] || 0) + 1;
const COUNTRIES = Object.keys(COUNTRY_N).filter(c => COUNTRY_NAMES[c]).sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]));
// Names for the chosen countries' main languages on the areas map: the ten with the most speakers in
// each country (LinguaMeta's per-country figures, then the area they cover there), at the most central
// point of their largest piece inside it (from the areas step)
function areaLabels() {
  const L = (AREAS && AREAS.labels) || {}, seen = new Set(), out = [];
  for (const c of countrySel) {
    const rows = (L[c] || []).filter(([code]) => BY[code] && !BY[code].extinct && inView(BY[code]) && onMap(BY[code]));
    rows.sort((a, b) => (BY[b[0]]._cs[c] || 0) - (BY[a[0]]._cs[c] || 0) || b[3] - a[3]);
    for (const r of rows.slice(0, 10)) if (!seen.has(r[0])) { seen.add(r[0]); out.push(r); }
  }
  return out;
}
// Two hundred countries: the drop-down has a search box, and lists the ticked ones first
function countryPicker() {
  const opts = [...COUNTRIES].sort((a, b) => countrySel.has(b) - countrySel.has(a));
  const label = !countrySel.size ? 'All countries' : COUNTRIES.filter(c => countrySel.has(c)).map(c => COUNTRY_NAMES[c]).join(', ');
  const q = countryQuery.trim().toLowerCase();
  return `<details class="msel" id="ctrysel"><summary aria-label="Countries">${esc(label)}</summary><div class="msel-pop long">
    <input type="search" class="msel-find" placeholder="Find a country" aria-label="Find a country" value="${esc(countryQuery)}">
    ${opts.map(c => `<label data-name="${esc(COUNTRY_NAMES[c].toLowerCase())} ${c}"${q && !COUNTRY_NAMES[c].toLowerCase().includes(q) && c !== q && !countrySel.has(c) ? ' hidden' : ''}><input type="checkbox" value="${c}"${countrySel.has(c) ? ' checked' : ''}>${esc(COUNTRY_NAMES[c])} <span class="cnt">${COUNTRY_N[c].toLocaleString()}</span></label>`).join('')}
    ${countrySel.size ? '<button type="button" class="msel-clear">Show all countries</button>' : ''}</div></details>`;
}
// The country drop-down: as wireMsel, plus its search box, which filters the list as you type and
// keeps its text and focus when ticking redraws the list
function wireCountries(wrap, draw) {
  const d = $(`#${wrap} details`), find = d.querySelector('.msel-find');
  const filter = () => {
    const q = find.value.trim().toLowerCase(); countryQuery = find.value;
    d.querySelectorAll('label[data-name]').forEach(lab => {
      lab.hidden = !!q && !lab.dataset.name.includes(q) && !lab.querySelector('input').checked;
    });
  };
  find.oninput = filter;
  d.ontoggle = () => { if (d.open && document.activeElement !== find) find.focus(); };  // opened: type straight away
  find.onkeydown = e => {  // Enter ticks the first country shown
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = find.value.trim().toLowerCase();
    const shown = [...d.querySelectorAll('label[data-name]')].filter(lab => !lab.hidden && !lab.querySelector('input').checked);
    const first = shown.find(lab => lab.dataset.name.startsWith(q)) || shown.find(lab => lab.dataset.name.split(' ').pop() === q) || shown[0];
    if (first) { const box = first.querySelector('input'); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  const redraw = () => {
    $(`#${wrap}`).innerHTML = countryPicker(); const nd = $(`#${wrap} details`); nd.open = true;
    wireCountries(wrap, draw); const f = nd.querySelector('.msel-find'); f.focus(); f.setSelectionRange(f.value.length, f.value.length);
  };
  d.onchange = e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) { countrySel.add(e.target.value); countryQuery = ''; } else countrySel.delete(e.target.value);
    redraw(); draw();
  };
  d.onclick = e => { if (e.target.closest('.msel-clear')) { countrySel.clear(); countryQuery = ''; redraw(); draw(); } };
}
const regionPicker = () => msel('regsel', regionSel, REGIONS.map(r => [r, r, '', ` <span class="cnt">${LANGS.filter(l => l._rg.has(r)).length.toLocaleString()}</span>`]),
  'All regions', 'All regions', '', 'Show all regions');
const regionNames = () => { const r = countrySel.size ? COUNTRIES.filter(c => countrySel.has(c)).map(c => COUNTRY_NAMES[c]) : REGIONS.filter(x => regionSel.has(x)); return r.length < 3 ? r.join(' and ') : `${r.slice(0, -1).join(', ')} and ${r.at(-1)}`; };
// The map frame for the countries ticked (their outlines, and a box around their mainlands), else
// for the regions ticked: their outlines together, and a box around them all
function regionFrame() {
  const C = GEO.basemap.countries, cs = C ? [...countrySel].map(c => C[c]).filter(Boolean) : [];
  const R = GEO.basemap.regions, fs = cs.length ? cs : R ? [...regionSel].map(r => R[r]).filter(Boolean) : [];
  if (!fs.length) return null;
  if (fs.length === 1) return fs[0];
  return { outline: fs.map(f => f.outline).join(''), box: [Math.min(...fs.map(f => f.box[0])), Math.min(...fs.map(f => f.box[1])),
    Math.max(...fs.map(f => f.box[2])), Math.max(...fs.map(f => f.box[3]))] };
}
// After a view redraws itself, open its drop-down again so several boxes can be ticked in a row
document.addEventListener('click', e => {
  document.querySelectorAll('details.msel[open], details.info[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('details.msel[open], details.info[open]').forEach(d => { d.open = false; d.querySelector('summary')?.focus(); });
});
// A small "i" after a fact, opening a note about it (where its figures come from, how it's counted)
function infoTip(label, html) {
  return `<details class="info"><summary aria-label="${esc(label)}" title="${esc(label)}">i</summary><div class="info-pop" role="note">${html}</div></details>`;
}
// keep an opened note inside the window
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!(d instanceof HTMLElement) || !d.matches('details.info') || !d.open) return;
  const pop = d.querySelector('.info-pop');
  pop.style.left = '';
  const r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 12);
  if (over > 0) pop.style.left = `${-8 - over}px`;
}, true);
const reopen = wrap => { const d = $(`#${wrap} details`); if (d) d.open = true; };
const reopenCountries = wrap => { const d = $(`#${wrap} details`); if (!d) return; d.open = true;
  const f = d.querySelector('.msel-find'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } };
// One opportunity as on a language's page: the action, its one line and its size; the language named
// above it where the list spans languages
function oppItem(o, l, showLang) {
  return `<a class="otile" href="#opp-${o.id}" title="${esc(o.title)}">
    <span class="osize" title="Effort, from what's openly available">${esc(o.size)}</span>${showLang ? `<span class="olang">${esc(l.name)}</span>` : ''}<b>${esc(o.short || o.title)}</b>${o.fact ? `<small>${esc(o.fact)}</small>` : ''}${provider !== 'All' ? provMissing(o, l, provider).map(n => `<small class="opp-prov"><span class="xmark" aria-label="Not in">\u2717</span>${esc(n)}</small>`).join('') : ''}</a>`;
}

// Grouped by language, each language where its best opportunity ranks; languages whose one opportunity is
// to start documenting them share a group at the end, named by that action, with the languages as links
function oppGroups(list) {
  const by = new Map();
  for (const x of list) {
    if (!by.has(x.l.code)) by.set(x.l.code, { l: x.l, n: x.n, items: [] });
    by.get(x.l.code).items.push(x.o);
  }
  const out = [], doc = { doc: true, langs: [] };
  for (const g of by.values()) (g.items.length === 1 && g.items[0].key === 'document' ? doc.langs : out).push(g);
  return doc.langs.length ? [...out, doc] : out;  // the documentation list always last
}
const GROUPS_SHOWN = 20, DOC_SHOWN = 60;
// speakers, after the name: in the countries or regions chosen, else everywhere
const spk = g => { const n = g.n ?? g.l.speakers; return n ? ` <span class="ospk">${people(n)}</span>` : ''; };
function oppGroup(g) {
  if (!g.doc) return `<section class="ogroup"><h2 class="ogh"><a href="${LH(g.l.code)}">${esc(g.l.name)}</a>${spk(g)}</h2>
    <div class="otiles" style="--c:var(--opp)">${g.items.map(o => oppItem(o, g.l, false)).join('')}</div></section>`;
  const names = docAll ? g.langs : g.langs.slice(0, DOC_SHOWN);
  return `<section class="ogroup"><h2 class="ogh">Start documenting it</h2>
    <div class="ochips" style="--c:var(--opp)">${names.map(x => `<a class="ochip" href="#opp-${x.items[0].id}">${esc(x.l.name)}${spk(x)}</a>`).join('')}${g.langs.length > names.length ? `<button type="button" class="chip" id="docall">And ${(g.langs.length - names.length).toLocaleString()} more</button>` : ''}</div></section>`;
}

let team = 'all', shownGroups = GROUPS_SHOWN, docAll = false;
let withVarieties = false;  // varieties whose speakers write a major standard (Egyptian Arabic, Wu): off by default, as on the Plan page
async function opportunities(lang) {
  const focus = lang && BY[lang] ? BY[lang] : null;
  if (focus) await need(focus.code);
  else if (!narrowed()) await topOpps();
  // with countries or regions chosen, ranked by reach there: each language's speakers in those places
  const pool = focus ? focus.opportunities.map(o => ({ o, l: focus })) : narrowed() ? await countryPool()
    : TOP.map(o => ({ o, l: BY[o.lang] })).filter(x => inView(x.l));
  const all = pool
    .filter(x => provider === 'All' || provMissing(x.o, x.l, provider).length)
    .filter(x => withVarieties || !x.l.wi || focus)
    .sort((a, b) => prio(b.o) - prio(a.o));
  const byTeam = all.filter(x => team === 'all' || x.o.teams.includes(team));
  const tcount = Object.fromEntries(Object.keys(TEAMS).map(k => [k, all.filter(x => x.o.teams.includes(k)).length]));
  const groups = oppGroups(byTeam), shown = groups.slice(0, shownGroups);
  const filtered = regionSel.size || ((tierSel.size || countrySel.size) && !focus) || provider !== 'All' || team !== 'all' || withVarieties || focus;
  $('#view').innerHTML = `
    <div class="controls">
      ${focus ? '' : `<span id="orwrap">${regionPicker()}</span><span id="octrywrap">${countryPicker()}</span><span id="otierwrap">${tierPicker()}</span>`}
      ${providerSelect('opsel')}
      <select id="tmsel" aria-label="What your team works on"><option value="all">Every team (${all.length})</option>${Object.entries(TEAMS).filter(([k]) => tcount[k]).map(([k, t]) => `<option value="${k}"${team === k ? ' selected' : ''}>${esc(t)} (${tcount[k]})</option>`).join('')}</select>
      <label class="switch wrap"><input type="checkbox" role="switch" id="op-var"${withVarieties ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Include varieties of major languages</label>
      <button type="button" class="reset" id="oresetf"${filtered ? '' : ' hidden'}>Reset filters</button>
    </div>
    ${focus ? `<div class="lhead"><h2>${esc(focus.name)} <span class="auto">${all.length} opportunities</span></h2><a href="${LH(focus.code)}">Language profile</a></div>` : ''}
    ${shown.length ? `<div class="opp-list">${shown.map(oppGroup).join('')}</div>` : '<p class="note">Nothing matches these filters.</p>'}
    ${groups.length > shown.length ? `<button class="chip more" id="showmore">Show more languages</button>` : ''}`;
  $('#op-var').onchange = e => { withVarieties = e.target.checked; shownGroups = GROUPS_SHOWN; docAll = false; opportunities(lang); };
  $('#tmsel').onchange = e => { team = e.target.value; shownGroups = GROUPS_SHOWN; docAll = false; opportunities(lang); };
  $('#oresetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); provider = 'All'; team = 'all'; withVarieties = false; shownGroups = GROUPS_SHOWN; docAll = false;
    if (lang) go('opportunities'); else opportunities(); };
  if ($('#orwrap')) wireMsel('orwrap', regionPicker, regionSel, REGIONS.length, async () => { shownGroups = GROUPS_SHOWN; docAll = false; await opportunities(lang); reopen('orwrap'); });
  if ($('#octrywrap')) wireCountries('octrywrap', async () => { shownGroups = GROUPS_SHOWN; docAll = false; await opportunities(lang); reopenCountries('octrywrap'); });
  if ($('#otierwrap')) wireMsel('otierwrap', tierPicker, tierSel, TIER_KEYS.length, async () => { shownGroups = GROUPS_SHOWN; docAll = false; await opportunities(lang); reopen('otierwrap'); });
  $('#opsel').onchange = e => { provider = e.target.value; team = 'all'; shownGroups = GROUPS_SHOWN; docAll = false; opportunities(lang); };
  const more = $('#showmore'); if (more) more.onclick = () => { shownGroups += GROUPS_SHOWN; opportunities(lang); };
  const da = $('#docall'); if (da) da.onclick = () => { docAll = true; opportunities(lang); };
  navBox('opps', 'Find a language name or code', focus ? `${focus.name} (${focus.code})` : '');
}

// The kind of resource, for the starter kit's subheadings (shown when a kit holds more than one kind)
const KIT_GROUP = [[/^asr_open_/, 'Speech-to-text models'], [/^tts_open_/, 'Text-to-speech voices'],
  [/^llm_/, 'LLMs'], [/^mt_open_/, 'Translation models'], [/^ocr_open_/, 'Text recognition models'],
  [/^kb_open_/, 'Keyboard layouts'], [/^proof_/, 'Spell-checkers'], [/^ui_/, 'Volunteer translations'],
  [/^massive_/, 'Voice assistant data'], [/^(speech_fleurs|flores|belebele)/, 'Test sets'], [/^(cv_|speech_|open_speech)/, 'Speech data'],
  [/^parallel_/, 'Parallel text'], [/^(web_text|wikipedia|ud_)/, 'Text'], [/^cldr/, 'Locale data'], [/^font_/, 'Fonts']];
function kitGroups(kit) {
  const out = new Map();
  for (const k of kit) {
    const g = (KIT_GROUP.find(([re]) => re.test(k.id)) || [, 'Other resources'])[1];
    out.set(g, [...(out.get(g) || []), k]);
  }
  return [...out];
}

async function oppDetail(id) {
  const l = BY[id.split('-')[0]];
  if (!l) return opportunities();
  await need(l.code);
  const o = l.opportunities.find(y => y.id === id);
  if (!o) return opportunities();
  const facts = DATA.facts[l.code] || {};
  // people, then their share in the ranking table's colours
  // where it's spoken in more than one country, the totals under the counts
  const total = cs => {
    if (cs.length < 2) return '';
    const spk = cs.reduce((a, c) => a + (c.speakers || 0), 0);
    const col = k => { const known = cs.filter(c => c[k] != null); return known.length ? known.reduce((a, c) => a + c.speakers * c[k], 0) / spk : null; };
    return `<tfoot><tr><th scope="row">Total</th><td class="num">${people(spk)}</td>${['online', 'text', 'online_5y'].map(k => `<td class="num">${share(spk, col(k))}</td>`).join('')}</tr></tfoot>`;
  };
  const share = (n, v) => v == null ? '—' : `${people(n * v)} <span class="pct p${pctBand(v)}">(${Math.round(v * 100)}%)</span>`;
  const kit = o.kit.length ? `<div class="tablebox"><table class="otab">
      <thead><tr><th>Resource</th><th>What it is</th><th>Quantity/Availability</th><th>Licence</th><th>Commercial use</th></tr></thead>
      <tbody>${kitGroups(o.kit).map(([g, ks], _, all) => (all.length > 1 ? `<tr class="kgroup"><th colspan="5" scope="colgroup">${esc(g)}</th></tr>` : '')
        + ks.map(k => `<tr><td><a href="${esc(k.link)}" target="_blank" rel="noopener">${esc(k.name)}</a></td><td>${esc(k.what)}</td><td class="nw">${esc(k.size)}</td><td class="nw">${esc(k.licence || '—')}</td><td class="nw">${esc(COMMERCIAL[k.commercial] || '—')}</td></tr>`).join('')).join('')}</tbody></table></div>`
    : '<p class="note">No open resources found yet in the sources tracked.</p>';
  const countries = l.reach_by_country.length ? `<div class="tablebox"><table class="otab opp-reach">
      <thead><tr><th>Country</th><th class="num">Speakers</th><th class="num">Online today</th><th class="num">Online and able to text</th><th class="num">Online in five years</th></tr></thead>
      <tbody>${l.reach_by_country.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${people(c.speakers)}</td>${[c.online, c.text, c.online_5y].map(v => `<td class="num">${share(c.speakers, v)}</td>`).join('')}</tr>`).join('')}</tbody>${total(l.reach_by_country)}</table></div>` : '';
  // every source this card checked, with what it records for the language (or that it doesn't list it)
  // Yes first, then the other sources that record something, then those with no result for the language
  // services and benchmarks only: datasets are linked in "Ready to use" above
  const kitIds = new Set(o.kit.map(k => k.id));
  const isData = i => i in CFG.data.indicators || /^(cv_|speech_|massive_)/.test(i);
  const ids = (o.checked || o.evidence).filter(i => !kitIds.has(i) && !isData(i));
  const yes = i => facts[i] && showValue(facts[i]) === 'Yes';
  const checked = [...ids.filter(yes), ...ids.filter(i => facts[i] && !yes(i)), ...ids.filter(i => !facts[i])].map(i => {
    const f = facts[i], name = (SVC[i] ? `${SVC[i][0]}${SVC[i][1] ? ` \u2013 ${SVC[i][1]}` : ''}` : '') || L[i] || (f && f.source) || i;
    if (!f) return `<tr><td>${esc(name)}</td><td class="muted">${ROLE_OF[i] === 'measured' ? 'No published result' : 'Not listed'}</td><td class="nw">—</td><td></td></tr>`;
    const v = showValue(f), yn = v === 'Yes' ? ' class="yn-yes"' : v === 'No' ? ' class="yn-no"' : '';
    return `<tr><td><a href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener">${esc(name)}</a></td><td${yn}>${esc(v)}</td><td class="nw">${esc(fmtDay(f.retrieved))}</td><td class="onote">${esc(f.note || '')}</td></tr>`;
  }).join('');
  const needs = o.needs || [[o.gap_text || o.title, o.missing], ...(o.also || [])];
  $('#view').innerHTML = `
    <button class="back" id="back">← Back to ${esc(l.name)}</button>
    <div class="opp-hero" style="--c:var(--opp)">
      <h2>${esc(o.short || o.title)}</h2>
      ${o.fact ? `<p class="why">${esc(o.fact)}</p>` : ''}
      <div class="opp-foot"><span></span><button class="chip" id="copylink">Copy link</button></div>
    </div>
    <h3 class="panel-h">Ready to use</h3>${kit}
    <h3 class="panel-h">Still needed</h3><div class="tablebox"><table class="otab">
      <thead><tr><th>Gap</th><th>Notes</th></tr></thead>
      <tbody>${needs.map(([g, w]) => `<tr><td>${esc(g)}</td><td>${esc(w)}</td></tr>`).join('')}</tbody></table></div>
    ${countries ? `<h3 class="panel-h">Who it would reach</h3>${countries}` : ''}
    <details class="osrc"><summary>${TW}<h3 class="panel-h">Sources checked</h3></summary>${checked ? `<div class="tablebox"><table class="otab">
      <thead><tr><th>Source</th><th>For ${esc(l.name)}</th><th>Retrieved</th><th>Notes</th></tr></thead>
      <tbody>${checked}</tbody></table></div>` : '<p class="note">Every data and technology source tracked here; none records anything for this language.</p>'}</details>
    <p class="note">Something here out of date, or a resource we've missed? <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">Send a correction on GitHub</a> or email <span class="email">${CORRECTIONS_EMAIL}</span>.</p>`;
  $('#back').onclick = () => { go('lang-' + l.code); };
  $('#copylink').onclick = async e => {
    const url = location.href.split('#')[0] + '#opp-' + o.id;
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; }
    catch { e.target.textContent = url; }
  };
}

