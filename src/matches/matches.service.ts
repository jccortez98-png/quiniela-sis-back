import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Match, MatchDocument } from './schemas/match.schema';
import { ExternalApiService } from './external-api.service';
import { PredictionsService } from '../predictions/predictions.service';

@Injectable()
export class MatchesService {
  constructor(
    @InjectModel(Match.name) private matchModel: Model<MatchDocument>,
    private externalApiService: ExternalApiService,
    @Inject(forwardRef(() => PredictionsService))
    private predictionsService: PredictionsService,
  ) {}

  private mapStage(type: string): string {
    const stageMap: Record<string, string> = {
      'group': 'Fase de Grupos',
      'r32': 'Dieciseisavos de Final',
      'r16': 'Octavos de Final',
      'qf': 'Cuartos de Final',
      'sf': 'Semifinales',
      'third': 'Tercer Lugar',
      'final': 'Final',
    };
    return stageMap[type] || 'Fase de Grupos';
  }

  private parseExternalDate(dateStr: string): Date {
    try {
      const parts = dateStr.split(' ');
      if (parts.length !== 2) return new Date(dateStr);
      const dateParts = parts[0].split('/');
      const timeParts = parts[1].split(':');
      if (dateParts.length !== 3 || timeParts.length !== 2) return new Date(dateStr);
      
      const month = Number(dateParts[0]) - 1;
      const day = Number(dateParts[1]);
      const year = Number(dateParts[2]);
      const hour = Number(timeParts[0]);
      const minute = Number(timeParts[1]);
      
      //return new Date(Date.UTC(year, month, day, hour, minute));
      return new Date(year, month, day, hour, minute);
    } catch {
      return new Date(dateStr);
    }
  }

  async create(matchData: any): Promise<MatchDocument> {
    const newMatch = new this.matchModel(matchData);
    return newMatch.save();
  }

  async findAll(): Promise<MatchDocument[]> {
    return this.matchModel.find().sort({ date: 1 }).exec();
  }

  async findById(id: string): Promise<MatchDocument> {
    const match = await this.matchModel.findById(id).exec();
    if (!match) {
      throw new NotFoundException('Partido no encontrado');
    }
    return match;
  }

  async update(id: string, updateData: any): Promise<MatchDocument> {
    const updated = await this.matchModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    ).exec();
    if (!updated) {
      throw new NotFoundException('Partido no encontrado');
    }
    return updated;
  }

  async delete(id: string): Promise<any> {
    const deleted = await this.matchModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('Partido no encontrado');
    }
    return { success: true, message: 'Partido eliminado correctamente' };
  }

  async incrementJackpotPot(id: string, amount: number): Promise<MatchDocument> {
    const updated = await this.matchModel.findByIdAndUpdate(
      id,
      { $inc: { jackpotPot: amount } },
      { new: true },
    ).exec();
    if (!updated) {
      throw new NotFoundException('Partido no encontrado');
    }
    return updated;
  }

  // Pull games from external API and import/update local MongoDB
  async syncCalendar(): Promise<any> {
    const games = await this.externalApiService.fetchGames();
    let importedCount = 0;
    let updatedCount = 0;

    for (const g of games) {
      const existing = await this.matchModel.findOne({ externalId: g._id }).exec();
      
      const homeTeamName = g.home_team_name_en || g.home_team_label || 'Por definir';
      const awayTeamName = g.away_team_name_en || g.away_team_label || 'Por definir';
      const homeFlag = this.externalApiService.getCountryFlag(homeTeamName);
      const awayFlag = this.externalApiService.getCountryFlag(awayTeamName);

      const isFinished = String(g.finished).toUpperCase() === 'TRUE';
      const isInProgress = g.time_elapsed && g.time_elapsed !== 'notstarted' && !isFinished;
      
      let status = 'pending';
      if (isFinished) {
        status = 'finished';
      } else if (isInProgress) {
        status = 'in_progress';
      }

      const actualScore = isFinished
        ? { home: Number(g.home_score), away: Number(g.away_score) }
        : null;

      const date = this.parseExternalDate(g.local_date);
      const stage = this.mapStage(g.type);

      if (existing) {
        const wasFinished = existing.status === 'finished';

        existing.homeTeam = { name: homeTeamName, flag: homeFlag };
        existing.awayTeam = { name: awayTeamName, flag: awayFlag };
        existing.date = date;
        existing.stage = stage;
        existing.status = status;
        existing.actualScore = actualScore;

        await existing.save();
        updatedCount++;

        // Trigger prediction scoring if it just finished
        if (status === 'finished' && !wasFinished && actualScore) {
          await this.predictionsService.scoreMatchPredictions(existing._id.toString(), actualScore);
        }
      } else {
        // Create new match locally
        const newMatch = new this.matchModel({
          homeTeam: { name: homeTeamName, flag: homeFlag },
          awayTeam: { name: awayTeamName, flag: awayFlag },
          date,
          stage,
          status,
          actualScore,
          jackpotPot: 0,
          externalId: g._id,
        });

        const saved = await newMatch.save();
        importedCount++;

        // Trigger prediction scoring if imported match is already finished
        if (status === 'finished' && actualScore) {
          await this.predictionsService.scoreMatchPredictions(saved._id.toString(), actualScore);
        }
      }
    }

    return { success: true, imported: importedCount, updated: updatedCount };
  }

  // Pull score of a specific game and update local match
  async syncMatchScore(matchId: string): Promise<MatchDocument> {
    const match = await this.matchModel.findById(matchId).exec();
    if (!match) {
      throw new NotFoundException('Partido local no encontrado');
    }

    if (!match.externalId) {
      throw new NotFoundException('Este partido no cuenta con un ID de referencia del API externo.');
    }

    const game = await this.externalApiService.fetchGameScore(match.externalId);
    if (!game) {
      throw new NotFoundException('Partido no encontrado en el API externa.');
    }

    const isFinished = String(game.finished).toUpperCase() === 'TRUE';
    const isInProgress = game.time_elapsed && game.time_elapsed !== 'notstarted' && !isFinished;
    
    let status = 'pending';
    if (isFinished) {
      status = 'finished';
    } else if (isInProgress) {
      status = 'in_progress';
    }

    const actualScore = isFinished
      ? { home: Number(game.home_score), away: Number(game.away_score) }
      : null;

    const wasFinished = match.status === 'finished';

    match.status = status;
    match.actualScore = actualScore;
    const savedMatch = await match.save();

    // Trigger point calculations if it finished
    if (status === 'finished' && !wasFinished && actualScore) {
      await this.predictionsService.scoreMatchPredictions(matchId, actualScore);
    }

    return savedMatch;
  }

  async updateJackpotFee(id: string, fee: number): Promise<MatchDocument> {
    const updated = await this.matchModel.findByIdAndUpdate(
      id,
      { $set: { jackpotFee: fee } },
      { new: true },
    ).exec();
    if (!updated) {
      throw new NotFoundException('Partido no encontrado');
    }
    return updated;
  }

  async getJackpotWinners(matchId: string): Promise<any[]> {
    const match = await this.findById(matchId);
    if (!match || !match.actualScore) {
      return [];
    }
    return this.predictionsService.findJackpotWinners(matchId, match.actualScore);
  }
}
