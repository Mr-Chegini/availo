import { describe, expect, it } from 'vitest';
import { createStructuredLog } from './structured-log';

describe('createStructuredLog', () => {
  it('adds a stable event name to structured fields', () => {
    expect(
      createStructuredLog('call_request.approved', {
        callRequestId: 'call-1',
        hasCalendarEvent: true,
      }),
    ).toEqual({
      event: 'call_request.approved',
      callRequestId: 'call-1',
      hasCalendarEvent: true,
    });
  });

  it('omits undefined fields from log entries', () => {
    expect(
      createStructuredLog('rabbitmq.message_published', {
        routingKey: 'call.requested',
        exchange: undefined,
      }),
    ).toEqual({
      event: 'rabbitmq.message_published',
      routingKey: 'call.requested',
    });
  });
});
