import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  CreateCallRequestBodyPipe,
  UpdateAdminNoteBodyPipe,
} from './call-request-validation.pipe';

describe('call request validation pipes', () => {
  it('trims and accepts valid legacy call request input', () => {
    const pipe = new CreateCallRequestBodyPipe();

    expect(
      pipe.transform({
        email: ' USER@example.com ',
        phoneNumber: ' +90 555 111 22 33 ',
        scheduledAt: ' 2030-01-01T09:00:00.000Z ',
      }),
    ).toEqual({
      email: 'user@example.com',
      phoneNumber: '+90 555 111 22 33',
      scheduledAt: '2030-01-01T09:00:00.000Z',
    });
  });

  it('rejects invalid legacy call request input', () => {
    const pipe = new CreateCallRequestBodyPipe();

    expect(() =>
      pipe.transform({
        email: 'not-an-email',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({
        email: 'user@example.com',
        phoneNumber: '',
        scheduledAt: '2030-01-01T09:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({
        email: 'user@example.com',
        phoneNumber: '+90 555 111 22 33',
        scheduledAt: 'not-a-date',
      }),
    ).toThrow(BadRequestException);
  });

  it('trims and accepts admin note input', () => {
    const pipe = new UpdateAdminNoteBodyPipe();

    expect(pipe.transform({ adminNote: ' follow up tomorrow ' })).toEqual({
      adminNote: 'follow up tomorrow',
    });
    expect(pipe.transform({ adminNote: '' })).toEqual({
      adminNote: '',
    });
  });

  it('rejects invalid admin note input', () => {
    const pipe = new UpdateAdminNoteBodyPipe();

    expect(() => pipe.transform({ adminNote: 123 })).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform({ adminNote: 'x'.repeat(2_001) })).toThrow(
      BadRequestException,
    );
  });
});
