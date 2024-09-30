import { CUSTOM_TAG_START } from '$compiler/constants'
import { type Parser } from '$compiler/parser'
import type { Text } from '$compiler/parser/interfaces'

const ENDS_WITH_ESCAPE_REGEX = /(?<!\\)(\\\\)*\\$/
const RESERVED_DELIMITERS = [CUSTOM_TAG_START, '/*', '<']

export function text(parser: Parser) {
  const start = parser.index
  let data = ''

  while (parser.index < parser.template.length) {
    const isEscaping = ENDS_WITH_ESCAPE_REGEX.test(data)
    if (isEscaping) data = data.slice(0, -1) // Remove the escape character

    if (!isEscaping && parser.matchRegex(/-{3}(?!-)/)) {
      // Detecting ONLY 3 consecutive dashes
      break
    }

    if (
      !isEscaping &&
      RESERVED_DELIMITERS.some((sample) => parser.match(sample))
    ) {
      break
    }

    const nonConfigDashes = parser.matchRegex(/-+/)
    if (nonConfigDashes) {
      data += nonConfigDashes
      parser.index += nonConfigDashes.length
    } else {
      data += parser.template[parser.index++]
    }
  }

  const node = {
    start,
    end: parser.index,
    type: 'Text',
    raw: data,
    data: data.replace(/(?<!\\)\\{{/g, '{{').replace(/(?<!\\)\\}}/g, '}}'),
  } as Text

  parser.current().children!.push(node)
}
