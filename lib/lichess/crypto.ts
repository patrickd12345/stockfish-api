import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const secret = process.env.LICHESS_TOKEN_SECRET?.trim() || process.env.MYCHESSCOACH_SECRET?.trim()
  if (!secret) {
    throw new Error('Missing encryption secret. Please set LICHESS_TOKEN_SECRET or MYCHESSCOACH_SECRET in .env.local')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptToken(value: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptToken(payload: string): string {
  const raw = Buffer.from(payload, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + 16)
  const encrypted = raw.subarray(IV_LENGTH + 16)
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
