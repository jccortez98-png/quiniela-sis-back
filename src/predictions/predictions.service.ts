import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Prediction, PredictionDocument } from './schemas/prediction.schema';
import { MatchesService } from '../matches/matches.service';
import { JackpotRequestsService } from '../jackpot-requests/jackpot-requests.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PredictionsService {
  constructor(
    @InjectModel(Prediction.name) private predictionModel: Model<PredictionDocument>,
    @Inject(forwardRef(() => MatchesService))
    private matchesService: MatchesService,
    private jackpotRequestsService: JackpotRequestsService,
    @Inject(forwardRef(() => UsersService)) private usersService: UsersService,
  ) {}

  async createOrUpdate(userId: string, predictionData: any, user: any): Promise<PredictionDocument> {
    const { matchId, type, predictedScore } = predictionData;

    // 1. Retrieve match and check 5-minute lock
    const match = await this.matchesService.findById(matchId);
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }

    const now = new Date();
    const lockTime = new Date(match.date.getTime() - 5 * 60 * 1000);
    if (now >= lockTime) {
      throw new BadRequestException('Las predicciones para este partido se cerraron 5 minutos antes del juego.');
    }

    // 2. Validate general quiniela enrollment
    if (type === 'general') {
      if (!user.isEnrolledGeneral) {
        throw new BadRequestException('No estás inscrito en la Quiniela General. Contacta al administrador.');
      }
    }

    // 3. Validate jackpot request approval
    if (type === 'jackpot') {
      const jackpotReq = await this.jackpotRequestsService.findByUserAndMatch(userId, matchId);
      if (!jackpotReq || jackpotReq.status !== 'approved') {
        throw new BadRequestException('No estás aprobado para participar en el Jackpot de este partido.');
      }
    }

    // 4. Create or update prediction
    const existing = await this.predictionModel.findOne({
      userId: new Types.ObjectId(userId),
      matchId: new Types.ObjectId(matchId),
      type,
    }).exec();

    if (existing) {
      existing.predictedScore = {
        home: Number(predictedScore.home),
        away: Number(predictedScore.away),
      };
      return existing.save();
    } else {
      const newPrediction = new this.predictionModel({
        userId: new Types.ObjectId(userId),
        matchId: new Types.ObjectId(matchId),
        type,
        predictedScore: {
          home: Number(predictedScore.home),
          away: Number(predictedScore.away),
        },
        pointsEarned: 0,
      });
      return newPrediction.save();
    }
  }

  async findByUser(userId: string): Promise<PredictionDocument[]> {
    return this.predictionModel.find({ userId: new Types.ObjectId(userId) }).exec();
  }

  async findByMatch(matchId: string): Promise<PredictionDocument[]> {
    return this.predictionModel.find({ matchId: new Types.ObjectId(matchId) }).exec();
  }

  async findByUserAndMatch(userId: string, matchId: string): Promise<PredictionDocument[]> {
    return this.predictionModel.find({
      userId: new Types.ObjectId(userId),
      matchId: new Types.ObjectId(matchId)
    }).exec();
  }

  // Calculate points: 3 points for exact score, 1 point for correct tendency, 0 otherwise
  calculatePoints(predHome: number, predAway: number, actualHome: number, actualAway: number): number {
    if (predHome === actualHome && predAway === actualAway) {
      return 3;
    }

    const predDiff = predHome - predAway;
    const actualDiff = actualHome - actualAway;

    // Tendency math logic
    const correctTendency = (predDiff === 0 && actualDiff === 0) || (predDiff * actualDiff > 0);

    if (correctTendency) {
      return 1;
    }

    return 0;
  }

  // Score all predictions for a match and recalculate user totals
  async scoreMatchPredictions(matchId: string, actualScore: { home: number; away: number }): Promise<void> {
    const predictions = await this.predictionModel.find({ matchId: new Types.ObjectId(matchId) }).exec();

    // Update each prediction points
    for (const prediction of predictions) {
      const points = this.calculatePoints(
        prediction.predictedScore.home,
        prediction.predictedScore.away,
        actualScore.home,
        actualScore.away
      );
      prediction.pointsEarned = points;
      await prediction.save();
    }

    // Recalculate total points for all users (General predictions only)
    const allUsers = await this.usersService.findAll();
    for (const user of allUsers) {
      const userPredictions = await this.predictionModel.find({
        userId: user._id,
        type: 'general',
      }).exec();

      const totalPoints = userPredictions.reduce((sum, p) => sum + p.pointsEarned, 0);
      await this.usersService.updatePoints(user._id.toString(), totalPoints);
    }
  }
}
