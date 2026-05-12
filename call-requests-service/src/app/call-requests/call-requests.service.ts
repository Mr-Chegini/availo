import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CallRequestStatus,
  CreateCallRequestDto,
} from '@org/shared-types';
import {
  CallRequest,
  CallRequestDocument,
} from './call-request.schema';

@Injectable()
export class CallRequestsService {
  constructor(
    @InjectModel(CallRequest.name)
    private readonly callRequestModel: Model<CallRequestDocument>,
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

    const callRequest = await this.callRequestModel.create({
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      scheduledAt,
      status: CallRequestStatus.REQUESTED,
    });

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
}