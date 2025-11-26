import blessed from 'blessed'

import type { Box, Migration, Screen } from '../../types'

/**
 * SQL Preview panel configuration
 */
const PREVIEW_CONFIG = {
  top: 0,
  left: 0,
  width: '100%',
  height: '50%',
  border: { type: 'line' as const },
  label: ' SQL Preview ',
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: '▓',
    style: { bg: 'cyan' },
  },
  tags: true,
  style: {
    border: { fg: 'cyan' },
    focus: { border: { fg: 'yellow' } },
  },
}

export type PreviewPanel = {
  box: Box
  update: (migration: Migration) => void
  showError: (errorMessage: string) => void
  showSuccess: (message: string) => void
  scrollUp: (lines?: number) => void
  scrollDown: (lines?: number) => void
  reset: () => void
  /** Set the bottom offset, allowing the panel to expand */
  setBottom: (bottom: number) => void
}

/**
 * Create a SQL preview panel component
 */
export function createPreviewPanel(screen: Screen): PreviewPanel {
  const box = blessed.box(PREVIEW_CONFIG)
  screen.append(box)

  const update = (migration: Migration) => {
    box.setContent(migration.sql)
    box.setLabel(` ${migration.fileName} `)
    box.style.border = { fg: 'cyan' }
    box.scrollTo(0)
  }

  const showError = (errorMessage: string) => {
    box.setContent(
      `{red-fg}{bold}Error executing migration:{/bold}{/}\n\n${errorMessage}`,
    )
    box.setLabel(' {red-fg}Error{/} ')
    box.style.border = { fg: 'red' }
    box.scrollTo(0)
  }

  const showSuccess = (message: string) => {
    box.setContent(
      `{green-fg}{bold}✓ ${message}{/bold}{/}\n\n{dim}SQL executed without errors.{/}`,
    )
    box.setLabel(' {green-fg}Success{/} ')
    box.style.border = { fg: 'green' }
    box.scrollTo(0)
  }

  const scrollUp = (lines = 3) => {
    box.scroll(-lines)
  }

  const scrollDown = (lines = 3) => {
    box.scroll(lines)
  }

  const reset = () => {
    box.style.border = { fg: 'cyan' }
    box.setLabel(' SQL Preview ')
  }

  const setBottom = (bottom: number) => {
    box.height = undefined as unknown as number
    box.bottom = bottom
  }

  return {
    box,
    update,
    showError,
    showSuccess,
    scrollUp,
    scrollDown,
    reset,
    setBottom,
  }
}
