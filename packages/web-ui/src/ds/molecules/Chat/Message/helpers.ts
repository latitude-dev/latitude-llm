export const ROLE_VARIANS = ['user', 'system', 'assistant']

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

export function roleToString(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
