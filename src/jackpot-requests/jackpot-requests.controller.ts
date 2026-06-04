import { Controller, Post, Body, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JackpotRequestsService } from './jackpot-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('jackpot-requests')
@UseGuards(JwtAuthGuard)
export class JackpotRequestsController {
  constructor(private readonly jackpotRequestsService: JackpotRequestsService) {}

  @Post('request')
  async createRequest(
    @GetUser('_id') userId: string,
    @Body('matchId') matchId: string,
  ) {
    return this.jackpotRequestsService.createRequest(userId, matchId);
  }

  @Get('me')
  async getMyRequests(@GetUser('_id') userId: string) {
    return this.jackpotRequestsService.findByUser(userId);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get()
  async findAll() {
    return this.jackpotRequestsService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('pending')
  async findPending() {
    return this.jackpotRequestsService.findPending();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id/approve')
  async approve(@Param('id') id: string) {
    return this.jackpotRequestsService.approveRequest(id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id/reject')
  async reject(@Param('id') id: string) {
    return this.jackpotRequestsService.rejectRequest(id);
  }
}
