import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { Match, MatchSchema } from './schemas/match.schema';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { JackpotRequestsModule } from '../jackpot-requests/jackpot-requests.module';
import { ExternalApiService } from './external-api.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Match.name, schema: MatchSchema }]),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    forwardRef(() => PredictionsModule),
    forwardRef(() => JackpotRequestsModule),
  ],
  controllers: [MatchesController],
  providers: [MatchesService, ExternalApiService],
  exports: [MatchesService, ExternalApiService, MongooseModule],
})
export class MatchesModule {}
