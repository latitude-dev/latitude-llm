import type CompileError from '$promptl/error/error'
import PARSER_ERRORS from '$promptl/error/errors'
import { parseExpressionAt } from '$promptl/parser/utils/acorn'
import {
  getBracketClose,
  isBracketClose,
  isBracketOpen,
  isBracketPair,
} from '$promptl/parser/utils/bracket'
import fullCharCodeAt from '$promptl/parser/utils/full_char_code_at'
import { isIdentifierStart } from 'acorn'
import { Pattern } from 'estree'

import { Parser } from '..'

export default function readContext(
  parser: Parser,
): Pattern & { start: number; end: number } {
  const start = parser.index
  let i = parser.index

  const code = fullCharCodeAt(parser.template, i)
  if (isIdentifierStart(code, true)) {
    return {
      type: 'Identifier',
      name: parser.readIdentifier()!,
      start,
      end: parser.index,
    }
  }

  if (!isBracketOpen(code)) {
    parser.error(PARSER_ERRORS.unexpectedTokenDestructure)
  }

  const bracketStack: number[] = [code]
  i += code <= 0xffff ? 1 : 2

  while (i < parser.template.length) {
    const code = fullCharCodeAt(parser.template, i)
    if (isBracketOpen(code)) {
      bracketStack.push(code)
    } else if (isBracketClose(code)) {
      if (!isBracketPair(bracketStack[bracketStack.length - 1]!, code)) {
        parser.error(
          PARSER_ERRORS.unexpectedToken(
            String.fromCharCode(
              getBracketClose(bracketStack[bracketStack.length - 1]!) ?? 0,
            ),
          ),
        )
      }
      bracketStack.pop()
      if (bracketStack.length === 0) {
        i += code <= 0xffff ? 1 : 2
        break
      }
    }
    i += code <= 0xffff ? 1 : 2
  }

  parser.index = i

  const patternString = parser.template.slice(start, i)
  try {
    // the length of the `space_with_newline` has to be start - 1
    // because we added a `(` in front of the pattern_string,
    // which shifted the entire string to right by 1
    // so we offset it by removing 1 character in the `space_with_newline`
    // to achieve that, we remove the 1st space encountered,
    // so it will not affect the `column` of the node
    let spaceWithNewLine = parser.template
      .slice(0, start)
      .replace(/[^\n]/g, ' ')
    const firstSpace = spaceWithNewLine.indexOf(' ')
    spaceWithNewLine =
      spaceWithNewLine.slice(0, firstSpace) +
      spaceWithNewLine.slice(firstSpace + 1)

    return parseExpressionAt(
      `${spaceWithNewLine}(${patternString} = 1)`,
      start - 1,
    ).left
  } catch (error) {
    parser.acornError(error as CompileError)
  }

  return {
    type: 'Identifier',
    name: '',
    start: parser.index,
    end: parser.index,
  }
}
