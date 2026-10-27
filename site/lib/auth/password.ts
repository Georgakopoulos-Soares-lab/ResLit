import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer
  return `${salt}:${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false

  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer
  const hashBuffer = Buffer.from(hash, 'hex')
  if (hashBuffer.length !== derivedKey.length) return false

  return timingSafeEqual(hashBuffer, derivedKey)
}
