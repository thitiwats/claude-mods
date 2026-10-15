# AGENTS.md

## Mods

- A mod lives in `plugins/<mod>/` and is listed in `.claude-plugin/marketplace.json` and the README's Mods table; keep the three in sync.
- Bump the semver `version` in the mod's `.claude-plugin/plugin.json` when users would notice the change.
- Mods run on two surfaces, `terminal` and `desktop`. The desktop app may bundle an older Claude Code (2.1.295 at last check) that rejects the whole UI over one unknown prop, so stick to props that version accepts.
- Update the README when a mod's behaviour, install steps, or dev commands change.
- Read `CODING_STANDARDS.md` before writing or reviewing mod code.
