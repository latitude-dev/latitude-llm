import { type Parser } from '..'
import PARSER_ERRORS from '../../error/errors'
import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '../constants'
import { type TemplateNode } from '../interfaces'
import readContext from '../read/context'
import readExpression from '../read/expression'

export function mustache(parser: Parser) {
  if (parser.match(CUSTOM_TAG_END)) {
    parser.error(PARSER_ERRORS.unexpectedMustacheCloseTag)
  }
  const start = parser.index
  parser.index += CUSTOM_TAG_START.length
  parser.allowWhitespace()
  // {{/if}}, {{/each}}, {{/await}} or {{/key}}
  if (parser.eat('/')) {
    let block = parser.current()
    let expected: string
    if (block.type === 'ElseBlock') {
      block.end = start
      parser.stack.pop()
      block = parser.current()
      expected = 'else'
    }
    if (block.type === 'IfBlock') {
      expected = 'if'
    } else if (block.type === 'EachBlock') {
      expected = 'each'
    } else {
      parser.error(PARSER_ERRORS.unexpectedBlockClose)
    }
    parser.eat(expected!, true)
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
  } else if (parser.eat(':else')) {
    if (parser.eat('if')) {
      parser.error(PARSER_ERRORS.invalidElseif)
    }
    parser.allowWhitespace()
    // :else if
    if (parser.eat('if')) {
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
        ],
      }
      parser.stack.push(block.else.children[0])
    } else {
      // :else
      const block = parser.current()
      if (block.type !== 'IfBlock' && block.type !== 'EachBlock') {
        parser.error(
          parser.stack.some(
            (block) => block.type === 'IfBlock' || block.type === 'EachBlock',
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
  } else if (parser.eat('#')) {
    // {{#if foo}}, {{#each foo}} or {{#await foo}}
    const isIf = parser.eat('if')
    const isEach = parser.eat('each')
    if (!isIf && !isEach) {
      parser.error(PARSER_ERRORS.expectedBlockType)
    }
    const type = isIf ? 'IfBlock' : 'EachBlock'
    parser.requireWhitespace()
    const expression = readExpression(parser)
    const block: TemplateNode = {
      start,
      end: start,
      type,
      expression,
      children: [],
    }
    parser.allowWhitespace()
    // {{#each}} blocks must declare a context – {{#each list as item}}
    if (type === 'EachBlock') {
      parser.eat('as', true)
      parser.requireWhitespace()
      block['context'] = readContext(parser)
      parser.allowWhitespace()
      if (parser.eat(',')) {
        parser.allowWhitespace()
        block.index = parser.readIdentifier()
        if (!block.index) parser.error(PARSER_ERRORS.expectedName)
        parser.allowWhitespace()
      }
      if (parser.eat('(')) {
        parser.allowWhitespace()
        block.key = readExpression(parser)
        parser.allowWhitespace()
        parser.eat(')', true)
        parser.allowWhitespace()
      }
    }
    parser.eat(CUSTOM_TAG_END, true)
    parser.current().children!.push(block)
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
  block: TemplateNode,
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

function toString(node: TemplateNode) {
  switch (node.type) {
    case 'IfBlock':
      return `${CUSTOM_TAG_START}#if${CUSTOM_TAG_END} block`
    case 'ElseBlock':
      return `${CUSTOM_TAG_START}:else${CUSTOM_TAG_END} block`
    case 'EachBlock':
      return `${CUSTOM_TAG_START}#each${CUSTOM_TAG_END} block`
    default:
      return node.type
  }
}
