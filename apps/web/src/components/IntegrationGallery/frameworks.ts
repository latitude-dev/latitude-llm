import { IconName } from '@latitude-data/web-ui/atoms/Icons'

interface IFrameworkDefinition {
  name: string
  icon: IconName
}

type TypeScriptAutoInstrumentation = {
  import: string
  line: string
}

type TypeScriptImplementation = {
  import: string
  codeblock: string
  return: string
}

type TypeScriptManualInstrumentation = {
  completion: {
    imports: string[]
    model: string
    codeblock: string
    return: string
  }
}

type PythonInstrumentation = {
  instrumentor: string
  implementation: {
    imports: string[]
    codeblock: string
    return: string
  }
}

export type SupportedFrameworkDefinition = IFrameworkDefinition & {
  autoInstrumentation: TypeScriptAutoInstrumentation
  implementation: TypeScriptImplementation
  python?: PythonInstrumentation
}

export type UnsupportedFrameworkDefinition = IFrameworkDefinition & {
  manualInstrumentation: TypeScriptManualInstrumentation
  python?: PythonInstrumentation
}

export type PythonOnlyFrameworkDefinition = IFrameworkDefinition & {
  pythonOnly: true
  python: PythonInstrumentation
}

export type FrameworkDefinition =
  | SupportedFrameworkDefinition
  | UnsupportedFrameworkDefinition
  | PythonOnlyFrameworkDefinition

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
      return: 'completion.choices[0].message.content',
    },
    python: {
      instrumentor: 'Instrumentors.OpenAI',
      implementation: {
        imports: ['from openai import OpenAI'],
        codeblock: `
client = OpenAI()
completion = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'completion.choices[0].message.content',
      },
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
      return: 'response',
    },
    python: {
      instrumentor: 'Instrumentors.Anthropic',
      implementation: {
        imports: ['from anthropic import Anthropic'],
        codeblock: `
client = Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'response.content[0].text',
      },
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
    python: {
      instrumentor: 'Instrumentors.GoogleGenAI',
      implementation: {
        imports: ['import google.generativeai as genai'],
        codeblock: `
model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content(input)
        `.trim(),
        return: 'response.text',
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
      return: 'completion.choices[0].message.content',
    },
    python: {
      instrumentor: 'Instrumentors.OpenAI',
      implementation: {
        imports: ['from openai import AzureOpenAI'],
        codeblock: `
client = AzureOpenAI(
    api_version="2024-02-01",
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
)
completion = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'completion.choices[0].message.content',
      },
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
      return: 'response',
    },
    python: {
      instrumentor: 'Instrumentors.Bedrock',
      implementation: {
        imports: ['import boto3', 'import json'],
        codeblock: `
client = boto3.client("bedrock-runtime", region_name="us-east-1")
response = client.invoke_model(
    modelId="anthropic.claude-v2",
    body=json.dumps({"prompt": input, "max_tokens_to_sample": 500}),
)
result = json.loads(response["body"].read())
        `.trim(),
        return: 'result["completion"]',
      },
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
      return: 'await result.response',
    },
    python: {
      instrumentor: 'Instrumentors.VertexAI',
      implementation: {
        imports: ['from vertexai.generative_models import GenerativeModel'],
        codeblock: `
model = GenerativeModel("gemini-1.5-flash")
response = model.generate_content(input)
        `.trim(),
        return: 'response.text',
      },
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
      return: 'response',
    },
    python: {
      instrumentor: 'Instrumentors.Cohere',
      implementation: {
        imports: ['import cohere'],
        codeblock: `
client = cohere.Client()
response = client.chat(
    model="command-r-plus",
    message=input,
)
        `.trim(),
        return: 'response.text',
      },
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
      return: 'response',
    },
    python: {
      instrumentor: 'Instrumentors.TogetherAI',
      implementation: {
        imports: ['from together import Together'],
        codeblock: `
client = Together()
response = client.chat.completions.create(
    model="meta-llama/Llama-3-70b-chat-hf",
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'response.choices[0].message.content',
      },
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
      return: 'response',
    },
    python: {
      instrumentor: 'Instrumentors.VertexAI',
      implementation: {
        imports: [
          'from google.cloud import aiplatform',
          'from vertexai.language_models import TextGenerationModel',
        ],
        codeblock: `
aiplatform.init(project="your-project", location="us-central1")
model = TextGenerationModel.from_pretrained("text-bison")
response = model.predict(input)
        `.trim(),
        return: 'response.text',
      },
    },
  },
  {
    name: 'Groq',
    icon: 'groq',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Groq',
      implementation: {
        imports: ['from groq import Groq'],
        codeblock: `
client = Groq()
completion = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'completion.choices[0].message.content',
      },
    },
  },
  {
    name: 'Mistral',
    icon: 'mistral',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.MistralAI',
      implementation: {
        imports: [
          'from mistralai import Mistral',
          'from mistralai.models import UserMessage',
        ],
        codeblock: `
client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
response = client.chat.complete(
    model="mistral-small-latest",
    messages=[UserMessage(role="user", content=input)],
)
        `.trim(),
        return: 'response.choices[0].message.content',
      },
    },
  },
  {
    name: 'LiteLLM',
    icon: 'sparkles',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.LiteLLM',
      implementation: {
        imports: ['import litellm'],
        codeblock: `
response = litellm.completion(
    model="gpt-4o",  # or "anthropic/claude-3-sonnet", "ollama/llama3", etc.
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'response.choices[0].message.content',
      },
    },
  },
  {
    name: 'Ollama',
    icon: 'sparkles',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Ollama',
      implementation: {
        imports: ['import ollama'],
        codeblock: `
response = ollama.chat(
    model="llama3.2",
    messages=[{"role": "user", "content": input}],
)
        `.trim(),
        return: 'response["message"]["content"]',
      },
    },
  },
  {
    name: 'Replicate',
    icon: 'sparkles',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Replicate',
      implementation: {
        imports: ['import replicate'],
        codeblock: `
output = replicate.run(
    "meta/llama-2-70b-chat",
    input={"prompt": input},
)
        `.trim(),
        return: '"".join(output)',
      },
    },
  },
  {
    name: 'AWS SageMaker',
    icon: 'awsBedrock',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Sagemaker',
      implementation: {
        imports: ['import boto3', 'import json'],
        codeblock: `
client = boto3.client("sagemaker-runtime", region_name="us-east-1")
response = client.invoke_endpoint(
    EndpointName="your-llm-endpoint",
    ContentType="application/json",
    Body=json.dumps({"inputs": input}),
)
result = json.loads(response["Body"].read().decode())
        `.trim(),
        return: 'result["generated_text"]',
      },
    },
  },
  {
    name: 'Hugging Face Transformers',
    icon: 'sparkles',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Transformers',
      implementation: {
        imports: ['from transformers import pipeline'],
        codeblock: `
generator = pipeline("text-generation", model="gpt2")
result = generator(input, max_length=100)
        `.trim(),
        return: 'result[0]["generated_text"]',
      },
    },
  },
  {
    name: 'IBM watsonx.ai',
    icon: 'sparkles',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Watsonx',
      implementation: {
        imports: [
          'from ibm_watsonx_ai.foundation_models import Model',
          'from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams',
        ],
        codeblock: `
model = Model(
    model_id="ibm/granite-13b-chat-v2",
    credentials={"url": "https://us-south.ml.cloud.ibm.com", "apikey": os.environ["WATSONX_API_KEY"]},
    project_id=os.environ["WATSONX_PROJECT_ID"],
)
parameters = {GenParams.MAX_NEW_TOKENS: 100}
response = model.generate_text(prompt=input, params=parameters)
        `.trim(),
        return: 'response',
      },
    },
  },
  {
    name: 'Aleph Alpha',
    icon: 'sparkles',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.AlephAlpha',
      implementation: {
        imports: ['from aleph_alpha_client import Client, CompletionRequest, Prompt'],
        codeblock: `
client = Client(token=os.environ["ALEPH_ALPHA_API_KEY"])
request = CompletionRequest(
    prompt=Prompt.from_text(input),
    maximum_tokens=100,
)
response = client.complete(request, model="luminous-supreme")
        `.trim(),
        return: 'response.completions[0].completion',
      },
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
      return: 'text',
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
      return: 'result',
    },
    python: {
      instrumentor: 'Instrumentors.LangChain',
      implementation: {
        imports: [
          'from langchain_openai import ChatOpenAI',
          'from langchain_core.messages import HumanMessage',
        ],
        codeblock: `
llm = ChatOpenAI(model="gpt-4o")
messages = [HumanMessage(content=input)]
response = llm.invoke(messages)
        `.trim(),
        return: 'response.content',
      },
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
      return: 'response',
    },
    python: {
      instrumentor: 'Instrumentors.LlamaIndex',
      implementation: {
        imports: [
          'from llama_index.core import VectorStoreIndex, SimpleDirectoryReader',
        ],
        codeblock: `
documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()
response = query_engine.query(input)
        `.trim(),
        return: 'str(response)',
      },
    },
  },
  {
    name: 'DSPy',
    icon: 'brain',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.DSPy',
      implementation: {
        imports: ['import dspy'],
        codeblock: `
# Configure DSPy with your LLM
lm = dspy.LM("openai/gpt-4o")
dspy.configure(lm=lm)

# Define your DSPy signature and module
class QA(dspy.Signature):
    """Answer questions with short responses."""
    question: str = dspy.InputField()
    answer: str = dspy.OutputField()

qa_module = dspy.Predict(QA)
result = qa_module(question=input)
        `.trim(),
        return: 'result.answer',
      },
    },
  },
  {
    name: 'Haystack',
    icon: 'database',
    pythonOnly: true,
    python: {
      instrumentor: 'Instrumentors.Haystack',
      implementation: {
        imports: [
          'from haystack import Pipeline',
          'from haystack.components.generators import OpenAIGenerator',
          'from haystack.components.builders import PromptBuilder',
        ],
        codeblock: `
pipeline = Pipeline()
pipeline.add_component("prompt_builder", PromptBuilder(template="Answer: {{query}}"))
pipeline.add_component("llm", OpenAIGenerator(model="gpt-4o"))
pipeline.connect("prompt_builder", "llm")

result = pipeline.run({"prompt_builder": {"query": input}})
        `.trim(),
        return: 'result["llm"]["replies"][0]',
      },
    },
  },
]
