export type JournalEntry = {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

export type Journal = {
  version: string
  dialect: string
  entries: JournalEntry[]
}

export type AppliedMigrationRow = {
  id: number
  hash: string
  created_at: string | number | bigint
}

export enum MenuAction {
  RunAll = '__RUN_ALL__',
  Close = '__CLOSE__',
}

export enum MigrationAction {
  Open = 'Open',
  MarkAsExecuted = 'Mark as executed',
  Run = 'Run',
  Back = 'Back',
}

export type MenuResult =
  | { type: 'exit'; code: number }
  | { type: 'continue' }
  | { type: 'back' }

