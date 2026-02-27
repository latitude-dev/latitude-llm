const BG_COLORS = {
  yellow: 'bg-yellow-500 text-yellow-100',
  orange: 'bg-orange-500 text-orange-100',
  red: 'bg-red-500 text-red-100',
  pink: 'bg-pink-500 text-pink-100',
  purple: 'bg-purple-500 text-purple-100',
  indigo: 'bg-indigo-500 text-indigo-100',
  blue: 'bg-blue-500 text-blue-100',
  cyan: 'bg-cyan-500 text-cyan-100',
}

function getFallback(name: string | null | undefined) {
  if (!name || name === '') return { initials: 'X' }

  const [first, last] = name.split(' ')
  if (!first) return { initials: 'X' }

  const initials = first.charAt(0) + (last ? last.charAt(0) : '')

  const charCode = initials
    .split('')
    .map((char) => char.charCodeAt(0))
    .join('')
  const colorIndex = parseInt(charCode, 10) % Object.keys(BG_COLORS).length
  const bgColorClass = Object.values(BG_COLORS)[colorIndex]!

  return { initials, bgColorClass }
}

export function getUserInfoFromSession({ name }: { name: string | null }) {
  if (!name) {
    return {
      name: 'Unknown',
      fallback: { initials: 'X' },
    }
  }

  return {
    name: name ?? 'Unknown',
    fallback: getFallback(name),
  }
}
