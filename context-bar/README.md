# context-bar

A Claude Code mod that draws the context window as a stacked bar above the
prompt: the 3 biggest `/context` categories in their colours, the rest merged
as Other (`▓`), the autocompact buffer (`▒`) and free space (`░`), with the
percentage used and the token total. On a Pro/Max subscription it also shows
the session (5-hour) and weekly limits with time to reset. If replies include a progress estimates
block, those show under the bar too.

Works in the terminal and in the Code tab of the Claude desktop app.

## Requirements

- A recent Claude Code (mods are a newer feature; update first if in doubt).
- Nothing else: no API key, no extra packages.

## Install

### macOS / Linux

1. Unzip into your personal skills folder:

   ```bash
   mkdir -p ~/.claude/skills && unzip context-bar.zip -d ~/.claude/skills
   ```

2. Check that it is in place and valid:

   ```bash
   claude plugin validate ~/.claude/skills/context-bar
   ```

   It should end with `Validation passed` (warnings about `types` and
   `author` are expected).

### Windows (PowerShell)

1. Unzip into your personal skills folder:

   ```powershell
   Expand-Archive context-bar.zip -DestinationPath "$env:USERPROFILE\.claude\skills"
   ```

2. Check it:

   ```powershell
   claude plugin validate "$env:USERPROFILE\.claude\skills\context-bar"
   ```

You should end up with `.claude/skills/context-bar/` containing
`.claude-plugin/`, `hooks/`, `types/` and this README. If you see
`context-bar/context-bar/`, move the inner folder up one level.

## Turn it on

1. Start a **new** Claude Code session. An already-open session does not pick
   up a newly installed mod; restart it and keep the conversation:
   - terminal: quit (`/exit` or Ctrl+D), then run `claude --continue` in the
     same folder (or `claude --resume` to pick the session from a list);
   - desktop app: quit and reopen the app; your sessions come back and load it.
2. Type `/context-bar`. The bar appears above the prompt (in a brand-new session, after the first reply).

That is all. The on/off choice and the layout are remembered on that machine.

## Commands

| Command | What it does |
|---|---|
| `/context-bar` | Turns it on or off, keeping the layout |
| `/context-bar full` | Wide bar, a line with the top categories, one bar per limit and per estimate |
| `/context-bar gauges` | Small ring gauges (context by category, session/week limits, estimates) drawn as an image: labels beside the rings when one row fits, under them when narrow. The inside of the ring turns yellow from 50%, orange from 75%, red from 90% and blinks from 93% (context, session and week). Default in the desktop app; the terminal shows `compact` instead |
| `/context-bar compact` | Short bar with `% used tokens/window` and the limits on one line, estimates on another |
| `/context-bar status` | What the mod sees right now (limits reported, shown and saved; estimates; last refresh) — paste it when reporting a problem |

It refreshes at the end of each turn, and at most every 15 s during a long one.

## Cost

No API calls (the breakdown is estimated locally) and nothing added to the
model's context: it only reads the session's usage figures and draws.

## Progress estimates (optional)

Reply lines shaped like this are picked up, in any language:

```
**Session:** `████████░░░░░░░░░░░░` 40% · ~3h
```

Without them you just get the context bar.

## Troubleshooting

- **`/context-bar` is not a known command:** the session started before the
  folder was in place, or the folder is nested one level too deep (see
  Install). Start a new session.
- **The command answers but no bar shows:** wait for the next reply; the
  figures come from the last response. Then check the transcript for a dim
  line starting `context-bar:`, which names the problem.
- **Still nothing:** run `claude --debug` and look for lines with
  `context-bar`.

## Update

Replace the folder with the new version. An open session reloads it on save.

## Uninstall

Delete the `context-bar` folder from `~/.claude/skills`
(Windows: `%USERPROFILE%\.claude\skills`).
