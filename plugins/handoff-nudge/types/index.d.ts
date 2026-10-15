export type Tokens = number | null

/** The fork's handoff suggestion: idle, running, a focus line to pass to /handoff, or why it failed. */
export type Suggestion =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; focus: string }
  | { status: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'handoff-nudge': { tokens: Tokens; isHidden: boolean; suggestion: Suggestion }
  }
}
