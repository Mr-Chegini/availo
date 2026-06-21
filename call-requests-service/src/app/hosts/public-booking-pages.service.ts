import { Injectable } from '@nestjs/common';
import { EventTypeDocument } from './event-type.schema';
import { EventTypesService } from './event-types.service';
import { HostAccountDocument } from './host-account.schema';
import { HostAccountsService } from './host-accounts.service';

export interface PublicBookingPageResponse {
  host: {
    name: string;
    slug: string;
    timezone: string;
  };
  eventTypes: Array<{
    slug: string;
    title: string;
    durationMinutes: number;
    requiresApproval: boolean;
    meetingLocation?: string;
    availabilityTimezone: string;
  }>;
}

@Injectable()
export class PublicBookingPagesService {
  constructor(
    private readonly hostAccountsService: HostAccountsService,
    private readonly eventTypesService: EventTypesService,
  ) {}

  async getByHostSlug(hostSlug: string): Promise<PublicBookingPageResponse> {
    const host = await this.hostAccountsService.getBySlug(hostSlug);
    const eventTypes = await this.eventTypesService.findActiveByHostId(
      host._id,
    );

    return {
      host: this.toPublicHost(host),
      eventTypes: eventTypes.map((eventType) =>
        this.toPublicEventType(eventType),
      ),
    };
  }

  private toPublicHost(
    host: HostAccountDocument,
  ): PublicBookingPageResponse['host'] {
    return {
      name: host.name,
      slug: host.slug,
      timezone: host.timezone,
    };
  }

  private toPublicEventType(
    eventType: EventTypeDocument,
  ): PublicBookingPageResponse['eventTypes'][number] {
    const publicEventType: PublicBookingPageResponse['eventTypes'][number] = {
      slug: eventType.slug,
      title: eventType.title,
      durationMinutes: eventType.durationMinutes,
      requiresApproval: eventType.requiresApproval ?? true,
      availabilityTimezone: eventType.availabilityTimezone,
    };

    if (eventType.meetingLocation) {
      publicEventType.meetingLocation = eventType.meetingLocation;
    }

    return publicEventType;
  }
}
