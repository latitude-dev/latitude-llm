import type { HLJSApi, Language } from 'highlight.js'
import { createLowlight } from 'lowlight'

function definePromptl(hljs: HLJSApi): Language {
  const TEMPLATE_EXPR = {
    begin: /\{\{/,
    end: /\}\}/,
    className: 'template-tag',
    contains: [
      {
        className: 'template-brace',
        begin: /\{\{|\}\}/,
      },
      {
        className: 'keyword',
        begin: /\b(if|for|else|elseif|endif|endfor|unless|endunless)\b/,
      },
      {
        className: 'variable',
        begin: /\b[a-zA-Z_][\w-]*\b/,
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      hljs.NUMBER_MODE,
    ],
  }

  return {
    name: 'promptl',
    contains: [
      // HTML-like tags like <assistant>
      {
        className: 'tag',
        begin: /<\/?[\w-]+>/,
      },

      // Comments like /* ... */
      {
        className: 'comment',
        begin: /\/\*/,
        end: /\*\//,
        contains: [
          {
            begin: /[^*]+/, // match inner text of the comment
          }
        ]
      },

      // Template blocks like {{ location }}
      TEMPLATE_EXPR,

      // Optional fallback: regular text
      {
        begin: /[^\s<{\n][^\n]*/,
        className: 'text',
      },
    ],
  }
}


export function initLowLight() {
  const lowlight = createLowlight()
  lowlight.register('promptl', definePromptl)
  return lowlight
}
