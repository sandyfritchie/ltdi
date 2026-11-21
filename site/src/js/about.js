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
      <li>Web-crawled text for underrepresented languages is often not in the language at all (Kreutzer et al., 2022). FineWeb-2 filters by language identification; text mostly from Bible sites counts for less; OPUS's web-mined corpora are checked by language identification on a random sample, which catches the wrong language but not poor translations, so OPUS counts are an upper bound.</li>
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

