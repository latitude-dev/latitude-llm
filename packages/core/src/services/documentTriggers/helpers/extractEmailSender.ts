const FROM_REGEX = /^(.+?)\s*<([^>]+)>$/

export function extractEmailSender({
  from, // Bob <bob@email.com>
  sender, // bob@email.com
}: {
  from: string
  sender: string
}): { email: string; name: string | undefined } {
  const match = from.match(FROM_REGEX)

  if (match && match.length === 3) {
    return { name: match[1], email: match[2]! }
  }

  return { name: undefined, email: sender }
}
