import blessed from 'blessed'

import type { Box, KeyEvent, MainMenuAction, Migration } from '../../types'
import {
  filterUnapplied,
  filterApplied,
  findOutOfOrderMigrations,
} from '../../data'
import { formatDateShort } from '../../utils'
import {
  createScreen,
  safeExit,
  createKeyHandler,
  isUpKey,
  isDownKey,
  isEnterKey,
  isQuitKey,
} from '../screen'

type MenuItem = {
  icon: string
  label: string
  value: MainMenuAction
  disabled: boolean
}

/**
 * Build menu items based on migration state
 */
function buildMenuItems(migrations: Migration[]): MenuItem[] {
  const unapplied = filterUnapplied(migrations)
  const unappliedCount = unapplied.length
  const totalCount = migrations.length

  return [
    {
      icon: '▶',
      label:
        unappliedCount > 0
          ? `Apply all unapplied migrations (${unappliedCount})`
          : 'Apply all (none pending)',
      value: 'apply' as MainMenuAction,
      disabled: unappliedCount === 0,
    },
    {
      icon: '📂',
      label: `Browse all migrations (${totalCount})`,
      value: 'browse_all' as MainMenuAction,
      disabled: false,
    },
    {
      icon: '📋',
      label:
        unappliedCount > 0
          ? `Browse unapplied migrations (${unappliedCount})`
          : 'Browse unapplied (none pending)',
      value: 'browse_unapplied' as MainMenuAction,
      disabled: unappliedCount === 0,
    },
    {
      icon: '✕',
      label: 'Exit',
      value: 'exit' as MainMenuAction,
      disabled: false,
    },
  ]
}

/**
 * Create the status summary content
 */
function buildStatusContent(migrations: Migration[]): string {
  const unapplied = filterUnapplied(migrations)
  const applied = filterApplied(migrations)
  const outOfOrder = findOutOfOrderMigrations(migrations)

  const lines: string[] = []

  if (unapplied.length === 0) {
    lines.push(
      '{green-fg}{bold}✅ All migrations are correctly applied!{/bold}{/green-fg}',
    )
    lines.push('')
    lines.push(`{gray-fg}Total: ${migrations.length} migrations{/gray-fg}`)
  } else {
    lines.push(
      `{yellow-fg}{bold}⚠ Found ${unapplied.length} unapplied migration(s){/bold}{/yellow-fg}`,
    )
    lines.push('')
    lines.push(
      `{gray-fg}Total: ${migrations.length} | Applied: ${applied.length} | Unapplied: ${unapplied.length}{/gray-fg}`,
    )
    lines.push('')
    lines.push('{bold}Unapplied migrations:{/bold}')

    const lastAppliedTimestamp =
      applied.length > 0
        ? Math.max(...applied.map((m) => m.createdAt.getTime()))
        : 0

    for (const m of unapplied) {
      const dateStr = formatDateShort(m.createdAt)
      const willAutoApply = m.createdAt.getTime() > lastAppliedTimestamp

      if (willAutoApply) {
        lines.push(`  {gray-fg}${dateStr}{/gray-fg} {red-fg}${m.name}{/red-fg}`)
      } else {
        lines.push(
          `  {gray-fg}${dateStr}{/gray-fg} {red-fg}${m.name}{/red-fg} {red-fg}(won't auto-apply){/red-fg}`,
        )
      }
    }

    if (outOfOrder.length > 0) {
      lines.push('')
      lines.push(
        `{yellow-fg}⚠ ${outOfOrder.length} migration(s) have timestamps older than the last applied.{/yellow-fg}`,
      )
      lines.push(
        "{yellow-fg}  These won't be picked up by db:migrate and need manual intervention.{/yellow-fg}",
      )
    }
  }

  return lines.join('\n')
}

/**
 * Show the main menu screen and return the selected action
 */
export function showMainMenuScreen(
  migrations: Migration[],
  onAction: (action: MainMenuAction) => void,
): void {
  const screen = createScreen('Migration Manager')
  const menuItems = buildMenuItems(migrations)

  // State
  let selectedIndex = menuItems.findIndex((item) => !item.disabled)
  if (selectedIndex === -1) selectedIndex = 0

  // Create status panel
  const statusBox: Box = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '50%',
    border: { type: 'line' },
    label: ' Migration Status ',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '▓',
      style: { bg: 'cyan' },
    },
    style: {
      border: { fg: 'cyan' },
    },
  })
  statusBox.setContent(buildStatusContent(migrations))
  screen.append(statusBox)

  // Create menu panel
  const menuBox: Box = blessed.box({
    top: '50%',
    left: 0,
    width: '100%',
    bottom: 1,
    border: { type: 'line' },
    label: ' What would you like to do? ',
    tags: true,
    style: {
      border: { fg: 'blue' },
    },
  })
  screen.append(menuBox)

  // Create status bar
  const statusBar: Box = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { bg: 'black', fg: 'white' },
  })
  statusBar.setContent(
    ' {cyan-fg}{bold}↑↓{/bold}{/cyan-fg} Navigate {gray-fg}|{/gray-fg} {cyan-fg}{bold}Enter{/bold}{/cyan-fg} Select {gray-fg}|{/gray-fg} {cyan-fg}{bold}q{/bold}{/cyan-fg} Quit ',
  )
  screen.append(statusBar)

  // Render menu items
  function renderMenu(): void {
    const lines = menuItems.map((item, i) => {
      const isSelected = i === selectedIndex

      if (item.disabled) {
        // Disabled items: dim gray
        if (isSelected) {
          return `{inverse} {gray-fg}${item.icon} ${item.label}{/gray-fg} {/inverse}`
        }
        return ` {gray-fg}${item.icon} ${item.label}{/gray-fg}`
      }

      if (isSelected) {
        // Selected: inverse with cyan icon
        return `{inverse} {cyan-fg}${item.icon}{/cyan-fg} {bold}${item.label}{/bold} {/inverse}`
      }
      // Normal: cyan icon
      return ` {cyan-fg}${item.icon}{/cyan-fg} ${item.label}`
    })
    menuBox.setContent(lines.join('\n'))
    screen.render()
  }

  // Handle key navigation
  function handleKey(key: KeyEvent): void {
    if (isUpKey(key)) {
      // Find previous non-disabled item
      let newIndex = selectedIndex - 1
      while (newIndex >= 0 && menuItems[newIndex]!.disabled) {
        newIndex--
      }
      if (newIndex >= 0) {
        selectedIndex = newIndex
        renderMenu()
      }
      return
    }

    if (isDownKey(key)) {
      // Find next non-disabled item
      let newIndex = selectedIndex + 1
      while (newIndex < menuItems.length && menuItems[newIndex]!.disabled) {
        newIndex++
      }
      if (newIndex < menuItems.length) {
        selectedIndex = newIndex
        renderMenu()
      }
      return
    }

    if (isEnterKey(key)) {
      const selected = menuItems[selectedIndex]!
      if (!selected.disabled) {
        try {
          screen.destroy()
        } catch {
          // Ignore blessed cleanup errors
        }
        onAction(selected.value)
      }
      return
    }

    if (isQuitKey(key) || key.name === 'q') {
      safeExit(screen, 0)
    }
  }

  // Setup key handling
  const debouncedHandler = createKeyHandler(handleKey)
  screen.on('keypress', (_ch: string, key: KeyEvent) => {
    if (!key) return
    debouncedHandler(key)
  })

  // Initial render
  renderMenu()
}
