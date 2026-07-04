import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import {
  DEFAULT_EVENT_TYPE_MINIMUM_NOTICE_MINUTES,
  DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
  DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
  DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
  EventType,
  type EventTypeDocument,
} from './event-type.schema';
import { HostAccountsService } from './host-accounts.service';

export const DEFAULT_EVENT_TYPE_SLUG = 'intro-call';

const DEFAULT_EVENT_TYPE_INPUT = {
  slug: DEFAULT_EVENT_TYPE_SLUG,
  title: '30 min intro call',
  durationMinutes: 30,
  isActive: true,
  requiresApproval: true,
  workdayStartHour: DEFAULT_EVENT_TYPE_WORKDAY_START_HOUR,
  workdayEndHour: DEFAULT_EVENT_TYPE_WORKDAY_END_HOUR,
  slotIntervalMinutes: DEFAULT_EVENT_TYPE_SLOT_INTERVAL_MINUTES,
  minimumNoticeMinutes: DEFAULT_EVENT_TYPE_MINIMUM_NOTICE_MINUTES,
};

@Injectable()
export class EventTypesService {
  constructor(
    @InjectModel(EventType.name)
    private readonly eventTypeModel: Model<EventTypeDocument>,
    private readonly hostAccountsService: HostAccountsService,
  ) {}

  async findDefaultActiveEventType(): Promise<EventTypeDocument | null> {
    const host = await this.hostAccountsService.findDefaultOrCreate();

    return this.findOldestActiveByHostId(host._id);
  }

  async findActiveByHostId(
    hostId: Types.ObjectId,
  ): Promise<EventTypeDocument[]> {
    return this.eventTypeModel
      .find({
        hostId,
        isActive: true,
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async getActiveByHostIdAndSlug(
    hostId: Types.ObjectId,
    slug: string,
  ): Promise<EventTypeDocument> {
    const eventType = await this.eventTypeModel
      .findOne({
        hostId,
        slug,
        isActive: true,
      })
      .exec();

    if (!eventType) {
      throw new NotFoundException('Event type was not found');
    }

    return eventType;
  }

  private async findOldestActiveByHostId(
    hostId: Types.ObjectId,
  ): Promise<EventTypeDocument | null> {
    return this.eventTypeModel
      .findOne({
        hostId,
        isActive: true,
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findDefaultOrCreate(): Promise<EventTypeDocument> {
    const host = await this.hostAccountsService.findDefaultOrCreate();
    const existingEventType = await this.findByHostAndSlug(
      host._id,
      DEFAULT_EVENT_TYPE_SLUG,
    );

    if (existingEventType) {
      return existingEventType;
    }

    try {
      return await this.eventTypeModel.create({
        hostId: host._id,
        ...DEFAULT_EVENT_TYPE_INPUT,
        availabilityTimezone: host.timezone,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const eventType = await this.findByHostAndSlug(
          host._id,
          DEFAULT_EVENT_TYPE_SLUG,
        );

        if (eventType) {
          return eventType;
        }
      }

      throw error;
    }
  }

  private async findByHostAndSlug(
    hostId: Types.ObjectId,
    slug: string,
  ): Promise<EventTypeDocument | null> {
    return this.eventTypeModel
      .findOne({
        hostId,
        slug,
      })
      .exec();
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
