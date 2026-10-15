# claude-mods

Claude Code mods, published as a plugin marketplace.

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

Clone the repo and add it as a local marketplace so edits apply after `/reload-plugins`:

```sh
git clone https://github.com/thitiwats/claude-mods.git
claude plugin marketplace add ./claude-mods
claude plugin install handoff-nudge@claude-mods --scope user
```

Check a mod:

```sh
cd claude-mods
claude plugin validate plugins/handoff-nudge
claude plugin test plugins/handoff-nudge
```

## License

[MIT](LICENSE)
