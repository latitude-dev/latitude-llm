export async function hashPassword(password: string): Promise<string> {
  // NOTE: We load argon2 dynamically to avoid bundling it with gateway as
  // argon2 is not compatible with cloudflaer workers
  const argon2 = await import('argon2')

  try {
    const hash = await argon2.hash(password)
    return hash
  } catch (err) {
    throw new Error('Error hashing password')
  }
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // NOTE: We load argon2 dynamically to avoid bundling it with gateway as
  // argon2 is not compatible with cloudflaer workers
  const argon2 = await import('argon2')

  try {
    const isMatch = await argon2.verify(hash, password)
    return isMatch
  } catch (err) {
    throw new Error('Error verifying password')
  }
}
