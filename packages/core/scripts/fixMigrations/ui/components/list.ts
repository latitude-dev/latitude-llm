import blessed from 'blessed'

import type { Box, Migration, Screen } from '../../types'
import { formatDateShort } from '../../utils'

export type ListPanel = {
  box: Box
  render: (
    migrations: Migration[],
    currentIndex: number,
    showOnlyUnapplied: boolean,
  ) => void
}

/**
 * Create a list panel component for displaying migrations
 */
export function createListPanel(screen: Screen): ListPanel {
  const box = blessed.box({
    top: '50%+7',
    left: 0,
    width: '100%',
    height: '50%-8',
    border: { type: 'line' },
    label: ' Migrations ',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '▓',
      style: { bg: 'cyan' },
    },
    style: {
      border: { fg: 'blue' },
    },
  })

  screen.append(box)

  const render = (
    migrations: Migration[],
    currentIndex: number,
    showOnlyUnapplied: boolean,
  ) => {
    const label = showOnlyUnapplied
      ? ` Unapplied Migrations (${migrations.length}) `
      : ` All Migrations (${migrations.length}) `
    box.setLabel(label)

    const boxHeight = Math.max(1, (box.height as number) - 2)
    let startIdx = 0

    // Calculate scroll position to keep selection visible
    if (currentIndex >= startIdx + boxHeight) {
      startIdx = currentIndex - boxHeight + 1
    }
    if (currentIndex < startIdx) {
      startIdx = currentIndex
    }

    const visibleItems = migrations.slice(startIdx, startIdx + boxHeight)
    const lines: string[] = []

    visibleItems.forEach((m, i) => {
      const actualIdx = startIdx + i
      const dateStr = formatDateShort(m.createdAt)
      const statusIcon = m.isApplied ? '✓' : '✗'
      const nameColor = m.isApplied ? '{green-fg}' : '{red-fg}'
      const nameColorClose = m.isApplied ? '{/green-fg}' : '{/red-fg}'

      if (actualIdx === currentIndex) {
        // Selected row: inverse background, icon color, gray date, colored name
        const statusColor = m.isApplied ? '{green-fg}' : '{red-fg}'
        lines.push(
          `{inverse} ${statusColor}${statusIcon}{/}` +
            `{inverse} {gray-fg}${dateStr}{/gray-fg} ${nameColor}${m.name}${nameColorClose} {/inverse}`,
        )
      } else {
        // Normal row: colored icon, gray date, colored name
        const status = m.isApplied
          ? '{green-fg}✓{/green-fg}'
          : '{red-fg}✗{/red-fg}'
        lines.push(
          ` ${status} {gray-fg}${dateStr}{/gray-fg} ${nameColor}${m.name}${nameColorClose}`,
        )
      }
    })

    box.setContent(lines.join('\n'))
  }

  return { box, render }
}
