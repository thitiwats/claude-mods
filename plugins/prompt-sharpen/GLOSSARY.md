# prompt-sharpen

A mod that turns a prompt the user hands it into a clearer, more complete one with the same intent, asking a few questions first when the prompt leaves something open.

## Language

**Original prompt**:
The text the user hands to `/prompt-sharpen:upgrade`, before any change.
_Avoid_: Input, draft, raw prompt

**Clarifying question**:
A multiple-choice question asked about something the original prompt leaves open; the user picks an option, types their own, or skips it.
_Avoid_: Follow-up, quiz

**Recommended option**:
The option of a clarifying question the model judges most likely to match the user's intent, shown first and marked as recommended.
_Avoid_: Default, suggested answer

**Upgraded prompt**:
The original prompt rewritten for clarity and completeness, adding only what came from the user's answers, the conversation, or structure and output format; anything still unknown stays a placeholder.
_Avoid_: Improved prompt, enhanced prompt, rewrite

**Added detail**:
One thing the upgraded prompt states that the original prompt did not, listed so the user can see what changed.
_Avoid_: Change, enhancement
