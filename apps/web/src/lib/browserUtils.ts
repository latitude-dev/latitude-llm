/**
 * Returns the appropriate modifier key name based on the user's operating system.
 * On macOS, it returns 'Meta' (Command key), while on other platforms, it returns 'Control'.
 */
export function getModifierKey() {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

  if (isMac) {
    return { symbol: '⌘', name: 'Meta' }
  }

  return { symbol: 'Ctrl', name: 'Control' }
}
