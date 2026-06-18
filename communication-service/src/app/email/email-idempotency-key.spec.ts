import { RabbitmqRoutingKey } from '@org/shared-types';
import { describe, expect, it } from 'vitest';
import { createEmailIdempotencyKey } from './email-idempotency-key';

describe('email idempotency key', () => {
  it('returns the same key for the same routing key and message body', () => {
    const body = Buffer.from(
      JSON.stringify({
        callRequestId: 'call-1',
        email: 'user@example.com',
      }),
    );

    expect(
      createEmailIdempotencyKey(RabbitmqRoutingKey.CALL_REQUESTED, body),
    ).toBe(createEmailIdempotencyKey(RabbitmqRoutingKey.CALL_REQUESTED, body));
  });

  it('uses the routing key as part of the key', () => {
    const body = Buffer.from(
      JSON.stringify({
        callRequestId: 'call-1',
        email: 'user@example.com',
      }),
    );

    expect(
      createEmailIdempotencyKey(RabbitmqRoutingKey.CALL_REQUESTED, body),
    ).not.toBe(
      createEmailIdempotencyKey(RabbitmqRoutingKey.CALL_APPROVED, body),
    );
  });
});
