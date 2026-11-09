"""Configuration: config/methodology.toml (weights, goalposts) plus config/services.csv
(which services count for each technology, with their names, providers and depth)."""

from __future__ import annotations

import csv
import tomllib
from functools import lru_cache

from . import CONFIG


@lru_cache
def services() -> tuple[dict, ...]:
    with (CONFIG / "services.csv").open(encoding="utf-8") as f:
        return tuple(csv.DictReader(f))


def services() -> list[dict]:
    with (CONFIG / "services.csv").open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_config() -> dict:
    """methodology.toml, with each technology's services filled in from services.csv:
    consumer, open and measured lists, depth specs, and which service each depth describes."""
    with (CONFIG / "methodology.toml").open("rb") as f:
        cfg = tomllib.load(f)
    techs = cfg["dimensions"]["tech"]["technologies"]
    for t in techs.values():
        t.update(consumer=[], open=[], depth={}, depth_owner={})
    num = lambda x: float(x) if "." in x else int(x)
    for sv in services():
        t = techs[sv["technology"]]
        if sv["role"] == "measured":
            t.setdefault("measured", {})[sv["id"]] = {"min": num(sv["depth_min"]), "max": num(sv["depth_max"])}
        else:
            t[sv["role"]].append(sv["id"])
        if sv["depth"]:
            spec = num(sv["depth_max"]) if not sv["depth_min"] else {"min": num(sv["depth_min"]), "max": num(sv["depth_max"])}
            t["depth"][sv["depth"]] = spec
            t["depth_owner"][sv["depth"]] = sv["id"] if sv["depth_scope"] == "service" else None
    for t in techs.values():
        if not t["depth"]:
            del t["depth"]
    return cfg


