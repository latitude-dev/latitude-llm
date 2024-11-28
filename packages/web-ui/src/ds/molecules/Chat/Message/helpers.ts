export const ROLE_VARIANS = ['user', 'system', 'assistant']

export function randomRoleVariant() {
  return ROLE_VARIANS[Math.floor(Math.random() * ROLE_VARIANS.length)]!
}

export const roleVariant = (role: string) => {
  switch (role) {
    case 'user':
      return 'purple'
    case 'system':
      return 'outline'
    case 'assistant':
      return 'yellow'
    default:
      return 'default'
  }
}
