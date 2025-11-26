import blessed from 'blessed'

import type { Box, Migration, Screen } from '../../types'
import { formatDateTime } from '../../utils'

/**
 * Details panel configuration
 */
const DETAILS_CONFIG = {
  top: '50%',
  left: 0,
  width: '100%',
  height: 7,
  border: { type: 'line' as const },
  label: ' Details ',
  tags: true,
  style: {
    border: { fg: 'magenta' },
  },
}

export type DetailsPanel = {
  box: Box
  update: (migration: Migration) => void
  /** Reposition the panel using bottom offset */
  setBottom: (bottom: number) => void
}

/**
 * Format migration status text
 */
function formatStatus(isApplied: boolean): string {
  return isApplied
    ? '{green-fg}{bold}✓ APPLIED{/bold}{/}'
    : '{red-fg}{bold}✗ NOT APPLIED{/bold}{/}'
}

/**
 * Create a details panel component
 */
export function createDetailsPanel(screen: Screen): DetailsPanel {
  const box = blessed.box(DETAILS_CONFIG)
  screen.append(box)

  const update = (migration: Migration) => {
    const lines = [
      `{bold}Name:{/}     ${migration.name}`,
      `{bold}Status:{/}   ${formatStatus(migration.isApplied)}`,
      `{bold}Created:{/}  ${formatDateTime(migration.createdAt)}`,
    ]

    if (migration.appliedAt) {
      lines.push(`{bold}Applied:{/}  ${formatDateTime(migration.appliedAt)}`)
    }

    box.setContent(lines.join('\n'))
  }

  const setBottom = (bottom: number) => {
    box.top = undefined as unknown as number
    box.bottom = bottom
  }

  return { box, update, setBottom }
}
