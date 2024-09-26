import * as pulumi from '@pulumi/pulumi'

const stack = pulumi.getStack()

let result
if (stack === 'core') {
  result = await import('./core')
} else {
  const [action, environment, app] = stack.split('-')
  result = await import(`./${action}/${environment}/${app}`)
}

export default result
