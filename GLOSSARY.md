# handoff-nudge

A mod that nudges a long conversation toward `/handoff` and offers to resume a handoff in a fresh one.

## Language

**Nudge threshold**:
The context size, in tokens, past which the handoff band appears.
_Avoid_: Handoff context window, limit

**Effective threshold**:
The nudge threshold after it is lowered to sit below auto-compaction, so the band can appear before compaction runs.
_Avoid_: Clamped threshold

**Handoff doc**:
A Markdown document `/handoff` writes for the next conversation to start from.
_Avoid_: Handoff file, handover note
