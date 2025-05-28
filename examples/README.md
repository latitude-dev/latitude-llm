# Latitude Examples

This repository provides a collection of examples for the Latitude platform. Latitude offers an API as well as native SDKs for various languages. Inside, you’ll find sample projects using both the TypeScript and Python SDKs.

## Getting Started

First, install the dependencies:

```bash
npm install
# View available examples
npm run help
```

## Cloning the Examples

Visit the [Examples section in the Latitude docs](https://docs.latitude.so/examples) and click the "Clone examples" button. This will copy the prompt examples into your repository.

Next, configure your `.env` file with your `LATITUDE_API_KEY` and `PROJECT_ID`. You can use the provided `.env.example` file as a template.

## Python Dependencies

Requires [uv](https://docs.astral.sh/uv/) version `0.5.10` or higher.

- Activate your environment:
  ```bash
  uv venv
  ```
- Install all dependencies:
  ```bash
  uv venv && uv sync --all-extras --all-groups
  ```
- To add development dependencies:
  ```bash
  uv add [--dev] <package>
  ```

## Generate docs from examples

Code in `src/examples` is shown in our docs in the [Examples section](https://docs.latitude.so/examples). To generate the docs, run:

```bash
# Your are reading the README in the examples folder
cd your-latitude-folder/examples

# Generate the docs
npm run tool:build_docs
```

## Running the Examples in development

We have a utils module to get the latitude gateway pointing to your local development server.
In any example you want to run in your machine you need 3 things:

1. A `.env` file with your `LATITUDE_API_KEY` and `PROJECT_ID`.
2. The project has to have the `example.promptl` file you see in the example
3. You need to use the Latitude SDK pointing to you local gateway dev server.

````python
from latitude_sdk import InternalOptions, Latitude, LatitudeOptions, RenderChainOptions
from utils.python.get_local_gateway import get_local_gateway

sdk_options = LatitudeOptions(
    project_id=int(os.getenv("PROJECT_ID")),
    version_uuid="live",

    # Set the gateway to your local development server
    internal=InternalOptions(gateway=get_local_gateway()),
)
sdk = Latitude(api_key, sdk_options)

```javascript
import { Latitude, Adapters, Message } from '@latitude-data/sdk'
import { getLocalGateway } from '@/utils/javascript'

const sdk = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: Number(process.env.PROJECT_ID),
  versionUuid: 'live',

  // Set the gateway to your local development server
  __internal: { gateway: getLocalGateway() },
})
````
