import { createHash } from 'node:crypto';
import type { RabbitmqRoutingKey } from '@org/shared-types';

export function createEmailIdempotencyKey(
  routingKey: RabbitmqRoutingKey,
  messageBody: Buffer,
): string {
  const bodyHash = createHash('sha256').update(messageBody).digest('hex');

  return `${routingKey}:${bodyHash}`;
}
