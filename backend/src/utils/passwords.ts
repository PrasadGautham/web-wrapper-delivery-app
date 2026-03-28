import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const keyLength = 64;
const scryptPrefix = 'scrypt';

export function isPasswordHashed(value: string): boolean {
  return value.startsWith(`${scryptPrefix}$`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, keyLength)) as Buffer;
  return `${scryptPrefix}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedValue: string): Promise<boolean> {
  if (!isPasswordHashed(storedValue)) {
    return password === storedValue;
  }

  const [, salt, storedHash] = storedValue.split('$');
  if (!salt || !storedHash) {
    return false;
  }

  const derived = (await scrypt(password, salt, keyLength)) as Buffer;
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (storedBuffer.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, derived);
}
