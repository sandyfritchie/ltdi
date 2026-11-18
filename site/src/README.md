# The page's source

`python -m ltdi.build_site` assembles these into the site: `page.html` with each `<!--#include …-->`
line replaced by that file, then the data filled in. The result is the preview (`site/artifact.html`,
everything inline) and the public site's `index.html`, `app.css` and `app.js`.

| File | What it holds |
|---|---|
| `page.html` | The page's head, the header and tabs, and where the styles and script go |
| `styles.css` | All the styles, with the colour tokens for light and dark at the top |
| `js/core.js` | Data loading and decoding, addresses, the language pickers, number formats, filters |
| `js/opportunities.js` | The Opportunities tab and each opportunity's detail |
| `js/ranking.js` | The ranking table, its filters and summary |
| `js/language.js` | A language's page, and Compare |
| `js/charts-map.js` | Tooltips, the provider picker, the map (and each language's mini map), the Charts tab and the Map tab |
| `js/about.js` | The About tab |
| `js/plan-shortlist.js` | The Plan tab and the shortlist |
| `js/routing.js` | The not-found page, visit counting, and which view each address opens |

The sections run in this order as one script, so a section can use what an earlier one defines at load.
