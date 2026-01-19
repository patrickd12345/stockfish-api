import { getSql, connectToDb } from '@/lib/database'
import { decryptToken, encryptToken } from '@/lib/lichess/crypto'
import { LichessOAuthToken } from '@/lib/lichess/types'

export interface StoredLichessToken {
  lichessUserId: string
  token: LichessOAuthToken
  revokedAt?: Date | null
}

export async function storeLichessToken(lichessUserId: string, token: LichessOAuthToken): Promise<void> {
  await connectToDb()
  const sql = getSql()
  const encrypted = encryptToken(token.accessToken)
  const scope = token.scope
  await sql`
    INSERT INTO lichess_oauth_tokens (
      lichess_user_id,
      access_token_encrypted,
      token_type,
      scope,
      expires_in
    ) VALUES (
      ${lichessUserId},
      ${encrypted},
      ${token.tokenType},
      ${scope},
      ${token.expiresIn ?? null}
    )
    ON CONFLICT (lichess_user_id)
    DO UPDATE SET
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_in = EXCLUDED.expires_in,
      revoked_at = null,
      updated_at = now()
  `
}

export async function getLichessToken(lichessUserId: string): Promise<StoredLichessToken | null> {
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT lichess_user_id, access_token_encrypted, token_type, scope, expires_in, created_at, revoked_at
    FROM lichess_oauth_tokens
    WHERE lichess_user_id = ${lichessUserId}
  `) as Array<{
    lichess_user_id: string
    access_token_encrypted: string
    token_type: string
    scope: string[]
    expires_in: number | null
    created_at: Date
    revoked_at: Date | null
  }>

  if (rows.length === 0) return null
  const row = rows[0]
  return {
    lichessUserId: row.lichess_user_id,
    token: {
      accessToken: decryptToken(row.access_token_encrypted),
      tokenType: row.token_type,
      scope: row.scope,
      expiresIn: row.expires_in ?? undefined,
      createdAt: row.created_at
    },
    revokedAt: row.revoked_at
  }
}

export async function revokeLichessToken(lichessUserId: string): Promise<void> {
  await connectToDb()
  const sql = getSql()
  await sql`
    UPDATE lichess_oauth_tokens
    SET revoked_at = now(), updated_at = now()
    WHERE lichess_user_id = ${lichessUserId}
  `
}
