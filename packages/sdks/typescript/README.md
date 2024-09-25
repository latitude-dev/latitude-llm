# @latitude-data/sdk

Welcome to the Latitude SDK for TypeScript! This SDK is designed to help developers and product teams integrate Latitude's powerful AI features into their applications with ease. Latitude is a platform that simplifies prompt management, testing, and provides valuable insights into AI performance.

## 🌟 Features

-   **Collaborative prompt manager**: Work together on prompts with your team.
-   **Advanced features**: Support for parameters, snippets, logic, and more.
-   **Version control**: Keep track of different prompt versions.
-   **API + SDKs**: Easy integration with your applications.
-   **Built-in observability**: Monitor and evaluate AI performance.
-   **Batch or real-time evaluations**: Assess prompt performance across various scenarios.
-   **Open-source**: Driven by the community.

## ⚡ Quick Start

### Installation

To install the SDK, use npm, yarn, or pnpm:

```bash
npm install @latitude-data/sdk
```

or

```bash
yarn add @latitude-data/sdk
```

or

```bash
pnpm add @latitude-data/sdk
```

### Usage

#### Importing the SDK

First, import the necessary classes and types from the SDK:

```typescript
import { Latitude, Message, StreamChainResponse } from '@latitude-data/sdk'
```

#### Initializing the SDK

Create an instance of the `Latitude` class by providing your API key and optionally a project ID and gateway configuration:

```typescript
const sdk = new Latitude('your-api-key', {
    projectId: 123, // optional
    gateway: {
        host: 'your-gateway-hostname',
        port: 443,
        ssl: true,
    },
})
```

#### Running a Prompt

To run a prompt, use the `run` method. You can provide a path, project ID, version UUID, parameters, and callbacks for handling events, completion, and errors:

```typescript
sdk.run('path/to/prompt', {
    projectId: 123, // optional, defaults to the projectId provided during initialization
    versionUuid: 'version-uuid', // optional, defaults to the live version
    parameters: { key: 'value' }, // optional, depends on whether the prompt expects parameters
    onEvent: ({ event, data }) => {
        console.log('Event:', event, 'Data:', data)
    },
    onFinished: (data: StreamChainResponse) => {
        console.log('Finished:', data)
    },
    onError: (error: Error) => {
        console.error('Error:', error)
    },
})
```

#### Chatting with a Prompt

To chat with a prompt, use the `chat` method. Provide the prompt UUID, an array of messages, and optional callbacks for handling events, completion, and errors:

```typescript
const messages: Message[] = [
    { role: 'user', content: 'Hello, how are you?' },
    { role: 'assistant', content: 'I am fine, thank you!' },
]

sdk.chat('prompt-uuid', messages, {
    onEvent: ({ event, data }) => {
        console.log('Event:', event, 'Data:', data)
    },
    onFinished: (data: StreamChainResponse) => {
        console.log('Finished:', data)
    },
    onError: (error: Error) => {
        console.error('Error:', error)
    },
})
```

#### Handling Stream Responses

The SDK handles server-sent events (SSE) streams internally. You can provide callbacks to handle events, completion, and errors as shown in the examples above.

#### Error Handling

Both the `run` and `chat` methods accept an `onError` callback to handle any errors that occur during the request or stream processing.

```typescript
onError: (error: Error) => {
    console.error('Error:', error)
}
```

That's it! You are now ready to integrate Latitude's powerful AI features into your TypeScript application using the Latitude SDK. For more detailed information and advanced usage, please refer to the official documentation.
