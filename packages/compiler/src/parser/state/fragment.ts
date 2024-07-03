import { Parser } from '..'
import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '../constants'
import { multiLineComment } from './multi_line_comment'
import { mustache } from './mustache'
import { text } from './text'

export default function fragment(parser: Parser): (parser: Parser) => void {
  if (parser.match(CUSTOM_TAG_START) || parser.match(CUSTOM_TAG_END)) {
    return mustache
  }
  if (parser.match('/*') || parser.match('*/')) {
    return multiLineComment
  }

  return text
}
