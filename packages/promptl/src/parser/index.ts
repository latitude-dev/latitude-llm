import CompileError, { error } from '$promptl/error/error'
import PARSER_ERRORS from '$promptl/error/errors'
import { reserved } from '$promptl/utils/names'
import { isIdentifierChar, isIdentifierStart } from 'acorn'

import type { BaseNode, Fragment } from './interfaces'
import fragment from './state/fragment'
import fullCharCodeAt from './utils/full_char_code_at'

export default function parse(template: string) {
  return new Parser(template).parse()
}

type ParserState = (parser: Parser) => void | ParserState
type AutoClosedTag = { tag: string; reason: string; depth: number }

export class Parser {
  index: number = 0
  stack: BaseNode[] = []
  lastAutoClosedTag: AutoClosedTag | null = null
  fragment: Fragment

  constructor(public template: string) {
    this.fragment = {
      start: 0,
      end: this.template.length,
      type: 'Fragment',
      children: [],
    }
  }

  parse(): Fragment {
    try {
      return this._parse()
    } catch (err) {
      if (err instanceof CompileError) {
        throw err
      }
      this.error({
        code: 'parse-error',
        message: 'Syntax error',
      })
    }
  }

  _parse(): Fragment {
    this.stack.push(this.fragment)

    let state: ParserState = fragment
    while (this.index < this.template.length) {
      state = state(this) || fragment
    }
    if (this.stack.length > 1) {
      const current = this.current()
      this.error(
        {
          code: `unclosed-block`,
          message: `Block was left open`,
        },
        current.start! + 1,
      )
    }
    if (state !== fragment) {
      this.error({
        code: `unexpected-eof`,
        message: `Unexpected end of input`,
      })
    }
    if (this.fragment.children.length) {
      let start = this.fragment.children[0]!.start!
      while (/\s/.test(this.fragment[start])) start += 1
      let end = this.fragment.children[this.fragment.children.length - 1]!.end!
      while (/\s/.test(this.fragment[end - 1])) end -= 1
      this.fragment.start = start
      this.fragment.end = end
    } else {
      this.fragment.start = this.fragment.end = null
    }

    return this.fragment
  }

  current(): BaseNode {
    return this.stack[this.stack.length - 1]!
  }

  match(str: string) {
    return this.template.slice(this.index, this.index + str.length) === str
  }

  allowWhitespace() {
    while (
      this.index < this.template.length &&
      /\s/.test(this.template[this.index] || '')
    ) {
      this.index++
    }
  }

  requireWhitespace() {
    if (!/\s/.test(this.template[this.index]!)) {
      this.error({
        code: 'missing-whitespace',
        message: 'Expected whitespace',
      })
    }
    this.allowWhitespace()
  }

  eat(
    str: string,
    required: boolean = false,
    error?: { code: string; message: string },
  ) {
    if (this.match(str)) {
      this.index += str.length
      return true
    }
    if (required) {
      this.error(
        error ||
          (this.index === this.template.length
            ? PARSER_ERRORS.unexpectedEofToken(str)
            : PARSER_ERRORS.unexpectedToken(str)),
      )
    }
    return false
  }

  error(
    { code, message }: { code: string; message: string },
    index = this.index,
  ): never {
    error(message, {
      name: 'ParseError',
      code,
      source: this.template,
      start: index - 1,
      end: this.template.length,
      fragment: this.fragment,
    })
  }

  acornError(err: CompileError) {
    this.error(
      {
        code: 'parse-error',
        message: err.message.replace(/ \(\d+:\d+\)$/, ''),
      },
      err.pos,
    )
  }

  matchRegex(pattern: RegExp) {
    const match = pattern.exec(this.template.slice(this.index))
    if (!match || match.index !== 0) return null
    return match[0]
  }

  read(pattern: RegExp) {
    const result = this.matchRegex(pattern)
    if (result) this.index += result.length
    return result
  }

  readIdentifier(allowReserved: boolean = false) {
    const start = this.index
    let i = this.index
    const code = fullCharCodeAt(this.template, i)
    if (!isIdentifierStart(code, true)) return null
    i += code <= 0xffff ? 1 : 2
    while (i < this.template.length) {
      const code = fullCharCodeAt(this.template, i)
      if (!isIdentifierChar(code, true)) break
      i += code <= 0xffff ? 1 : 2
    }
    const identifier = this.template.slice(this.index, (this.index = i))
    if (!allowReserved && reserved.has(identifier)) {
      this.error(
        {
          code: 'unexpected-reserved-word',
          message: `'${identifier}' is a reserved word in JavaScript and cannot be used here`,
        },
        start,
      )
    }
    return identifier
  }

  readUntil(pattern: RegExp) {
    if (this.index >= this.template.length) {
      this.error(PARSER_ERRORS.unexpectedEof)
    }
    const start = this.index
    const match = pattern.exec(this.template.slice(this.index))
    if (match) {
      this.index = start + match.index
      return this.template.slice(start, this.index)
    }
    this.index = this.template.length
    return this.template.slice(start)
  }
}
