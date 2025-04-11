# How to run the examples?

These are different use cases of Typescript SDK usage. If you want to run these
examples, you can do it with [tsx](https://github.com/privatenumber/tsx) which
is already included in the `devDependencies` of this project.

From root of workspace example:

```bash
$ tsx --env-file=./examples/sdks/typescript/run-document/simple/.env.development  examples/sdks/typescript/run-prompt/simple/example.ts
```

If you don't have one copy `.env.development` from `examples/sdks/typescript/run-document/simple/env.development.example` and replace the values with your own.
