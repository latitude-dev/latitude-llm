# How to run the examples?

These are different use cases of Typescript SDK usage. If you want to run these
examples, you can do it with [tsx](https://github.com/privatenumber/tsx) which
is already included in the `devDependencies` of this project.

```bash
$ cd examples
$ tsx --env-file=.env.development [FILE_EXAMPLE].ts
```

For example:

```
$ tsx --env-file=.env.development run-prompt/simple/example.ts
```

You need to put all the `process.env` variables used in the file you want to use in the `.env.development` file in `examples/typescript/.env.development`
