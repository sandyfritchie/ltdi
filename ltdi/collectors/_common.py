from __future__ import annotations

import json

from .. import DATA


def ltdi_codes() -> list[str]:
    return [l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))]


def git_tree(url: str, path: str = "", dirs: bool = False) -> list[str]:
    """Names in one folder of a GitHub repo, read with git (no API, no file contents downloaded)."""
    import subprocess

    from .. import CACHE

    repo = CACHE / ("git-" + url.rstrip("/").split("/", 3)[-1].replace("/", "-"))
    if not repo.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", url, str(repo)],
                       check=True)
    args = ["git", "-C", str(repo), "ls-tree", "--name-only", *(["-d"] if dirs else []), "HEAD",
            path.rstrip("/") + "/" if path else ""]
    out = subprocess.run([a for a in args if a], capture_output=True, text=True, check=True).stdout
    return [line.rsplit("/", 1)[-1] for line in out.split("\n") if line]
