export type Tokens = number | null

/** /handoff-nudge-preview: off, the band, or the band as if /handoff were missing. */
export type Preview = 'off' | 'band' | 'install'

/** The fork's handoff suggestion: idle, running, a focus line to pass to /handoff, or why it failed. */
export type Suggestion =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; focus: string }
  | { status: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'handoff-nudge': { tokens: Tokens; window: number; isHidden: boolean; suggestion: Suggestion; hasHandoff: boolean; preview: Preview }
  }
}
