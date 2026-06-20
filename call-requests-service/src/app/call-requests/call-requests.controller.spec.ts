import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';
import { CallRequestsController } from './call-requests.controller';

describe('CallRequestsController auth', () => {
  it.each([
    'findAll',
    'approve',
    'reject',
    'markAsCalled',
    'cancel',
    'updateAdminNote',
  ] as const)('protects %s with the admin API key guard', (methodName) => {
    expect(getMethodGuards(methodName)).toContain(AdminApiKeyGuard);
  });

  it.each(['create', 'getAvailability'] as const)(
    'keeps %s public',
    (methodName) => {
      expect(getMethodGuards(methodName)).not.toContain(AdminApiKeyGuard);
    },
  );
});

function getMethodGuards(methodName: keyof CallRequestsController): unknown[] {
  const handler = CallRequestsController.prototype[methodName];

  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}
