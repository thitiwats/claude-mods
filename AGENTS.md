# AGENTS.md

## Workflow

1. Branch from `main` as `<mod>/<topic>` (e.g. `handoff-nudge/suggest-prompt`). `main` moves only through PRs the user merges.
2. Commit as you go. Subject: `<mod>: <what changed>`, or a plain sentence for repo-wide changes; the body says why.
3. Test the change on both surfaces (see Mods).
4. Before opening the PR, revert any `[dev-only]` commits, then run `claude plugin validate` and `claude plugin test` on each changed mod (README › Develop). Both pass.

## Dev-only tooling

Add whatever makes the change easy to test: a preview command like `/handoff-nudge-preview`, test-only hooks, README notes on using them. Commit it on its own with a `<mod>: [dev-only] ...` subject so it reverts cleanly; after reverting, `git diff main...HEAD` shows only the real change.

## Mods

- A mod lives in `plugins/<mod>/` and is listed in `.claude-plugin/marketplace.json` and the README's Mods table; keep the three in sync.
- Bump the semver `version` in the mod's `.claude-plugin/plugin.json` when users would notice the change.
- Mods run on two surfaces, `terminal` and `desktop`. The desktop app may bundle an older Claude Code (2.1.295 at last check) that rejects the whole UI over one unknown prop, so stick to props that version accepts.
- Update the README when a mod's behaviour, install steps, or dev commands change.
- Read `CODING_STANDARDS.md` before writing or reviewing mod code.
