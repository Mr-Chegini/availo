import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  DailyDigestEvent,
  RabbitmqRoutingKey,
  type CallApprovedEvent,
  type CallReminderEvent,
} from '@org/shared-types';
import type { Model } from 'mongoose';
import {
  SchedulerCall,
  type SchedulerCallDocument,
} from './scheduler-call.schema';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DateTime } from 'luxon';

@Injectable()
export class SchedulerCallsService {
  private readonly logger = new Logger(SchedulerCallsService.name);

  constructor(
    @InjectModel(SchedulerCall.name)
    private readonly schedulerCallModel: Model<SchedulerCallDocument>,
    private readonly rabbitmqPublisherService: RabbitmqPublisherService,
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

  async handleCallCanceled(callRequestId: string): Promise<void> {
    const result = await this.schedulerCallModel.deleteOne({ callRequestId });

    if (result.deletedCount > 0) {
      this.logger.log(`Removed scheduled call ${callRequestId} after cancel`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDueReminderEvents(): Promise<void> {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const oneMinuteAfter = new Date(twoHoursFromNow.getTime() + 60 * 1000);

    const dueCalls = await this.schedulerCallModel
      .find({
        reminderSent: false,
        scheduledAt: {
          $gte: twoHoursFromNow,
          $lt: oneMinuteAfter,
        },
      })
      .exec();

    for (const call of dueCalls) {
      const event: CallReminderEvent = {
        callRequestId: call.callRequestId,
        email: call.email,
        phoneNumber: call.phoneNumber,
        scheduledAt: call.scheduledAt.toISOString(),
      };

      await this.rabbitmqPublisherService.publish(
        RabbitmqRoutingKey.CALL_REMINDER,
        event,
      );

      call.reminderSent = true;
      await call.save();

      this.logger.log(
        `Published reminder event for call ${call.callRequestId}`,
      );
    }
  }

  @Cron('0 7 * * 1-5', {
    timeZone: 'Europe/Istanbul',
  })
  async publishDailyDigestEvent(): Promise<void> {
    const todayInIstanbul = DateTime.now().setZone('Europe/Istanbul');

    const startOfDay = todayInIstanbul.startOf('day');
    const endOfDay = todayInIstanbul.endOf('day');

    const calls = await this.schedulerCallModel
      .find({
        scheduledAt: {
          $gte: startOfDay.toUTC().toJSDate(),
          $lte: endOfDay.toUTC().toJSDate(),
        },
      })
      .sort({ scheduledAt: 1 })
      .exec();

    const event: DailyDigestEvent = {
      date: todayInIstanbul.toISODate() ?? '',
      calls: calls.map((call) => ({
        callRequestId: call.callRequestId,
        email: call.email,
        phoneNumber: call.phoneNumber,
        scheduledAt: call.scheduledAt.toISOString(),
      })),
    };

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.DAILY_DIGEST,
      event,
    );

    this.logger.log(
      `Published daily digest for ${event.date} with ${event.calls.length} calls`,
    );
  }
}
