"""Language families from Glottolog's classification, for related-language suggestions and the
planner's family filter.

Each language gets the path of groups above it, family first (Glottolog's classification of its
glottocode). Macrolanguages scored as one language (Arabic, Swahili, Persian) have no glottocode of
their own here, so they take the groups their member languages share. Languages Glottolog treats as
isolates have no relatives. Glottolog's non-genealogical groupings (sign languages, pidgins, artificial
and unattested languages, bookkeeping entries) aren't families, so languages in them get no path."""

from __future__ import annotations

from .glottolog import classification, names

NOT_FAMILIES = {"Bookkeeping", "Unattested", "Unclassifiable", "Sign Language", "Artificial Language", "Pidgin",
                "Mixed Language", "Speech Register"}


def _common(paths: list[list[str]]) -> list[str]:
    out = []
    for level in zip(*paths):
        if len(set(level)) > 1:
            break
        out.append(level[0])
    return out


def paths(languages: list[dict]) -> tuple[dict[str, list[str]], set[str]]:
    """({code: [glottocode of family, ..., of parent]}, {codes of isolates})"""
    cls, nm = classification(), names()
    by_iso = {}
    for l in languages:  # members are listed by ISO code; find their glottocodes through LinguaMeta's records
        if l.get("iso_639_3"):
            by_iso[l["iso_639_3"]] = l.get("glottocode")
    from .backbone import records
    member_gc = {c: d.get("glottocode") for c, d in records().items()}
    out, isolates = {}, set()
    for l in languages:
        gc = l.get("glottocode")
        if gc and gc in cls:
            p = cls[gc]
        elif gc and gc in nm:
            isolates.add(l["code"])
            continue
        else:
            ms = [member_gc.get(m) or by_iso.get(m) for m in l.get("members") or []]
            ms = [cls[g] + [g] for g in ms if g and g in cls]
            p = _common(ms) if ms else []
        if p and nm.get(p[0]) not in NOT_FAMILIES:
            out[l["code"]] = p
    return out, isolates
