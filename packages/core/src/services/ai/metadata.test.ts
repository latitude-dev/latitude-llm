import { describe, expect, it } from 'vitest'
import { unwrapProviderMetadata, wrapProviderMetadata } from './metadata'

describe('wrapProviderMetadata', () => {
  describe('message level', () => {
    it('returns message unchanged when no _providerMetadata', () => {
      const messages = [{ role: 'user', content: 'hello' }]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual(messages)
    })

    it('wraps _providerMetadata into providerOptions.promptl', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            promptl: {
              _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
            },
          },
        },
      ])
    })

    it('extracts nested providerOptions from _providerMetadata', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          _providerMetadata: {
            sourceMap: [{ start: 0, end: 10 }],
            providerOptions: { anthropic: { cacheControl: true } },
          },
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            anthropic: { cacheControl: true },
            promptl: {
              _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
            },
          },
        },
      ])
    })

    it('merges with existing providerOptions', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          providerOptions: { openai: { logprobs: true } },
          _providerMetadata: {
            sourceMap: [{ start: 0, end: 10 }],
            providerOptions: { anthropic: { cacheControl: true } },
          },
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            openai: { logprobs: true },
            anthropic: { cacheControl: true },
            promptl: {
              _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
            },
          },
        },
      ])
    })

    it('omits promptl when _providerMetadata only contains providerOptions', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          _providerMetadata: {
            providerOptions: { anthropic: { cacheControl: true } },
          },
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            anthropic: { cacheControl: true },
          },
        },
      ])
    })
  })

  describe('content level', () => {
    it('handles string content unchanged', () => {
      const messages = [{ role: 'assistant', content: 'hello' }]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual(messages)
    })

    it('wraps _providerMetadata in single content object', () => {
      const messages = [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'hello',
            _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
          },
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'hello',
            providerOptions: {
              promptl: {
                _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
              },
            },
          },
        },
      ])
    })

    it('wraps _providerMetadata in content array items', () => {
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
              _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
            },
            {
              type: 'text',
              text: 'world',
              _providerMetadata: { sourceMap: [{ start: 6, end: 11 }] },
            },
          ],
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
              providerOptions: {
                promptl: {
                  _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
                },
              },
            },
            {
              type: 'text',
              text: 'world',
              providerOptions: {
                promptl: {
                  _providerMetadata: { sourceMap: [{ start: 6, end: 11 }] },
                },
              },
            },
          ],
        },
      ])
    })

    it('wraps both message and content level metadata', () => {
      const messages = [
        {
          role: 'user',
          _providerMetadata: { messageData: 'foo' },
          content: [
            {
              type: 'text',
              text: 'hello',
              _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
            },
          ],
        },
      ]
      const result = wrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          providerOptions: {
            promptl: { _providerMetadata: { messageData: 'foo' } },
          },
          content: [
            {
              type: 'text',
              text: 'hello',
              providerOptions: {
                promptl: {
                  _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
                },
              },
            },
          ],
        },
      ])
    })
  })
})

describe('unwrapProviderMetadata', () => {
  describe('message level', () => {
    it('returns message unchanged when no providerOptions.promptl', () => {
      const messages = [{ role: 'user', content: 'hello' }]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual(messages)
    })

    it('unwraps providerOptions.promptl._providerMetadata to message level', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            promptl: {
              _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
            },
          },
        },
      ]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: 'hello',
          _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
        },
      ])
    })

    it('preserves other providerOptions when unwrapping', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            anthropic: { cacheControl: true },
            promptl: {
              _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
            },
          },
        },
      ]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: 'hello',
          providerOptions: { anthropic: { cacheControl: true } },
          _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
        },
      ])
    })

    it('removes providerOptions when only promptl remains', () => {
      const messages = [
        {
          role: 'user',
          content: 'hello',
          providerOptions: {
            promptl: {
              _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
            },
          },
        },
      ]
      const result = unwrapProviderMetadata(messages)
      expect(result[0]).not.toHaveProperty('providerOptions')
    })
  })

  describe('content level', () => {
    it('handles string content unchanged', () => {
      const messages = [{ role: 'assistant', content: 'hello' }]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual(messages)
    })

    it('unwraps providerOptions.promptl in single content object', () => {
      const messages = [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'hello',
            providerOptions: {
              promptl: {
                _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
              },
            },
          },
        },
      ]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'hello',
            _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
          },
        },
      ])
    })

    it('unwraps providerOptions.promptl in content array items', () => {
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
              providerOptions: {
                promptl: {
                  _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
                },
              },
            },
            {
              type: 'text',
              text: 'world',
              providerOptions: {
                promptl: {
                  _providerMetadata: { sourceMap: [{ start: 6, end: 11 }] },
                },
              },
            },
          ],
        },
      ]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
              _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
            },
            {
              type: 'text',
              text: 'world',
              _providerMetadata: { sourceMap: [{ start: 6, end: 11 }] },
            },
          ],
        },
      ])
    })

    it('unwraps both message and content level metadata', () => {
      const messages = [
        {
          role: 'user',
          providerOptions: {
            promptl: { _providerMetadata: { messageData: 'foo' } },
          },
          content: [
            {
              type: 'text',
              text: 'hello',
              providerOptions: {
                promptl: {
                  _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
                },
              },
            },
          ],
        },
      ]
      const result = unwrapProviderMetadata(messages)
      expect(result).toEqual([
        {
          role: 'user',
          _providerMetadata: { messageData: 'foo' },
          content: [
            {
              type: 'text',
              text: 'hello',
              _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
            },
          ],
        },
      ])
    })
  })
})

describe('roundtrip', () => {
  it('wrap then unwrap returns equivalent structure', () => {
    const original = [
      {
        role: 'user',
        _providerMetadata: { messageData: 'foo' },
        content: [
          {
            type: 'text',
            text: 'hello',
            _providerMetadata: { sourceMap: [{ start: 0, end: 5 }] },
          },
        ],
      },
    ]
    const wrapped = wrapProviderMetadata(original)
    const unwrapped = unwrapProviderMetadata(wrapped)
    expect(unwrapped).toEqual(original)
  })

  it('handles complex nested providerOptions in roundtrip', () => {
    const original = [
      {
        role: 'user',
        providerOptions: { openai: { logprobs: true } },
        _providerMetadata: {
          sourceMap: [{ start: 0, end: 10 }],
          providerOptions: { anthropic: { cacheControl: true } },
        },
        content: [
          {
            type: 'text',
            text: 'hello',
            _providerMetadata: { contentSourceMap: [{ start: 0, end: 5 }] },
          },
        ],
      },
    ]
    const wrapped = wrapProviderMetadata(original)

    expect(wrapped[0]!.providerOptions).toEqual({
      openai: { logprobs: true },
      anthropic: { cacheControl: true },
      promptl: {
        _providerMetadata: { sourceMap: [{ start: 0, end: 10 }] },
      },
    })

    const unwrapped = unwrapProviderMetadata(wrapped)

    expect(unwrapped[0]!._providerMetadata).toEqual({
      sourceMap: [{ start: 0, end: 10 }],
    })
    expect(unwrapped[0]!.providerOptions).toEqual({
      openai: { logprobs: true },
      anthropic: { cacheControl: true },
    })
  })
})
