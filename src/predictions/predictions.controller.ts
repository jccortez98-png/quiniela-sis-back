import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/schemas/user.schema';

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Post()
  async createOrUpdate(
    @GetUser('_id') userId: string,
    @GetUser() user: User,
    @Body() predictionDto: any,
  ) {
    return this.predictionsService.createOrUpdate(userId, predictionDto, user);
  }

  @Get('me')
  async getMyPredictions(@GetUser('_id') userId: string) {
    return this.predictionsService.findByUser(userId);
  }
}
