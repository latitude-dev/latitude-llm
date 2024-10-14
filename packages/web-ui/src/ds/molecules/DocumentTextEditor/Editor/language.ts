import type { languages } from 'monaco-editor'

const style = getComputedStyle(document.body)

export const colorFromProperty = (property: string): string => {
  const rgb = style.getPropertyValue(property)
  const [r, g, b] = rgb.split(' ').map(Number)
  const hr = (r ?? 0).toString(16).padStart(2, '0')
  const hg = (g ?? 0).toString(16).padStart(2, '0')
  const hb = (b ?? 0).toString(16).padStart(2, '0')
  return `#${hr}${hg}${hb}`
}

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
    [/"/, 'string', '@attribute_string'],
    [/\s+/, { token: 'attribute.value', next: '@pop' }],
    [/>/, { token: 'tag-close', next: '@popall' }], // Close tag directly if encountered
  ],

  attribute_string: [
    [/\{\{/, { token: 'js-open', next: '@js' }],
    [/[^\\"]+/, 'string'],
    [/\\./, 'string.escape'],
    [/"/, 'string', '@pop'],
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

    // whitespace
    { include: '@whitespace' },

    // identifiers and keywords
    [/[a-z_$][\w$]*/, 'identifier'],

    // numbers
    [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
    [/0[xX][0-9a-fA-F]+/, 'number.hex'],
    [/\d+/, 'number'],

    // strings
    [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
    [/'([^'\\]|\\.)*$/, 'string.invalid'], // non-terminated string
    [/"/, 'string', '@string_double'],
    [/'/, 'string', '@string_single'],
    [/`/, 'string', '@string_backtick'],

    // delimiters and operators
    [/[{}()[\]]/, '@brackets'],
    [/[<>](?![[=><!~?:&|+\-*/^%]+])/, 'delimiter'],
    [/[<>]=?/, 'delimiter'],
    [/!=?=?/, 'delimiter'],
    [/[=+\-*/^%&|!~?:]/, 'delimiter'],
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

// TODO: Find a way of converting HSL to HEX to avoid duplicating all our color scheme.
export const themeRules = [
  { token: 'yaml-delimiter', foreground: colorFromProperty('--primary-rgb') },
  { token: 'yaml', foreground: colorFromProperty('--primary-rgb') },

  { token: 'header', foreground: colorFromProperty('--primary-rgb') },
  {
    token: 'bold',
    fontStyle: 'bold',
    foreground: colorFromProperty('--foreground-rgb'),
  },
  {
    token: 'italic',
    fontStyle: 'italic',
    foreground: colorFromProperty('--foreground-rgb'),
  },
  {
    token: 'link',
    foreground: colorFromProperty('--primary-rgb'),
    fontStyle: 'underline',
  },
  {
    token: 'tag-open',
    foreground: colorFromProperty('--accent-foreground-rgb'),
  },
  {
    token: 'tag-close',
    foreground: colorFromProperty('--accent-foreground-rgb'),
  },
  {
    token: 'attribute.name',
    foreground: colorFromProperty('--destructive-rgb'),
  },
  {
    token: 'js-open',
    foreground: colorFromProperty('--accent-foreground-rgb'),
  },
  {
    token: 'js-close',
    foreground: colorFromProperty('--accent-foreground-rgb'),
  },
  { token: 'js', foreground: colorFromProperty('--primary-rgb') },
  {
    token: 'comment',
    fontStyle: 'italic',
    foreground: colorFromProperty('--muted-foreground-rgb'),
  },
]
