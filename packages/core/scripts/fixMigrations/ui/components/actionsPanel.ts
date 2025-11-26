import blessed from 'blessed'

import type { Box, Migration, Screen } from '../../types'

export type ActionItem = {
  icon: string
  label: string
  value: string
}

export type ActionsPanel = {
  box: Box
  render: (actions: ActionItem[], selectedIndex: number) => void
  getActions: (migration: Migration) => ActionItem[]
}

/**
 * Get available actions for a migration
 */
function getActionsForMigration(migration: Migration): ActionItem[] {
  return [
    { icon: '📝', label: 'Open in Editor', value: 'edit' },
    { icon: '▶', label: 'Run Migration', value: 'run' },
    { icon: '⚡', label: 'Run Single Statement', value: 'run_statement' },
    {
      icon: migration.isApplied ? '✗' : '✓',
      label: migration.isApplied ? 'Mark as Pending' : 'Mark as Applied',
      value: 'toggle',
    },
    { icon: '←', label: 'Back', value: 'back' },
  ]
}

/** Height of actions panel: 5 items + 2 for borders */
const ACTIONS_HEIGHT = 7

/**
 * Create an actions panel component
 */
export function createActionsPanel(screen: Screen): ActionsPanel {
  const box = blessed.box({
    bottom: 1, // Above status bar
    left: 0,
    width: '100%',
    height: ACTIONS_HEIGHT,
    border: { type: 'line' },
    label: ' Actions ',
    tags: true,
    style: {
      border: { fg: 'blue' },
    },
  })

  screen.append(box)

  const render = (actions: ActionItem[], selectedIndex: number) => {
    const lines = actions.map((action, i) => {
      if (i === selectedIndex) {
        // Selected: inverse background, cyan icon, white label
        return `{inverse} {cyan-fg}${action.icon}{/cyan-fg} {bold}${action.label}{/bold} {/inverse}`
      }
      // Normal: cyan icon, default label
      return ` {cyan-fg}${action.icon}{/cyan-fg} ${action.label}`
    })
    box.setContent(lines.join('\n'))
  }

  const getActions = (migration: Migration) => getActionsForMigration(migration)

  return { box, render, getActions }
}
