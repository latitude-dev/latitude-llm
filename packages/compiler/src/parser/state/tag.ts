import { type Parser } from '..'
import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '../../constants'
import CompileError from '../../error/error'
import PARSER_ERRORS from '../../error/errors'
import { Attribute, ElementTag, TemplateNode, Text } from '../interfaces'
import read_expression from '../read/expression'
import { decode_character_references } from '../utils/html'

const validTagName = /^\!?[a-zA-Z]{1,}:?[a-zA-Z0-9\-]*/

/** Invalid attribute characters if the attribute is not surrounded by quotes */
const regexStartsWithInvalidAttrValue = /^(\/>|[\s"'=<>`])/
const regexClosingComment = /-->/

export function tag(parser: Parser) {
  const start = parser.index++
  let parent = parser.current()
  if (parser.eat('!--')) {
    const data = parser.readUntil(regexClosingComment)
    parser.eat('-->', true, PARSER_ERRORS.unclosedComment)
    parser.current().children?.push({
      start,
      end: parser.index,
      type: 'Comment',
      raw: data,
      data,
    })
    return
  }
  const isClosingTag = parser.eat('/')
  const name = readTagName(parser)

  const element: ElementTag = {
    start,
    end: null,
    type: 'ElementTag',
    name: name as ElementTag['name'],
    attributes: [],
    children: [],
  }
  parser.allowWhitespace()
  if (isClosingTag) {
    parser.eat('>', true)
    while (parent.name !== name) {
      parent.end = start
      parser.stack.pop()
      if (parser.stack.length === 0) {
        parser.error(PARSER_ERRORS.unexpectedTagClose(name), start)
      }
      parent = parser.current()
    }
    parent.end = parser.index
    parser.stack.pop()
    if (
      parser.lastAutoClosedTag &&
      parser.stack.length < parser.lastAutoClosedTag.depth
    ) {
      parser.lastAutoClosedTag = null
    }
    return
  }

  const uniqueNames = new Set<string>()
  let attribute: Attribute | null
  while ((attribute = readAttribute(parser, uniqueNames))) {
    element.attributes.push(attribute)
    parser.allowWhitespace()
  }
  parser.current().children?.push(element)
  const self_closing = parser.eat('/')
  parser.eat('>', true)
  if (self_closing) {
    // don't push self-closing elements onto the stack
    element.end = parser.index
  } else {
    parser.stack.push(element)
  }
}
const regexWhitespaceOrSlashOrClosingTag = /(\s|\/|>)/

function readTagName(parser: Parser) {
  const start = parser.index
  const name = parser.readUntil(regexWhitespaceOrSlashOrClosingTag)
  if (!validTagName.test(name)) {
    parser.error(PARSER_ERRORS.invalidTagName, start)
  }
  return name
}
// eslint-disable-next-line no-useless-escape
const regex_token_ending_character = /[\s=\/>"']/
const regex_starts_with_quote_characters = /^["']/

function readAttribute(
  parser: Parser,
  uniqueNames: Set<string>,
): Attribute | null {
  const start = parser.index

  function checkUnique(name: string) {
    if (uniqueNames.has(name)) {
      parser.error(PARSER_ERRORS.duplicateAttribute, start)
    }
    uniqueNames.add(name)
  }
  const name = parser.readUntil(regex_token_ending_character)
  if (!name) return null
  let end = parser.index
  parser.allowWhitespace()

  let value: any[] | true = true
  if (parser.eat('=')) {
    parser.allowWhitespace()
    value = readAttributeValue(parser)
    end = parser.index
  } else if (parser.matchRegex(regex_starts_with_quote_characters)) {
    parser.error(PARSER_ERRORS.unexpectedToken('='), parser.index)
  }
  checkUnique(name)
  return {
    start,
    end,
    type: 'Attribute',
    name,
    value,
  }
}

function readAttributeValue(parser: Parser) {
  const quoteMark = parser.eat("'") ? "'" : parser.eat('"') ? '"' : null
  if (quoteMark && parser.eat(quoteMark)) {
    return [
      {
        start: parser.index - 1,
        end: parser.index - 1,
        type: 'Text',
        raw: '',
        data: '',
      },
    ]
  }
  let value: TemplateNode[] = []
  try {
    value = readSequence(
      parser,
      () => {
        // handle common case of quote marks existing outside of regex for performance reasons
        if (quoteMark) return parser.match(quoteMark)
        return !!parser.matchRegex(regexStartsWithInvalidAttrValue)
      },
      'in attribute value',
    )
  } catch (e) {
    const error = e as CompileError
    if (error.code === 'parse-error') {
      // if the attribute value didn't close + self-closing tag
      // eg: `<Component test={{a:1} />`
      // acorn may throw a `Unterminated regular expression` because of `/>`
      if (parser.template.slice(error.pos! - 1, error.pos! + 1) === '/>') {
        parser.index = error.pos!
        parser.error(
          PARSER_ERRORS.unclosedAttributeValue(quoteMark || CUSTOM_TAG_END),
        )
      }
    }
    throw error
  }
  if (value.length === 0 && !quoteMark) {
    parser.error(PARSER_ERRORS.missingAttributeValue)
  }
  if (quoteMark) parser.index += 1
  return value
}

function readSequence(
  parser: Parser,
  done: () => boolean,
  location: string,
): TemplateNode[] {
  let currentChunk: Text = {
    start: parser.index,
    end: null,
    type: 'Text',
    raw: '',
    data: '',
  }

  const chunks: TemplateNode[] = []

  function flush(end: number) {
    if (currentChunk.raw) {
      currentChunk.data = decode_character_references(currentChunk.raw, true)
      currentChunk.end = end
      chunks.push(currentChunk)
    }
  }
  while (parser.index < parser.template.length) {
    const index = parser.index
    if (done()) {
      flush(parser.index)
      return chunks
    } else if (parser.eat(CUSTOM_TAG_START)) {
      if (parser.match('#')) {
        const index = parser.index - 1
        parser.eat('#')
        const name = parser.readUntil(/[^a-z]/)
        parser.error(
          PARSER_ERRORS.invalidLogicBlockPlacement(location, name),
          index,
        )
      }
      flush(parser.index - 1)
      parser.allowWhitespace()
      const expression = read_expression(parser)
      parser.allowWhitespace()
      parser.eat(CUSTOM_TAG_END, true)
      chunks.push({
        start: index,
        end: parser.index,
        type: 'MustacheTag',
        expression,
      })
      currentChunk = {
        start: parser.index,
        end: null,
        type: 'Text',
        raw: '',
        data: '',
      }
    } else {
      currentChunk.raw += parser.template[parser.index++]
    }
  }
  parser.error(PARSER_ERRORS.unexpectedEof)
}
