import { type Parser } from '..'
import { CUSTOM_TAG_START } from '../constants'

const ENDS_WITH_ESCAPE_REGEX = /(?<!\\)(\\\\)*\\$/
const RESERVED_DELIMITERS = [CUSTOM_TAG_START, '/*', '<', '---']

export function text(parser: Parser) {
  const start = parser.index
  let data = ''

  while (parser.index < parser.template.length) {
    const isEscaping = ENDS_WITH_ESCAPE_REGEX.test(data)
    if (isEscaping) data = data.slice(0, -1) // Remove the escape character

    if (
      !isEscaping &&
      RESERVED_DELIMITERS.some((sample) => parser.match(sample))
    ) {
      break
    }
    data += parser.template[parser.index++]
  }

  const node = {
    start,
    end: parser.index,
    type: 'Text',
    raw: data,
    data: data.replace(/(?<!\\)\\{{/g, '{{').replace(/(?<!\\)\\}}/g, '}}'),
  }

  parser.current().children!.push(node)
}
