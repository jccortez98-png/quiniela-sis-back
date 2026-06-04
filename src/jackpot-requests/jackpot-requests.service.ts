import { ConflictException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JackpotRequest, JackpotRequestDocument } from './schemas/jackpot-request.schema';
import { MatchesService } from '../matches/matches.service';

@Injectable()
export class JackpotRequestsService {
  constructor(
    @InjectModel(JackpotRequest.name) private jackpotRequestModel: Model<JackpotRequestDocument>,
    @Inject(forwardRef(() => MatchesService))
    private matchesService: MatchesService,
  ) {}

  async createRequest(userId: string, matchId: string): Promise<JackpotRequestDocument> {
    // Check if match exists and is upcoming
    const match = await this.matchesService.findById(matchId);
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }

    const now = new Date();
    const lockTime = new Date(match.date.getTime() - 5 * 60 * 1000);
    if (now >= lockTime) {
      throw new ConflictException('El registro al jackpot está bloqueado para este partido');
    }

    // Check if request already exists
    const existing = await this.jackpotRequestModel.findOne({
      userId: new Types.ObjectId(userId),
      matchId: new Types.ObjectId(matchId),
    }).exec();

    if (existing) {
      throw new ConflictException('Ya tienes una solicitud de ingreso para este partido');
    }

    const newRequest = new this.jackpotRequestModel({
      userId: new Types.ObjectId(userId),
      matchId: new Types.ObjectId(matchId),
      status: 'pending_payment',
    });

    return newRequest.save();
  }

  async findByUserAndMatch(userId: string, matchId: string): Promise<JackpotRequestDocument | null> {
    return this.jackpotRequestModel.findOne({
      userId: new Types.ObjectId(userId),
      matchId: new Types.ObjectId(matchId),
    }).exec();
  }

  async findByUser(userId: string): Promise<JackpotRequestDocument[]> {
    return this.jackpotRequestModel.find({
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async findAll(): Promise<JackpotRequestDocument[]> {
    return this.jackpotRequestModel.find()
      .populate('userId', 'nickname realName avatarUrl')
      .exec();
  }

  async findPending(): Promise<JackpotRequestDocument[]> {
    return this.jackpotRequestModel.find({ status: 'pending_payment' })
      .populate('userId', 'nickname realName avatarUrl')
      .exec();
  }

  async approveRequest(requestId: string): Promise<JackpotRequestDocument> {
    const request = await this.jackpotRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    if (request.status === 'approved') {
      throw new ConflictException('La solicitud ya está aprobada');
    }

    request.status = 'approved';
    const savedRequest = await request.save();

    // Increment jackpotPot in Match. Default cuota is Q10.
    // In Step 3, we can increment by the match's specific cuota if dynamic,
    // but the default is Q10.
    await this.matchesService.incrementJackpotPot(request.matchId.toString(), 10);

    return savedRequest;
  }

  async rejectRequest(requestId: string): Promise<JackpotRequestDocument> {
    const request = await this.jackpotRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    request.status = 'rejected';
    return request.save();
  }
}
