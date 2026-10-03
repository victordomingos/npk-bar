# claude-mods

Claude Code mods (plugins of function hooks), shared across machines.

| Mod | What it does |
|---|---|
| [context-bar](context-bar/README.md) | Context window, session/week limits and progress estimates above the prompt (`/context-bar`) |

## Install on a machine

```bash
git clone <this repo's URL> ~/dev/claude-mods
ln -s ~/dev/claude-mods/context-bar ~/.claude/skills/context-bar
```

Windows (PowerShell):

```powershell
git clone <this repo's URL> "$env:USERPROFILE\dev\claude-mods"
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\context-bar" -Target "$env:USERPROFILE\dev\claude-mods\context-bar"
```

Then start a new Claude Code session (or restart and resume one). Update with `git pull`.
