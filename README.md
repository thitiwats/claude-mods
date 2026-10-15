# claude-mods

Claude Code mods, published as a plugin marketplace.

## Mods

| Mod | What it does |
| --- | --- |
| [handoff-nudge](plugins/handoff-nudge) | Shows a band above the prompt once the context passes the **Nudge threshold** (200k tokens by default; pick 100k–500k in `/config`), with a **Suggest handoff** button that asks the session's model what the next session should focus on and fills `/handoff <focus>` into the prompt. The band shows earlier when the threshold would sit past auto-compaction or the model's window: at 90% of whichever comes first, so it never misses its chance. If `/handoff` is not installed, the band offers an **Install /handoff** button that fills the [skills.sh](https://skills.sh/) install command (`mattpocock/skills`) into the prompt for you to run: as a `!` shell line in the terminal, or as a request for Claude to run it in the desktop app, which has no `!` shell mode. In a new or cleared conversation, a **Resume from a handoff** band lists up to three handoff docs `/handoff` wrote in this project (its folder, a subfolder, or a folder above it other than your home folder or `/`) during the last week; **Resume** fills the doc's path into the prompt so you can add what to do next. A doc stops being offered once you send a prompt containing its path or Claude reads it. Terminal only: the desktop app starts Claude Code with the first message, so a new conversation there is never empty when the band could draw. |
| [prompt-upgrade](plugins/prompt-upgrade) | `/prompt-upgrade <prompt>` opens a pane that walks your prompt through four steps: **Your prompt**, **Questions**, **Rewrite**, **Review**. It asks up to three multiple-choice questions about what the prompt leaves open, each with its **Recommended** answer already picked (change it, type your own with **Other**, or **Skip**), then rewrites the prompt clearer and more complete with the same intent, adding only what came from your answers, the conversation, or structure and output format; anything still unknown stays a `[placeholder]`. Review shows the original beside the upgraded prompt and lists what was added: **Run it** sends it, **Edit** puts it in the prompt to change first, **Copy** copies it, **Send original** sends what you typed, and **Cancel** or Esc puts your original back in the prompt. It asks the session's own model over this conversation, or without it in a new or cleared one. Where the pane cannot open, your prompt goes back in the prompt untouched. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install handoff-nudge --marketplace thitiwats/claude-mods
/plugin install prompt-upgrade --marketplace thitiwats/claude-mods
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
