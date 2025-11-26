import type blessed from 'blessed'

/**
 * Journal entry from drizzle's _journal.json
 */
export type JournalEntry = {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

/**
 * Full journal structure from _journal.json
 */
export type Journal = {
  version: string
  dialect: string
  entries: JournalEntry[]
}

/**
 * Row from drizzle.__drizzle_migrations table
 */
export type AppliedMigrationRow = {
  hash: string
  created_at: string
}

/**
 * Migration with computed status information
 */
export type Migration = {
  name: string
  fileName: string
  sql: string
  createdAt: Date
  appliedAt: Date | null
  isApplied: boolean
}

/**
 * Result of a migration operation
 */
export type OperationResult =
  | { success: true; message?: string }
  | { success: false; error: string }

/**
 * Main menu action choices
 */
export type MainMenuAction =
  | 'apply'
  | 'browse_all'
  | 'browse_unapplied'
  | 'exit'

/**
 * Migration action choices in the action screen
 */
export type MigrationAction =
  | 'edit'
  | 'run'
  | 'run_statement'
  | 'toggle'
  | 'back'

/**
 * Blessed screen wrapper for type safety
 */
export type Screen = blessed.Widgets.Screen

/**
 * Blessed box widget for type safety
 */
export type Box = blessed.Widgets.BoxElement

/**
 * Key event from blessed
 */
export type KeyEvent = {
  name: string
  ctrl?: boolean
  shift?: boolean
}

/**
 * Common panel configuration
 */
export type PanelConfig = {
  top: string | number
  left: string | number
  width: string | number
  height: string | number
  label: string
  borderColor: string
  scrollable?: boolean
}

/**
 * State for the browser screen
 */
export type BrowserState = {
  currentIndex: number
  migrations: Migration[]
  showOnlyUnapplied: boolean
}

/**
 * State for the action screen
 */
export type ActionState = {
  migration: Migration
  actionIndex: number
  isProcessing: boolean
  errorMessage: string | null
}
