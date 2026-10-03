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
- **5h limit and Week limit**: how much of each limit is used and when it resets. The
  tick marks where an even pace would put you; the arc is green under that
  pace, then yellow, orange and red the further over it you go.
- **Warnings**: the inside of the Context and limit rings turns yellow
  from 50%, orange from 75%, red from 90%, and pulses from 93%.
- **Estimates** (optional): progress of the validation in flight (tests you
  run), the session and the project, with the time left against the implied
  total. The arc turns green while an estimate holds, then yellow, orange and
  red as its implied total grows past the first estimate (+10%, +25%, +50%).

On a narrow window the labels move under the rings and the gauges wrap:

![context-bar gauges on a narrow window](context-bar/docs/gauges-narrow.png)

In a terminal, which cannot draw images, it shows the same figures as text
(rendered from the mod's own text layout):

![context-bar in an 80-column terminal](context-bar/docs/terminal-80-columns.png)


## Installation and dependencies:

You need a recent Claude Code (mods are a newer feature: update first if in
doubt), in the terminal or in the Code tab of the Claude desktop app. Nothing
else: no API key, no packages to install.

Clone this repository once per machine and link the mod (and, optionally, the
[progress-estimates](skills/progress-estimates/SKILL.md) skill) into your
personal skills folder, where Claude Code loads them from.

On macOS and Linux:

```
git clone https://github.com/victordomingos/claude-mods.git ~/dev/claude-mods
mkdir -p ~/.claude/skills
ln -s ~/dev/claude-mods/context-bar ~/.claude/skills/context-bar
ln -s ~/dev/claude-mods/skills/progress-estimates ~/.claude/skills/progress-estimates
```

On Windows (PowerShell; a junction needs no administrator rights):

```
git clone https://github.com/victordomingos/claude-mods.git "$env:USERPROFILE\dev\claude-mods"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\context-bar" -Target "$env:USERPROFILE\dev\claude-mods\context-bar"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\progress-estimates" -Target "$env:USERPROFILE\dev\claude-mods\skills\progress-estimates"
```

If the mod does not load from a junction on your machine, copy the folders
instead of linking them, and copy them again after each `git pull`.

Skip the `progress-estimates` line if you already use another skill that
writes progress estimates: Claude would get two sets of instructions for the
same block.

Check that it is in place:

```
claude plugin validate ~/.claude/skills/context-bar
```

It should end with `Validation passed`. On Windows, use `"$env:USERPROFILE\.claude\skills\context-bar"`.

To update later, `git pull` in the clone: an open session reloads the mod by
itself. To uninstall, delete the links in `~/.claude/skills` (Windows:
`%USERPROFILE%\.claude\skills`); the clone can go too.

The mod and the skill are plain TypeScript and Markdown, with no scripts,
binaries or OS-specific code. Tested on macOS.


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
subscription; with an API key the limit gauges are not shown. They
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

The estimate gauges read a short block at the end of Claude's replies, one
line per item. The labels can be in another language: Portuguese ones are
shown in English, others as written.

```
**Validation:** `████████████░░░░░░░░` 60% · ~1h
**Session:**    `████████░░░░░░░░░░░░` 40% · ~3h
**Project:**    `██████████████░░░░░░` 72% · ~45h
```

The context and limit gauges need nothing else. For the estimates, install
the [progress-estimates](skills/progress-estimates/SKILL.md) skill from this
repository (see Installation): it tells Claude when to write the block and how
to estimate honestly. Without it, you can simply ask Claude for the block.

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
