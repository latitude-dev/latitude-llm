import type { languages } from 'monaco-editor'

const style = getComputedStyle(document.body)

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

export const themeRules = [
  { token: 'yaml-delimiter', foreground: style.getPropertyValue('--primary') },
  { token: 'yaml', foreground: style.getPropertyValue('--primary') },

  { token: 'header', foreground: style.getPropertyValue('--primary') },
  {
    token: 'bold',
    fontStyle: 'bold',
    foreground: style.getPropertyValue('--foreground'),
  },
  {
    token: 'italic',
    fontStyle: 'italic',
    foreground: style.getPropertyValue('--foreground'),
  },
  {
    token: 'link',
    foreground: style.getPropertyValue('--primary'),
    fontStyle: 'underline',
  },
  {
    token: 'tag-open',
    foreground: style.getPropertyValue('--accent-foreground'),
  },
  {
    token: 'tag-close',
    foreground: style.getPropertyValue('--accent-foreground'),
  },
  {
    token: 'attribute.name',
    foreground: style.getPropertyValue('--destructive'),
  },
  {
    token: 'js-open',
    foreground: style.getPropertyValue('--accent-foreground'),
  },
  {
    token: 'js-close',
    foreground: style.getPropertyValue('--accent-foreground'),
  },
  { token: 'js', foreground: style.getPropertyValue('--primary') },
  {
    token: 'comment',
    fontStyle: 'italic',
    foreground: style.getPropertyValue('--muted-foreground'),
  },
]
