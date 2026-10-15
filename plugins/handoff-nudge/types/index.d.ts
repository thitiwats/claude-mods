export type Tokens = number | null

/** The fork's handoff suggestion: idle, running, a focus line to pass to /handoff, or why it failed. */
export type Suggestion =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; focus: string }
  | { status: 'failed'; reason: string }

/** A handoff document /handoff wrote, kept in $.store so a later session in the same cwd can resume it. */
export type Handoff = { path: string; cwd: string; at: number; isResumed?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'handoff-nudge': {
      tokens: Tokens
      threshold: number
      window: number
      isHidden: boolean
      suggestion: Suggestion
      hasHandoff: boolean
      isResumeHidden: boolean
      isConversationEmpty: boolean
    }
  }
}
