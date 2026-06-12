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

    // 1. Retrieve match and check 10-minute lock
    const match = await this.matchesService.findById(matchId);
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }

    const now = new Date();
    const lockTime = new Date(match.date.getTime() - 10 * 60 * 1000);
    if (now >= lockTime) {
      throw new BadRequestException('Las predicciones para este partido se cerraron 10 minutos antes del juego.');
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

  async ensureDefaultPredictionsForUser(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) return;

    const matches = await this.matchesService.findAll();
    const now = new Date();

    const lockedMatches = matches.filter(m => {
      const lockTime = new Date(m.date.getTime() - 10 * 60 * 1000);
      return now >= lockTime;
    });

    if (lockedMatches.length === 0) return;

    // Get all predictions for this user to check existing
    const existingPredictions = await this.predictionModel.find({
      userId: new Types.ObjectId(userId)
    }).exec();

    // Check General predictions
    if (user.isEnrolledGeneral) {
      for (const match of lockedMatches) {
        const hasGeneral = existingPredictions.some(
          p => p.matchId.toString() === match._id.toString() && p.type === 'general'
        );
        if (!hasGeneral) {
          try {
            await new this.predictionModel({
              userId: new Types.ObjectId(userId),
              matchId: match._id,
              type: 'general',
              predictedScore: { home: 0, away: 0 },
              pointsEarned: 0
            }).save();
          } catch (e) {
            // Ignore duplicate/concurrent insert errors
          }
        }
      }
    }

    // Check Jackpot predictions
    const jackpotReqs = await this.jackpotRequestsService.findByUser(userId);
    const approvedMatchIds = jackpotReqs
      .filter(r => r.status === 'approved')
      .map(r => r.matchId.toString());

    for (const match of lockedMatches) {
      if (approvedMatchIds.includes(match._id.toString())) {
        const hasJackpot = existingPredictions.some(
          p => p.matchId.toString() === match._id.toString() && p.type === 'jackpot'
        );
        if (!hasJackpot) {
          try {
            await new this.predictionModel({
              userId: new Types.ObjectId(userId),
              matchId: match._id,
              type: 'jackpot',
              predictedScore: { home: 0, away: 0 },
              pointsEarned: 0
            }).save();
          } catch (e) {
            // Ignore duplicate/concurrent insert errors
          }
        }
      }
    }
  }

  async ensureDefaultPredictionsForMatch(matchId: string): Promise<void> {
    const match = await this.matchesService.findById(matchId);
    if (!match) return;

    // Get all predictions for this match
    const existingPredictions = await this.predictionModel.find({
      matchId: new Types.ObjectId(matchId)
    }).exec();

    // 1. For General: get all general enrolled users
    const allUsers = await this.usersService.findAll();
    const generalUsers = allUsers.filter(u => u.isEnrolledGeneral);

    for (const user of generalUsers) {
      const hasGeneral = existingPredictions.some(
        p => p.userId.toString() === user._id.toString() && p.type === 'general'
      );
      if (!hasGeneral) {
        try {
          await new this.predictionModel({
            userId: user._id,
            matchId: match._id,
            type: 'general',
            predictedScore: { home: 0, away: 0 },
            pointsEarned: 0
          }).save();
        } catch (e) {
          // Ignore
        }
      }
    }

    // 2. For Jackpot: get all approved jackpot requests for this match
    const approvedRequests = await this.jackpotRequestsService.findApprovedByMatch(matchId);
    for (const req of approvedRequests) {
      const hasJackpot = existingPredictions.some(
        p => p.userId.toString() === req.userId.toString() && p.type === 'jackpot'
      );
      if (!hasJackpot) {
        try {
          await new this.predictionModel({
            userId: req.userId,
            matchId: match._id,
            type: 'jackpot',
            predictedScore: { home: 0, away: 0 },
            pointsEarned: 0
          }).save();
        } catch (e) {
          // Ignore
        }
      }
    }
  }

  async findByUser(userId: string): Promise<PredictionDocument[]> {
    await this.ensureDefaultPredictionsForUser(userId);
    return this.predictionModel.find({ userId: new Types.ObjectId(userId) }).exec();
  }

  async findByMatch(matchId: string): Promise<PredictionDocument[]> {
    return this.predictionModel.find({ matchId: new Types.ObjectId(matchId) }).exec();
  }

  async findByUserAndMatch(userId: string, matchId: string): Promise<PredictionDocument[]> {
    await this.ensureDefaultPredictionsForUser(userId);
    return this.predictionModel.find({
      userId: new Types.ObjectId(userId),
      matchId: new Types.ObjectId(matchId)
    }).exec();
  }

  // Calculate points:
  // - 3 points for exact score OR 1 point for correct tendency
  // - +1 point for matching home team score
  // - +1 point for matching away team score
  calculatePoints(predHome: number, predAway: number, actualHome: number, actualAway: number): number {
    let points = 0;

    if (predHome === actualHome && predAway === actualAway) {
      points += 3;
    } else {
      const predDiff = predHome - predAway;
      const actualDiff = actualHome - actualAway;

      // Tendency math logic
      const correctTendency = (predDiff === 0 && actualDiff === 0) || (predDiff * actualDiff > 0);

      if (correctTendency) {
        points += 1;
      }
    }

    // +1 point for matching home score
    if (predHome === actualHome) {
      points += 1;
    }

    // +1 point for matching away score
    if (predAway === actualAway) {
      points += 1;
    }

    return points;
  }

  // Score all predictions for a match and recalculate user totals
  async scoreMatchPredictions(matchId: string, actualScore: { home: number; away: number }): Promise<void> {
    await this.ensureDefaultPredictionsForMatch(matchId);

    const predictions = await this.predictionModel.find({ matchId: new Types.ObjectId(matchId) }).exec();
    const match = await this.matchesService.findById(matchId);
    if (!match) return;

    // Determine winner team name (if draw, winner is null)
    let winnerTeamName: string | null = null;
    if (actualScore.home > actualScore.away) {
      winnerTeamName = match.homeTeam.name;
    } else if (actualScore.away > actualScore.home) {
      winnerTeamName = match.awayTeam.name;
    }

    // Update each prediction points
    for (const prediction of predictions) {
      // Find full user to get their favorite teams
      const user = await this.usersService.findById(prediction.userId.toString());
      if (!user) continue;

      let points = this.calculatePoints(
        prediction.predictedScore.home,
        prediction.predictedScore.away,
        actualScore.home,
        actualScore.away
      );

      // Check if user has a favorite team that won this match (points are doubled)
      if (winnerTeamName && user.favoriteTeams && user.favoriteTeams.length > 0) {
        const isFavoriteWinner = user.favoriteTeams.some(
          (favTeam: any) => favTeam.name.toLowerCase() === winnerTeamName!.toLowerCase()
        );

        if (isFavoriteWinner) {
          points = points * 2;
        }
      }

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

  async findJackpotWinners(matchId: string, actualScore: { home: number; away: number }): Promise<any[]> {
    await this.ensureDefaultPredictionsForMatch(matchId);

    const predictions = await this.predictionModel.find({
      matchId: new Types.ObjectId(matchId),
      type: 'jackpot',
      'predictedScore.home': actualScore.home,
      'predictedScore.away': actualScore.away,
    }).populate('userId', 'nickname realName avatarUrl').exec();

    return predictions.map(p => p.userId);
  }

  async findMatchPredictions(matchId: string, type: 'general' | 'jackpot'): Promise<any[]> {
    const match = await this.matchesService.findById(matchId);
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }

    // Security: Only reveal predictions after the 10-minute lock or if already started/live/finished
    const now = new Date();
    const lockTime = new Date(match.date.getTime() - 10 * 60 * 1000);
    if (now < lockTime && match.status === 'pending') {
      throw new BadRequestException('Las predicciones de otros usuarios se revelarán cuando el partido comience o esté bloqueado (10 minutos antes).');
    }

    const predictions = await this.predictionModel.find({
      matchId: new Types.ObjectId(matchId),
      type,
    })
    .populate('userId', 'nickname realName avatarUrl')
    .exec();

    // Sort alphabetically by user nickname
    return predictions.sort((a: any, b: any) => {
      const nickA = (a.userId?.nickname || '').toLowerCase();
      const nickB = (b.userId?.nickname || '').toLowerCase();
      return nickA.localeCompare(nickB);
    });
  }
}
