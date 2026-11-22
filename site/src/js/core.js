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
const numWord = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);
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
  if (typeof l.under === 'string') l.under = Object.fromEntries(Object.keys(CFG.tech.technologies).map((t, i) => [t, l.under[i] || 'a']));
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
  if (f.unit === 'WER band') return f.note.replace(/, as .*/, '');
  if (f.unit === 'editors') return big(v) + ' active editors';
  if (f.unit === 'sentence pairs') return big(v) + ' sentence pairs';
  if (f.unit === 'datasets') return big(v) + ' datasets';
  if (f.unit === 'datasets, weighted') return `${v >= 1000 ? big(v) : v >= 1 ? Math.round(v) : 'Under 1'} ${v >= 1.5 ? 'datasets' : 'dataset'}, weighted`;
  if (/^benchmarks of \d+$/.test(f.unit)) return `${v} of ${f.unit.split(' ').pop()}`;
  return v;
}
const bar = (v, color) => `<div class="bar"><i style="width:${(v * 100).toFixed(1)}%;${color ? `background:var(${color})` : ''}"></i></div>`;

