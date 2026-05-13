import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { CallApprovedEvent } from '@org/shared-types';
import type { Model } from 'mongoose';
import {
  SchedulerCall,
  type SchedulerCallDocument,
} from './scheduler-call.schema';

@Injectable()
export class SchedulerCallsService {
  private readonly logger = new Logger(SchedulerCallsService.name);

  constructor(
    @InjectModel(SchedulerCall.name)
    private readonly schedulerCallModel: Model<SchedulerCallDocument>,
  ) {}

  async handleCallApproved(event: CallApprovedEvent): Promise<void> {
    await this.schedulerCallModel.updateOne(
      { callRequestId: event.callRequestId },
      {
        $set: {
          callRequestId: event.callRequestId,
          email: event.email,
          phoneNumber: event.phoneNumber,
          scheduledAt: new Date(event.scheduledAt),
        },
      },
      { upsert: true },
    );

    this.logger.log(
      `Stored scheduled call ${event.callRequestId} for ${event.scheduledAt}`,
    );
  }
}