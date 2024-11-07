import { CUSTOM_TAG_END, CUSTOM_TAG_START, KEYWORDS } from '$promptl/constants'
import PARSER_ERRORS from '$promptl/error/errors'
import { type Parser } from '$promptl/parser'
import type {
  BaseNode,
  ElseBlock,
  ForBlock,
  IfBlock,
} from '$promptl/parser/interfaces'
import readContext from '$promptl/parser/read/context'
import readExpression from '$promptl/parser/read/expression'

export function mustache(parser: Parser) {
  if (parser.match(CUSTOM_TAG_END)) {
    parser.error(PARSER_ERRORS.unexpectedMustacheCloseTag)
  }
  const start = parser.index
  parser.index += CUSTOM_TAG_START.length
  parser.allowWhitespace()

  // endif / endfor
  const endKeyword = parser.eat(KEYWORDS.endif)
    ? KEYWORDS.endif
    : parser.eat(KEYWORDS.endfor)
      ? KEYWORDS.endfor
      : null

  if (endKeyword) {
    let block = parser.current() as BaseNode

    if (!['IfBlock', 'ForBlock', 'ElseBlock'].includes(block.type)) {
      parser.error(PARSER_ERRORS.unexpectedBlockClose)
    }

    if (
      (block.type === 'IfBlock' && endKeyword !== KEYWORDS.endif) ||
      (block.type === 'ForBlock' && endKeyword !== KEYWORDS.endfor)
    ) {
      parser.error(PARSER_ERRORS.unexpectedBlockClose)
    }

    if (block.type === 'ElseBlock') {
      // Pop the inner ElseBlock before popping the IfBlock
      block.end = start
      parser.stack.pop()
      block = parser.current()
    }

    parser.allowWhitespace()
    parser.eat(CUSTOM_TAG_END, true)

    while (block.elseif) {
      block.end = parser.index
      parser.stack.pop()
      block = parser.current()
      if (block.else) {
        block.else.end = start
      }
    }

    // strip leading/trailing whitespace as necessary
    const charBefore = parser.template[block.start! - 1]
    const charAfter = parser.template[parser.index]
    const trimBefore = !charBefore || /\s/.test(charBefore)
    const trimAfter = !charAfter || /\s/.test(charAfter)
    trimWhitespace(block, trimBefore, trimAfter)
    block.end = parser.index
    parser.stack.pop()
  } else if (parser.eat(KEYWORDS.else)) {
    // else

    if (parser.eat(KEYWORDS.if)) {
      parser.error(PARSER_ERRORS.invalidElseif)
    }
    parser.allowWhitespace()

    // else if
    if (parser.eat(KEYWORDS.if)) {
      const block = parser.current()
      if (block.type !== 'IfBlock') {
        parser.error(
          parser.stack.some((block) => block.type === 'IfBlock')
            ? PARSER_ERRORS.invalidElseifPlacementUnclosedBlock(toString(block))
            : PARSER_ERRORS.invalidElseifPlacementOutsideIf,
        )
      }
      parser.requireWhitespace()
      const expression = readExpression(parser)
      parser.allowWhitespace()
      parser.eat(CUSTOM_TAG_END, true)
      block.else = {
        start: parser.index,
        end: null,
        type: 'ElseBlock',
        children: [
          {
            start: parser.index,
            end: null,
            type: 'IfBlock',
            elseif: true,
            expression,
            children: [],
          },
        ] as BaseNode[],
      } as ElseBlock
      parser.stack.push(block.else.children![0])
    } else {
      // else (no if)
      const block = parser.current()
      if (!['IfBlock', 'ForBlock'].includes(block.type)) {
        parser.error(
          parser.stack.some(
            (block) => block.type === 'IfBlock' || block.type === 'ForBlock',
          )
            ? PARSER_ERRORS.invalidElsePlacementUnclosedBlock(toString(block))
            : PARSER_ERRORS.invalidElsePlacementOutsideIf,
        )
      }
      parser.allowWhitespace()
      parser.eat(CUSTOM_TAG_END, true)
      block.else = {
        start: parser.index,
        end: null,
        type: 'ElseBlock',
        children: [],
      }
      parser.stack.push(block.else)
    }
  } else if (parser.eat(KEYWORDS.if)) {
    // if
    parser.requireWhitespace()
    const expression = readExpression(parser)
    const block: BaseNode = {
      start,
      end: start,
      type: 'IfBlock',
      expression,
      children: [],
    }
    parser.allowWhitespace()
    parser.eat(CUSTOM_TAG_END, true)
    parser.current().children!.push(block as ForBlock | IfBlock)
    parser.stack.push(block)
  } else if (parser.eat(KEYWORDS.for)) {
    // for
    parser.requireWhitespace()

    // ForBlock values:
    //  - expression: the looped object
    //  - context: the current item in the loop
    //  - index: the current index in the loop
    // Syntax: {{ for context, index in expression }}

    const context = readContext(parser)
    const block: BaseNode = {
      start,
      end: start,
      type: 'ForBlock',
      context,
      children: [],
    }
    parser.allowWhitespace()

    if (parser.eat(',')) {
      parser.allowWhitespace()
      const start = parser.index
      const indexName = parser.readIdentifier()
      const end = parser.index
      if (!indexName) parser.error(PARSER_ERRORS.expectedName)
      block.index = {
        start,
        end,
        type: 'Identifier',
        name: indexName,
      }
      parser.allowWhitespace()
    }

    parser.eat(KEYWORDS.in, true)
    parser.requireWhitespace()

    block.expression = readExpression(parser)
    parser.allowWhitespace()

    parser.eat(CUSTOM_TAG_END, true)
    parser.current().children!.push(block as ForBlock | IfBlock)
    parser.stack.push(block)
  } else {
    const expression = readExpression(parser)
    parser.allowWhitespace()
    parser.eat(CUSTOM_TAG_END, true)
    parser.current().children!.push({
      start,
      end: parser.index,
      type: 'MustacheTag',
      expression,
    })
  }
}

function trimWhitespace(
  block: BaseNode,
  trimBefore: boolean = false,
  trimAfter: boolean = false,
) {
  if (!block.children || block.children.length === 0) return // AwaitBlock
  const firstChild = block.children[0]!
  const lastChild = block.children[block.children.length - 1]!
  if (firstChild.type === 'Text' && trimBefore) {
    firstChild.data = firstChild.data.replace(/^[ \t\r\n]*/, '')
    if (!firstChild.data) block.children.shift()
  }
  if (lastChild.type === 'Text' && trimAfter) {
    lastChild.data = lastChild.data.replace(/[ \t\r\n]*$/, '')
    if (!lastChild.data) block.children.pop()
  }
  if (block.else) {
    trimWhitespace(block.else, trimBefore, trimAfter)
  }
  if (firstChild.elseif) {
    trimWhitespace(firstChild, trimBefore, trimAfter)
  }
}

function toString(node: BaseNode) {
  switch (node.type) {
    case 'IfBlock':
      return `${CUSTOM_TAG_START}if${CUSTOM_TAG_END} block`
    case 'ElseBlock':
      return `${CUSTOM_TAG_START}else${CUSTOM_TAG_END} block`
    case 'ForBlock':
      return `${CUSTOM_TAG_START}for${CUSTOM_TAG_END} block`
    default:
      return node.type
  }
}
