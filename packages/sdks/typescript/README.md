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

Find more [examples](https://docs.latitude.so/examples/sdk).

## Development

Requires npm `0.5.10` or higher.

- Install dependencies: `npm install`
- Add [dev] dependencies: `npm install <package> [--save-dev]`
- Run linter: `npm run lint`
- Run formatter: `npm run format`
- Run tests: `npm run test`
- Build package: `npm run build`

## Releases

This SDK is automatically published to npm and GitHub releases when changes are pushed to the main branch with a new version number.

### Creating a Release

1. **Update the changelog**: Edit `CHANGELOG.md` to add your new version with release notes
2. **Bump the version**: Update the version in `package.json`
3. **Push to main**: The GitHub Action will automatically:
   - Build and test the package
   - Publish to npm
   - Create a GitHub release with changelog content
   - Tag the release as `typescript-sdk-VERSION`

See `CHANGELOG_TEMPLATE.md` for detailed instructions on updating the changelog.

## License

The SDK is licensed under the [MIT License](https://opensource.org/licenses/MIT) - read the [LICENSE](/LICENSE) file for details.
