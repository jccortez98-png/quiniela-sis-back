import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JackpotRequestsService } from './jackpot-requests.service';
import { JackpotRequestsController } from './jackpot-requests.controller';
import { JackpotRequest, JackpotRequestSchema } from './schemas/jackpot-request.schema';
import { MatchesModule } from '../matches/matches.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: JackpotRequest.name, schema: JackpotRequestSchema }]),
    forwardRef(() => MatchesModule),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [JackpotRequestsController],
  providers: [JackpotRequestsService],
  exports: [JackpotRequestsService, MongooseModule],
})
export class JackpotRequestsModule {}
