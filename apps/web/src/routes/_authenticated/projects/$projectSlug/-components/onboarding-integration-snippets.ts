/**
 * Snippets aligned with `main` branch `packages/telemetry` READMEs and `python/examples` / `typescript/examples`.
 * TypeScript supports the nine `InstrumentationType` values from `@latitude-data/telemetry`.
 * Extra providers match Python examples under `packages/telemetry/python/examples` on `main`.
 */

export type SdkLanguage = "typescript" | "python"

export type OnboardingProviderId =
  | "openai"
  | "azure-openai"
  | "anthropic"
  | "gemini"
  | "bedrock"
  | "vertexai"
  | "cohere"
  | "togetherai"
  | "aiplatform"
  | "langchain"
  | "llamaindex"
  | "groq"
  | "mistral"
  | "litellm"
  | "ollama"
  | "replicate"
  | "sagemaker"
  | "watsonx"
  | "aleph-alpha"
  | "transformers"
  | "crewai"
  | "haystack"
  | "dspy"

interface OnboardingProviderSnippetConfig {
  readonly id: OnboardingProviderId
  readonly supportsTypescript: boolean
  readonly supportsPython: boolean
}

function q(projectSlug: string): string {
  return JSON.stringify(projectSlug)
}

const crossTsPy = { supportsTypescript: true, supportsPython: true } as const
const pyOnly = { supportsTypescript: false, supportsPython: true } as const

export const ONBOARDING_PROVIDER_SNIPPET_CONFIG: Record<OnboardingProviderId, OnboardingProviderSnippetConfig> = {
  openai: { id: "openai", ...crossTsPy },
  "azure-openai": { id: "azure-openai", ...crossTsPy },
  anthropic: { id: "anthropic", ...crossTsPy },
  gemini: { id: "gemini", ...pyOnly },
  bedrock: { id: "bedrock", ...crossTsPy },
  vertexai: { id: "vertexai", ...crossTsPy },
  cohere: { id: "cohere", ...crossTsPy },
  togetherai: { id: "togetherai", ...crossTsPy },
  aiplatform: { id: "aiplatform", ...crossTsPy },
  langchain: { id: "langchain", ...crossTsPy },
  llamaindex: { id: "llamaindex", ...crossTsPy },
  groq: { id: "groq", ...pyOnly },
  mistral: { id: "mistral", ...pyOnly },
  litellm: { id: "litellm", ...pyOnly },
  ollama: { id: "ollama", ...pyOnly },
  replicate: { id: "replicate", ...pyOnly },
  sagemaker: { id: "sagemaker", ...pyOnly },
  watsonx: { id: "watsonx", ...pyOnly },
  "aleph-alpha": { id: "aleph-alpha", ...pyOnly },
  transformers: { id: "transformers", ...pyOnly },
  crewai: { id: "crewai", ...pyOnly },
  haystack: { id: "haystack", ...pyOnly },
  dspy: { id: "dspy", ...pyOnly },
}

export function getOnboardingSnippet(id: OnboardingProviderId, lang: SdkLanguage, projectSlug: string): string | null {
  const cfg = ONBOARDING_PROVIDER_SNIPPET_CONFIG[id]
  if (lang === "typescript" && !cfg.supportsTypescript) return null
  if (lang === "python" && !cfg.supportsPython) return null

  const s = q(projectSlug)
  switch (id) {
    case "openai":
      return lang === "typescript" ? tsOpenai(s) : pyOpenai(s)
    case "azure-openai":
      return lang === "typescript" ? tsAzure(s) : pyAzure(s)
    case "anthropic":
      return lang === "typescript" ? tsAnthropic(s) : pyAnthropic(s)
    case "gemini":
      return pyGemini(s)
    case "bedrock":
      return lang === "typescript" ? tsBedrock(s) : pyBedrock(s)
    case "vertexai":
      return lang === "typescript" ? tsVertex(s) : pyVertex(s)
    case "cohere":
      return lang === "typescript" ? tsCohere(s) : pyCohere(s)
    case "togetherai":
      return lang === "typescript" ? tsTogether(s) : pyTogether(s)
    case "aiplatform":
      return lang === "typescript" ? tsAiplatform(s) : pyAiplatform(s)
    case "langchain":
      return lang === "typescript" ? tsLangchain(s) : pyLangchain(s)
    case "llamaindex":
      return lang === "typescript" ? tsLlamaindex(s) : pyLlamaindex(s)
    case "groq":
      return pyGroq(s)
    case "mistral":
      return pyMistral(s)
    case "litellm":
      return pyLitellm(s)
    case "ollama":
      return pyOllama(s)
    case "replicate":
      return pyReplicate(s)
    case "sagemaker":
      return pySagemaker(s)
    case "watsonx":
      return pyWatsonx(s)
    case "aleph-alpha":
      return pyAlephAlpha(s)
    case "transformers":
      return pyTransformers(s)
    case "crewai":
      return pyCrewai(s)
    case "haystack":
      return pyHaystack(s)
    case "dspy":
      return pyDspy(s)
    default:
      return null
  }
}

function tsOpenai(s: string) {
  return `import OpenAI from "openai"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["openai"],
})

async function main() {
  await latitude.ready
  const client = new OpenAI()
  await capture(
    "chat",
    async () => {
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello!" }],
      })
      return res.choices[0]?.message?.content
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyOpenai(s: string) {
  return `import os
from openai import OpenAI
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["openai"],
)

@capture("chat", {"session_id": "example"})
def main() -> str:
    client = OpenAI()
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello!"}],
    )
    return r.choices[0].message.content

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsAzure(s: string) {
  return `import { AzureOpenAI } from "openai"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["openai"],
})

async function main() {
  await latitude.ready
  const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: "2024-02-01",
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  })
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini"
  await capture(
    "azure-chat",
    async () => {
      const res = await client.chat.completions.create({
        model: deployment,
        messages: [{ role: "user", content: "Hello!" }],
      })
      return res.choices[0]?.message?.content
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyAzure(s: string) {
  return `import os
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["openai"],
)

from openai import AzureOpenAI

@capture("azure-chat", {"session_id": "example"})
def main() -> str:
    client = AzureOpenAI(
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version="2024-02-01",
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    )
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    r = client.chat.completions.create(
        model=deployment,
        messages=[{"role": "user", "content": "Hello!"}],
    )
    return r.choices[0].message.content

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsAnthropic(s: string) {
  return `import Anthropic from "@anthropic-ai/sdk"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["anthropic"],
})

async function main() {
  await latitude.ready
  const client = new Anthropic()
  await capture(
    "anthropic-chat",
    async () => {
      const res = await client.messages.create({
        model: "claude-3-5-haiku-latest",
        max_tokens: 256,
        messages: [{ role: "user", content: "Hello!" }],
      })
      const block = res.content[0]
      return block?.type === "text" ? block.text : ""
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyAnthropic(s: string) {
  return `import os
from anthropic import Anthropic
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["anthropic"],
)

@capture("anthropic-chat", {"session_id": "example"})
def main() -> str:
    client = Anthropic()
    r = client.messages.create(
        model="claude-3-5-haiku-latest",
        max_tokens=256,
        messages=[{"role": "user", "content": "Hello!"}],
    )
    return r.content[0].text

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyGemini(s: string) {
  return `import os
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["google_generativeai"],
)

from google import genai

@capture("gemini-chat", {"session_id": "example"})
def main() -> str:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Hello!",
    )
    return response.text

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsBedrock(s: string) {
  return `import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["bedrock"],
})

async function main() {
  await latitude.ready
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" })
  await capture(
    "bedrock-chat",
    async () => {
      const res = await client.send(
        new ConverseCommand({
          modelId: "anthropic.claude-3-haiku-20240307-v1:0",
          messages: [{ role: "user", content: [{ text: "Hello!" }] }],
          inferenceConfig: { maxTokens: 256 },
        }),
      )
      return res.output?.message?.content?.[0].text ?? ""
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyBedrock(s: string) {
  return `import os
import boto3
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["bedrock"],
)

@capture("bedrock-chat", {"session_id": "example"})
def main() -> str:
    client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    r = client.converse(
        modelId="anthropic.claude-3-haiku-20240307-v1:0",
        messages=[{"role": "user", "content": [{"text": "Hello!"}]}],
        inferenceConfig={"maxTokens": 256},
    )
    return r["output"]["message"]["content"][0]["text"]

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsVertex(s: string) {
  return `import { VertexAI } from "@google-cloud/vertexai"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["vertexai"],
})

async function main() {
  await latitude.ready
  const vertex = new VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: "us-central1",
  })
  const model = vertex.getGenerativeModel({ model: "gemini-1.5-flash" })
  await capture(
    "vertex-chat",
    async () => {
      const res = await model.generateContent("Hello!")
      return res.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyVertex(s: string) {
  return `import os
import vertexai
from vertexai.generative_models import GenerativeModel
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["vertexai"],
)

@capture("vertex-chat", {"session_id": "example"})
def main() -> str:
    vertexai.init(project=os.environ["GOOGLE_CLOUD_PROJECT"], location="us-central1")
    model = GenerativeModel("gemini-1.5-flash")
    return model.generate_content("Hello!").text

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsCohere(s: string) {
  return `import { CohereClient } from "cohere-ai"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["cohere"],
})

async function main() {
  await latitude.ready
  const client = new CohereClient({ token: process.env.COHERE_API_KEY })
  await capture(
    "cohere-chat",
    async () => {
      const res = await client.chat({ model: "command-r", message: "Hello!", maxTokens: 256 })
      return res.text
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyCohere(s: string) {
  return `import os
import cohere
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["cohere"],
)

@capture("cohere-chat", {"session_id": "example"})
def main() -> str:
    client = cohere.Client(api_key=os.environ["COHERE_API_KEY"])
    r = client.chat(model="command-r", message="Hello!", max_tokens=256)
    return r.text

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsTogether(s: string) {
  return `import Together from "together-ai"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["togetherai"],
})

async function main() {
  await latitude.ready
  const client = new Together()
  await capture(
    "together-chat",
    async () => {
      const res = await client.chat.completions.create({
        model: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
        messages: [{ role: "user", content: "Hello!" }],
        max_tokens: 256,
      })
      return res.choices[0]?.message?.content
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyTogether(s: string) {
  return `import os
from together import Together
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["togetherai"],
)

@capture("together-chat", {"session_id": "example"})
def main() -> str:
    client = Together()
    r = client.chat.completions.create(
        model="meta-llama/Llama-3.2-3B-Instruct-Turbo",
        messages=[{"role": "user", "content": "Hello!"}],
        max_tokens=256,
    )
    return r.choices[0].message.content

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsAiplatform(s: string) {
  return `import { initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["aiplatform"],
})

async function main() {
  await latitude.ready
  // Use @google-cloud/aiplatform — supported calls are traced automatically.
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyAiplatform(s: string) {
  return `import os
from latitude_telemetry import init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["aiplatform"],
)

if __name__ == "__main__":
    # Use google.cloud.aiplatform clients — supported calls are traced automatically.
    latitude["flush"]()
`
}

function tsLangchain(s: string) {
  return `import { HumanMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["langchain"],
})

async function main() {
  await latitude.ready
  const model = new ChatOpenAI({ modelName: "gpt-4o-mini", maxTokens: 256 })
  await capture(
    "langchain-chat",
    async () => {
      const res = await model.invoke([new HumanMessage("Hello!")])
      return String(res.content)
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyLangchain(s: string) {
  return `import os
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["langchain"],
)

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

@capture("langchain-chat", {"session_id": "example"})
def main() -> str:
    model = ChatOpenAI(model="gpt-4o-mini", max_tokens=256)
    r = model.invoke([HumanMessage(content="Hello!")])
    return str(r.content)

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function tsLlamaindex(s: string) {
  return `import { OpenAI } from "llamaindex"
import { capture, initLatitude } from "@latitude-data/telemetry"

const latitude = initLatitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  projectSlug: ${s},
  instrumentations: ["llamaindex"],
})

async function main() {
  await latitude.ready
  const llm = new OpenAI({ model: "gpt-4o-mini", maxTokens: 256 })
  await capture(
    "llamaindex-chat",
    async () => {
      const res = await llm.complete({ prompt: "Hello!" })
      return res.text
    },
    { sessionId: "example" },
  )
  await latitude.flush()
}

main().catch(console.error)
`
}

function pyLlamaindex(s: string) {
  return `import os
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["llamaindex"],
)

from llama_index.llms.openai import OpenAI

@capture("llamaindex-chat", {"session_id": "example"})
def main() -> str:
    llm = OpenAI(model="gpt-4o-mini", max_tokens=256)
    return llm.complete("Hello!").text

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyGroq(s: string) {
  return `import os
from groq import Groq
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["groq"],
)

@capture("groq-chat", {"session_id": "example"})
def main() -> str:
    client = Groq()
    r = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": "Hello!"}],
        max_tokens=50,
    )
    return r.choices[0].message.content

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyMistral(s: string) {
  return `import os
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["mistralai"],
)

from mistralai import Mistral
from mistralai.models import UserMessage

@capture("mistral-chat", {"session_id": "example"})
def main() -> str:
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    r = client.chat.complete(
        model="mistral-small-latest",
        messages=[UserMessage(role="user", content="Hello!")],
        max_tokens=50,
    )
    return r.choices[0].message.content

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyLitellm(s: string) {
  return `import os
import litellm
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["litellm"],
)

@capture("litellm-chat", {"session_id": "example"})
def main() -> str:
    r = litellm.completion(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello!"}],
        max_tokens=50,
    )
    return r.choices[0].message.content

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyOllama(s: string) {
  return `import os
import ollama
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["ollama"],
)

@capture("ollama-chat", {"session_id": "example"})
def main() -> str:
    r = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": "Hello!"}],
    )
    return r["message"]["content"]

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyReplicate(s: string) {
  return `import os
import replicate
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["replicate"],
)

@capture("replicate-run", {"session_id": "example"})
def main() -> str:
    out = replicate.run(
        "meta/meta-llama-3-8b-instruct",
        input={"prompt": "Hello!", "max_tokens": 50},
    )
    return "".join(out)

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pySagemaker(s: string) {
  return `import json
import os
import boto3
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["sagemaker"],
)

@capture("sagemaker-invoke", {"session_id": "example"})
def main() -> str:
    client = boto3.client("sagemaker-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    payload = json.dumps({"inputs": "Hello!", "parameters": {"max_new_tokens": 50}})
    r = client.invoke_endpoint(
        EndpointName=os.environ["SAGEMAKER_ENDPOINT_NAME"],
        ContentType="application/json",
        Body=payload,
    )
    return json.loads(r["Body"].read().decode())

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyWatsonx(s: string) {
  return `import os
from ibm_watsonx_ai.foundation_models import Model
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["watsonx"],
)

@capture("watsonx-chat", {"session_id": "example"})
def main() -> str:
    model = Model(
        model_id="ibm/granite-13b-chat-v2",
        credentials={
            "url": os.environ.get("WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
            "apikey": os.environ["WATSONX_API_KEY"],
        },
        project_id=os.environ["WATSONX_PROJECT_ID"],
    )
    return model.generate_text(prompt="Hello!", params={GenParams.MAX_NEW_TOKENS: 50})

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyAlephAlpha(s: string) {
  return `import os
from aleph_alpha_client import Client, CompletionRequest, Prompt
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["aleph_alpha"],
)

@capture("aleph-alpha", {"session_id": "example"})
def main() -> str:
    client = Client(token=os.environ["ALEPH_ALPHA_API_KEY"])
    req = CompletionRequest(
        prompt=Prompt.from_text("Hello!"),
        maximum_tokens=50,
    )
    r = client.complete(req, model="luminous-base")
    return r.completions[0].completion

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyTransformers(s: string) {
  return `import os
from transformers import pipeline
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["transformers"],
)

@capture("transformers", {"session_id": "example"})
def main() -> str:
    gen = pipeline("text-generation", model="gpt2", max_new_tokens=50)
    r = gen("Hello!")
    return r[0]["generated_text"]

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyCrewai(s: string) {
  return `import os
from crewai import Agent, Crew, Task
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["crewai", "openai"],
)

@capture("crewai", {"session_id": "example"})
def main() -> str:
    agent = Agent(
        role="Assistant",
        goal="Reply briefly",
        backstory="You answer in one short sentence.",
        verbose=False,
    )
    task = Task(description="Say hello.", expected_output="A greeting.", agent=agent)
    crew = Crew(agents=[agent], tasks=[task], verbose=False)
    return str(crew.kickoff().raw)

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyHaystack(s: string) {
  return `import os
from haystack import Pipeline
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["haystack"],
)

@capture("haystack", {"session_id": "example"})
def main() -> str:
    pipe = Pipeline()
    pipe.add_component("prompt_builder", PromptBuilder(template="{{query}}"))
    pipe.add_component("llm", OpenAIGenerator(model="gpt-4o-mini"))
    pipe.connect("prompt_builder", "llm")
    r = pipe.run({"prompt_builder": {"query": "Hello!"}})
    return r["llm"]["replies"][0]

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

function pyDspy(s: string) {
  return `import os
from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=${s},
    instrumentations=["dspy"],
)

import dspy

class Hello(dspy.Signature):
    """Short reply."""
    q: str = dspy.InputField()
    a: str = dspy.OutputField()

@capture("dspy", {"session_id": "example"})
def main() -> str:
    dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))
    pred = dspy.Predict(Hello)
    return pred(q="Hello!").a

if __name__ == "__main__":
    main()
    latitude["flush"]()
`
}

export function getInstallLine(id: OnboardingProviderId, lang: SdkLanguage): string {
  const lines: Record<OnboardingProviderId, { npm: string; pip: string }> = {
    openai: { npm: "npm install openai @latitude-data/telemetry", pip: "pip install openai latitude-telemetry" },
    "azure-openai": {
      npm: "npm install openai @latitude-data/telemetry",
      pip: "pip install openai latitude-telemetry",
    },
    anthropic: {
      npm: "npm install @anthropic-ai/sdk @latitude-data/telemetry",
      pip: "pip install anthropic latitude-telemetry",
    },
    gemini: { npm: "", pip: "pip install google-genai latitude-telemetry" },
    bedrock: {
      npm: "npm install @aws-sdk/client-bedrock-runtime @latitude-data/telemetry",
      pip: "pip install boto3 latitude-telemetry",
    },
    vertexai: {
      npm: "npm install @google-cloud/vertexai @latitude-data/telemetry",
      pip: "pip install google-cloud-aiplatform latitude-telemetry",
    },
    cohere: { npm: "npm install cohere-ai @latitude-data/telemetry", pip: "pip install cohere latitude-telemetry" },
    togetherai: {
      npm: "npm install together-ai @latitude-data/telemetry",
      pip: "pip install together latitude-telemetry",
    },
    aiplatform: {
      npm: "npm install @google-cloud/aiplatform @latitude-data/telemetry",
      pip: "pip install google-cloud-aiplatform latitude-telemetry",
    },
    langchain: {
      npm: "npm install langchain @langchain/openai @latitude-data/telemetry",
      pip: "pip install langchain-core langchain-openai latitude-telemetry",
    },
    llamaindex: {
      npm: "npm install llamaindex @latitude-data/telemetry",
      pip: "pip install llama-index llama-index-llms-openai latitude-telemetry",
    },
    groq: { npm: "", pip: "pip install groq latitude-telemetry" },
    mistral: { npm: "", pip: "pip install mistralai latitude-telemetry" },
    litellm: { npm: "", pip: "pip install litellm latitude-telemetry" },
    ollama: { npm: "", pip: "pip install ollama latitude-telemetry" },
    replicate: { npm: "", pip: "pip install replicate latitude-telemetry" },
    sagemaker: { npm: "", pip: "pip install boto3 latitude-telemetry" },
    watsonx: { npm: "", pip: "pip install ibm-watsonx-ai latitude-telemetry" },
    "aleph-alpha": { npm: "", pip: "pip install aleph-alpha-client latitude-telemetry" },
    transformers: { npm: "", pip: "pip install transformers torch latitude-telemetry" },
    crewai: { npm: "", pip: "pip install crewai latitude-telemetry" },
    haystack: { npm: "", pip: "pip install haystack-ai latitude-telemetry" },
    dspy: { npm: "", pip: "pip install dspy latitude-telemetry" },
  }
  const row = lines[id]
  return lang === "typescript" ? row.npm : row.pip
}

export function getEnvBlock(id: OnboardingProviderId, mode: "sdk" | "opentelemetry", projectSlug: string): string {
  const slugLine = `LATITUDE_PROJECT_SLUG=${projectSlug}`
  const commonSdk = `LATITUDE_API_KEY=your-api-key
${slugLine}`

  const otelByProvider: Record<OnboardingProviderId, string> = {
    openai: `${commonSdk}
OPENAI_API_KEY=sk-...`,
    "azure-openai": `${commonSdk}
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_API_KEY=...`,
    anthropic: `${commonSdk}
ANTHROPIC_API_KEY=sk-ant-...`,
    gemini: `${commonSdk}
GEMINI_API_KEY=...`,
    bedrock: `${commonSdk}
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1`,
    vertexai: `${commonSdk}
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
GOOGLE_CLOUD_PROJECT=...`,
    cohere: `${commonSdk}
COHERE_API_KEY=...`,
    togetherai: `${commonSdk}
TOGETHER_API_KEY=...`,
    aiplatform: `${commonSdk}
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
GOOGLE_CLOUD_PROJECT=...`,
    langchain: `${commonSdk}
OPENAI_API_KEY=sk-...`,
    llamaindex: `${commonSdk}
OPENAI_API_KEY=sk-...`,
    groq: `${commonSdk}
GROQ_API_KEY=...`,
    mistral: `${commonSdk}
MISTRAL_API_KEY=...`,
    litellm: `${commonSdk}
OPENAI_API_KEY=sk-...`,
    ollama: `${commonSdk}
OLLAMA_HOST=http://localhost:11434`,
    replicate: `${commonSdk}
REPLICATE_API_TOKEN=r8_...`,
    sagemaker: `${commonSdk}
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
SAGEMAKER_ENDPOINT_NAME=...`,
    watsonx: `${commonSdk}
WATSONX_API_KEY=...
WATSONX_PROJECT_ID=...
WATSONX_URL=https://us-south.ml.cloud.ibm.com`,
    "aleph-alpha": `${commonSdk}
ALEPH_ALPHA_API_KEY=...`,
    transformers: `${commonSdk}
HF_TOKEN=hf_...`,
    crewai: `${commonSdk}
OPENAI_API_KEY=sk-...`,
    haystack: `${commonSdk}
OPENAI_API_KEY=sk-...`,
    dspy: `${commonSdk}
OPENAI_API_KEY=sk-...`,
  }

  if (mode === "sdk") {
    return otelByProvider[id]
  }

  return `${commonSdk}

# Route LLM spans to Latitude via OTLP (see Latitude docs for endpoint and headers).
# Use your existing OpenTelemetry TracerProvider and add LatitudeSpanProcessor, or
# configure an OTLP exporter pointed at the Latitude ingest URL.`
}

/** Official docs for coding agents implementing Latitude telemetry. */
const LATITUDE_DOCS_TELEMETRY_QUICK_START = "https://docs.latitude.so/guides/getting-started/quick-start-dev"
const LATITUDE_DOCS_TELEMETRY_INTRO = "https://docs.latitude.so/guides/getting-started/introduction"

/** Public Agent Skill repo for wiring Latitude telemetry via `npx skills add`. */
const LATITUDE_TELEMETRY_SKILL_REPO = "latitude-dev/telemetry-skill"

/**
 * Short paste for coding agents: install the public telemetry skill, then wire the repo using it.
 */
export function getCodingAgentTelemetryPrompt(): string {
  return [
    `npx skills add ${LATITUDE_TELEMETRY_SKILL_REPO}`,
    "Set up Latitude telemetry in this project using that skill.",
    `Docs: ${LATITUDE_DOCS_TELEMETRY_INTRO}`,
    `Quick start: ${LATITUDE_DOCS_TELEMETRY_QUICK_START}`,
  ].join("\n")
}
