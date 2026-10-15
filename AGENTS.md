# AGENTS.md

## Git

- Develop on a branch cut from `main`, named `<mod>/<topic>` (e.g. `handoff-nudge/suggest-prompt`). Never commit or push to `main` directly; changes reach it only through a PR that the user merges.
- Commit subject: `<mod>: <what changed>`; repo-wide changes use a plain sentence. The body says why, not what the diff already shows.

### Dev-only tooling

- Add whatever makes the change easy to test while developing, such as a preview command like `/handoff-nudge-preview`, test-only hooks, or README notes on using them.
- Keep that tooling in its own commits, with subjects starting `<mod>: [dev-only]`, separate from the real change. Don't mix it into feature commits.
- Once testing on both surfaces is done, revert every `[dev-only]` commit on the branch, then confirm nothing remains (`git diff main...HEAD` shows only the real change), re-run validate and test, and only then open the PR.

## Mods

- Each mod lives in `plugins/<mod>/` and is registered in `.claude-plugin/marketplace.json` and the README's Mods table. Keep all three in sync.
- Bump `version` in the mod's `.claude-plugin/plugin.json` (semver) with any change users would notice.
- Every mod draws on two surfaces, `terminal` and `desktop`. Test both; the desktop app may run an older Claude Code (2.1.295 at last check) that refuses the whole UI on an unknown prop, so use only props that version accepts.
- Update the README when a mod's behavior, install steps, or dev commands change.
- Before writing or reviewing mod code, read `CODING_STANDARDS.md`.

## Before committing

Run `claude plugin validate` and `claude plugin test` on each changed mod (see README › Develop). Both must pass.
