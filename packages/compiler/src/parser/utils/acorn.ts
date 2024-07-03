import * as code_red from 'code-red'

export const parse = (source: string) =>
  code_red.parse(source, {
    sourceType: 'module',
    ecmaVersion: 13,
    locations: true,
  })

export const parseExpressionAt = (source: string, index: number) =>
  code_red.parseExpressionAt(source, index, {
    sourceType: 'module',
    ecmaVersion: 13,
    locations: true,
  })
