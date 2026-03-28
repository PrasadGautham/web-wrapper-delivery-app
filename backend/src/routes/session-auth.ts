import { FastifyReply, FastifyRequest } from 'fastify';

import { UserType } from '../domain/models.js';

type WebSessionUserType = Extract<UserType, 'merchant' | 'restaurant' | 'admin'>;
type AuthTransport = 'bearer' | 'cookie';

interface ResolvedAuthSession {
  token: string;
  transport: AuthTransport;
}

function getCookieName(userType: WebSessionUserType): string {
  return `driverapp_${userType}_session`;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return cookies;
      }
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAgeSeconds: number;
    secure: boolean;
    domain: string | null;
    sameSite: 'Strict' | 'Lax' | 'None';
    expires?: Date;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `SameSite=${options.sameSite}`];
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  return parts.join('; ');
}

function getSessionCookieConfig(): {
  secure: boolean;
  domain: string | null;
  sameSite: 'Strict' | 'Lax' | 'None';
  maxAgeSeconds: number;
} {
  const secure = process.env.WEB_SESSION_COOKIE_SECURE === 'true';
  const domain = process.env.WEB_SESSION_COOKIE_DOMAIN?.trim() || null;
  const sameSiteRaw = process.env.WEB_SESSION_COOKIE_SAME_SITE?.trim().toLowerCase() ?? 'strict';
  const sameSite = sameSiteRaw === 'none' ? 'None' : sameSiteRaw === 'lax' ? 'Lax' : 'Strict';
  const maxAgeSeconds = Number(process.env.WEB_SESSION_COOKIE_MAX_AGE_SECONDS ?? String(12 * 60 * 60));
  return { secure, domain, sameSite, maxAgeSeconds };
}

export function isWebPortalRequest(request: FastifyRequest): boolean {
  return request.headers['x-portal-client'] === 'web';
}

export function resolveAuthSession(request: FastifyRequest, userType: WebSessionUserType): ResolvedAuthSession {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return { token: authorization.slice('Bearer '.length), transport: 'bearer' };
  }

  const cookieToken = parseCookies(request.headers.cookie)[getCookieName(userType)];
  if (cookieToken) {
    return { token: cookieToken, transport: 'cookie' };
  }

  throw new Error('Unauthorized');
}

export function setWebSessionCookie(reply: FastifyReply, userType: WebSessionUserType, token: string): void {
  const config = getSessionCookieConfig();
  reply.header('Set-Cookie', serializeCookie(getCookieName(userType), token, config));
}

export function clearWebSessionCookie(reply: FastifyReply, userType: WebSessionUserType): void {
  const config = getSessionCookieConfig();
  reply.header(
    'Set-Cookie',
    serializeCookie(getCookieName(userType), '', {
      ...config,
      maxAgeSeconds: 0,
      expires: new Date(0),
    }),
  );
}

export type { AuthTransport, ResolvedAuthSession, WebSessionUserType };
