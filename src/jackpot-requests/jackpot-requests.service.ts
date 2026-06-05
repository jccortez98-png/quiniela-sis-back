import { ConflictException, Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
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
    const lockTime = new Date(match.date.getTime() - 10 * 60 * 1000);
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

  async findApprovedByMatch(matchId: string): Promise<JackpotRequestDocument[]> {
    return this.jackpotRequestModel.find({
      matchId: new Types.ObjectId(matchId),
      status: 'approved',
    }).exec();
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

    // Increment jackpotPot in Match. Use the match's specific jackpotFee.
    const match = await this.matchesService.findById(request.matchId.toString());
    const fee = match ? (match.jackpotFee ?? 10) : 10;
    await this.matchesService.incrementJackpotPot(request.matchId.toString(), fee);

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

  async rolloverJackpot(fromMatchId: string, toMatchId: string): Promise<any> {
    const fromMatch = await this.matchesService.findById(fromMatchId);
    const toMatch = await this.matchesService.findById(toMatchId);

    if (!fromMatch || !toMatch) {
      throw new NotFoundException('Uno o ambos partidos no existen');
    }

    if (fromMatch.status !== 'finished') {
      throw new BadRequestException('El partido de origen debe estar finalizado');
    }

    if (toMatch.status !== 'pending') {
      throw new BadRequestException('El partido destino debe estar próximo (pendiente)');
    }

    if (fromMatch.jackpotStatus !== 'open') {
      throw new BadRequestException('El jackpot de este partido ya ha sido procesado');
    }

    // 1. Get all approved requests for fromMatch
    const approvedRequests = await this.jackpotRequestModel.find({
      matchId: fromMatch._id,
      status: 'approved',
    }).exec();

    // 2. Transfer pot
    const rolloverAmount = fromMatch.jackpotPot || 0;
    await this.matchesService.incrementJackpotPot(toMatchId, rolloverAmount);

    // Reset fromMatch pot to 0 and set jackpotStatus to 'rolled_over'
    await this.matchesService.update(fromMatchId, {
      jackpotPot: 0,
      jackpotStatus: 'rolled_over',
    });

    // 3. Register users automatically in toMatch for free
    for (const req of approvedRequests) {
      const existing = await this.jackpotRequestModel.findOne({
        userId: req.userId,
        matchId: toMatch._id,
      }).exec();

      if (!existing) {
        const newReq = new this.jackpotRequestModel({
          userId: req.userId,
          matchId: toMatch._id,
          status: 'approved',
        });
        await newReq.save();
      } else if (existing.status !== 'approved') {
        existing.status = 'approved';
        await existing.save();
      }
    }

    return { success: true, rolledOverAmount: rolloverAmount, usersTransferred: approvedRequests.length };
  }

  async payoutJackpot(matchId: string): Promise<any> {
    const match = await this.matchesService.findById(matchId);
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }

    if (match.status !== 'finished') {
      throw new BadRequestException('El partido debe estar finalizado');
    }

    if (match.jackpotStatus !== 'open') {
      throw new BadRequestException('El jackpot de este partido ya ha sido procesado');
    }

    await this.matchesService.update(matchId, {
      jackpotStatus: 'paid_out',
    });

    return { success: true, status: 'paid_out' };
  }
}
