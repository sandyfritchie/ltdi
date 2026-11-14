# What changed

One entry per edition: method changes (a new `methodology_version`) and the data changes that moved
scores most. `python tools/edition_diff.py <previous edition's commit>` separates the two, by scoring
the previous edition's records with the new method; its largest moves are the starting point for each
entry.

## 2026-11 (methodology 2.0)

The first published edition. Against the pre-release method reviewed on 13 November 2026 (commit
5d79055):

- **Two dimensions.** LTDI = √(data × technology). The writing dimension, which was 0.5 for 92% of
  languages, is gone: CLDR locale data counts as a half-weight technology, and whether a script is in
  Unicode is reported, not scored.
- **Spoken varieties scored on their own resources.** Varieties whose speakers write a standard
  language (Kölsch and German, Egyptian Arabic and Standard Arabic) are ranked on what exists for
  them alone, with a second score through the standard beside it. Dari and Southern Pashto, whose
  written form is the standard itself, keep the standard's written resources as their own.
- **Ranks and tiers.** Tied languages share a rank, and ties at the floor are broken by the unfloored
  scores. Below Medium, tiers are stages by what exists: Commercial, Open only, Data only, None
  recorded.
- **LLMs.** Availability in the official app language lists times a quality factor from published
  benchmarks; strong results count in full, so being benchmarked never lowers a score.
- **Voice assistants** count at half weight.
- **Data.** OpenAI's MMMLU results for German, Italian and Korean, previously dropped by a parser bug;
  Universal Dependencies read at its 2.19 release tag (28 more languages' treebanks).
