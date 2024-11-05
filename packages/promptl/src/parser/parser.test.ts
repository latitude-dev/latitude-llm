import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '$compiler/constants'
import CompileError from '$compiler/error/error'
import { describe, expect, it } from 'vitest'

import parse from '.'
import { TemplateNode } from './interfaces'

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

describe('Fragment', () => {
  it('parses any string as a fragment', () => {
    const fragment = parse('hello world')
    expect(fragment.type).toBe('Fragment')
  })
})

describe('Text Block', () => {
  it('parses any regular string as a text block', () => {
    const text = 'hello world'
    const fragment = parse(text)
    expect(fragment.children.length).toBe(1)

    const textBlock = fragment.children[0]!
    expect(textBlock.type).toBe('Text')
    expect(textBlock.data).toBe(text)
  })

  it('keeps line breaks', () => {
    const text = 'hello\nworld'
    const fragment = parse(text)
    expect(fragment.children.length).toBe(1)

    const textBlock = fragment.children[0]!
    expect(textBlock.type).toBe('Text')
    expect(textBlock.data).toBe(text)
  })

  it('parses escaped brackets as text', () => {
    const text = `hello \\${CUSTOM_TAG_START} world`
    const expected = `hello ${CUSTOM_TAG_START} world`
    const fragment = parse(text)
    expect(fragment.children.length).toBe(1)

    const textBlock = fragment.children[0]!
    expect(textBlock.type).toBe('Text')
    expect(textBlock.data).toBe(expected)
  })
})

describe('Comments', () => {
  it('parses a multiline comment block', () => {
    const fragment = parse('/* hello\nworld */')
    expect(fragment.children.length).toBe(1)

    const commentBlock = fragment.children[0]!
    expect(commentBlock.type).toBe('Comment')
    expect(commentBlock.data).toBe(' hello\nworld ')
    expect(commentBlock.raw).toBe('/* hello\nworld */')
  })

  it('ignores brackets and any other block within a comment', () => {
    const fragment = parse(
      `
/* hello
  ${CUSTOM_TAG_START}#if condition${CUSTOM_TAG_END}then${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
world */
    `.trim(),
    )
    expect(fragment.children.length).toBe(1)

    const commentBlock = fragment.children[0]!
    expect(commentBlock.type).toBe('Comment')
    expect(commentBlock.data).toBe(
      ` hello\n  ${CUSTOM_TAG_START}#if condition${CUSTOM_TAG_END}then${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}\nworld `,
    )
  })

  it('Allows tag comments', () => {
    const fragment = parse('<!-- hello -->')
    expect(fragment.children.length).toBe(1)

    const commentBlock = fragment.children[0]!
    expect(commentBlock.type).toBe('Comment')
    expect(commentBlock.data).toBe(' hello ')
  })
})

describe('Tags', () => {
  it('parses any HTML-like tag', () => {
    const fragment = parse('<custom-tag></custom-tag>')
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe('custom-tag')
  })

  it('parses self closing tags', () => {
    const fragment = parse('<custom-tag />')
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe('custom-tag')
  })

  it('fails if there is no closing tag', () => {
    const action = () => parse('<custom-tag>')

    const error = getExpectedError(action, CompileError)
    expect(error.code).toBe('unclosed-block')
  })

  it('fails if the tag is not opened', () => {
    const action = () => parse('</custom-tag>')

    const error = getExpectedError(action, CompileError)
    expect(error.code).toBe('unexpected-tag-close')
  })

  it('fails if the tag is not closed', () => {
    const action = () => parse('<custom-tag')

    const error = getExpectedError(action, CompileError)
    expect(error.code).toBe('unexpected-eof')
  })

  it('Parses tags within tags', () => {
    const fragment = parse('<parent><child/></parent>')
    expect(fragment.children.length).toBe(1)

    const parent = fragment.children[0]!
    expect(parent.type).toBe('ElementTag')
    expect(parent.name).toBe('parent')
    expect(parent.children?.length).toBe(1)

    const child = parent.children![0]!
    expect(child.type).toBe('ElementTag')
    expect(child.name).toBe('child')
  })

  it('parses all attributes', () => {
    const fragment = parse(
      '<custom-tag attr1="value1" attr2="value2"></custom-tag>',
    )
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe('custom-tag')
    expect(tag.attributes.length).toBe(2)

    const attr1 = tag.attributes[0]!
    expect(attr1.type).toBe('Attribute')
    expect(attr1.name).toBe('attr1')
    const value1 = attr1.value as TemplateNode[]
    expect(value1.length).toBe(1)
    expect(value1[0]!.type).toBe('Text')
    expect(value1[0]!.data).toBe('value1')

    const attr2 = tag.attributes[1]!
    expect(attr2.type).toBe('Attribute')
    expect(attr2.name).toBe('attr2')
    const value2 = attr2.value as TemplateNode[]
    expect(value2.length).toBe(1)
    expect(value2[0]!.type).toBe('Text')
    expect(value2[0]!.data).toBe('value2')
  })

  it('Parses attribute vales as expressions when interpolated', () => {
    const fragment = parse(
      `<custom-tag attr=${CUSTOM_TAG_START}value${CUSTOM_TAG_END} />`,
    )
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe('custom-tag')
    expect(tag.attributes.length).toBe(1)

    const attr = tag.attributes[0]!
    expect(attr.type).toBe('Attribute')
    expect(attr.name).toBe('attr')
    const value = attr.value as TemplateNode[]
    expect(value.length).toBe(1)
    expect(value[0]!.type).toBe('MustacheTag')
    expect(value[0]!.expression).toBeTruthy()
  })

  it('Parses attributes with no value as true', () => {
    const fragment = parse(`<custom-tag attr />`)
    expect(fragment.children.length).toBe(1)

    const tag = fragment.children[0]!
    expect(tag.type).toBe('ElementTag')
    expect(tag.name).toBe('custom-tag')
    expect(tag.attributes.length).toBe(1)

    const attr = tag.attributes[0]!
    expect(attr.type).toBe('Attribute')
    expect(attr.name).toBe('attr')
    expect(attr.value).toBe(true)
  })

  it('Fails when adding a duplicate attribute', () => {
    const action = () => parse(`<custom-tag attr="value1" attr="value2" />`)

    const error = getExpectedError(action, CompileError)
    expect(error.code).toBe('duplicate-attribute')
  })
})
