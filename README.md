# claude-mods

Personal Claude Code mods, published as a plugin marketplace.

## Mods

| Mod | What it does |
| --- | --- |
| [handoff-nudge](plugins/handoff-nudge) | Shows a band above the prompt once the context passes 200k tokens, with a **Suggest handoff** button that asks the session's model what the next session should focus on and fills `/handoff <focus>` into the prompt. Requires a `/handoff` skill. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install handoff-nudge --marketplace thitiwats/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

## Develop

Add this folder as a local marketplace so edits apply after `/reload-plugins`:

```sh
claude plugin marketplace add ~/Workspaces/claude-mods
claude plugin install handoff-nudge@claude-mods --scope user
```

Check a mod:

```sh
claude plugin validate plugins/handoff-nudge
claude plugin test plugins/handoff-nudge
```
