# Test rounds

A round of tests is partial progress **inside** the session: the user runs the
cases at their own pace and reports back, and each report moves the block.

When handing over a test script, put the time estimate in the file itself, not
only in the reply: one line per step or case, the total if everything passes
first time, the total with one round of fixes (change, rebuild, re-run the
affected cases), and what is not counted (waiting on third parties, steps run
on another machine, environment start-up).

**The Validation percentage is weighted by the estimated time of each step**, not by
counting cases: ten minutes of confirmation queries and twenty minutes of the
heaviest case are not worth the same. With no per-step estimate, use validated
cases / planned cases.

What counts as done:

- a case that passed **and is confirmed** (result seen, query run, log read):
  done;
- a case that passed but is still waiting for confirmation: in progress, not
  done;
- a case that failed and needs a code change: **not done**, and the time left
  now includes the change, the rebuild and re-running the cases that depend on
  it. The percentage can go down, and should;
- a case that turned out to be badly written in the script, not a defect: fix
  the script, count it as done, and say so in half a line before the block.
