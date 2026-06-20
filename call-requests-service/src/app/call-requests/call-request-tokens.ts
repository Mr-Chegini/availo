import { randomBytes } from 'crypto';

export function createCancellationToken(): string {
  return randomBytes(32).toString('hex');
}
