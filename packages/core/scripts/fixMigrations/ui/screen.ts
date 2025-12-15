import blessed from 'blessed'

import type { KeyEvent, Screen } from '../types'

/**
 * Create a new blessed screen with common configuration
 */
export function createScreen(title: string): Screen {
  return blessed.screen({
    smartCSR: true,
    title,
    fullUnicode: false,
  })
}

/**
 * Safely destroy a blessed screen and exit the process.
 * Suppresses terminal cleanup errors from blessed.
 */
export function safeExit(screen: Screen, code = 0): never {
  try {
    screen.destroy()
  } catch {
    // Ignore blessed terminal cleanup errors
  }
  process.exit(code)
}

/**
 * Safely destroy a screen without exiting
 */
export function safeDestroy(screen: Screen): void {
  try {
    screen.destroy()
  } catch {
    // Ignore blessed terminal cleanup errors
  }
}

/**
 * Key debouncing interval in milliseconds
 */
const KEY_DEBOUNCE_MS = 50

/**
 * Create a debounced key handler
 */
export function createKeyHandler(
  handler: (key: KeyEvent) => void,
): (key: KeyEvent) => void {
  let lastKeyTime = 0

  return (key: KeyEvent) => {
    const now = Date.now()
    if (now - lastKeyTime < KEY_DEBOUNCE_MS) return
    lastKeyTime = now
    handler(key)
  }
}

/**
 * Check if key is a navigation up key
 */
export function isUpKey(key: KeyEvent): boolean {
  return key.name === 'up' || key.name === 'k'
}

/**
 * Check if key is a navigation down key
 */
export function isDownKey(key: KeyEvent): boolean {
  return key.name === 'down' || key.name === 'j'
}

/**
 * Check if key is an enter/select key
 */
export function isEnterKey(key: KeyEvent): boolean {
  return key.name === 'enter' || key.name === 'return'
}

/**
 * Check if key is a back/escape key
 */
export function isBackKey(key: KeyEvent): boolean {
  return key.name === 'escape' || key.name === 'q'
}

/**
 * Check if key is a quit key (Ctrl+C)
 */
export function isQuitKey(key: KeyEvent): boolean {
  return !!key.ctrl && key.name === 'c'
}

/**
 * Check if key is page up
 */
export function isPageUpKey(key: KeyEvent): boolean {
  return key.name === 'pageup'
}

/**
 * Check if key is page down
 */
export function isPageDownKey(key: KeyEvent): boolean {
  return key.name === 'pagedown'
}

/**
 * Check if key is home key
 */
export function isHomeKey(key: KeyEvent): boolean {
  return key.name === 'home' || key.name === 'g'
}

/**
 * Check if key is end key
 */
export function isEndKey(key: KeyEvent): boolean {
  return key.name === 'end'
}

/**
 * Check if key is scroll up (Shift+Up)
 */
export function isScrollUpKey(key: KeyEvent): boolean {
  return !!key.shift && key.name === 'up'
}

/**
 * Check if key is scroll down (Shift+Down)
 */
export function isScrollDownKey(key: KeyEvent): boolean {
  return !!key.shift && key.name === 'down'
}
