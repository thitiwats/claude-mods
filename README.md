# claude-mods

Claude Code mods, published as a plugin marketplace.

## Mods

| Mod | What it does |
| --- | --- |
| [handoff-nudge](plugins/handoff-nudge) | Once the context passes the **Nudge threshold** (200k tokens by default; 100k–500k in `/config`), shows a band above the prompt with a **Suggest handoff** button that fills `/handoff <focus>` into the prompt. If `/handoff` is missing, offers to install it. In a new or cleared conversation, a **Resume from a handoff** band lists this project's handoff docs from the last week (terminal only). |
| [prompt-sharpen](plugins/prompt-sharpen) | `/prompt-sharpen:upgrade <prompt>` opens a pane that asks up to three multiple-choice questions about what your prompt leaves open, then rewrites it clearer with the same intent. Review the result, then **Run it**, **Edit**, **Copy**, **Send original**, or **Cancel**. Anything still unknown stays a `[placeholder]`. |

Both mods run on macOS, Linux, and Windows.

### handoff-nudge

![handoff-nudge band](plugins/handoff-nudge/docs/handoff-band.svg)

### prompt-sharpen

![prompt-sharpen review](plugins/prompt-sharpen/docs/review.svg)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install handoff-nudge --marketplace thitiwats/claude-mods
/plugin install prompt-sharpen --marketplace thitiwats/claude-mods
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

Grade `prompt-sharpen`'s questions and rewrites with a real model and a judge model (about $1 a run on Opus; results go to `plugins/prompt-sharpen/eval/results-<model>.json`):

```sh
bun plugins/prompt-sharpen/eval/run.ts [--model opus] [--judge opus] [--case <name>]
```

## License

[MIT](LICENSE)
