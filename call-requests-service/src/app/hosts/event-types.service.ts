import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { EventType, type EventTypeDocument } from './event-type.schema';
import { HostAccountsService } from './host-accounts.service';

export const DEFAULT_EVENT_TYPE_SLUG = 'intro-call';

const DEFAULT_EVENT_TYPE_INPUT = {
  slug: DEFAULT_EVENT_TYPE_SLUG,
  title: '30 min intro call',
  durationMinutes: 30,
  isActive: true,
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

    return this.eventTypeModel
      .findOne({
        hostId: host._id,
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
