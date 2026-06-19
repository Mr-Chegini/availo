import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { EventType, type EventTypeDocument } from './event-type.schema';
import { HostAccountsService } from './host-accounts.service';

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
}
