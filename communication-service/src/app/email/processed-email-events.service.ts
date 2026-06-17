import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  ProcessedEmailEvent,
  type ProcessedEmailEventDocument,
} from './processed-email-event.schema';

@Injectable()
export class ProcessedEmailEventsService {
  private readonly logger = new Logger(ProcessedEmailEventsService.name);

  constructor(
    @InjectModel(ProcessedEmailEvent.name)
    private readonly processedEmailEventModel: Model<ProcessedEmailEventDocument>,
  ) {}

  async hasProcessed(idempotencyKey: string): Promise<boolean> {
    const existingEvent = await this.processedEmailEventModel.exists({
      idempotencyKey,
    });

    return Boolean(existingEvent);
  }

  async markProcessed(
    idempotencyKey: string,
    routingKey: string,
  ): Promise<void> {
    try {
      await this.processedEmailEventModel.create({
        idempotencyKey,
        routingKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        this.logger.debug(
          `Email event already marked as processed: ${idempotencyKey}`,
        );
        return;
      }

      throw error;
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
