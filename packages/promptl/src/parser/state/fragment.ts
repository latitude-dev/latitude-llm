import {
  CUSTOM_TAG_END,
  CUSTOM_TAG_START,
  RESERVED_TAGS,
} from '$promptl/constants'

import { Parser } from '..'
import { config } from './config'
import { multiLineComment } from './multi_line_comment'
import { mustache } from './mustache'
import { tag } from './tag'
import { text } from './text'

export default function fragment(parser: Parser): (parser: Parser) => void {
  if (
    parser.matchRegex(new RegExp(`^</?(${RESERVED_TAGS.join('|')})`)) ||
    parser.match('<!--')
  ) {
    return tag
  }
  if (parser.match(CUSTOM_TAG_START) || parser.match(CUSTOM_TAG_END)) {
    return mustache
  }
  if (parser.match('/*') || parser.match('*/')) {
    return multiLineComment
  }
  if (parser.matchRegex(/-{3}(?!-)/)) {
    return config
  }

  return text
}
