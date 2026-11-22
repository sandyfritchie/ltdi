// --------------------------------------------------------------- language

// Service tiles on the technology panel: plain names (no logos), status, and what each offers
// Service names, kinds and providers come from config/services.csv
const SVC = Object.fromEntries(DATA.services.map(s => [s.id, [s.name, s.kind, s.provider]]));
// Commitment signatories first (Gates Foundation, Sept 2026), then other large companies, smaller ones, open source; tiles follow this order
const PROV = { google: 'Google', microsoft: 'Microsoft', amazon: 'Amazon', openai: 'OpenAI', anthropic: 'Anthropic', apple: 'Apple', meta: 'Meta', deepl: 'DeepL', mistral: 'Mistral AI', alibaba: 'Alibaba', elevenlabs: 'ElevenLabs', deepgram: 'Deepgram', assemblyai: 'AssemblyAI', speechmatics: 'Speechmatics', abbyy: 'ABBYY', cohere: 'Cohere', xai: 'xAI', samsung: 'Samsung', open: 'Open source' };
// Regional providers: one highlight chip for them all on language pages (most readers know the global ones)
const REGIONAL = { yandex: 'Yandex', baidu: 'Baidu', naver: 'Naver', sarvam: 'Sarvam AI', lelapa: 'Lelapa AI', ghananlp: 'GhanaNLP', sunbird: 'Sunbird AI' };
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
      ['A published error rate on FLEURS', qv.asr_whisper_fleurs_wer != null && qualityOK('asr_open_whisper', o.q)],
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
const LISTED_ONLY = new Set(Object.values(DATA.config.dimensions.tech.technologies).flatMap(t => t.listed_only || []));
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
  const lo = !on && LISTED_ONLY.has(id);  // an app's language setting: absence isn't a gap
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
  const hover = [f.source, lo ? 'Not in the app\u2019s language setting. The company says the assistant can be used in other languages too, so the Index leaves this out rather than counting it as missing.' : '', qline, dep && dep !== qf && dep.note ? dep.note : qf ? '' : f.note, figure ? measuredLong(id) : ''].filter(Boolean).join('\n');
  if (thru) detail = [`Through ${wname}`, detail].filter(Boolean).join(' · ');
  return `<a class="tile ${thru ? 'thru' : on ? 'on' : 'off'}"${pv} href="${esc(f.url.split(' ')[0])}" target="_blank" rel="noopener" title="${esc(hover)}">
    <span class="mark" aria-hidden="true">${thru ? '↳' : on ? '✓' : '–'}</span>
    <div>${by}<b>${esc(name)}</b><small>${esc(kind)}${on || measured ? '' : lo ? ' · not in the setting' : ' · <span class="vis">Not yet</span>'}</small>${detail ? `<span class="det">${esc(detail)}</span>` : ''}</div></a>`;
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
        <div class="tech-h">${TICON[tk] || ''}<b>${esc(t.label)}</b>${t.help ? infoTip(t.label, esc(t.help)) : ''}<span class="ind-val">${sv}${vs == null ? '' : ` ${thru(vs.toFixed(2))}`}</span></div>
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
    <p class="note">Metadata from <a href="${esc(l.source)}" target="_blank" rel="noopener">LinguaMeta</a>${l.script_source === 'qq' ? `, with the script from <a href="https://github.com/WPoelman/qwanqwa" target="_blank" rel="noopener">QQ</a>` : ''}. Something out of date or missing for ${esc(l.name)}? Email <span class="email">${CORRECTIONS_EMAIL}</span> or <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">send a correction on GitHub</a>.</p>
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


