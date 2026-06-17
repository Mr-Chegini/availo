import { describe, expect, it } from 'vitest';
import { normalizeCreateCallRequestInput } from './create-call-request-input';

describe('create call request input', () => {
  it('trims and normalizes input values', () => {
    const input = normalizeCreateCallRequestInput({
      email: ' USER@Example.COM ',
      phoneNumber: ' +90 555 111 22 33 ',
      scheduledAt: ' 2026-05-15T10:00:00.000Z ',
    });

    expect(input.email).toBe('user@example.com');
    expect(input.phoneNumber).toBe('+90 555 111 22 33');
    expect(input.scheduledAt.toISOString()).toBe('2026-05-15T10:00:00.000Z');
  });

  it('requires email, phone number, and scheduled time', () => {
    expect(() =>
      normalizeCreateCallRequestInput({
        email: '',
        phoneNumber: ' +90 555 111 22 33 ',
        scheduledAt: '2026-05-15T10:00:00.000Z',
      }),
    ).toThrow('email, phoneNumber and scheduledAt are required');
  });

  it('rejects invalid email addresses', () => {
    expect(() =>
      normalizeCreateCallRequestInput({
        email: 'not-an-email',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2026-05-15T10:00:00.000Z',
      }),
    ).toThrow('email must be a valid email address');
  });

  it('rejects invalid scheduled times', () => {
    expect(() =>
      normalizeCreateCallRequestInput({
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: 'not-a-date',
      }),
    ).toThrow('scheduledAt must be a valid date');
  });
});
