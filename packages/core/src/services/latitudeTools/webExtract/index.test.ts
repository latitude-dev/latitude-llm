import { describe, it, expect } from 'vitest'
import { adjustLocalURLs } from '.'

describe('adjustLocalURLs', () => {
  it('Replaces local URLs with full URLs', () => {
    const markdown = '[Google](/search?q=google)'
    const url = new URL('https://www.google.com')
    const result = adjustLocalURLs({ markdown, url })
    expect(result).toBe('[Google](https://www.google.com/search?q=google)')
  })

  it('Replaces images from local URLs with full URLs', () => {
    const markdown = '![Google](/images/google.png)'
    const url = new URL('https://www.google.com')
    const result = adjustLocalURLs({ markdown, url })
    expect(result).toBe('![Google](https://www.google.com/images/google.png)')
  })

  it('Does not replace external URLs', () => {
    const markdown = '[Bing](https://www.bing.com)'
    const url = new URL('https://www.google.com')
    const result = adjustLocalURLs({ markdown, url })
    expect(result).toBe(markdown)
  })

  it('Does not replace URL-looking text', () => {
    const markdown = '/test'
    const url = new URL('https://www.google.com')
    const result = adjustLocalURLs({ markdown, url })
    expect(result).toBe(markdown)
  })
})
