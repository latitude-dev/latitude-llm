# Telemetry Provider Examples

Manual test examples for each instrumented provider against a local Latitude instance.

## Setup

1. Start your local Latitude instance at `localhost:8787`

2. Set required environment variables:

```bash
export LATITUDE_API_KEY="your-latitude-api-key"
export LATITUDE_PROJECT_ID="your-project-id"

# Provider-specific API keys (set the ones you want to test)
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"
export COHERE_API_KEY="your-cohere-key"
export TOGETHER_API_KEY="your-together-key"

# For AWS-based providers (Bedrock)
export AWS_ACCESS_KEY_ID="your-aws-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret"
export AWS_REGION="us-east-1"

# For Azure OpenAI
export AZURE_OPENAI_API_KEY="your-azure-key"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export AZURE_OPENAI_DEPLOYMENT="your-deployment-name"

# For Google Cloud (Vertex AI)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GOOGLE_CLOUD_PROJECT="your-gcp-project"
```

3. Install the provider SDK you want to test:

```bash
# Examples:
npm install openai
npm install @anthropic-ai/sdk
npm install cohere-ai
npm install together-ai
npm install @aws-sdk/client-bedrock-runtime  # For Bedrock
npm install @google-cloud/vertexai  # For Vertex AI
npm install langchain @langchain/openai @langchain/core
npm install llamaindex
```

4. Run an example:

```bash
npx tsx examples/test_openai.ts
```

5. Check your Latitude dashboard for the trace at `http://localhost:8080`

## Available Examples

| Provider     | File                  | Required Package                                  |
| ------------ | --------------------- | ------------------------------------------------- |
| OpenAI       | `test_openai.ts`      | `openai`                                          |
| Anthropic    | `test_anthropic.ts`   | `@anthropic-ai/sdk`                               |
| Cohere       | `test_cohere.ts`      | `cohere-ai`                                       |
| Together AI  | `test_together.ts`    | `together-ai`                                     |
| Azure OpenAI | `test_azure.ts`       | `openai`                                          |
| Bedrock      | `test_bedrock.ts`     | `@aws-sdk/client-bedrock-runtime`                 |
| Vertex AI    | `test_vertex.ts`      | `@google-cloud/vertexai`                          |
| LangChain    | `test_langchain.ts`   | `langchain`, `@langchain/openai`, `@langchain/core` |
| LlamaIndex   | `test_llamaindex.ts`  | `llamaindex`                                      |

## Expected Behavior

Each example should:

1. Initialize telemetry with the appropriate instrumentation
2. Make an LLM call wrapped in `telemetry.capture`
3. Print the response
4. Send a trace to your local Latitude instance

Check the Latitude dashboard to verify:

- The trace appears under the specified `path`
- Input/output messages are captured
- Token usage is recorded (where supported)
- Model information is correct

## Running All Examples

To run all available tests:

```bash
npx tsx examples/run_all.ts
```

To run specific tests:

```bash
npx tsx examples/run_all.ts openai anthropic
```

To list all available tests:

```bash
npx tsx examples/run_all.ts --list
```
