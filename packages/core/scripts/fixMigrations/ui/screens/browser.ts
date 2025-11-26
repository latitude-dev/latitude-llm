import chalk from 'chalk'

import type { KeyEvent, Migration } from '../../types'
import {
  createScreen,
  safeExit,
  safeDestroy,
  createKeyHandler,
  isUpKey,
  isDownKey,
  isEnterKey,
  isBackKey,
  isQuitKey,
  isPageUpKey,
  isPageDownKey,
  isHomeKey,
  isEndKey,
  isScrollUpKey,
  isScrollDownKey,
} from '../screen'
import {
  createPreviewPanel,
  createDetailsPanel,
  createStatusBar,
  createListPanel,
} from '../components'
import { showActionScreen } from './actions'

export type BrowserScreenResult =
  | { type: 'quit' }
  | { type: 'refresh' }
  | { type: 'action'; migration: Migration }

/**
 * Create and show the migration browser screen
 */
export function showBrowserScreen(
  migrations: Migration[],
  showOnlyUnapplied: boolean,
  refreshCallback: () => Promise<void>,
): void {
  const filteredAsc = showOnlyUnapplied
    ? migrations.filter((m) => !m.isApplied)
    : migrations

  // Handle empty state
  if (filteredAsc.length === 0) {
    console.log(chalk.green('\n✅ All migrations are applied!\n'))
    process.exit(0)
  }

  // Reverse to show newest first (DESC order)
  const filtered = [...filteredAsc].reverse()

  const screen = createScreen('Migration Browser')

  // State
  let currentIndex = 0 // Start at first item (newest)

  // Create UI components
  const preview = createPreviewPanel(screen)
  const details = createDetailsPanel(screen)
  const list = createListPanel(screen)
  const statusBar = createStatusBar(screen)

  // Refresh all UI components
  function refresh(): void {
    const migration = filtered[currentIndex]!
    preview.update(migration)
    details.update(migration)
    list.render(filtered, currentIndex, showOnlyUnapplied)
    statusBar.updateBrowser(migration, currentIndex + 1, filtered.length)
    screen.render()
  }

  // Handle navigation and actions
  function handleKey(key: KeyEvent): void {
    // Navigation up
    if (isUpKey(key)) {
      if (currentIndex > 0) {
        currentIndex--
        refresh()
      }
      return
    }

    // Navigation down
    if (isDownKey(key)) {
      if (currentIndex < filtered.length - 1) {
        currentIndex++
        refresh()
      }
      return
    }

    // Jump to start
    if (isHomeKey(key)) {
      currentIndex = 0
      refresh()
      return
    }

    // Jump to end
    if (isEndKey(key)) {
      currentIndex = filtered.length - 1
      refresh()
      return
    }

    // Page up
    if (isPageUpKey(key)) {
      currentIndex = Math.max(0, currentIndex - 10)
      refresh()
      return
    }

    // Page down
    if (isPageDownKey(key)) {
      currentIndex = Math.min(filtered.length - 1, currentIndex + 10)
      refresh()
      return
    }

    // Scroll preview up
    if (isScrollUpKey(key)) {
      preview.scrollUp()
      screen.render()
      return
    }

    // Scroll preview down
    if (isScrollDownKey(key)) {
      preview.scrollDown()
      screen.render()
      return
    }

    // Open action screen
    if (isEnterKey(key)) {
      openActionScreen()
      return
    }

    // Quit
    if (isBackKey(key) || isQuitKey(key)) {
      safeExit(screen, 0)
    }
  }

  // Open the action screen for the current migration
  async function openActionScreen(): Promise<void> {
    const migration = filtered[currentIndex]!
    safeDestroy(screen)
    await showActionScreen(migration, showOnlyUnapplied, refreshCallback)
  }

  // Setup key handling with debounce
  // Prevent the Enter key from the previous screen from triggering immediately
  let initialized = false
  setTimeout(() => {
    initialized = true
  }, 100)

  const debouncedHandler = createKeyHandler(handleKey)
  screen.on('keypress', (_ch: string, key: KeyEvent) => {
    if (!key || !initialized) return
    debouncedHandler(key)
  })

  // Initial render
  refresh()
}
