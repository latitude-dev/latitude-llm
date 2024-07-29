import { CHAIN_STEP_TAG } from '$compiler/constants'
import CompileError from '$compiler/error/error'
import {
  AssistantMessage,
  ContentType,
  Conversation,
  MessageRole,
} from '$compiler/types'
import { describe, expect, it, vi } from 'vitest'

import { Chain } from './chain'
import { removeCommonIndent } from './utils'

const getExpectedError = async <T>(
  action: () => Promise<unknown>,
  errorClass: new () => T,
): Promise<T> => {
  try {
    await action()
  } catch (err) {
    expect(err).toBeInstanceOf(errorClass)
    return err as T
  }
  throw new Error('Expected an error to be thrown')
}

const assistantMessage = (content?: string): AssistantMessage => ({
  role: MessageRole.assistant,
  content: [
    {
      type: ContentType.text,
      value: content ?? '',
    },
  ],
  toolCalls: [],
})

async function defaultCallback(): Promise<AssistantMessage> {
  return assistantMessage('')
}

async function complete({
  chain,
  callback,
  maxSteps = 50,
}: {
  chain: Chain
  callback?: (convo: Conversation) => Promise<AssistantMessage | undefined>
  maxSteps?: number
}): Promise<Conversation> {
  let steps = 0
  let response: AssistantMessage | undefined = undefined
  while (true) {
    const { completed, conversation } = await chain.step(response)
    if (completed) return conversation
    response = await (callback ?? defaultCallback)(conversation)

    steps++
    if (steps > maxSteps) throw new Error('too many chain steps')
  }
}

describe('chain', async () => {
  it('computes in a single iteration when there is no step tag', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 'foo' }}
      System messate

      {{#each [1, 2, 3] as element}}
        <user>
          User message: {{element}}
        </user>
      {{/each}}

      <assistant>
        Assistant message: {{foo}}
      </assistant>
    `)

    const chain = new Chain({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })
    const { completed } = await chain.step()
    expect(completed).toBe(true)
  })

  it('correctly computes the whole prompt in a single iteration', async () => {
    const prompt = removeCommonIndent(`
      {{foo = 'foo'}}
      System message

      {{#each [1, 2, 3] as element}}
        <user>
          User message: {{element}}
        </user>
      {{/each}}

      <assistant>
        Assistant message: {{foo}}
      </assistant>
    `)

    const chain = new Chain({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    const { conversation } = await chain.step()
    expect(conversation.messages.length).toBe(5)

    const systemMessage = conversation.messages[0]!
    expect(systemMessage.role).toBe('system')
    expect(systemMessage.content[0]!.value).toBe('System message')

    const userMessage = conversation.messages[1]!
    expect(userMessage.role).toBe('user')
    expect(userMessage.content[0]!.value).toBe('User message: 1')

    const userMessage2 = conversation.messages[2]!
    expect(userMessage2.role).toBe('user')
    expect(userMessage2.content[0]!.value).toBe('User message: 2')

    const userMessage3 = conversation.messages[3]!
    expect(userMessage3.role).toBe('user')
    expect(userMessage3.content[0]!.value).toBe('User message: 3')

    const assistantMessage = conversation.messages[4]!
    expect(assistantMessage.role).toBe('assistant')
    expect(assistantMessage.content[0]!.value).toBe('Assistant message: foo')
  })

  it('stops at a step tag', async () => {
    const prompt = removeCommonIndent(`
      Message 1

      <${CHAIN_STEP_TAG} />

      Message 2
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const { completed: completed1, conversation: conversation1 } =
      await chain.step()

    expect(completed1).toBe(false)
    expect(conversation1.messages.length).toBe(1)
    expect(conversation1.messages[0]!.content[0]!.value).toBe('Message 1')

    const { completed: completed2, conversation: conversation2 } =
      await chain.step(assistantMessage('response'))

    expect(completed2).toBe(true)
    expect(conversation2.messages.length).toBe(3)
    expect(conversation2.messages[0]!.content[0]!.value).toBe('Message 1')
    expect(conversation2.messages[1]!.content[0]!.value).toBe('response')
    expect(conversation2.messages[2]!.content[0]!.value).toBe('Message 2')
  })

  it('fails when an assistant message is not provided in followup steps', async () => {
    const prompt = removeCommonIndent(`
      Before step
      <${CHAIN_STEP_TAG} />
      After step
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    await chain.step()
    const action = () => chain.step()
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe('A response is required to continue a chain')
  })

  it('fails when an assistant message is provided in the initial step', async () => {
    const prompt = removeCommonIndent(`
      Before step
      <${CHAIN_STEP_TAG} />
      After step
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const action = () => chain.step(assistantMessage())
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe(
      'A response is not allowed before the chain has started',
    )
  })

  it('fails when calling step after the chain has completed', async () => {
    const prompt = removeCommonIndent(`
      <${CHAIN_STEP_TAG} />
      <${CHAIN_STEP_TAG} />
      <${CHAIN_STEP_TAG} />
      <${CHAIN_STEP_TAG} />
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    let { completed: stop } = await chain.step()
    while (!stop) {
      const { completed } = await chain.step(assistantMessage())
      stop = completed
    }

    const action = () => chain.step()
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe('The chain has already completed')
  })

  it('does not reevaluate nodes', async () => {
    const prompt = removeCommonIndent(`
      {{func1()}}

      <${CHAIN_STEP_TAG} />

      {{func2()}}
    `)

    const func1 = vi.fn().mockReturnValue('1')
    const func2 = vi.fn().mockReturnValue('2')

    const chain = new Chain({
      prompt,
      parameters: {
        func1,
        func2,
      },
    })

    const conversation = await complete({ chain })
    expect(conversation.messages[0]!.content[0]!.value).toBe('1')
    expect(conversation.messages[1]!.content[0]!.value).toBe('')
    expect(conversation.messages[2]!.content[0]!.value).toBe('2')
    expect(func1).toHaveBeenCalledTimes(1)
    expect(func2).toHaveBeenCalledTimes(1)
  })

  it('maintains the scope on simple structures', async () => {
    const prompt = removeCommonIndent(`
      {{foo = 5}}

      <${CHAIN_STEP_TAG} />

      {{foo += 1}}

      <${CHAIN_STEP_TAG} />

      {{foo}}
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const conversation = await complete({ chain })
    expect(
      conversation.messages[conversation.messages.length - 1]!.content[0]!
        .value,
    ).toBe('6')
  })

  it('maintains the scope in if statements', async () => {
    const correctPrompt = removeCommonIndent(`
      {{foo = 5}}

      {{#if true}}
        <${CHAIN_STEP_TAG} />
        {{foo += 1}}
      {{/if}}

      {{foo}}
    `)

    const incorrectPrompt = removeCommonIndent(`
      {{foo = 5}}

      {{#if true}}
        {{bar = 1}}
        <${CHAIN_STEP_TAG} />
      {{/if}}

      {{bar}}
    `)

    const correctChain = new Chain({
      prompt: correctPrompt,
      parameters: {},
    })

    const conversation = await complete({ chain: correctChain })
    expect(
      conversation.messages[conversation.messages.length - 1]!.content[0]!
        .value,
    ).toBe('6')

    const incorrectChain = new Chain({
      prompt: incorrectPrompt,
      parameters: {},
    })

    const action = () => complete({ chain: incorrectChain })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('maintains the scope in each blocks', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 0 }}

      {{#each [1, 2, 3] as element}}
        <user>
          {{foo}}
        </user>

        <${CHAIN_STEP_TAG} />

        {{foo = element}}
      {{/each}}

      {{foo}}
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const conversation = await complete({ chain, maxSteps: 5 })
    expect(conversation.messages.length).toBe(7)
    expect(conversation.messages[0]!.content[0]!.value).toBe('0')
    expect(conversation.messages[2]!.content[0]!.value).toBe('1')
    expect(conversation.messages[4]!.content[0]!.value).toBe('2')
    expect(conversation.messages[6]!.content[0]!.value).toBe('3')
  })

  it('cannot access variables created in a loop outside its scope', async () => {
    const prompt = removeCommonIndent(`
      {{#each [1, 2, 3] as i}}
        {{foo = i}}
        <${CHAIN_STEP_TAG} />
      {{/each}}

      {{foo}}
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const action = () => complete({ chain })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('maintains the scope in nested loops', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 0 }}

      {{#each [1, 2, 3] as i}}

        {{#each [1, 2, 3] as j}}
          <user>
            {{i}}.{{j}}
          </user>

          <${CHAIN_STEP_TAG} />

          {{foo = i * j}}
        {{/each}}

        {{ foo }}
      {{/each}}
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const conversation = await complete({ chain })
    const userMessages = conversation.messages.filter(
      (m) => m.role === MessageRole.user,
    )
    const userMessageText = userMessages
      .map((m) => m.content.map((c) => c.value).join(' '))
      .join('\n')
    expect(userMessageText).toBe(
      removeCommonIndent(`
      1.1
      1.2
      1.3
      2.1
      2.2
      2.3
      3.1
      3.2
      3.3
    `),
    )
    expect(
      conversation.messages[conversation.messages.length - 1]!.content[0]!
        .value,
    ).toBe('9')
  })

  it('saves the response in a variable', async () => {
    const prompt = removeCommonIndent(`
      <${CHAIN_STEP_TAG} as="response" />
      
      {{response}}
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const response = {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          value: 'foo',
        },
      ],
    } as AssistantMessage

    await chain.step()
    const { conversation } = await chain.step(response)

    expect(conversation.messages.length).toBe(2)
    expect(conversation.messages[0]!.content[0]!.value).toBe('foo')
    expect(conversation.messages[1]!.content[0]!.value).toBe('foo')
  })

  it('returns the correct configuration in all steps', async () => {
    const prompt = removeCommonIndent(`
      ---
      model: foo-1
      temperature: 0.5
      ---
      <step />                /* step1 */
      <step model="foo-2" />  /* step2 */
      <step temperature=1 />  /* step3 */
    `)

    const chain = new Chain({
      prompt,
      parameters: {},
    })

    const { conversation: step1 } = await chain.step()
    expect(step1.config.model).toBe('foo-1')
    expect(step1.config.temperature).toBe(0.5)

    const { conversation: step2 } = await chain.step(assistantMessage())
    expect(step2.config.model).toBe('foo-2')
    expect(step2.config.temperature).toBe(0.5)

    const { conversation: step3 } = await chain.step(assistantMessage())
    expect(step3.config.model).toBe('foo-1')
    expect(step3.config.temperature).toBe('1')

    const { conversation: finalConversation } =
      await chain.step(assistantMessage())
    expect(finalConversation.config.model).toBe('foo-1')
    expect(finalConversation.config.temperature).toBe(0.5)
  })
})
