const SQUARE_BRACKET_OPEN = '['.charCodeAt(0)
const SQUARE_BRACKET_CLOSE = ']'.charCodeAt(0)
const CURLY_BRACKET_OPEN = '{'.charCodeAt(0)
const CURLY_BRACKET_CLOSE = '}'.charCodeAt(0)

export function isBracketOpen(code: number) {
  return code === SQUARE_BRACKET_OPEN || code === CURLY_BRACKET_OPEN
}

export function isBracketClose(code: number) {
  return code === SQUARE_BRACKET_CLOSE || code === CURLY_BRACKET_CLOSE
}

export function isBracketPair(open: number, close: number) {
  return (
    (open === SQUARE_BRACKET_OPEN && close === SQUARE_BRACKET_CLOSE) ||
    (open === CURLY_BRACKET_OPEN && close === CURLY_BRACKET_CLOSE)
  )
}

export function getBracketClose(open: number): number | undefined {
  if (open === SQUARE_BRACKET_OPEN) {
    return SQUARE_BRACKET_CLOSE
  }
  if (open === CURLY_BRACKET_OPEN) {
    return CURLY_BRACKET_CLOSE
  }
}
