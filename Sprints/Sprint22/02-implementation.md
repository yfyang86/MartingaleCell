# Sprint 22 — Implementation notes

## AZ. Run history in the transcript

`runLabels(cells)` in `src/session/lineage.ts` gives every cell its
`{ k, total, firstN }` in one pass (`runIndexAll` is now a wrapper).
`buildMarkdownTranscript` and `buildLispTranscript` compute the labels
once and append ` · run k/N of cell m` to the heading (Markdown) or the
cell comment (`.lisp`) of any cell whose N is two or more; a lone cell's
heading is unchanged, so every existing transcript still parses.

`parseMarkdownTranscript` recognises the tail part and sets
`ImportedCell.runOf` to m. `appendImportedCells` re-links on import:
the imported cell numbered m becomes the lineage root of the group;
when m is not in the transcript (a partial export), the first imported
run of that group stands in as the root. The runs of an imported
session therefore show their chips and open the history view like
runs made in the session.

## BA. Diff two runs' inputs

`src/session/diff.ts` — `diffLines(a, b)`: a line-level LCS diff (a
quadratic table; inputs are cell-sized), emitting `same` / `del` / `add`
lines with deletions before insertions at the same spot, and
`diffSummary` for counts. In the history view, the input row of a run
whose input changed shows the diff against the previous run instead of
the whole text — `-` lines struck through in red, `+` lines in green,
unchanged dimmed — and the "changed" tag names the run it is compared
with.

## BC. CI on `dev`: keep the merge-commit run

`cancel-in-progress` is now the expression
`github.event_name == 'pull_request'`: superseded runs are cancelled on
a pull request, never on `dev`. The push trigger ignores `Sprints/**`,
so the record-CI docs commit after a merge starts no run. The merge
commit keeps a completed run of both jobs (the smoke included).

## AX. Fold by kind

`foldRangeForLine` also folds a `#| … |#` block comment that opens on
the line and closes on a later one, from the end of the first line to
just before `|#` (the classifier already marks block comments, so the
scan finds the run of comment characters). `topLevelFoldRanges(src)`
returns the fold of every multi-line top-level form, and
`foldTopLevelForms(view)` dispatches those not already folded — the
palette's "Fold all top-level forms": one line per defun, bodies keep
their own folds.

## Tests

- `scripts/transcript-test.mjs` +3 (41): run labels in both exports, a
  lone cell without one, `runOf` back from the Markdown.
- `scripts/lineage-test.mjs` +7 (23): `runLabels`, and the diff —
  changed line, identical inputs, removed middle line, lines added
  around, empty sides, summary.
- `scripts/fold-test.mjs` +5 (23): block-comment range, its inner lines
  and one-line cases, top-level ranges, the unbalanced stop.
- Browser smoke: `history` +3 (a changed-input run shows one `-` and one
  `+` line; the export labels the four runs; importing it re-links them
  with chips 1/4 … 4/4 and a four-column view); `persistence` +1 (the
  palette fold command). 52 checks in 8 scenarios.

## Docs and README

Session cells: the run-history card covers the diff and the transcript
labels. Editor section: the palette folds. README: the CI paragraph
(docs-only pushes, cancellation on PRs only).
