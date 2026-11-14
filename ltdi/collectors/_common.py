from __future__ import annotations

import json

from .. import DATA


def ltdi_codes() -> list[str]:
    return [l["code"] for l in json.loads((DATA / "languages.json").read_text(encoding="utf-8"))]


def _git_repo(url: str, name: str, commit: str, sparse: str | None = None):
    """A blobless clone of `url` at `commit` in the cache (fetched once), noted for the run's manifest
    and retrieval dates (ltdi.http.note)."""
    import datetime as dt
    import subprocess

    from .. import CACHE
    from ..http import note

    repo = CACHE / name
    git = ["git", "-c", "gc.auto=0", "-C", str(repo)]
    fetched = None  # the day this commit's objects were downloaded: today if now, else the clone's day
    if not repo.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--no-checkout", *(["--sparse"] if sparse else []),
                        url, str(repo)], check=True)
    if subprocess.run([*git, "cat-file", "-e", f"{commit}^{{commit}}"], capture_output=True).returncode:
        subprocess.run([*git, "fetch", "-q", "--filter=blob:none", "origin", commit], check=True)
        fetched = dt.date.today().isoformat()
    if sparse:
        subprocess.run([*git, "sparse-checkout", "set", "--no-cone", sparse], check=True)
        subprocess.run([*git, "checkout", "-q", commit], check=True)
    day = fetched or dt.date.fromtimestamp((repo / ".git" / "description").stat().st_mtime).isoformat()
    note(f"{url}@{commit}", commit, day)
    return repo, git


def git_tree(url: str, commit: str, path: str = "", dirs: bool = False) -> list[str]:
    """Names in one folder of a GitHub repo at a pinned commit, read with git (no file contents downloaded)."""
    import subprocess

    repo, git = _git_repo(url, "git-" + url.rstrip("/").split("/", 3)[-1].replace("/", "-"), commit)
    args = [*git, "ls-tree", "--name-only", *(["-d"] if dirs else []), commit, path.rstrip("/") + "/" if path else ""]
    out = subprocess.run([a for a in args if a], capture_output=True, text=True, check=True).stdout
    return [line.rsplit("/", 1)[-1] for line in out.split("\n") if line]


def git_files(url: str, pattern: str, commit: str) -> dict[str, str]:
    """Text of every file in a GitHub repo at a pinned commit matching a gitignore-style pattern (e.g.
    "/release/**/*.kps"), fetched in one batch with a sparse checkout."""
    repo, _ = _git_repo(url, "files-" + url.rstrip("/").split("/", 3)[-1].replace("/", "-"), commit, pattern)
    return {str(p.relative_to(repo)): p.read_text(encoding="utf-8", errors="replace")
            for p in repo.rglob("*") if p.is_file() and ".git" not in p.parts}


def presence(indicator: str, have: set[str], source: str, url: str, notes: dict[str, str] | None = None) -> list:
    """One yes/no record per LTDI language: 1 if the source lists it (write_records folds the zeros)."""
    from ..records import Record
    return [Record(c, indicator, int(c in have), "bool", source, url, note=(notes or {}).get(c, "")) for c in ltdi_codes()]
