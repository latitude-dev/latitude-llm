import PARSER_ERRORS from '$compiler/error/errors'
import type { Comment } from '$compiler/parser/interfaces'

import type { Parser } from '..'

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
    end: parser.index,
    type: 'Comment',
    raw: data,
    data: data.substring(2, data.length - 2),
  } as Comment

  parser.current().children!.push(node)
}
