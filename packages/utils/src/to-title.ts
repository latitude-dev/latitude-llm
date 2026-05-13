export function toTitle(str: string): string {
  return str.replace(/[A-Za-z]+('[A-Za-z]+)?/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}
