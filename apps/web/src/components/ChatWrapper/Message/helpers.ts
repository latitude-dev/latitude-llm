export const ROLE_VARIANS = ['user', 'system', 'assistant']

export const roleVariant = (role: string) => {
  switch (role) {
    case 'user':
      return 'purple'
    case 'system':
      return 'outline'
    case 'assistant':
      return 'yellow'
    case 'tool':
      return 'muted'
    default:
      return 'default'
  }
}

export function roleToString(role: string) {
  if (role === 'tool') return 'Tool response'
  return role.charAt(0).toUpperCase() + role.slice(1)
}
