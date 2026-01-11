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
export GROQ_API_KEY="your-groq-key"
export MISTRAL_API_KEY="your-mistral-key"
export COHERE_API_KEY="your-cohere-key"
export TOGETHER_API_KEY="your-together-key"
export REPLICATE_API_TOKEN="your-replicate-token"
export GEMINI_API_KEY="your-gemini-key"
export ALEPH_ALPHA_API_KEY="your-aleph-alpha-key"

# For AWS-based providers (Bedrock, SageMaker)
export AWS_ACCESS_KEY_ID="your-aws-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret"
export AWS_REGION="us-east-1"

# For Azure OpenAI
export AZURE_OPENAI_API_KEY="your-azure-key"
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"

# For Google Cloud (Vertex AI)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GOOGLE_CLOUD_PROJECT="your-gcp-project"
```

3. Install the provider SDK you want to test:

```bash
# Examples:
uv add openai
uv add anthropic
uv add groq
uv add mistralai
uv add cohere
uv add together
uv add replicate
uv add google-generativeai
uv add ollama
uv add litellm
uv add boto3  # For Bedrock and SageMaker
uv add google-cloud-aiplatform  # For Vertex AI
uv add aleph-alpha-client
uv add ibm-watsonx-ai
uv add transformers torch
uv add langchain langchain-openai
uv add llama-index llama-index-llms-openai
uv add haystack-ai
uv add dspy-ai
```

4. Run an example:

```bash
uv run python examples/test_openai.py
```

5. Check your Latitude dashboard for the trace at `http://localhost:8080`

## Available Examples

| Provider     | File                   | Required Package                         |
| ------------ | ---------------------- | ---------------------------------------- |
| OpenAI       | `test_openai.py`       | `openai`                                 |
| Anthropic    | `test_anthropic.py`    | `anthropic`                              |
| Groq         | `test_groq.py`         | `groq`                                   |
| Mistral      | `test_mistral.py`      | `mistralai`                              |
| Cohere       | `test_cohere.py`       | `cohere`                                 |
| Together     | `test_together.py`     | `together`                               |
| Replicate    | `test_replicate.py`    | `replicate`                              |
| Gemini       | `test_gemini.py`       | `google-generativeai`                    |
| Ollama       | `test_ollama.py`       | `ollama`                                 |
| LiteLLM      | `test_litellm.py`      | `litellm`                                |
| Azure OpenAI | `test_azure.py`        | `openai`                                 |
| Bedrock      | `test_bedrock.py`      | `boto3`                                  |
| Vertex AI    | `test_vertex.py`       | `google-cloud-aiplatform`                |
| SageMaker    | `test_sagemaker.py`    | `boto3`                                  |
| Aleph Alpha  | `test_aleph_alpha.py`  | `aleph-alpha-client`                     |
| watsonx      | `test_watsonx.py`      | `ibm-watsonx-ai`                         |
| Transformers | `test_transformers.py` | `transformers`, `torch`                  |
| LangChain    | `test_langchain.py`    | `langchain`, `langchain-openai`          |
| LlamaIndex   | `test_llamaindex.py`   | `llama-index`, `llama-index-llms-openai` |
| Haystack     | `test_haystack.py`     | `haystack-ai`                            |
| DSPy         | `test_dspy.py`         | `dspy-ai`                                |

## Expected Behavior

Each example should:

1. Initialize telemetry with the appropriate instrumentor
2. Make an LLM call wrapped in `telemetry.capture`
3. Print the response
4. Send a trace to your local Latitude instance

Check the Latitude dashboard to verify:

- The trace appears under the specified `path`
- Input/output messages are captured
- Token usage is recorded (where supported)
- Model information is correct
