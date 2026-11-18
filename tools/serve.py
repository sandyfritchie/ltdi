"""Serve site/ the way GitHub Pages does, for trying the site locally and for the browser tests:
/language/yo serves language/yo.html, and an unknown address gets 404.html with a 404 status.

    python tools/serve.py [port]      # then open http://localhost:8765/"""

import http.server
import os
import sys
from pathlib import Path

ROOT = str(Path(__file__).resolve().parent.parent / "site")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        path = self.path.split("?")[0].split("#")[0]
        local = os.path.join(ROOT, path.lstrip("/"))
        if not os.path.exists(local) and os.path.exists(local.rstrip("/") + ".html"):
            self.path = path.rstrip("/") + ".html"
        elif not os.path.exists(local):
            body = Path(ROOT, "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        return super().send_head()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"serving site/ at http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
