import { Parser } from '..'
import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '../../constants'
import { config } from './config'
import { multiLineComment } from './multi_line_comment'
import { mustache } from './mustache'
import { tag } from './tag'
import { text } from './text'

export default function fragment(parser: Parser): (parser: Parser) => void {
  if (parser.match('<')) {
    return tag
  }
  if (parser.match(CUSTOM_TAG_START) || parser.match(CUSTOM_TAG_END)) {
    return mustache
  }
  if (parser.match('/*') || parser.match('*/')) {
    return multiLineComment
  }
  if (parser.match('---')) {
    // Only parse config if it's the first thing in the file
    const isFirst = parser.template.slice(0, parser.index).trim() === '' // Ignore any whitespace
    if (isFirst) {
      return config
    }
  }

  return text
}
