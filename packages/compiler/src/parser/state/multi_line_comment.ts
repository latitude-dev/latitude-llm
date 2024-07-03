import { Parser } from '..'
import PARSER_ERRORS from '../../error/errors'

export function multiLineComment(parser: Parser) {
  if (parser.match('*/')) {
    parser.error(PARSER_ERRORS.unexpectedEndOfComment)
  }

  const start = parser.index

  while (parser.index < parser.template.length) {
    if (parser.matchRegex(/\*\//)) {
      parser.index += 2
      break
    }
    parser.index++
  }

  const data = parser.template.substring(start, parser.index)

  const node = {
    start,
    end: parser.index + 1,
    type: 'Comment',
    raw: data,
    data: data.substring(2, data.length - 2),
  }

  parser.current().children!.push(node)
}
