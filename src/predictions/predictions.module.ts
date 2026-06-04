import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PredictionsService } from './predictions.service';
import { PredictionsController } from './predictions.controller';
import { Prediction, PredictionSchema } from './schemas/prediction.schema';
import { MatchesModule } from '../matches/matches.module';
import { JackpotRequestsModule } from '../jackpot-requests/jackpot-requests.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Prediction.name, schema: PredictionSchema }]),
    forwardRef(() => MatchesModule),
    JackpotRequestsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [PredictionsController],
  providers: [PredictionsService],
  exports: [PredictionsService, MongooseModule],
})
export class PredictionsModule {}
