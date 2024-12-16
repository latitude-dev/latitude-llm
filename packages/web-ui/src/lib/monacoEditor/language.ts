import { useEffect, useState } from 'react'

import hslToHex from 'hsl-to-hex'
import type { languages } from 'monaco-editor'
import { useTheme } from 'next-themes'

export const tokenizer = {
  root: [
    // Escaped sequences
    [/\\\{\{/, 'text'],
    [/\\</, 'text'],
    [/\\\/\*/, 'text'],

    // YAML initial config
    [/^---$/, { token: 'yaml-delimiter', next: '@yaml' }],

    // Multiline comments
    [/\/\*/, { token: 'comment', next: '@comment' }],

    // Embedded JavaScript logic
    [/\{\{/, { token: 'js-open', next: '@js' }],

    // HTML-like tags
    [/<[\w-]+/, { token: 'tag-open', next: '@tag' }],
    [/<\/[\w-]+/, { token: 'tag-open', next: '@tag' }],

    // Markdown-like syntax
    [/#.*$/, 'header'],
    [/\*\*[^*]+\*\*/, 'bold'],
    [/\*[^*]+\*/, 'italic'],
    [/\[[^\]]+\]\([^)]+\)/, 'link'],
  ],

  yaml: [
    [/^---$/, { token: 'yaml-delimiter', next: '@pop' }],
    [/[^]+/, 'yaml'],
  ],

  comment: [
    [/\*\//, { token: 'comment', next: '@pop' }],
    [/[^*]+/, 'comment'],
    [/./, 'comment'],
  ],

  tag: [
    [/>/, { token: 'tag-close', next: '@pop' }],
    [/[\w-]+=/, { token: 'attribute.name', next: '@tagAttribute' }],
    [/[\w-]+/, 'attribute.name'],
    [/\s+/, { token: '' }],
  ],

  tagAttribute: [
    [/\{\{/, { token: 'js-open', next: '@js' }],
    [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
    [/"/, 'attribute.quote', '@attribute_string'], // tokenize opening quote
    [/\s+/, { token: '', next: '@pop' }],
    [/>/, { token: 'tag-close', next: '@popall' }],
  ],

  attribute_string: [
    [/\{\{/, { token: 'js-open', next: '@js' }],
    [/[^\\"]+/, 'attribute.value'],
    [/\\./, 'string.escape'],
    [/"/, 'attribute.quote', '@pop'], // tokenize closing quote
  ],

  string_double: [
    [/[^\\"]+/, 'string'],
    [/\\./, 'string.escape'],
    [/"/, 'string', '@pop'],
  ],

  string_single: [
    [/[^\\']+/, 'string'],
    [/\\./, 'string.escape'],
    [/'/, 'string', '@pop'],
  ],

  string_backtick: [
    [/\$\{/, { token: 'delimiter.bracket', next: '@bracketCounting' }],
    [/[^\\`]+/, 'string'],
    [/\\./, 'string.escape'],
    [/`/, 'string', '@pop'],
  ],

  js: [
    [/\}\}/, { token: 'js-close', next: '@pop' }],

    // equal
    [/=/, 'delimiter.equal'],

    // whitespace
    { include: '@whitespace' },

    // control structures
    [/(#|\/|:)([a-zA-Z_]\w*)/, ['control-symbol', 'control-word']],

    // identifiers and keywords
    [/[a-z_$][\w$]*/, 'identifier'],

    // numbers
    [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
    [/0[xX][0-9a-fA-F]+/, 'number.hex'],
    [/\d+/, 'number'],

    // strings
    [/"([^"\\]|\\.)*$/, 'js-string.invalid'], // non-terminated string
    [/'([^'\\]|\\.)*$/, 'js-string.invalid'], // non-terminated string
    [/"/, 'js-string', '@js_string_double'],
    [/'/, 'js-string', '@js_string_single'],
    [/`/, 'js-string', '@js_string_backtick'],

    // delimiters and operators
    [/[{}[\]()]/, '@bracket'],
    [/[<>](?![[=><!~?:&|+\-*/^%]+])/, 'delimiter'],
    [/[<>]=?/, 'delimiter'],
    [/!=?=?/, 'delimiter'],
    [/[=+\-*/^%&|!~?:]/, 'delimiter'],
  ],

  js_string_double: [
    [/[^\\"]+/, 'js-string'],
    [/\\./, 'string.escape'],
    [/"/, 'js-string', '@pop'],
  ],

  js_string_single: [
    [/[^\\']+/, 'js-string'],
    [/\\./, 'string.escape'],
    [/'/, 'js-string', '@pop'],
  ],

  js_string_backtick: [
    [/\$\{/, { token: 'delimiter.bracket', next: '@bracketCounting' }],
    [/[^\\`]+/, 'js-string'],
    [/\\./, 'string.escape'],
    [/`/, 'js-string', '@pop'],
  ],

  bracketCounting: [
    [/\{/, 'delimiter.bracket', '@bracketCounting'],
    [/\}/, 'delimiter.bracket', '@pop'],
    { include: 'js' },
  ],

  whitespace: [
    [/[ \t\r\n]+/, ''],
    [/\/\*/, 'comment', '@comment'],
    [/\/\/.*$/, 'comment'],
  ],
} as { [key: string]: languages.IMonarchLanguageRule[] }

const style = getComputedStyle(document.body)

function colorFromProperty(property: string): string {
  const hsl = style.getPropertyValue(property)
  const [h, s, l] = hsl.split(' ').map((v) => Number(v.replace('%', '')))
  return hslToHex(h!, s!, l!)
}

const recalculateColors = () => ({
  primary: colorFromProperty('--primary'),
  primaryForeground: colorFromProperty('--primary-foreground'),
  secondary: colorFromProperty('--secondary'),
  secondaryForeground: colorFromProperty('--secondary-foreground'),
  foreground: colorFromProperty('--foreground'),
  accentForeground: colorFromProperty('--accent-foreground'),
  destructive: colorFromProperty('--destructive'),
  destructiveMutedForeground: colorFromProperty(
    '--destructive-muted-foreground',
  ),
  mutedForeground: colorFromProperty('--muted-foreground'),
})

export type ThemeColors = ReturnType<typeof recalculateColors>

export const useThemeColors = () => {
  const { theme } = useTheme()
  const [themeColors, setThemeColors] = useState(recalculateColors())
  useEffect(() => {
    // Must resolve current callstack before recalculating colors, otherwise they won't be updated on time.
    setTimeout(() => setThemeColors(recalculateColors()), 0)
  }, [theme])

  return themeColors
}

export const themeRules = (themeColors: ThemeColors) => {
  return [
    { token: '', foreground: themeColors.foreground },
    { token: 'yaml-delimiter', foreground: themeColors.accentForeground },
    { token: 'yaml', foreground: themeColors.accentForeground },

    { token: 'header', foreground: themeColors.primary },
    {
      token: 'bold',
      fontStyle: 'bold',
      foreground: themeColors.foreground,
    },
    {
      token: 'italic',
      fontStyle: 'italic',
      foreground: themeColors.foreground,
    },
    {
      token: 'link',
      foreground: themeColors.primary,
      fontStyle: 'underline',
    },
    {
      token: 'tag-open',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'tag-close',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'attribute.name',
      foreground: themeColors.destructiveMutedForeground,
    },
    {
      token: 'attribute.value',
      foreground: themeColors.foreground,
    },
    {
      token: 'attribute.quote',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'js-open',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'js-close',
      foreground: themeColors.accentForeground,
    },
    { token: 'js', foreground: themeColors.primary },
    {
      token: 'comment',
      fontStyle: 'italic',
      foreground: themeColors.mutedForeground,
    },
    {
      token: 'bracket',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'delimiter.equal',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'control-symbol',
      foreground: themeColors.accentForeground,
    },
    {
      token: 'js-string',
      foreground: themeColors.destructiveMutedForeground,
    },
    {
      token: 'string.escape',
      foreground: themeColors.accentForeground,
    },
  ]
}
