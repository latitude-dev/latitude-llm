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
