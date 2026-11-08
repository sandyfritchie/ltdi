"""Build the static site: embed data/scores.json into site/template.html.

Run:  python -m ltdi.build_site
Writes site/index.html (no server needed; open it directly or serve with GitHub Pages).
"""

from __future__ import annotations

from . import DATA, ROOT


def main() -> None:
    template = (ROOT / "site" / "template.html").read_text(encoding="utf-8")
    data = (DATA / "scores.json").read_text(encoding="utf-8").replace("</", "<\\/")
    page = template.replace("/*__DATA__*/", data)
    if (DATA / "basemap.json").exists() and (DATA / "world_languages.json").exists():
        geo = '{"basemap":' + (DATA / "basemap.json").read_text(encoding="utf-8") + ',"points":' + \
              (DATA / "world_languages.json").read_text(encoding="utf-8") + '}'
        page = page.replace("/*__MAP__*/", geo.replace("</", "<\\/"))
    else:
        page = page.replace("/*__MAP__*/", "null")
    # The template is written as an artifact body; wrap it as a full document for standalone use.
    head, _, body = page.partition('<div class="wrap">')
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '</head>\n<body>\n<div class="wrap">' + body + "\n</body>\n</html>\n"
    )
    (ROOT / "site" / "index.html").write_text(html, encoding="utf-8")
    (DATA.parent / "site" / "artifact.html").write_text(page, encoding="utf-8")
    print("wrote site/index.html")


if __name__ == "__main__":
    main()
