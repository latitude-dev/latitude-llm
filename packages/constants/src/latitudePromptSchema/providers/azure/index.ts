import { z } from 'zod'

export const azureConfig = z.object({
  resourceName: z
    .string({
      message: 'Azure resourceName is required',
    })
    .optional()
    .describe(
      'The resource name is used in the assembled URL: https://{resourceName}.openai.azure.com/openai/deployments/{modelId}{path}. You can use baseURL instead to specify the URL prefix.',
    ),
  apiKey: z
    .string()
    .optional()
    .describe(
      'API key that is being sent using the api-key header. It defaults to the AZURE_API_KEY environment variable.',
    ),
  apiVersion: z
    .string()
    .optional()
    .describe('Sets a custom api version. Defaults to 2024-10-01-preview.'),
  baseUrl: z
    .string()
    .optional()
    .describe(
      'Use a different URL prefix for API calls, e.g. to use proxy servers. Either this or resourceName can be used. When a baseURL is provided, the resourceName is ignored. With a baseURL, the resolved URL is {baseURL}/{modelId}{path}.',
    ),
  headers: z.record(z.string()).optional().describe('Custom headers to include in the requests.'),
})

export type AzureConfig = z.infer<typeof azureConfig>
