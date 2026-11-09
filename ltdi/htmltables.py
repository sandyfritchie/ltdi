"""Tables and text out of HTML pages, with only the standard library."""

from __future__ import annotations

import re
from html.parser import HTMLParser


class _Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self._stack, self._cell, self._row, self._heading = [], [], None, None, ""
        self._in_heading = False

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._stack.append({"heading": self._heading.strip(), "id": dict(attrs).get("id", ""), "rows": []})
        elif tag == "tr" and self._stack:
            self._row = []
        elif tag in ("td", "th") and self._stack:
            self._cell = []
        elif tag in ("h1", "h2", "h3", "h4"):
            self._in_heading, self._heading = True, ""
        elif tag == "br" and self._cell is not None:
            self._cell.append("\n")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(re.sub(r"[ \t\r\f\v]+", " ", "".join(self._cell)).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None and self._stack:
            if self._row:
                self._stack[-1]["rows"].append(self._row)
            self._row = None
        elif tag == "table" and self._stack:
            self.tables.append(self._stack.pop())
        elif tag in ("h1", "h2", "h3", "h4"):
            self._in_heading = False

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)
        if self._in_heading:
            self._heading += data


def tables(html: str) -> list[dict]:
    """Every table as {"heading": nearest heading before it, "id", "rows": [[cell text]]}."""
    p = _Tables()
    p.feed(html)
    return p.tables


def text(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|li|div|tr|h\d|td|th)>", "\n", html)
    from html import unescape
    return re.sub(r"[ \t]+", " ", unescape(re.sub(r"<[^>]+>", " ", html)))
