import * as pulumi from '@pulumi/pulumi'

const stack = pulumi.getStack()

let result
if (stack === 'core') {
  result = await import('./core')
} else if (stack === 'web') {
  result = await import('./deployments/web')
} else if (stack === 'gateway') {
  result = await import('./deployments/gateway')
} else if (stack === 'workers') {
  result = await import('./deployments/workers')
} else {
  console.error(`Unknown stack: ${stack}`)
}

export default result
