import argon2 from 'argon2'

export async function hashPassword(password: string): Promise<string> {
  try {
    const hash = await argon2.hash(password)
    return hash
  } catch (_err) {
    throw new Error('Error hashing password')
  }
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    const isMatch = await argon2.verify(hash, password)
    return isMatch
  } catch (_err) {
    throw new Error('Error verifying password')
  }
}
