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
  isScrollUpKey,
  isScrollDownKey,
} from '../screen'
import {
  createPreviewPanel,
  createDetailsPanel,
  createStatusBar,
  createActionsPanel,
  type ActionItem,
} from '../components'
import {
  editMigration,
  runMigration,
  toggleMigrationStatus,
} from '../../actions'
import { showStatementRunnerScreen } from './statementRunner'

/**
 * Show the action selection screen for a migration
 */
export async function showActionScreen(
  initialMigration: Migration,
  showOnlyUnapplied: boolean,
  refreshCallback: () => Promise<void>,
): Promise<void> {
  const screen = createScreen('Migration Actions')

  // State
  let migration = initialMigration
  let actionIndex = 0
  let isProcessing = false
  let errorMessage: string | null = null

  // Create UI components
  const preview = createPreviewPanel(screen)
  const details = createDetailsPanel(screen)
  const actionsPanel = createActionsPanel(screen)
  const statusBar = createStatusBar(screen)

  // Adjust layout: expand preview, compact bottom panels
  // Layout: preview (top, expands) | details (7 lines) | actions (7 lines) | status (1 line)
  preview.setBottom(15) // 7 + 7 + 1 = 15
  details.setBottom(8) // 7 + 1 = 8

  // Get current actions
  function getActions(): ActionItem[] {
    return actionsPanel.getActions(migration)
  }

  // Refresh all UI components
  function refresh(): void {
    const actions = getActions()

    if (errorMessage) {
      preview.showError(errorMessage)
    } else {
      preview.update(migration)
    }

    details.update(migration)
    actionsPanel.render(actions, actionIndex)
    statusBar.updateAction(migration)
    screen.render()
  }

  // Handle navigation and actions
  function handleKey(key: KeyEvent): void {
    if (isProcessing) return

    const actions = getActions()

    // Navigation up
    if (isUpKey(key)) {
      if (actionIndex > 0) {
        actionIndex--
        refresh()
      }
      return
    }

    // Navigation down
    if (isDownKey(key)) {
      if (actionIndex < actions.length - 1) {
        actionIndex++
        refresh()
      }
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

    // Execute selected action
    if (isEnterKey(key)) {
      const selectedAction = actions[actionIndex]!.value
      executeAction(selectedAction)
      return
    }

    // Go back
    if (isBackKey(key)) {
      goBack()
      return
    }

    // Quit
    if (isQuitKey(key)) {
      safeExit(screen, 0)
    }
  }

  // Execute the selected action
  async function executeAction(action: string): Promise<void> {
    switch (action) {
      case 'edit':
        await handleEdit()
        break
      case 'run':
        await handleRun()
        break
      case 'run_statement':
        await handleRunStatement()
        break
      case 'toggle':
        await handleToggle()
        break
      case 'back':
        goBack()
        break
    }
  }

  // Handle edit action
  async function handleEdit(): Promise<void> {
    safeDestroy(screen)
    await editMigration(migration)
    process.exit(0)
  }

  // Handle run action
  async function handleRun(): Promise<void> {
    isProcessing = true
    errorMessage = null
    statusBar.setProcessing('Running migration...')
    screen.render()

    const result = await runMigration(migration)

    if (result.success) {
      if (!migration.isApplied) {
        migration = {
          ...migration,
          isApplied: true,
          appliedAt: migration.createdAt,
        }
      }
      preview.showSuccess('Migration executed successfully!')
    } else {
      errorMessage = result.error
    }

    isProcessing = false
    refresh()
  }

  // Handle run single statement action
  async function handleRunStatement(): Promise<void> {
    safeDestroy(screen)
    // Create a callback that returns to this action screen
    const returnCallback = async () => {
      await showActionScreen(migration, showOnlyUnapplied, refreshCallback)
    }
    await showStatementRunnerScreen(migration, returnCallback)
  }

  // Handle toggle action
  async function handleToggle(): Promise<void> {
    isProcessing = true
    const message = migration.isApplied
      ? 'Removing from applied...'
      : 'Marking as applied...'
    statusBar.setProcessing(message)
    screen.render()

    const result = await toggleMigrationStatus(migration)

    if (result.success) {
      migration = {
        ...migration,
        isApplied: !migration.isApplied,
        appliedAt: migration.isApplied ? null : migration.createdAt,
      }
      errorMessage = null
    } else {
      errorMessage = result.error
    }

    isProcessing = false
    refresh()
  }

  // Go back to the browser screen
  async function goBack(): Promise<void> {
    safeDestroy(screen)
    await refreshCallback()
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
