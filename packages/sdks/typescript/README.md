# Latitude SDK for Typescript & Javascript

```sh
npm install @latitude-data/sdk
```

Requires Node.js `20` or higher.

Go to the [documentation](https://docs.latitude.so/guides/sdk/typescript) to learn more.

## Usage

```typescript
import { Latitude, LatitudeOptions, RunPromptOptions } from '@latitude-data/sdk'

const sdk = new Latitude('my-api-key', {
  projectId: 'my-project-id',
  versionUuid: 'my-version-uuid',
})

await sdk.prompts.run('joke-teller', {
  parameters: { topic: 'Typescript' },
  onEvent: (event) => console.log(event),
  onFinished: (event) => console.log(event),
  onError: (error) => console.log(error),
  stream: true,
})
```

Find more examples [here](https://github.com/latitude-dev/latitude-llm/tree/main/examples/sdks/typescript).

## Development

Requires npm `0.5.10` or higher.

- Install dependencies: `npm install`
- Add [dev] dependencies: `npm install <package> [--save-dev]`
- Run linter: `npm run lint`
- Run formatter: `npm run format`
- Run tests: `npm run test`
- Build package: `npm run build`
- Publish package: `npm publish`

## License

The SDK is licensed under the [LGPL-3.0 License](https://opensource.org/licenses/LGPL-3.0) - read the [LICENSE](/LICENSE) file for details.
