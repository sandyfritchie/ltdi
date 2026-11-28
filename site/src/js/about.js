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
    <p>Services known to be missing, because their makers publish no list of languages, include Samsung Keyboard, the Facebook, WhatsApp and Google Search interfaces, and models whose makers give a number of languages but no names (Gemma, Muse Glimmer, DeepSeek and Grok's chat). They'll be added where an official language list can be read reliably; to propose one, send a link to its official language list (see below).</p>`;
}
// How much ranks depend on the method's working choices (ltdi.sensitivity)
function stabilitySection() {
  const S = DATA.sensitivity;
  if (!S) return '';
  return `<h3>How stable the ranks are</h3>
    <p>The weights, goalposts and floor are working choices. To see how much the ranking depends on them, every language was re-scored ${S.draws.toLocaleString()} times with different choices drawn at random: each weight from half to one and a half times its value, each data goal up to ten times higher or lower, and the floor from 0.025 to 0.075. The table shows how far ranks move in 90% of these re-scorings.</p>
    <div class="tablebox"><table class="covtab"><thead><tr><th>Ranks</th><th class="num">Languages</th><th class="num">Typical range</th><th class="num">Within ±10% of rank</th></tr></thead>
    <tbody>${S.bands.map(b => `<tr><td>${esc(b.ranks)}</td><td class="num">${b.languages.toLocaleString()}</td><td class="num">${b.median_range.toLocaleString()} places</td><td class="num">${Math.round(b.within_10pct * 100)}%</td></tr>`).join('')}</tbody></table></div>`;
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
    <h4>Joshi et al. (2020), resource classes</h4>
    <p class="note"><a href="${J.source}" target="_blank" rel="noopener">The State and Fate of Linguistic Diversity and Inclusion in the NLP World</a>: six classes by labelled and unlabelled data. ${J.n.toLocaleString()} ranked languages have a class; rank correlation with LTDI ${J.spearman.toFixed(2)}.</p>
    ${table(J, 'Class')}${dis(J, o => `class ${o}`)}
    <h4>Simons, Thomas and White (2022), Digital Language Support</h4>
    <p class="note"><a href="${D.paper}" target="_blank" rel="noopener">Assessing Digital Language Support on a Global Scale</a>: five levels from 143 tools' language lists, ${esc(D.as_of)}. Only a 10% sample is public (<a href="${D.source}" target="_blank" rel="noopener">sil-ai/dls-results</a>), of which ${D.n.toLocaleString()} languages match ranked ones; rank correlation with their score ${D.spearman.toFixed(2)}, with their level ${D.spearman_level.toFixed(2)}.</p>
    ${table(D, 'Level')}${dis(D, o => o)}
    ${B ? `<h4>All three compared</h4>
    <p>On the ${B.n} languages all three cover, LTDI agrees with each study more closely than the two studies agree with each other (rank correlations; 1 would be the same order):</p>
    <div class="tablebox vpair"><table class="covtab"><thead><tr><th>Measure</th><th>Compared with</th><th class="num">Correlation</th></tr></thead>
    <tbody>${pair('Joshi et al.', 'Digital Language Support', B.joshi_dls)}${pair('LTDI', 'Joshi et al.', B.ltdi_joshi)}${pair('LTDI', 'Digital Language Support', B.ltdi_dls)}</tbody></table></div>` : ''}`;
}
// How a service's languages are counted, said wherever a count appears (About, Charts, For providers)
const COUNTING_NOTE = "Each count is the number of distinct languages in the company's own published list, read from the page linked on every language's profile. A list often has several entries for one language: English for each country, a language in two scripts, or both a language and its varieties. Those count once here, so a count is usually lower than the company's own figure, which may count them separately.";
const CORRECTIONS_EMAIL = 'corrections@langtechindex.org';
const SUPPORT_EMAIL = 'support@langtechindex.org';
const INDEPENDENCE = "The Index is maintained by Sandy Ritchie, an independent researcher previously at Google and Google DeepMind. The Index has no funding from, and no affiliation with, any company or organisation whose products or data it tracks, and every company is counted by the same rules.";
// For providers: how a company's numbers are made, which companies count, and how to correct them
function providersPage() {
  const C = DATA.coverage || { tech: [] }, T = DATA.config.dimensions.tech.technologies;
  const role = r => ({ consumer: 'Major', regional: 'Regional', open: 'Open model', quality: 'Benchmark' })[r] || r;
  // LLM lists differ in kind (an app's interface languages, or a model's), so say which each is
  const kindOf = (label, name, prov) => { if (label !== T.llm.label) return '';
    const s = DATA.services.find(x => x.technology === 'llm' && x.role === 'consumer' && x.name === name && x.provider === prov);
    return s ? `<br><span class="muted small">${esc(s.kind)}</span>` : ''; };
  const rows = C.tech.filter(([, , svcs]) => svcs.some(x => x[2] !== 'quality')).map(([label, , svcs]) => svcs.filter(x => x[2] !== 'quality')
    .map(([name, prov, r, n, ent], i) => `<tr>${i ? '' : `<td rowspan="${svcs.filter(x => x[2] !== 'quality').length}">${esc(label)}</td>`}<td>${esc(name)}${prov && PROV_ALL[prov] && !name.includes(PROV_ALL[prov]) && prov !== 'open' ? ` <span class="muted">${esc(PROV_ALL[prov])}</span>` : ''}${kindOf(label, name, prov)}</td><td>${role(r)}</td><td class="num">${n.toLocaleString()}</td><td class="num">${ent > n ? ent.toLocaleString() : ''}</td></tr>`).join('')).join('');
  $('#view').innerHTML = `<article class="about">
    <h2>For providers</h2>
    <p class="lede">If your company makes a product the Index tracks, this page explains how its numbers are made and how to correct them.</p>
    <h3>How a product's languages are counted</h3>
    <p>${COUNTING_NOTE}</p>
    <p>Lists are read from the company's own public pages: most automatically, when the site is rebuilt, and a few by hand where no page can be read automatically. Each language's profile links the exact page each value comes from, with the date it was read. A product counts for a language when its list names the language, whatever it calls it; a list that names only a country (Siri's, say) counts the country's main language. A speech locale counts for a spoken variety only where the list names the variety: "Egyptian Arabic, ar-EG" counts for Egyptian Arabic, but "Arabic (Egypt), ar-EG" counts for Arabic.</p>
    <p>The Index counts what companies document, so a product whose languages aren't written down anywhere can't be counted, however widely it ships. Where no list exists, the Index uses the nearest official source: Android's languages are read from the translations in the Android Open Source Project, and Meta AI's from Llama 4's model card.</p>
    <h3>Published quality</h3>
    <p>Where a service's accuracy for a language has been measured independently of the company that makes it, in the last ${numWord(DATA.config.dimensions.tech.quality_max_age)} years, the measurement scales the service's credit, from half for poor results to full for good ones. Figures a company publishes about its own service are shown on each language's page but don't change scores, so publishing accuracy never costs a company anything, and figures older than ${numWord(DATA.config.dimensions.tech.quality_max_age)} years are left out.</p>
    <p>For LLMs, the count is the languages each company documents, from its official list: for some companies the languages of its chat app's interface, for others the languages its model supports, as each publishes them (the table below says which). A language-setting list names the languages an app's interface is translated into, and both companies that publish one say their assistants can be used in others too, so a language missing from it isn't counted against the app: it counts where it names a language and is left out where it doesn't. A model may also work, unevenly, in languages its company doesn't list; the Index counts what each company commits to, the one thing it can check the same way for every company.</p>
    <h3>Which companies count, and how</h3>
    <p>A service counts as major when its company sells it worldwide, rather than mainly in one country or region, and publishes a list of the languages it supports. Every such service the Index has found is tracked; if one is missing, say so (below) and it will be added from the next edition.</p>
    <p>For each technology, a language is widely available when at least half of the major services tracked offer it, or at least ${numWord(DATA.config.dimensions.tech.full_min)} of them do; the second test keeps the bar from rising each time another service is tracked. A widely available language counts as well served if it's comfortably Medium or above overall, with an LTDI of at least ${DATA.config.dimensions.tech.served_min}. Below that it also has to have the open data the technology is built from (for speech, at least 1,000 hours of open transcribed speech; for translation, a million sentence pairs; for LLMs, a billion words of web text), with no independent measurement in the last ${numWord(DATA.config.dimensions.tech.quality_max_age)} years showing poor accuracy for it. Every other language is underrepresented for that technology, so being listed by several companies doesn't by itself take a language off that list. Regional providers, which serve mainly one country or region, count together as one extra service where any of them offers a language. Open models count for less than commercial services, and never as a major service.</p>
    <div class="tablebox"><table class="covtab provtab"><thead><tr><th>Technology</th><th>Service</th><th>Counted as</th><th class="num">Languages</th><th class="num">Entries in its list</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Languages are counted among the ${(DATA.coverage || {}).n?.toLocaleString() || ''} ranked languages. Entries in a list are shown where they're known.</p>
    <h3>Correcting a count, or sending an updated list</h3>
    <p>If a product's row is wrong or out of date, or you've launched new languages, email <span class="email">${CORRECTIONS_EMAIL}</span> or <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">open a correction on GitHub</a> with a link to the public page that lists them, and they'll be added. The page can be anything public and official: documentation, a help article or an announcement. A list sent as a spreadsheet or file is welcome too, as long as it matches what you publish, since every value on the site links to its public source. Updates go into the site as soon as they're checked, and into the next edition's archive.</p>
    <h3>What companies can do</h3>
    <ul>
      <li><b>Publish a complete language list for each product</b>, with a code for each entry (BCP-47, such as sw or ar-EG) and the variety's name where a locale is a distinct variety ("Egyptian Arabic", not "Arabic (Egypt)"). A machine-readable table on a documentation page is easiest to keep in step with launches.</li>
      <li><b>Say what each list means:</b> the languages a model is meant to work in, the languages an app's interface is translated into, or both.</li>
      <li><b>Publish per-language accuracy on a public test set</b>, such as FLEURS for speech or FLORES-200 for translation, and better still have it measured independently. Only independent figures change scores, but your own help users judge where a product is ready.</li>
      <li><b>Look at the gaps.</b> The Opportunities page lists, for each language, the services that don't offer it yet and the open data that could get them started; filter it by company to see your own.</li>
      <li><b>Release data and models openly.</b> Open speech, text and evaluation data for underrepresented languages raise every company's starting point, and count towards the data dimension for those languages.</li>
    </ul>
    <p>Every change to the data, including each correction, is in the repository's public history, with its source.</p>
    <h3>Who makes the Index</h3>
    <p>${INDEPENDENCE} The method is open: the code, every value with its source, and every past edition are on <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>, so any count can be checked or reproduced.</p>
  </article>`;
}
// What the Index is for, how far each source reaches, and the limits of the data, sources and views
const REPO_URL = 'https://github.com/sandyfritchie/ltdi';
// The database download (ltdi/export.py writes the files and data/database.json when the site is published)
const DB_TABLES = [
  ['languages', 'One row per language or variety: codes, names, speakers, countries, scripts, endangerment'],
  ['technologies', 'The technologies tracked'],
  ['services', 'Each product, open model and benchmark result checked, with its maker and where its list is read'],
  ['service_languages', 'Which service offers which language, with the page it was read from, the date, and any published quality figure'],
  ['datasets', 'Each dataset: what it holds, who shares it, its licence, whether it allows commercial use'],
  ['dataset_languages', 'How much of each dataset each language has, how that was counted, and where to get it'],
  ['language_facts', 'Every other recorded value: Wikipedia, Hugging Face, fonts, Unicode, service features, connectivity'],
  ['not_collected', "Values the Index didn't collect for a language, so their absence means nothing"],
  ['indicators', 'What each value means, its unit, and the table it is in'],
];
let DB_INFO = null;
const dbCite = () => `Ritchie, Sandy (${DATA.edition.slice(0, 4)}). Language Technology Development Index (LTDI) database, edition ${DATA.edition}. https://langtechindex.org/#download`;
function downloadPage() {
  const ed = DATA.edition, csvFile = `data/ltdi-database-${ed}.zip`, sqlFile = `data/ltdi-database-${ed}-sqlite.zip`;
  const mb = b => b ? `${(b / 1e6).toFixed(1)} MB` : '';
  const fill = () => {
    if (!DB_INFO || curRoute() !== 'download') return;
    const rows = Object.fromEntries(DB_INFO.tables.map(t => [t.name, t]));
    for (const el of document.querySelectorAll('[data-db-rows]')) el.textContent = (rows[el.dataset.dbRows]?.rows ?? '').toLocaleString();
    for (const el of document.querySelectorAll('[data-db-size]')) el.textContent = mb(DB_INFO[el.dataset.dbSize]?.bytes);
    for (const el of document.querySelectorAll('[data-db-cols]')) {
      const t = rows[el.dataset.dbCols];
      el.innerHTML = t ? `<div class="tablebox"><table class="covtab dbcols"><thead><tr><th>Column</th><th>Type</th><th>Meaning</th></tr></thead><tbody>${t.columns.map(c => `<tr><td><span class="code">${esc(c.name)}</span></td><td class="muted">${esc(c.type)}</td><td>${esc(c.description)}</td></tr>`).join('')}</tbody></table></div>` : '';
    }
  };
  $('#view').innerHTML = `<article class="about dbpage">
    <h2>Download the database</h2>
    <p class="lede">Every data point the Index records, as plain tables for your own analysis or for finding data to build with: which products and open models support each language, what open data exists for it and where to get it, and the other facts on each language's page, each with its source and date.</p>
    <div class="dbfiles">
      <a class="dbfile" href="${csvFile}" download><span class="dbfmt">CSV</span><span><b>Tables as CSV files</b><br><span class="muted small">One file per table, with a README describing every column and a Data Package description · zip, <span data-db-size="csv"></span></span></span></a>
      <a class="dbfile" href="${sqlFile}" download><span class="dbfmt">SQL</span><span><b>One SQLite database</b><br><span class="muted small">The same tables, indexed, for SQL or any SQLite tool · zip, <span data-db-size="sqlite"></span></span></span></a>
    </div>
    <p class="muted small">Edition ${esc(ed)}, rebuilt with every edition. Licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, like the rest of the site's data. The Index's own scores aren't in it: they're in the <a href="#about">scores table on the About page</a>.</p>
    <h3>What's in it</h3>
    <div class="tablebox"><table class="covtab dbcols"><thead><tr><th>Table</th><th class="num">Rows</th><th>Each row</th></tr></thead><tbody>
      ${DB_TABLES.map(([t, d]) => `<tr><td><span class="code">${t}</span></td><td class="num" data-db-rows="${t}"></td><td>${d}</td></tr>`).join('')}
    </tbody></table></div>
    <p>Every table joins to <span class="code">languages</span> on the language's code, the same one in each language page's address. The columns of each table:</p>
    ${DB_TABLES.map(([t]) => `<details class="prov"><summary><span class="code">${t}</span></summary><div data-db-cols="${t}"></div></details>`).join('')}
    <h3>Getting the data itself</h3>
    <p>For each dataset and language, <span class="code">dataset_languages</span> says where to get it: <span class="code">repository</span> names where it's hosted (<span class="code">huggingface:google/fleurs</span>, <span class="code">commonvoice</span>, <span class="code">openslr</span>, <span class="code">mozilladatacollective</span>, or a website), <span class="code">subset</span> is what that repository calls the language (a Hugging Face config such as <span class="code">ha_ng</span>, a folder, a locale, or a download address), and <span class="code">access_url</span> is a page to start from. With the Hugging Face <span class="code">datasets</span> library, a repository and subset load as <span class="code">load_dataset("google/fleurs", "ha_ng")</span>. Some datasets ask you to accept their terms on their page first, and each keeps its own licence: check <span class="code">datasets.licence</span> and the dataset's own page before you use it. Datasets sold or shared under a data licence agreement are listed with <span class="code">access</span> set to <span class="code">licence</span> and aren't counted in the Index.</p>
    <p>For example, every openly licensed speech dataset for Hausa that permits commercial use, largest first:</p>
    <pre class="dbcode">SELECT d.name, dl.amount, dl.unit, d.licence, dl.repository, dl.subset
FROM dataset_languages dl JOIN datasets d ON d.id = dl.dataset
WHERE dl.language = 'ha' AND d.category = 'speech'
  AND d.counted AND d.commercial_use = 'yes'
ORDER BY dl.amount DESC;</pre>
    <p>Or, in Python with pandas, the languages with more than 100 hours of open speech and no speech recognition from a major company:</p>
    <pre class="dbcode">import pandas as pd
t = lambda n: pd.read_csv(f"ltdi-database-${esc(ed)}/{n}.csv")
langs, facts, svc, offers = t("languages"), t("language_facts"), t("services"), t("service_languages")
hours = facts[facts.indicator == "open_speech_hours"].set_index("language").value
major_asr = svc[(svc.technology == "speech_input") &amp; (svc.role == "consumer")].id
served = set(offers[offers.service.isin(major_asr) &amp; (offers.listing == "listed")].language)
print(langs[langs.code.map(hours).gt(100) &amp; ~langs.code.isin(served)][["code", "name", "speakers"]])</pre>
    <h3>Reading it carefully</h3>
    <ul>
      <li>A language with no row in <span class="code">service_languages</span> for a service isn't in that service's list. A language with no row in <span class="code">dataset_languages</span> for a dataset has none of it, or none the Index could find. Where a value wasn't collected for a language at all, <span class="code">not_collected</span> says so.</li>
      <li>Amounts are as each source states them or as the Index measured them, and <span class="code">how_counted</span> says which: <span class="code">measured</span> from every clip or document, <span class="code">sampled</span> from a sample and scaled up, <span class="code">published</span> by the dataset's makers, <span class="code">listing</span> read from a catalogue's text, or <span class="code">counted</span> from the source's own files.</li>
      <li>Datasets overlap: some are collections of others, and the same recordings can appear in more than one. The <span class="code">open_speech_hours</span> value in <span class="code">language_facts</span> is the Index's own total with known overlaps removed, so use it rather than summing a language's rows.</li>
      <li>A service's list counts what the company documents, not how well the service works. Where a list names only a country locale, the row is marked <span class="code">listed_as_standard</span> and counts for the standard language, not for the variety. Published quality figures are in <span class="code">result</span>, with who measured them and when.</li>
      <li>Values come from the sources named in each row, read on the date in <span class="code">retrieved</span>. Corrections are welcome: see <a href="#about">About</a>.</li>
    </ul>
    <h3>Cite</h3>
    <p class="cite">${esc(dbCite())}</p>
  </article>`;
  if (DB_INFO) fill();
  else fetch('data/database.json').then(r => r.ok ? r.json() : null).then(j => { if (j) { DB_INFO = j; fill(); } }).catch(() => {});
}
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
      <ul>${svcs.map(([name, prov, role, n, ent]) => `<li><span>${esc(name)}${prov && PROV_ALL[prov] && !name.includes(PROV_ALL[prov]) && prov !== 'open' ? ` <span class="muted">${esc(PROV_ALL[prov])}</span>` : ''}${ROLE[role] ? ` <span class="tag">${ROLE[role]}</span>` : ''}</span><b>${n.toLocaleString()}${ent > n ? ` <span class="muted" title="Entries in the company's own list, where several can be one language">of ${ent.toLocaleString()} entries</span>` : ''}</b></li>`).join('')}</ul></details></td>
    <td class="num">${any.toLocaleString()}</td><td class="covbar"><span style="width:${(any / N * 100).toFixed(2)}%"></span></td><td class="num pct">${pct(any)}</td></tr>`).join('');
  const nArea = (C.meta.find(m => /Area on the map/.test(m[0])) || [0, 0])[1];
  $('#view').innerHTML = `<article class="about">
    <h2>About the Index</h2>
    <p class="lede">The Language Technology Development Index tracks how well technology supports each of the world's languages, and how much data exists to build more. This edition, ${esc(DATA.edition)} (method version ${esc(DATA.config.meta.methodology_version)}), covers ${LANGS.length.toLocaleString()} living languages, each scored from 0 to 1 on two dimensions, data and technology, and placed in a tier.</p>
    <h3>What it's for</h3>
    <ul class="aims">
      <li><b>The whole picture.</b> Every language with a record, not only the hundred or so that technology companies and benchmarks usually report on, so the gap between the best- and least-served languages is visible.</li>
      <li><b>Gaps you can act on.</b> Which technologies, services and kinds of data a language lacks, one language at a time, with the Opportunities pages suggesting where builders, researchers and funders could make the most difference.</li>
      <li><b>Speakers, not just languages.</b> How many people each language reaches, where they live and how many are online, so the views can be weighed by people as well as by languages.</li>
      <li><b>Checkable.</b> Every value on a language's page links to its source, and the code and data are open on <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>.</li>
      <li><b>Change over time.</b> Where a source keeps a record, the Charts show how support has grown since 2019.</li>
    </ul>
    <h3>How a language is scored</h3>
    <p>Each dimension averages a few indicators, each scaled from 0 to 1 between a floor and a goal (most on a logarithmic scale, so the first thousand sentences count for more than the millionth). The two are combined with a geometric mean, LTDI = √(data × technology), as in the UN's Human Development Index, so a gap in either pulls the score down: a language with excellent data but no keyboard can't score highly. A technology scores by the share of the services checked that offer the language, weighted by how fully each does (features, voice types, published error rates), with open models counting for less than commercial services. Locale data (CLDR's dates, numbers and names, which software needs before it can support a language) counts as a technology; voice assistants count half as much as other technologies, since an assistant is built mostly from speech-to-text, text-to-speech and language models, which are already counted. Whether a language's script is encoded in Unicode is reported but not scored, as nearly every recorded script is.</p>
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
    ${table(techRows, 'Technology')}

    <h3>The Plan tab's columns</h3>
    <p>Online in 5 years is the number of a language's speakers expected to be online in five years (for text technologies, online and able to text), with their share of its speakers. Countries are ISO 3166 codes, most speakers first, leaving out countries where only immigrant communities speak it, so the code, script and a country give a locale (pnb-Arab-PK).</p>
    <p>Open models are those listed for the language; † marks a licence that doesn't permit commercial use, and the commercial-use switch leaves them out. Their makers publish quality figures, each on their own test data, which say too little to compare languages by, so they aren't shown.</p>
    <p>Speech is counted in hours of transcribed speech in the open datasets tracked, in three kinds. Read: Common Voice, Kathbath, NaijaVoices, Multilingual LibriSpeech, NCHLT Speech, and read speech shared on the Mozilla Data Collective (BibleTTS, Digital Divide Data and others). Spontaneous, people speaking in their own words: Common Voice Spontaneous Speech, WAXAL, AfriVoice, WaZoBiaSpeech, IndicVoices, SPRING-INX, Vaani. Media: Shrutilipi's radio news, VoxPopuli's European Parliament speeches, and YouTube videos with their uploaders' subtitles in YODAS2, counted by the share of a sample of subtitles that is in the language. Total hours adds the three. A tick under FLEURS test set means the language is one of the 102 in FLEURS, Google's public test set of about 12 hours of read speech a language; it stays out of training, so it doesn't count towards the data target.</p>
    <p>Sentence pairs with English are those in OPUS, plus those professionally translated for Google's SMOL and GATITOS. Words of web text are those in FineWeb-2, or MADLAD-400 or HPLT 3.0 where one holds more. Short of the target is how many more are needed to reach the data target chosen. With the commercial-use switch on, only speech datasets whose licence permits commercial use are counted; OPUS corpora carry their own licences, which aren't checked.</p>
    <p>The CSV adds each language's readiness and the commercial services that offer it.</p>
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
      <li>Web-crawled text for underrepresented languages is often not in the language at all (Kreutzer et al., 2022). FineWeb-2 filters by language identification, MADLAD-400's authors checked a sample of every language by hand, and HPLT 3.0's language labels aren't audited, so the Index checks a sample of each of its languages with GlotLID and counts only the share in the language (it counts whichever of the three holds most for a language, never more than one); text mostly from Bible sites counts for less; OPUS's web-mined corpora are checked by language identification on a random sample, which catches the wrong language but not poor translations, so OPUS counts are an upper bound. Google's SMOL and GATITOS, translated by professionals for languages with little else, count in full.</li>
      <li>Wikipedia article counts include bot-generated stubs, so articles count only up to a limit per active editor. Hugging Face datasets are counted by their language tags, and datasets tagged with dozens of languages count in part.</li>
      <li>Open speech hours add up datasets of very different kinds: read speech, crowd-sourced recordings and video with uploaded subtitles. An hour of one person reading the Bible in a studio counts the same as an hour of many people talking about their day. Each language's page lists where its hours come from, under Sources, dates and notes, and how each figure was obtained: measured from the audio, as the makers publish it, or read from a listing. Only transcripts made or corrected by people count: hours transcribed by a model (GigaSpeech 2, WenetSpeech, YouTube's automatic captions, model-labelled sets) are left out. Datasets shared on the Mozilla Data Collective count with the hours each states, and only where they're free to download under an open or non-commercial licence; those sold for a fee or under a data licence agreement are listed on each language's page but not counted, as are corpora sold by other distributors, such as the Linguistic Data Consortium and ACLCLP.</li>
      <li>Font support is checked but not scored: Noto displays nearly every language whose letters are known.</li>
    </ul>
    <h4>Technology</h4>
    <ul>
      <li>Coverage is read from each company's published language lists, which can lag behind or run ahead of what a product actually does, and "supported" means different things to different vendors. A few lists are read by hand where no page could be read automatically.</li>
      <li>Quality is published for few languages. Only results measured independently of the service's maker, in the last ${numWord(DATA.config.dimensions.tech.quality_max_age)} years, change scores: a weak result counts for less, down to half. Elsewhere a listed service counts in full, however well it works. Companies' own figures and older results are shown on language pages but not scored. So for most services and languages the Index records whether a language is offered, not how well it works.</li>
      <li>LLM support means the languages each company documents for its chat app (ChatGPT, Gemini, Copilot), from its official list. A model may also work, unevenly, in languages its list doesn't name; the Index counts what each company commits to, which it can check the same way for every company.</li>
      <li>Regional providers count together as one extra service, and only for the languages they offer.</li>
      <li>Voice assistants count each company's assistant across its old and new generations: Google Assistant or Gemini for Home on speakers and displays, Siri, and Alexa or Alexa+. Gemini for Home and Alexa+ are in early access and so far cover only languages the older assistants already had. Amazon publishes no language list for Alexa+, so its languages are the ones Amazon's launch announcements name, or a country's main language where they name only the country. The row counts half as much as other technologies.</li>
      <li>LLM quality that changes scores comes from AfroBench's independent translation results for GPT-4o and Gemini 1.5 Pro (2025), each for one model at one time, so newer models may do better. Companies' own results, such as Claude Fable 5.2 on Global-MMLU (2026) and OpenAI o3 on MMMLU (2025), are shown but not scored.</li>
      <li>Speech services name varieties by country (ar-EG), so a speech locale counts for a spoken variety only where the service names the variety too ("Egyptian Arabic"); otherwise it counts for the standard language, as text services do, and the variety's page marks the service "listed as" the standard language.</li>
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
    <ul><li>Opportunities are gaps in the sources tracked here, ranked by the impact on the community if the technology existed: how many people could use it, how big the gap is and the technology's weight in the index. Each also has an effort size, S to XL, from the open models, data and test sets available for the language. The sizes are rough guides, not estimates, and a gap may already be filled by something no source here records.</li>
      <li>The Plan tab ranks the languages a product doesn't yet support by the people they'd reach online in five years. That's an estimate from LinguaMeta's speaker counts and national connectivity averages, so it favours large languages and overstates reach in rural areas; it says nothing about demand, cost or competition. "Commercially usable" follows each dataset's and model's published licence, and isn't legal advice.</li>
      <li>Each kind of opportunity is suggested only where its first step is possible: text technologies and benchmarks need some written text, a Wikipedia card needs a Wikipedia. A language with nothing recorded gets a single card about documentation and first recordings with its speakers. Before a language is chosen, the list shows at most two cards per language.</li></ul>

    ${stabilitySection()}
    ${validationSection()}
    ${inclusionSection()}
    <h3>Independence and accuracy</h3>
    <p>${INDEPENDENCE} It's offered as a way to explore the current state of technology and data for the world's languages, not as an authoritative record. There are very likely mistakes and omissions: it brings together only what could be found in open repositories and public documentation, and much work on many languages isn't published in either. For more detail on any language, follow the links to the source material on its page, or do your own research.</p>
    <h3>Corrections and feedback</h3>
    <p>If you spot a mistake, work on a product whose row is out of date, or know of a source we've missed, please email <span class="email">${CORRECTIONS_EMAIL}</span>, or, if you'd rather it be public, <a href="${REPO_URL}/issues/new/choose" target="_blank" rel="noopener">open an issue on GitHub</a> using the correction or new-source form. A link to the page that documents the change is the quickest way to get it fixed; corrections go into the next build with the source cited. Companies whose products are tracked will find how their numbers are made on the <a href="#providers">For providers</a> page. For anything else, email <span class="email">${SUPPORT_EMAIL}</span>.</p>
    ${PATHS && window.goatcounter ? `<h3>Privacy</h3>
    <p>The site counts visits with <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a>, which sets no cookies and records no personal information: only which page was opened, the referring site, and the browser, screen size and country in general terms. Nothing else is collected.</p>` : ''}

    <h3>Download and cite</h3>
    <p><b><a href="#download">Download the whole database</a></b>: every recorded value, with its source, and where to get each dataset, as CSV files or one SQLite file.</p>
    <p>The scores for this edition are a <a href="data/ltdi-${DATA.edition}.csv" target="_blank" rel="noopener">CSV file</a>: one row per language, with its rank, tier, both dimensions before and after the floor, each technology's score, and, for spoken varieties, the score through their written standard (<a href="data/ltdi-${DATA.edition}.json" target="_blank" rel="noopener">column descriptions and the method's hashes</a>). A second <a href="data/ltdi-${DATA.edition}-services.csv" target="_blank" rel="noopener">services table</a> gives, for every language, what each service and benchmark tracked records: 1 where it's offered, 0 where it isn't, or the measured result. Every value with its source, date and note is in the repository's <a href="${REPO_URL}/tree/main/data/records" target="_blank" rel="noopener">data/records</a> folder, and every edition in <a href="${REPO_URL}/tree/main/data/editions" target="_blank" rel="noopener">data/editions</a>, so editions can be compared. The data is licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> and the code MIT.</p>
    <p class="cite">${esc(citeText())}</p>
    <h3>Data for your own tools</h3>
    <p>Each language is also a JSON file at a stable address, such as <span class="code">https://langtechindex.org/api/v1/languages/yo.json</span>, with its scores, the technologies and services that cover it, every recorded value with its source, its countries and locales, family, engineering flags and opportunities. <span class="code">api/v1/index.json</span> lists every language, and <span class="code">api/v1/schema.json</span> describes the files. Within version 1, fields are only added, never renamed or removed; values change with each edition, and a change of method raises the methodology version. Anything that would break a reader goes to version 2, with version 1 kept beside it for at least one edition.</p>
    <h3>Sources and credits</h3>
    <p>Language metadata from LinguaMeta, with scripts from <a href="https://github.com/WPoelman/qwanqwa" target="_blank" rel="noopener">QQ</a> (CC BY-SA 4.0, so data derived from it carries the same licence), endangerment from Glottolog where LinguaMeta gives none, and speaker counts from Wikipedia where neither does. Census figures from the UN Statistics Division, the US Census Bureau and national statistics offices; connectivity from the World Bank. Language areas from <a href="https://glottography.github.io" target="_blank" rel="noopener">Glottography</a> (CC BY 4.0); map from Natural Earth. Writing samples from <a href="https://github.com/eric-muller/udhr" target="_blank" rel="noopener">UDHR in XML</a>; spoken words from <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a>, recorded by volunteers and shared on Wikimedia Commons under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Every other value names its source on the language's page. The method builds on van Esch, Ritchie et al. (2024), <a href="https://aclanthology.org/2024.lrec-main.331/" target="_blank" rel="noopener">Connecting Language Technologies with Rich, Diverse Data Sources Covering Thousands of Languages</a>.</p>
  </article>`;
}

