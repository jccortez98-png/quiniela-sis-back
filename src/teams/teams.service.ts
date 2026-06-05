import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';

@Injectable()
export class TeamsService implements OnModuleInit {
  private readonly logger = new Logger(TeamsService.name);

  constructor(@InjectModel(Team.name) private teamModel: Model<TeamDocument>) {}

  async onModuleInit() {
    await this.seedTeams();
  }

  async findAll(): Promise<TeamDocument[]> {
    return this.teamModel.find().sort({ name: 1 }).exec();
  }

  private async seedTeams() {
    const count = await this.teamModel.countDocuments();
    if (count > 0) {
      this.logger.log('Las selecciones ya están sembradas en la base de datos.');
      return;
    }

    this.logger.log('Sembrando las 48 selecciones de la Copa del Mundo 2026...');

    const teamsToSeed = [
      // CONCACAF (6)
      { name: 'Canada', flag: '🇨🇦' },
      { name: 'Mexico', flag: '🇲🇽' },
      { name: 'USA', flag: '🇺🇸' },
      { name: 'Curacao', flag: '🇨🇼' },
      { name: 'Haiti', flag: '🇭🇹' },
      { name: 'Panama', flag: '🇵🇦' },

      // CONMEBOL (6)
      { name: 'Argentina', flag: '🇦🇷' },
      { name: 'Brazil', flag: '🇧🇷' },
      { name: 'Colombia', flag: '🇨🇴' },
      { name: 'Ecuador', flag: '🇪🇨' },
      { name: 'Paraguay', flag: '🇵🇾' },
      { name: 'Uruguay', flag: '🇺🇾' },

      // UEFA (16)
      { name: 'Austria', flag: '🇦🇹' },
      { name: 'Belgium', flag: '🇧🇪' },
      { name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
      { name: 'Croatia', flag: '🇭🇷' },
      { name: 'Czechia', flag: '🇨🇿' },
      { name: 'England', flag: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿' },
      { name: 'France', flag: '🇫🇷' },
      { name: 'Germany', flag: '🇩🇪' },
      { name: 'Netherlands', flag: '🇳🇱' },
      { name: 'Norway', flag: '🇳🇴' },
      { name: 'Portugal', flag: '🇵🇹' },
      { name: 'Scotland', flag: '🏴\u200d󠁧󠁢󠁳󠁣󠁴󠁿' },
      { name: 'Spain', flag: '🇪🇸' },
      { name: 'Sweden', flag: '🇸🇪' },
      { name: 'Switzerland', flag: '🇨🇭' },
      { name: 'Turkey', flag: '🇹🇷' },

      // AFC (9)
      { name: 'Australia', flag: '🇦🇺' },
      { name: 'Iran', flag: '🇮🇷' },
      { name: 'Iraq', flag: '🇮🇶' },
      { name: 'Japan', flag: '🇯🇵' },
      { name: 'Jordan', flag: '🇯🇴' },
      { name: 'Qatar', flag: '🇶🇦' },
      { name: 'Saudi Arabia', flag: '🇸🇦' },
      { name: 'South Korea', flag: '🇰🇷' },
      { name: 'Uzbekistan', flag: '🇺🇿' },

      // CAF (10)
      { name: 'Algeria', flag: '🇩🇿' },
      { name: 'Cape Verde', flag: '🇨🇻' },
      { name: 'DR Congo', flag: '🇨🇩' },
      { name: 'Egypt', flag: '🇪🇬' },
      { name: 'Ghana', flag: '🇬🇭' },
      { name: 'Ivory Coast', flag: '🇨🇮' },
      { name: 'Morocco', flag: '🇲🇦' },
      { name: 'Senegal', flag: '🇸🇳' },
      { name: 'South Africa', flag: '🇿🇦' },
      { name: 'Tunisia', flag: '🇹🇳' },

      // OFC (1)
      { name: 'New Zealand', flag: '🇳🇿' },
    ];

    try {
      await this.teamModel.insertMany(teamsToSeed);
      this.logger.log('✅ Sembrado completado exitosamente.');
    } catch (error: any) {
      this.logger.error('❌ Error al sembrar las selecciones:', error.message);
    }
  }
}
