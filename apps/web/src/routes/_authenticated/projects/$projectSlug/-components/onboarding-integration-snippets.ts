/**
 * Snippets aligned with public telemetry docs:
 * https://docs.latitude.so/telemetry/overview
 * Provider pages under /telemetry/providers/* and frameworks under /telemetry/frameworks/*
 * OTLP exporter: https://docs.latitude.so/telemetry/otel-exporter
 *
 * Extra providers (Gemini, Groq, …) match the public telemetry docs nav and
 * `packages/telemetry/python/examples` on main (Python SDK); TypeScript auto-instrumentation
 * for those SDKs is not in `@latitude-data/telemetry` yet — use the Python tab or OpenTelemetry.
 */

export type SdkLanguage = "typescript" | "python"

/** Telemetry providers + frameworks (docs.latitude.so nav order, then frameworks). */
export type OnboardingProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "azure-openai"
  | "bedrock"
  | "aiplatform"
  | "vertexai"
  | "groq"
  | "mistral"
  | "ollama"
  | "cohere"
  | "togetherai"
  | "litellm"
  | "replicate"
  | "sagemaker"
  | "watsonx"
  | "aleph-alpha"
  | "transformers"
  | "vercel-ai-sdk"
  | "vercel-ai-sdk-v7"
  | "langchain"
  | "llamaindex"
  | "openai-agents"
  | "google-adk"
  | "crewai"
  | "haystack"
  | "dspy"
  | "eve"
  | "flue"
  | "elevenlabs"
  | "pydantic-ai"

export type TsPackageManager = "npm" | "pnpm" | "yarn" | "bun"

export type PyPackageManager = "pip" | "uv" | "poetry"

export const TS_PACKAGE_MANAGERS: ReadonlyArray<TsPackageManager> = ["npm", "pnpm", "yarn", "bun"]

export const PY_PACKAGE_MANAGERS: ReadonlyArray<PyPackageManager> = ["pip", "uv", "poetry"]

interface OnboardingProviderSnippetConfig {
  readonly id: OnboardingProviderId
  readonly supportsTypescript: boolean
  readonly supportsPython: boolean
}

const crossTsPy = { supportsTypescript: true, supportsPython: true } as const
const tsOnly = { supportsTypescript: true, supportsPython: false } as const
const pyOnly = { supportsTypescript: false, supportsPython: true } as const

export const ONBOARDING_PROVIDER_SNIPPET_CONFIG: Record<OnboardingProviderId, OnboardingProviderSnippetConfig> = {
  openai: { id: "openai", ...crossTsPy },
  anthropic: { id: "anthropic", ...crossTsPy },
  gemini: { id: "gemini", ...pyOnly },
  "azure-openai": { id: "azure-openai", ...crossTsPy },
  bedrock: { id: "bedrock", ...crossTsPy },
  aiplatform: { id: "aiplatform", ...crossTsPy },
  vertexai: { id: "vertexai", ...crossTsPy },
  groq: { id: "groq", ...pyOnly },
  mistral: { id: "mistral", ...pyOnly },
  ollama: { id: "ollama", ...pyOnly },
  cohere: { id: "cohere", ...crossTsPy },
  togetherai: { id: "togetherai", ...crossTsPy },
  litellm: { id: "litellm", ...pyOnly },
  replicate: { id: "replicate", ...pyOnly },
  sagemaker: { id: "sagemaker", ...pyOnly },
  watsonx: { id: "watsonx", ...pyOnly },
  "aleph-alpha": { id: "aleph-alpha", ...pyOnly },
  transformers: { id: "transformers", ...pyOnly },
  "vercel-ai-sdk": { id: "vercel-ai-sdk", ...tsOnly },
  "vercel-ai-sdk-v7": { id: "vercel-ai-sdk-v7", ...tsOnly },
  langchain: { id: "langchain", ...crossTsPy },
  llamaindex: { id: "llamaindex", ...crossTsPy },
  "openai-agents": { id: "openai-agents", ...crossTsPy },
  "google-adk": { id: "google-adk", ...pyOnly },
  crewai: { id: "crewai", ...pyOnly },
  haystack: { id: "haystack", ...pyOnly },
  dspy: { id: "dspy", ...pyOnly },
  eve: { id: "eve", ...tsOnly },
  flue: { id: "flue", ...tsOnly },
  elevenlabs: { id: "elevenlabs", ...crossTsPy },
  "pydantic-ai": { id: "pydantic-ai", ...pyOnly },
}

// Eve ships its telemetry through @vercel/otel directly, so it does NOT install
// the Latitude SDK — its packages live entirely in the provider/framework list.
const PROVIDERS_WITHOUT_LATITUDE_SDK = new Set<OnboardingProviderId>(["eve"])

export function providerUsesLatitudeSdk(id: OnboardingProviderId): boolean {
  return !PROVIDERS_WITHOUT_LATITUDE_SDK.has(id)
}

export function getLatitudeTelemetryTsInstallCommand(pm: TsPackageManager): string {
  switch (pm) {
    case "npm":
      return "npm install @latitude-data/telemetry"
    case "pnpm":
      return "pnpm add @latitude-data/telemetry"
    case "yarn":
      return "yarn add @latitude-data/telemetry"
    case "bun":
      return "bun add @latitude-data/telemetry"
  }
}

export function getLatitudeTelemetryPyInstallCommand(pm: PyPackageManager): string {
  switch (pm) {
    case "pip":
      return "pip install latitude-telemetry"
    case "uv":
      return "uv add latitude-telemetry"
    case "poetry":
      return "poetry add latitude-telemetry"
  }
}

function tsInstallPackages(pm: TsPackageManager, packages: string): string {
  const pkgs = packages.trim()
  switch (pm) {
    case "npm":
      return `npm install ${pkgs}`
    case "pnpm":
      return `pnpm add ${pkgs}`
    case "yarn":
      return `yarn add ${pkgs}`
    case "bun":
      return `bun add ${pkgs}`
  }
}

function pyInstallPackages(pm: PyPackageManager, packages: string): string {
  const pkgs = packages.trim()
  switch (pm) {
    case "pip":
      return `pip install ${pkgs}`
    case "uv":
      return `uv add ${pkgs}`
    case "poetry":
      return `poetry add ${pkgs}`
  }
}

/** Extra packages beyond `@latitude-data/telemetry` / `latitude-telemetry` (docs install them separately). */
export function getProviderSdkTsInstallCommand(id: OnboardingProviderId, pm: TsPackageManager): string | null {
  const map: Partial<Record<OnboardingProviderId, string>> = {
    openai: "openai @traceloop/instrumentation-openai",
    anthropic: "@anthropic-ai/sdk @traceloop/instrumentation-anthropic",
    bedrock: "@aws-sdk/client-bedrock-runtime @traceloop/instrumentation-bedrock",
    cohere: "cohere-ai @traceloop/instrumentation-cohere",
    togetherai: "together-ai @traceloop/instrumentation-together",
    vertexai: "@google-cloud/vertexai @traceloop/instrumentation-vertexai",
    aiplatform: "@google-cloud/aiplatform @traceloop/instrumentation-vertexai",
    "azure-openai": "openai @traceloop/instrumentation-openai",
    "vercel-ai-sdk": "ai @ai-sdk/openai",
    "vercel-ai-sdk-v7": "ai @ai-sdk/otel @ai-sdk/openai",
    langchain: "langchain @langchain/openai @langchain/core @arizeai/openinference-instrumentation-langchain",
    llamaindex: "llamaindex @llamaindex/openai @llamaindex/workflow @traceloop/instrumentation-llamaindex",
    "openai-agents": "@openai/agents zod",
    eve: "@vercel/otel @opentelemetry/exporter-trace-otlp-http",
    flue: "@flue/opentelemetry @opentelemetry/api",
    elevenlabs: "openai express @traceloop/instrumentation-openai",
  }
  const pkgs = map[id]
  return pkgs ? tsInstallPackages(pm, pkgs) : null
}

export function getProviderSdkPyInstallCommand(id: OnboardingProviderId, pm: PyPackageManager): string | null {
  const map: Partial<Record<OnboardingProviderId, string>> = {
    openai: "openai",
    anthropic: "anthropic",
    gemini: "google-genai",
    bedrock: "boto3",
    cohere: "cohere",
    togetherai: "together",
    vertexai: "google-cloud-aiplatform",
    aiplatform: "google-cloud-aiplatform",
    "azure-openai": "openai",
    groq: "groq",
    mistral: "mistralai",
    ollama: "ollama",
    litellm: "litellm",
    replicate: "replicate",
    sagemaker: "boto3",
    watsonx: "ibm-watsonx-ai",
    "aleph-alpha": "aleph-alpha-client",
    transformers: "transformers torch",
    langchain: "langchain-openai langchain-core",
    llamaindex: "llama-index",
    "openai-agents": "openai-agents",
    "google-adk": "google-adk",
    crewai: "crewai",
    haystack: "haystack-ai",
    dspy: "dspy litellm",
    elevenlabs: "openai fastapi uvicorn",
    "pydantic-ai": "pydantic-ai",
  }
  const pkgs = map[id]
  return pkgs ? pyInstallPackages(pm, pkgs) : null
}

function injectLatitudeSdkValues(snippet: string, projectSlug: string, apiKey: string | null): string {
  let resolved = snippet
    .replaceAll("process.env.LATITUDE_PROJECT_SLUG!", JSON.stringify(projectSlug))
    .replaceAll('os.environ["LATITUDE_PROJECT_SLUG"]', JSON.stringify(projectSlug))

  if (apiKey) {
    resolved = resolved
      .replaceAll("process.env.LATITUDE_API_KEY!", JSON.stringify(apiKey))
      .replaceAll('os.environ["LATITUDE_API_KEY"]', JSON.stringify(apiKey))
  }

  return resolved
}

export function getOnboardingSnippet(
  id: OnboardingProviderId,
  lang: SdkLanguage,
  projectSlug: string,
  apiKey: string | null,
): string | null {
  const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG[id]
  if (lang === "typescript" && !cfg.supportsTypescript) return null
  if (lang === "python" && !cfg.supportsPython) return null

  let snippet: string | null

  switch (id) {
    case "openai":
      snippet = lang === "typescript" ? snippetTsOpenai() : snippetPyOpenai()
      break
    case "anthropic":
      snippet = lang === "typescript" ? snippetTsAnthropic() : snippetPyAnthropic()
      break
    case "gemini":
      snippet = lang === "python" ? snippetPyGemini() : null
      break
    case "bedrock":
      snippet = lang === "typescript" ? snippetTsBedrock() : snippetPyBedrock()
      break
    case "cohere":
      snippet = lang === "typescript" ? snippetTsCohere() : snippetPyCohere()
      break
    case "togetherai":
      snippet = lang === "typescript" ? snippetTsTogether() : snippetPyTogether()
      break
    case "vertexai":
      snippet = lang === "typescript" ? snippetTsVertex() : snippetPyVertex()
      break
    case "aiplatform":
      snippet = lang === "typescript" ? snippetTsAiplatform() : snippetPyAiplatform()
      break
    case "azure-openai":
      snippet = lang === "typescript" ? snippetTsAzureOpenai() : snippetPyAzureOpenai()
      break
    case "groq":
      snippet = lang === "python" ? snippetPyGroq() : null
      break
    case "mistral":
      snippet = lang === "python" ? snippetPyMistral() : null
      break
    case "ollama":
      snippet = lang === "python" ? snippetPyOllama() : null
      break
    case "litellm":
      snippet = lang === "python" ? snippetPyLitellm() : null
      break
    case "replicate":
      snippet = lang === "python" ? snippetPyReplicate() : null
      break
    case "sagemaker":
      snippet = lang === "python" ? snippetPySagemaker() : null
      break
    case "watsonx":
      snippet = lang === "python" ? snippetPyWatsonx() : null
      break
    case "aleph-alpha":
      snippet = lang === "python" ? snippetPyAlephAlpha() : null
      break
    case "transformers":
      snippet = lang === "python" ? snippetPyTransformers() : null
      break
    case "vercel-ai-sdk":
      snippet = snippetTsVercelAiSdk()
      break
    case "vercel-ai-sdk-v7":
      snippet = snippetTsVercelAiSdkV7()
      break
    case "langchain":
      snippet = lang === "typescript" ? snippetTsLangchain() : snippetPyLangchain()
      break
    case "llamaindex":
      snippet = lang === "typescript" ? snippetTsLlamaindex() : snippetPyLlamaindex()
      break
    case "openai-agents":
      snippet = lang === "typescript" ? snippetTsOpenaiAgents() : snippetPyOpenaiAgents()
      break
    case "google-adk":
      snippet = lang === "python" ? snippetPyGoogleAdk() : null
      break
    case "crewai":
      snippet = lang === "python" ? snippetPyCrewai() : null
      break
    case "haystack":
      snippet = lang === "python" ? snippetPyHaystack() : null
      break
    case "dspy":
      snippet = lang === "python" ? snippetPyDspy() : null
      break
    case "eve":
      snippet = lang === "typescript" ? snippetTsEve() : null
      break
    case "flue":
      snippet = lang === "typescript" ? snippetTsFlue() : null
      break
    case "elevenlabs":
      snippet = lang === "typescript" ? snippetTsElevenlabs() : snippetPyElevenlabs()
      break
    case "pydantic-ai":
      snippet = lang === "python" ? snippetPyPydanticAi() : null
      break
    default:
      snippet = null
  }

  return snippet ? injectLatitudeSdkValues(snippet, projectSlug, apiKey) : null
}

function snippetTsOpenai() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import OpenAI from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready

const openai = new OpenAI()

await capture("generate-support-reply", async () => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
  })
  return completion.choices[0].message.content
})

await latitude.shutdown()
`
}

function snippetPyOpenai() {
  return `import os
from latitude_telemetry import Latitude, capture
import openai
from openai import OpenAI

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai": openai},
)

client = OpenAI()

def generate_support_reply():
    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
    return completion.choices[0].message.content

capture("generate-support-reply", generate_support_reply)

latitude.shutdown()
`
}

function snippetTsAnthropic() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createAnthropicInstrumentation } from "@latitude-data/telemetry/instrumentations/anthropic"
import Anthropic, * as AnthropicSDK from "@anthropic-ai/sdk"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createAnthropicInstrumentation(AnthropicSDK)],
})

await latitude.ready

const client = new Anthropic()

await capture("generate-reply", async () => {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  })
  return message.content[0].text
})

await latitude.shutdown()
`
}

function snippetPyAnthropic() {
  return `import os
from latitude_telemetry import Latitude, capture
import anthropic
from anthropic import Anthropic

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"anthropic": anthropic},
)

client = Anthropic()

def generate_reply():
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello"}],
    )
    return message.content[0].text

capture("generate-reply", generate_reply)

latitude.shutdown()
`
}

function snippetTsBedrock() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createBedrockInstrumentation } from "@latitude-data/telemetry/instrumentations/bedrock"
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime"
import * as BedrockSDK from "@aws-sdk/client-bedrock-runtime"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createBedrockInstrumentation(BedrockSDK)],
})

await latitude.ready

const client = new BedrockRuntimeClient({ region: "eu-central-1" })

await capture("generate-reply", async () => {
  const command = new InvokeModelCommand({
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hello" }],
    }),
  })
  const response = await client.send(command)
  return JSON.parse(new TextDecoder().decode(response.body))
})

await latitude.shutdown()
`
}

function snippetPyBedrock() {
  return `import json
import os
from latitude_telemetry import Latitude, capture
import boto3

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"bedrock": boto3},
)

client = boto3.client("bedrock-runtime", region_name="eu-central-1")

def generate_reply():
    response = client.invoke_model(
        modelId="anthropic.claude-3-haiku-20240307-v1:0",
        contentType="application/json",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": "Hello"}],
        }),
    )
    return json.loads(response["body"].read())

capture("generate-reply", generate_reply)

latitude.shutdown()
`
}

function snippetTsCohere() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createCohereInstrumentation } from "@latitude-data/telemetry/instrumentations/cohere"
import { CohereClient } from "cohere-ai"
import * as CohereSDK from "cohere-ai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createCohereInstrumentation(CohereSDK)],
})

await latitude.ready

const client = new CohereClient({ token: process.env.COHERE_API_KEY! })

await capture("generate-reply", async () => {
  const response = await client.chat({
    model: "command-a-03-2025",
    message: "Hello",
  })
  return response.text
})

await latitude.shutdown()
`
}

function snippetPyCohere() {
  return `import os
from latitude_telemetry import Latitude, capture
import cohere

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"cohere": cohere},
)

client = cohere.Client()

def generate_reply():
    response = client.chat(
        model="command-a-03-2025",
        message="Hello",
    )
    return response.text

capture("generate-reply", generate_reply)

latitude.shutdown()
`
}

function snippetTsTogether() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createTogetherAIInstrumentation } from "@latitude-data/telemetry/instrumentations/togetherai"
import Together, * as TogetherSDK from "together-ai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createTogetherAIInstrumentation(TogetherSDK)],
})

await latitude.ready

const client = new Together()

await capture("generate-reply", async () => {
  const response = await client.chat.completions.create({
    model: "meta-llama/Llama-3-70b-chat-hf",
    messages: [{ role: "user", content: "Hello" }],
  })
  return response.choices[0].message.content
})

await latitude.shutdown()
`
}

function snippetPyTogether() {
  return `import os
from latitude_telemetry import Latitude, capture
import together
from together import Together

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"togetherai": together},
)

client = Together()

def generate_reply():
    response = client.chat.completions.create(
        model="meta-llama/Llama-3-70b-chat-hf",
        messages=[{"role": "user", "content": "Hello"}],
    )
    return response.choices[0].message.content

capture("generate-reply", generate_reply)

latitude.shutdown()
`
}

function snippetTsVertex() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createVertexAIInstrumentation } from "@latitude-data/telemetry/instrumentations/vertexai"
import { VertexAI } from "@google-cloud/vertexai"
import * as VertexAISDK from "@google-cloud/vertexai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createVertexAIInstrumentation(VertexAISDK)],
})

await latitude.ready

const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT_ID!,
  location: "us-central1",
})
const model = vertexAI.getGenerativeModel({ model: "gemini-1.5-flash" })

await capture("generate-reply", async () => {
  const result = await model.generateContent("Hello")
  return result.response.candidates?.[0].content.parts[0].text
})

await latitude.shutdown()
`
}

function snippetPyVertex() {
  return `import os
from latitude_telemetry import Latitude, capture
import vertexai
from vertexai.generative_models import GenerativeModel

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"vertexai": vertexai},
)

vertexai.init(project=os.environ["GCP_PROJECT_ID"], location="us-central1")
model = GenerativeModel("gemini-1.5-flash")

def generate_reply():
    response = model.generate_content("Hello")
    return response.text

capture("generate-reply", generate_reply)

latitude.shutdown()
`
}

function snippetTsAiplatform() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createAIPlatformInstrumentation } from "@latitude-data/telemetry/instrumentations/aiplatform"
import { PredictionServiceClient } from "@google-cloud/aiplatform"
import * as AIPlatformSDK from "@google-cloud/aiplatform"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createAIPlatformInstrumentation(AIPlatformSDK)],
})

await latitude.ready

const client = new PredictionServiceClient()

await capture("generate-prediction", async () => {
  const [response] = await client.predict({
    endpoint: \`projects/\${process.env.GCP_PROJECT_ID}/locations/us-central1/publishers/google/models/text-bison\`,
    instances: [{ content: "Hello" }],
    parameters: { temperature: 0.2, maxOutputTokens: 256 },
  })
  return response.predictions
})

await latitude.shutdown()
`
}

function snippetPyAiplatform() {
  return `import os
from latitude_telemetry import Latitude, capture
from google.cloud import aiplatform

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"aiplatform": aiplatform},
)

aiplatform.init(project=os.environ["GCP_PROJECT_ID"], location="us-central1")

def generate_prediction():
    model = aiplatform.TextGenerationModel.from_pretrained("text-bison")
    response = model.predict("Hello", temperature=0.2, max_output_tokens=256)
    return response.text

capture("generate-prediction", generate_prediction)

latitude.shutdown()
`
}

function snippetTsAzureOpenai() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"
import { AzureOpenAI, OpenAI } from "openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready

const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: "2024-02-01",
})

await capture("generate-support-reply", async () => {
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
  })
  return completion.choices[0].message.content
})

await latitude.shutdown()
`
}

function snippetPyAzureOpenai() {
  return `import os
from latitude_telemetry import Latitude, capture
import openai
from openai import AzureOpenAI

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai": openai},
)

client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version="2024-02-01",
)

def generate_support_reply():
    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
    return completion.choices[0].message.content

capture("generate-support-reply", generate_support_reply)

latitude.shutdown()
`
}

function snippetTsVercelAiSdk() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
})

await capture("generate-support-reply", async () => {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt: "Hello",
    experimental_telemetry: {
      isEnabled: true,
    },
  })
  return text
})

await latitude.shutdown()
`
}

function snippetTsVercelAiSdkV7() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { generateText, registerTelemetry } from "ai"
import { OpenTelemetry } from "@ai-sdk/otel"
import { openai } from "@ai-sdk/openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
})

await latitude.ready

// Vercel AI SDK v7 moved OpenTelemetry into @ai-sdk/otel and made it opt-out.
// Register once, after Latitude — every AI SDK call then emits telemetry.
registerTelemetry(new OpenTelemetry())

await capture("generate-support-reply", async () => {
  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt: "Hello",
  })
  return text
})

await latitude.shutdown()
`
}

function snippetTsLangchain() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createLangChainInstrumentation } from "@latitude-data/telemetry/instrumentations/langchain"
import { ChatOpenAI } from "@langchain/openai"
import { HumanMessage } from "@langchain/core/messages"
import * as LangChain from "langchain"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createLangChainInstrumentation(LangChain)],
})

await latitude.ready

const llm = new ChatOpenAI({ modelName: "gpt-4o" })

await capture("langchain-query", async () => {
  const response = await llm.invoke([new HumanMessage("Hello")])
  return response.content
})

await latitude.shutdown()
`
}

function snippetPyLangchain() {
  return `import os
from latitude_telemetry import Latitude, capture
import langchain_core
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"langchain": langchain_core},
)

llm = ChatOpenAI(model="gpt-4o")

def langchain_query():
    response = llm.invoke([HumanMessage(content="Hello")])
    return response.content

capture("langchain-query", langchain_query)

latitude.shutdown()
`
}

function snippetTsLlamaindex() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createLlamaIndexInstrumentation } from "@latitude-data/telemetry/instrumentations/llamaindex"
import { Settings } from "llamaindex"
import { openai } from "@llamaindex/openai"
import { agent } from "@llamaindex/workflow"
import * as LlamaIndex from "llamaindex"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createLlamaIndexInstrumentation(LlamaIndex)],
})

await latitude.ready

Settings.llm = openai({ model: "gpt-4o" })
const myAgent = agent({ tools: [] })

await capture("llamaindex-query", async () => {
  const response = await myAgent.run("Hello")
  return response
})

await latitude.shutdown()
`
}

function snippetPyLlamaindex() {
  return `import os
from latitude_telemetry import Latitude, capture
import llama_index
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"llamaindex": llama_index},
)

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()

def llamaindex_query():
    response = query_engine.query("What is this document about?")
    return str(response)

capture("llamaindex-query", llamaindex_query)

latitude.shutdown()
`
}

function snippetTsOpenaiAgents() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createOpenAIAgentsInstrumentation } from "@latitude-data/telemetry/instrumentations/openai-agents"
import { Agent, run } from "@openai/agents"
import * as OpenAIAgentsSDK from "@openai/agents"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIAgentsInstrumentation(OpenAIAgentsSDK)],
})

await latitude.ready

const agent = new Agent({
  name: "Greeter",
  instructions: "Answer concisely.",
  model: "gpt-4o-mini",
})

await capture("agent-run", async () => {
  const result = await run(agent, "Hello")
  return result.finalOutput
})

await latitude.shutdown()
`
}

function snippetPyOpenaiAgents() {
  return `import asyncio
import os

import agents
from agents import Agent, Runner
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai-agents": agents},
)

agent = Agent(name="Greeter", instructions="Answer concisely.", model="gpt-4o-mini")


@capture("agent-run", {"session_id": "example"})
def main():
    return asyncio.run(Runner.run(agent, "Hello")).final_output


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyGoogleAdk() {
  return `import asyncio
import os

import google.adk
from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"google_adk": google.adk},
)

agent = Agent(
    name="greeter",
    model="gemini-2.5-flash",
    instruction="Answer concisely.",
)


async def agent_run():
    runner = InMemoryRunner(agent=agent, app_name="example_app")
    await runner.session_service.create_session(
        app_name="example_app", user_id="user_123", session_id="session_abc"
    )
    async for event in runner.run_async(
        user_id="user_123",
        session_id="session_abc",
        new_message=types.Content(role="user", parts=[types.Part(text="Hello")]),
    ):
        if event.is_final_response() and event.content and event.content.parts:
            return event.content.parts[0].text


@capture("agent-run", {"session_id": "example"})
def main():
    return asyncio.run(agent_run())


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyCrewai() {
  return `import os

import crewai
from crewai import Agent, Crew, Task
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"crewai": crewai},
)


@capture("crew-run", {"session_id": "example"})
def main():
    researcher = Agent(
        role="Researcher",
        goal="Summarize topics concisely",
        backstory="You provide brief, accurate summaries.",
        llm="gpt-4o-mini",
    )
    task = Task(
        description="Explain what OpenTelemetry is in one sentence.",
        expected_output="A single sentence.",
        agent=researcher,
    )
    return Crew(agents=[researcher], tasks=[task]).kickoff().raw


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyHaystack() {
  return `import os

import haystack
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"haystack": haystack},
)


@capture("haystack-chat", {"session_id": "example"})
def main():
    generator = OpenAIChatGenerator(model="gpt-4o-mini")
    result = generator.run(messages=[ChatMessage.from_user("Hello")])
    return result["replies"][0].text


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyDspy() {
  return `import os

import dspy
import litellm
from latitude_telemetry import Latitude, capture

# DSPy has no dedicated instrumentor — it routes every LM call through litellm,
# so instrumenting litellm captures DSPy's model calls.
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"litellm": litellm},
)

dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))


@capture("dspy-qa", {"session_id": "example"})
def main():
    qa = dspy.Predict("question -> answer")
    return qa(question="Hello").answer


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyPydanticAi() {
  return `import os

from latitude_telemetry import Latitude, capture
from pydantic_ai import Agent

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
)

# Pydantic AI self-instruments via OpenTelemetry onto the global provider
# Latitude just registered, so no \`instrumentations\` entry is needed.
Agent.instrument_all()

agent = Agent("openai:gpt-4o-mini", system_prompt="You are a helpful assistant.")


@capture("pydantic-ai-run", {"session_id": "example"})
def main():
    return agent.run_sync("Hello").output


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyGemini() {
  return `import os

from google import genai
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"google_generativeai": genai},
)


@capture("gemini-completion", {"session_id": "example"})
def main():
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Hello",
    )
    return response.text


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyGroq() {
  return `import os

import groq
from groq import Groq
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"groq": groq},
)


@capture("groq-completion", {"session_id": "example"})
def main():
    client = Groq()
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=50,
    )
    return response.choices[0].message.content


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyMistral() {
  return `import os

import mistralai
from mistralai import Mistral
from mistralai.models import UserMessage
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"mistralai": mistralai},
)


@capture("mistral-completion", {"session_id": "example"})
def main():
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    response = client.chat.complete(
        model="mistral-small-latest",
        messages=[UserMessage(role="user", content="Hello")],
        max_tokens=50,
    )
    return response.choices[0].message.content


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyOllama() {
  return `import os

import ollama
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"ollama": ollama},
)


@capture("ollama-completion", {"session_id": "example"})
def main():
    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": "Hello"}],
    )
    return response["message"]["content"]


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyLitellm() {
  return `import os

import litellm
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"litellm": litellm},
)


@capture("litellm-completion", {"session_id": "example"})
def main():
    response = litellm.completion(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=50,
    )
    return response.choices[0].message.content


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyReplicate() {
  return `import os

import replicate
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"replicate": replicate},
)


@capture("replicate-run", {"session_id": "example"})
def main():
    output = replicate.run(
        "meta/meta-llama-3-8b-instruct",
        input={"prompt": "Hello", "max_tokens": 50},
    )
    return "".join(output)


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPySagemaker() {
  return `import json
import os

import boto3
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"sagemaker": boto3},
)


@capture("sagemaker-invoke", {"session_id": "example"})
def main():
    client = boto3.client(
        "sagemaker-runtime",
        region_name=os.environ.get("AWS_REGION", "eu-central-1"),
    )
    payload = json.dumps(
        {
            "inputs": "Hello",
            "parameters": {"max_new_tokens": 50},
        }
    )
    response = client.invoke_endpoint(
        EndpointName=os.environ["SAGEMAKER_ENDPOINT_NAME"],
        ContentType="application/json",
        Body=payload,
    )
    result = json.loads(response["Body"].read().decode())
    return result[0]["generated_text"]


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyWatsonx() {
  return `import os

import ibm_watsonx_ai
from ibm_watsonx_ai.foundation_models import Model
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"watsonx": ibm_watsonx_ai},
)


@capture("watsonx-generate", {"session_id": "example"})
def main():
    model = Model(
        model_id="ibm/granite-13b-chat-v2",
        credentials={
            "url": os.environ.get("WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
            "apikey": os.environ["WATSONX_API_KEY"],
        },
        project_id=os.environ["WATSONX_PROJECT_ID"],
    )
    return model.generate_text(
        prompt="Hello",
        params={GenParams.MAX_NEW_TOKENS: 50},
    )


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyAlephAlpha() {
  return `import os

import aleph_alpha_client
from aleph_alpha_client import Client, CompletionRequest, Prompt
from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"aleph_alpha": aleph_alpha_client},
)


@capture("aleph-alpha-complete", {"session_id": "example"})
def main():
    client = Client(token=os.environ["ALEPH_ALPHA_API_KEY"])
    request = CompletionRequest(
        prompt=Prompt.from_text("Hello:"),
        maximum_tokens=50,
    )
    response = client.complete(request, model="luminous-base")
    return response.completions[0].completion


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetPyTransformers() {
  return `import os

from latitude_telemetry import Latitude, capture
import transformers
from transformers import pipeline

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"transformers": transformers},
)


@capture("transformers-generate", {"session_id": "example"})
def main():
    generator = pipeline(
        "text-generation",
        model="gpt2",
        max_new_tokens=50,
    )
    result = generator("Hello:")
    return result[0]["generated_text"]


if __name__ == "__main__":
    main()
    latitude.shutdown()
`
}

function snippetTsEve() {
  return `// agent/instrumentation.ts — Eve auto-discovers this file and runs it at startup.
import { defineInstrumentation } from "eve/instrumentation"
import { registerOTel } from "@vercel/otel"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

export default defineInstrumentation({
  setup: ({ agentName }) =>
    registerOTel({
      serviceName: agentName,
      traceExporter: new OTLPTraceExporter({
        url: "https://ingest.latitude.so/v1/traces",
        headers: {
          Authorization: \`Bearer \${process.env.LATITUDE_API_KEY!}\`,
          "X-Latitude-Project": process.env.LATITUDE_PROJECT_SLUG!,
        },
      }),
    }),
})
`
}

function snippetTsFlue() {
  return `import { Latitude, capture } from "@latitude-data/telemetry"
import { createOpenTelemetryObserver } from "@flue/opentelemetry"
import { observe } from "@flue/runtime"

new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  serviceName: "flue-app",
})

// Flue emits OpenTelemetry spans itself — no instrumentations entry needed.
observe(createOpenTelemetryObserver())

// Optionally wrap a run to attach user/session/tags to its Flue spans.
await capture("flue-workflow", async () => {
  // run your Flue workflow here
})
`
}

function snippetTsElevenlabs() {
  return `import express from "express"
import OpenAI from "openai"
import { Latitude } from "@latitude-data/telemetry"
import { createOpenAIInstrumentation } from "@latitude-data/telemetry/instrumentations/openai"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: [createOpenAIInstrumentation(OpenAI)],
})

await latitude.ready
const app = express()
app.use(express.json())
const client = new OpenAI()

// Point your ElevenLabs agent's Custom LLM at this instrumented proxy.
app.post("/v1/chat/completions", async (req, res) => {
  const { elevenlabs_extra_body: _extra, ...body } = req.body
  res.setHeader("Content-Type", "text/event-stream")

  const stream = await client.chat.completions.create({ ...body, stream: true })
  for await (const chunk of stream) {
    res.write(\`data: \${JSON.stringify(chunk)}\\n\\n\`)
  }
  res.write("data: [DONE]\\n\\n")
  res.end()
})

app.listen(8013)
`
}

function snippetPyElevenlabs() {
  return `import os

import openai
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from latitude_telemetry import Latitude

Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai": openai},
)

app = FastAPI()
client = AsyncOpenAI()


# Point your ElevenLabs agent's Custom LLM at this instrumented proxy.
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    body.pop("elevenlabs_extra_body", None)
    body["stream"] = True

    async def stream():
        response = await client.chat.completions.create(**body)
        async for chunk in response:
            yield f"data: {chunk.model_dump_json()}\\n\\n"
        yield "data: [DONE]\\n\\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
`
}

const OTLP_TRACES_ENDPOINT = "https://ingest.latitude.so/v1/traces"

function sdkEnvExtras(id: OnboardingProviderId): string {
  switch (id) {
    case "openai":
      return "OPENAI_API_KEY=sk-..."
    case "azure-openai":
      return `AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=...`
    case "anthropic":
      return "ANTHROPIC_API_KEY=sk-ant-..."
    case "gemini":
      return "GEMINI_API_KEY=..."
    case "bedrock":
      return `AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-central-1`
    case "cohere":
      return "COHERE_API_KEY=..."
    case "togetherai":
      return "TOGETHER_API_KEY=..."
    case "vertexai":
      return "GCP_PROJECT_ID=..."
    case "aiplatform":
      return "GCP_PROJECT_ID=..."
    case "groq":
      return "GROQ_API_KEY=..."
    case "mistral":
      return "MISTRAL_API_KEY=..."
    case "ollama":
      return "OLLAMA_HOST=http://localhost:11434"
    case "litellm":
      return "OPENAI_API_KEY=sk-..."
    case "replicate":
      return "REPLICATE_API_TOKEN=r8_..."
    case "sagemaker":
      return `AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-central-1
SAGEMAKER_ENDPOINT_NAME=...`
    case "watsonx":
      return `WATSONX_API_KEY=...
WATSONX_PROJECT_ID=...
WATSONX_URL=https://us-south.ml.cloud.ibm.com`
    case "aleph-alpha":
      return "ALEPH_ALPHA_API_KEY=..."
    case "transformers":
      return "HF_TOKEN=hf_..."
    case "vercel-ai-sdk":
    case "vercel-ai-sdk-v7":
      return "OPENAI_API_KEY=sk-..."
    case "langchain":
    case "llamaindex":
      return "OPENAI_API_KEY=sk-..."
    case "openai-agents":
    case "crewai":
    case "haystack":
    case "dspy":
    case "eve":
    case "flue":
    case "elevenlabs":
    case "pydantic-ai":
      return "OPENAI_API_KEY=sk-..."
    case "google-adk":
      return "GOOGLE_API_KEY=..."
    default:
      return ""
  }
}

/** Latitude SDK + provider keys for the TypeScript / Python tabs (not the OTLP exporter page). */
export function getEnvBlock(id: OnboardingProviderId, projectSlug: string, apiKey: string | null): string {
  const slugLine = `LATITUDE_PROJECT_SLUG=${projectSlug}`
  const commonSdk = `LATITUDE_API_KEY=${apiKey ?? "your-api-key"}
${slugLine}`

  const extra = sdkEnvExtras(id)
  return extra ? `${commonSdk}\n${extra}` : commonSdk
}

/** Language SDK examples aligned with https://docs.latitude.so/telemetry/otel-exporter (cURL is separate in the UI). */
export type OtelExporterLanguageId = "go" | "java" | "ruby" | "dotnet"

export const OTEL_EXPORTER_LANGUAGE_OPTIONS: ReadonlyArray<{
  readonly id: OtelExporterLanguageId
  readonly label: string
}> = [
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "ruby", label: "Ruby" },
  { id: "dotnet", label: ".NET" },
]

/**
 * Curl example from the OTLP exporter docs (`/telemetry/otel-exporter`); project slug prefilled on the header line.
 */
export function getOtelCurlVerifySnippet(projectSlug: string, apiKey: string | null): string {
  return `curl -X POST ${OTLP_TRACES_ENDPOINT} \\
  -H "Authorization: Bearer ${apiKey ?? "YOUR_API_KEY"}" \\
  -H "X-Latitude-Project: ${projectSlug}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{
          "key": "service.name",
          "value": { "stringValue": "my-service" }
        }]
      },
      "scopeSpans": [{
        "scope": { "name": "manual-test" },
        "spans": [{
          "traceId": "00000000000000000000000000000001",
          "spanId": "0000000000000001",
          "name": "test-span",
          "kind": 1,
          "startTimeUnixNano": "1700000000000000000",
          "endTimeUnixNano": "1700000001000000000",
          "attributes": [{
            "key": "gen_ai.system",
            "value": { "stringValue": "openai" }
          }]
        }]
      }]
    }]
  }'`
}

function goOtelSnippet(projectSlug: string, apiKey: string | null): string {
  const slug = JSON.stringify(projectSlug)
  const authHeader = apiKey ? JSON.stringify(`Bearer ${apiKey}`) : '"Bearer " + apiKey'
  return `import (
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
)

exporter, err := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpointURL("${OTLP_TRACES_ENDPOINT}"),
    otlptracehttp.WithHeaders(map[string]string{
        "Authorization":      ${authHeader},
        "X-Latitude-Project":   ${slug},
    }),
)

provider := trace.NewTracerProvider(trace.WithBatcher(exporter))
`
}

function javaOtelSnippet(projectSlug: string, apiKey: string | null): string {
  const slug = JSON.stringify(projectSlug)
  const authHeader = apiKey ? JSON.stringify(`Bearer ${apiKey}`) : '"Bearer " + apiKey'
  return `import io.opentelemetry.exporter.otlp.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;

OtlpHttpSpanExporter exporter = OtlpHttpSpanExporter.builder()
    .setEndpoint("${OTLP_TRACES_ENDPOINT}")
    .addHeader("Authorization", ${authHeader})
    .addHeader("X-Latitude-Project", ${slug})
    .build();

SdkTracerProvider provider = SdkTracerProvider.builder()
    .addSpanProcessor(BatchSpanProcessor.builder(exporter).build())
    .build();
`
}

function rubyOtelSnippet(projectSlug: string, apiKey: string | null): string {
  const authHeader = apiKey ?? "#{api_key}"
  return `require "opentelemetry-sdk"
require "opentelemetry-exporter-otlp"

ENV["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] = "${OTLP_TRACES_ENDPOINT}"
ENV["OTEL_EXPORTER_OTLP_TRACES_HEADERS"] = "Authorization=Bearer ${authHeader},X-Latitude-Project=${projectSlug}"

OpenTelemetry::SDK.configure do |c|
  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new
    )
  )
end
`
}

function dotnetOtelSnippet(projectSlug: string, apiKey: string | null): string {
  const authHeader = apiKey
    ? JSON.stringify(`Authorization=Bearer ${apiKey},X-Latitude-Project=${projectSlug}`)
    : `"Authorization=Bearer " + apiKey + ",X-Latitude-Project=${projectSlug}"`
  return `using OpenTelemetry;
using OpenTelemetry.Trace;
using OpenTelemetry.Exporter;

var tracerProvider = Sdk.CreateTracerProviderBuilder()
    .AddOtlpExporter(opt =>
    {
        opt.Endpoint = new Uri("${OTLP_TRACES_ENDPOINT}");
        opt.Headers = ${authHeader};
        opt.Protocol = OtlpExportProtocol.HttpProtobuf;
    })
    .Build();
`
}

export function getOtelExporterLanguageSnippet(
  id: OtelExporterLanguageId,
  projectSlug: string,
  apiKey: string | null,
): string {
  switch (id) {
    case "go":
      return goOtelSnippet(projectSlug, apiKey)
    case "java":
      return javaOtelSnippet(projectSlug, apiKey)
    case "ruby":
      return rubyOtelSnippet(projectSlug, apiKey)
    case "dotnet":
      return dotnetOtelSnippet(projectSlug, apiKey)
  }
}

/**
 * Mirrors the public telemetry docs prompt
 * (https://docs.latitude.so/telemetry/overview#ask-your-coding-agent), with the
 * project slug + API key pre-filled so the agent doesn't need to ask.
 */
export function getCodingAgentTelemetryPrompt(): string {
  return "Install the `latitude-telemetry` skill from `github.com/latitude-dev/skills`, and use it to add Latitude tracing to this app following best practices."
}

/** Mirrors the memory-tracing docs prompt (docs.latitude.so/telemetry/memory). */
export function getMemoryTelemetryPrompt(): string {
  return "Install the `latitude-telemetry` skill from `github.com/latitude-dev/skills`, and use it to add Latitude memory observability to this app's long-term memory, following best practices."
}

export type CodingMachineAgentId = "claude-code" | "openclaw" | "hermes" | "pi"

export function getCodingMachineTelemetryInstallCommand(agent: CodingMachineAgentId): string {
  switch (agent) {
    case "claude-code":
      return "npx -y @latitude-data/claude-code-telemetry install"
    case "openclaw":
      return ["npx -y @latitude-data/openclaw-telemetry install", "openclaw gateway restart"].join("\n")
    case "hermes":
      return "pip install latitude-telemetry-hermes"
    case "pi":
      return "npx -y @latitude-data/pi-telemetry install"
  }
}

export function getPiTelemetryInstallCommand(projectSlug: string, apiKey: string | null): string {
  const key = apiKey ?? "lat_xxx"
  const slug = projectSlug.trim() || "your-project-slug"
  return [
    "npx -y @latitude-data/pi-telemetry install \\",
    `  --api-key=${key} \\`,
    `  --project=${slug} \\`,
    "  --yes",
  ].join("\n")
}

export function getHermesConfigYamlBlock(): string {
  return ["plugins:", "  enabled:", "    - latitude"].join("\n")
}

export function getHermesEnvBlock(projectSlug: string, apiKey: string | null): string {
  const slug = projectSlug.trim() || "your-project-slug"
  const key = apiKey ?? "lat_xxx"
  return `LATITUDE_API_KEY=${key}\nLATITUDE_PROJECT=${slug}`
}

export function getCodingMachineInstallDescription(agent: CodingMachineAgentId): string {
  switch (agent) {
    case "claude-code":
      return "Run the command in your terminal and follow the instructions. Telemetry will be set up for Claude Code in the CLI, IDE, and Desktop app."
    case "openclaw":
      return "Run the install command in your terminal and follow the prompts, then run the gateway restart command so the plugin loads."
    case "hermes":
      return "Install into the Python that runs Hermes (use `~/.hermes/bin/uv pip install --python ~/.hermes/hermes-agent/venv/bin/python latitude-telemetry-hermes` if Hermes uses its own venv), enable the plugin in `~/.hermes/config.yaml`, and set credentials in `~/.hermes/.env`."
    case "pi":
      return "Run the installer with your API key and project slug, then restart pi so the extension loads."
  }
}
