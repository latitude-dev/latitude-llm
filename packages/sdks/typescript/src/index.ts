import {
  CreateCompletionRequest,
  CreateCompletionResponse,
  LatitudeSDKConfig,
} from './types'

const BASE_URL = 'localhost:3001'

export default function LatitudeSDK(config: LatitudeSDKConfig) {
  const { baseUrl = BASE_URL } = config
  const create = async (
    body: CreateCompletionRequest.Params,
  ): Promise<CreateCompletionResponse.Response> => {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return res.json()
  }

  return {
    chat: { completions: { create } },
  }
}
