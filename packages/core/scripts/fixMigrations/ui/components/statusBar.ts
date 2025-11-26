import blessed from 'blessed'

import type { Box, Migration, Screen } from '../../types'

/**
 * Status bar configuration
 */
const STATUS_BAR_CONFIG = {
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  tags: true,
  style: { bg: 'black', fg: 'white' },
}

export type StatusBar = {
  box: Box
  updateBrowser: (migration: Migration, current: number, total: number) => void
  updateAction: (migration: Migration) => void
  setProcessing: (message: string) => void
}

/**
 * Get status icon based on applied state
 */
function getStatusIcon(isApplied: boolean): string {
  return isApplied ? '{green-fg}✓{/}' : '{red-fg}✗{/}'
}

/**
 * Create a status bar component
 */
export function createStatusBar(screen: Screen): StatusBar {
  const box = blessed.box(STATUS_BAR_CONFIG)
  screen.append(box)

  const updateBrowser = (
    migration: Migration,
    current: number,
    total: number,
  ) => {
    const statusIcon = getStatusIcon(migration.isApplied)
    box.setContent(
      ` ${statusIcon} ${current}/${total} {gray-fg}|{/} {cyan-fg}{bold}↑↓{/}{/} Navigate {gray-fg}|{/} {cyan-fg}{bold}Enter{/}{/} Actions {gray-fg}|{/} {cyan-fg}{bold}q{/}{/} Quit `,
    )
  }

  const updateAction = (migration: Migration) => {
    const statusIcon = getStatusIcon(migration.isApplied)
    box.setContent(
      ` ${statusIcon} {bold}${migration.name}{/} {gray-fg}|{/} {cyan-fg}{bold}↑↓{/}{/} Navigate {gray-fg}|{/} {cyan-fg}{bold}Enter{/}{/} Select {gray-fg}|{/} {cyan-fg}{bold}Esc{/}{/} Back `,
    )
  }

  const setProcessing = (message: string) => {
    box.setContent(` {yellow-fg}${message}{/}`)
  }

  return { box, updateBrowser, updateAction, setProcessing }
}
