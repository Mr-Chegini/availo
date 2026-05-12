import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AvailabilitySlotDto,
  CallRequestedEvent,
  CallRequestStatus,
  CreateCallRequestDto,
  RabbitmqRoutingKey,
} from '@org/shared-types';
import { CallRequest, CallRequestDocument } from './call-request.schema';
import { DateTime } from 'luxon';
import { RabbitmqPublisherService } from '../messaging/rabbitmq-publisher.service';

@Injectable()
export class CallRequestsService {
  constructor(
    @InjectModel(CallRequest.name)
    private readonly callRequestModel: Model<CallRequestDocument>,
    private readonly rabbitmqPublisherService: RabbitmqPublisherService,
  ) {}

  async create(dto: CreateCallRequestDto) {
    const scheduledAt = new Date(dto.scheduledAt);

    if (!dto.email || !dto.phoneNumber || !dto.scheduledAt) {
      throw new BadRequestException(
        'email, phoneNumber and scheduledAt are required',
      );
    }

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date');
    }

    this.validateScheduledAt(scheduledAt);

    const existingCallRequest = await this.callRequestModel.exists({
      scheduledAt,
      status: CallRequestStatus.REQUESTED,
    });

    if (existingCallRequest) {
      throw new BadRequestException('This time slot is already reserved');
    }

    const callRequest = await this.callRequestModel.create({
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      scheduledAt,
      status: CallRequestStatus.REQUESTED,
    });

    const event: CallRequestedEvent = {
      callRequestId: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
    };

    await this.rabbitmqPublisherService.publish(
      RabbitmqRoutingKey.CALL_REQUESTED,
      event,
    );

    return {
      id: callRequest.id,
      email: callRequest.email,
      phoneNumber: callRequest.phoneNumber,
      scheduledAt: callRequest.scheduledAt.toISOString(),
      status: callRequest.status,
      adminNote: callRequest.adminNote,
      createdAt: callRequest.createdAt.toISOString(),
      updatedAt: callRequest.updatedAt.toISOString(),
    };
  }

  private validateScheduledAt(scheduledAt: Date): void {
    const nowInIstanbul = DateTime.now().setZone('Europe/Istanbul');
    const scheduledInIstanbul =
      DateTime.fromJSDate(scheduledAt).setZone('Europe/Istanbul');

    if (scheduledInIstanbul <= nowInIstanbul) {
      throw new BadRequestException('Call must be scheduled for a future date');
    }

    if (scheduledInIstanbul.hasSame(nowInIstanbul, 'day')) {
      throw new BadRequestException('Same-day bookings are not allowed');
    }

    const weekday = scheduledInIstanbul.weekday;

    if (weekday === 6 || weekday === 7) {
      throw new BadRequestException(
        'Calls can only be booked Monday to Friday',
      );
    }

    const hour = scheduledInIstanbul.hour;
    const minute = scheduledInIstanbul.minute;

    const isInsideWorkingHours =
      hour >= 10 && (hour < 18 || (hour === 18 && minute === 0));

    if (!isInsideWorkingHours) {
      throw new BadRequestException(
        'Calls can only be booked between 10:00 and 18:00 Istanbul time',
      );
    }

    if (minute !== 0 && minute !== 30) {
      throw new BadRequestException('Calls must start on a 30-minute slot');
    }

    if (
      scheduledInIstanbul.second !== 0 ||
      scheduledInIstanbul.millisecond !== 0
    ) {
      throw new BadRequestException(
        'Call time must not include seconds or milliseconds',
      );
    }
  }

  async getAvailability(date: string): Promise<AvailabilitySlotDto[]> {
    const day = DateTime.fromISO(date, {
      zone: 'Europe/Istanbul',
    });

    if (!day.isValid) {
      throw new BadRequestException('date must be a valid ISO date');
    }

    const nowInIstanbul = DateTime.now().setZone('Europe/Istanbul');

    if (
      day.hasSame(nowInIstanbul, 'day') ||
      day < nowInIstanbul.startOf('day')
    ) {
      throw new BadRequestException(
        'Availability is only available for future dates',
      );
    }

    if (day.weekday === 6 || day.weekday === 7) {
      return [];
    }

    const startOfWorkingDay = day.set({
      hour: 10,
      minute: 0,
      second: 0,
      millisecond: 0,
    });

    const endOfWorkingDay = day.set({
      hour: 18,
      minute: 0,
      second: 0,
      millisecond: 0,
    });

    const existingCallRequests = await this.callRequestModel
      .find({
        scheduledAt: {
          $gte: startOfWorkingDay.toUTC().toJSDate(),
          $lt: endOfWorkingDay.toUTC().toJSDate(),
        },
        status: CallRequestStatus.REQUESTED,
      })
      .select('scheduledAt')
      .lean();

    const reservedTimes = new Set(
      existingCallRequests.map((callRequest) =>
        callRequest.scheduledAt.toISOString(),
      ),
    );

    const slots: AvailabilitySlotDto[] = [];

    let currentSlot = startOfWorkingDay;

    while (currentSlot < endOfWorkingDay) {
      const scheduledAt = currentSlot.toUTC().toJSDate().toISOString();

      slots.push({
        scheduledAt,
        available: !reservedTimes.has(scheduledAt),
      });

      currentSlot = currentSlot.plus({ minutes: 30 });
    }

    return slots;
  }
}
