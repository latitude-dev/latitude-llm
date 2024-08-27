import * as pulumi from '@pulumi/pulumi'

const stack = pulumi.getStack()

let result
if (stack.startsWith('core')) {
  result = await import('./core')
} else if (stack.startsWith('web')) {
  result = await import('./deployments/web')
} else if (stack.startsWith('gateway')) {
  result = await import('./deployments/gateway')
} else if (stack.startsWith('workers')) {
  result = await import('./deployments/workers')
} else {
  console.error(`Unknown stack: ${stack}`)
}

export default result
