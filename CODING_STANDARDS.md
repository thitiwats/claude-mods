# Coding standards

Conventions for mod code in `plugins/<mod>/`. `plugins/handoff-nudge` is the reference mod.

## Hooks

- Every handler that receives `next` returns `next(e)` so Claude Code and other mods still run.
- A `ui.render` handler calls `next(e)` first and draws its own UI beside that result (`rest`), never in place of it.
- Branch on `e.surface` (or `press.surface` in a button handler) wherever terminal and desktop differ, and resolve desktop-only components such as `Svg` inside the desktop branch.

## State

- Keep state in `atom({ plugin: '<mod>', key: '<key>' } as const, <initial>)` and change it with `update`.
- Declare each atom's type in the mod's `PluginState` in `types/index.d.ts`; shared types live there too.
- Model async work as a union on `status` (`idle`, `loading`, `ready`, `failed`), with the failure carrying its `reason`.

## Naming

- Booleans start with `is` or `has` (`isHidden`, `hasHandoff`).
- Module-level constants are `UPPER_SNAKE_CASE`; large numbers use separators (`200_000`).
- Every `Button` has a `key`; tests find and press it by that key.

## Comments

One line, saying why: the constraint, the surface difference, or the gotcha the code cannot show.

## Tests

- Wrap every test in `for (const surface of ['terminal', 'desktop'] as const)` and prefix its name with `${surface}:`.
- Name a test after the behaviour a user sees (`hidden under 200k, shown past it`).
- Stub every engine event the mod relies on (`session.measure`, `ui.render`, `command.list`, …) inside the test that needs it.
