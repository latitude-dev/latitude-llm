import { IconName } from '@latitude-data/web-ui/atoms/Icons'

interface IFrameworkDefinition {
  name: string
  icon: IconName
}

export type SupportedFrameworkDefinition = IFrameworkDefinition & {
  autoInstrumentation: {
    import: string
    line: string
  }
  implementation: {
    import: string
    codeblock: string
    return: string
  }
}

export type UnsupportedFrameworkDefinition = IFrameworkDefinition & {
  manualInstrumentation: {
    completion: {
      imports: string[]
      model: string
      codeblock: string
      return: string
    }
  }
}

export type FrameworkDefinition =
  | SupportedFrameworkDefinition
  | UnsupportedFrameworkDefinition

export const MODEL_PROVIDERS: FrameworkDefinition[] = [
  {
    name: 'OpenAI',
    icon: 'openai',
    autoInstrumentation: {
      import: "import OpenAI from 'openai'",
      line: 'openai: OpenAI, // This enables automatic tracing for the OpenAI SDK',
    },
    implementation: {
      import: "import OpenAI from 'openai'",
      codeblock: `
const client = new OpenAI();
const completion = await client.chat.completions.create({ ... });
      `.trim(),
      return: 'return completion.choices[0].message.content',
    },
  },
  {
    name: 'Anthropic',
    icon: 'anthropic',
    autoInstrumentation: {
      import: "import * as Anthropic from '@anthropic-ai/sdk'",
      line: 'anthropic: Anthropic, // This enables automatic tracing for the Anthropic SDK',
    },
    implementation: {
      import: "import Anthropic from '@anthropic-ai/sdk'",
      codeblock: `
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await client.messages.create({ ... });
      `.trim(),
      return: 'return response',
    },
  },
  {
    name: 'Gemini',
    icon: 'googleGemini',
    manualInstrumentation: {
      completion: {
        imports: ["import { GoogleGenAI } from '@google/genai'"],
        model: 'gemini-3-pro',
        codeblock: `
const google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await google.models.generateContent({ ... });
const text = response.text;
        `.trim(),
        return: 'return text',
      },
    },
  },
  {
    name: 'Azure OpenAI',
    icon: 'azure',
    autoInstrumentation: {
      import: "import OpenAI from 'openai'",
      line: 'openai: OpenAI, // This enables automatic tracing for the Azure OpenAI SDK',
    },
    implementation: {
      import: "import { AzureOpenAI } from 'openai'",
      codeblock: `
const client = new AzureOpenAI({ ... });
const completion = await client.chat.completions.create({ ... });
      `.trim(),
      return: 'return completion.choices[0].message.content',
    },
  },
  {
    name: 'Amazon Bedrock',
    icon: 'amazonBedrock',
    autoInstrumentation: {
      import: "import * as Bedrock from '@aws-sdk/client-bedrock-runtime'",
      line: 'bedrock: Bedrock, // This enables automatic tracing for the Amazon Bedrock SDK',
    },
    implementation: {
      import:
        "import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'",
      codeblock: `
const client = new BedrockRuntimeClient({ region: 'us-east-1' });
const response = await client.send(
  new InvokeModelCommand({ ... })
);
      `.trim(),
      return: 'return response',
    },
  },
  {
    name: 'Vertex AI',
    icon: 'googleVertex',
    autoInstrumentation: {
      import: "import * as VertexAI from '@google-cloud/vertexai'",
      line: 'vertexai: VertexAI, // This enables automatic tracing for the Google Vertex AI SDK',
    },
    implementation: {
      import: "import { VertexAI } from '@google-cloud/vertexai'",
      codeblock: `
const client = new VertexAI({ ... });
const model = client.getGenerativeModel({ model: 'gemini-3-pro' });
const result = await model.generateContent({ ... });
      `.trim(),
      return: 'return await result.response',
    },
  },
  {
    name: 'Cohere',
    icon: 'sparkles',
    autoInstrumentation: {
      import: "import * as Cohere from 'cohere-ai'",
      line: 'cohere: Cohere, // This enables automatic tracing for the Cohere SDK',
    },
    implementation: {
      import: "import { CohereClient } from 'cohere-ai'",
      codeblock: `
const client = new CohereClient({ ... });
const response = await client.generate({ ... });
      `.trim(),
      return: 'return response',
    },
  },
  {
    name: 'Together AI',
    icon: 'sparkles',
    autoInstrumentation: {
      import: "import { Together } from 'together-ai'",
      line: 'together: Together, // This enables automatic tracing for the Together AI SDK',
    },
    implementation: {
      import: "import { Together } from 'together-ai'",
      codeblock: `
const client = new Together({ ... });
const response = await client.generate({ ... });
      `.trim(),
      return: 'return response',
    },
  },
  {
    name: 'Google AI Platform',
    icon: 'googleGemini',
    autoInstrumentation: {
      import: "import * as AIPlatform from '@google-cloud/aiplatform'",
      line: 'aiplatform: AIPlatform, // This enables automatic tracing for the Google AI Platform SDK',
    },
    implementation: {
      import:
        "import { PredictionServiceClient } from '@google-cloud/aiplatform'",
      codeblock: `
const client = new PredictionServiceClient({ ... });
const response = await client.predict({ ... });
      `.trim(),
      return: 'return response',
    },
  },
]

export const FRAMEWORKS: FrameworkDefinition[] = [
  {
    name: 'Vercel AI SDK',
    icon: 'zap',
    autoInstrumentation: {
      import: '',
      line: '',
    },
    implementation: {
      import:
        "import { generateText } from 'ai'\nimport { openai } from '@ai-sdk/openai'",
      codeblock: `
const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: input,
  experimental_telemetry: {
    isEnabled: true, // Make sure to enable experimental telemetry
  },
});
      `.trim(),
      return: 'return text',
    },
  },
  {
    name: 'LangChain',
    icon: 'link',
    autoInstrumentation: {
      import:
        "import * as LangchainCallbacks from '@langchain/core/callbacks/manager'",
      line: 'langchain: { callbackManagerModule: LangchainCallbacks }, // This enables automatic tracing for the LangChain SDK',
    },
    implementation: {
      import: "import { createAgent } from 'langchain'",
      codeblock: `
const agent = createAgent({ model: 'claude-sonnet-4-5' });
const result = await agent.invoke({ ... });
      `.trim(),
      return: 'return result',
    },
  },
  {
    name: 'LlamaIndex',
    icon: 'database',
    autoInstrumentation: {
      import: "import * as LlamaIndex from 'llamaindex'",
      line: 'llamaindex: LlamaIndex, // This enables automatic tracing for the LlamaIndex SDK',
    },
    implementation: {
      import:
        "import { agent } from '@llamaindex/workflow'\nimport { Settings } from 'llamaindex'\nimport { openai } from '@llamaindex/openai'",
      codeblock: `
Settings.llm = openai({ model: 'gpt-4o' });
const myAgent = agent({ ... });
const response = await myAgent.run(prompt);
      `.trim(),
      return: 'return response',
    },
  },
]
