import { ConflictException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingLockDocument } from './booking-lock.schema';
import { BookingLockService } from './booking-lock.service';

describe('BookingLockService', () => {
  let model: {
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
  };
  let service: BookingLockService;

  beforeEach(() => {
    model = {
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    service = new BookingLockService(
      model as unknown as Model<BookingLockDocument>,
    );
  });

  it('holds a scoped lock while running the operation and releases it', async () => {
    const operation = vi.fn().mockResolvedValue('created');

    await expect(service.runExclusive('host:123', operation)).resolves.toBe(
      'created',
    );

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'host:123' }),
      expect.any(Object),
      { upsert: true },
    );
    expect(operation).toHaveBeenCalledOnce();
    expect(model.deleteOne).toHaveBeenCalledWith({
      scope: 'host:123',
      ownerToken: expect.any(String),
    });
  });

  it('reports contention when the unique scope lock is already held', async () => {
    model.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    const operation = vi.fn();

    await expect(service.runExclusive('host:123', operation)).rejects.toThrow(
      ConflictException,
    );
    expect(operation).not.toHaveBeenCalled();
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('releases the lock when the operation fails', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('write failed'));

    await expect(service.runExclusive('host:123', operation)).rejects.toThrow(
      'write failed',
    );
    expect(model.deleteOne).toHaveBeenCalledOnce();
  });
});
