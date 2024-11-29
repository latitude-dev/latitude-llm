import { trace } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPHttpTraceExporter } from '@your-org/telemetry'

// Configure the trace exporter
const exporter = new OTLPHttpTraceExporter({
  projectId: 123, // Your project ID
  apiKey: 'your-api-key',
  endpoint: 'https://your-gateway-url/api/v2/otlp/v1/traces',
})

// Create and configure the trace provider
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'your-service-name',
  }),
})

// Add the exporter to the provider
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))

// Register the provider
provider.register()

// Get a tracer
const tracer = trace.getTracer('example-tracer')

// Create spans
async function main() {
  const span = tracer.startSpan('main')
  try {
    // Your code here
    await doSomething()
  } finally {
    span.end()
  }
}

async function doSomething() {
  const span = tracer.startSpan('doSomething')
  try {
    // Your code here
    span.setAttribute('custom.attribute', 'value')
  } finally {
    span.end()
  }
}

main()
