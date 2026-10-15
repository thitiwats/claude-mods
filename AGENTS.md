# AGENTS.md

## Git

- Work only on the `dev` branch. Do not commit to, push to, or check out `main` or any other branch.
- Commit subject: `<mod>: <what changed>`; repo-wide changes use a plain sentence. The body says why, not what the diff already shows.

## Mods

- Each mod lives in `plugins/<mod>/` and is registered in `.claude-plugin/marketplace.json` and the README's Mods table. Keep all three in sync.
- Bump `version` in the mod's `.claude-plugin/plugin.json` (semver) with any change users would notice.
- Every mod draws on two surfaces, `terminal` and `desktop`. Test both; the desktop app may run an older Claude Code (2.1.295 at last check) that refuses the whole UI on an unknown prop, so use only props that version accepts.
- Update the README when a mod's behavior, install steps, or dev commands change.
- Before writing or reviewing mod code, read `CODING_STANDARDS.md`.

## Before committing

Run `claude plugin validate` and `claude plugin test` on each changed mod (see README › Develop). Both must pass.
