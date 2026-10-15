/** A model call the pane waits on: idle, running, its value, or why it failed. */
export type Ask<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; reason: string }

/** A clarifying question; its first option is the recommended option. */
export type Question = { text: string; options: string[] }

/** The user's answer to one clarifying question: an option by index (`isGuess` while it is still the recommended one nobody picked), their own text, or skipped. */
export type Answer = { kind: 'option'; index: number; isGuess?: boolean } | { kind: 'other'; text: string } | { kind: 'skip' }

/** The upgraded prompt and the added details it states that the original prompt did not. */
export type Rewrite = { text: string; added: string[] }

/** One run of /prompt-upgrade, from the original prompt to the upgraded one; `id` tells a stale reply from the current run. */
export type Upgrade = {
  id: number
  original: string
  questions: Ask<Question[]>
  answers: Answer[]
  rewrite: Ask<Rewrite>
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-upgrade': {
      upgrade: Upgrade | null
    }
  }
}
