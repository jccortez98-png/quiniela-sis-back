import { Controller, Post, Body, Get, Patch, UseGuards, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from './schemas/user.schema';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  async register(@Body() registerDto: any) {
    const user = await this.usersService.create(registerDto);
    return this.authService.login(user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: any) {
    const user = await this.authService.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      return {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Credenciales incorrectas',
      };
    }
    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@GetUser() user: User) {
    // Return the user already fetched by the guard
    const userObj = (user as any).toObject ? (user as any).toObject() : user;
    delete userObj.password;
    return userObj;
  }

  @Get('leaderboard')
  async getLeaderboard() {
    const allUsers = await this.usersService.findAll();
    return allUsers
      .map(user => {
        const obj = user.toObject();
        delete obj.password;
        return obj;
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/general-enrollment')
  async toggleGeneralEnrollment(
    @Param('id') id: string,
    @Body('isEnrolled') isEnrolled: boolean,
  ) {
    return this.usersService.toggleGeneralEnrollment(id, isEnrolled);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @GetUser('_id') userId: string,
    @Body() updateDto: any,
  ) {
    return this.usersService.updateProfile(userId, updateDto);
  }
}
