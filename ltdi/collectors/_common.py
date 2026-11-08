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


def git_files(url: str, pattern: str) -> dict[str, str]:
    """Text of every file in a GitHub repo matching a gitignore-style pattern (e.g. "/release/**/*.kps"),
    fetched in one batch with a sparse checkout."""
    import subprocess

    from .. import CACHE

    repo = CACHE / ("files-" + url.rstrip("/").split("/", 3)[-1].replace("/", "-"))
    if not repo.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", url, str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "sparse-checkout", "set", "--no-cone", pattern], check=True)
    return {str(p.relative_to(repo)): p.read_text(encoding="utf-8", errors="replace")
            for p in repo.rglob("*") if p.is_file() and ".git" not in p.parts}
