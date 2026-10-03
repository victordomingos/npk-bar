---
name: progress-estimates
description: Short progress-estimate block (percentage done and time left) for the validation in progress, the session and the project. Use at the end of each significant iteration (after reading the initial prompt and the history or status files, after implementing features the user must test or review, after preparing a commit), on every report of test results, or when asked how much is left, where things stand or for an estimate of completion.
---

# Progress estimates

At the end of a significant iteration, close the reply with this block. Write
nothing before it to announce it, and nothing after it to justify it.

## Format

```
**Validation:** `████████████░░░░░░░░` 60% · ~1h
**Session:**    `████████░░░░░░░░░░░░` 40% · ~3h
**Project:**    `██████████████░░░░░░` 72% · ~45h
```

- The bar is **always 20 blocks**: `█` for the part done (the percentage divided
  by 5, rounded) and `░` for the rest. It goes between backticks, so it renders
  in a fixed width, and the labels are aligned with spaces.
- Above 0% it has at least one `█`; below 100%, at least one `░`. A bar never
  reads as full because of rounding.
- The percentage is what is already done; the time is what is **left**, not
  what was spent.
- The Validation line appears only while there are tests or checks pending on
  the user's side.
- One line per item: no comments, no hypotheses, no caveats.
- Round times: `~1h`, `~3h`, `~40h`. Under an hour: `~30min`.
- Write the labels in the language of the conversation; keep the shape of the
  line (`**Label:**`, the bar in backticks, `NN%`, `·`, the time left), which
  tools such as the npk-bar mod read.

## When to emit

- After analysing the initial prompt and reading the status or history files.
- After implementing a set of features the user has to test or review.
- After preparing a commit.
- Whenever the user asks where things stand.
- **On every report of results from a round of tests in progress**, even when
  the reply is short and there is no new code: progress changed, and that is
  what the block shows.

Do not repeat the block in intermediate replies (a question, a file read, a
build run), or twice in a row with no work in between. A report of test results
is not an intermediate reply.

## How to estimate

1. **Project:** count by the phases of the project's status or plan document,
   if there is one (phases done / total phases, weighted by size). Without a
   document, estimate from the scope agreed with the user.
2. **Session:** estimate against what was agreed for this session, not the
   project.
3. **Validation:** see "Test rounds" below.

Estimate honestly: work still waiting for confirmation by tests is not done,
and a percentage that only ever goes up carries no information. Lowering a
value from the previous iteration is legitimate when unplanned work turns up;
say so in half a line before the block, if that is the case.

## Test rounds

While the user runs a round of tests, the Validation line is weighted by the
estimated time of each step, and only confirmed passes count as done; a
failure that needs a code change lowers it. Read `references/test-rounds.md`
before handing over a test script or reporting on a round.
