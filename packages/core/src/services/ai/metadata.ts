type PromptlMetadata = {
  _providerMetadata?: Record<string, unknown>
}

type ProviderOptionsWithPromptl = {
  promptl?: PromptlMetadata
  [key: string]: unknown
}

type ItemWithMetadata = {
  providerOptions?: ProviderOptionsWithPromptl
  _providerMetadata?: Record<string, unknown> & {
    providerOptions?: Record<string, unknown>
  }
  [key: string]: unknown
}

type MessageWithMetadata = ItemWithMetadata & {
  content?: string | ItemWithMetadata | ItemWithMetadata[]
}

function wrapItemMetadata(item: ItemWithMetadata): ItemWithMetadata {
  if (!('_providerMetadata' in item) || !item._providerMetadata) {
    return item
  }

  const { _providerMetadata, ...rest } = item
  const { providerOptions: metadataProviderOptions, ...remainingMetadata } =
    _providerMetadata

  const hasRemainingMetadata = Object.keys(remainingMetadata).length > 0
  const promptlPayload: PromptlMetadata | undefined = hasRemainingMetadata
    ? { _providerMetadata: remainingMetadata }
    : undefined

  const newProviderOptions: ProviderOptionsWithPromptl = {
    ...rest.providerOptions,
    ...metadataProviderOptions,
    ...(promptlPayload && { promptl: promptlPayload }),
  }

  const hasProviderOptions = Object.keys(newProviderOptions).length > 0

  return {
    ...rest,
    ...(hasProviderOptions && { providerOptions: newProviderOptions }),
  }
}

// Note: this function is needed because Vercel strips out any
// unknown field if it is not wrapped in providerOptions
export function wrapProviderMetadata<T extends Record<string, unknown>[]>(
  messages: T,
): T {
  return messages.map((message: MessageWithMetadata) => {
    const wrappedMessage = wrapItemMetadata(message) as MessageWithMetadata

    if ('content' in wrappedMessage && wrappedMessage.content !== undefined) {
      const content = wrappedMessage.content

      if (typeof content === 'string') {
        return wrappedMessage
      }

      if (Array.isArray(content)) {
        return {
          ...wrappedMessage,
          content: content.map(wrapItemMetadata),
        }
      }

      return {
        ...wrappedMessage,
        content: wrapItemMetadata(content),
      }
    }

    return wrappedMessage
  }) as T
}

function unwrapItemMetadata(item: ItemWithMetadata): ItemWithMetadata {
  if (!item.providerOptions?.promptl) {
    return item
  }

  const { promptl, ...remainingProviderOptions } = item.providerOptions
  const hasRemainingProviderOptions =
    Object.keys(remainingProviderOptions).length > 0

  const result = {
    ...item,
    ...promptl,
    ...(hasRemainingProviderOptions
      ? { providerOptions: remainingProviderOptions }
      : {}),
  }

  if (!hasRemainingProviderOptions) {
    delete (result as Record<string, unknown>).providerOptions
  }

  return result
}

// Note: this function is needed because Vercel strips out any
// unknown field if it is not wrapped in providerOptions
export function unwrapProviderMetadata<T extends Record<string, unknown>[]>(
  messages: T,
): T {
  return messages.map((message: MessageWithMetadata) => {
    const unwrappedMessage = unwrapItemMetadata(message) as MessageWithMetadata

    if (
      'content' in unwrappedMessage &&
      unwrappedMessage.content !== undefined
    ) {
      const content = unwrappedMessage.content

      if (typeof content === 'string') {
        return unwrappedMessage
      }

      if (Array.isArray(content)) {
        return {
          ...unwrappedMessage,
          content: content.map(unwrapItemMetadata),
        }
      }

      return {
        ...unwrappedMessage,
        content: unwrapItemMetadata(content),
      }
    }

    return unwrappedMessage
  }) as T
}
