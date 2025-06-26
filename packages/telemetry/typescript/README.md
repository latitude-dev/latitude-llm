# Latitude Telemetry for Typescript & Javascript

```sh
npm install @latitude-data/telemetry
```

Requires Node.js `20` or higher.

Go to the [documentation](https://docs.latitude.so/guides/sdk/typescript) to learn more.

## Usage

```typescript
import { LatitudeTelemetry } from '@latitude-data/telemetry'
import { Latitude } from '@latitude-data/sdk'
import { OpenAI } from 'openai'

const telemetry = new LatitudeTelemetry('my-api-key', {
  instrumentations: {
    latitude: Latitude,
    openai: OpenAI,
  },
})

// Automatically instrumented
const sdk = new Latitude('my-api-key', {
  projectId: 'my-project-id',
  versionUuid: 'my-version-uuid',
})

// Automatically instrumented
const openai = new OpenAI({
  apiKey: 'my-api-key',
})
```

Find more [examples](https://docs.latitude.so/examples/sdk).

## Development

Requires npm `0.5.10` or higher.

- Install dependencies: `npm install`
- Add [dev] dependencies: `npm install <package> [--save-dev]`
- Run linter: `npm run lint`
- Run formatter: `npm run format`
- Run tests: `npm run test`
- Build package: `npm run build`

## License

The SDK is licensed under the [MIT License](https://opensource.org/licenses/MIT) - read the [LICENSE](/LICENSE) file for details.
