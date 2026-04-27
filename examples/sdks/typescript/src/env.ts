/** Read a required env var, failing fast with a human-readable message. */
export const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required env var \`${name}\`. Copy \`.env.example\` to \`.env\` and fill it in — see README.md.`,
    )
  }
  return value
}
