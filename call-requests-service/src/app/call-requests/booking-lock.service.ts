import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import { BookingLock, BookingLockDocument } from './booking-lock.schema';

const BOOKING_LOCK_LEASE_MS = 120_000;

@Injectable()
export class BookingLockService {
  constructor(
    @InjectModel(BookingLock.name)
    private readonly bookingLockModel: Model<BookingLockDocument>,
  ) {}

  async runExclusive<T>(
    scope: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const ownerToken = randomUUID();
    const now = new Date();

    try {
      await this.bookingLockModel.findOneAndUpdate(
        {
          scope,
          $or: [{ expiresAt: { $lte: now } }, { ownerToken }],
        },
        {
          $set: {
            ownerToken,
            expiresAt: new Date(now.getTime() + BOOKING_LOCK_LEASE_MS),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'This host schedule is being updated; please try again',
        );
      }

      throw error;
    }

    try {
      return await operation();
    } finally {
      await this.bookingLockModel.deleteOne({ scope, ownerToken });
    }
  }
}

function isDuplicateKeyError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
