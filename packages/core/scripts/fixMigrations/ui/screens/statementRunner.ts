import type { KeyEvent, Migration, OperationResult } from '../../types'
import {
  createScreen,
  safeDestroy,
  safeExit,
  createKeyHandler,
  isUpKey,
  isDownKey,
  isEnterKey,
  isBackKey,
  isQuitKey,
  isScrollUpKey,
  isScrollDownKey,
} from '../screen'
import { createStatusBar } from '../components'
import { executeMigrationSql } from '../../data'
import blessed from 'blessed'

/**
 * Parse SQL into individual statements using the drizzle breakpoint separator
 */
function parseStatements(sql: string): string[] {
  const separator = '--> statement-breakpoint'
  return sql
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Show the statement runner screen for executing individual SQL statements
 */
export async function showStatementRunnerScreen(
  migration: Migration,
  goBackCallback: () => Promise<void>,
): Promise<void> {
  const screen = createScreen('Run Individual Statements')
  const statements = parseStatements(migration.sql)

  // State
  let currentIndex = 0
  let isProcessing = false
  let lastResult: OperationResult | null = null

  // Create UI components
  const statusBar = createStatusBar(screen)

  // Create scrollable statement list (at top, expands)
  const statementList = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    bottom: 7, // Leave room for result box (3) + instruction box (3) + status bar (1)
    border: { type: 'line' },
    label: ` ${migration.fileName} - ${statements.length} statements `,
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
  screen.append(statementList)

  // Create result box (for success/error messages) - middle
  const resultBox = blessed.box({
    bottom: 4, // Above instruction box (3) + status bar (1)
    left: 0,
    width: '100%',
    height: 3,
    border: { type: 'line' },
    label: ' Result ',
    tags: true,
    style: {
      border: { fg: 'gray' },
    },
  })
  resultBox.setContent(' {dim}No statement executed yet{/}')
  screen.append(resultBox)

  // Create instruction box (key info) - bottom, just above status bar
  const instructionBox = blessed.box({
    bottom: 1, // Just above status bar
    left: 0,
    width: '100%',
    height: 3,
    border: { type: 'line' },
    label: ' Controls ',
    tags: true,
    style: {
      border: { fg: 'magenta' },
    },
  })
  instructionBox.setContent(
    ' {cyan-fg}{bold}↑↓{/}{/} Select statement {gray-fg}|{/} {cyan-fg}{bold}Enter{/}{/} Run selected {gray-fg}|{/} {cyan-fg}{bold}Esc/q{/}{/} Go back',
  )
  screen.append(instructionBox)

  // Render the statement list
  function renderStatements(): void {
    const availableHeight = (statementList.height as number) - 2 // Account for borders
    const lines: string[] = []

    statements.forEach((statement, index) => {
      const isSelected = index === currentIndex
      const linePrefix = isSelected ? '▶' : ' '

      // Truncate statement for display (single line preview)
      const preview = statement.replace(/\s+/g, ' ').substring(0, 100).trim()
      const suffix = statement.length > 100 ? '...' : ''

      if (isSelected) {
        lines.push(
          `{inverse} ${linePrefix} {bold}[${index + 1}]{/bold} ${preview}${suffix} {/inverse}`,
        )
      } else {
        lines.push(
          ` ${linePrefix} {cyan-fg}[${index + 1}]{/cyan-fg} ${preview}${suffix}`,
        )
      }
    })

    statementList.setContent(lines.join('\n'))

    // Ensure selected item is visible
    const scrollPos = Math.max(
      0,
      currentIndex - Math.floor(availableHeight / 2),
    )
    statementList.scrollTo(scrollPos)
  }

  // Update result display
  function updateResult(): void {
    if (!lastResult) {
      resultBox.setContent(' {dim}No statement executed yet{/}')
      resultBox.style.border = { fg: 'gray' }
      resultBox.setLabel(' Result ')
      return
    }

    if (lastResult.success) {
      resultBox.setContent(
        ` {green-fg}{bold}✓ Statement ${currentIndex + 1} executed successfully!{/bold}{/}`,
      )
      resultBox.style.border = { fg: 'green' }
      resultBox.setLabel(' {green-fg}Success{/} ')
    } else {
      const errorText =
        lastResult.error.length > 80
          ? lastResult.error.substring(0, 80) + '...'
          : lastResult.error
      resultBox.setContent(` {red-fg}{bold}✗ Error:{/bold} ${errorText}{/}`)
      resultBox.style.border = { fg: 'red' }
      resultBox.setLabel(' {red-fg}Error{/} ')
    }
  }

  // Update status bar
  function updateStatusBar(): void {
    statusBar.box.setContent(
      ` Statement {bold}${currentIndex + 1}{/}/${statements.length} {gray-fg}|{/} {cyan-fg}{bold}↑↓{/}{/} Navigate {gray-fg}|{/} {cyan-fg}{bold}Enter{/}{/} Run {gray-fg}|{/} {cyan-fg}{bold}Esc{/}{/} Back `,
    )
  }

  // Refresh all UI
  function refresh(): void {
    renderStatements()
    updateResult()
    updateStatusBar()
    screen.render()
  }

  // Run the selected statement
  async function runSelectedStatement(): Promise<void> {
    if (isProcessing) return

    isProcessing = true
    const statement = statements[currentIndex]!

    // Show processing state
    resultBox.setContent(
      ` {yellow-fg}Running statement ${currentIndex + 1}...{/}`,
    )
    resultBox.style.border = { fg: 'yellow' }
    resultBox.setLabel(' {yellow-fg}Processing{/} ')
    screen.render()

    // Execute the statement
    lastResult = await executeMigrationSql(statement)
    isProcessing = false
    refresh()
  }

  // Handle navigation and actions
  function handleKey(key: KeyEvent): void {
    if (isProcessing) return

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
      if (currentIndex < statements.length - 1) {
        currentIndex++
        refresh()
      }
      return
    }

    // Scroll preview up (Shift+Up)
    if (isScrollUpKey(key)) {
      statementList.scroll(-3)
      screen.render()
      return
    }

    // Scroll preview down (Shift+Down)
    if (isScrollDownKey(key)) {
      statementList.scroll(3)
      screen.render()
      return
    }

    // Execute selected statement
    if (isEnterKey(key)) {
      runSelectedStatement()
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

  // Go back to the action screen
  async function goBack(): Promise<void> {
    safeDestroy(screen)
    await goBackCallback()
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
