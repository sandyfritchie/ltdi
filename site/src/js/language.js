// --------------------------------------------------------------- language

// Service tiles on the technology panel: plain names (no logos), status, and what each offers
// Service names, kinds and providers come from config/services.csv
// a kind with a qualifier ("Open model, languages its paper evaluates"): the tile shows what comes before the comma,
// the sources table's notes the rest
const kindParts = k => { const i = k.search(/, [a-z]/); return i < 0 ? [k, ''] : [k.slice(0, i), k.slice(i + 2)]; };  // not "MMMLU, 2025"
const SVC = Object.fromEntries(DATA.services.map(s => [s.id, [s.name, kindParts(s.kind)[0], s.provider, kindParts(s.kind)[1]]]));
// Commitment signatories first (Gates Foundation, Sept 2026), then other large companies, smaller ones, open source; tiles follow this order
const PROV = { google: 'Google', microsoft: 'Microsoft', amazon: 'Amazon', openai: 'OpenAI', anthropic: 'Anthropic', apple: 'Apple', meta: 'Meta', deepl: 'DeepL', mistral: 'Mistral AI', alibaba: 'Alibaba', elevenlabs: 'ElevenLabs', deepgram: 'Deepgram', assemblyai: 'AssemblyAI', speechmatics: 'Speechmatics', abbyy: 'ABBYY', cohere: 'Cohere', xai: 'xAI', samsung: 'Samsung', open: 'Open source' };
// Regional providers: one highlight chip for them all on language pages (most readers know the global ones)
const REGIONAL = { yandex: 'Yandex', baidu: 'Baidu', naver: 'Naver', sarvam: 'Sarvam AI', lelapa: 'Lelapa AI', ghananlp: 'GhanaNLP', sunbird: 'Sunbird AI', bhashini: 'Bhashini', intron: 'Intron' };
const PROV_ALL = { ...PROV, ...REGIONAL };
// Tile order: the global providers, then regional ones, then open source
const PROV_ORDER = [...Object.keys(PROV).filter(k => k !== 'open'), ...Object.keys(REGIONAL), 'open'];
// Provider highlight: dim every other provider's tiles (one rule per provider, so new providers just work)
document.head.insertAdjacentHTML('beforeend', `<style>${Object.keys(PROV).map(k =>
  `section.focus-${k} .tile[data-prov]:not([data-prov="${k}"]) { opacity: .3; }`).join('\n')}
  section.focus-regional .tile[data-prov]:not([data-regional]) { opacity: .3; }</style>`);
let provFocus = null, moreOpen = false, provsOpen = false;  // remembered while moving between languages
const techOpen = new Set();  // the technologies whose services are shown, remembered likewise
const dimOpen = new Set();  // the panels (tech, data) whose breakdown is shown, remembered likewise
const ROLE_OF = Object.fromEntries(DATA.services.map(s => [s.id, s.role]));
const DEPTH_OF = Object.fromEntries(DATA.services.filter(s => s.depth).map(s => [s.id, s.depth]));
// A published quality measure that discounts a service where it's poor (services.csv: quality)
const QUALITY_OF = Object.fromEntries(DATA.services.filter(s => s.quality).map(s => [s.id, s]));
// Who measured each published quality figure, and on what (services.csv: quality_by, test_set, test_size, test_public)
const TEST_OF = Object.fromEntries(DATA.services.filter(s => s.test_set).map(s => [s.id, s]));
// Families (Glottolog): the groups above each language, and the nearest relatives with more support
const GN = DATA.gnodes, GN_BY = Object.fromEntries(GN.map(([g], i) => [g, i]));
const famName = l => l._gp.length ? GN[l._gp[0]][1] : l.giso ? 'Isolate' : '';
const branchName = l => l._gp.length > 1 ? GN[l._gp[l._gp.length - 1]][1] : '';
// Engineering flags: what makes building for a language cost more (ltdi.engineering)
const FLAG_SHORT = { r: 'RTL', s: 'Shaping', w: 'No spaces', i: 'IME', m: 'Scripts', l: 'Look-alikes' };
const flagLabels = l => l._fx.map(f => (DATA.flags[f] || [, f])[1]);
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
      ['A published error rate on FLEURS', qv.asr_whisper_fleurs_wer != null && qualityOK('asr_open_whisper', o.q)],
      ['A public test set (FLEURS or Common Voice)', fl('f') || fl('c')], text1m(', for a language model')],
    tts: [[`10 hours or more of ${use}transcribed speech`, hours], ['An open voice' + (o.com ? ' licensed for commercial use' : ''), voice],
      ['A keyboard to type text with', KB_ALL.some(id => l._offers.has(id))], text1m(', for text normalisation')],
    mt: [['100,000 sentence pairs with English', (l.ps || 0) >= 1e5], ['The FLORES-200 evaluation set', fl('F')],
      ['An open translation model' + (o.com ? ' licensed for commercial use' : ''), has('mt_open_nllb') || has('mt_open_madlad')],
      ['A published quality score', (qv.mt_nllb_flores_chrf != null && qualityOK('mt_open_nllb', o.q)) || (qv.mt_google_flores_chrf != null && qualityOK('mt_google', o.q))]],
    llm: [['100 million words of web text', ww >= 1e8], ['Covered by a public benchmark', fl('b')], ['A published LLM result', llmResult]],
    keyboard: [unicode, ['An open keyboard layout (Keyman)', has('kb_open_keyman')], ['A spell-check dictionary or a million words of text', has('proof_hunspell') || ww >= 1e6],
      ['A word-frequency list, for predictions (Corpus Crawler)', fl('w')], cldr],
    interface: [unicode, cldr, ['Volunteer localisers (Firefox or MediaWiki is translated)', l._offers.has('ui_firefox') || l._offers.has('ui_mediawiki')]],
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
  if (f.unit === 'WER band') return f.note.replace(/, as .*/, '');  // 'Word error rate 25-50%'
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
const LISTED_ONLY = new Set(Object.values(DATA.config.dimensions.tech.technologies).flatMap(t => t.listed_only || []));
const regionalOn = (t, facts) => (t.regional || []).filter(id => facts[id] && facts[id].value);
function svcTile(id, own, open, via, wname, unnamed, lname) {
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
  const lo = !on && LISTED_ONLY.has(id);  // an app's language setting: absence isn't a gap
  // a country locale for this variety that the company doesn't name as the variety: it counts for the standard
  const asStd = !on && unnamed && unnamed[id] ? (BY[unnamed[id]] || {}).name || unnamed[id] : '';
  const measured = ['% of English', 'accuracy', 'chrF'].includes(f.unit);
  // figures, features and levels are in "Sources, dates and notes", not on the tile; hover still has the source
  const hover = [f.source, asStd ? `The company lists ${asStd} for a country where ${lname} is spoken, but doesn\u2019t say it\u2019s ${lname}, so the Index counts it for ${asStd}. It may well handle ${lname} speech; the company doesn\u2019t say.` : '', lo ? 'Not in the app\u2019s language setting. The company says the assistant can be used in other languages too, so the Index leaves this out rather than counting it as missing.' : ''].filter(Boolean).join('\n');
  const detail = thru ? `Through ${wname}` : '';
  return `<a class="tile ${thru ? 'thru' : on ? 'on' : 'off'}"${pv} href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : on ? '✓' : '–'}</span>
    <div>${by}<b>${esc(name)}</b><small>${esc(kind)}${on || measured || lo ? '' : asStd ? ` · listed as ${esc(asStd)}` : ''}</small>${detail ? `<span class="det">${esc(detail)}</span>` : ''}</div></a>`;
}

// A technology's services, in tile order: the global providers, regional ones (where they offer it), open source,
// and benchmarks (some only where they cover the language)
function techIds(t, tk, facts) {
  const ids = [...(t.consumer || []), ...regionalOn(t, facts), ...(t.open || []),
    ...Object.keys(t.measured || {}).filter(id => facts[id] || !ONLY_IF_MEASURED.has(id)),
    // benchmarks that are shown but not scored (measured by the makers): only where they cover the language
    ...DATA.services.filter(s => s.technology === tk && s.role === 'measured' && !(s.id in (t.measured || {})) && facts[s.id]).map(s => s.id)];
  const rank = id => { const i = PROV_ORDER.indexOf((SVC[id] || [])[2]); return i < 0 ? PROV_ORDER.length : i; };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}
// Locale data: CLDR's coverage level, a tile of its own since no service offers it
const CLDR_LEVEL = ['Not in CLDR', 'Basic coverage', 'Moderate coverage', 'Modern coverage'];
function localeTile(f, vf, wname) {
  const thru = vf && (!f || vf.value > f.value);
  const g = thru ? vf : f;
  if (!g) return `<div class="tile off"><span class="mark" aria-hidden="true">–</span><div><span class="by">Unicode CLDR</span><b>Locale data</b><small>Dates, numbers, names · <span class="vis">Not in CLDR</span></small></div></div>`;
  const lv = Math.round(g.value), det = thru ? `Through ${wname}` : '';
  const below = !lv && /below basic/.test(g.note);
  return `<a class="tile ${thru ? 'thru' : lv ? 'on' : 'off'}" href="${esc(g.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc([g.source, g.note].filter(Boolean).join('\n'))}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : lv ? '✓' : '–'}</span>
    <div><span class="by">Unicode CLDR</span><b>Locale data</b><small>Dates, numbers, names${lv ? '' : ` · <span class="vis">${below ? 'Below basic' : 'Not in CLDR'}</span>`}</small>${det ? `<span class="det">${esc(det)}</span>` : ''}</div></a>`;
}
// Commercial use: what each open resource's licence permits (resources.csv: yes, no, varies)
const fmtHours = h => h >= 10 ? `${Math.round(h).toLocaleString()} hours` : `${(+h).toFixed(1)} hours`;
// Licensed corpora shown on a page: the largest first (by hours where given), at most LICENSED_SHOWN
const LICENSED_SHOWN = 6;
const licensedShown = list => [...list].sort((a, b) => (+b[3] || 0) - (+a[3] || 0)).slice(0, LICENSED_SHOWN);
const COMMERCIAL = { yes: 'Permitted', no: 'Not permitted', varies: 'Varies' };
// How each speech dataset's hours were obtained (the record's method; ltdi/collectors/speech.py), as a mark on the
// hours: none where its makers publish them (or the Mozilla Data Collective lists them), a key under the table
const SPEECH_MARK = { measured: '*', sampled: '\u2020' };
const SPEECH_KEY = { '*': 'measured from its audio, clip by clip', '\u2020': 'measured from a sample of its clips and scaled to the whole' };
const fmtH = h => h >= 10 ? Math.round(h).toLocaleString() : (+h).toFixed(1);
const ptable = (cols, rows) => `<div class="ptable"><table><thead><tr>${cols.map(c => `<th scope="col"${c === 'Hours' ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
function speechSets(l, facts) {
  const sets = Object.entries(l.sd || {}).filter(([i]) => facts[i]).sort((a, b) => b[1] - a[1]);
  if (!sets.length) return '';
  const used = new Set();
  const rows = sets.map(([i, h]) => {
    const f = facts[i], R = RES[i] || {}, u = (f.url || '').split(' ')[0], mk = SPEECH_MARK[f.method] || '';
    if (mk) used.add(mk);
    const name = u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(R.name || f.source)}</a>` : esc(R.name || f.source);
    return `<tr><td>${name}</td><td class="num">${esc(fmtH(h))}${mk ? `<sup class="mk">${mk}</sup>` : ''}</td><td class="nw">${esc(COMMERCIAL[R.commercial] || '')}</td><td>${esc(f.note || '')}</td></tr>`;
  });
  return `<p class="prov-sub">Where these hours come from</p>${ptable(['Dataset', 'Hours', 'Commercial use', 'Notes'], rows)}
    <p class="mkey"><span>Hours as each dataset\u2019s makers publish them${used.size ? `, except: ${[...used].map(m => `${m} ${SPEECH_KEY[m]}`).join('; ')}` : ''}.</span></p>`;
}
// Open transcribed speech in detail, under its own heading in "Sources, dates and notes": how much is licensed for
// commercial use, the datasets the hours come from, and licensed corpora that are listed but not counted
function speechDetail(l, facts) {
  const sets = speechSets(l, facts);
  const usable = l.sh && l.shc < l.sh
    ? `<p>${l.shc >= 0.05 ? `${fmtHours(l.shc)} of the ${fmtHours(l.sh)} are licensed for commercial use.` : `None of the ${fmtHours(l.sh)} are licensed for commercial use.`}</p>` : '';
  const lic = l.licensed && l.licensed.length
    ? `<p class="prov-sub">Not counted, as it isn\u2019t open data</p>${ptable(['Dataset', 'Hours', 'Access', 'Notes'], licensedShown(l.licensed).map(([name, steward, task, h, licence, paid, url, where]) =>
      `<tr><td><a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a></td><td class="num">${h !== '' ? esc(fmtH(+h)) : ''}</td><td class="nw">${paid === 'yes' ? 'For a fee' : 'Data licence'}</td><td>${esc([steward, task, licence && licence[0].toLowerCase() + licence.slice(1), where && where !== 'the Mozilla Data Collective' ? `from ${where}` : 'on the Mozilla Data Collective'].filter(Boolean).join('; '))}</td></tr>`))}${l.licensed.length > LICENSED_SHOWN ? `<p class="mkey"><span>And ${l.licensed.length - LICENSED_SHOWN} more, listed in the database download</span></p>` : ''}` : '';
  if (!sets && !usable && !lic) return '';
  return `<div class="prov-speech"><h4>Transcribed speech</h4>${usable}${sets}${lic}</div>`;
}
// Every value's source, retrieval date and note, in a list that opens by click, tap or keyboard
// (the same details are on hover over each value, which touch and keyboard users can't reach)
const fmtDay = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
// One row of the sources table: what, any figure or detail, its source(s), when retrieved, and notes
const srcLink = f => { const u = (f.url || '').split(' ')[0]; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(f.source)}</a>` : esc(f.source); };
function provRow(label, f, o = {}) {
  const more = (o.extra || []).filter(g => g && g.source && g.source !== f.source);
  return `<tr><td><b>${esc(label)}</b>${o.thru ? ` <span class="muted">through ${esc(o.thru)}</span>` : ''}</td>
    <td>${[f, ...more].map(srcLink).join('<br>')}</td><td class="nw">${esc(fmtDay(f.retrieved))}</td>${o.detailCol ? `<td class="det">${o.detail || ''}</td>` : ''}<td>${esc([...new Set((o.notes || [f.note]).filter(Boolean))].join(' '))}</td></tr>`;
}
// Who measured a quality figure, as marks on it: * by its makers, † on test data that isn't public (a key under the table)
const MARKS = { own: '*', hidden: '\u2020' };
const marksOf = id => { const t = TEST_OF[id]; return t ? (t.quality_by === 'own' ? MARKS.own : '') + (t.test_public === 'no' ? MARKS.hidden : '') : ''; };
// A service's figures and details for its row: a measured result, its features or level, a quality figure
function svcFacts(id, facts) {
  const more = (SVC[id] || [])[3] && !(facts[id].source || '').toLowerCase().includes(SVC[id][3]) ? SVC[id][3] : '';  // unless the source's title says it
  const f = facts[id], out = { detail: '', notes: [more ? more[0].toUpperCase() + more.slice(1) + '.' : '', f.note], extra: [] };
  const on = f.unit === 'bool' ? !!f.value : true;
  const parts = [];
  if (f.unit === '% of English') parts.push(`${Math.round(f.value)}% of English`);
  else if (f.unit === 'accuracy') parts.push(`${Math.round(f.value * 100)}% accuracy`);
  else if (f.unit === 'chrF') parts.push(`${Math.round(f.value)} chrF from English`);
  const dp = on && DEPTH_OF[id] ? facts[DEPTH_OF[id]] : null;
  if (dp) { const t = depthText(dp, DEPTH_OF[id]); if (t) parts.push(t); out.notes.push(dp.note); out.extra.push(dp); }
  const q = QUALITY_OF[id], qf = on && q ? facts[q.quality] : null;
  if (qf) {
    // word error rates as WER (a key under the table)
    const fig = qf.unit === '% WER' ? depthText(qf, q.quality).replace('% word error rate', '% WER') : qf.unit === 'WER band' ? qf.note.replace(/, as .*/, '').replace(/^Word error rate /, 'WER ') : `${Math.round(qf.value)} ${qf.unit}, ${qualityText(qf, q).toLowerCase()}`;
    parts.push(fig);
    if (qf.unit !== 'WER band') { out.notes.push(qf.note); out.extra.push(qf); }  // a band: the service's own page, one link
  }
  const figure = ['% of English', 'accuracy', 'chrF'].includes(f.unit) || (qf && !(qf.unit === '% WER' && qf.value >= 100));
  const t = TEST_OF[id];
  if (figure && t && t.test_public !== 'no') out.notes.push(`Test set: ${t.test_set.replace(/^the /, '')}${t.test_size ? ` (${t.test_size})` : ''}.`);
  const said = parts.join('; ').toLowerCase();
  out.notes = out.notes.filter(n => n && n.toLowerCase() !== said);  // a note that only repeats the detail
  out.detail = esc(parts.join('; ')) + (figure ? `<sup class="mk">${marksOf(id)}</sup>` : '');
  out.marks = figure ? marksOf(id) : '';
  return out;
}
const markKey = used => [used.includes(MARKS.own) ? `${MARKS.own} Measured by the company that makes it, so shown but not scored` : '',
  used.includes(MARKS.hidden) ? `${MARKS.hidden} On test data that isn\u2019t public, so the figure can\u2019t be checked` : '',
  used.includes('W') ? 'WER = word error rate' : ''].filter(Boolean).map(t => `<span>${t}</span>`).join('');
// a disclosure triangle, drawn the same for every drop-down in the panels
const TW = '<span class="tw" aria-hidden="true"></span>';
function provList(l, key, facts, vfacts, wname) {
  let body = '', n = 0, marks = '';
  const head = cols => `<thead><tr>${cols.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead>`;
  if (key === 'tech') {  // a table, grouped by technology, so its name isn't repeated on every line
    const groups = [];
    for (const [tk, t] of Object.entries(CFG.tech.technologies)) {
      const rows = [];
      const add = (fs, thru) => {
        if (t.indicator) {
          const f = fs && fs[t.indicator];
          if (f) rows.push(provRow('Unicode CLDR', f, { thru, detailCol: true, detail: esc(CLDR_LEVEL[Math.round(f.value)] || '') }));
          return;
        }
        for (const id of techIds(t, tk, facts)) {
          const f = fs && fs[id];
          if (!f || (thru && f === facts[id])) continue;
          const x = svcFacts(id, fs);
          marks += x.marks + (/WER/.test(x.detail) ? 'W' : '');
          rows.push(provRow((SVC[id] || [])[0] || DATA.labels[id] || id, f, { thru, detailCol: true, detail: x.detail, notes: x.notes, extra: x.extra }));
        }
      };
      add(facts); if (vfacts) add(vfacts, wname);
      if (rows.length) groups.push(`<tbody><tr class="pg"><th colspan="5" scope="rowgroup">${TICON[tk] || ''}${esc(t.label)}</th></tr>${rows.join('')}</tbody>`);
      n += rows.length;
    }
    if (groups.length) body = `<div class="ptable"><table>${head(['Service', 'Source', 'Retrieved', 'Detail', 'Notes'])}${groups.join('')}</table></div>${marks ? `<p class="mkey">${markKey(marks)}</p>` : ''}`;
  } else {
    const rows = [];
    const add = (label, id) => {
      if (facts[id]) rows.push(provRow(label, facts[id]));
      if (vfacts && vfacts[id] && vfacts[id] !== facts[id]) rows.push(provRow(label, vfacts[id], { thru: wname }));
    };
    for (const [ik, spec] of Object.entries(CFG[key].indicators)) {
      add(spec.label, ik);
      if (spec.narrowed_by) add(spec.label + ' · Bible-site share', spec.narrowed_by);
    }
    if (key === 'data') add('Word-frequency list (not scored; in the keyboard and spelling checklists)', 'wordlist_corpuscrawler');
    n = rows.length;
    if (rows.length) body = `<div class="ptable"><table>${head(['Indicator', 'Source', 'Retrieved', 'Notes'])}<tbody>${rows.join('')}</tbody></table></div>`;
  }
  const speech = key === 'data' ? speechDetail(l, facts) : '';
  if (!body && !speech) return '';
  return `<details class="prov"><summary>${TW}<span class="dd-title">Sources, dates and notes</span> <span class="muted">· ${n}</span></summary>${body}${speech}</details>`;
}
function dimPanel(l, key, color) {
  const d = l.dimensions[key], facts = DATA.facts[l.code] || {}, cfg = CFG[key];
  const vfacts = (DATA.via || {})[l.code], vd = l.via_dims && l.via_dims[key], w = BY[l.written_in], wname = w ? w.name : '';
  const thru = v => `<span class="thru-v" title="Counted from ${esc(wname)}">through ${esc(wname)} ${v}</span>`;
  let body = '';
  if (key === 'tech') {
    const provs = `<details class="provs"${provsOpen ? ' open' : ''}><summary>${TW}<span class="dd-title">Providers</span></summary><div class="provkey" role="group" aria-label="Highlight a provider"><span>Highlight</span>${Object.entries({ ...PROV, ...(Object.values(cfg.technologies).some(t => regionalOn(t, facts).length) ? { regional: 'Regional providers' } : {}) }).map(([k, n]) =>
      `<button class="chip prov" id="pv-${k}" data-pv="${k}" aria-pressed="${provFocus === k}" style="--p:var(--prov-${k})"${k === 'regional' ? ` title="${esc(Object.values(REGIONAL).join(', '))}"` : ''}><i></i>${esc(n)}</button>`).join('')}</div></details>`;
    const main = [], more = [], peek = [];
    for (const [tk, t] of Object.entries(cfg.technologies)) {
      const s = d.indicators[tk], sv = s == null ? 'not measured' : s.toFixed(2);
      const vs = vd && vd.indicators[tk] != null && vd.indicators[tk] !== s ? vd.indicators[tk] : null;
      const tiles = t.indicator ? localeTile(facts[t.indicator], vfacts && vfacts[t.indicator], wname)
        : techIds(t, tk, facts).map(id => svcTile(id, facts, (t.open || []).includes(id), vfacts, wname, l.unnamed, l.name)).join('');
      // the score and bar always shown; the services it rests on behind the triangle
      const row = `<details class="techrow" data-tk="${tk}"${techOpen.has(tk) ? ' open' : ''}><summary>
        <div class="tech-h">${TW}${TICON[tk] || ''}<b>${esc(t.label)}</b><span class="ind-val">${sv}${vs == null ? '' : ` ${thru(vs.toFixed(2))}`}</span></div>
        ${s == null ? '' : bar(s)}</summary>
        ${t.help ? `<p class="tech-help">${esc(t.help.replace('{name}', l.name))}</p>` : ''}<div class="tiles">${tiles}</div></details>`;
      if (t.group === 'more') { more.push(row); peek.push(`<span title="${esc(t.label)}">${TICON[tk] || ''}<span class="sr">${esc(t.label)}</span>${sv}</span>`); }
      else main.push(row);
    }
    body += main.join('');
    if (more.length) body += `<details class="more-tech"${moreOpen ? ' open' : ''}>
      <summary>${TW}<span class="dd-title">More technologies</span><span class="mt-peek">${peek.join('')}</span></summary>${more.join('')}</details>`;
    body += provs;
  } else {
    body += '<div class="inds">';
    const inds = Object.entries(cfg.indicators);
    for (const [ik, spec] of inds) {
      const f = facts[ik], n = d.indicators[ik];
      const hover = f ? [f.source, 'Retrieved ' + f.retrieved, f.note].filter(Boolean).join('\n') : '';
      // web text comes from FineWeb-2, MADLAD-400 or HPLT 3.0, whichever holds most: the label names the one counted
      const name = ik === 'web_text_words' && f && f.source && ik in facts && f.source !== 'FineWeb' ? `Web text (${f.source.replace(' (clean)', '')} words)` : spec.label;
      const lab = f ? `<a class="indlink" href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">${esc(name)}</a>` : esc(name);
      const nb = spec.narrowed_by && facts[spec.narrowed_by];  // e.g. how much of the web text is from Bible sites
      const narrow = nb && nb.value >= 0.1 && f && f.value
        ? `<div class="missing" title="${esc(nb.note)}">${/MADLAD/.test(nb.source) ? `${nb.value >= 1 ? 'Only' : 'Partly'} Bible or jw.org text in its auditors\u2019 sample, so it counts for less` : `${Math.round(nb.value * 100)}% from Bible sites, so it counts for less`}</div>` : '';
      const vf = vfacts && vfacts[ik], vn = vd && vd.indicators[ik];
      const vline = vf && vn != null && vn !== n ? `<div class="thru-line">Through <a href="${LH(w.code)}">${esc(wname)}</a>: ${esc(showValue(vf))}</div>` : '';
      body += `<div class="ind"><div class="ind-top"><b>${lab}</b><span class="ind-val">${esc(showValue(f))}</span></div>${vline}
        ${n == null ? '<div class="missing">Not collected yet; left out of this score</div>' : bar(n)}${narrow}</div>`;
    }
    // reading and building already happening: Wikipedia page views, models made for it on Hugging Face (shown, not scored)
    const hv = i => facts[i] && facts[i].value ? facts[i].value : 0, hf = facts.hf_models, wp = facts.wikipedia_pageviews;
    if (wp && wp.value) body += `<div class="ind"><div class="ind-top"><b><a class="indlink" href="${esc(wp.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(`${wp.source}: ${wp.note || ''}`)}">Wikipedia page views</a></b>
        <span class="ind-val">${big(wp.value)} a year</span></div><div class="missing">Not scored.</div></div>`;
    if (hf) body += `<div class="ind"><div class="ind-top"><b>${hf ? `<a class="indlink" href="${esc(hf.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(`Models tagged with it and at most five languages, downloaded at least 10 times in 30 days. ${hf.note || ''}`)}">Builders on Hugging Face</a>` : 'Builders on Hugging Face'}</b>
        <span class="ind-val">${hv('hf_models') ? `${hv('hf_models').toLocaleString()} ${hv('hf_models') === 1 ? 'model' : 'models'}` : 'No models'}</span></div>
        <div class="missing">${hv('hf_models') ? `Made for it, ${big(hv('hf_model_downloads'))} downloads in 30 days` : 'None made for it with recent downloads'}. Not scored.</div></div>`;
    body += '</div>';
  }
  body += provList(l, key, facts, vfacts, wname);
  // at first a single bar with "See breakdown"; the breakdown (and, for technology, Expand all and Hide all) behind it
  const open = dimOpen.has(key);
  return `<section class="dim wide${open ? ' open' : ''}${key === 'tech' ? ' techdim' : ''}${key === 'tech' && provFocus && body.includes(`id="pv-${provFocus}"`) ? ' focus-' + provFocus : ''}" style="--c:var(${color})"><div class="dim-top"><h3>${esc(CFG[key].label)}<span class="h3r">${key === 'tech' ? '<span class="xall"><button type="button" class="chip" data-xall="1">Expand all</button><button type="button" class="chip" data-xall="0">Hide all</button></span>' : ''}<button type="button" class="chip bdbtn" data-bd="${key}" aria-expanded="${open}" aria-controls="bd-${key}">${open ? 'Hide breakdown' : 'See breakdown'}</button><span class="hs">${d.score.toFixed(2)}</span></span></h3>${bar(d.score)}</div>
    <div class="dim-body" id="bd-${key}">${vd && vd.score !== d.score ? `<div class="thru-dim">${esc(wname)}’s written resources counted in: ${vd.score.toFixed(2)}</div>` : ''}${d.raw < d.score ? `<div class="thru-dim">${d.raw.toFixed(3)} before the floor of ${DATA.config.meta.floor}</div>` : ''}${body}</div></section>`;
}

// The World Bank's internet-use page for the countries the figures are weighted by (named in the note)
function wbLink(f) {
  const cs = ((f.note || '').split(': ')[1] || '').replace('\u2026', '').split(', ').filter(c => /^[A-Z]{2}$/.test(c));
  return cs.length ? `${f.url}?locations=${cs.join('-')}` : f.url;
}
// The people: speakers, and how many are online now and in five years (World Bank internet use)
function peopleRow(l) {
  const f = DATA.facts[l.code] || {}, sp = l.speakers || 0;
  const n = k => f[k] ? sp * f[k].value : null, g = f.speaker_growth_5y ? f.speaker_growth_5y.value : 1;
  const wb = f.reach_voice_share && sp;
  return `<div class="facts">
    <span>${sp ? `Speakers <b>${people(sp)}</b>` : 'Speakers not recorded'}</span>
    ${wb ? `<span title="${esc(f.reach_voice_share.note)}">Online today <b>${people(n('reach_voice_share'))}</b></span>
    <span title="${esc(f.reach_voice_share_5y ? f.reach_voice_share_5y.note : '')}">Online in five years <b>${people(n('reach_voice_share_5y') * g)}</b></span>
    <a href="${esc(wbLink(f.reach_voice_share))}" target="_blank" rel="noopener">World Bank data</a>` : ''}</div>`;
}
// Where it's spoken: countries, official status, endangerment, adult literacy
function placeRow(l) {
  // official status, most speakers first, like the countries; literacy in its three main countries:
  // "63%" for one country, "98% (France) 55% (Cameroon)" for several
  const spk = c => l._cs[c] || 0;
  const off = Object.entries(l._of).sort((a, b) => spk(b[0]) - spk(a[0]))
    .map(([c, st]) => `${COUNTRY_NAMES[c] || c.toUpperCase()}${st === 'o' ? '' : st === 'd' ? ' (in practice)' : ' (in a region)'}`);
  const top = Object.entries(l._cs).filter(([c]) => !l._im.has(c)).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 3).map(([c]) => c)
    .filter(c => DATA.country_literacy[c] != null);
  const inLang = c => l.literacy && l.literacy[c] != null ? `${Math.round(l.literacy[c])}% in ${esc(l.name)}` : '';
  const lit = top.length === 1
    ? `<b>${Math.round(DATA.country_literacy[top[0]])}%</b>${inLang(top[0]) ? ` (${inLang(top[0])})` : ''}`
    : top.map(c => `<b>${Math.round(DATA.country_literacy[c])}%</b> (${esc(COUNTRY_NAMES[c] || c.toUpperCase())}${inLang(c) ? `; ${inLang(c)}` : ''})`).join(' ');
  const end = endKey(l);
  return `<div class="facts">
    <span><span id="where">${whereLine(l, false)}</span>${censusInfo(l)}</span>
    ${l.extinct ? '' : `<span title="Unicode CLDR territory data: official, official in practice, or official in a region. Where a country’s constitution names a language CLDR doesn’t mark, the constitution: Hausa and Igbo in Nigeria (section 55 of the 1999 Constitution)">${off.length ? `Official in <b>${esc(off.slice(0, 3).join(', '))}</b>${off.length > 3 ? ` and ${off.length - 3} more` : ''}` : 'Not official in any country'}</span>`}
    ${!['none', 'not_endangered'].includes(end) ? `<span title="${end === 'revitalizing' ? `Listed as extinct or dormant in ${l.endangerment_source === 'glottolog' ? 'Glottolog' : 'LinguaMeta'}, but with speakers recorded today, often through revival` : `UNESCO's endangerment scale, ${esc(END_SOURCE[l.endangerment_source] || 'from LinguaMeta')}`}">Endangerment <b>${esc(END_LABEL[end])}</b></span>` : ''}
    ${top.length ? `<span title="Unicode CLDR territory data: adult literacy in each of its main countries, and in the language itself where CLDR records it">Adult literacy ${lit}</span>` : ''}
    ${l.sample || !l.script_names.length ? '' : `<span>${l.script_names.length > 1 ? 'Scripts' : 'Script'} <b>${esc(l.script_names.join(', '))}</b>${unicodeNote(l)}${writtenInfo(l)}</span>`}</div>`;
}
// Its codes, each linking to where it's defined or described: a small box beside the endonym
function codesRow(l) {
  // no labels: each says what it is on hover
  const code = (title, href, text) => `<a class="code" href="${href}" target="_blank" rel="noopener" title="${title}">${esc(text)}</a>`;
  return `<span class="codes" aria-label="Codes">${[
    code('BCP 47 tag: in the IANA subtag registry', `https://r12a.github.io/app-subtags/?check=${encodeURIComponent(l.code)}`, l.code),
    l.iso_639_3 ? code('ISO 639-3 code: on Ethnologue', `https://www.ethnologue.com/language/${encodeURIComponent(l.iso_639_3)}/`, l.iso_639_3) : '',
    l.glottocode ? code('Glottocode: on Glottolog', `https://glottolog.org/resource/languoid/id/${encodeURIComponent(l.glottocode)}`, l.glottocode) : ''].filter(Boolean).join(' · ')}</span>`;
}

// A writing sample: Article 1 of the Universal Declaration of Human Rights, from UDHR in XML (the
// translations the UN human rights office collects, in one form), with the English for comparison
const UDHR = 'https://github.com/eric-muller/udhr';
const UDHR_COMMIT = '588b3f4b2d0467aff54842a4b926551b69d5a66a';
function sampleBlock(l) {
  if (!l.sample) return '';
  const [text, tag, dir, name, f, script, sname] = l.sample;
  const italic = ['Latn', 'Cyrl', 'Grek'].includes(script);  // scripts with an italic style
  return `<figure class="sample">
    <blockquote lang="${esc(tag)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}"${italic ? ' class="it"' : ''}>${esc(text)}</blockquote>
    <figcaption title="${l.code === 'en' ? '' : 'All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood.'}">Article 1 of the Universal Declaration of Human Rights, written in <a href="${UDHR}/blob/${UDHR_COMMIT}/data/udhr/udhr_${esc(f)}.xml" target="_blank" rel="noopener" title="${esc(`UDHR in XML: ${name}`)}">${esc(l.name)}</a> (${esc(sname || script)} script)${unicodeNote(l)}${writtenInfo(l)}</figcaption>
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
    <div class="hear-src">Recorded by <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(h.clips[0][3])}" target="_blank" rel="noopener">${esc(h.speaker)}</a> for <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a></div></div>`;
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
  const cs = (l.census || []).filter(c => l.countries.includes(c[0]));  // only the countries the line shows
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
// Under the score: a spoken variety's score through its written standard; the score before the floor
function scoreNotes(l) {
  const w = BY[l.written_in], out = [];
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
  if (n <= 1) return `Mainly in <b>${cs.map(esc).join(', ')}</b>`;  // a fourth country is named, not "and 1 more"
  return all ? `Mainly in <b>${cs.map(esc).join(', ')}</b> <button class="linkish" data-more="0">less</button>`
             : `Mainly in <b>${cs.slice(0, 3).map(esc).join(', ')}</b> <button class="linkish" data-more="1">and ${n} more</button>`;
}
// Opportunities as a panel of compact cards, like the services on the technology panel: what to do, the one figure
// that matters, a link to the starter kit; coloured by kind of action, highest priority first
function oppPanel(l) {
  const os = [...l.opportunities].sort((a, b) => prio(b) - prio(a));
  const kinds = Object.keys(OT).filter(k => os.some(o => o.type === k));
  const card = o => `<div class="otile" style="--c:var(${OCOLOR[o.type]})" title="${esc(`${OT[o.type].label}: ${o.title}`)}">
      <span class="oprio" title="Priority">${prio(o).toFixed(2)}</span>
      <b>${esc(o.short || o.title)}</b>${o.fact ? `<small>${esc(o.fact)}</small>` : ''}<a href="#opp-${o.id}">starter kit</a></div>`;
  return `<section class="dim wide opps-panel" style="--c:var(--muted)">
    <h3>Opportunities<span class="h3r"><a class="olink" href="#opportunities-${l.code}">Filter and compare by type</a></span></h3>
    ${os.length ? `<div class="okey">${kinds.map(k => `<span style="--c:var(${OCOLOR[k]})"><i></i>${esc(OT[k].label)}</span>`).join('')}</div>
    <div class="otiles">${os.map(card).join('')}</div>`
      : `<p class="note">${l.extinct ? 'None listed: with no speakers recorded, there is no one for new technology to reach yet.' : 'No gaps found in the indicators collected so far.'}</p>`}</section>`;
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
async function language(code) {
  const l = BY[code];
  if (!l) return ranking();
  await need(code);
  $('#view').innerHTML = `
    <div class="lhead lang">
      <div class="lmain"><h2>${esc(l.name)} <span class="auto">${esc(l.autonym !== l.name ? l.autonym : '')}</span>${l.note ? infoTip('About this language', esc(l.note)) : ''} ${codesRow(l)}</h2>
        ${peopleRow(l)}
        ${placeRow(l)}
        ${sampleBlock(l)}
        ${hearBlock(l)}
      </div>
      <div class="lscore"><div class="big">${l.ltdi.toFixed(3)}</div>
        <div class="mapcol"><div class="lsub"><div class="lrk">${tierChip(l)}
          <div class="lrank"${l.tied ? ` title="Tied with ${l.tied.toLocaleString()} ${l.tied === 1 ? 'other language' : 'other languages'}"` : ''}>${!l.rank ? 'Extinct · not ranked' : `${l.tied ? '=' : ''}${l.rank.toLocaleString()} of ${LANGS.length.toLocaleString()}`}</div></div></div><div class="lnotes">${scoreNotes(l)}</div>${miniMap(l)}</div></div>
    </div>
    <div class="dims">${['tech', 'data'].map(k => dimPanel(l, k, DIMS.find(d => d[0] === k)[2])).join('')}</div>
    ${oppPanel(l)}
    <p class="note">Metadata from <a href="${esc(l.source)}" target="_blank" rel="noopener">LinguaMeta</a>${l.script_source === 'qq' ? `, with the script from <a href="https://github.com/WPoelman/qwanqwa" target="_blank" rel="noopener">QQ</a>` : ''}. Something out of date or missing for ${esc(l.name)}? Email <span class="email">${CORRECTIONS_EMAIL}</span> or <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">send a correction on GitHub</a>.</p>
    ${changesLine(l)}`;
  bindMiniMap(l);
  bindHear();
  $('#where').onclick = e => { const b = e.target.closest('[data-more]'); if (b) $('#where').innerHTML = whereLine(l, b.dataset.more === '1'); };
  bindTechPanel();
  // the button, or a click anywhere else in the panel's top (its title, score and bar), opens or closes the breakdown
  $('#view').querySelectorAll('.dim-top').forEach(top => top.onclick = e => {
    if (e.target.closest('button:not(.bdbtn)')) return;  // Expand all and Hide all do their own thing
    const b = top.querySelector('.bdbtn'), sec = top.closest('section.dim'), open = !sec.classList.contains('open');
    sec.classList.toggle('open', open); open ? dimOpen.add(b.dataset.bd) : dimOpen.delete(b.dataset.bd);
    b.setAttribute('aria-expanded', String(open)); b.textContent = open ? 'Hide breakdown' : 'See breakdown';
  });
  $('#view').querySelectorAll('[data-pv]').forEach(b => b.onclick = () => {
    provFocus = provFocus === b.dataset.pv ? null : b.dataset.pv;
    const sec = $('section.dim.techdim');
    sec.className = sec.className.replace(/ focus-\w+/g, '') + (provFocus ? ' focus-' + provFocus : '');
    $('#view').querySelectorAll('[data-pv]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.pv === provFocus)));
  });
  navBox('go', 'Find another language');
}

// The technology panel's drop-downs: each technology's services, More technologies, Providers (remembered between
// languages) and the sources; Expand all opens every one but the sources, Hide all closes every one (each greyed out when there's nothing to do)
function bindTechPanel() {
  const sec = $('section.dim.techdim');
  if (!sec) return;
  const all = () => [...sec.querySelectorAll('details.techrow, details.more-tech, details.provs, details.prov')];
  const expandable = () => all().filter(d => !d.classList.contains('prov'));  // Expand all leaves the sources closed
  const sync = () => {
    sec.querySelector('[data-xall="1"]').disabled = expandable().every(d => d.open);
    sec.querySelector('[data-xall="0"]').disabled = !all().some(d => d.open);
  };
  for (const d of all()) d.addEventListener('toggle', () => {
    if (d.classList.contains('techrow')) d.open ? techOpen.add(d.dataset.tk) : techOpen.delete(d.dataset.tk);
    else if (d.classList.contains('more-tech')) moreOpen = d.open;
    else if (d.classList.contains('provs')) provsOpen = d.open;
    sync();
  });
  sec.querySelectorAll('[data-xall]').forEach(b => b.onclick = () => { const o = b.dataset.xall === '1'; for (const d of o ? expandable() : all()) d.open = o; });
  sync();
}



