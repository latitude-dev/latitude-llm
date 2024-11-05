import CompileError from '$compiler/error/error'
import { describe, expect, it } from 'vitest'

import parse from '..'
import { TemplateNode } from '../interfaces'

const getExpectedError = <T>(
  action: () => void,
  errorClass: new () => T,
): T => {
  try {
    action()
  } catch (err) {
    expect(err).toBeInstanceOf(errorClass)
    return err as T
  }
  throw new Error('Expected an error to be thrown')
}

describe('Mustache', () => {
  it('parses content between the mustache tag delimiters as mustage nodes', () => {
    const prompt = '{{ test }}'
    const fragment = parse(prompt)
    expect(fragment.children.length).toBe(1)
    expect(fragment.children[0]!.type).toBe('MustacheTag')
  })

  it('throws an error if the mustache tag is not closed', () => {
    const prompt = '{{ test'
    const error = getExpectedError(() => parse(prompt), CompileError)
    expect(error.code).toBe('unexpected-eof')
  })

  it('returns an IfBlock node if the mustache tag contains an if statement', () => {
    const prompt = '{{ if test }} something {{ endif }}'
    const fragment = parse(prompt)
    expect(fragment.children.length).toBe(1)
    expect(fragment.children[0]!.type).toBe('IfBlock')
  })

  it('fails if an IfBlock has not been closed', () => {
    const prompt = '{{ if test }} something'
    const error = getExpectedError(() => parse(prompt), CompileError)
    expect(error.code).toBe('unclosed-block')
  })

  it('returns the correct expression', () => {
    const prompt = '{{ if test == 3 }} something {{ endif }}'
    const fragment = parse(prompt)
    const ifBlock = fragment.children[0] as TemplateNode
    expect(ifBlock.type).toBe('IfBlock')
    const expression = ifBlock.expression
    expect(expression.type).toBe('BinaryExpression')
    const left = expression.left
    const right = expression.right
    expect(left.type).toBe('Identifier')
    expect(left.name).toBe('test')
    expect(right.type).toBe('Literal')
    expect(right.value).toBe(3)
  })

  it('returns an ElseBlock node if the mustache tag contains an else statement', () => {
    const prompt =
      '{{ if test }} something {{ else }} something else {{ endif }}'
    const fragment = parse(prompt)
    expect(fragment.children.length).toBe(1)
    expect(fragment.children[0]!.type).toBe('IfBlock')
    const ifBlock = fragment.children[0] as TemplateNode
    expect(ifBlock.else).toBeDefined()
    expect(ifBlock.else!.type).toBe('ElseBlock')
  })

  it('fails if an else statement is not within an if block', () => {
    const prompt = '{{ else }}'
    const error = getExpectedError(() => parse(prompt), CompileError)
    expect(error.code).toBe('invalid-else-placement')
  })

  it('ElseBlock has a condition when followed by an if', () => {
    const prompt =
      '{{ if test }} something {{ else if test2 }} something else {{ endif }}'
    const fragment = parse(prompt)
    expect(fragment.children.length).toBe(1)
    const ifBlock = fragment.children[0] as TemplateNode
    expect(ifBlock.type).toBe('IfBlock')

    expect(ifBlock.else).toBeDefined()
    const elseBlocks = ifBlock.else
    expect(elseBlocks.children.length).toBe(1)

    const elseBlock = elseBlocks.children[0] as TemplateNode
    expect(elseBlock.type).toBe('IfBlock')
    expect(elseBlock.expression).toBeDefined()
  })

  it('returns a chain of else if as a family of IfBlocks', () => {
    const prompt =
      '{{ if a }} a {{ else if b }} b {{ else if c }} c {{ else if d }} d {{ endif }}'
    const fragment = parse(prompt)
    expect(fragment.children.length).toBe(1)

    const aBlock = fragment.children[0] as TemplateNode
    expect(aBlock.type).toBe('IfBlock')
    expect(aBlock.else).toBeDefined()
    expect(aBlock.else.type).toBe('ElseBlock')

    const bBlock = aBlock.else!.children[0] as TemplateNode
    expect(bBlock.type).toBe('IfBlock')
    expect(bBlock.else).toBeDefined()
    expect(bBlock.else!.type).toBe('ElseBlock')

    const cBlock = bBlock.else!.children[0] as TemplateNode
    expect(cBlock.type).toBe('IfBlock')
    expect(cBlock.else).toBeDefined()
    expect(cBlock.else!.type).toBe('ElseBlock')

    const dBlock = cBlock.else!.children[0] as TemplateNode
    expect(dBlock.type).toBe('IfBlock')
    expect(dBlock.else).toBeUndefined()
  })

  it('fails if there is another else statement after an else statement without an if', () => {
    const prompt = '{{ if test }} a {{ else }} b {{ else }} c {{ endif }}'
    const error = getExpectedError(() => parse(prompt), CompileError)
    expect(error.code).toBe('invalid-else-placement')
  })

  it('returns a ForBlock node if the mustache tag contains a for statement', () => {
    const prompt = '{{ for item in items }} something {{ endfor }}'
    const fragment = parse(prompt)
    expect(fragment.children.length).toBe(1)
    expect(fragment.children[0]!.type).toBe('ForBlock')
  })

  it('fails if a ForBlock has not been closed', () => {
    const prompt = '{{ for item in items }} something'
    const error = getExpectedError(() => parse(prompt), CompileError)
    expect(error.code).toBe('unclosed-block')
  })

  it('fails when an IfBlock is closed with an endfor, and the other way around', () => {
    const prompt1 = '{{ if test }} something {{ endfor }}'
    const prompt2 = '{{ for item in items }} something {{ endif }}'
    const error1 = getExpectedError(() => parse(prompt1), CompileError)
    const error2 = getExpectedError(() => parse(prompt2), CompileError)
    expect(error1.code).toBe('unexpected-block-close')
    expect(error2.code).toBe('unexpected-block-close')
  })

  it('returns the correct expression, index and context', () => {
    const prompt = '{{ for item, i in list }} something {{ endfor }}'
    const fragment = parse(prompt)
    const forBlock = fragment.children[0] as TemplateNode
    expect(forBlock.type).toBe('ForBlock')

    expect(forBlock.context).toBeDefined()
    expect(forBlock.context!.type).toBe('Identifier')
    expect(forBlock.context!.name).toBe('item')

    expect(forBlock.index).toBeDefined()
    expect(forBlock.index!.type).toBe('Identifier')
    expect(forBlock.index!.name).toBe('i')

    expect(forBlock.expression).toBeDefined()
    expect(forBlock.expression!.type).toBe('Identifier')
    expect(forBlock.expression!.name).toBe('list')
  })

  it('returns an else block within a for block', () => {
    const prompt =
      '{{ for item in list }} content {{ else }} empty {{ endfor }}'
    const fragment = parse(prompt)
    const forBlock = fragment.children[0] as TemplateNode
    expect(forBlock.type).toBe('ForBlock')
    expect(forBlock.else).toBeDefined()
    expect(forBlock.else!.type).toBe('ElseBlock')
  })
})
