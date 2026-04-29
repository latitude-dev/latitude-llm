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
  | "langchain"
  | "llamaindex"

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
  langchain: { id: "langchain", ...crossTsPy },
  llamaindex: { id: "llamaindex", ...crossTsPy },
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
    openai: "openai",
    anthropic: "@anthropic-ai/sdk",
    bedrock: "@aws-sdk/client-bedrock-runtime",
    cohere: "cohere-ai",
    togetherai: "together-ai",
    vertexai: "@google-cloud/vertexai",
    aiplatform: "@google-cloud/aiplatform",
    "azure-openai": "openai",
    "vercel-ai-sdk": "ai @ai-sdk/openai",
    langchain: "@langchain/openai @langchain/core",
    llamaindex: "llamaindex @llamaindex/openai @llamaindex/workflow",
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
  }
  const pkgs = map[id]
  return pkgs ? pyInstallPackages(pm, pkgs) : null
}

export function getOnboardingSnippet(id: OnboardingProviderId, lang: SdkLanguage, _projectSlug: string): string | null {
  const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG[id]
  if (lang === "typescript" && !cfg.supportsTypescript) return null
  if (lang === "python" && !cfg.supportsPython) return null

  switch (id) {
    case "openai":
      return lang === "typescript" ? snippetTsOpenai() : snippetPyOpenai()
    case "anthropic":
      return lang === "typescript" ? snippetTsAnthropic() : snippetPyAnthropic()
    case "gemini":
      return lang === "python" ? snippetPyGemini() : null
    case "bedrock":
      return lang === "typescript" ? snippetTsBedrock() : snippetPyBedrock()
    case "cohere":
      return lang === "typescript" ? snippetTsCohere() : snippetPyCohere()
    case "togetherai":
      return lang === "typescript" ? snippetTsTogether() : snippetPyTogether()
    case "vertexai":
      return lang === "typescript" ? snippetTsVertex() : snippetPyVertex()
    case "aiplatform":
      return lang === "typescript" ? snippetTsAiplatform() : snippetPyAiplatform()
    case "azure-openai":
      return lang === "typescript" ? snippetTsAzureOpenai() : snippetPyAzureOpenai()
    case "groq":
      return lang === "python" ? snippetPyGroq() : null
    case "mistral":
      return lang === "python" ? snippetPyMistral() : null
    case "ollama":
      return lang === "python" ? snippetPyOllama() : null
    case "litellm":
      return lang === "python" ? snippetPyLitellm() : null
    case "replicate":
      return lang === "python" ? snippetPyReplicate() : null
    case "sagemaker":
      return lang === "python" ? snippetPySagemaker() : null
    case "watsonx":
      return lang === "python" ? snippetPyWatsonx() : null
    case "aleph-alpha":
      return lang === "python" ? snippetPyAlephAlpha() : null
    case "transformers":
      return lang === "python" ? snippetPyTransformers() : null
    case "vercel-ai-sdk":
      return snippetTsVercelAiSdk()
    case "langchain":
      return lang === "typescript" ? snippetTsLangchain() : snippetPyLangchain()
    case "llamaindex":
      return lang === "typescript" ? snippetTsLlamaindex() : snippetPyLlamaindex()
    default:
      return null
  }
}

function snippetTsOpenai() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import OpenAI from "openai"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
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
from latitude_telemetry import init_latitude, capture
from openai import OpenAI

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai"],
)

client = OpenAI()

def generate_support_reply():
    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
    return completion.choices[0].message.content

capture("generate-support-reply", generate_support_reply)

latitude["shutdown"]()
`
}

function snippetTsAnthropic() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import Anthropic from "@anthropic-ai/sdk"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["anthropic"],
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
from latitude_telemetry import init_latitude, capture
from anthropic import Anthropic

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["anthropic"],
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

latitude["shutdown"]()
`
}

function snippetTsBedrock() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["bedrock"],
})

await latitude.ready

const client = new BedrockRuntimeClient({ region: "us-east-1" })

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
from latitude_telemetry import init_latitude, capture
import boto3

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["bedrock"],
)

client = boto3.client("bedrock-runtime", region_name="us-east-1")

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

latitude["shutdown"]()
`
}

function snippetTsCohere() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { CohereClient } from "cohere-ai"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["cohere"],
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
from latitude_telemetry import init_latitude, capture
import cohere

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["cohere"],
)

client = cohere.Client()

def generate_reply():
    response = client.chat(
        model="command-a-03-2025",
        message="Hello",
    )
    return response.text

capture("generate-reply", generate_reply)

latitude["shutdown"]()
`
}

function snippetTsTogether() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import Together from "together-ai"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["togetherai"],
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
from latitude_telemetry import init_latitude, capture
from together import Together

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["togetherai"],
)

client = Together()

def generate_reply():
    response = client.chat.completions.create(
        model="meta-llama/Llama-3-70b-chat-hf",
        messages=[{"role": "user", "content": "Hello"}],
    )
    return response.choices[0].message.content

capture("generate-reply", generate_reply)

latitude["shutdown"]()
`
}

function snippetTsVertex() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { VertexAI } from "@google-cloud/vertexai"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["vertexai"],
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
from latitude_telemetry import init_latitude, capture
import vertexai
from vertexai.generative_models import GenerativeModel

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["vertexai"],
)

vertexai.init(project=os.environ["GCP_PROJECT_ID"], location="us-central1")
model = GenerativeModel("gemini-1.5-flash")

def generate_reply():
    response = model.generate_content("Hello")
    return response.text

capture("generate-reply", generate_reply)

latitude["shutdown"]()
`
}

function snippetTsAiplatform() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { PredictionServiceClient } from "@google-cloud/aiplatform"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["aiplatform"],
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
from latitude_telemetry import init_latitude, capture
from google.cloud import aiplatform

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["aiplatform"],
)

aiplatform.init(project=os.environ["GCP_PROJECT_ID"], location="us-central1")

def generate_prediction():
    model = aiplatform.TextGenerationModel.from_pretrained("text-bison")
    response = model.predict("Hello", temperature=0.2, max_output_tokens=256)
    return response.text

capture("generate-prediction", generate_prediction)

latitude["shutdown"]()
`
}

function snippetTsAzureOpenai() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { AzureOpenAI } from "openai"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["openai"],
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
from latitude_telemetry import init_latitude, capture
from openai import AzureOpenAI

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai"],
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

latitude["shutdown"]()
`
}

function snippetTsVercelAiSdk() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
})

await latitude.ready

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

function snippetTsLangchain() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { ChatOpenAI } from "@langchain/openai"
import { HumanMessage } from "@langchain/core/messages"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["langchain"],
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
from latitude_telemetry import init_latitude, capture
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["langchain"],
)

llm = ChatOpenAI(model="gpt-4o")

def langchain_query():
    response = llm.invoke([HumanMessage(content="Hello")])
    return response.content

capture("langchain-query", langchain_query)

latitude["shutdown"]()
`
}

function snippetTsLlamaindex() {
  return `import { initLatitude, capture } from "@latitude-data/telemetry"
import { Settings } from "llamaindex"
import { openai } from "@llamaindex/openai"
import { agent } from "@llamaindex/workflow"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: process.env.LATITUDE_PROJECT_SLUG!,
  instrumentations: ["llamaindex"],
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
from latitude_telemetry import init_latitude, capture
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["llamaindex"],
)

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()

def llamaindex_query():
    response = query_engine.query("What is this document about?")
    return str(response)

capture("llamaindex-query", llamaindex_query)

latitude["shutdown"]()
`
}

function snippetPyGemini() {
  return `import os

from latitude_telemetry import capture, init_latitude

# Initialize telemetry before importing google.genai so instrumentation can patch it.
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["google_generativeai"],
)

from google import genai


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
    latitude["shutdown"]()
`
}

function snippetPyGroq() {
  return `import os

from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["groq"],
)

from groq import Groq


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
    latitude["shutdown"]()
`
}

function snippetPyMistral() {
  return `import os

from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["mistralai"],
)

from mistralai import Mistral
from mistralai.models import UserMessage


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
    latitude["shutdown"]()
`
}

function snippetPyOllama() {
  return `import os

import ollama
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["ollama"],
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
    latitude["shutdown"]()
`
}

function snippetPyLitellm() {
  return `import os

import litellm
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["litellm"],
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
    latitude["shutdown"]()
`
}

function snippetPyReplicate() {
  return `import os

import replicate
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["replicate"],
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
    latitude["shutdown"]()
`
}

function snippetPySagemaker() {
  return `import json
import os

import boto3
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["sagemaker"],
)


@capture("sagemaker-invoke", {"session_id": "example"})
def main():
    client = boto3.client(
        "sagemaker-runtime",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
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
    latitude["shutdown"]()
`
}

function snippetPyWatsonx() {
  return `import os

from ibm_watsonx_ai.foundation_models import Model
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["watsonx"],
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
    latitude["shutdown"]()
`
}

function snippetPyAlephAlpha() {
  return `import os

from aleph_alpha_client import Client, CompletionRequest, Prompt
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["aleph_alpha"],
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
    latitude["shutdown"]()
`
}

function snippetPyTransformers() {
  return `import os

from latitude_telemetry import capture, init_latitude
from transformers import pipeline

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["transformers"],
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
    latitude["shutdown"]()
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
AWS_REGION=us-east-1`
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
AWS_REGION=us-east-1
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
      return "OPENAI_API_KEY=sk-..."
    case "langchain":
    case "llamaindex":
      return "OPENAI_API_KEY=sk-..."
    default:
      return ""
  }
}

/** Latitude SDK + provider keys for the TypeScript / Python tabs (not the OTLP exporter page). */
export function getEnvBlock(id: OnboardingProviderId, projectSlug: string): string {
  const slugLine = `LATITUDE_PROJECT_SLUG=${projectSlug}`
  const commonSdk = `LATITUDE_API_KEY=your-api-key
${slugLine}`

  const extra = sdkEnvExtras(id)
  return extra ? `${commonSdk}\n${extra}` : commonSdk
}

const LATITUDE_DOCS_TELEMETRY_OVERVIEW = "https://docs.latitude.so/telemetry/overview"
const LATITUDE_DOCS_TELEMETRY_OTEL = "https://docs.latitude.so/telemetry/otel-exporter"

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
export function getOtelCurlVerifySnippet(projectSlug: string): string {
  return `curl -X POST ${OTLP_TRACES_ENDPOINT} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
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

function goOtelSnippet(projectSlug: string): string {
  const slug = JSON.stringify(projectSlug)
  return `import (
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
)

exporter, err := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpointURL("${OTLP_TRACES_ENDPOINT}"),
    otlptracehttp.WithHeaders(map[string]string{
        "Authorization":      "Bearer " + apiKey,
        "X-Latitude-Project":   ${slug},
    }),
)

provider := trace.NewTracerProvider(trace.WithBatcher(exporter))
`
}

function javaOtelSnippet(projectSlug: string): string {
  const slug = JSON.stringify(projectSlug)
  return `import io.opentelemetry.exporter.otlp.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;

OtlpHttpSpanExporter exporter = OtlpHttpSpanExporter.builder()
    .setEndpoint("${OTLP_TRACES_ENDPOINT}")
    .addHeader("Authorization", "Bearer " + apiKey)
    .addHeader("X-Latitude-Project", ${slug})
    .build();

SdkTracerProvider provider = SdkTracerProvider.builder()
    .addSpanProcessor(BatchSpanProcessor.builder(exporter).build())
    .build();
`
}

function rubyOtelSnippet(projectSlug: string): string {
  return `require "opentelemetry-sdk"
require "opentelemetry-exporter-otlp"

ENV["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] = "${OTLP_TRACES_ENDPOINT}"
ENV["OTEL_EXPORTER_OTLP_TRACES_HEADERS"] = "Authorization=Bearer #{api_key},X-Latitude-Project=${projectSlug}"

OpenTelemetry::SDK.configure do |c|
  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new
    )
  )
end
`
}

function dotnetOtelSnippet(projectSlug: string): string {
  return `using OpenTelemetry;
using OpenTelemetry.Trace;
using OpenTelemetry.Exporter;

var tracerProvider = Sdk.CreateTracerProviderBuilder()
    .AddOtlpExporter(opt =>
    {
        opt.Endpoint = new Uri("${OTLP_TRACES_ENDPOINT}");
        opt.Headers = "Authorization=Bearer " + apiKey + ",X-Latitude-Project=${projectSlug}";
        opt.Protocol = OtlpExportProtocol.HttpProtobuf;
    })
    .Build();
`
}

export function getOtelExporterLanguageSnippet(id: OtelExporterLanguageId, projectSlug: string): string {
  switch (id) {
    case "go":
      return goOtelSnippet(projectSlug)
    case "java":
      return javaOtelSnippet(projectSlug)
    case "ruby":
      return rubyOtelSnippet(projectSlug)
    case "dotnet":
      return dotnetOtelSnippet(projectSlug)
  }
}

/**
 * Short paste for coding agents: public telemetry docs, concrete project id (and slug for env), repo-aware setup.
 */
export function getCodingAgentTelemetryPrompt(params: {
  readonly projectId: string
  readonly projectSlug: string
}): string {
  const { projectId, projectSlug } = params
  return [
    `Read ${LATITUDE_DOCS_TELEMETRY_OVERVIEW} and ${LATITUDE_DOCS_TELEMETRY_OTEL} first, then implement Latitude telemetry in this repository per the documentation (env vars, TypeScript/Python SDK for your LLM provider, or OTLP to ${OTLP_TRACES_ENDPOINT}).`,
    `Target this Latitude project: id \`${projectId}\`, slug \`${projectSlug}\` — set LATITUDE_PROJECT_SLUG (and X-Latitude-Project for OTLP) accordingly. Use a Latitude API key from Settings; never commit secrets.`,
  ].join("\n")
}

export type CodingMachineAgentId = "claude-code" | "openclaw"

export function getCodingMachineTelemetryInstallCommand(agent: CodingMachineAgentId): string {
  return agent === "claude-code"
    ? "npx -y @latitude-data/claude-code-telemetry install"
    : ["npx -y @latitude-data/openclaw-telemetry install", "openclaw gateway restart"].join("\n")
}

export function getCodingMachineInstallDescription(agent: CodingMachineAgentId): string {
  return agent === "claude-code"
    ? "Run the command in your terminal and follow the instructions. Telemetry will be set up for Claude Code in the CLI, IDE, and Desktop app."
    : "Run the install command in your terminal and follow the prompts, then run the gateway restart command so the plugin loads."
}
