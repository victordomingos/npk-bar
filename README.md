# Context Bar for Claude Code
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-D97757) ![Desktop and terminal](https://img.shields.io/badge/runs%20in-desktop%20%C2%B7%20terminal-555) ![No API calls](https://img.shields.io/badge/API%20calls-none-2a78d6)

A Claude Code mod that keeps an eye on the things you would otherwise check by
hand: how full the context window is and what is filling it, how much of your
session (5-hour) and weekly limits you have used, and how far along the
current work is.

It draws above the prompt, refreshes by itself at the end of every turn, and
costs nothing: no API calls, and nothing is added to the model's context.

![context-bar gauges in the Claude desktop app](context-bar/docs/gauges-wide.png)

- **Context**: one ring split by the biggest `/context` categories, the rest
  merged as *Other*, with the token total.
- **Session and Week**: how much of each limit is used and when it resets. The
  tick marks where an even pace would put you; the arc is green under that
  pace, then yellow, orange and red the further over it you go.
- **Warnings**: the inside of the Context, Session and Week rings turns yellow
  from 50%, orange from 75%, red from 90%, and pulses from 93%.
- **Estimates** (optional): progress of the tests in flight, the session and
  the project, with the time left against the implied total.

On a narrow window the labels move under the rings and the gauges wrap:

![context-bar gauges on a narrow window](context-bar/docs/gauges-narrow.png)

In a terminal, which cannot draw images, it shows the same figures as text:

![context-bar in an 80-column terminal](context-bar/docs/terminal-80-columns.png)


## Installation and dependencies:

You need a recent Claude Code (mods are a newer feature: update first if in
doubt), in the terminal or in the Code tab of the Claude desktop app. Nothing
else: no API key, no packages to install.

Clone this repository once per machine and link the mod into your personal
skills folder, where Claude Code loads it from:

```
git clone https://github.com/victordomingos/claude-mods.git ~/dev/claude-mods
ln -s ~/dev/claude-mods/context-bar ~/.claude/skills/context-bar
```

On Windows (PowerShell):

```
git clone https://github.com/victordomingos/claude-mods.git "$env:USERPROFILE\dev\claude-mods"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\context-bar" -Target "$env:USERPROFILE\dev\claude-mods\context-bar"
```

Check that it is in place:

```
claude plugin validate ~/.claude/skills/context-bar
```

It should end with `Validation passed` (warnings about `types` and `author`
are expected).

To update later, `git pull` in the clone: an open session reloads the mod by
itself. To uninstall, delete the `~/.claude/skills/context-bar` link.


## How to use

Start a **new** Claude Code session: one that was already open does not pick
up a newly installed mod. To keep a conversation, restart and resume it
(`/exit`, then `claude --continue`; in the desktop app, quit and reopen it).

Then turn it on once:

```
/context-bar
```

The choice is remembered on that machine. Until you pick a layout, it is
`gauges` in the desktop app and `compact` in a terminal.

**Note:  
The limit figures come from Claude Code itself and only exist on a Pro or Max
subscription; with an API key the Session and Week gauges are not shown. They
appear after the first reply of a session, then stay up to date.**


## Basic usage

Turn the bar on or off:

```
/context-bar
```

Pick a layout (this also turns it on):

```
/context-bar gauges
```

```
/context-bar compact
```

```
/context-bar full
```

| Layout | What it shows |
|---|---|
| `gauges` | The ring gauges above (desktop app; a terminal shows `compact` instead) |
| `compact` | A short bar with `% used tokens/window`, then the limits and the estimates |
| `full` | A full-width bar, the top categories, and a 20-block bar per limit and per estimate |


## Progress estimates (optional)

The estimate gauges read a short block at the end of Claude's replies, in any
language, one line per item:

```
**Tests in progress:** `████████████░░░░░░░░` 60% · ~1h
**Session:**           `████████░░░░░░░░░░░░` 40% · ~3h
**Project:**           `██████████████░░░░░░` 72% · ~45h
```

The context and limit gauges need nothing else. To get estimates too, ask
Claude for them, or add this to your `CLAUDE.md` (a project's, or
`~/.claude/CLAUDE.md` for all of them):

```markdown
At the end of each significant iteration, end the reply with a progress block,
one line per item, exactly in this shape (20-block bar, % done, time left):
**Session:** `████████░░░░░░░░░░░░` 40% · ~3h
Use the lines "Tests in progress" (only while tests are pending), "Session"
and "Project".
```

A reloaded session finds the latest block in the conversation by itself.


## Getting help

To see what the mod sees right now (limits reported, shown and saved,
estimates, the last refresh and the gauge measurements), use:

```
/context-bar status
```

- **`/context-bar` is not a known command**: the session started before the
  mod was installed, or the folder is nested one level too deep. Start a new
  session.
- **The command answers but nothing shows**: wait for the next reply, then look
  in the transcript for a dim line starting with `context-bar:`, which names
  the problem.


## Did you find a bug or do you have a suggestion?

Please let me know, by opening a new issue or a pull request, and include the
output of `/context-bar status`.
