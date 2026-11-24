import crypto from 'crypto';
import type { AuthUser, UserRole, UserScope } from '../shared/types.ts';

export interface StoredUserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  scope?: UserScope;
  assignedUre?: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  scope: UserScope;
  assignedUre?: string;
  exp: number;
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  if (!password || !storedHash || !salt) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signAuthToken(user: AuthUser): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scope: user.role === 'master' ? 'geral' : (user.scope || 'geral'),
    assignedUre: user.role === 'master' ? undefined : user.assignedUre,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyAuthToken(token: string | undefined): TokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function toPublicUser(u: StoredUserRecord): AuthUser {
  const scope: UserScope = u.role === 'master' ? 'geral' : (u.scope || 'geral');
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    scope,
    assignedUre: scope === 'ure' ? u.assignedUre : undefined,
    createdAt: u.createdAt,
  };
}
