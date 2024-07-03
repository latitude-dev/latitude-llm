import { Parser } from '..'
import CompileError from '../../error/error'
import PARSER_ERRORS from '../../error/errors'
import { parseExpressionAt } from '../utils/acorn'

export default function readExpression(parser: Parser) {
  try {
    const node = parseExpressionAt(parser.template, parser.index)

    let numParenthesis = 0

    for (let i = parser.index; i < node.start; i += 1) {
      if (parser.template[i] === '(') numParenthesis += 1
    }

    let index = node.end
    while (numParenthesis > 0) {
      const char = parser.template[index]

      if (char === ')') {
        numParenthesis -= 1
      } else if (!/\s/.test(char!)) {
        parser.error(PARSER_ERRORS.unexpectedToken(')'), index)
      }

      index += 1
    }

    parser.index = index

    return node
  } catch (err) {
    parser.acornError(err as CompileError)
  }
}
