
// The public site loads its data as data/index.js (window.LTDI_DATA, LTDI_MAP, LTDI_LANGS) and gives each
// language its own address, /language/<code>; the preview inlines the data and uses #lang-<code>.
const DATA = window.LTDI_DATA || JSON.parse(document.getElementById('ltdi-data').textContent);
const PATHS = !!window.LTDI_DATA;
const LH = code => PATHS ? `/language/${code}` : `#lang-${code}`;  // a language page's address
// The current view: lang-yo for /language/yo, otherwise what follows the #
function curRoute() {
  const m = PATHS && location.pathname.match(/^\/language\/([a-z0-9]+)\/?$/);
  return m && (!location.hash || location.hash.startsWith('#lang-')) ? 'lang-' + m[1] : location.hash.slice(1);
}
// Go to a view: languages by their path, everything else by its # on the home page
function go(h) {
  if (!PATHS) { location.hash = h; return; }
  const m = h.match(/^lang-([a-z0-9]+)$/);
  history.pushState(null, '', m ? `/language/${m[1]}` : '/#' + h);
  route();
}
const REGION_OF = { A: 'Africa', S: 'South Asia', R: 'Rest of Asia', E: 'Europe', M: 'Americas', O: 'Oceania' };
// Extinct languages keep their pages and turn up in search, but are left out of the ranking, totals,
// charts and map (LANGS) unless chosen in the ranking's endangerment drop-down
const ALL = DATA.languages, BY = Object.fromEntries(ALL.map(l => [l.code, l]));
const LANGS = ALL.filter(l => !l.extinct);
const CFG = DATA.config.dimensions, L = DATA.labels;
// The page carries an index (every language's scores, coverage and gaps, and the top opportunities).
// Each language's own detail (facts, opportunities, reach by country) is embedded when small,
// otherwise fetched the first time one of its pages opens, from data/lang/<shard>.json, which holds
// the detail of the languages in that shard (so the site is a few dozen files, not thousands).
const EMBED = window.LTDI_DATA ? window.LTDI_LANGS || null : JSON.parse(document.getElementById('ltdi-langs').textContent || 'null');
const SHARDS = {};
const shard = n => SHARDS[n] ??= fetch(`data/lang/${n}.json`).then(r => r.json());
const RULES = DATA.rules, RES = DATA.resources;
DATA.facts = {};
const LEVEL_CODE = { f: 'full', p: 'part', o: 'open', n: 'none' };
const GAP_CODE = { n: 'none', o: 'open' };
for (const l of ALL) {
  // the compact per-language fields (build_site.compact), back to their usual shape
  l.gaps = {};
  if (l.gx) [...l.gx].forEach((c, i) => { if (GAP_CODE[c]) l.gaps[DATA.gap_order[i]] = GAP_CODE[c]; });
  l.scores = Object.fromEntries(DATA.dim_order.map((k, i) => [k, l.s[i]]));
  l.raw = l.rw ? Object.fromEntries(DATA.dim_order.map((k, i) => [k, l.rw[i]]).filter(([, v]) => v != null)) : null;
  l.endangerment = l.en != null ? DATA.endangerment_levels[l.en] : null;
  l.opportunity_count = l.oc;
  // its countries, with speakers there where LinguaMeta gives them ("us:319000000 gb:64000000 jm")
  l._cs = Object.fromEntries((l.cc || '').split(' ').filter(Boolean).map(t => { const [c, n] = t.split(':'); return [c, n ? +n : null]; }));
  l._cc = new Set(Object.keys(l._cs));
  l._im = new Set((l.im || '').split(' ').filter(Boolean));  // countries where only immigrant communities speak it
  l._sc = (l.sc || '').split(' ').filter(Boolean);  // its scripts, main one first
  l._fx = (l.fx || '').split('');  // engineering flags (DATA.flags)
  l._of = Object.fromEntries((l.of || '').split(' ').filter(Boolean).map(t => { const [c, st] = t.split(':'); return [c, st || 'o']; }));  // official status by country (CLDR)
  l._gp = l.gp ? l.gp.split(' ').map(x => parseInt(x, 36)) : [];  // Glottolog groups above it, family first (DATA.gnodes)
  l._csc = Object.fromEntries((l.csc || '').split(' ').filter(Boolean).map(t => { const [c, v] = t.split('='); return [c, v.split(',')]; }));
  // every region it's spoken in, not just its home: English counts in the Americas and Oceania too
  l._rg = new Set([...(l.rg || '')].map(c => REGION_OF[c]).concat(l.region ? [l.region] : []));
  l._offers = new Set(l.offers.map(i => DATA.services[i].id));
  l.levels = Object.fromEntries(Object.keys(CFG.tech.technologies).map((t, i) => [t, LEVEL_CODE[l.levels[i]]]));
  l.dimensions = Object.fromEntries(Object.entries(l.scores).map(([k, v]) => [k, { score: v, indicators: {} }]));
}
// An opportunity carries only what differs by language; the rest is on its rule
const withRule = (o, lang) => ({ ...RULES[o.key], ...o, id: `${lang}-${o.key}` });
// The top opportunities worldwide (data/top_opportunities.json), fetched when the Opportunities tab first needs them
let TOP = [], TOPP;
const topOpps = () => TOPP ??= fetch('data/top_opportunities.json').then(r => r.json()).catch(() => []).then(t => (TOP = t.map(o => withRule(o, o.lang))));
// With countries chosen, the opportunities are those countries' own top ones (data/country_opportunities.json,
// fetched once), ranked by reach there: each one's potential users scaled to the language's speakers in
// the countries chosen, then priority = reach x (gap x need / cost) [x momentum], as for the global list
let COPP = null;
// What changed, and when (ltdi.changes): fetched the first time a language page needs it
// The over-time history, for the Charts page only (data/history.json), fetched when that first opens
let HIST = null, HISTP;
const histData = () => HISTP ??= fetch('data/history.json').then(r => r.json()).catch(() => null).then(h => (HIST = h));
const countryOpps = () => COPP ??= fetch('data/country_opportunities.json').then(r => r.json())
  .then(d => ({ ...d, items: d.items.map(o => withRule(o, o.lang)) }));
async function countryPool() {
  const d = await countryOpps(), here = new Map();
  for (const c of countrySel) for (const [i, n] of d.by_country[c] || []) here.set(i, (here.get(i) || 0) + n);
  const reach = n => Math.max(0, Math.log10(Math.max(n, 1)) - 4);
  return [...here].map(([i, n]) => {
    const o = d.items[i], f = Math.min(1, n / (o.u[0] || n));
    return { o: { ...o, priority: reach(o.u[0] * f) * o.b, priority_now: reach(o.u[1] * f) * o.b, priority_5y: reach(o.u[2] * f) * o.b * o.m }, l: BY[o.lang] };
  }).filter(x => x.l && inView(x.l));
}
async function need(...codes) {
  await Promise.all(codes.filter(c => BY[c] && !BY[c].opportunities).map(async c => {
    const d = EMBED ? EMBED[c] : (await shard(BY[c].shard))[c];
    const l = BY[c];
    const facts = { ...DATA.fact_defaults };
    for (const i of d.lacks || []) delete facts[i];
    const decode = fs => Object.fromEntries(Object.entries(fs).map(([i, [value, s, note]]) => {
      const [source, u, retrieved, method] = DATA.sources[s], url = u.replaceAll('{lang}', c);
      return [i, { value, unit: DATA.units[i], source, url, retrieved, method, note: note || '' }];
    }));
    DATA.facts[c] = decode({ ...facts, ...d.facts });
    // a spoken variety: the values counted from the standard it writes, beside its own
    if (d.via) { (DATA.via ||= {})[c] = decode(d.via.facts); l.via_dims = d.via.dimensions; }
    Object.assign(l, { dimensions: d.dimensions, reach_by_country: d.reach_by_country, countries: d.countries,
                       script_names: d.script_names, note: d.note, source: d.source, written_in: d.written_in, shares_written: d.shares_written,
                       script_source: d.script_source, endangerment_source: d.endangerment_source, joshi: d.joshi, ud: d.ud, census: d.census, sample: d.sample, hear: d.hear, evidence: d.evidence, lookalikes: d.lookalikes, literacy: d.literacy, orgs: d.orgs, changes: d.changes });
    l.opportunities = d.opportunities.map(o => ({ ...withRule(o, c), kit: o.kit.map(([i, size]) => ({ ...RES[i], size })) }));
  }));
}
// Language pickers: a text box with its own type-ahead list, since a menu of seven thousand names is
// too long to scroll. It matches other names too (Cantonese finds Yue Chinese) but shows only each
// language's name, autonym and code: other-name data is uneven, so it isn't displayed.
function langPicker(id, placeholder, current) {
  return `<span class="pickwrap"><input class="pick" id="${id}" autocomplete="off" role="combobox" aria-autocomplete="list"
    aria-expanded="false" aria-controls="${id}-list" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}"
    value="${current ? esc(`${current.name} (${current.code})`) : ''}" onfocus="this.select()"><ul class="picklist" id="${id}-list" role="listbox" hidden></ul></span>`;
}
function pickMatches(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const rank = l => {
    const n = l.name.toLowerCase(), a = (l.autonym || '').toLowerCase();
    if (l.code.toLowerCase() === q || (l.iso_639_3 || '') === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    if (a.includes(q)) return 3;
    if (altNames(l).some(x => x.toLowerCase().includes(q))) return 4;
    return 9;
  };
  // A language found only by another name shows that one name ("also Cantonese"), as the ranking does
  return ALL.map(l => [rank(l), l]).filter(([r]) => r < 9)
    .sort((x, y) => x[0] - y[0] || (y[1].speakers || 0) - (x[1].speakers || 0)).slice(0, 12)
    .map(([r, l]) => ({ l, also: r === 4 ? altNames(l).find(x => x.toLowerCase().includes(q)) : null }));
}
(function wirePickers() {
  const listOf = inp => document.getElementById(inp.id + '-list');
  const close = inp => { const ul = listOf(inp); if (ul) { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); } };
  const choose = (inp, { l }) => { inp.value = `${l.name} (${l.code})`; close(inp); inp.dispatchEvent(new Event('change', { bubbles: true })); };
  const show = inp => {
    const ul = listOf(inp), found = pickMatches(inp.value);
    ul._found = found; ul._active = found.length ? 0 : -1;
    ul.innerHTML = found.map(({ l, also }, i) => `<li role="option" id="${inp.id}-o${i}" data-i="${i}" aria-selected="${i === 0}">${esc(l.name)}
      <span class="auto">${also ? `also ${esc(also)}` : esc(l.autonym && l.autonym !== l.name ? l.autonym : '')} [${l.code}]</span></li>`).join('')
      || '<li class="none" aria-disabled="true">No language found</li>';
    ul.hidden = !inp.value.trim();
    inp.setAttribute('aria-expanded', String(!ul.hidden));
  };
  const move = (inp, d) => {
    const ul = listOf(inp); if (ul.hidden || !ul._found?.length) return;
    ul._active = (ul._active + d + ul._found.length) % ul._found.length;
    ul.querySelectorAll('li[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === ul._active)));
    const li = ul.children[ul._active]; li.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', li.id);
  };
  document.addEventListener('input', e => { if (e.target.matches?.('input.pick') && !(e.target.id === 'go' && navMode === 'filter')) show(e.target); });
  document.addEventListener('keydown', e => {
    const inp = e.target; if (!inp.matches?.('input.pick')) return;
    const ul = listOf(inp);
    if (inp.id === 'go' && navMode === 'filter') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); ul.hidden ? show(inp) : move(inp, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(inp, -1); }
    else if (e.key === 'Enter') { const l = ul?._found?.[ul._active]; if (!ul.hidden && l) { e.preventDefault(); choose(inp, l); } }
    else if (e.key === 'Escape') close(inp);
  });
  document.addEventListener('mousedown', e => {
    const li = e.target.closest?.('.picklist li[role=option]');
    if (!li) return;
    e.preventDefault();  // keep focus in the box until the choice is made
    const inp = li.closest('.pickwrap').querySelector('input.pick');
    choose(inp, listOf(inp)._found[+li.dataset.i]);
  });
  document.addEventListener('focusout', e => { if (e.target.matches?.('input.pick')) close(e.target); });
})();
const pickedCode = v => { const m = /\(([^()]+)\)\s*$/.exec(v || ''); return m && BY[m[1]] ? m[1] : null; };
// The search box beside the tabs does what suits the page (each view sets it with navBox):
//   filter   the ranking: filters the list as you type, no drop-down (navFilter redraws it)
//   opps     opportunities: the drop-down's choice filters them to that language
//   map      charts: the choice is found on the map
//   go       anywhere else: the choice's page opens
let navMode = 'go', navFilter = null;
function navBox(mode, placeholder, value = '') {
  const inp = document.getElementById('go');
  navMode = mode; navFilter = null;
  inp.placeholder = placeholder; inp.setAttribute('aria-label', placeholder);
  inp.setAttribute('role', mode === 'filter' ? 'searchbox' : 'combobox');
  inp.value = value;
  const ul = document.getElementById('go-list'); ul.hidden = true;
  // a combobox says whether its list is open; a plain search box has no list
  if (mode === 'filter') { inp.removeAttribute('aria-expanded'); inp.removeAttribute('aria-controls'); }
  else { inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', 'go-list'); }
}
document.getElementById('go').addEventListener('input', e => {
  if (navMode === 'filter' && navFilter) navFilter(e.target.value);
  if (navMode === 'opps' && !e.target.value && /^opportunities-/.test(curRoute())) go('opportunities');  // cleared: all again
});
document.getElementById('go').addEventListener('change', e => {
  if (navMode === 'filter') return;
  const c = pickedCode(e.target.value);
  if (navMode === 'opps') {  // a language filters the opportunities; an empty box shows them all
    if (c) go('opportunities-' + c);
    else if (!e.target.value.trim()) go('opportunities');
    return;
  }
  if (!c) return;
  e.target.value = ''; e.target.blur();
  if (navMode === 'map' && GEO && document.getElementById('worldmap')) {
    mapFocus = c; mapFocusFresh = true;
    const y = scrollY; mapPage(); scrollTo(0, y);  // the page stays put, so the box stays in reach
  } else go('lang-' + c);
});
const DIMS = [['tech', 't', '--tech'], ['data', 'd', '--data']];  // the order on a language's page
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OT = DATA.opportunity_types;
const OCOLOR = { share: '--tech', measure: '--accent', standardise: '--writing', improve: '--tier-h', collect: '--data' };
const OBLURB = {
  share: 'The data or models exist. Open them up in a shared format, or launch the product.',
  measure: 'No public benchmark or error rate yet, so nobody can tell how good support is.',
  standardise: 'Foundational locale data is incomplete, which blocks other work.',
  improve: 'Support exists, but quality lags well behind English.',
  collect: 'The data really is scarce and has to be created.',
};
const TECHL = { keyboard: 'Keyboard', speech_input: 'Speech input', tts: 'Text-to-speech', mt: 'Translation', llm: 'LLMs',
  interface: 'Interface language', ocr: 'Text recognition', proofing: 'Spelling and grammar', assistant: 'Voice assistant', langid: 'Language identification', locale: 'Locale data', writing: 'Writing system', data: 'Data' };
// Where the floor lifts a dimension, its unfloored score: what the rank goes by among languages the floor puts level
const rawText = l => l.raw ? `Before the floor of ${DATA.config.meta.floor}: ${DIMS.filter(([k]) => k in l.raw).map(([k]) => `${CFG[k].label.toLowerCase()} ${l.raw[k].toFixed(3)}`).join(', ')}` : '';
document.getElementById('edition').textContent = `Edition ${DATA.edition} · ${LANGS.length.toLocaleString()} languages`;

// A language's tier [key, label]; or of a tier key ("through German": the standard's tier)
const tierOf = l => { const k = typeof l === 'string' ? l : l.tier; return [k, TIER_LABEL[k] || k]; };
const tierChip = l => { const [c, t] = tierOf(l); return `<span class="tier ${c}"${TIER_DESC[c] ? ` title="${esc(TIER_DESC[c])}"` : ''}>${esc(t)}</span>`; };
function people(n) {
  if (!n) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}
function big(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}
function showValue(f) {
  if (!f) return 'not collected';
  const v = f.value;
  if (f.unit === 'bool') return v ? 'Yes' : 'No';
  if (f.unit === 'level 0-3') return ['Not in CLDR', 'Basic', 'Moderate', 'Modern'][v] ?? v;
  if (f.unit === 'words') return big(v) + ' words';
  if (f.unit === 'hours') return (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) + ' h';
  if (f.unit === 'articles') return big(v) + ' articles';
  if (f.unit === '% of English') return v + '% of English';
  if (/^features of \d+$/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()} features`;
  if (f.unit === 'accuracy') return (v * 100).toFixed(1) + '% accuracy';
  if (/^types of/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()} voice types`;
  if (f.unit === '% WER') return v >= 100 ? 'No published WER under 50%' : v + '% WER';
  if (f.unit === 'editors') return big(v) + ' active editors';
  if (f.unit === 'sentence pairs') return big(v) + ' sentence pairs';
  if (f.unit === 'datasets') return big(v) + ' datasets';
  if (f.unit === 'datasets, weighted') return `${v >= 1000 ? big(v) : v >= 1 ? Math.round(v) : 'Under 1'} ${v >= 1.5 ? 'datasets' : 'dataset'}, weighted`;
  if (/^benchmarks of \d+$/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()}`;
  return v;
}
const bar = (v, color) => `<div class="bar"><i style="width:${(v * 100).toFixed(1)}%;${color ? `background:var(${color})` : ''}"></i></div>`;

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
// Countries with census figures on language (immigrant languages counted); for the others a filtered
// view says their immigrant communities' languages are missing
const CENSUS = new Set(DATA.census_countries || []);
function censusCaveat() {
  const no = [...countrySel].filter(c => !CENSUS.has(c)).map(c => COUNTRY_NAMES[c] || c.toUpperCase()).sort();
  if (!no.length) return '';
  const list = no.length > 4 ? `${no.length} of the countries chosen` : no.length > 1 ? `${no.slice(0, -1).join(', ')} and ${no[no.length - 1]}` : no[0];
  return `<p class="note">We couldn't find census figures on language for ${esc(list)}, so the languages of ${no.length > 1 ? 'their' : 'its'} immigrant communities aren't included: only the languages LinguaMeta lists for ${no.length > 1 ? 'them' : 'it'}.</p>`;
}
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
    const rows = (L[c] || []).filter(([code]) => BY[code] && !BY[code].extinct && inView(BY[code]));
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
function oppItem(o, l, showLang) {
  return `<li class="opp" style="--c:var(${OCOLOR[o.type]})">
    <div class="prio">${prio(o).toFixed(2)}<small>priority</small></div>
    <div class="opp-head"><span class="otype">${esc(OT[o.type].label)}</span><span>${esc(TECHL[o.technology] || o.technology)}</span>
      ${showLang ? `<a href="${LH(l.code)}">${esc(l.name)}</a>` : ''}</div>
    <a class="opp-title" href="#opp-${o.id}">${esc(o.title)}</a>
    <div class="opp-detail">${esc(o.why)}</div>
    ${provider !== 'All' ? `<div class="opp-prov" style="--p:var(--prov-${provider})"><i></i>Not yet in ${esc(provMissing(o, l, provider).join(', '))}</div>` : ''}
    <div class="opp-foot"><span>${o.teams.map(t => esc(TEAMS[t])).join(' · ')}</span><a href="#opp-${o.id}">Starter kit and details →</a></div>
  </li>`;
}

let otype = 'all', team = 'all', showAll = false;
async function opportunities(lang) {
  const focus = lang && BY[lang] ? BY[lang] : null;
  if (focus) await need(focus.code);
  else if (!countrySel.size) await topOpps();
  const pool = focus ? focus.opportunities.map(o => ({ o, l: focus })) : countrySel.size ? await countryPool()
    : TOP.map(o => ({ o, l: BY[o.lang] })).filter(x => inView(x.l));
  const all = pool
    .filter(x => provider === 'All' || provMissing(x.o, x.l, provider).length)
    .sort((a, b) => prio(b.o) - prio(a.o));
  const byTeam = all.filter(x => team === 'all' || x.o.teams.includes(team));
  const tcount = Object.fromEntries(Object.keys(TEAMS).map(k => [k, all.filter(x => x.o.teams.includes(k)).length]));
  const counts = Object.fromEntries(Object.keys(OT).map(k => [k, byTeam.filter(x => x.o.type === k).length]));
  const list = byTeam.filter(x => otype === 'all' || x.o.type === otype);
  const shown = showAll ? list : list.slice(0, 25);
  const filtered = regionSel.size || ((tierSel.size || countrySel.size) && !focus) || provider !== 'All' || otype !== 'all' || team !== 'all' || focus;
  $('#view').innerHTML = `
    <div class="controls">
      ${focus ? '' : `<span id="orwrap">${regionPicker()}</span><span id="octrywrap">${countryPicker()}</span><span id="otierwrap">${tierPicker()}</span>`}
      ${providerSelect('opsel')}
      <select id="otsel" aria-label="Kind of action"><option value="all">Any kind of action</option>${Object.entries(OT).map(([k, t]) => `<option value="${k}"${otype === k ? ' selected' : ''}>${esc(t.label)} (${counts[k]})</option>`).join('')}</select>
      <button type="button" class="reset" id="oresetf"${filtered ? '' : ' hidden'}>Reset filters</button>
    </div>
    ${focus ? `<div class="lhead"><h2>${esc(focus.name)} <span class="auto">${all.length} opportunities</span></h2><a href="${LH(focus.code)}">Language profile</a></div>`
            : `<p class="lede ws-lede">Where a team can make the biggest difference next. Each opportunity says why it matters, which open resources are ready to start from, and what's still missing.</p>`}
    <div class="teampick"><span class="eyebrow">What does your team work on?</span>
      <div class="chips" role="group" aria-label="Team">
        <button class="chip" id="tm-all" data-tm="all" aria-pressed="${team === 'all'}">Everything · ${all.length}</button>
        ${Object.entries(TEAMS).filter(([k]) => tcount[k]).map(([k, t]) => `<button class="chip" id="tm-${k}" data-tm="${k}" aria-pressed="${team === k}">${esc(t)} · ${tcount[k]}</button>`).join('')}
      </div></div>
    ${provider !== 'All' ? `<p class="note" style="margin-top:0">Opportunities where a ${esc(PROV_ALL[provider])} service tracked here doesn't yet cover the language.</p>` : ''}
    ${!focus && countrySel.size ? `<p class="note">The top opportunities in ${esc(regionNames())}, ranked by reach there: each language counts only its speakers in ${countrySel.size > 1 ? 'these countries' : 'this country'}. Choose a language to see all of its own.</p>`
      : !focus && DATA.opportunity_total > TOP.length ? `<p class="note">Showing ${TOP.length.toLocaleString()} of ${DATA.opportunity_total.toLocaleString()} opportunities: the highest-priority ones, with the top ones of every kind of action. Choose a language to see all of its own.</p>` : ''}
    ${shown.length ? `<ol class="opps">${shown.map(x => oppItem(x.o, x.l, !focus)).join('')}</ol>` : '<p class="note">Nothing matches these filters.</p>'}
    ${list.length > shown.length ? `<button class="chip more" id="showall">Show all ${list.length}</button>` : ''}
    ${focus ? '' : censusCaveat()}
    <details class="method"><summary>How opportunities are ranked</summary>
      <div class="otypes">${Object.entries(OT).map(([k, t]) => `<div class="otype-card" style="--c:var(${OCOLOR[k]})"><b>${esc(t.label)}</b>${esc(OBLURB[k])}</div>`).join('')}</div>
      <p class="note">Priority weighs how many people could use the technology, how big the gap is, and how weak current support is, divided by the rough cost of acting: 1 for sharing, shipping, measuring or standardising, 2 for improving a model, 3 for collecting new data. Voice technologies count everyone online; text technologies count only those who can also read and write text on a phone. The costs are rough guides, not estimates.</p>
      <div class="weightbar"><span>Count potential users as</span><div class="chips" role="group" aria-label="Weighting">
        ${Object.entries(WEIGHT).map(([k, w]) => `<button class="chip" id="w-${k}" data-w="${k}" aria-pressed="${weight === k}">${esc(w.label)}</button>`).join('')}
      </div></div>
      <p class="note">Currently ranked by ${esc(WEIGHT[weight].note)}.</p>
    </details>`;
  $('#view').querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { team = b.dataset.tm; otype = 'all'; showAll = false; opportunities(lang); });
  $('#view').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { weight = b.dataset.w; opportunities(lang); const d = $('details.method'); if (d) d.open = true; });
  $('#otsel').onchange = e => { otype = e.target.value; showAll = false; opportunities(lang); };
  $('#oresetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); provider = 'All'; otype = 'all'; team = 'all'; showAll = false;
    if (lang) go('opportunities'); else opportunities(); };
  if ($('#orwrap')) wireMsel('orwrap', regionPicker, regionSel, REGIONS.length, async () => { showAll = false; await opportunities(lang); reopen('orwrap'); });
  if ($('#octrywrap')) wireCountries('octrywrap', async () => { showAll = false; await opportunities(lang); reopenCountries('octrywrap'); });
  if ($('#otierwrap')) wireMsel('otierwrap', tierPicker, tierSel, TIER_KEYS.length, async () => { showAll = false; await opportunities(lang); reopen('otierwrap'); });
  $('#opsel').onchange = e => { provider = e.target.value; team = 'all'; otype = 'all'; showAll = false; opportunities(lang); };
  const more = $('#showall'); if (more) more.onclick = () => { showAll = true; opportunities(lang); };
  navBox('opps', 'Find a language name or code', focus ? `${focus.name} (${focus.code})` : '');
}

async function oppDetail(id) {
  const l = BY[id.split('-')[0]];
  if (!l) return opportunities();
  await need(l.code);
  const o = l.opportunities.find(y => y.id === id);
  if (!o) return opportunities();
  const facts = DATA.facts[l.code] || {};
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  const kit = o.kit.length ? `<div class="tablebox"><table>
      <thead><tr><th>Resource</th><th>What it is</th><th>For ${esc(l.name)}</th><th>Licence</th><th>Commercial use</th></tr></thead>
      <tbody>${o.kit.map(k => `<tr><td><a href="${esc(k.link)}" target="_blank" rel="noopener">${esc(k.name)}</a></td><td>${esc(k.what)}</td><td>${esc(k.size)}</td><td>${esc(k.licence || '—')}</td><td>${esc(COMMERCIAL[k.commercial] || '—')}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Licences as published by each project; check the terms for your use before building on them.</p>`
    : '<p class="note">No open resources found yet in the sources tracked.</p>';
  const countries = l.reach_by_country.length ? `<div class="tablebox"><table>
      <thead><tr><th>Country</th><th class="num">Speakers</th><th class="num">Online today</th><th class="num">Online and able to text</th><th class="num">Online in five years</th></tr></thead>
      <tbody>${l.reach_by_country.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${people(c.speakers)}</td><td class="num">${pct(c.online)}</td><td class="num">${pct(c.text)}</td><td class="num">${pct(c.online_5y)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Speaker counts from LinguaMeta; internet use, mobile texting and literacy from the World Bank. National averages overstate connectivity for rural and minority-language speakers.</p>` : '';
  // every source this card checked, with what it records for the language (or that it doesn't list it)
  const checked = (o.checked || o.evidence).map(i => {
    const f = facts[i], name = (SVC[i] ? `${SVC[i][0]}${SVC[i][1] ? ` (${SVC[i][1]})` : ''}` : '') || L[i] || (f && f.source) || i;
    if (!f) return `<li>${esc(name)}: <span class="muted">${ROLE_OF[i] === 'measured' ? 'no published result for this language' : 'not listed'}</span></li>`;
    return `<li><a href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener">${esc(name)}</a>: ${esc(showValue(f))}, retrieved ${esc(fmtDay(f.retrieved))}${f.note ? ` <span class="muted">· ${esc(f.note)}</span>` : ''}</li>`;
  }).join('');
  const u = o.users || {};
  const factors = [
    ['Potential users counted', u.estimated ? `${people(u['5y'])} in five years (${people(u.now)} today) · ${u.kind === 'voice' ? 'voice: everyone online' : 'text: online and able to text'}` : `${people(u.speakers)} speakers`],
    ['Reach score', `${(o.reach || {})['5y']?.toFixed(2) ?? '—'} (log of users, 10K = 0, 1 billion = 5)`],
    ['Gap', `${o.gap.toFixed(2)} (how much of the problem is unsolved)`],
    ['Need', `${o.need?.toFixed(2) ?? '—'} (1 minus current score for ${esc(TECHL[o.technology] || o.technology)})`],
    ['Momentum', `${o.momentum.toFixed(2)} (boost for a fast-growing user base)`],
    ['Cost', `${o.cost} (${esc(OT[o.type].label)}${o.cost !== OT[o.type].cost ? ', a bigger build than most of its type' : ''})`],
    ['Priority', `${o.priority_5y.toFixed(2)} in five years · ${o.priority_now.toFixed(2)} today · ${o.priority.toFixed(2)} all speakers`],
  ];
  const others = l.opportunities.filter(x => x.id !== o.id);
  $('#view').innerHTML = `
    <button class="back" id="back">← ${esc(l.name)} opportunities</button>
    <div class="opp-hero" style="--c:var(${OCOLOR[o.type]})">
      <div class="opp-head"><span class="otype">${esc(OT[o.type].label)}</span><span>${esc(TECHL[o.technology] || o.technology)}</span><a href="${LH(l.code)}">${esc(l.name)}</a><span>${esc(o.workstream)}</span></div>
      <h2>${esc(o.title)}</h2>
      <p class="why">${esc(o.why.split(' Ready to use:')[0])}</p>
      <div class="opp-foot"><span>For teams working on ${o.teams.map(t => esc(/^[A-Z]{2}/.test(TEAMS[t]) ? TEAMS[t] : TEAMS[t][0].toLowerCase() + TEAMS[t].slice(1))).join(', ')}</span><button class="chip" id="copylink">Copy link</button></div>
    </div>
    <h3 class="panel-h">Ready to use</h3>${kit}
    <h3 class="panel-h">Still needed</h3><p class="needed">${esc(o.missing)}</p>
    <p class="note">${esc(o.detail)}</p>
    ${countries ? `<h3 class="panel-h">Who it would reach</h3>${countries}` : ''}
    <h3 class="panel-h">Sources checked</h3>${checked ? `<ul class="checked">${checked}</ul>` : '<p class="note">Every data and technology source tracked here; none records anything for this language.</p>'}
    <p class="note">Something here out of date, or a resource we've missed? <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">Send a correction on GitHub</a> or email <span class="email">langtechindex@gmail.com</span>.</p>
    <details class="method"><summary>How this ranks</summary>
      <div class="tablebox"><table><tbody>${factors.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Priority = reach × gap × need × momentum ÷ cost.</p></details>
    ${others.length ? `<h3 class="panel-h">Other opportunities for ${esc(l.name)}</h3><ol class="opps">${others.map(x => oppItem(x, l, false)).join('')}</ol>` : ''}`;
  $('#back').onclick = () => { go('opportunities-' + l.code); };
  $('#copylink').onclick = async e => {
    const url = location.href.split('#')[0] + '#opp-' + o.id;
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; }
    catch { e.target.textContent = url; }
  };
}

// ---------------------------------------------------------------- ranking
let query = '', rankAll = false, sortBy = 'rank', sortDir = 1, sortChosen = false;  // until a column is chosen: by rank, or by speakers with a region or country chosen
const tierSel = new Set();  // tiers shown in the ranking; empty means all
let showGaps = false;       // only languages with something in the Gaps column
const endSel = new Set();   // endangerment levels shown; empty means every living language
// UNESCO's levels as LinguaMeta gives them; "extinct" covers languages LTDI keeps out of the ranking
const END_LEVELS = [['not_endangered', 'Not endangered'], ['vulnerable', 'Vulnerable'], ['definitely_endangered', 'Definitely endangered'],
  ['severely_endangered', 'Severely endangered'], ['critically_endangered', 'Critically endangered'], ['revitalizing', 'Revitalizing'],
  ['extinct', 'Extinct'], ['none', 'Not assessed']];
const END_LABEL = Object.fromEntries(END_LEVELS);
const END_SOURCE = { linguameta: 'from LinguaMeta', glottolog: 'from Glottolog 5.4 (LinguaMeta gives none)',
  member: 'from its most-spoken member language', review: 'reviewed by the LTDI team' };
const endKey = l => l.extinct ? 'extinct' : l.endangerment || 'none';
const endPicker = () => msel('endsel', endSel, END_LEVELS.map(([k, t]) => [k, t, '']), 'Any endangerment', null, '', 'Clear');
// Tiers ([tiers] in the methodology): score cut-offs for the top three, then stages by what's recorded
const TIER_KEYS = [...DATA.config.tiers.cutoffs.map(([k, t]) => [k, t]), ...DATA.config.tiers.stages];
const TIER_LABEL = Object.fromEntries(TIER_KEYS);
// what each tier means, on hover: the score range for the top three, what's recorded for the stages
const TIER_DESC = Object.fromEntries([...DATA.config.tiers.cutoffs.map(([k, t, c], i, a) => [k, `${t}: LTDI ${c.toFixed(2)}${i ? `–${a[i - 1][2].toFixed(2)}` : ' and above'}`]),
  ...DATA.config.tiers.stages.map(([k, t, d]) => [k, `${t}: ${d.charAt(0).toLowerCase() + d.slice(1)}`])]);
// A drop-down of tick boxes, so several values can be chosen at once (Medium and Low, say)
function msel(id, sel, opts, none, all, prefix, clear) {
  const label = !sel.size ? none : sel.size === opts.length && all ? all
    : prefix + opts.filter(([k]) => sel.has(k)).map(([, t]) => t).join(', ');
  return `<details class="msel" id="${id}"><summary aria-label="${esc(none)}">${esc(label)}</summary><div class="msel-pop">
    ${opts.map(([k, t, mark, after = '']) => `<label><input type="checkbox" value="${k}"${sel.has(k) ? ' checked' : ''}>${mark}${esc(t)}${after}</label>`).join('')}
    ${sel.size ? `<button type="button" class="msel-clear">${esc(clear)}</button>` : ''}</div></details>`;
}
const tierPicker = () => msel('tiersel', tierSel, TIER_KEYS.map(([k, t]) => [k, t, `<i style="background:var(${TIERC[k]})"></i>`]),
  'All tiers', 'All tiers', '', 'Show all tiers');
// Wire a drop-down: ticking updates the set, redraws, and keeps the drop-down open
function wireMsel(wrap, make, sel, size, draw) {
  const d = $(`#${wrap} details`);
  d.onchange = e => {
    if (e.target.checked) sel.add(e.target.value); else sel.delete(e.target.value);
    if (size && sel.size === size) sel.clear();
    $(`#${wrap}`).innerHTML = make(); $(`#${wrap} details`).open = true; wireMsel(wrap, make, sel, size, draw); draw();
  };
  d.onclick = e => { if (e.target.closest('.msel-clear')) { sel.clear(); $(`#${wrap}`).innerHTML = make(); wireMsel(wrap, make, sel, size, draw); draw(); } };
}
// Sortable columns: [key, label, value for sorting, natural direction (1 = ascending first)]
const GAP_WEIGHT = { none: 2, open: 1 };
const SORTS = {
  rank: ['#', l => l.rank ?? 1e9, 1], name: ['Language', l => l.name.toLowerCase(), 1], speakers: ['Speakers', l => vSpk(l) || 0, -1],
  online: ['Online', l => vOn(l) || 0, -1],
  ltdi: ['LTDI', l => l.ltdi, -1], tier: ['Tier', l => l.ltdi, -1],
  gaps: ['Gaps', l => Object.values(l.gaps).reduce((n, g) => n + GAP_WEIGHT[g], 0) * 1e5 + (l.rank ?? 9e4), 1],  // fewest first
};
function sortBtn(key, inner = SORTS[key][0]) {
  const on = sortBy === key, arr = on ? (sortDir === SORTS[key][2] ? (SORTS[key][2] > 0 ? '▲' : '▼') : (SORTS[key][2] > 0 ? '▼' : '▲')) : '';
  return `<button class="sort" data-sort="${key}" aria-pressed="${on}" title="Sort by ${esc(SORTS[key][0].toLowerCase())}${on ? ' (select again to reverse)' : ''}">${inner}<span class="arr" aria-hidden="true">${arr}</span></button>`;
}
function rankHead() {
  const aria = k => sortBy === k ? ` aria-sort="${(sortDir === SORTS[k][2]) === (SORTS[k][2] > 0) ? 'ascending' : 'descending'}"` : '';
  return `<th class="c-rank"${aria('rank')}>${sortBtn('rank')}</th><th class="c-name"${aria('name')}>${sortBtn('name')}</th>
    <th class="num hide-sm hide-nar c-spk"${aria('speakers')}>${sortBtn('speakers')}</th><th class="num hide-sm c-onl" title="Estimated speakers online today, and their share of all speakers"${aria('online')}>${sortBtn('online')}</th>
    <th class="c-dim">Dimensions</th>
    <th class="num c-ltdi"${aria('ltdi')}>${sortBtn('ltdi')}</th><th class="c-tier hide-sm hide-tab"${aria('tier')}>${sortBtn('tier')}</th>
    <th class="hide-sm c-gaps" title="Main technologies no commercial service offers"${aria('gaps')}>${sortBtn('gaps')}</th>`;
}
const RANK_PAGE = 100;  // rows shown before "Show all"; searching shows every match
// Ranking "Gaps" column: the main technologies that no commercial service offers
const MAIN_TECH = Object.entries(CFG.tech.technologies).filter(([, t]) => t.group !== 'more').map(([k]) => k);
const GAP_TECH = Object.entries(CFG.tech.technologies).filter(([, t]) => t.group !== 'more' || t.gap).map(([k]) => k);  // Gaps column
function gapsCell(l) {
  return `<div class="gaps">${GAP_TECH.filter(k => l.gaps[k]).map(k => {
    const t = CFG.tech.technologies[k], open = l.gaps[k] === 'open';
    const what = open ? (t.measured ? 'benchmark results only' : 'open model only') : 'nothing found';
    return `<span class="gap-i ${open ? 'open' : 'none'}" title="${esc(t.label)}: ${what}">${TICON[k]}<span class="sr">${esc(t.label)}: ${what}</span></span>`;
  }).join('')}</div>`;
}

// Totals for the languages in view: speakers and online (summed per language, so people who speak
// several are counted in each), the share of languages and of speakers in each tier, and the
// speakers whose language has no commercial service for each main technology
const pctBand = r => r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;  // share online, for colour
const GAP_SHORT = { speech_input: 'Speech input', tts: 'Text-to-speech', mt: 'Translation', llm: 'LLM app lists', keyboard: 'Keyboard', assistant: 'Voice assistant' };
const GAP_TITLE = { llm: "Speakers whose language is in no official AI assistant app's language list (models may still answer in it)" };
// technologies counted through a spoken variety's written standard ([written_standard] in the methodology)
const WRITTEN_TECH = new Set(DATA.config.written_standard ? DATA.config.written_standard.technologies : []);
const GAP_GROUPS = [['Text', ['keyboard', 'mt']], ['Speech', ['speech_input', 'tts']], ['AI', ['llm', 'assistant']]];
function rankSummary(ls) {
  const sum = f => ls.reduce((n, l) => n + (f(l) || 0), 0);
  const sp = sum(vSpk), on = sum(vOn);
  const tiers = TIER_KEYS.map(([k]) => k), label = TIER_LABEL;
  const by = Object.fromEntries(tiers.map(t => [t, { n: 0, sp: 0 }]));
  for (const l of ls) { const t = tierOf(l)[0]; by[t].n++; by[t].sp += vSpk(l) || 0; }
  const pct = (x, of) => of ? x / of * 100 : 0;
  const fmtPct = v => v > 0 && v < 1 ? '<1%' : Math.round(v) + '%';
  const row = (name, key, total) => `<div class="tbar-row"><span class="tbar-k">${name}</span><div class="tbar">${tiers.map(t => {
      const v = pct(by[t][key], total);
      return v ? `<i style="width:${v}%;background:var(${TIERC[t]})" title="${label[t]}: ${fmtPct(v)} of ${key === 'n' ? 'languages' : 'speakers'}\n${by[t].n.toLocaleString()} ${by[t].n === 1 ? 'language' : 'languages'} with ${people(by[t].sp)} speakers"></i>` : '';
    }).join('')}</div></div>`;
  // Grouped by kind, two technologies each: no commercial or regional service (an open model or benchmark
  // alone still counts), the same definition as the Gaps column and the Charts bars' last two segments
  const noCommercial = (l, k) => !!l.gaps[k];
  const gapItem = k => {
    const t = CFG.tech.technologies[k], n = sum(l => noCommercial(l, k) ? vSpk(l) : 0);
    return `<span class="rgap" title="${esc(GAP_TITLE[k] || `Speakers whose language has no commercial ${t.label.toLowerCase()} service`)}${WRITTEN_TECH.has(k) ? '. Spoken varieties count through the standard language their speakers write' : ''}">
      <span class="gap-i none">${TICON[k]}</span><b>${n ? people(n) : '0'}</b><small>${esc(GAP_SHORT[k] || t.label)}</small></span>`;
  };
  const gaps = GAP_GROUPS.map(([g, ks]) => `<div class="rgcol" aria-label="${g}">${ks.map(gapItem).join('')}</div>`).join('');
  return `
    <div class="rsum-totals">
      <div><div class="eyebrow">Languages</div><b>${ls.length.toLocaleString()}</b></div>
      <div title="Each language's speakers added up, so people who speak several languages are counted once for each"><div class="eyebrow">Speakers*</div><b>${people(sp)}</b><small class="rs-sum">summed</small></div>
      <div title="Estimated speakers online today, added up the same way"><div class="eyebrow">Online*</div><b>${people(on)}</b><small class="rs-sum">summed</small></div>
      <p class="rsum-note">* Each language's speakers added up, so people who speak several languages are counted in each, and the totals exceed the population.${narrowed() ? ` Each language counts only its speakers in ${countrySel.size ? 'the countries' : 'the regions'} chosen.` : ''}</p>
    </div>
    <div class="rsum-tiers">
      <div class="eyebrow">Share by tier</div>
      ${row('Languages', 'n', ls.length)}${row('Speakers', 'sp', sp)}
      <div class="tbar-key">${tiers.map(t => `${t === DATA.config.tiers.stages[0][0] ? '<span class="tk-sep">below Medium, by what exists:</span>' : ''}<span${TIER_DESC[t] ? ` title="${esc(TIER_DESC[t])}"` : ''}><i style="background:var(${TIERC[t]})"></i>${label[t]}</span>`).join('')}</div>
    </div>
    <div class="rsum-gaps">
      <div class="eyebrow" title="No commercial or regional service found; an open model alone doesn't count. Text technologies count spoken varieties through the standard language their speakers write">Speakers with no commercial service found</div>
      <div class="rgaps">${gaps}</div>
    </div>
`;
}

// Search by name, autonym, code or any other English name LinguaMeta records ("Cantonese" finds Yue
// Chinese, "Buryat" the Buriat languages)
const altNames = l => l._alt ??= (l.alt ? l.alt.split('|') : []);
const matches = (l, q) => [l.name, l.autonym, l.code, l.iso_639_3].some(s => (s || '').toLowerCase().includes(q))
  || altNames(l).some(a => a.toLowerCase().includes(q));
const altHit = (l, q) => q && ![l.name, l.autonym, l.code, l.iso_639_3].some(s => (s || '').toLowerCase().includes(q))
  ? altNames(l).find(a => a.toLowerCase().includes(q)) : null;

function ranking() {
  $('#view').innerHTML = `
    <div class="controls">
      <span id="regwrap">${regionPicker()}</span>
      <span id="ctrywrap">${countryPicker()}</span>
      <span id="tierwrap">${tierPicker()}</span>
      <span id="endwrap" title="UNESCO's endangerment level, from LinguaMeta (Glottolog where LinguaMeta gives none). Extinct languages are listed only when chosen here">${endPicker()}</span>
      <label class="switch" title="Show only languages with a gap: a main technology with no commercial service, or only an open model or benchmark"><input type="checkbox" role="switch" id="gapsw"${showGaps ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Show gaps</label>
      <button type="button" class="reset" id="resetf" hidden>Reset filters</button>
    </div>
    <div class="rsum-wrap"><div id="rsum" class="rsum" aria-live="polite"></div></div>
    <div class="legend">
      ${DIMS.map(([k, , c]) => `<span><i class="sw" style="background:var(${c})"></i>${k === 'tech' ? 'Technology' : 'Data'}</span>`).join('\n      ')}
      <span class="hide-sm">Gaps:</span>
      <span class="hide-sm"><span class="gap-i none">${TICON.tts}</span>No service found</span>
      <span class="hide-sm"><span class="gap-i open">${TICON.tts}</span>Open model or benchmark only</span>
    </div>
    <div class="tablebox"><table class="ranktab">
      <thead><tr id="rankhead"></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
    <div id="rankmore"></div>
    <div id="censusnote"></div>
    <p class="note"><strong>About this edition.</strong> ${LANGS.length < 100 ? `A ${LANGS.length}-language slice to test the method.` : `${LANGS.length.toLocaleString()} languages.`}${ALL.length > LANGS.length ? ` ${(ALL.length - LANGS.length).toLocaleString()} extinct languages are left out; choose Extinct in the endangerment drop-down to list them.` : ''} Each technology scores by the share of services that offer it, weighted by how fully each one does (features, voice types, error rates). The Gaps column shows which of the six main technologies (keyboard, speech input, text-to-speech, translation, LLMs, voice assistants) no commercial service offers; hover an icon for details. Languages with the same score share a rank, shown as =1,914. Select a language to see every value and its source. <a href="data/ltdi-${DATA.edition}.csv" target="_blank" rel="noopener">Download the scores (CSV)</a>.</p>`;
  const draw = () => {
    const q = query.trim().toLowerCase();
    const all = (endSel.size ? ALL.filter(l => endSel.has(endKey(l))) : LANGS).filter(l => inView(l)
      && (!showGaps || GAP_TECH.some(k => l.gaps[k])) && (!q || matches(l, q)));
    if (!sortChosen) { sortBy = countrySel.size || regionSel.size ? 'speakers' : 'rank'; sortDir = SORTS[sortBy][2]; }
    const [, val, natural] = SORTS[sortBy], dir = sortDir;
    all.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : (a.rank ?? 1e9) - (b.rank ?? 1e9)) * dir; });
    $('#rsum').innerHTML = rankSummary(all);
    $('#resetf').hidden = !regionSel.size && !countrySel.size && !tierSel.size && !endSel.size && !showGaps && !q;
    $('#rankhead').innerHTML = rankHead();
    const rows = rankAll || q ? all : all.slice(0, RANK_PAGE);
    $('#censusnote').innerHTML = censusCaveat();
    $('#rankmore').innerHTML = rows.length < all.length ? `<button class="chip more" id="rankall">Show all ${all.length.toLocaleString()} languages</button>` : '';
    const btn = $('#rankall'); if (btn) btn.onclick = () => { rankAll = true; draw(); };
    $('#rows').innerHTML = rows.map(l => `
      <tr tabindex="0" data-code="${l.code}">
        <td class="rank"${rankTitle(l) ? ` title="${esc(rankTitle(l))}"` : ''}>${rankLabel(l)}</td>
        <td class="c-name" title="${esc(l.name)}${l.autonym && l.autonym !== l.name ? ' · ' + esc(l.autonym) : ''}"><div class="lname">${esc(l.name)}</div><div class="auto">${altHit(l, q) ? `also ${esc(altHit(l, q))}` : esc(l.autonym !== l.name ? l.autonym : '')} <span class="code">[${l.code}]</span></div></td>
        <td class="num hide-sm hide-nar">${people(vSpk(l))}</td>
        <td class="num hide-sm">${people(vOn(l))}${vOn(l) && vSpk(l) ? ` <span class="pct p${pctBand(vOn(l) / vSpk(l))}">(${Math.round(vOn(l) / vSpk(l) * 100)}%)</span>` : ''}</td>
        <td><div class="bars" role="img" aria-label="Data ${l.dimensions.data.score}, technology ${l.dimensions.tech.score}">
          ${DIMS.map(([k, , c]) => bar(l.dimensions[k].score, c)).join('')}</div></td>
        <td class="num score"${l.raw ? ` title="${esc(rawText(l))}"` : ''}>${l.ltdi.toFixed(3)}</td>
        <td class="hide-sm hide-tab">${tierChip(l)}</td>
        <td class="hide-sm">${gapsCell(l)}</td>
      </tr>`).join('') || `<tr><td colspan="8">No language matches “${esc(query)}”.</td></tr>`;
  };
  draw();
  wireMsel('regwrap', regionPicker, regionSel, REGIONS.length, draw);
  navBox('filter', 'Find a language name or code', query);
  navFilter = v => { query = v; draw(); };
  $('#resetf').onclick = () => { regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); endSel.clear(); showGaps = false; query = ''; rankAll = false; sortChosen = false; ranking(); };
  wireMsel('tierwrap', tierPicker, tierSel, TIER_KEYS.length, draw);
  wireCountries('ctrywrap', draw);
  wireMsel('endwrap', endPicker, endSel, 0, draw);
  $('#gapsw').onchange = e => { showGaps = e.target.checked; draw(); };
  if (!ranking.closer) {  // once: a click elsewhere closes the drop-downs
    ranking.closer = e => document.querySelectorAll('details.msel[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    document.addEventListener('click', ranking.closer);
  }
  $('#rows').onclick = e => { const tr = e.target.closest('tr[data-code]'); if (tr) go('lang-' + tr.dataset.code); };
  $('#rankhead').onclick = e => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const k = b.dataset.sort;
    if (sortBy === k) sortDir = -sortDir; else { sortBy = k; sortDir = SORTS[k][2]; }
    sortChosen = true;
    draw();
    $(`#rankhead [data-sort="${k}"]`)?.focus();
  };
  $('#rows').onkeydown = e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-code]'); if (tr) go('lang-' + tr.dataset.code); } };
}

// --------------------------------------------------------------- language

// Service tiles on the technology panel: plain names (no logos), status, and what each offers
// Service names, kinds and providers come from config/services.csv
const SVC = Object.fromEntries(DATA.services.map(s => [s.id, [s.name, s.kind, s.provider]]));
// Commitment signatories first (Gates Foundation, Sept 2026), then other large companies, smaller ones, open source; tiles follow this order
const PROV = { google: 'Google', microsoft: 'Microsoft', amazon: 'Amazon', openai: 'OpenAI', anthropic: 'Anthropic', apple: 'Apple', meta: 'Meta', deepl: 'DeepL', open: 'Open source' };
// Regional providers: one highlight chip for them all on language pages (most readers know the global ones)
const REGIONAL = { yandex: 'Yandex', baidu: 'Baidu', alibaba: 'Alibaba Cloud', naver: 'Naver', sarvam: 'Sarvam AI', lelapa: 'Lelapa AI', ghananlp: 'GhanaNLP', sunbird: 'Sunbird AI' };
const PROV_ALL = { ...PROV, ...REGIONAL };
// Tile order: the global providers, then regional ones, then open source
const PROV_ORDER = [...Object.keys(PROV).filter(k => k !== 'open'), ...Object.keys(REGIONAL), 'open'];
// Provider highlight: dim every other provider's tiles (one rule per provider, so new providers just work)
document.head.insertAdjacentHTML('beforeend', `<style>${Object.keys(PROV).map(k =>
  `section.focus-${k} .tile[data-prov]:not([data-prov="${k}"]) { opacity: .3; }`).join('\n')}
  section.focus-regional .tile[data-prov]:not([data-regional]) { opacity: .3; }</style>`);
let provFocus = null, moreOpen = false;  // remembered while moving between languages
const ROLE_OF = Object.fromEntries(DATA.services.map(s => [s.id, s.role]));
const DEPTH_OF = Object.fromEntries(DATA.services.filter(s => s.depth).map(s => [s.id, s.depth]));
// A published quality measure that discounts a service where it's poor (services.csv: quality)
const QUALITY_OF = Object.fromEntries(DATA.services.filter(s => s.quality).map(s => [s.id, s]));
// Who measured each published quality figure, and on what (services.csv: quality_by, test_set, test_size, test_public)
const TEST_OF = Object.fromEntries(DATA.services.filter(s => s.test_set).map(s => [s.id, s]));
const measuredShort = id => { const t = TEST_OF[id]; if (!t) return '';
  return `measured ${t.quality_by === 'own' ? 'by its makers' : 'independently'} on ${t.test_public === 'no' ? 'test data that isn\u2019t public' : t.test_set}`; };
const measuredLong = id => { const t = TEST_OF[id]; if (!t) return '';
  const who = t.quality_by === 'own' ? 'Measured by the makers' : 'Measured independently';
  return t.test_public === 'no' ? `${who} on ${t.test_set}, which isn't public, so the figure can't be checked and may read better than on other speech`
    : `${who} on ${t.test_set} (public${t.test_size ? `; ${t.test_size}` : ''})`; };
// Families (Glottolog): the groups above each language, and the nearest relatives with more support
const GN = DATA.gnodes, GN_BY = Object.fromEntries(GN.map(([g], i) => [g, i]));
const famName = l => l._gp.length ? GN[l._gp[0]][1] : l.giso ? 'Isolate' : '';
const branchName = l => l._gp.length > 1 ? GN[l._gp[l._gp.length - 1]][1] : '';
function famLine(l) {
  if (!l._gp.length) return l.giso ? `<span title="Glottolog lists no relatives">Family <b>Isolate</b></span>` : '';
  const path = l._gp.map(i => GN[i][1]);
  return `<span title="${esc(path.join(' › '))} (Glottolog)">Family <b>${esc(path[0])}</b></span>`;
}
function relatives(l, k = 6) {
  if (!l._gp.length) return [];
  const out = [];
  for (const m of LANGS) {
    if (m === l || !m._gp.length || m._gp[0] !== l._gp[0] || m.ltdi <= l.ltdi) continue;
    let d = 0;
    while (d < l._gp.length && d < m._gp.length && l._gp[d] === m._gp[d]) d++;
    out.push([d, m]);
  }
  return out.sort((a, b) => b[0] - a[0] || b[1].ltdi - a[1].ltdi).slice(0, k).map(([d, m]) => ({ m, group: GN[l._gp[d - 1]][1], same: m._sc[0] && m._sc[0] === l._sc[0] }));
}
function relatedPanel(l) {
  if (!l._gp.length) return '';
  const rs = relatives(l);
  return `<h3 class="panel-h">Related languages with more support</h3>
    ${rs.length ? `<ul class="rel-list">${rs.map(r => `<li><a href="${LH(r.m.code)}">${esc(r.m.name)}</a> <span class="code">${r.m.code}</span> ${tierChip(r.m)} <span class="muted small">${r.m.ltdi.toFixed(3)} · both ${esc(r.group)}${r.same ? ' · same script' : ''}</span></li>`).join('')}</ul>
    <p class="note">The nearest relatives in Glottolog's classification that score higher, closest first: tools and data for a close relative are the usual starting point for a new language. Closeness here is by family tree, not by how similar the languages are, so check before reusing anything.</p>`
      : `<p class="note">No relative in ${esc(famName(l))} scores higher.</p>`}`;
}
// Engineering flags: what makes building for a language cost more (ltdi.engineering)
const FLAG_SHORT = { r: 'RTL', s: 'Shaping', w: 'No spaces', i: 'IME', m: 'Scripts', l: 'Look-alikes' };
const flagLabels = l => l._fx.map(f => (DATA.flags[f] || [, f])[1]);
const FLAG_CHIP = { r: 'Right to left', s: 'Complex shaping', w: 'No spaces between words', i: 'Input method', m: 'Several scripts', l: 'Look-alike letters' };
function engLine(l) {
  if (!l._fx.length) return '';
  const look = (l.lookalikes || []).map(([a, b]) => `${a} for ${b}`).join(', ');
  const cp = ch => [...ch].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
  const lookLong = (l.lookalikes || []).map(([a, b]) => `${a} ${cp(a)} for ${b} ${cp(b)}`).join('; ');
  const chips = l._fx.map(f => `<span class="eflag" title="${esc((DATA.flags[f] || [, ''])[1] + (f === 'l' && lookLong ? `: ${lookLong}` : ''))}">${FLAG_CHIP[f]}${f === 'l' && look ? ` <span class="code">${esc(look.length > 24 ? look.slice(0, look.lastIndexOf(',', 24)) + ' …' : look)}</span>` : ''}</span>`).join('');
  return `<span>Engineering <span class="eflags">${chips}</span>${infoTip('Engineering flags', 'Things about how the language is written that raise the cost of building for it. Direction, shaping, word spacing and input methods are from Unicode CLDR’s data on its main script; several scripts from LinguaMeta; look-alike letters from a sample of its FineWeb-2 web text, where letters of another script stand in for its own, so one word has two spellings. Tone or vowel marks left out in everyday writing, and spelling that varies, also raise cost but aren’t recorded in the sources tracked here.')}</span>`;
}
const flagTags = l => l._fx.length ? `<div class="ftags" title="${esc(flagLabels(l).join('\n'))}">${l._fx.map(f => FLAG_SHORT[f]).join(' · ')}</div>` : '';
// A figure passes the planner's quality filter: all, on public test sets, or independent only
const qualityOK = (id, q) => { const t = TEST_OF[id]; if (!t) return false;
  return q === 'pub' ? t.test_public !== 'no' : q === 'ind' ? t.quality_by === 'independent' : true; };
const qualityShown = id => qualityOK(id, plan.q);
// Readiness: for each technology, the ingredients a team would look for before building, and whether
// each is recorded here. o.com counts only commercially usable data and models; o.q is the quality filter.
const KB_ALL = ['kb_gboard', 'kb_apple', 'kb_swiftkey', 'kb_open_keyman'];
const LLM_RESULTS = ['llm_global_mmlu_rel', 'llm_mmmlu_openai', 'llm_afrobench_gpt4o', 'llm_afrobench_gemini'];
function readiness(l, t, o = { com: false, q: 'all' }) {
  const has = id => l._offers.has(id) && !(o.com && RES[id] && RES[id].commercial === 'no');
  const fl = k => (l.rk || '').includes(k), ww = l.ww || 0, qv = l.qv || {};
  const hours = ((o.com ? l.shc : l.sh) || 0) >= 10, use = o.com ? 'commercially usable ' : 'open ';
  const asrModel = ['asr_open_whisper', 'asr_open_mms', 'asr_open_omnilingual'].some(has);
  const voice = has('tts_open_mms');
  const llmResult = LLM_RESULTS.some(id => l._offers.has(id) && qualityOK(id, o.q));
  const unicode = ['Its script is in Unicode', fl('u')], cldr = ['Locale data in CLDR', fl('l')], text1m = ok => ['A million words of web text' + ok, ww >= 1e6];
  const list = {
    speech_input: [[`10 hours or more of ${use}transcribed speech`, hours], ['An open speech recognition model' + (o.com ? ' licensed for commercial use' : ''), asrModel],
      ['A published error rate', (qv.asr_whisper_fleurs_wer != null && qualityOK('asr_open_whisper', o.q)) || (qv.asr_omnilingual_cer != null && qualityOK('asr_open_omnilingual', o.q))],
      ['A public test set (FLEURS or Common Voice)', fl('f') || fl('c')], text1m(', for a language model')],
    tts: [[`10 hours or more of ${use}transcribed speech`, hours], ['An open voice' + (o.com ? ' licensed for commercial use' : ''), voice],
      ['A keyboard to type text with', KB_ALL.some(id => l._offers.has(id))], text1m(', for text normalisation')],
    mt: [['100,000 sentence pairs with English', (l.ps || 0) >= 1e5], ['The FLORES-200 evaluation set', fl('F')],
      ['An open translation model' + (o.com ? ' licensed for commercial use' : ''), has('mt_open_nllb')],
      ['A published quality score', (qv.mt_nllb_flores_chrf != null && qualityOK('mt_open_nllb', o.q)) || (qv.mt_google_flores_chrf != null && qualityOK('mt_google', o.q))]],
    llm: [['100 million words of web text', ww >= 1e8], ['Covered by a public benchmark', fl('b')], ['A published LLM result', llmResult]],
    keyboard: [unicode, ['An open keyboard layout (Keyman)', has('kb_open_keyman')], ['A spell-check dictionary or a million words of text', has('proof_hunspell') || ww >= 1e6],
      ['A word-frequency list, for predictions (Corpus Crawler)', fl('w')], cldr],
    interface: [unicode, cldr, ['Volunteer localisers (Firefox is translated)', l._offers.has('ui_firefox')]],
    ocr: [unicode, ['A Noto font', fl('n')], ['An open OCR model (Tesseract)', has('ocr_open_tesseract')], text1m(', for training')],
    proofing: [['An open spell checker (Hunspell or LanguageTool)', has('proof_hunspell') || has('proof_languagetool')], text1m(''),
      ['A word-frequency list (Corpus Crawler)', fl('w')], ['A Universal Dependencies treebank', fl('d')]],
    assistant: [['An open speech recognition model' + (o.com ? ' licensed for commercial use' : ''), asrModel], ['An open voice' + (o.com ? ' licensed for commercial use' : ''), voice],
      ['An LLM benchmark result or AI app listing', llmResult || ['llm_app_gemini', 'llm_app_copilot', 'llm_app_chatgpt'].some(id => l._offers.has(id))]],
  }[t] || [];
  return { items: list.map(([label, ok]) => ({ label, ok: !!ok })), n: list.filter(x => x[1]).length, of: list.length };
}
const readyTitle = r => r.items.map(x => `${x.ok ? '✓' : '–'} ${x.label}`).join('\n');
function qualityText(f, q) {
  if (!f) return '';
  if (f.unit === '% WER') return depthText(f, q.quality);
  const v = f.value, poor = +q.quality_poor, good = +q.quality_good;
  const band = (v - poor) / (good - poor) >= 1 ? 'good' : (v - poor) / (good - poor) > 0.4 ? 'fair' : 'low';
  const year = ((f.source || '').match(/(\d{4})\)?$/) || [])[1];  // when it was measured, from the source
  return `${band[0].toUpperCase() + band.slice(1)} quality${year ? ` (${year})` : ''}`;
}
const ICON = p => `<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const TICON = {
  keyboard: ICON('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>'),
  speech_input: ICON('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  tts: ICON('<path d="M4 10v4h3.5L12 18V6L7.5 10H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mt: ICON('<path d="M3.5 5.5h9v7h-5l-3 2.5v-2.5h-1z"/><path d="M12.5 9.5h8v7h-1V19l-3-2.5h-4z"/>'),
  llm: ICON('<path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>'),
  interface: ICON('<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20M7 9h6M7 12h10"/>'),
  ocr: ICON('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 9.5h8M8 12h8M8 14.5h5"/>'),
  proofing: ICON('<path d="M4 15l3.5-9L11 15M5.3 12h4.4"/><path d="M13 14.5l2.5 2.5 5-6"/>'),
  assistant: ICON('<path d="M12 3.5l1.6 3.9 3.9 1.6-3.9 1.6L12 14.5l-1.6-3.9L6.5 9l3.9-1.6z"/><path d="M5 17.5c1.5 1.8 4 3 7 3s5.5-1.2 7-3"/>'),
  langid: ICON('<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L20 20M8 11h6M11 8v6"/>'),
  locale: ICON('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2"/>'),
};
function depthText(f, ind) {
  if (!f) return '';
  if (f.unit === '% WER') return f.value >= 100 ? 'No published error rate' : `${Math.round(f.value)}% word error rate`;
  if (f.unit === 'levels of 2') {
    if (ind === 'ocr_google_level') return f.value >= 2 ? '' : 'Experimental';
    return f.value >= 2 ? 'Fully translated' : 'Partly translated';
  }
  if (ind === 'ocr_azure_handwriting') return f.value ? 'Printed and handwriting' : 'Printed text only';
  if (/^features of/.test(f.unit) || /^types of/.test(f.unit)) {
    const has = (f.note || '').replace(/^Has: /, '');
    const what = /^types of/.test(f.unit) ? 'voice types' : 'features';
    const total = f.unit.split(' ').pop();
    return `${f.value} of ${total} ${what}`;
  }
  return showValue(f);
}
// Benchmarks of a few languages (AfroBench: African languages) show a tile only where they have a result
const ONLY_IF_MEASURED = new Set(['llm_afrobench_gpt4o', 'llm_afrobench_gemini']);
// Regional providers appear only where they offer the language: a row of 'not yet' tiles for every language would be noise
const regionalOn = (t, facts) => (t.regional || []).filter(id => facts[id] && facts[id].value);
function svcTile(id, own, open, via, wname) {
  // a spoken variety: where it isn't offered itself but its written standard is, the tile shows that
  const ownOn = own[id] && (own[id].unit === 'bool' ? !!own[id].value : true);
  const thru = !ownOn && via && via[id] && (via[id].unit === 'bool' ? !!via[id].value : true);
  const facts = thru ? { ...own, ...via } : own;
  const f = facts[id], [name, kind, prov] = SVC[id] || [id, '', ''];
  const reg = prov in REGIONAL;
  const pv = prov ? ` data-prov="${prov}"${reg ? ' data-regional' : ''} style="--p:var(--prov-${reg ? 'regional' : prov})"` : '';
  const by = prov ? `<span class="by">${esc(PROV_ALL[prov] || prov)}</span>` : '';
  if (!f) return `<div class="tile off"${pv}><span class="mark" aria-hidden="true">–</span><div>${by}<b>${esc(name)}</b><small>${esc(kind)} · not benchmarked</small></div></div>`;
  const on = f.unit === 'bool' ? !!f.value : true;
  let detail = '';
  if (f.unit === '% of English') detail = `${Math.round(f.value)}% of English`;
  else if (f.unit === 'accuracy') detail = `${Math.round(f.value * 100)}% accuracy`;
  else if (f.unit === 'chrF') detail = `${Math.round(f.value)} chrF from English`;
  else if (on && DEPTH_OF[id]) detail = depthText(facts[DEPTH_OF[id]], DEPTH_OF[id]);
  const qf = on && QUALITY_OF[id] ? facts[QUALITY_OF[id].quality] : null;
  if (qf) detail = [detail, qualityText(qf, QUALITY_OF[id])].filter(Boolean).join(' · ');
  const measured = ['% of English', 'accuracy', 'chrF'].includes(f.unit);
  const figure = measured || (qf && !(qf.unit === '% WER' && qf.value >= 100));  // a published figure, not 'none published'
  if (figure && TEST_OF[id]) detail = [detail, measuredShort(id)].filter(Boolean).join(' · ');
  const dep = on && DEPTH_OF[id] ? facts[DEPTH_OF[id]] : qf;
  const qline = qf && qf.unit !== '% WER' ? `${qf.source}: ${Math.round(qf.value)} ${qf.unit}. ${qf.note}` : qf ? `${qf.source}. ${qf.note}` : '';
  const hover = [f.source, qline, dep && dep !== qf && dep.note ? dep.note : qf ? '' : f.note, figure ? measuredLong(id) : ''].filter(Boolean).join('\n');
  if (thru) detail = [`Through ${wname}`, detail].filter(Boolean).join(' · ');
  return `<a class="tile ${thru ? 'thru' : on ? 'on' : 'off'}"${pv} href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : on ? '✓' : '–'}</span>
    <div>${by}<b>${esc(name)}</b><small>${esc(kind)}${on || measured ? '' : ' · <span class="vis">Not yet</span>'}</small>${detail ? `<span class="det">${esc(detail)}</span>` : ''}</div></a>`;
}

// Locale data: CLDR's coverage level, a tile of its own since no service offers it
const CLDR_LEVEL = ['Not in CLDR', 'Basic coverage', 'Moderate coverage', 'Modern coverage'];
function localeTile(f, vf, wname) {
  const thru = vf && (!f || vf.value > f.value);
  const g = thru ? vf : f;
  if (!g) return `<div class="tile off"><span class="mark" aria-hidden="true">–</span><div><span class="by">Unicode CLDR</span><b>Locale data</b><small>Dates, numbers, names · <span class="vis">Not in CLDR</span></small></div></div>`;
  const lv = Math.round(g.value), det = [thru ? `Through ${wname}` : '', CLDR_LEVEL[lv]].filter(Boolean).join(' · ');
  const below = !lv && /below basic/.test(g.note);
  return `<a class="tile ${thru ? 'thru' : lv ? 'on' : 'off'}" href="${esc(g.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc([g.source, g.note].filter(Boolean).join('\n'))}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : lv ? '✓' : '–'}</span>
    <div><span class="by">Unicode CLDR</span><b>Locale data</b><small>Dates, numbers, names${lv ? '' : ` · <span class="vis">${below ? 'Below basic' : 'Not in CLDR'}</span>`}</small>${lv ? `<span class="det">${esc(det)}</span>` : ''}</div></a>`;
}
// Commercial use: what each open resource's licence permits (resources.csv: yes, no, varies)
const fmtHours = h => h >= 10 ? `${Math.round(h).toLocaleString()} hours` : `${(+h).toFixed(1)} hours`;
const nonCommercialSets = facts => Object.keys(facts).filter(i => (i.startsWith('speech_') || i === 'cv_validated_hours') && facts[i].value && RES[i] && RES[i].commercial === 'no').map(i => RES[i].name).join(', ');
const COMMERCIAL = { yes: 'Permitted', no: 'Not permitted', varies: 'Varies' };
// Every value's source, retrieval date and note, in a list that opens by click, tap or keyboard
// (the same details are on hover over each value, which touch and keyboard users can't reach)
const fmtDay = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
function provItem(label, f, thru) {
  const u = (f.url || '').split(' ')[0];
  return `<li><b>${esc(label)}</b>${thru ? ` <span class="muted">through ${esc(thru)}</span>` : ''}: ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(f.source)}</a>` : esc(f.source)}, retrieved ${esc(fmtDay(f.retrieved))}${f.note ? `. ${esc(f.note)}` : ''}</li>`;
}
function provList(l, key, facts, vfacts, wname) {
  const items = [];
  const add = (label, id) => {
    if (facts[id]) items.push(provItem(label, facts[id]));
    if (vfacts && vfacts[id] && vfacts[id] !== facts[id]) items.push(provItem(label, vfacts[id], wname));
  };
  if (key === 'tech') {
    for (const [tk, t] of Object.entries(CFG.tech.technologies)) {
      const ids = t.indicator ? [t.indicator] : [...(t.consumer || []), ...(t.regional || []), ...(t.open || []),
        ...Object.keys(t.measured || {}), ...Object.keys(t.depth || {}), ...Object.values(t.quality || {}).map(q => q.indicator)];
      for (const id of [...new Set(ids)]) add(`${t.label} · ${(SVC[id] || [])[0] || DATA.labels[id] || id}`, id);
    }
  } else {
    for (const [ik, spec] of Object.entries(CFG[key].indicators)) {
      add(spec.label, ik);
      if (spec.narrowed_by) add(spec.label + ' · Bible-site share', spec.narrowed_by);
    }
    if (key === 'data') add('Word-frequency list (not scored; in the keyboard and spelling checklists)', 'wordlist_corpuscrawler');
  }
  if (!items.length) return '';
  return `<details class="prov"><summary>Sources, dates and notes <span class="muted">· ${items.length}</span></summary><ul>${items.join('')}</ul></details>`;
}
function dimPanel(l, key, color) {
  const d = l.dimensions[key], facts = DATA.facts[l.code] || {}, cfg = CFG[key];
  const vfacts = (DATA.via || {})[l.code], vd = l.via_dims && l.via_dims[key], w = BY[l.written_in], wname = w ? w.name : '';
  const thru = v => `<span class="thru-v" title="Counted from ${esc(wname)}">through ${esc(wname)} ${v}</span>`;
  let body = '';
  if (key === 'tech') {
    body += `<div class="provkey" role="group" aria-label="Highlight a provider"><span>Highlight</span>${Object.entries({ ...PROV, ...(Object.values(cfg.technologies).some(t => regionalOn(t, facts).length) ? { regional: 'Regional providers' } : {}) }).map(([k, n]) =>
      `<button class="chip prov" id="pv-${k}" data-pv="${k}" aria-pressed="${provFocus === k}" style="--p:var(--prov-${k})"${k === 'regional' ? ` title="${esc(Object.values(REGIONAL).join(', '))}"` : ''}><i></i>${esc(n)}</button>`).join('')}</div>`;
    const main = [], more = [], peek = [];
    for (const [tk, t] of Object.entries(cfg.technologies)) {
      const s = d.indicators[tk], sv = s == null ? 'not measured' : s.toFixed(2);
      const vs = vd && vd.indicators[tk] != null && vd.indicators[tk] !== s ? vd.indicators[tk] : null;
      const ids = [...(t.consumer || []), ...regionalOn(t, facts), ...(t.open || []),
        ...Object.keys(t.measured || {}).filter(id => facts[id] || !ONLY_IF_MEASURED.has(id))];
      const order = PROV_ORDER, rank = id => { const i = order.indexOf((SVC[id] || [])[2]); return i < 0 ? order.length : i; };
      const tiles = t.indicator ? localeTile(facts[t.indicator], vfacts && vfacts[t.indicator], wname)
        : [...ids].sort((a, b) => rank(a) - rank(b)).map(id => svcTile(id, facts, (t.open || []).includes(id), vfacts, wname)).join('');
      const row = `<div class="techrow">
        <div class="tech-h">${TICON[tk] || ''}<b>${esc(t.label)}</b><span class="ind-val">${sv}${vs == null ? '' : ` ${thru(vs.toFixed(2))}`}</span></div>
        ${s == null ? '' : bar(s)}
        <div class="tiles">${tiles}</div></div>`;
      if (t.group === 'more') { more.push(row); peek.push(`<span title="${esc(t.label)}">${TICON[tk] || ''}<span class="sr">${esc(t.label)}</span>${sv}</span>`); }
      else main.push(row);
    }
    body += main.join('');
    if (more.length) body += `<details class="more-tech"${moreOpen ? ' open' : ''}>
      <summary><span class="mt-title">More technologies</span><span class="mt-peek">${peek.join('')}</span></summary>${more.join('')}</details>`;
  } else {
    body += '<div class="inds">';
    for (const [ik, spec] of Object.entries(cfg.indicators)) {
      const f = facts[ik], n = d.indicators[ik];
      const hover = f ? [f.source, 'Retrieved ' + f.retrieved, f.note].filter(Boolean).join('\n') : '';
      const lab = f ? `<a class="indlink" href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">${esc(spec.label)}</a>` : esc(spec.label);
      const nb = spec.narrowed_by && facts[spec.narrowed_by];  // e.g. how much of the web text is from Bible sites
      const narrow = nb && nb.value >= 0.1 && f && f.value
        ? `<div class="missing" title="${esc(nb.note)}">${Math.round(nb.value * 100)}% from Bible sites, so it counts for less</div>` : '';
      const vf = vfacts && vfacts[ik], vn = vd && vd.indicators[ik];
      // open speech: how much of it is licensed for commercial use (resources.csv)
      const usable = ik === 'open_speech_hours' && l.sh && l.shc < l.sh
        ? `<div class="thru-line">${fmtHours(l.shc)} licensed for commercial use; the rest is for research only (${esc(nonCommercialSets(facts))})</div>` : '';
      const vline = vf && vn != null && vn !== n ? `<div class="thru-line">Through <a href="${LH(w.code)}">${esc(wname)}</a>: ${esc(showValue(vf))}</div>` : '';
      body += `<div class="ind"><div class="ind-top"><b>${lab}</b><span class="ind-val">${esc(showValue(f))}</span></div>${vline}${usable}
        ${n == null ? '<div class="missing">Not collected yet; left out of this score</div>' : bar(n)}${narrow}</div>`;
    }
    body += '</div>';
  }
  body += provList(l, key, facts, vfacts, wname);
  return `<section class="dim wide${key === 'tech' ? ' techdim' : ''}${key === 'tech' && provFocus && body.includes(`id="pv-${provFocus}"`) ? ' focus-' + provFocus : ''}" style="--c:var(${color})"><h3>${esc(CFG[key].label)}<span>${d.score.toFixed(2)}</span></h3>${vd && vd.score !== d.score ? `<div class="thru-dim">${esc(wname)}’s written resources counted in: ${vd.score.toFixed(2)}</div>` : ''}${d.raw < d.score ? `<div class="thru-dim">${d.raw.toFixed(3)} before the floor of ${DATA.config.meta.floor}</div>` : ''}${key === 'tech' ? evidenceLine(l) : ''}${body}</section>`;
}

function reachLine(l) {
  const f = DATA.facts[l.code] || {}, sp = l.speakers || 0;
  if (!f.reach_voice_share || !sp) return '';
  const n = k => f[k] ? sp * f[k].value : null;
  const g = f.speaker_growth_5y ? f.speaker_growth_5y.value : 1;
  return `<div class="reach" title="${esc(f.reach_voice_share.note)}">
    <span>Online today <b>${people(n('reach_voice_share'))}</b></span>
    <span>Online and able to text <b>${people(n('reach_text_share'))}</b></span>
    <span>Online in five years <b>${people(n('reach_voice_share_5y') * g)}</b></span>
    <a href="${esc(f.reach_voice_share.url)}" target="_blank" rel="noopener">World Bank data</a></div>`;
}

// A writing sample: Article 1 of the Universal Declaration of Human Rights, from UDHR in XML (the
// translations the UN human rights office collects, in one form), with the English for comparison
const UDHR = 'https://github.com/eric-muller/udhr';
const UDHR_COMMIT = '588b3f4b2d0467aff54842a4b926551b69d5a66a';
function sampleBlock(l) {
  if (!l.sample) return '';
  const [text, tag, dir, name, f, script] = l.sample;
  const italic = ['Latn', 'Cyrl', 'Grek'].includes(script);  // scripts with an italic style
  return `<figure class="sample">
    <blockquote lang="${esc(tag)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}"${italic ? ' class="it"' : ''}>${esc(text)}</blockquote>
    <figcaption title="${l.code === 'en' ? '' : 'All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood.'}">Article 1 of the Universal Declaration of Human Rights,
      <span class="src">from <a href="${UDHR}/blob/${UDHR_COMMIT}/data/udhr/udhr_${esc(f)}.xml" target="_blank" rel="noopener">UDHR in XML</a> (${esc(name)})</span></figcaption>
  </figure>`;
}
// Hear the language: a few words spoken by one speaker, from Lingua Libre (Wikimedia Commons, CC BY-SA)
function hearBlock(l) {
  const h = l.hear;
  if (!h || !h.clips.length) return '';
  const an = /^[AEIOU]/.test(l.name) ? 'an' : 'a';
  const clip = ([word, gloss, src]) => `<button type="button" class="clip" data-src="${esc(src)}" aria-label="Play ${esc(word)}"${gloss ? ` title="${esc(gloss)}"` : ''}>
      <span class="ico" aria-hidden="true"></span><span lang="${esc(l.code)}">${esc(word)}</span>${gloss && gloss.length <= 28 ? `<small>${esc(gloss)}</small>` : ''}</button>`;
  return `<div class="hear" role="group" aria-label="Hear ${an} ${esc(l.name)} speaker say">${TICON.tts}
    <div class="clips">${h.clips.map(clip).join('')}</div>
    <div class="hear-src">Recorded by <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(h.clips[0][3])}" target="_blank" rel="noopener">${esc(h.speaker)}</a> for <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a></div></div>`;
}
let hearAudio = null;
function bindHear() {
  document.querySelectorAll('.hear .clip').forEach(b => b.onclick = () => {
    const same = hearAudio && hearAudio.dataset.src === b.dataset.src && !hearAudio.paused;
    if (hearAudio) { hearAudio.pause(); document.querySelectorAll('.hear .clip.playing').forEach(x => x.classList.remove('playing')); }
    if (same) return;  // a second press stops it
    hearAudio = new Audio(b.dataset.src); hearAudio.dataset.src = b.dataset.src;
    b.classList.add('playing');
    hearAudio.onended = hearAudio.onerror = () => b.classList.remove('playing');
    hearAudio.play().catch(() => b.classList.remove('playing'));
  });
}
// Where its speakers in a country are counted from a census (immigrant languages LinguaMeta doesn't
// list there): which countries, and the source
function censusInfo(l) {
  const cs = l.census || [];
  if (!cs.length) return '';
  const year = c => (c[1].match(/(\d{4}(?:-\d{4})?)$/) || [])[1];
  const src = [...new Map(cs.map(c => [c[2], c[1].startsWith('UN') ? 'UN Statistics Division' : 'US Census Bureau'])).entries()];
  return infoTip('Where these countries come from', `Countries and speaker numbers are from LinguaMeta, except in ${cs.length > 1 ? 'these countries' : 'this country'}, where they come from ${cs.length > 1 ? 'national censuses' : 'its census'} (LinguaMeta doesn't list the language there, or gives no count):
    ${cs.map(c => `${esc(c[0])}${year(c) ? ` (${year(c).replace('-', '–')})` : ''}`).join(', ')}.
    <span class="info-src">${src.map(([u, n]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join(' · ')}</span>`);
}
// Whether the main script is encoded in Unicode: reported, not scored
function unicodeNote(l) {
  const f = (DATA.facts[l.code] || {}).script_encoded;
  if (!f || f.value || !l.script_names.length) return '';  // nearly every recorded script is: only the exceptions are noted
  return ` <a class="uni no" href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc([f.source, f.note].filter(Boolean).join('\n'))}">not yet in Unicode</a>`;
}
// Spoken varieties counted from a written standard for writing and text
function writtenInfo(l) {
  if (!l.written_in || !BY[l.written_in]) return '';
  const w = BY[l.written_in];
  if (l.shares_written) return infoTip('How writing is counted', `${esc(l.name)} is written in the standard form of <a href="${LH(w.code)}">${esc(w.name)}</a>, and sources label that text and its tools as ${esc(w.name)}, so ${esc(w.name)}’s written data and text technologies count as ${esc(l.name)}’s. Speech data and technologies are counted separately.`);
  return infoTip('How the standard is counted', `${esc(l.name)} speakers typically write the standard form of <a href="${LH(w.code)}">${esc(w.name)}</a>. The score and rank count only what exists for ${esc(l.name)} itself; a second score counts ${esc(w.name)}’s written data and text technologies too, as most speakers can use them. On this page, values marked “through ${esc(w.name)}” are ${esc(w.name)}’s.`);
}
// What the technology score rests on: language-list entries, and quality measurements with the oldest's year
function evidenceLine(l) {
  const e = l.evidence;
  if (!e || !(e.listed || e.measured)) return '';
  const n = (k, one, many) => `${k.toLocaleString()} ${k === 1 ? one : many}`;
  return `<div class="thru-dim" title="List entries say a service supports the language; measurements say how well (benchmarks, error rates, translation scores). Most languages have no measurements, so their scores rest on lists alone.">Based on ${n(e.listed, 'language-list entry', 'language-list entries')}${e.measured ? ` and ${n(e.measured, 'quality measurement', 'quality measurements')}${e.oldest ? ` (oldest ${e.oldest})` : ''}` : ', with no quality measurements'}</div>`;
}
// Under the score: a spoken variety's score through its written standard; the score before the floor
function scoreNotes(l) {
  const w = BY[l.written_in], out = [];
  if (rangeText(l)) out.push(`<div class="snote" title="Where ${esc(l.name)} ranks in 90% of ${(DATA.sensitivity || {}).draws || 1000} re-scorings that vary the weights, goalposts and floor within reasonable ranges (see About)">Rank range <b>${rangeText(l)}</b></div>`);
  if (l.via && w) {
    const [c, t] = tierOf(l.via[1]);
    out.push(`<div class="snote" title="Counting ${esc(w.name)}’s written data and text technologies, which ${esc(l.name)} speakers can typically use. The rank is on ${esc(l.name)}’s own score.">Through <a href="${LH(w.code)}">${esc(w.name)}</a> <b>${l.via[0].toFixed(3)}</b> <span class="tier ${c} sm">${esc(t)}</span></div>`);
  }
  if (l.raw && Object.values(l.raw).some(v => v > 0)) {
    const un = Math.sqrt(DIMS.reduce((p, [k]) => p * (k in l.raw ? l.raw[k] : l.scores[k]), 1));
    out.push(`<div class="snote" title="${esc(rawText(l))}. Ranks use the unfloored scores, so any recorded resource counts.">${un.toFixed(3)} before the floor</div>`);
  }
  return out.join('');
}
// Countries, by number of speakers: the top three, or all of them with a link back
function whereLine(l, all) {
  const cs = l.countries, n = cs.length - 3;
  if (n <= 0) return `Mainly in <b>${cs.map(esc).join(', ')}</b>`;
  return all ? `Spoken in <b>${cs.map(esc).join(', ')}</b> <button class="linkish" data-more="0">less</button>`
             : `Mainly in <b>${cs.slice(0, 3).map(esc).join(', ')}</b> <button class="linkish" data-more="1">and ${n} more</button>`;
}
// Demand: who could use it is the speaker count; these say who's reaching for it
function demandPanel(l) {
  const f = DATA.facts[l.code] || {}, v = i => f[i] && f[i].value ? f[i].value : 0;
  const off = officialList(l);
  const top = Object.entries(l._cs).filter(([c]) => !l._im.has(c)).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 3).map(([c]) => c);
  const lit = top.filter(c => DATA.country_literacy[c] != null).map(c => `${COUNTRY_NAMES[c] || c.toUpperCase()} ${Math.round(DATA.country_literacy[c])}%${l.literacy && l.literacy[c] != null ? ` (in ${esc(l.name)}: ${Math.round(l.literacy[c])}%)` : ''}`);
  const card = (h, big, note, title) => `<div class="dcard"${title ? ` title="${esc(title)}"` : ''}><div class="dh">${h}</div><div class="dv">${big}</div><div class="dn">${note}</div></div>`;
  return `<h3 class="panel-h">Demand signals</h3>
    <div class="demand-grid">
      ${card('Official status', off.length ? `${off.length} ${off.length === 1 ? 'country' : 'countries'}` : 'None recorded', off.length ? esc(off.slice(0, 6).join(', ') + (off.length > 6 ? ` and ${off.length - 6} more` : '')) : 'Not official in any country in CLDR’s territory data', 'Unicode CLDR territory data: official, official in practice, or official in a region. Where a country’s constitution names a language CLDR doesn’t mark, the constitution: Hausa and Igbo in Nigeria (section 55 of the 1999 Constitution)')}
      ${card('Adult literacy', lit.length ? `${Math.round(DATA.country_literacy[top.find(c => DATA.country_literacy[c] != null)])}%` : '—', lit.length ? esc(lit.join('; ')) : 'Not recorded for its countries', 'Unicode CLDR territory data: adult literacy in each of its main countries, and in the language itself where CLDR records it')}
      ${card('Wikipedia readers', v('wikipedia_pageviews') ? big(v('wikipedia_pageviews')) : '—', v('wikipedia_pageviews') ? `page views in 12 months${v('wikipedia_active_editors') ? `; ${v('wikipedia_active_editors').toLocaleString()} active editors` : ''}` : 'No Wikipedia edition with page views', f.wikipedia_pageviews ? `${f.wikipedia_pageviews.source}: ${f.wikipedia_pageviews.note}` : '')}
      ${card('Builders on Hugging Face', v('hf_models') ? v('hf_models').toLocaleString() + (v('hf_models') === 1 ? ' model' : ' models') : '—', v('hf_models') ? `made for it, ${big(v('hf_model_downloads'))} downloads in 30 days${v('hf_datasets') ? `; ${Math.round(v('hf_datasets')).toLocaleString()} datasets` : ''}` : `No models made for it with recent downloads${v('hf_datasets') ? `; ${Math.round(v('hf_datasets')).toLocaleString()} datasets` : ''}`, f.hf_models ? `Models tagged with it and at most five languages, downloaded at least 10 times in 30 days. ${f.hf_models.note}` : '')}
    </div>
    <p class="note">Speaker counts say who could use a product; these say who's reaching for one. Official status brings public-sector demand, page views show reading demand, and models with downloads show builders already at work.</p>`;
}
function whenLabel(a, b) {
  const m = p => /^\d{4}-\d\d$/.test(p) ? new Date(p + '-15T12:00:00') : null, fa = m(a), fb = m(b);
  if (!fa || !fb) return `${a} to ${b}`;
  const mo = d => d.toLocaleDateString('en-GB', { month: 'short' });
  return fa.getFullYear() === fb.getFullYear() ? `${mo(fa)} to ${mo(fb)} ${fb.getFullYear()}` : `${mo(fa)} ${fa.getFullYear()} to ${mo(fb)} ${fb.getFullYear()}`;
}
function changesLine(l) {
  const ev = l.changes || [], S = DATA.change_series || {};
  if (!ev.length) return '';
  return `<h3 class="panel-h">What changed <a href="#charts" style="font-size:14px;font-weight:600">Growth over time</a></h3>
    <ul class="chg-lang">${ev.map(([a, b, s, d]) => `<li><span class="muted">${esc(whenLabel(a, b))}</span> ${esc(S[s] || s)}: ${d > 0 ? 'added' : 'no longer listed'}</li>`).join('')}</ul>`;
}
// Who is already working on it: the organisations behind its datasets, models, benchmarks and regional services
function orgPanel(l) {
  if (!l.orgs || !l.orgs.length) return '';
  return `<h3 class="panel-h">Who’s already working on it</h3>
    <ul class="org-list">${l.orgs.map(o => `<li><div><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.organisation)}</a> <span class="muted small">${esc(o.kind)}</span></div><div class="small">${esc(o.what.join(', '))}</div></li>`).join('')}</ul>
    <p class="note">The organisations behind the datasets, open models, benchmarks and regional services recorded for ${esc(l.name)}, community and university work first: the likeliest partners for a new project. The global commercial services are in the technology panel above.</p>`;
}
function readyCard(l, t) {
  const r = readiness(l, t);
  return `<div class="rcard"><div class="rhead">${TICON[t] || ''}<b>${esc(TECHL[t] || t)}</b><span class="rn">${r.n} of ${r.of}</span></div>
    <ul>${r.items.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><span class="rm" aria-hidden="true">${x.ok ? '✓' : '–'}</span><span class="sronly">${x.ok ? 'Has: ' : 'Missing: '}</span>${esc(x.label)}</li>`).join('')}</ul></div>`;
}
async function language(code) {
  const l = BY[code];
  if (!l) return ranking();
  await need(code);
  $('#view').innerHTML = `
    <button class="back" id="back">← All languages</button>
    <div class="lhead lang">
      <div class="lmain"><h2>${esc(l.name)} <span class="auto">${esc(l.autonym !== l.name ? l.autonym : '')} <span class="code" title="BCP 47 code">[${l.code}]</span></span>${l.note ? infoTip('About this language', esc(l.note)) : ''}</h2>
        <div class="facts"><span>${l.speakers ? `<b>${people(l.speakers)}</b> speakers` : 'Speakers not recorded'}</span>${l.iso_639_3 && l.iso_639_3 !== l.code ? `<span>ISO 639-3 <b class="code">${esc(l.iso_639_3)}</b></span>` : ''}
        <span>${l.script_names.length > 1 ? 'Scripts' : 'Script'} <b>${l.script_names.length ? esc(l.script_names.join(', ')) : 'not recorded'}</b>${unicodeNote(l)}${writtenInfo(l)}</span>${engLine(l)}${famLine(l)}
        <span><span id="where">${whereLine(l, false)}</span>${censusInfo(l)}</span>${!['none', 'not_endangered'].includes(endKey(l)) ? `<span title="${endKey(l) === 'revitalizing' ? `Listed as extinct or dormant in ${l.endangerment_source === 'glottolog' ? 'Glottolog' : 'LinguaMeta'}, but with speakers recorded today, often through revival` : `UNESCO's endangerment scale, ${esc(END_SOURCE[l.endangerment_source] || 'from LinguaMeta')}`}">Endangerment <b>${esc(END_LABEL[endKey(l)])}</b></span>` : ''}</div>
        ${reachLine(l)}
        ${sampleBlock(l)}
        ${hearBlock(l)}
      </div>
      <div class="lscore"><div class="eyebrow">${!l.rank ? 'Extinct · not ranked' : l.tied ? `Joint rank ${l.rank.toLocaleString()} of ${LANGS.length.toLocaleString()} · tied with ${l.tied.toLocaleString()} ${l.tied === 1 ? 'other' : 'others'}` : `Rank ${l.rank.toLocaleString()} of ${LANGS.length.toLocaleString()}`}</div><div class="big">${l.ltdi.toFixed(3)}</div>${tierChip(l)}${scoreNotes(l)}${miniMap(l)}</div>
    </div>
    <div class="cmpbar">${langPicker('cmpsel', 'Choose a language to compare')}${l.extinct ? '' : slWide(l)}</div>
    <div class="dims">${['tech', 'data'].map(k => dimPanel(l, k, DIMS.find(d => d[0] === k)[2])).join('')}</div>
    ${l.extinct ? '' : demandPanel(l)}
    <h3 class="panel-h">Readiness to build</h3>
    <div class="ready-grid">${PLAN_TECHS.map(t => readyCard(l, t)).join('')}</div>
    <p class="note">What a team would look for before building each technology, and whether it's recorded here for ${esc(l.name)} itself. The Plan tab sorts languages on these and can count only data and models licensed for commercial use.</p>
    ${relatedPanel(l)}
    ${orgPanel(l)}
    <h3 class="panel-h">Opportunities <a href="#opportunities-${l.code}" style="font-size:14px;font-weight:600">Filter and compare by type</a></h3>
    ${l.opportunities.length ? `<ol class="opps">${[...l.opportunities].sort((a, b) => prio(b) - prio(a)).map(o => oppItem(o, l, false)).join('')}</ol>` : `<p class="note">${l.extinct ? 'None listed: with no speakers recorded, there is no one for new technology to reach yet.' : 'No gaps found in the indicators collected so far.'}</p>`}
    <p class="note">Metadata from <a href="${esc(l.source)}" target="_blank" rel="noopener">LinguaMeta</a>${l.script_source === 'qq' ? `, with the script from <a href="https://github.com/WPoelman/qwanqwa" target="_blank" rel="noopener">QQ</a>` : ''}. Something out of date or missing for ${esc(l.name)}? Email <span class="email">langtechindex@gmail.com</span> or <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">send a correction on GitHub</a>.</p>
    ${changesLine(l)}`;
  $('#back').onclick = () => { go('ranking'); };
  bindMiniMap(l);
  bindHear();
  $('#where').onclick = e => { const b = e.target.closest('[data-more]'); if (b) $('#where').innerHTML = whereLine(l, b.dataset.more === '1'); };
  const mt = $('#view').querySelector('details.more-tech');
  if (mt) mt.ontoggle = () => { moreOpen = mt.open; };
  $('#view').querySelectorAll('[data-pv]').forEach(b => b.onclick = () => {
    provFocus = provFocus === b.dataset.pv ? null : b.dataset.pv;
    const sec = $('section.dim.techdim');
    sec.className = sec.className.replace(/ focus-\w+/g, '') + (provFocus ? ' focus-' + provFocus : '');
    $('#view').querySelectorAll('[data-pv]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.pv === provFocus)));
  });
  $('#cmpsel').onchange = e => { const c = pickedCode(e.target.value); if (c && c !== code) go(`compare-${code}-${c}`); };
  navBox('go', 'Find another language name or code');
}

// ---------------------------------------------------------------- compare
async function compare(a, b) {
  const A = BY[a], B = BY[b];
  if (!A || !B) return ranking();
  await need(a, b);
  const fa = DATA.facts[a] || {}, fb = DATA.facts[b] || {};
  const diff = (x, y) => {
    if (x == null || y == null) return '';
    const g = y - x; return Math.abs(g) < 0.005 ? '<span class="gap">=</span>' : `<span class="gap ${g < 0 ? 'neg' : ''}">${g > 0 ? '+' : ''}${g.toFixed(2)}</span>`;
  };
  let rows = `<tr><td>LTDI</td><td class="num score">${A.ltdi.toFixed(3)}</td><td class="num score">${B.ltdi.toFixed(3)}</td><td class="num">${diff(A.ltdi, B.ltdi)}</td></tr>
    <tr><td>Speakers</td><td class="num">${people(A.speakers)}</td><td class="num">${people(B.speakers)}</td><td></td></tr>`;
  for (const [k, , c] of DIMS) {
    const da = A.dimensions[k], db = B.dimensions[k];
    rows += `<tr class="sect"><td colspan="4" style="color:var(${c})">${esc(CFG[k].label)} · ${da.score.toFixed(2)} vs ${db.score.toFixed(2)}</td></tr>`;
    if (k === 'tech') {
      for (const [tk, t] of Object.entries(CFG.tech.technologies)) {
        const x = da.indicators[tk], y = db.indicators[tk];
        rows += `<tr><td>${esc(t.label)}</td><td class="num">${x == null ? 'not measured' : x.toFixed(2)}</td><td class="num">${y == null ? 'not measured' : y.toFixed(2)}</td><td class="num">${diff(x, y)}</td></tr>`;
      }
    } else {
      for (const [ik, spec] of Object.entries(CFG[k].indicators)) {
        rows += `<tr><td>${esc(spec.label)}</td><td class="num">${esc(showValue(fa[ik]))}</td><td class="num">${esc(showValue(fb[ik]))}</td><td class="num">${diff(da.indicators[ik], db.indicators[ik])}</td></tr>`;
      }
    }
  }
  $('#view').innerHTML = `
    <button class="back" id="back">← ${esc(A.name)}</button>
    <div class="lhead"><h2>${esc(A.name)} and ${esc(B.name)}</h2></div>
    <p class="note">Gap column shows ${esc(B.name)} minus ${esc(A.name)} on the 0–1 scale.</p>
    <div class="tablebox"><table class="cmp">
      <thead><tr><th></th><th class="lang num">${esc(A.name)}</th><th class="lang num">${esc(B.name)}</th><th class="num">Gap</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  $('#back').onclick = () => { go('lang-' + a); };
  navBox('go', 'Find another language name or code');
}


// ----------------------------------------------------------------- charts
const tipEl = () => document.getElementById('tip');
function tipShow(e, html) { const t = tipEl(); if (!t) return; t.innerHTML = html; t.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - 300), y = e.clientY + 14; t.style.left = x + 'px'; t.style.top = y + 'px'; }
function tipHide() { const t = tipEl(); if (t) t.hidden = true; }
// The region chart: the nearest dot to the pointer within its radius shows its tip; selecting it opens the language
function bindStrip() {
  const svg = document.getElementById('strip'), hit = document.getElementById('strip-hit');
  if (!svg) return;
  const at = e => {
    const m = svg.getScreenCTM(); if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best = null, bd = Infinity;
    for (const d of STRIP) { const dd = (d.x - p.x) ** 2 + (d.y - p.y) ** 2; if (dd < bd && dd <= (d.r + 2) ** 2) { bd = dd; best = d; } }
    return best;
  };
  svg.addEventListener('mousemove', e => {
    const d = at(e);
    svg.style.cursor = d ? 'pointer' : '';
    if (!d) { hit.setAttribute('visibility', 'hidden'); tipHide(); return; }
    hit.setAttribute('cx', d.x); hit.setAttribute('cy', d.y); hit.setAttribute('r', d.r + 1.5); hit.setAttribute('visibility', 'visible');
    tipShow(e, d.tip());
  });
  svg.addEventListener('mouseleave', () => { hit.setAttribute('visibility', 'hidden'); tipHide(); });
  svg.addEventListener('click', e => { const d = at(e); if (d) { tipHide(); go('lang-' + d.l.code); } });
}
function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', e => tipShow(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', tipHide);
    el.addEventListener('focus', e => { const r = el.getBoundingClientRect(); tipShow({ clientX: r.left, clientY: r.bottom }, el.getAttribute('data-tip')); });
    el.addEventListener('blur', tipHide);
  });
}

const LEVELS = [['full', 'Widely available'], ['part', 'In some services'], ['open', 'Open model only'], ['none', 'None found']];
const levelOf = (l, key) => l.levels[key];  // worked out when scoring: full, part, open or none

// ---- provider filter (Charts) ----------------------------------------------
// A provider's view counts its own services only: how many languages each one offers.
let provider = 'All';
const SERIES_PROV = { deepl: 'deepl', open_mt: 'meta', reading_bench: 'meta', open_asr: 'openai' };
let histMode = 'langs';
let stripMode = 'all';
let STRIP = [];  // the region chart's dots: {x, y, r, l, tip}  // the region chart: every language spoken in a region, or only those from it  // the growth charts count languages, or their speakers
const offers = (l, id) => l._offers.has(id);
const provIds = (t, prov) => [...(t.consumer || []), ...(t.regional || []), ...(t.open || []), ...Object.keys(t.measured || {})].filter(id => (SVC[id] || [])[2] === prov);
const PLEVELS = [['full', 'Offered'], ['part', 'In some of its services'], ['none', 'Not found']];
function provLevel(l, ids) { const n = ids.filter(id => offers(l, id)).length; return n === ids.length ? 'full' : n ? 'part' : 'none'; }
const covCache = new Map();
function provCoverage(l, prov) {
  const key = prov + ' ' + l.code;
  if (!covCache.has(key)) {
    const ids = Object.values(CFG.tech.technologies).flatMap(t => provIds(t, prov));
    const n = ids.filter(id => offers(l, id)).length;
    covCache.set(key, { n, of: ids.length, share: ids.length ? n / ids.length : 0 });
  }
  return covCache.get(key);
}
const provBench = prov => Object.values(CFG.tech.technologies).some(t => Object.keys(t.measured || {}).some(id => (SVC[id] || [])[2] === prov));
const provWhat = prov => provBench(prov) ? 'services and benchmarks' : 'services';
const covTier = v => v >= 0.9 ? 'vh' : v >= 0.6 ? 'h' : v >= 0.3 ? 'm' : 'l';
function provMissing(o, l, prov) {  // the provider's services for this opportunity's technology that lack the language
  const t = CFG.tech.technologies[o.technology];
  const label = id => { const [name, kind] = SVC[id];
    if (t.measured && id in t.measured) return `${kind} results`;
    return /^(iOS|Google Cloud|Azure|Microsoft 365)$/.test(name) ? `${name} ${/[A-Z]/.test(kind.slice(1)) ? kind : kind.toLowerCase()}` : name; };
  return t ? provIds(t, prov).filter(id => !offers(l, id)).map(label) : [];
}
function providerSelect(id) {
  const opt = ([k, n]) => `<option value="${k}"${k === provider ? ' selected' : ''}>${esc(n)}</option>`;
  return `<select id="${id}" aria-label="Provider"><option value="All"${provider === 'All' ? ' selected' : ''}>All providers</option>${Object.entries(PROV).map(opt).join('')}
    <optgroup label="Regional providers">${Object.entries(REGIONAL).map(opt).join('')}</optgroup></select>`;
}

const GEO = window.LTDI_DATA ? window.LTDI_MAP || null : JSON.parse(document.getElementById('ltdi-map').textContent || 'null');
const TIERC = { vh: '--t-vh', h: '--t-h', m: '--t-m', lc: '--t-lc', lo: '--t-lo', ld: '--t-ld', ln: '--t-ln', l: '--t-l' };
const bgDots = (pts, r) => pts.map(p => `M${(p[2] - r).toFixed(2)},${p[3]}a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(2 * r).toFixed(2)},0a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(-2 * r).toFixed(2)},0`).join('');
let mapR = null;  // base radii for the current render
let mapFocus = null, mapFocusFresh = false;  // a language found with the search box while the map is showing
let mapView = null;  // the map's zoom, kept while the map page redraws (switching areas and dots, say)
// Map view: the areas where languages are spoken, shaded by tier (Glottography), or a dot per language
let mapMode = 'areas';
const AREAS = GEO && GEO.areas;  // embedded with the basemap
// Natural Earth 50m outlines (data/borders.json), fetched the first time the map is zoomed to chosen
// countries; until they arrive the world map's own (110m) are drawn, then the map redraws in place
let BORDERS = null, bordersLoading = null;
function loadBorders() {
  bordersLoading ??= fetch('data/borders.json').then(r => r.json()).then(d => {
    BORDERS = { ...d, all: Object.values(d.countries).join('') + d.other };
    if (countrySel.size && document.getElementById('worldmap') && curRoute() === 'map') {
      const y = scrollY, open = document.querySelector('#mctrywrap details')?.open;  // a drop-down left open stays open
      mapPage(); if (open) reopenCountries('mctrywrap'); scrollTo(0, y);
    }
  }).catch(() => {});
  return bordersLoading;
}
// Share of the land drawn where the best-covered language is in each tier: paint the areas, lowest
// tier first, on a small canvas and count pixels (Equal Earth keeps areas true)
function tierLandShares(ls, tierKey, frame, keys) {
  const { width: W0, height: H0, path } = GEO.basemap, c = document.createElement('canvas');
  const S = 3, W = W0 * S, H = H0 * S;  // drawn at three times the map's size, so edges are a small share
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g || typeof Path2D === 'undefined') return null;
  g.scale(S, S);
  if (frame) g.clip(new Path2D(frame));  // a region: only the land inside its frame counts
  // Each tier in its own colour, a corner of the colour cube, so none is a blend of two others and the
  // anti-aliased edges between areas (blends) match no tier and are left out rather than miscounted
  const CORNERS = [[0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255], [255, 255, 255], [0, 0, 0]];
  const COL = { none: [255, 0, 0], ...Object.fromEntries(keys.map((k, i) => [k, CORNERS[i]])) };
  const rgb = t => `rgb(${COL[t].join(',')})`;
  g.fillStyle = rgb('none'); g.fill(new Path2D(path));
  for (const t of [...keys].reverse()) {  // least-covered first, so the best-covered language in each place is on top
    g.fillStyle = rgb(t);
    for (const l of ls) if (tierKey(l) === t && AREAS.paths[l.code]) g.fill(new Path2D(AREAS.paths[l.code]));
  }
  const key = Object.fromEntries(Object.entries(COL).map(([t, c]) => [c.join(','), t]));
  const px = g.getImageData(0, 0, W, H).data, n = Object.fromEntries(Object.keys(COL).map(k => [k, 0]));
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 255) continue;
    const t = key[`${px[i]},${px[i + 1]},${px[i + 2]}`];
    if (t) n[t]++;
  }
  const land = Object.values(n).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v / land]));
}
function mapSection() {
  if (!GEO) return '';
  const provider = 'All';  // the Map tab is coloured by tier; the provider filter is for the Charts
  const { width: W, height: Hh, path } = GEO.basemap;
  const scored = new Set(ALL.map(l => l.code));  // extinct languages: neither scored dots nor background
  const pt = Object.fromEntries(GEO.points.map(p => [p[0], p]));
  const bg = GEO.points.filter(p => !scored.has(p[0]));
  // keep dots a readable size on screen whatever the map's rendered width
  const px = Math.max(300, Math.min(1000, (window.innerWidth || 1000) - 70)) / W;
  const many = LANGS.length > 500;  // thousands of dots: smaller, so neighbours stay visible
  const r0 = Math.max(1.7, 0.9 / px), rs = many ? Math.max(3, 2.2 / px) : Math.max(6.5, 4.5 / px), sw = many ? Math.max(0.6, 0.5 / px) : Math.max(1.6, 1.1 / px);
  mapR = { r0, rs, sw };
  const bgPath = bgDots(bg, r0);
  const P = provider !== 'All', pn = P ? PROV_ALL[provider] : '';
  const val = l => P ? provCoverage(l, provider).share : l.ltdi;
  const tierKey = l => P ? covTier(val(l)) : tierOf(l)[0];
  const tip = l => { if (!P) return `LTDI ${l.ltdi.toFixed(3)} · ${tierOf(l)[1]} · rank ${rankLabel(l)}`;
    const c = provCoverage(l, provider); return `${esc(pn)}: ${c.n} of ${c.of} ${provWhat(provider)}`; };
  const dots = LANGS.filter(l => pt[l.code]).sort((a, b) => (a.code === mapFocus) - (b.code === mapFocus) || val(a) - val(b)).map(l => {
    const c = tierKey(l), p = pt[l.code];
    return `<a href="${LH(l.code)}"><circle class="sdot${l.code === mapFocus ? ' hit' : ''}" cx="${p[2]}" cy="${p[3]}" r="${rs.toFixed(1)}" fill="var(${TIERC[c]})" stroke="var(--surface)" stroke-width="${sw.toFixed(1)}"
      opacity="${inView(l) ? 1 : 0.25}" tabindex="0" data-tip="<b>${esc(l.name)}</b><br>${tip(l)}"/></a>`;
  }).join('');
  const keys = P ? ['vh', 'h', 'm', 'l'] : TIER_KEYS.map(([k]) => k);
  const counts = Object.fromEntries(keys.map(k => [k, 0]));
  LANGS.filter(inView).forEach(l => counts[tierKey(l)]++);
  const legendLabels = P ? { vh: '90%+ of its services', h: '60–90%', m: '30–60%', l: 'Under 30%' } : TIER_LABEL;
  const areasOn = mapMode === 'areas' && AREAS;
  const toggle = AREAS ? `<div class="chips mapmode" role="group" aria-label="Map view">
      <button class="chip" data-mode="areas" aria-pressed="${!!areasOn}">Areas</button>
      <button class="chip" data-mode="dots" aria-pressed="${!areasOn}">Languages</button></div>` : '';
  let layer = dots, legend, sub;
  const colour = P ? `the share of the ${provCoverage(LANGS[0], provider).of} ${esc(pn)} ${provWhat(provider)} tracked here that cover each language${provBench(provider) ? ' (a benchmark counts where it publishes a result)' : ''}`
    : `LTDI tier (very high 0.90 and above, high 0.75–0.90, medium 0.60–0.75; below that, by what's recorded: commercial, some commercial support; open only; data only; or none recorded)`;
  if (areasOn) {
    // a region is a place here: its frame, with every area in it at full strength (English and Spanish
    // in the Americas, though their region group is Europe)
    const frame = regionFrame();
    const inTiers = l => !tierSel.size || tierSel.has(tierOf(l)[0]) || l.code === mapFocus;
    const withArea = LANGS.filter(l => AREAS.paths[l.code] && inTiers(l));
    const order = Object.fromEntries([...keys].reverse().map((k, i) => [k, i]));  // best-covered drawn on top
    // One area the atlas draws for several LTDI languages (Serbian, Croatian, Bosnian, Montenegrin) is
    // drawn once, for the one on top, so the shared area isn't darkened by stacking
    const drawn = withArea.sort((a, b) => (a.code === mapFocus) - (b.code === mapFocus) || order[tierKey(a)] - order[tierKey(b)] || (AREAS.area[b.code] || 0) - (AREAS.area[a.code] || 0));
    const top = new Map(drawn.map(l => [AREAS.paths[l.code], l.code]));
    layer = `<g class="areas${mapFocus ? ' focusing' : ''}"${countrySel.size ? ' filter="url(#soft)"' : ''}>${drawn.filter(l => top.get(AREAS.paths[l.code]) === l.code).map(l =>
      `<path d="${AREAS.paths[l.code]}" data-code="${l.code}"${l.code === mapFocus ? ' class="hit" filter="url(#soft)"' : ''} fill="var(${TIERC[tierKey(l)]})" fill-opacity="0.5" data-tip="<b>${esc(l.name)}</b><br>${tip(l)}"/>`).join('')}</g>`;
    const sh = tierLandShares(withArea, tierKey, frame && frame.outline, keys), pct = v => v == null ? '' : ` · ${v > 0 && v < 0.01 ? '<1' : Math.round(v * 100)}%`;
    legend = `${keys.map(c => `<span><i class="dot" style="background:var(${TIERC[c]})"></i>${legendLabels[c]}${sh ? pct(sh[c]) : ''}</span>`).join('')}
      ${sh ? `<span><i class="dot" style="background:var(--land);box-shadow:inset 0 0 0 1px var(--t-none-edge)"></i>No area in the atlas${pct(sh.none)}</span>` : ''}`;
    sub = `Where each language is spoken today: the ${withArea.length.toLocaleString()} languages with an area in the atlas, shaded by ${colour}. Areas overlap; each tier’s share of ${frame ? `the land in this view of ${esc(regionNames())}` : 'the world’s land'} counts the best-covered language in each place. ${countrySel.size ? `The main languages are named; to see every language spoken in ${countrySel.size > 1 ? 'these countries' : 'this country'}, switch to Languages.` : 'Hover for names.'} Areas from Glottography’s digitisations of Asher &amp; Moseley’s <i>Atlas of the World’s Languages</i> (2007), contemporary version, and, for ${officialNames()}, where they fit the countries their speakers live in better, of Wikipedia’s list of official languages by country (2024) (both CC BY 4.0); map from Natural Earth.`;
  } else {
    legend = `${keys.map(c => `<span><i class="dot" style="background:var(${TIERC[c]})"></i>${legendLabels[c]} · ${counts[c].toLocaleString()}</span>`).join('')}
      <span><i class="dot" style="background:var(--t-none);box-shadow:inset 0 0 0 1px var(--t-none-edge)"></i>Not scored · ${bg.length.toLocaleString()}</span>`;
    sub = `Each dot represents a language, placed in its traditional home. The ${LANGS.length.toLocaleString()} languages in the Index are coloured by ${colour}${bg.length ? `, with ${bg.length.toLocaleString()} other languages, not yet scored, in white` : ''}. Hover for names; select a dot for its profile. Locations from LinguaMeta; map from Natural Earth.`;
  }
  const F = mapFocus && BY[mapFocus], fp = F && pt[F.code];
  const C = countrySel.size > 0;  // countries chosen: borders, softened areas and the main languages named
  if (C && !BORDERS) loadBorders();
  const land = C && BORDERS ? BORDERS.all : path;  // detailed coasts when zoomed to countries
  const focusBox = F ? `<div class="mapfocus" role="status"><span><b>${esc(F.name)}</b> · ${F.extinct ? 'extinct, so not on the map'
      : `LTDI ${F.ltdi.toFixed(3)} · ${tierOf(F)[1]} · rank ${rankLabel(F)}${areasOn && !AREAS.paths[F.code] ? (fp ? ' · no area in the atlas, so shown at its location' : '') : ''}${!fp && !(areasOn && AREAS.paths[F.code]) ? ' · no location recorded, so not on the map' : ''}`}</span>
      <a href="${LH(F.code)}">Open its page</a><button class="x" id="mapunfocus" aria-label="Show the whole map" title="Show the whole map">×</button></div>` : '';
  return `<section class="chart">
    <div class="maphead"><h3>The world's languages</h3>${toggle}</div>
    <div class="legend map">${legend}</div>
    ${focusBox}
    <div class="mapwrap"><div class="mapctl">
        <button id="zin" aria-label="Zoom in" title="Zoom in">+</button><button id="zout" aria-label="Zoom out" title="Zoom out">−</button><button id="zreset" class="reset" aria-label="Reset zoom" title="Reset">⟲</button>
      </div><svg id="worldmap"${F ? ' class="focusing"' : ''} viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Map of ${GEO.points.length} languages; ${LANGS.length} scored">
      ${(F || C) && areasOn ? '<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="softblur" stdDeviation="1"/></filter></defs>' : ''}
      <path d="${land}" fill="var(--land)" stroke="var(--surface)" stroke-width="0.8" vector-effect="non-scaling-stroke"/>
      ${areasOn ? layer : `<path id="bgdots" d="${bgPath}" fill="var(--t-none)" stroke="var(--t-none-edge)" stroke-width="0.4" fill-opacity="var(--t-none-op)" stroke-opacity="var(--t-none-op)"/>
      ${dots}`}
      ${C ? `<path class="borders" d="${land}"/><path class="cborders" d="${[...countrySel].map(c => (BORDERS && BORDERS.countries[c]) || (GEO.basemap.countries || {})[c]?.outline || '').join('')}"/>` : ''}
      ${C ? [...countrySel].map(c => (GEO.basemap.countries || {})[c]).filter(f => f && Math.max(f.box[2] - f.box[0], f.box[3] - f.box[1]) < W / 150)
        .map(f => `<circle class="cring" cx="${(f.box[0] + f.box[2]) / 2}" cy="${(f.box[1] + f.box[3]) / 2}" r="0"/>`).join('') : ''}
      ${C && areasOn ? `<g class="alabels">${areaLabels().map(([code, x, y]) => `<text x="${x}" y="${y}" data-code="${code}">${esc(BY[code].name)}</text>`).join('')}</g>` : ''}
      ${F && !F.extinct && areasOn && !AREAS.paths[F.code] && fp ? `<circle class="sdot hit" cx="${fp[2]}" cy="${fp[3]}" r="${rs.toFixed(1)}" fill="var(${TIERC[tierKey(F)]})" stroke="var(--surface)" stroke-width="${sw.toFixed(1)}"/>` : ''}
      ${F && !F.extinct && (fp || (areasOn && AREAS.paths[F.code])) ? '<circle id="focusring" r="0"/>' : ''}
    </svg></div>
    <p class="maphint">Drag to move · double-click or + to zoom in · Ctrl or ⌘ and scroll to zoom</p>
    <p class="sub mapsub">${sub}</p>
  </section>`;
}
function bindMap() {
  document.querySelectorAll('.mapmode [data-mode]').forEach(b => b.onclick = () => {
    mapMode = b.dataset.mode; const y = scrollY; mapPage(); scrollTo(0, y);  // same place, same zoom
  });
  const svg = document.getElementById('worldmap');
  if (!svg || !GEO || !svg.getScreenCTM) return;
  const scored = new Set(ALL.map(l => l.code));  // extinct languages: neither scored dots nor background
  const bg = GEO.points.filter(p => !scored.has(p[0]));
  const { width: W, height: H } = GEO.basemap;
  let vb = mapView ? { ...mapView } : { x: 0, y: 0, w: W, h: H }, raf = 0;
  const k = () => W / vb.w;
  const soft = document.getElementById('softblur');
  // Language names keep about 13px on screen; where two would overlap, the one listed first (more
  // speakers) stays
  const labs = [...svg.querySelectorAll('.alabels text')];
  const placeLabels = () => {
    if (!labs.length) return;
    const fs = vb.w / 80, kept = [];
    for (const t of labs) {
      t.setAttribute('font-size', fs.toFixed(3)); t.setAttribute('stroke-width', (fs * 0.28).toFixed(3));
      const x = +t.getAttribute('x'), y = +t.getAttribute('y'), w = t.textContent.length * fs * 0.56, h = fs * 1.1;
      const box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      const clash = kept.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      t.style.display = clash ? 'none' : '';
      if (!clash) kept.push(box);
    }
  };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    mapView = { ...vb };
    if (soft) soft.setAttribute('stdDeviation', (vb.w / 450).toFixed(3));  // about 2px on screen at any zoom
    placeLabels();
    svg.querySelectorAll('.cring').forEach(c => c.setAttribute('r', (vb.w * 0.025).toFixed(3)));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {   // keep dots the same size on screen
      const z = k();
      svg.querySelectorAll('circle.sdot').forEach(c => { c.setAttribute('r', (mapR.rs / Math.sqrt(z)).toFixed(2)); c.setAttribute('stroke-width', (mapR.sw / Math.sqrt(z)).toFixed(2)); });
      const bgEl = document.getElementById('bgdots');
      if (bgEl) { bgEl.setAttribute('d', bgDots(bg, mapR.r0 / Math.sqrt(z))); bgEl.setAttribute('stroke-width', (0.4 / z).toFixed(3)); }
    });
  };
  const clamp = () => {
    vb.w = Math.min(W, Math.max(W / 16, vb.w)); vb.h = vb.w * H / W;
    vb.x = Math.min(W - vb.w, Math.max(0, vb.x)); vb.y = Math.min(H - vb.h, Math.max(0, vb.y));
  };
  const toMap = (cx, cy) => { const pnt = svg.createSVGPoint(); pnt.x = cx; pnt.y = cy; return pnt.matrixTransform(svg.getScreenCTM().inverse()); };
  const zoomAt = (factor, mx, my) => {
    const nw = Math.min(W, Math.max(W / 16, vb.w / factor)), nh = nw * H / W;
    vb.x = mx - (mx - vb.x) * nw / vb.w; vb.y = my - (my - vb.y) * nh / vb.h; vb.w = nw; vb.h = nh;
    clamp(); apply();
  };
  const centre = () => [vb.x + vb.w / 2, vb.y + vb.h / 2];
  // A region chosen in the filter: start framed on that region's land (boxes from ltdi.geo)
  const rv = !mapView && regionFrame();
  if (mapView) apply();
  else if (rv) {
    // a region fills the view; a country gets a margin, and a small one still shows its neighbours
    // (the view is never narrower than a twelfth of the world), centred on it
    const [x0, y0, x1, y1] = rv.box, fit = Math.max(x1 - x0, (y1 - y0) * W / H);
    const w = countrySel.size ? Math.min(W, Math.max(W / 12, fit * 1.3)) : fit * 1.04;
    vb = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * H / W / 2, w, h: w * H / W };
    clamp(); apply();
  }
  // A language found with the search box: zoom to its area. The area fills about two-fifths of the
  // view, but the view never narrows below an eighth of the world, so a small area still shows enough
  // coast and borders around it to tell where it is (and a ring marks it). The dots view uses the same
  // frame, ringing the dot; a language with no area is shown a third of the world across.
  const F = mapFocus && BY[mapFocus], ring = document.getElementById('focusring');
  if (F && ring) {
    const hit = svg.querySelector('.areas path.hit'), p = GEO.points.find(q => q[0] === F.code);
    // the area's outline frames the view in either mode (in the dots view it's measured, not drawn),
    // so switching views keeps the same frame; a language with no area gets a third of the world
    let area = hit;
    if (!area && AREAS && AREAS.paths[F.code]) {
      area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      area.setAttribute('d', AREAS.paths[F.code]); area.setAttribute('visibility', 'hidden'); svg.appendChild(area);
    }
    let cx, cy, w, small = true;
    if (area) {
      const b = area.getBBox();
      if (area !== hit) area.remove();
      cx = b.x + b.width / 2; cy = b.y + b.height / 2;
      w = Math.min(W, Math.max(W / 8, Math.max(b.width, b.height * W / H) * 2.5));
      small = Math.max(b.width, b.height * W / H) < w / 12;
    } else { cx = p[2]; cy = p[3]; w = W / 3; }
    if (!hit && p) { small = true; ring.setAttribute('cx', p[2]); ring.setAttribute('cy', p[3]); }  // a dot is always ringed
    const target = { w, h: w * H / W, x: cx - w / 2, y: cy - w * H / W / 2 };
    target.x = Math.min(W - target.w, Math.max(0, target.x)); target.y = Math.min(H - target.h, Math.max(0, target.y));
    if (hit || !p) { ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); }
    ring.setAttribute('r', small ? (w * 0.03).toFixed(2) : 0);
    const from = { ...vb }, t0 = performance.now(), ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
    if (!mapFocusFresh) { target.x = vb.x; target.y = vb.y; target.w = vb.w; target.h = vb.h; }  // a redraw keeps the view
    mapFocusFresh = false;
    const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const step = now => {
      const t = ms ? Math.min(1, (now - t0) / ms) : 1, e = ease(t);
      vb = Object.fromEntries(Object.keys(target).map(k2 => [k2, from[k2] + (target[k2] - from[k2]) * e]));
      apply();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const unf = document.getElementById('mapunfocus');
  if (unf) unf.onclick = () => { mapFocus = null; const y = scrollY; mapPage(); scrollTo(0, y); };
  document.getElementById('zin').onclick = () => zoomAt(2, ...centre());
  document.getElementById('zout').onclick = () => zoomAt(0.5, ...centre());
  document.getElementById('zreset').onclick = () => { vb = { x: 0, y: 0, w: W, h: H }; apply(); };
  svg.addEventListener('dblclick', e => { e.preventDefault(); const q = toMap(e.clientX, e.clientY); zoomAt(2, q.x, q.y); });
  svg.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;   // plain scrolling scrolls the page
    e.preventDefault(); const q = toMap(e.clientX, e.clientY); zoomAt(Math.exp(-e.deltaY * 0.0025), q.x, q.y);
  }, { passive: false });
  // drag to pan, pinch to zoom
  const pts = new Map(); let last = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const q = toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoomAt(d / pinch, q.x, q.y); pinch = d; moved = true; return;
    }
    const dx = e.clientX - last[0], dy = e.clientY - last[1];
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) { moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); tipHide(); }
    const s = vb.w / svg.getBoundingClientRect().width;
    vb.x -= dx * s; vb.y -= dy * s; last = [e.clientX, e.clientY]; clamp(); apply();
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  // an area opens its language (areas are plain paths, not links, so dragging doesn't leave a focus box)
  svg.addEventListener('click', e => { const a = e.target.closest('.areas path[data-code]'); if (a) go('lang-' + a.dataset.code); });
  // hover names for the unscored languages
  svg.addEventListener('mousemove', e => {
    if (svg.classList.contains('dragging') || e.target.closest('[data-tip]') || mapMode === 'areas') return;  // those have their own tips
    const q = toMap(e.clientX, e.clientY), lim = (6 / k()) ** 2;
    let best = null, bd = lim;
    for (const p of bg) { const d = (p[2] - q.x) ** 2 + (p[3] - q.y) ** 2; if (d < bd) { bd = d; best = p; } }
    if (best) tipShow(e, `<b>${esc(best[1])}</b><br>${best[4] ? people(best[4]) + ' speakers · ' : ''}not yet scored`); else tipHide();
  });
  svg.addEventListener('mouseleave', tipHide);
}

// The languages whose area is where they're official (Wikipedia, via Glottography) rather than the atlas's
const OFFICIAL_AREA = new Set((AREAS && AREAS.official) || []);
function officialNames() {
  const ns = [...OFFICIAL_AREA].filter(c => BY[c]).map(c => BY[c].name).sort();
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns[0] || '';
}
// A small map on a language's page: its area in the atlas, or its dot where it has none, framed as the
// Map tab frames a language found with the search box. Selecting it opens the language on the Map tab.
const MINI_ASPECT = 0.62;
function miniMap(l) {
  if (!GEO || l.extinct) return '';
  const area = AREAS && AREAS.paths[l.code], p = GEO.points.find(q => q[0] === l.code);
  if (!area && !p) return '';
  const col = `var(${TIERC[tierOf(l)[0]]})`, land = GEO.basemap.path;
  const src = area ? (OFFICIAL_AREA.has(l.code) ? 'Countries where it’s an official language (Wikipedia, via Glottography)' : 'Where it’s spoken (Asher & Moseley’s atlas, via Glottography)') : 'Its location (LinguaMeta)';
  return `<a class="minimap" id="minimap" href="#map" title="${esc(src)}. Select to open on the map" aria-label="${esc(l.name)} on the map">
    <svg viewBox="0 0 ${GEO.basemap.width} ${GEO.basemap.width * MINI_ASPECT}" aria-hidden="true">
      <defs><filter id="msoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="msoftblur" stdDeviation="1"/></filter></defs>
      <path class="land" d="${land}"/>
      ${area ? `<path class="marea" d="${area}" fill="${col}" filter="url(#msoft)"/>` : ''}
      <path class="mborders" d="${land}"/>
      ${area ? '' : `<circle class="mdot" cx="${p[2]}" cy="${p[3]}" r="0" fill="${col}"/>`}
      <circle class="mring" r="0"/>
    </svg></a>`;
}
// The small map grows to fill the height beside the language's facts (between MINI_MIN and MINI_MAX wide);
// once the header has wrapped (phones), it keeps its smallest size
const MINI_MIN = 240, MINI_MAX = 420;
function sizeMiniMap() {
  const a = document.getElementById('minimap'), head = a && a.closest('.lhead');
  if (!a) return;
  const main = head.querySelector('.lmain'), score = head.querySelector('.lscore');
  for (let i = 0; i < 3; i++) {  // its width changes the facts' wrapping, and so their height: settle
    if (score.offsetTop > main.offsetTop + 4) { a.style.width = ''; return; }  // wrapped below the facts
    const room = main.offsetHeight - (score.offsetHeight - a.offsetHeight);
    const w = Math.round(Math.min(MINI_MAX, Math.max(MINI_MIN, room / MINI_ASPECT)));
    if (Math.abs(w - a.offsetWidth) < 4) return;
    a.style.width = w + 'px';
  }
}
addEventListener('resize', () => { cancelAnimationFrame(sizeMiniMap.raf); sizeMiniMap.raf = requestAnimationFrame(sizeMiniMap); });
function bindMiniMap(l) {
  const a = document.getElementById('minimap'), svg = a && a.querySelector('svg');
  if (!svg) return;
  sizeMiniMap();
  const { width: W, height: H } = GEO.basemap, area = svg.querySelector('.marea'), dot = svg.querySelector('.mdot');
  let cx, cy, w, small = true;
  if (area) {
    const b = area.getBBox(), size = Math.max(b.width, b.height / MINI_ASPECT);
    cx = b.x + b.width / 2; cy = b.y + b.height / 2;
    w = Math.min(W, Math.max(W / 8, size * 2.5)); small = size < w / 12;
  } else { cx = +dot.getAttribute('cx'); cy = +dot.getAttribute('cy'); w = W / 7; }
  const h = w * MINI_ASPECT;
  const x = w < W ? Math.min(W - w, Math.max(0, cx - w / 2)) : 0, y = h < H ? Math.min(H - h, Math.max(0, cy - h / 2)) : (H - h) / 2;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  document.getElementById('msoftblur').setAttribute('stdDeviation', (w / 250).toFixed(3));
  if (dot) dot.setAttribute('r', (w * 0.014).toFixed(3));
  const ring = svg.querySelector('.mring');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', small ? (w * 0.06).toFixed(3) : 0);
  // zoomed in: the detailed coasts and borders (fetched once, as for countries on the Map tab)
  if (w < W / 3) loadBorders().then(() => {
    if (BORDERS && svg.isConnected) svg.querySelectorAll('.land, .mborders').forEach(e => e.setAttribute('d', BORDERS.all));
  });
  a.onclick = e => { e.preventDefault(); mapFocus = l.code; mapFocusFresh = true; go('map'); };
}

// Keep a bar of filters at the top of the window once it scrolls up there. Done in script rather than
// with position: sticky, which stops working when the page is hosted inside a frame or a container
// that clips overflow; a scroll listener on the document hears whichever element is scrolling.
function pinBar(bar) {
  if (!bar) return;
  const spot = document.createElement('div'); bar.before(spot);
  const update = () => {
    if (!bar.isConnected) { document.removeEventListener('scroll', update, true); removeEventListener('resize', update); return; }
    const r = spot.getBoundingClientRect(), pin = r.top < 0;
    if (pin !== bar.classList.contains('stuck')) {
      bar.classList.toggle('stuck', pin);
      spot.style.height = pin ? bar.offsetHeight + 'px' : '';
    }
    if (pin) { bar.style.left = r.left + 'px'; bar.style.width = r.width + 'px'; } else { bar.style.left = bar.style.width = ''; }
  };
  document.addEventListener('scroll', update, true);
  addEventListener('resize', update);
  update();
}

function charts() {
  const langs = LANGS.filter(inView), N = langs.length;
  const techs = Object.entries(CFG.tech.technologies);
  // tooltips name languages by speakers, up to 12, so they stay readable with thousands of languages
  const names = ls => {  // the 12 most spoken, picked in one pass rather than sorting the whole list
    let top = ls;
    if (ls.length > 12) { top = []; for (const l of ls) { const s = l.speakers || 0;
      if (top.length < 12 || s > (top[11].speakers || 0)) { let k = top.length; while (k && (top[k - 1].speakers || 0) < s) k--; top.splice(k, 0, l); if (top.length > 12) top.pop(); } } }
    return (top.map(l => esc(l.name)).join(', ') || '—') + (ls.length > 12 ? ` and ${(ls.length - 12).toLocaleString()} more` : ''); };

  // 1. Coverage now (for one provider: its own services only)
  const P = provider !== 'All', pn = P ? PROV_ALL[provider] : '';
  const LV = P ? PLEVELS : LEVELS;
  const shown = P ? techs.map(([k, t]) => [k, t, provIds(t, provider)]).filter(([, , ids]) => ids.length) : techs.map(([k, t]) => [k, t, null]);
  const absent = P ? techs.filter(([, t]) => !provIds(t, provider).length).map(([, t]) => t.label) : [];
  const rows = shown.map(([k, t, ids]) => {
    const lvl = l => P ? provLevel(l, ids) : levelOf(l, k, t);
    const by = Object.fromEntries(LV.map(([lv]) => [lv, langs.filter(l => lvl(l) === lv)]));
    const label = P ? `${t.label} (${ids.map(id => SVC[id][0]).join(', ')})` : t.label;
    const bench = P && ids.every(id => CFG.tech.technologies[k].measured && id in CFG.tech.technologies[k].measured);
    const segs = LV.filter(([lv]) => by[lv].length).map(([lv, lab0]) => {
      const n = by[lv].length, lab = bench ? { full: 'Benchmark result published', part: 'Some benchmark results', none: 'No published result' }[lv] : lab0;
      return `<div class="seg ${lv}" tabindex="0" style="flex:${n}" data-tip="<b>${esc(label)}: ${esc(lab)}</b><br>${n} of ${N}: ${names(by[lv])}">${n / N >= 0.08 ? n : ''}</div>`;
    }).join('');
    return { k, t, by, html: `<div class="lab" title="${esc(t.label)}">${esc(t.short || t.label)}${P ? `<small>${esc(ids.map(id => SVC[id][0]).join(', '))}</small>` : ''}</div><div class="stack" role="img" aria-label="${esc(label)}: ${LV.map(([lv, lab]) => `${by[lv].length} ${lab.toLowerCase()}`).join(', ')}">${segs}</div>` };
  });
  // 1b. The same split weighted by speakers: how many people each technology reaches
  const spk = ls => ls.reduce((n, l) => n + (vSpk(l) || 0), 0), SP = spk(langs) || 1;
  const pctS = v => { const p = v / SP * 100; return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%'; };
  const rowsS = rows.map(r => {
    const segs = LV.filter(([lv]) => spk(r.by[lv])).map(([lv, lab]) => {
      const n = spk(r.by[lv]);
      return `<div class="seg ${lv}" tabindex="0" style="flex:${n}" data-tip="<b>${esc(r.t.label)}: ${esc(lab)}</b><br>${people(n)} speakers (${pctS(n)}) in ${r.by[lv].length.toLocaleString()} ${r.by[lv].length === 1 ? 'language' : 'languages'}: ${names(r.by[lv])}">${n / SP >= 0.08 ? people(n) : ''}</div>`;
    }).join('');
    return `<div class="lab" title="${esc(r.t.label)}">${esc(r.t.short || r.t.label)}</div><div class="stack" role="img" aria-label="${esc(r.t.label)}: ${LV.map(([lv, lab]) => `${people(spk(r.by[lv]))} speakers ${lab.toLowerCase()}`).join(', ')}">${segs}</div>`;
  }).join('');
  const tableS = `<div class="tablebox"><table><thead><tr><th>Technology</th>${LV.map(([, lab]) => `<th class="num">${esc(lab)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.t.label)}</td>${LV.map(([lv]) => `<td class="num">${people(spk(r.by[lv]))} <span class="pct">(${pctS(spk(r.by[lv]))})</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const table1 = `<div class="tablebox"><table><thead><tr><th>Technology</th>${LV.map(([, lab]) => `<th class="num">${esc(lab)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.t.label)}</td>${LV.map(([lv]) => `<td class="num" title="${names(r.by[lv])}">${r.by[lv].length}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  // 2. Over time: small multiples
  const H = HIST;
  // one string per series and language: '1', '0' or '.' (no data) for each period
  const hv = (key, code, i) => { const c = ((H.values[key] || {})[code] || '')[i]; return c === '1' ? 1 : c === '0' ? 0 : null; };
  let multiples = '<p class="note">No history collected yet.</p>', added = '';
  if (H) {
    const spkMode = histMode === 'speakers';
    const P = H.periods, W = 300, Ht = 150, L = spkMode ? 38 : 30, R = spkMode ? 44 : 34, T = 12, B = 26;
    const axisN = v => !v ? '0' : v >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${v}`;
    const series = Object.entries(H.series).filter(([key]) => provider === 'All' || SERIES_PROV[key] === provider);  // P is the periods here
    const wt = histMode === 'speakers' ? (l => vSpk(l) || 0) : (() => 1), fmtH = histMode === 'speakers' ? people : (v => v.toLocaleString());
    // each language's history string per series, read once: '1' supported, '0' not, '.' no record
    const HS = Object.fromEntries(series.map(([key]) => { const vs = H.values[key] || {}; return [key, langs.map(l => vs[l.code] || '')]; }));
    const VALS = Object.fromEntries(series.map(([key]) => {
      const tot = P.map(() => 0), seen = P.map(() => false);
      HS[key].forEach((str, j) => { for (let i = 0; i < str.length; i++) { const c = str[i]; if (c === '1') { tot[i] += wt(langs[j]); seen[i] = true; } else if (c === '0') seen[i] = true; } });
      return [key, tot.map((v, i) => seen[i] ? v : null)];
    }));
    // the languages each series gained at each period, against its previous recorded period
    const GAINED = Object.fromEntries(series.map(([key]) => {
      const avail = P.map((p, i) => i).filter(i => VALS[key][i] != null), out = {};
      avail.slice(1).forEach((i, k) => { const prev = avail[k]; out[i] = HS[key].flatMap((str, j) => str[i] === '1' && str[prev] !== '1' ? [langs[j]] : []); });
      return [key, out];
    }));
    // one scale for all panels, up to a round number just above the largest count, so they compare
    const top = Math.max(1, ...Object.values(VALS).flat().filter(v => v != null));
    const mag = 10 ** Math.floor(Math.log10(top)), YMAX0 = [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= top), YMAX = histMode === 'speakers' ? YMAX0 : Math.min(N, YMAX0);
    const x = i => L + i * (W - L - R) / (P.length - 1), y = v => T + (Ht - T - B) * (1 - v / Math.max(YMAX, 1));
    const yearTicks = P.map((p, i) => [p, i]).filter(([p]) => p.endsWith('-12') && ['2019', '2022', '2025'].includes(p.slice(0, 4)));
    multiples = series.map(([key, label]) => {
      const vals = VALS[key];
      const pts = vals.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
      if (!pts.length) return '';
      const step = pts.map(([px, py], j) => j ? `H${px.toFixed(1)}V${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`).join('');
      const area = `${step}V${y(0)}H${pts[0][0].toFixed(1)}Z`;
      const last = pts[pts.length - 1];
      const hits = pts.map(([px, , v, i], j) => {
        const prev = j ? vals[pts[j - 1][3]] : null;
        const gained = j ? GAINED[key][i] || [] : [];
        const when = (P[i].endsWith('-06') ? 'Mid ' : 'End ') + P[i].slice(0, 4);
        const tip = `<b>${when}</b><br>${histMode === 'speakers' ? `${people(v)} speakers` : `${v} of ${N} languages`}${gained.length ? `<br>New: ${names(gained)}` : ''}`;
        const w = (W - L - R) / (P.length - 1);
        return `<rect x="${(px - w / 2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${Ht - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
      }).join('');
      return `<div class="panel"><h4>${esc(label)}</h4><div class="now">${histMode === 'speakers' ? `${people(last[2])} speakers now` : `${last[2]} of ${N.toLocaleString()} languages now`}</div>
        <svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${esc(label)}: ${pts.map(([, , v, i]) => `${P[i]} ${v}`).join(', ')}">
          <g class="grid">${[0, YMAX / 2, YMAX].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${spkMode ? axisN(v) : v}</text>`).join('')}</g>
          <g class="axis">${yearTicks.map(([p, i]) => `<text x="${x(i)}" y="${Ht - 8}" text-anchor="middle">${p.slice(0, 4)}</text>`).join('')}</g>
          <path d="${area}" fill="var(--accent)" fill-opacity="0.12"/>
          <path d="${step}" fill="none" stroke="var(--accent)" stroke-width="2"/>
          <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
          <text x="${last[0] + 8}" y="${last[1] + 4}" fill="var(--ink)" font-size="12" font-weight="600">${spkMode ? axisN(last[2]) : last[2]}</text>
          ${hits}
        </svg></div>`;
    }).join('');
    // When languages were added: one row of bars per source, a bar for each half-year's additions
    const gains = series.map(([key, label]) => {
      const avail = P.map((p, i) => i).filter(i => VALS[key][i] != null);
      return [key, label, avail.slice(1).map(i => { const g = GAINED[key][i] || [];
        return [i, g, g.reduce((n, l) => n + wt(l), 0)]; })];
    }).filter(([, , gs]) => gs.some(g => g[1].length));  // sources that launched in one release add nothing later
    const gTop = Math.max(1, ...gains.flatMap(([, , gs]) => gs.map(g => g[2])));
    const AW = 720, AH = 64, AL = 8, AR = 8, AT = 16, AB = 4, bw = (AW - AL - AR) / P.length;
    const ax = i => AL + i * bw;
    added = gains.length ? `<div class="added">${gains.map(([key, label, gs]) => `<div class="added-row"><div class="added-lab">${esc(label)}</div>
      <svg viewBox="0 0 ${AW} ${AH}" role="img" aria-label="${esc(label)}: ${gs.filter(g => g[1].length).map(([i, g]) => `${P[i]} ${g.length}`).join(', ') || 'no additions'}">
        <line x1="${AL}" x2="${AW - AR}" y1="${AH - AB}" y2="${AH - AB}" stroke="var(--rule)"/>
        ${gs.map(([i, g, v]) => { const h = v ? Math.max(2, (AH - AT - AB) * v / gTop) : 0, when = (P[i].endsWith('-06') ? 'First half of ' : 'Second half of ') + P[i].slice(0, 4);
          return `${h ? `<rect x="${(ax(i) + 2).toFixed(1)}" y="${(AH - AB - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--accent)"/>` : ''}${g.length && v / gTop > 0.06 ? `<text x="${(ax(i) + bw / 2).toFixed(1)}" y="${(AH - AB - h - 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink)">${histMode === 'speakers' ? people(v) : g.length}</text>` : ''}
            <rect x="${ax(i).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${AH}" fill="transparent" data-tip="${esc(`<b>${when}</b><br>${g.length ? `${g.length} ${g.length === 1 ? 'language' : 'languages'} added${histMode === 'speakers' ? ` (${people(v)} speakers)` : ''}: ${names(g)}` : 'None added'}`)}"/>`; }).join('')}
      </svg></div>`).join('')}
      <div class="added-row"><div></div><svg viewBox="0 0 ${AW} 16" aria-hidden="true">${P.map((p, i) => p.endsWith('-12') ? `<text x="${(ax(i)).toFixed(1)}" y="12" text-anchor="middle" font-size="11" fill="var(--muted)">${p.slice(0, 4)}</text>` : '').join('')}</svg></div></div>` : '';
    multiples = series.length ? `<div class="multiples">${multiples}</div>`
      : `<p class="note">No history collected yet for ${esc(pn)}'s services. History so far comes from DeepL's docs, Meta's NLLB-200 and Belebele, OpenAI's Whisper, Common Voice and CLDR.</p>`;
  }
  const table2 = H ? `<div class="tablebox"><table><thead><tr><th>Kind of support</th>${H.periods.filter(p => p.endsWith('-12')).map(p => `<th class="num">${p.slice(0, 4)}</th>`).join('')}</tr></thead>
    <tbody>${Object.entries(H.series).filter(([k]) => provider === 'All' || SERIES_PROV[k] === provider).map(([k, lab]) => `<tr><td>${esc(lab)}</td>${H.periods.map((p, pi) => [p, pi]).filter(([p]) => p.endsWith('-12')).map(([, pi]) => { const col = H.values[k] || {}; let n = 0, any = false;
      for (const l of langs) { const c = (col[l.code] || '')[pi]; if (c === '1') { n++; any = true; } else if (c === '0') any = true; }
      return `<td class="num">${any ? n : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '';

  // 3. LTDI by region: dot strip
  const regs = REGIONS.filter(r => !regionSel.size || regionSel.has(r));
  const sval = l => P ? provCoverage(l, provider).share : l.ltdi;
  const SW = Math.max(340, Math.min(720, (window.innerWidth || 720) - 70)), lab = SW < 500 ? 92 : 120, top = 26, rowH = 58, x1 = 1.0;
  const x0 = P || LANGS.some(l => l.ltdi < 0.3) ? 0 : 0.3;  // start at 0 once any language scores that low
  const sx = v => lab + (Math.max(x0, v) - x0) / (x1 - x0) * (SW - lab - 30);
  const SH = top + regs.length * rowH + 24;
  // Each row's dots are a few shapes (crowded rows split in eight, so overlaps still darken where
  // languages cluster), and the dot under the pointer is found from STRIP (not one link per
  // dot, which would be thousands of elements, slow on phones and thousands of keyboard stops)
  STRIP = [];
  const stripRows = [];
  const tipOf = l => `<b>${esc(l.name)}</b><br>${P ? `${esc(pn)}: ${provCoverage(l, provider).n} of ${provCoverage(l, provider).of} ${provWhat(provider)}` : `LTDI ${l.ltdi.toFixed(3)} · rank ${rankLabel(l)}`}`;
  const strip = `<svg id="strip" viewBox="0 0 ${SW} ${SH}" role="img" aria-label="${esc(P ? `Share of ${pn}'s services covering each language, by region` : 'LTDI of each language, by region')}: one dot per language; the table below lists each region's figures" style="width:100%;height:auto">
    <g class="grid">${(P ? [0, 0.25, 0.5, 0.75, 1.0] : x0 ? [0.4, 0.6, 0.8, 1.0] : [0, 0.2, 0.4, 0.6, 0.8, 1.0]).map(v => `<line x1="${sx(v)}" x2="${sx(v)}" y1="${top - 6}" y2="${SH - 22}"/><text x="${sx(v)}" y="${SH - 6}" text-anchor="middle">${P ? Math.round(v * 100) + '%' : v.toFixed(1)}</text>`).join('')}</g>
    ${regs.map((r, i) => {
      const ls = LANGS.filter(l => stripMode === 'home' ? l.region === r : l._rg.has(r)).sort((a, b) => sval(a) - sval(b)), cy = top + i * rowH + rowH / 2;
      if (!ls.length) return `<text x="0" y="${cy + 4}" fill="var(--ink)" font-size="13" font-weight="600">${esc(r)}</text>`;
      const lo = ls[0], hi = ls[ls.length - 1];
      // where several share the lowest (or highest) value, say how many rather than name one of them
      const nLo = ls.filter(l => sval(l) === sval(lo)).length, nHi = ls.filter(l => sval(l) === sval(hi)).length;
      const loName = nLo > 1 ? `${nLo.toLocaleString()} tied lowest` : lo.name, hiName = nHi > 1 ? `${nHi.toLocaleString()} tied highest` : hi.name;
      // nudge dots that would overlap above and below the row line
      // crowded rows (many languages) get small, translucent dots spread vertically instead
      const crowd = ls.length > 60;
      let prevX = -99, flip = 1;
      const dots = ls.map((l, k) => { const x = sx(sval(l)); let dy = 0;
        if (crowd) dy = ((k * 7919) % 17 - 8) * 1.2;
        else if (x - prevX < 13) { dy = 6 * flip; flip = -flip; } else flip = 1;
        prevX = x; return { l, x, y: cy + dy }; });
      const rad = crowd ? 3 : 6.5;
      dots.forEach(d => STRIP.push({ x: d.x, y: d.y, r: rad, l: d.l, tip: () => tipOf(d.l) }));
      // the mean, and the mean weighted by speakers: the score of the average speaker's language
      const mean = ls.reduce((n, l) => n + sval(l), 0) / ls.length, spk = ls.reduce((n, l) => n + (l.speakers || 0), 0);
      const wmean = spk ? ls.reduce((n, l) => n + (l.speakers || 0) * sval(l), 0) / spk : null;
      stripRows.push([r, ls.length, mean, wmean, hiName, loName]);
      return `<text x="0" y="${cy + 4}" fill="var(--ink)" font-size="13" font-weight="600">${esc(r)}</text>
        ${[...Array(crowd ? 8 : 1).keys()].map(g => `<path d="${dots.filter((d, k) => !crowd || k % 8 === g).map(d => `M${(d.x - rad).toFixed(1)},${d.y}a${rad},${rad} 0 1,0 ${2 * rad},0a${rad},${rad} 0 1,0 ${-2 * rad},0`).join('')}" fill="var(--accent)" fill-opacity="${crowd ? 0.45 : 0.85}" stroke="var(--surface)" stroke-width="${crowd ? 0 : 2}"/>`).join('')}
        <text x="${sx(sval(lo))}" y="${cy + 24}" text-anchor="middle" fill="var(--muted)" font-size="11">${esc(loName)}</text>
        ${ls.length > 1 ? `<text x="${Math.min(sx(sval(hi)), SW - 4)}" y="${cy - 14}" text-anchor="${sx(sval(hi)) > SW - 40 ? 'end' : 'middle'}" fill="var(--muted)" font-size="11">${esc(hiName)}</text>` : ''}`;
    }).join('')}
    <circle id="strip-hit" r="7" fill="none" stroke="var(--ink)" stroke-width="2" visibility="hidden" pointer-events="none"/>
  </svg>`;
  const fmtS = v => v == null ? '—' : P ? Math.round(v * 100) + '%' : v.toFixed(3);
  const stripTable = `<div class="tablebox"><table><thead><tr><th>Region</th><th class="num">Languages</th><th class="num">Mean ${P ? 'share' : 'LTDI'}</th><th class="num" title="Each language counted by its speakers: the score of the average speaker's language">Mean, by speakers</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>${stripRows.map(([r, n, mean, wmean, hi, lo]) =>
    `<tr><td>${esc(r)}</td><td class="num">${n.toLocaleString()}</td><td class="num">${fmtS(mean)}</td><td class="num">${fmtS(wmean)}</td><td>${esc(hi)}</td><td>${esc(lo)}</td></tr>`).join('')}</tbody></table>
    <p class="note">Mean by speakers counts each language by its speakers, so it's the score of the average speaker's language; with all languages spoken in a region, the large international languages lift it.</p></div>`;

  $('#view').innerHTML = `<h2 class="sronly">Charts</h2>
    <div class="controls sticky"><span id="cregwrap">${regionPicker()}</span><span id="cctrywrap">${countryPicker()}</span><span id="ctierwrap">${tierPicker()}</span>${providerSelect('cpsel')}<span class="note" style="margin:0">${N.toLocaleString()} languages${P ? ` · ${esc(pn)}'s services only` : ''}</span>
      <button type="button" class="reset" id="cresetf"${!regionSel.size && !countrySel.size && !tierSel.size && !P ? ' hidden' : ''}>Reset filters</button></div>
    <section class="chart">
      <h3>How many languages each technology reaches today</h3>
      <p class="sub">${P ? `Each bar splits the ${N.toLocaleString()} languages by whether ${esc(pn)}'s services checked here offer them. Technologies are shown where ${esc(pn)} has at least one service we track.` : 'Each bar splits the ' + N.toLocaleString() + ' languages by how widely a technology is available in them. Widely available means offered by at least half of the services checked; for LLMs the services are the official language lists of AI assistant apps, and language identification counts open models. Text technologies count spoken varieties through the standard language their speakers write. The last two segments together are the speakers with no commercial service on the Ranking page.'} Hover a segment to see which languages.</p>
      <div class="legend ord">${LV.map(([lv, lab]) => `<span><i class="sw" style="background:var(--ord-${lv})"></i>${esc(lab)}</span>`).join('')}</div>
      <div class="covrows">${rows.map(r => r.html).join('')}</div>
      ${absent.length ? `<p class="note">No ${esc(pn)} service tracked for: ${esc(absent.join(', '))}.</p>` : ''}

      <details class="tbl"><summary>Show as a table</summary>${table1}</details>
    </section>
    <section class="chart">
      <h3>How many speakers each technology reaches today</h3>
      <p class="sub">The same split, with each language counted by its speakers: ${people(SP)} in all, added up per language, so people who speak several languages are counted in each.</p>
      <div class="legend ord">${LV.map(([lv, lab]) => `<span><i class="sw" style="background:var(--ord-${lv})"></i>${esc(lab)}</span>`).join('')}</div>
      <div class="covrows">${rowsS}</div>
      <details class="tbl"><summary>Show as a table</summary>${tableS}</details>
    </section>
    ${P && !Object.keys(H ? H.series : {}).some(k => SERIES_PROV[k] === provider) ? '' : `<section class="chart">
      <div class="plan-tablehead"><h3>How support has grown since 2019</h3><span class="chips" role="group" aria-label="Count">${[['langs', 'Languages'], ['speakers', 'Speakers']].map(([k, lab]) => `<button type="button" class="chip" data-hm="${k}" aria-pressed="${histMode === k}">${lab}</button>`).join('')}</span></div>
      <p class="sub">How many of these languages have each kind of support, or how many people speak them (added up per language), at mid-year and year-end. Lines start when the source's history does. Hover for the languages added.</p>
      ${multiples}
      <p class="note">Common Voice, CLDR, DeepL and Universal Dependencies from each project's release history. Open models and benchmarks are counted from their release dates using today's language lists.</p>
      <details class="tbl"><summary>Show as a table</summary>${table2}</details>
    </section>
    ${added ? `<section class="chart">
      <h3>When languages were added</h3>
      <p class="sub">The languages each source added in each half-year, or their speakers, on one scale, so the big expansions stand out, like Common Voice's September 2025 release and DeepL's additions that October. Hover a bar for the languages.</p>
      ${added}
      <p class="note">Counted from each source's own release records. A language counts in the half-year it first appears; one that dropped out and came back counts again when it returns. To follow additions as they happen, add <span class="code">https://langtechindex.org/changes.xml</span> to a feed reader.</p>
    </section>` : ''}`}
    <section class="chart">
      <div class="plan-tablehead"><h3>Where each language stands</h3><span class="chips" role="group" aria-label="Which languages">${[['all', 'All languages spoken there'], ['home', 'Languages from the region']].map(([k, lab]) => `<button type="button" class="chip" data-sm="${k}" aria-pressed="${stripMode === k}">${lab}</button>`).join('')}</span></div>
      <p class="sub">${P ? `Share of ${esc(pn)}'s ${provWhat(provider)} tracked here that cover each language, by region.` : 'Language Technology Development Index by region.'} Each dot is a language, with the lowest named below its row and the highest above; select one to open its profile. <b>All languages spoken there</b> puts a language in every region where it's spoken, so English, French and Spanish appear in several; <b>Languages from the region</b> puts each in its home region only (the region of the country it's from, or where most of its speakers live).</p>
      ${strip}
      <details class="tbl"><summary>Show as a table</summary>${stripTable}</details>
    </section>
    ${censusCaveat()}`;
  bindTips($('#view'));
  bindStrip();
  // keep the page where it is when a filter redraws the charts below
  const keep = f => e => { const y = scrollY; f(e.target.value); charts(); scrollTo(0, y); };
  wireMsel('cregwrap', regionPicker, regionSel, REGIONS.length, () => { const y = scrollY; charts(); reopen('cregwrap'); scrollTo(0, y); });
  wireCountries('cctrywrap', () => { const y = scrollY; charts(); reopenCountries('cctrywrap'); scrollTo(0, y); });
  wireMsel('ctierwrap', tierPicker, tierSel, TIER_KEYS.length, () => { const y = scrollY; charts(); reopen('ctierwrap'); scrollTo(0, y); });
  $('#cpsel').onchange = keep(v => { provider = v; });
  $('#view').querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { const y = scrollY; stripMode = b.dataset.sm; charts(); scrollTo(0, y); });
  $('#view').querySelectorAll('[data-hm]').forEach(b => b.onclick = () => { const y = scrollY; histMode = b.dataset.hm; charts(); scrollTo(0, y); });
  $('#cresetf').onclick = () => { const y = scrollY; regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); provider = 'All'; charts(); scrollTo(0, y); };
  pinBar($('.controls.sticky'));
}

// ---------------------------------------------------------------- map
// The map has the region, country and tier filters; the search box finds a language on it
function mapPage() {
  const N = LANGS.filter(inView).length;
  $('#view').innerHTML = `<h2 class="sronly">Map</h2>
    <div class="controls sticky"><span id="mregwrap">${regionPicker()}</span><span id="mctrywrap">${countryPicker()}</span><span id="mtierwrap">${tierPicker()}</span><span class="note" style="margin:0">${N.toLocaleString()} languages</span>
      <button type="button" class="reset" id="mresetf"${!regionSel.size && !countrySel.size && !tierSel.size ? ' hidden' : ''}>Reset filters</button></div>
    ${mapSection()}
    ${censusCaveat()}`;
  bindTips($('#view'));
  bindMap();
  wireMsel('mregwrap', regionPicker, regionSel, REGIONS.length, () => { const y = scrollY; mapView = null; mapPage(); reopen('mregwrap'); scrollTo(0, y); });
  wireCountries('mctrywrap', () => { const y = scrollY; mapView = null; mapPage(); reopenCountries('mctrywrap'); scrollTo(0, y); });
  wireMsel('mtierwrap', tierPicker, tierSel, TIER_KEYS.length, () => { const y = scrollY; mapPage(); reopen('mtierwrap'); scrollTo(0, y); });
  $('#mresetf').onclick = () => { const y = scrollY; regionSel.clear(); countrySel.clear(); countryQuery = ''; tierSel.clear(); mapView = null; mapPage(); scrollTo(0, y); };
  navBox('map', 'Find a language name or code');
  pinBar($('.controls.sticky'));
}

// ---------------------------------------------------------------- about
// What's tracked, the rule for including a service, and what's known to be missing
function inclusionSection() {
  const S = DATA.services;
  const by = role => S.filter(s => s.role === role);
  const companies = new Set(by('consumer').map(s => s.provider));
  const regional = new Set(by('regional').map(s => s.provider));
  return `<h3>What's included and why</h3>
    <p>The Index tracks ${by('consumer').length} commercial services from ${companies.size} companies (${[...companies].map(p => esc(PROV_ALL[p] || p)).join(', ')}), ${regional.size} regional providers that focus on languages the large platforms serve less (${[...regional].map(p => esc(PROV_ALL[p] || p)).join(', ')}), ${by('open').length} open models and tools, and ${by('measured').length} published LLM benchmark results. Every service, with what it counts for, is in <a href="${REPO_URL}/blob/main/config/services.csv" target="_blank" rel="noopener">config/services.csv</a>.</p>
    <p>A service is included when it's a product or open tool people and developers use across many languages, and its maker publishes an official list of the languages it supports (or, for a benchmark, results per language) that can be read, cited and re-checked. Lists are read from those official pages, not from testing the products, so a service that works in a language it doesn't list isn't counted for it. Regional providers are included for the languages they list, and count together as one extra service.</p>
    <p>Services known to be missing include Meta AI, Apple Intelligence, Samsung's keyboard and Bixby, and speech specialists such as ElevenLabs. They'll be added where an official language list can be read reliably; to propose one, send a link to its official language list (see below).</p>`;
}
// How much ranks depend on the method's working choices (ltdi.sensitivity)
function stabilitySection() {
  const S = DATA.sensitivity;
  if (!S) return '';
  return `<h3>How stable the ranks are</h3>
    <p>The weights, goalposts and floor are working choices. To see how much the ranking depends on them, every language was re-scored ${S.draws.toLocaleString()} times with different choices drawn at random: each weight from half to one and a half times its value, each data goal up to ten times higher or lower, and the floor from 0.025 to 0.075. A language's page shows the range of ranks it takes in 90% of these re-scorings.</p>
    <div class="tablebox"><table class="covtab"><thead><tr><th>Ranks</th><th class="num">Languages</th><th class="num">Typical range</th><th class="num">Within ±10% of rank</th></tr></thead>
    <tbody>${S.bands.map(b => `<tr><td>${esc(b.ranks)}</td><td class="num">${b.languages.toLocaleString()}</td><td class="num">${b.median_range.toLocaleString()} places</td><td class="num">${Math.round(b.within_10pct * 100)}%</td></tr>`).join('')}</tbody></table></div>
    <p class="note">The ${S.nothing_recorded.toLocaleString()} languages with nothing recorded always rank last together. The top of the ranking barely moves; from about rank 200 down, where scores are close together, ranks shift by hundreds of places, so the tier says more than the exact rank.
    ${S.scenarios.map(s => `${esc(s.label)}: ${s.moved_10_in_top_300 ? `${s.moved_10_in_top_300} of the top 300 move more than 10 places` : 'no language in the top 300 moves more than 10 places'}.`).join(' ')}</p>`;
}
// How LTDI compares with Joshi et al.'s resource classes and SIL's Digital Language Support levels
// (tools/validate.py): a table per classification, with LTDI's median and tiers in each group, and
// the languages where the two disagree most
function validationSection() {
  const V = DATA.validation;
  if (!V) return '';
  const order = TIER_KEYS.map(([k]) => k);
  const tierBar = t => {
    const n = Object.values(t).reduce((a, b) => a + b, 0) || 1;
    return `<span class="vbar">${order.filter(k => t[k]).map(k => `<i style="width:${(t[k] / n * 100).toFixed(1)}%;background:var(${TIERC[k]})" title="${esc(TIER_LABEL[k])}: ${t[k]}"></i>`).join('')}</span>`;
  };
  const table = (v, head) => `<div class="tablebox"><table class="covtab vtab"><thead><tr><th>${head}</th><th class="num">Languages</th><th class="num">Median LTDI</th><th>LTDI tiers</th></tr></thead>
    <tbody>${v.groups.map(g => `<tr><td>${esc(g.label)}</td><td class="num">${g.n.toLocaleString()}</td><td class="num">${g.median_ltdi == null ? '–' : g.median_ltdi.toFixed(3)}</td><td>${tierBar(g.tiers)}</td></tr>`).join('')}</tbody></table></div>`;
  const dis = (v, what) => `<details class="covsvc vdis"><summary>Where they disagree most <span class="muted">· ${v.disagreements.length} languages</span></summary>
    <ul>${v.disagreements.map(x => `<li><span><a href="${LH(x.code)}">${esc(x.name)}</a> <span class="muted">${x.gap > 0 ? 'higher in LTDI' : 'lower in LTDI'}</span></span><b>${x.ltdi.toFixed(3)} · ${esc(TIER_LABEL[x.tier] || x.tier)} <span class="muted">vs ${esc(what(x.other))}</span></b></li>`).join('')}</ul></details>`;
  const J = V.joshi, D = V.dls, B = V.between;
  const pair = (a, b, r) => `<tr><td>${a}</td><td>${b}</td><td class="num">${r.toFixed(2)}</td></tr>`;
  return `<h3>How it compares with other classifications</h3>
    <p>Two earlier studies classify languages by their digital resources. LTDI broadly agrees with both: its median score never falls from one of their groups to the next. No two such measures agree exactly, since each draws on different, incomplete sources from a different year, so the useful question is whether LTDI differs from them more than they differ from each other.</p>
    ${B ? `<p>It doesn't. On the ${B.n} languages all three cover, LTDI agrees with each study more closely than the two studies agree with each other (rank correlations; 1 would be the same order):</p>
    <div class="tablebox vpair"><table class="covtab"><thead><tr><th>Measure</th><th>Compared with</th><th class="num">Correlation</th></tr></thead>
    <tbody>${pair('Joshi et al.', 'Digital Language Support', B.joshi_dls)}${pair('LTDI', 'Joshi et al.', B.ltdi_joshi)}${pair('LTDI', 'Digital Language Support', B.ltdi_dls)}</tbody></table></div>` : ''}
    <p class="note">The languages where they disagree most are listed below each table. Some differences are progress since the studies, some are imperfect data on either side.</p>
    <h4>Joshi et al. (2020), resource classes</h4>
    <p class="note"><a href="${J.source}" target="_blank" rel="noopener">The State and Fate of Linguistic Diversity and Inclusion in the NLP World</a>: six classes by labelled and unlabelled data. ${J.n.toLocaleString()} ranked languages have a class; rank correlation with LTDI ${J.spearman.toFixed(2)}.</p>
    ${table(J, 'Class')}${dis(J, o => `class ${o}`)}
    <h4>Simons, Thomas and White (2022), Digital Language Support</h4>
    <p class="note"><a href="${D.paper}" target="_blank" rel="noopener">Assessing Digital Language Support on a Global Scale</a>: five levels from 143 tools' language lists, ${esc(D.as_of)}. Only a 10% sample is public (<a href="${D.source}" target="_blank" rel="noopener">sil-ai/dls-results</a>), of which ${D.n.toLocaleString()} languages match ranked ones; rank correlation with their score ${D.spearman.toFixed(2)}, with their level ${D.spearman_level.toFixed(2)}.</p>
    ${table(D, 'Level')}${dis(D, o => o)}`;
}
// What the Index is for, how far each source reaches, and the limits of the data, sources and views
const REPO_URL = 'https://github.com/sandyfritchie/ltdi';
const citeText = () => `Ritchie, Sandy (${DATA.edition.slice(0, 4)}). Language Technology Development Index (LTDI), edition ${DATA.edition} (methodology ${DATA.config.meta.methodology_version}). https://langtechindex.org`;
function about() {
  const C = DATA.coverage || { n: LANGS.length, meta: [], data: [], tech: [] }, N = C.n;
  const pct = n => { const p = n / N * 100; return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%'; };
  const row = (label, n, extra = '') => `<tr><td>${label}</td><td class="num">${n.toLocaleString()}</td>
    <td class="covbar"><span style="width:${Math.max(n ? 0.6 : 0, n / N * 100).toFixed(2)}%"></span></td><td class="num pct">${pct(n)}</td>${extra}</tr>`;
  const table = (rows, head = 'Source') => `<div class="tablebox"><table class="covtab"><thead><tr><th>${head}</th><th class="num">Languages</th><th class="covbar"><span class="sronly">Share of languages</span></th><th class="num">Share</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  const ROLE = { consumer: '', open: 'open', regional: 'regional', quality: 'quality measured' };
  const techRows = C.tech.map(([label, any, svcs]) => `<tr class="grp"><td><details class="covsvc"><summary>${esc(label)} <span class="muted">· any service</span></summary>
      <ul>${svcs.map(([name, prov, role, n]) => `<li><span>${esc(name)}${prov && PROV_ALL[prov] && !name.includes(PROV_ALL[prov]) && prov !== 'open' ? ` <span class="muted">${esc(PROV_ALL[prov])}</span>` : ''}${ROLE[role] ? ` <span class="tag">${ROLE[role]}</span>` : ''}</span><b>${n.toLocaleString()}</b></li>`).join('')}</ul></details></td>
    <td class="num">${any.toLocaleString()}</td><td class="covbar"><span style="width:${(any / N * 100).toFixed(2)}%"></span></td><td class="num pct">${pct(any)}</td></tr>`).join('');
  const nArea = (C.meta.find(m => /Area on the map/.test(m[0])) || [0, 0])[1];
  $('#view').innerHTML = `<article class="about">
    <h2>About the Index</h2>
    <p class="lede">The Language Technology Development Index tracks how well technology supports each of the world's languages, and how much data exists to build more. It covers ${LANGS.length.toLocaleString()} living languages, each scored from 0 to 1 on two dimensions, data and technology, and placed in a tier.</p>
    <h3>What it's for</h3>
    <ul class="aims">
      <li><b>The whole picture.</b> Every language with a record, not only the hundred or so that technology companies and benchmarks usually report on, so the gap between the best- and least-served languages is visible.</li>
      <li><b>Gaps you can act on.</b> Which technologies, services and kinds of data a language lacks, one language at a time, with the Opportunities pages suggesting where builders, researchers and funders could make the most difference.</li>
      <li><b>Speakers, not just languages.</b> How many people each language reaches, where they live and how many are online, so the views can be weighed by people as well as by languages.</li>
      <li><b>Checkable.</b> Every value on a language's page links to its source, and the code and data are open on <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>.</li>
      <li><b>Change over time.</b> Where a source keeps a record, the Charts show how support has grown since 2019.</li>
    </ul>
    <h3>How a language is scored</h3>
    <p>Each dimension averages a few indicators, each scaled from 0 to 1 between a floor and a goal (most on a logarithmic scale, so the first thousand sentences count for more than the millionth). The two are combined with a geometric mean, LTDI = √(data × technology), as in the UN's Human Development Index, so a gap in either pulls the score down: a language with excellent data but no keyboard can't score highly. A technology scores by the share of the services checked that offer the language, weighted by how fully each does (features, voice types, published error rates), with open models counting for less than commercial services. Locale data (CLDR's dates, numbers and names, which software needs before it can support a language) counts as a technology; voice assistants count half as much as other technologies, since few languages have one. Whether a language's script is encoded in Unicode is reported but not scored, as nearly every recorded script is.</p>
    <p>Each dimension has a floor of ${DATA.config.meta.floor}, so a language with nothing recorded in one still has a score, but ranks use the unfloored values: any language with something recorded ranks above every language with nothing, and a language's page shows its score before the floor where the floor lifts it.</p>
    <p>The top three tiers are set by score: ${DATA.config.tiers.cutoffs.map(([, t, c]) => `${t} from ${c}`).join(', ')}. Below Medium, where scores are close together and small differences mean little, a language's tier says what's recorded for it: ${DATA.config.tiers.stages.map(([, t, d]) => `<b>${esc(t)}</b>, ${esc(d.charAt(0).toLowerCase() + d.slice(1))}`).join('; ')}. These stages say what exists, not how much, so they aren't ordered by score: a language with open tools only can outscore one with a single commercial service.</p>
    <p>A spoken variety whose speakers typically write a standard language (Swiss German, Kölsch and Egyptian Arabic, say) is scored and ranked on what exists for it alone. Its page also gives a second score counting the standard's written data and text technologies, which most of its speakers can use, and marks those values “through” the standard. Dari and Southern Pashto are the exceptions: their written form is the standard itself (Persian as written in Afghanistan, standard Pashto), which sources label as Persian and Pashto, so those resources count as their own.</p>
    <h3>Why something is missing for a language</h3>
    <p>Most sources cover only a small share of the world's languages, so most values on most pages are missing. A missing value nearly always means a source doesn't list or measure the language, not that the language has nothing: a language may have speech data in an archive no source here counts, or a keyboard that isn't in any app store. These are the ${N.toLocaleString()} ranked languages each source covers.</p>
    <h4>Language information</h4>
    ${table(C.meta.map(([l, n]) => row(esc(l), n)).join(''), 'What the page shows')}
    <h4>Data</h4>
    ${table(C.data.map(([l, n]) => row(esc(l), n)).join(''), 'Indicator')}
    <h4>Technology</h4>
    <p class="note">Languages offered by at least one service of each kind; open a technology for each service. Quality is measured, by benchmarks, for far fewer languages than services offer.</p>
    ${table(techRows, 'Technology')}

    <h3>Caveats and shortcomings</h3>
    <h4>Languages and speakers</h4>
    <ul>
      <li>The list of languages, their codes, names, countries, speaker counts, scripts and endangerment levels come from <a href="https://github.com/google-research/url-nlp/tree/main/linguameta" target="_blank" rel="noopener">LinguaMeta</a>, which brings together several sources of different dates. Speaker counts for widely used languages often include second-language speakers (English's 1.27 billion), and for others only first-language speakers, so they aren't strictly comparable.</li>
      <li>What counts as a language follows LinguaMeta, by ISO 639-3 code. Some macrolanguages are scored as one language (Arabic, Swahili, Persian), with a note on the language's page; spoken varieties whose speakers write a standard language (Yue Chinese and Mandarin, say) are ranked on their own resources, with a second score counting the standard's.</li>
      <li>Without a speaker count, a language's opportunities can't be ranked by reach.</li>
      <li>Endangerment levels sometimes belong to a minority variety rather than the whole language; clear cases are corrected. A language listed as extinct with no speakers recorded keeps its page but is left out of the ranking, totals and charts.</li>
    </ul>
    <h4>Countries</h4>
    <ul>
      <li>LinguaMeta lists the languages traditionally spoken in each country. Immigrant and diaspora languages come from national censuses: the UN Statistics Division's census tables and, for the United States, the American Community Survey. Many countries with large immigrant communities have no usable census figures on language (France, Germany, Spain, Italy, the Netherlands, the Gulf states, Japan, Brazil and Nigeria among them), so their views show only the languages LinguaMeta lists; a note says so when one is chosen.</li>
      <li>Censuses ask different questions (mother tongue, language spoken at home, main language), some are old, and some group languages ("Chinese"), so census counts aren't comparable between countries. They change only the country and region views, never the scores.</li>
    </ul>
    <h4>Data</h4>
    <ul>
      <li>Web-crawled text for low-resource languages is often not in the language at all (Kreutzer et al., 2022). FineWeb-2 filters by language identification; text mostly from Bible sites counts for less; OPUS's web-mined corpora are checked by language identification on a random sample, which catches the wrong language but not poor translations, so OPUS counts are an upper bound.</li>
      <li>Wikipedia article counts include bot-generated stubs, so articles count only up to a limit per active editor. Hugging Face datasets are counted by their language tags, and datasets tagged with dozens of languages count in part.</li>
      <li>Open speech hours add up datasets of very different kinds: read speech, crowd-sourced recordings and video with uploaded subtitles.</li>
      <li>Font support is checked but not scored: Noto displays nearly every language whose letters are known.</li>
    </ul>
    <h4>Technology</h4>
    <ul>
      <li>Coverage is read from each company's published language lists, which can lag behind or run ahead of what a product actually does, and "supported" means different things to different vendors. A few lists are read by hand where no page could be read automatically.</li>
      <li>Quality is published for few languages. Where a benchmark result exists (translation, speech recognition, LLMs) a weak result counts for less, down to half; elsewhere a listed service counts in full, however well it works, so being measured never lowers a language's score below what it would have been unmeasured.</li>
      <li>LLM availability is read from the official app language lists for ChatGPT, Gemini and Copilot, the languages each company says its app supports; a model may also work, unevenly, in languages its list doesn't name.</li>
      <li>Regional providers count together as one extra service, and only for the languages they offer.</li>
      <li>Voice assistants count each company's assistant across its old and new generations: Google Assistant or Gemini for Home on speakers and displays, Siri, and Alexa or Alexa+. Gemini for Home and Alexa+ are in early access and so far cover only languages the older assistants already had. Amazon publishes no language list for Alexa+, so its languages are the ones Amazon's launch announcements name, or a country's main language where they name only the country. The row counts half as much as other technologies.</li>
      <li>LLM quality comes from a few published benchmark results, each for one model at one time: Claude Fable 5.2 on Global-MMLU (2026), OpenAI o3 on MMMLU (2025), and GPT-4o and Gemini 1.5 Pro on AfroBench translation (2025). Newer models may do better.</li>
      <li>Speech services name varieties by country (ar-EG for Egyptian Arabic), so speech locales are matched to the variety spoken there; text services count as the standard language.</li>
    </ul>
    <h4>Reach</h4>
    <ul><li>People online and able to text are estimated from the World Bank's national averages for each country a language is spoken in, which overstate connectivity for rural and minority-language speakers.</li></ul>
    <h4>Maps</h4>
    <ul>
      <li>Language areas come from Glottography's digitisation of Asher and Moseley's <i>Atlas of the World's Languages</i> (2007), drawn for a world map, so they're coarse and many overlap; ${nArea.toLocaleString()} languages have one. For ${officialNames() || 'a few languages'}, whose countries the atlas fits poorly, the areas are where they're official, from Wikipedia's list via Glottography.</li>
      <li>On the Languages map, each language is a single dot at a point LinguaMeta gives for it, so a language spoken across several countries appears in only one of them.</li>
      <li>The share of land in each tier counts, in each place, the best-covered language spoken there, so it shows where people can find some technology in a language they speak, not that everyone there can.</li>
    </ul>
    <h4>Language pages</h4>
    <ul><li>The writing sample is Article 1 of the Universal Declaration of Human Rights where there's a translation; the spoken words are volunteers' recordings for Lingua Libre, chosen automatically, so a name or an unusual word sometimes gets through.</li></ul>
    <h4>Opportunities</h4>
    <ul><li>Opportunities are gaps in the sources tracked here, ranked by how many people could use the technology, how big the gap is and the rough cost of acting. The costs are rough guides, not estimates, and a gap may already be filled by something no source here records.</li>
      <li>The Plan tab ranks the languages a product doesn't yet support by the people they'd reach online in five years. That's an estimate from LinguaMeta's speaker counts and national connectivity averages, so it favours large languages and overstates reach in rural areas; it says nothing about demand, cost or competition. "Commercially usable" follows each dataset's and model's published licence, and isn't legal advice.</li>
      <li>Each kind of opportunity is suggested only where its first step is possible: text technologies and benchmarks need some written text, a Wikipedia card needs a Wikipedia. A language with nothing recorded gets a single card about documentation and first recordings with its speakers. Before a language is chosen, the list shows at most two cards per language.</li></ul>

    ${stabilitySection()}
    ${validationSection()}
    ${inclusionSection()}
    <h3>Independence and accuracy</h3>
    <p>The Index is made and maintained by Sandy Ritchie, a linguist and technologist. It isn't affiliated with any organisation or company. It's offered as a way to explore the current state of technology and data for the world's languages, not as an authoritative record. There are very likely mistakes and omissions: it brings together only what could be found in open repositories and public documentation, and much work on many languages isn't published in either. For more detail on any language, follow the links to the source material on its page, or do your own research.</p>
    <h3>Corrections and feedback</h3>
    <p>If you spot a mistake, work on a product whose row is out of date, or know of a source we've missed, please email <span class="email">langtechindex@gmail.com</span>, or, if you'd rather it be public, <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">open an issue on GitHub</a> using the correction or new-source form. A link to the page that documents the change is the quickest way to get it fixed; corrections go into the next build with the source cited.</p>
    ${PATHS && window.goatcounter ? `<h3>Privacy</h3>
    <p>The site counts visits with <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, which sets no cookies and records no personal information: only which page was opened, the referring site, and the browser, screen size and country in general terms. Nothing else is collected.</p>` : ''}

    <h3>Download and cite</h3>
    <p>The scores for this edition are a <a href="data/ltdi-${DATA.edition}.csv" target="_blank" rel="noopener">CSV file</a>: one row per language, with its rank, tier, both dimensions before and after the floor, each technology's score, and, for spoken varieties, the score through their written standard (<a href="data/ltdi-${DATA.edition}.json" target="_blank" rel="noopener">column descriptions and the method's hashes</a>). A second <a href="data/ltdi-${DATA.edition}-services.csv" target="_blank" rel="noopener">services table</a> gives, for every language, what each service and benchmark tracked records: 1 where it's offered, 0 where it isn't, or the measured result. Every value with its source, date and note is in the repository's <a href="${REPO_URL}/tree/main/data/records" target="_blank" rel="noopener">data/records</a> folder, and every edition in <a href="${REPO_URL}/tree/main/data/editions" target="_blank" rel="noopener">data/editions</a>, so editions can be compared. The data is licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> and the code MIT.</p>
    <p class="cite">${esc(citeText())}</p>
    <h3>Data for your own tools</h3>
    <p>Each language is also a JSON file at a stable address, such as <span class="code">https://langtechindex.org/api/v1/languages/yo.json</span>, with its scores, the technologies and services that cover it, every recorded value with its source, its countries and locales, family, engineering flags and opportunities. <span class="code">api/v1/index.json</span> lists every language, and <span class="code">api/v1/schema.json</span> describes the files. Within version 1, fields are only added, never renamed or removed; values change with each edition, and a change of method raises the methodology version. Anything that would break a reader goes to version 2, with version 1 kept beside it for at least one edition.</p>
    <h3>Sources and credits</h3>
    <p>Language metadata from LinguaMeta, with scripts from <a href="https://github.com/WPoelman/qwanqwa" target="_blank" rel="noopener">QQ</a> (CC BY-SA 4.0, so data derived from it carries the same licence), endangerment from Glottolog where LinguaMeta gives none, and speaker counts from Wikipedia where neither does. Census figures from the UN Statistics Division and the US Census Bureau; connectivity from the World Bank. Language areas from <a href="https://glottography.github.io" target="_blank" rel="noopener">Glottography</a> (CC BY 4.0); map from Natural Earth. Writing samples from <a href="https://github.com/eric-muller/udhr" target="_blank" rel="noopener">UDHR in XML</a>; spoken words from <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a> (CC BY-SA 4.0). Every other value names its source on the language's page. The method builds on van Esch, Ritchie et al. (2024), <a href="https://aclanthology.org/2024.lrec-main.331/" target="_blank" rel="noopener">Connecting Language Technologies with Rich, Diverse Data Sources Covering Thousands of Languages</a>.</p>
  </article>`;
}

// ---------------------------------------------------------------------------------------- Plan ---
// Which languages next for a product: choose a technology and a starting point (nothing, a tracked
// service's list, or a pasted list); the languages not yet supported are ranked by the people they
// would reach online in five years, with what already exists for each, and a curve of the share of
// people reached as they're added. State lives in the address (#plan?t=...&from=...), so a plan can
// be shared.
const PLAN_TECHS = ['speech_input', 'tts', 'mt', 'llm', 'keyboard', 'interface', 'ocr', 'proofing', 'assistant'];
const PLAN_VOICE = new Set(['speech_input', 'tts', 'assistant']);
let plan = { t: 'speech_input', from: 'none', codes: '', ex: true, com: false, q: 'all', s: 'reach', fam: -1, n: 50 };
const PLAN_Q = { asr_open_whisper: ['asr_whisper_fleurs_wer', v => `${Math.round(v)}% WER`], asr_open_omnilingual: ['asr_omnilingual_cer', v => `${v < 1 ? v.toFixed(1) : Math.round(v)}% CER`],
  mt_open_nllb: ['mt_nllb_flores_chrf', v => `chrF ${Math.round(v)}`] };
function planFromHash(h) {
  const q = new URLSearchParams((h.split('?')[1]) || '');
  if (q.get('t') && PLAN_TECHS.includes(q.get('t'))) plan.t = q.get('t');
  if (q.get('from')) plan.from = q.get('from');
  if (q.has('codes')) plan.codes = q.get('codes');
  if (q.has('ex')) plan.ex = q.get('ex') !== '0';
  if (q.has('com')) plan.com = q.get('com') === '1';
  plan.fam = q.has('fam') && q.get('fam') in GN_BY ? GN_BY[q.get('fam')] : -1;
  if (q.has('s')) plan.s = q.get('s') === 'ready' ? 'ready' : 'reach';
  if (q.has('q')) plan.q = ['all', 'pub', 'ind'].includes(q.get('q')) ? q.get('q') : 'all';
  if (q.has('r')) { regionSel.clear(); q.get('r').split('|').filter(r => REGIONS.includes(r)).forEach(r => regionSel.add(r)); }
  if (q.has('c')) { countrySel.clear(); q.get('c').split(',').filter(c => COUNTRY_NAMES[c]).forEach(c => countrySel.add(c)); }
}
function planHash() {
  const q = new URLSearchParams({ t: plan.t, from: plan.from });
  if (plan.from === 'list' && plan.codes.trim()) q.set('codes', plan.codes.trim().split(/[\s,;]+/).join(','));
  if (!plan.ex) q.set('ex', '0');
  if (plan.com) q.set('com', '1');
  if (plan.q !== 'all') q.set('q', plan.q);
  if (plan.s !== 'reach') q.set('s', plan.s);
  if (plan.fam >= 0) q.set('fam', GN[plan.fam][0]);
  if (regionSel.size) q.set('r', [...regionSel].join('|'));
  if (countrySel.size) q.set('c', [...countrySel].join(','));
  return '#plan?' + q.toString();
}
// Languages in a pasted list, by code, ISO 639-3 code or name
// vendors' codes and names for languages the Index names differently
const PLAN_ALIAS = { zh: 'cmn', 'zh-cn': 'cmn', 'zh-tw': 'cmn', 'zh-hans': 'cmn', 'zh-hant': 'cmn', 'zh-hk': 'yue', iw: 'he', in: 'id', ji: 'yi',
  tl: 'fil', no: 'nb', jw: 'jv', mo: 'ro', chinese: 'cmn', mandarin: 'cmn', cantonese: 'yue', farsi: 'fa', burmese: 'my', tagalog: 'fil',
  norwegian: 'nb', punjabi: 'pa', kurdish: 'ku', 'pa-arab': 'pnb' };
function planParse(text) {
  const found = new Set(), unknown = [];
  for (const raw of text.split(/[\n,;\t]+/).map(x => x.trim()).filter(Boolean)) {
    const k = raw.toLowerCase().replace(/_/g, '-');
    const l = BY[PLAN_ALIAS[k]] || BY[k] || ALL.find(x => (x.iso_639_3 || '') === k || x.name.toLowerCase() === k || (x.autonym || '').toLowerCase() === k
        || (x.alt || '').toLowerCase().split('|').includes(k))
      || BY[PLAN_ALIAS[k.split('-')[0]]] || BY[k.split('-')[0]];
    if (l) found.add(l.code); else unknown.push(raw);
  }
  return { found, unknown };
}
function planRows() {
  const T = CFG.tech.technologies[plan.t], voice = PLAN_VOICE.has(plan.t);
  const scale = l => !narrowed() ? 1 : l.speakers ? (vSpk(l) || 0) / l.speakers : 0;
  const reach5 = l => ((voice ? l.o5 : l.ot5) || 0) * scale(l), reachNow = l => ((voice ? l.online : l.ot) || 0) * scale(l);
  let supported = new Set(), unknown = [], baseName = '';
  if (plan.from.startsWith('svc:')) {
    const id = plan.from.slice(4);
    for (const l of LANGS) if (l._offers.has(id)) supported.add(l.code);
    baseName = (SVC[id] || [id])[0] + (SVC[id] && SVC[id][1] ? ` (${SVC[id][1]})` : '');
  } else if (plan.from === 'list') {
    ({ found: supported, unknown } = planParse(plan.codes));
    baseName = 'your list';
  } else if (plan.from === 'under') {
    // well served: at least half the major services tracked offer it (a regional provider counting as one
    // more), the line the site uses everywhere; what's left is under-served
    for (const l of LANGS) if (levelOf(l, plan.t) === 'full') supported.add(l.code);
    baseName = 'the languages already well served';
  }
  const inScope = l => inRegion(l) && inCountry(l) && reach5(l) > 0 && (plan.fam < 0 || l._gp.includes(plan.fam));
  // varieties of major languages (those whose speakers write another language's standard) are left out,
  // from the list and the totals, unless the starting list includes them
  const considered = LANGS.filter(l => inScope(l) && !(plan.ex && l.wi && !supported.has(l.code)));
  const total = considered.reduce((n, l) => n + reach5(l), 0);
  const base = considered.filter(l => supported.has(l.code)).reduce((n, l) => n + reach5(l), 0);
  const o = { com: plan.com, q: plan.q };
  const cands = considered.filter(l => !supported.has(l.code)).map(l => ({ l, r5: reach5(l), r0: reachNow(l), rd: readiness(l, plan.t, o) }))
    .sort((a, b) => (plan.s === 'ready' ? b.rd.n / (b.rd.of || 1) - a.rd.n / (a.rd.of || 1) : 0) || b.r5 - a.r5);
  let cum = base;
  const rows = cands.map(r => { cum += r.r5; return { ...r, share: total ? cum / total : 0 }; });
  const groups = new Map();
  for (const l of LANGS) {
    if (!l._gp.length || !inRegion(l) || !inCountry(l) || supported.has(l.code) || (plan.ex && l.wi)) continue;
    const r = reach5(l);
    if (r > 0) for (const g of l._gp) { const x = groups.get(g) || [0, 0]; x[0]++; x[1] += r; groups.set(g, x); }
  }
  const famOpts = [...groups].filter(([, [n]]) => n >= 2).sort((a, b) => b[1][1] - a[1][1]).slice(0, 400);
  return { T, voice, rows, total, base, supported, unknown, baseName, famOpts, nSupported: considered.filter(l => supported.has(l.code)).length };
}
function planCells(r, T, sl = false) {
  const l = r.l, cons = [...(T.consumer || [])], baseId = !sl && plan.from.startsWith('svc:') ? plan.from.slice(4) : null;
  const others = cons.filter(id => id !== baseId), nOn = others.filter(id => l._offers.has(id)).length;
  const reg = (T.regional || []).filter(id => id !== baseId && l._offers.has(id)).length;
  const models = (T.open || []).filter(id => id !== baseId && l._offers.has(id) && !(plan.com && RES[id] && RES[id].commercial === 'no')).map(id => {
    const [name] = SVC[id] || [id], q = PLAN_Q[id], v = q && l.qv && l.qv[q[0]], t = TEST_OF[id];
    const shown = v != null && qualityShown(id);
    const by = shown && t ? `, ${t.quality_by === 'own' ? "makers' own" : 'independent'}, ${t.test_public === 'no' ? 'test data not public' : t.test_set.replace(/^the /, '').replace(/ (test split|devtest)$/, '')}` : '';
    const lic = RES[id] && RES[id].commercial === 'no' ? ', research licence' : '';
    return `${name}${shown ? ` (${q[1](v)}${by}${lic})` : lic ? ` (${lic.slice(2)})` : ''}`;
  });
  let data = '—';
  if (PLAN_VOICE.has(plan.t)) { const h = plan.com ? l.shc : l.sh; data = h ? fmtHours(h) + (plan.com ? '' : l.shc != null && l.shc < l.sh ? ` (${fmtHours(l.shc)} commercial)` : '') : '—'; }
  else if (plan.t === 'mt') data = l.ps ? big(l.ps) + ' sentence pairs' : '—';
  else data = l.ww ? big(l.ww) + ' words of web text' : '—';
  // its countries in scope, most speakers first, leaving out those where only immigrant communities speak it
  // (unless those are all there is in scope: Tagalog with the United States chosen, say)
  const here = Object.entries(l._cs).filter(([c]) => sl || countryIn(c)).sort((a, b) => (b[1] || 0) - (a[1] || 0)).map(([c]) => c);
  const home = here.filter(c => !l._im.has(c));
  const cs = home.length ? home : here;
  const scriptsIn = c => l._csc[c] || l._sc.slice(0, 1);
  const scripts = [...new Set(cs.flatMap(scriptsIn))].sort((a, b) => l._sc.indexOf(a) - l._sc.indexOf(b));
  const locales = cs.flatMap(c => scriptsIn(c).map(sc => `${l.code}-${sc}-${c.toUpperCase()}`));
  if (!cs.length) scripts.push(...l._sc.slice(0, 1));
  return { scripts, locales, others: `${nOn} of ${others.length}${reg ? ' + regional' : ''}`, models: models.join('; ') || '—', data, countries: cs };
}
function planCurve(rows, base, total) {
  if (!rows.length || !total) return '';
  const W = 720, H = 300, L = 48, R = 16, Tp = 14, B = 34, N = rows.length;
  const sx = i => L + Math.sqrt(i / N) * (W - L - R), y0 = base / total;
  const lo = y0 > 0.3 ? Math.floor(y0 * 10) / 10 : 0;  // start the axis just below where the list starts
  const sy = v => Tp + (1 - (v - lo) / (1 - lo)) * (H - Tp - B);
  const yt = [0, .25, .5, .75, 1].map(f => lo + f * (1 - lo));
  const step = Math.max(1, Math.floor(N / 400));
  const pts = [[0, y0], ...rows.filter((_, i) => i % step === 0 || i === N - 1).map(r => [rows.indexOf(r) + 1, r.share])];
  const ticks = [0, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000].filter(t => t < N * 0.9);
  const marks = [25, 50, 100, 200].filter(k => k <= N).map(k => [k, rows[k - 1].share]);
  return `<svg class="plancurve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of people online reached as languages are added">
    <g class="grid">${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`).join('')}
      ${[...ticks, N].map(t => `<text x="${sx(t)}" y="${H - 14}" text-anchor="middle">${t === N ? N.toLocaleString() : t}</text>`).join('')}
      <text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle">languages added, ${plan.s === 'ready' ? 'readiest first, then by reach' : 'most-reaching first'}</text></g>
    <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts.map(([i, v]) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}"/>
    <circle cx="${sx(0)}" cy="${sy(y0)}" r="4" fill="var(--accent)"/>
    ${marks.map(([k, v]) => `<circle cx="${sx(k)}" cy="${sy(v)}" r="3.5" fill="var(--accent)"/>`).join('')}
  </svg>
  <div class="plan-steps"><span>Today <b>${Math.round(y0 * 100)}%</b></span>${marks.map(([k, v]) => `<span>+${k} languages <b>${Math.round(v * 100)}%</b></span>`).join('')}<span>All ${N.toLocaleString()} <b>100%</b></span></div>`;
}
// up to four country codes, then how many more
// up to four country codes, then how many more; where it's official (CLDR) in bold
function planCodes(cs, l) {
  if (!cs.length) return '—';
  const up = cs.map(c => l && l._of[c] ? `<b title="${esc(OFFICIAL_LABEL[l._of[c]])}">${c.toUpperCase()}</b>` : c.toUpperCase());
  return up.slice(0, 4).join(' ') + (up.length > 4 ? ` <span class="muted">+${up.length - 4}</span>` : '');
}
const OFFICIAL_LABEL = { o: 'Official', d: 'Official in practice', r: 'Official in a region' };
const officialList = l => Object.entries(l._of).map(([c, st]) => `${(COUNTRY_NAMES[c] || c.toUpperCase())}${st === 'o' ? '' : st === 'd' ? ' (in practice)' : ' (in a region)'}`);
function planCSV(P, sl = false) {
  const head = ['rank', 'code', 'name', 'family', 'branch', 'official_in', 'wikipedia_views_12_months', 'hf_models', 'hf_model_downloads_30_days', 'scripts', 'engineering_flags', 'countries', 'locales', 'online_in_5_years', 'online_today', 'cumulative_share', 'ready', 'missing', 'other_services_offering', 'open_models', 'data'];
  const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const lines = [head.join(',')].concat(P.rows.map((r, i) => { const c = planCells(r, P.T, sl);
    return [i + 1, r.l.code, r.l.name, famName(r.l), branchName(r.l), Object.entries(r.l._of).map(([cc, st]) => cc.toUpperCase() + (st === 'o' ? '' : ':' + st)).join(' '),
      r.l.wv || '', r.l.hm || '', r.l.hd || '', c.scripts.join(' '), flagLabels(r.l).join('; '), c.countries.map(x => x.toUpperCase()).join(' '), c.locales.join(' '),
      Math.round(r.r5), Math.round(r.r0), r.share.toFixed(4), `${r.rd.n} of ${r.rd.of}`, r.rd.items.filter(x => !x.ok).map(x => x.label).join('; '), c.others, c.models, c.data].map(q).join(','); }));
  return lines.join('\n') + '\n';
}
// The shortlist: languages a team is weighing for its next wave. Kept in the link (#shortlist?codes=...)
// so a colleague opens the same table, and in this browser so it survives moving between pages.
let shortlist = (() => { try { return JSON.parse(localStorage.getItem('ltdi-shortlist') || '[]').filter(c => BY[c]); } catch (e) { return []; } })();
const saveShortlist = () => { try { localStorage.setItem('ltdi-shortlist', JSON.stringify(shortlist)); } catch (e) { /* kept for this visit only */ } };
const onShortlist = code => shortlist.includes(code);
const slButton = l => { const on = onShortlist(l.code);
  return `<button type="button" class="slbtn" data-sl="${l.code}" aria-pressed="${on}" title="${on ? 'On your shortlist: select to remove' : 'Add to your shortlist'}" aria-label="${on ? 'Remove' : 'Add'} ${esc(l.name)} ${on ? 'from' : 'to'} the shortlist">${on ? '✓' : '+'}</button>`; };
const slWide = l => { const on = onShortlist(l.code);
  return `<button type="button" class="chip slwide" data-sl="${l.code}" aria-pressed="${on}">${on ? 'On your shortlist ✓' : 'Add to shortlist'}</button>`; };
function slHash() {
  const q = new URLSearchParams({ codes: shortlist.join(','), t: plan.t });
  if (plan.com) q.set('com', '1');
  if (plan.q !== 'all') q.set('q', plan.q);
  if (plan.s !== 'reach') q.set('s', plan.s);
  return '#shortlist?' + q.toString().replace(/%2C/g, ',');
}
function toggleShortlist(code) {
  shortlist = onShortlist(code) ? shortlist.filter(c => c !== code) : [...shortlist, code];
  saveShortlist();
  document.querySelectorAll(`[data-sl="${code}"]`).forEach(b => {
    const on = onShortlist(code), name = (BY[code] || {}).name || code;
    b.setAttribute('aria-pressed', String(on));
    if (b.classList.contains('slwide')) b.textContent = on ? 'On your shortlist ✓' : 'Add to shortlist';
    else { b.textContent = on ? '✓' : '+'; b.title = on ? 'On your shortlist: select to remove' : 'Add to your shortlist';
      b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${name} ${on ? 'from' : 'to'} the shortlist`); }
  });
  document.querySelectorAll('.slcount').forEach(x => x.textContent = shortlist.length);
  document.querySelectorAll('a.slchip').forEach(a => a.setAttribute('href', slHash()));
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sl]');
  if (!b) return;
  e.preventDefault();
  toggleShortlist(b.dataset.sl);
  if (curRoute().startsWith('shortlist')) { history.replaceState(null, '', slHash()); const y = scrollY; shortlistPage(); scrollTo(0, y); }
});
function slFromHash(h) {
  const q = new URLSearchParams((h.split('?')[1]) || '');
  if (q.has('codes')) { shortlist = [...new Set(q.get('codes').split(',').map(c => c.trim().toLowerCase()).filter(c => BY[c]))]; saveShortlist(); }
  if (q.get('t') && PLAN_TECHS.includes(q.get('t'))) plan.t = q.get('t');
  plan.com = q.get('com') === '1';
  plan.q = ['pub', 'ind'].includes(q.get('q')) ? q.get('q') : 'all';
  plan.s = q.get('s') === 'ready' ? 'ready' : 'reach';
}
function shortlistRows() {
  const T = CFG.tech.technologies[plan.t], voice = PLAN_VOICE.has(plan.t), o = { com: plan.com, q: plan.q };
  const r5 = l => (voice ? l.o5 : l.ot5) || 0, r0 = l => (voice ? l.online : l.ot) || 0;
  const total = LANGS.reduce((n, l) => n + r5(l), 0);
  let cum = 0;
  const rows = shortlist.map(c => BY[c]).filter(Boolean).map(l => ({ l, r5: r5(l), r0: r0(l), rd: readiness(l, plan.t, o) }))
    .sort((a, b) => (plan.s === 'ready' ? b.rd.n / (b.rd.of || 1) - a.rd.n / (a.rd.of || 1) : 0) || b.r5 - a.r5)
    .map(r => { cum += r.r5; return { ...r, share: total ? cum / total : 0 }; });
  return { T, voice, rows, total, base: 0 };
}
function shortlistPage() {
  const P = shortlistRows(), T = P.T, who = P.voice ? 'people online' : 'people online and able to text';
  const sum5 = P.rows.reduce((n, r) => n + r.r5, 0), sum0 = P.rows.reduce((n, r) => n + r.r0, 0);
  const pct = v => `${Math.round(v * 100)}%`, n = P.rows.length;
  $('#view').innerHTML = `
    <section class="chart">
      <h2 class="plan-h">Shortlist</h2>
      <p class="sub">The languages you're weighing for a wave, side by side with the Plan tab's columns. Add them with the + beside a language in the Plan table or on its page, or type codes or names below. The link keeps the list, so a colleague who opens it sees the same table.</p>
      <div class="sl-controls">
        <label class="plan-l">Technology <select id="sl-t">${PLAN_TECHS.map(k => `<option value="${k}"${plan.t === k ? ' selected' : ''}>${esc(CFG.tech.technologies[k].label)}</option>`).join('')}</select></label>
        <label class="plan-l">Quality figures <select id="sl-q"><option value="all"${plan.q === 'all' ? ' selected' : ''}>All published</option><option value="pub"${plan.q === 'pub' ? ' selected' : ''}>On public test sets only</option><option value="ind"${plan.q === 'ind' ? ' selected' : ''}>Independently measured only</option></select></label>
        <label class="switch" title="Count only open data and models whose licence permits commercial use"><input type="checkbox" role="switch" id="sl-com"${plan.com ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Commercially usable data and models only</label>
      </div>
      <form class="sl-add" id="sl-form"><input id="sl-in" type="text" autocomplete="off" aria-label="Languages to add" placeholder="Add languages: codes or names, such as yo, ha, Igbo"><button type="submit" class="chip">Add</button></form>
      <p class="note sl-msg" id="sl-msg" aria-live="polite"></p>
    </section>
    <section class="chart">
      <div class="plan-tablehead"><h3>${n ? `${n} ${n === 1 ? 'language' : 'languages'}: ${people(sum5)} ${who} in five years (${pct(sum5 / (P.total || 1))} of the world's), ${people(sum0)} today` : 'No languages yet'}</h3><span><button type="button" class="chip" id="sl-csv"${n ? '' : ' disabled'}>Download CSV</button> <button type="button" class="chip" id="sl-link"${n ? '' : ' disabled'}>Copy link</button> <button type="button" class="chip" id="sl-clear" style="min-width:8.5em"${n ? '' : ' disabled'}>Clear</button></span></div>
      ${n ? `<div class="tablebox">${planHead(T, P, who, 'the world', true)}<tbody>${P.rows.map((r, i) => planRow(r, i, T, true)).join('')}</tbody></table></div>`
          : `<p class="note">Nothing on the shortlist. Open the <a href="#plan">Plan tab</a> and select + beside the languages you want to compare, or add them above.</p>`}
      <p class="note">Reached is the share of ${who} worldwide in five years covered by the languages so far, in the table's order; speakers of several listed languages are counted in each. Ready counts the ingredients for building ${esc(T.label.toLowerCase())} recorded for each language (hover a figure for the list). The other columns are as in the Plan tab, for the whole world.</p>
    </section>`;
  const redraw = () => { history.replaceState(null, '', slHash()); const y = scrollY; shortlistPage(); scrollTo(0, y); };
  $('#sl-t').onchange = e => { plan.t = e.target.value; redraw(); };
  $('#sl-q').onchange = e => { plan.q = e.target.value; redraw(); };
  $('#sl-com').onchange = e => { plan.com = e.target.checked; redraw(); };
  $('#view').querySelectorAll('[data-psort]').forEach(b => b.onclick = () => { plan.s = b.dataset.psort; redraw(); });
  $('#sl-form').onsubmit = e => {
    e.preventDefault();
    const { found, unknown } = planParse($('#sl-in').value), added = [...found].filter(c => !onShortlist(c));
    shortlist = [...shortlist, ...added]; saveShortlist(); redraw();
    $('#sl-msg').textContent = [added.length ? `Added ${added.length}.` : found.size ? 'Already on the shortlist.' : '', unknown.length ? `Not recognised: ${unknown.slice(0, 12).join(', ')}${unknown.length > 12 ? ' …' : ''}.` : ''].filter(Boolean).join(' ');
  };
  if ($('#sl-csv')) $('#sl-csv').onclick = () => {
    const blob = new Blob([planCSV(P, true)], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ltdi-shortlist-${plan.t}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#sl-link').onclick = async e => {
    try { await navigator.clipboard.writeText(location.href.split('#')[0] + slHash()); e.target.textContent = 'Link copied'; } catch (err) { e.target.textContent = 'Copy the address bar'; }
  };
  $('#sl-clear').onclick = e => {
    if (e.target.dataset.armed) { shortlist = []; saveShortlist(); redraw(); }
    else { e.target.dataset.armed = '1'; e.target.textContent = 'Select to confirm'; }
  };
}

// The planner's table head and rows, shared by the Plan tab and the shortlist (sl: no starting list or scope)
function planHead(T, P, who, scopeName, sl) {
  return `<table class="plantab"><thead><tr><th class="num pc-n">#</th><th class="pc-lang">Language</th><th class="pc-code" title="The code the Index uses: ISO 639-1 where there is one, otherwise ISO 639-3">Code</th><th class="pc-code" title="Its script in the countries listed, as ISO 15924 codes">Script</th><th class="pc-cty" title="Where it's spoken, most speakers first, as ISO 3166 country codes; countries where only immigrant communities speak it are left out">Countries</th><th class="num pc-num" title="Estimated ${who} in five years, in ${esc(scopeName)}"><button class="sort" data-psort="reach" aria-pressed="${plan.s === 'reach'}">Online in 5 years<span class="arr" aria-hidden="true">${plan.s === 'reach' ? '▼' : ''}</span></button></th><th class="num pc-num">Today</th><th class="num pc-pct" title="Share of the total reached once this language is added">Reached</th><th class="num pc-rdy" title="How many of the ingredients for building ${esc(T.label.toLowerCase())} are recorded for it; hover a figure for the list"><button class="sort" data-psort="ready" aria-pressed="${plan.s === 'ready'}">Ready<span class="arr" aria-hidden="true">${plan.s === 'ready' ? '▼' : ''}</span></button></th><th class="pc-oth" title="Comparable commercial services already offering it${!sl && P.baseName && plan.from.startsWith('svc:') ? ` (other than ${esc(P.baseName)})` : ''}">Others offering</th><th class="pc-mod">Open models</th><th class="pc-data">Open data</th></tr></thead>`;
}
function planRow(r, i, T, sl) {
  const c = planCells(r, T, sl), pct = v => `${Math.round(v * 100)}%`;
  return `<tr><td class="num">${i + 1}</td><td>${slButton(r.l)}<a href="${LH(r.l.code)}" title="${esc([famName(r.l), branchName(r.l)].filter(Boolean).join(' › '))}">${esc(r.l.name)}</a></td><td class="pc-m">${r.l.code}</td><td class="pc-m">${c.scripts.join(' ') || '—'}${flagTags(r.l)}</td><td class="pc-m" title="${esc(c.locales.join(' '))}">${planCodes(c.countries, r.l)}</td><td class="num">${people(r.r5)}</td><td class="num">${people(r.r0)}</td><td class="num">${pct(r.share)}</td><td class="num" title="${esc(readyTitle(r.rd))}">${r.rd.of ? `${r.rd.n} of ${r.rd.of}` : '—'}</td><td>${esc(c.others)}</td><td class="small">${esc(c.models)}</td><td class="small">${esc(c.data)}</td></tr>`;
}
function planPage() {
  const P = planRows(), T = P.T;
  const svcOpts = [...(T.consumer || []), ...(T.regional || []), ...(T.open || [])].filter(id => SVC[id])
    .map(id => `<option value="svc:${id}"${plan.from === 'svc:' + id ? ' selected' : ''}>${esc(SVC[id][0])}${SVC[id][1] ? ` · ${esc(SVC[id][1])}` : ''}</option>`).join('');
  const shown = P.rows.slice(0, plan.n);
  const pct = v => `${Math.round(v * 100)}%`;
  const scopeName = countrySel.size ? [...countrySel].map(c => COUNTRY_NAMES[c]).join(', ') : regionSel.size ? [...regionSel].join(', ') : 'the world';

  const who = P.voice ? 'people online' : 'people online and able to text';
  $('#view').innerHTML = `
    <div class="plan-top">
    <section class="chart planhead">
      <h2 class="plan-h">Plan which languages to add next</h2>
      <p class="sub">Choose a technology and what your product supports today. The languages it doesn't yet support are ranked by the ${who} they'd reach in five years, with what already exists for each.</p>
      <div class="plan-controls">
        <label class="plan-l">Technology <select id="pl-t">${PLAN_TECHS.map(k => `<option value="${k}"${plan.t === k ? ' selected' : ''}>${esc(CFG.tech.technologies[k].label)}</option>`).join('')}</select></label>
        <label class="plan-l">Starting from <select id="pl-from"><option value="none"${plan.from === 'none' ? ' selected' : ''}>Nothing yet</option><option value="under"${plan.from === 'under' ? ' selected' : ''} title="Leaves out languages that at least half the major services tracked for this technology already offer">Under-served languages</option><option value="list"${plan.from === 'list' ? ' selected' : ''}>A list I paste</option><optgroup label="This list">${svcOpts}</optgroup></select></label>
        <label class="plan-l">Quality figures <select id="pl-q" title="Which published quality figures to show for open models"><option value="all"${plan.q === 'all' ? ' selected' : ''}>All published</option><option value="pub"${plan.q === 'pub' ? ' selected' : ''}>On public test sets only</option><option value="ind"${plan.q === 'ind' ? ' selected' : ''}>Independently measured only</option></select></label>
        <label class="plan-l">Family or branch <input id="pl-fam" class="plan-in" list="pl-fams" autocomplete="off" placeholder="Any, or type one: Bantu, Indo-Aryan …" value="${plan.fam >= 0 ? esc(GN[plan.fam][1]) : ''}"></label>
        <datalist id="pl-fams">${P.famOpts.map(([g, [n, r]]) => `<option value="${esc(GN[g][1])}">${n.toLocaleString()} languages · ${people(r)}</option>`).join('')}</datalist>
        <div class="plan-scope"><span class="plan-l">Where</span><span id="plregwrap">${regionPicker()}</span><span id="plctrywrap">${countryPicker()}</span></div>
      </div>
      ${plan.from === 'list' ? `<div class="plan-paste"><textarea id="pl-codes" rows="3" placeholder="Language codes or names, separated by commas, spaces or new lines: en, es, yo, Hausa ...">${esc(plan.codes)}</textarea>
        <p class="note">${P.supported.size.toLocaleString()} recognised${P.unknown.length ? `; not recognised: ${esc(P.unknown.slice(0, 12).join(', '))}${P.unknown.length > 12 ? ' …' : ''}` : ''}.</p></div>` : ''}
      <div class="plan-toggles">
        <label class="switch" title="Count spoken varieties whose speakers mostly read and write a major standard language (Wu, Egyptian Arabic, Bhojpuri). When off, they're left out unless your list includes them"><input type="checkbox" role="switch" id="pl-ex"${plan.ex ? '' : ' checked'}><span class="track" aria-hidden="true"></span>Include varieties of major languages</label>
        <label class="switch" title="Count only open data and models whose licence permits commercial use"><input type="checkbox" role="switch" id="pl-com"${plan.com ? ' checked' : ''}><span class="track" aria-hidden="true"></span>Commercially usable data and models only</label>
      </div>
    </section>
    <section class="chart plangraph">
      <h3>${P.rows.length ? `From ${pct(P.base / (P.total || 1))} to 100% of ${who} in ${esc(scopeName)}` : 'Nothing left to add'}</h3>
      <p class="sub">${P.baseName ? `Starting from ${esc(P.baseName)}: ${P.nSupported.toLocaleString()} ${P.nSupported === 1 ? 'language' : 'languages'} reaching ${people(P.base)} of ${people(P.total)} in five years.` : `Starting from nothing: ${people(P.total)} ${who} in five years across ${P.rows.length.toLocaleString()} languages.`}${plan.fam >= 0 ? ` Only ${esc(GN[plan.fam][1])} languages are counted.` : ''}${plan.ex ? ' Varieties of major languages are left out of the list and the totals.' : ' Varieties of major languages are counted in the list and the totals.'} Each step adds the next language in the table below.</p>
      ${planCurve(P.rows, P.base, P.total)}
    </section>
    </div>
    <section class="chart">
      <div class="plan-tablehead"><h3>${plan.from === 'under' ? 'Under-served languages' : 'Languages to add'}, ${plan.s === 'ready' ? 'readiest first' : 'by reach'}</h3><span><a class="chip slchip" href="${slHash()}" title="The languages you've marked with +">Shortlist (<span class="slcount">${shortlist.length}</span>)</a> <button type="button" class="chip" id="pl-csv">Download CSV</button> <button type="button" class="chip" id="pl-link">Copy link</button></span></div>
      <div class="tablebox">${planHead(T, P, who, scopeName, false)}
      <tbody>${shown.map((r, i) => planRow(r, i, T, false)).join('')}</tbody></table></div>
      ${P.rows.length > shown.length ? `<button type="button" class="chip" id="pl-more">Show ${Math.min(50, P.rows.length - shown.length)} more of ${(P.rows.length - shown.length).toLocaleString()}</button>` : ''}
      <p class="note">Reach is an estimate from LinguaMeta's speaker counts and the World Bank's connectivity; spoken varieties and second-language speakers are counted as those sources count them. Countries are where it's spoken, as ISO 3166 codes with the most speakers first, leaving out countries where only immigrant communities speak it, so the code, script and a country give a locale (pnb-Arab-PK). Scripts are those LinguaMeta records in use in each country; where a language uses different scripts in different countries, hover the countries for the pairs. The CSV lists every country, with the locales. Ready counts the ingredients for building ${esc(T.label.toLowerCase())} that are recorded for the language (hover a figure for the list, or see the language's page); it follows the commercial-use switch and the quality-figures menu, and its header sorts the table, readiest first, with the curve following the new order. Others offering counts the commercial services tracked for ${esc(T.label.toLowerCase())}${P.baseName && plan.from.startsWith('svc:') ? ', other than the one you started from' : ''}; "+ regional" means a regional provider offers it too. Open models are those listed for the language, with published quality where there is a figure, who measured it and on what test set, and their licence where it doesn't permit commercial use. Omnilingual ASR's figures are its makers' own, on test data that isn't public, so treat them with more caution than figures on FLEURS or FLORES-200; the Quality figures menu can hide them. None of the open models' figures is independently measured yet. Open data is ${P.voice ? 'transcribed speech from the open datasets tracked' : plan.t === 'mt' ? 'sentence pairs with English in OPUS' : 'web text in FineWeb-2'}${plan.com && P.voice ? ', counting only datasets whose licence permits commercial use' : plan.com && plan.t === 'mt' ? '; OPUS corpora carry their own licences, which aren\'t checked here' : ''}. Licences are as each project publishes them; this isn't legal advice.${plan.from === 'under' ? ` Under-served means fewer than half of the major services tracked for ${esc(T.label.toLowerCase())} offer the language (a regional provider counts as one more), the same line the rest of the site uses for "most services"; it includes languages some services offer and languages none do. Open models don't count as serving a language, since the aim is a service people can use.` : ''}</p>
    </section>`;
  const redraw = () => { history.replaceState(null, '', planHash()); const y = scrollY; planPage(); scrollTo(0, y); };
  $('#pl-t').onchange = e => { plan.t = e.target.value; if (plan.from.startsWith('svc:')) plan.from = 'none'; plan.n = 50; redraw(); };
  $('#pl-from').onchange = e => { plan.from = e.target.value; plan.n = 50; redraw(); };
  $('#pl-ex').onchange = e => { plan.ex = !e.target.checked; redraw(); };
  $('#pl-com').onchange = e => { plan.com = e.target.checked; redraw(); };
  $('#pl-q').onchange = e => { plan.q = e.target.value; redraw(); };
  $('#pl-fam').onchange = e => {
    const v = e.target.value.trim().toLowerCase();
    if (!v) plan.fam = -1;
    else { const hit = P.famOpts.find(([g]) => GN[g][1].toLowerCase() === v) || P.famOpts.find(([g]) => GN[g][1].toLowerCase().includes(v)); if (hit) plan.fam = hit[0]; }
    plan.n = 50; redraw();
  };
  $('#view').querySelectorAll('[data-psort]').forEach(b => b.onclick = () => { plan.s = b.dataset.psort; redraw(); });
  const ta = $('#pl-codes');
  if (ta) ta.onchange = e => { plan.codes = e.target.value; plan.n = 50; redraw(); };
  if ($('#pl-more')) $('#pl-more').onclick = () => { plan.n += 50; redraw(); };
  $('#pl-csv').onclick = () => {
    const blob = new Blob([planCSV(P)], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ltdi-plan-${plan.t}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#pl-link').onclick = async e => {
    const url = location.href.split('#')[0] + planHash();
    try { await navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; } catch (err) { e.target.textContent = 'Copy the address bar'; }
  };
  wireMsel('plregwrap', regionPicker, regionSel, REGIONS.length, () => { redraw(); reopen('plregwrap'); });
  wireCountries('plctrywrap', () => { redraw(); reopenCountries('plctrywrap'); });
}

// A language address that isn't a code the Index uses: its ISO 639-3 code, name, own name or another name
function resolveLang(raw) {
  let q;
  try { q = decodeURIComponent(raw); } catch (e) { q = raw; }
  q = q.toLowerCase().replace(/[_+]/g, ' ').replace(/ language$/, '').trim();
  if (BY[q]) return BY[q];
  const same = s => (s || '').toLowerCase() === q || (s || '').toLowerCase().replace(/-/g, ' ') === q.replace(/-/g, ' ');
  return ALL.find(l => l.iso_639_3 === q) || ALL.find(l => same(l.name) || same(l.autonym)) || ALL.find(l => altNames(l).some(same)) || null;
}
// Nothing at this address: say so, and suggest languages whose names or codes are close
function notFound(raw) {
  let q = raw;
  try { q = decodeURIComponent(raw || ''); } catch (e) { /* keep it as typed */ }
  q = (q || '').toLowerCase().replace(/[_+-]/g, ' ').replace(/ language$/, '').trim();
  // names that start with what was typed, or are a letter or two away from it (Yorba, Swahli)
  const edits = (a, b, max) => {  // edit distance, giving up past max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (Math.min(...cur) > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  };
  const names = l => [l.name, l.autonym, ...altNames(l)].filter(Boolean).map(n => n.toLowerCase());
  const near = q.length >= 3 ? ALL.filter(l => names(l).some(n => n.startsWith(q) || (q.length >= 4 && edits(q, n, q.length >= 7 ? 2 : 1) <= (q.length >= 7 ? 2 : 1))))
    .sort((a, b) => (b.speakers || 0) - (a.speakers || 0)).slice(0, 8) : [];
  $('#view').innerHTML = `<section class="chart">
    <h2 class="plan-h">${raw != null ? 'No language at this address' : 'Page not found'}</h2>
    <p class="sub">${raw != null ? `The Index has no language with the code or name <b>${esc(q || raw)}</b>. Language pages use the codes in the Index: ISO 639-1 where there is one (<a href="/language/yo">/language/yo</a> for Yoruba), otherwise ISO 639-3. An ISO 639-3 code or a language's name works too.`
      : `There's nothing at <span class="code">${esc(location.pathname)}</span>.`} The search box above finds any language by name or code.</p>
    ${near.length ? `<h3 class="panel-h">Did you mean</h3><ul class="rel-list">${near.map(l => `<li><a href="${LH(l.code)}">${esc(l.name)}</a> <span class="code">${l.code}</span> ${tierChip(l)}</li>`).join('')}</ul>` : ''}
    <p class="note"><a href="/#ranking">See all languages</a></p></section>`;
}
// Visits are counted on the public site with GoatCounter, when pages.py sets it up: no cookies and nothing
// personal, just the view's address (without a shortlist's codes or a plan's settings)
let lastCounted;
function countView() {
  const gc = window.goatcounter;
  if (!PATHS || !gc) return;
  const path = (location.pathname + location.hash).replace(/\?.*$/, '');
  if (path === lastCounted) return;
  lastCounted = path;
  const send = () => window.goatcounter.count && window.goatcounter.count({ path });
  gc.count ? send() : addEventListener('load', send, { once: true });
}
function route() {
  let missing;  // set when the address names nothing: the language asked for, or null for any other path
  if (PATHS) {  // old /#lang-yo links move to /language/yo; a # view on a language's path moves home
    const lp = location.pathname.match(/^\/language\/([^/]+)\/?$/);
    if (location.hash.startsWith('#lang-')) history.replaceState(null, '', `/language/${location.hash.slice(6)}`);
    else if (location.hash && location.pathname !== '/') history.replaceState(null, '', '/' + location.hash);
    else if (lp && !BY[lp[1]]) {
      const hit = resolveLang(lp[1]);
      if (hit) history.replaceState(null, '', `/language/${hit.code}`); else missing = lp[1];
    } else if (location.pathname !== '/' && !lp) missing = null;
  }
  const h = missing !== undefined ? '' : curRoute();
  countView();
  let m;
  if (h !== 'map') { mapFocus = null; mapView = null; }
  navBox('go', 'Find a language name or code');  // each view may give the box another job
  if (missing !== undefined) notFound(missing);
  else if ((m = h.match(/^lang-([a-z]+)$/)) && BY[m[1]]) language(m[1]);
  else if (m) notFound(m[1]);  // #lang-xx for a code the Index doesn't have
  else if ((m = h.match(/^compare-([a-z]+)-([a-z]+)$/))) compare(m[1], m[2]);
  else if (h === 'charts') { if (!HIST) $('#view').innerHTML = ''; histData().then(() => curRoute() === 'charts' && charts()); }
  else if (h === 'map') mapPage();
  else if (h === 'about') about();
  else if (h === 'opportunities') opportunities();
  else if ((m = h.match(/^opportunities-([a-z]+)$/))) opportunities(m[1]);
  else if ((m = h.match(/^opp-([a-z0-9-]+)$/))) oppDetail(m[1]);
  else if (h === 'plan' || h.startsWith('plan?')) { planFromHash(h); planPage(); }
  else if (h === 'shortlist' || h.startsWith('shortlist?')) { slFromHash(h); shortlistPage(); }
  else ranking();
  // From a language (or compare) page, the Opportunities tab opens that language's opportunities
  const cur = (h.match(/^(?:lang|opportunities)-([a-z]+)$/) || h.match(/^(?:compare|opp)-([a-z]+)-/) || [])[1];
  const otab = document.getElementById('tab-opportunities');
  if (otab) otab.setAttribute('href', cur ? '#opportunities-' + cur : '#opportunities');
  const tab = missing !== undefined ? '' : h.startsWith('opp') ? 'opportunities' : h.startsWith('plan') || h.startsWith('shortlist') ? 'plan' : ['charts', 'map', 'about'].includes(h) ? h : (h === '' || h === 'ranking') ? 'ranking' : '';
  tipHide();
  const lm = h.match(/^lang-([a-z0-9]+)$/), TT = { map: 'Map', charts: 'Charts', opportunities: 'Opportunities', plan: 'Plan', about: 'About' };
  document.title = missing !== undefined || (lm && !BY[lm[1]]) ? 'Not found · Language Technology Development Index'
    : lm && BY[lm[1]] ? `${BY[lm[1]].name}: language technology support · LTDI`
    : TT[tab] ? `${TT[tab]} · Language Technology Development Index` : 'Language Technology Development Index';
  for (const t of ['ranking', 'map', 'charts', 'opportunities', 'plan', 'about']) {
    const a = document.getElementById('tab-' + t);
    if (a) t === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('popstate', route);
// On the public site, links to the site's own views move between them without reloading the page
if (PATHS) document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.getAttribute('target')) return;
  const u = new URL(a.getAttribute('href'), document.baseURI);  // getAttribute: an SVG link's href isn't a string
  if (u.origin !== location.origin || !(u.pathname === '/' && u.hash || /^\/language\/[a-z0-9]+\/?$/.test(u.pathname))) return;
  e.preventDefault();
  if (u.href !== location.href) history.pushState(null, '', u.pathname + u.search + u.hash);
  route();
});
route();
