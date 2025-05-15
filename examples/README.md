# Latitude Examples
This is a collection of examples for the Latitude platform. Latitude has an API
but also native SDKs for different languages. This repository contains examples for Typescript and Python SDKs.

## How to run the examples?
Go to the docs to [the examples](https://docs.latitude.so/examples) section and
click on the button "Clone examples". That will copy the prompts used in these
repo.

Then you have to configure the `LATITUDE_API_KEY` and the rest of env variables
in `examples/.env` file. You can use the `.env.example` file as a template.


## Install Typescript dependencies

- Install dependencies: `npm install`

## Install Python dependencies

Requires [uv](https://docs.astral.sh/uv/) `0.5.10` or higher.

- Active environment: `uv venv`
- Install dependencies: `uv venv && uv sync --all-extras --all-groups`
- Add [dev] dependencies: `uv add [--dev] <package>`

## TROUBLESHOOTING REFRESHING latitude-sdk

>> NOTE
Only needed if you are using a local version of the SDK.

"uv" ends up caching the package and it needs to be refreshed.

```bash
uv cache clean
rm -rf .venv/
```


## Run the examples
All the examples has the same structure:
```
examples/
  my-example/
    prompts/
      prompt.md
    code/
      example.py
      example.ts
```

To run an example you can use node (even for Python). Check the `package.json` file

Example:
```bash
npm run example my-example
```
