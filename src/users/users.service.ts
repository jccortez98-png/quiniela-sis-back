import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './schemas/user.schema';
import { Team, TeamDocument } from '../teams/schemas/team.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
  ) {}

  async create(userData: any): Promise<UserDocument> {
    const { email, password, realName, nickname, avatarUrl, favoriteTeams, gender, age } = userData;

    // Validate gender and age
    if (!gender || !['male', 'female', 'other'].includes(gender)) {
      throw new BadRequestException('Debes seleccionar un género válido (Masculino, Femenino u Otro).');
    }
    if (!age || isNaN(Number(age)) || Number(age) < 1) {
      throw new BadRequestException('Debes ingresar una edad válida.');
    }

    // Validate favoriteTeams is an array with exactly 2 selections
    if (!favoriteTeams || !Array.isArray(favoriteTeams) || favoriteTeams.length !== 2) {
      throw new BadRequestException('Debes seleccionar exactamente 2 selecciones favoritas.');
    }

    // Verify both teams exist in database
    const teamsCount = await this.teamModel.countDocuments({ _id: { $in: favoriteTeams } });
    if (teamsCount !== 2) {
      throw new BadRequestException('Una o ambas selecciones favoritas no son válidas.');
    }

    // Check if email already exists
    const existingEmail = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    // Check if nickname already exists
    const existingNickname = await this.userModel.findOne({ nickname });
    if (existingNickname) {
      throw new ConflictException('El nickname ya está en uso');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new this.userModel({
      email: email.toLowerCase(),
      password: hashedPassword,
      realName,
      nickname,
      avatarUrl: avatarUrl || '',
      role: 'user', // Default role is user
      isEnrolledGeneral: false, // Must be approved by admin
      totalPoints: 0,
      favoriteTeams,
      gender,
      age: Number(age),
    });

    const savedUser = await newUser.save();
    // Populate favoriteTeams
    await savedUser.populate('favoriteTeams');
    // Clear password from returned object
    savedUser.password = undefined;
    return savedUser;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).populate('favoriteTeams').exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-password').populate('favoriteTeams').exec();
  }

  async findByNickname(nickname: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ nickname }).select('-password').populate('favoriteTeams').exec();
  }

  async updateProfile(userId: string, updateData: any): Promise<UserDocument> {
    const { realName, nickname, avatarUrl, gender, age } = updateData;

    // If nickname is changing, check uniqueness
    if (nickname) {
      const existing = await this.userModel.findOne({ nickname, _id: { $ne: userId } });
      if (existing) {
        throw new ConflictException('El nickname ya está en uso');
      }
    }

    const setFields: any = {};
    if (realName !== undefined) setFields.realName = realName;
    if (nickname !== undefined) setFields.nickname = nickname;
    if (avatarUrl !== undefined) setFields.avatarUrl = avatarUrl;
    if (gender !== undefined) {
      if (!['male', 'female', 'other'].includes(gender)) {
        throw new BadRequestException('Debes seleccionar un género válido (Masculino, Femenino u Otro).');
      }
      setFields.gender = gender;
    }
    if (age !== undefined) {
      if (isNaN(Number(age)) || Number(age) < 1) {
        throw new BadRequestException('Debes ingresar una edad válida.');
      }
      setFields.age = Number(age);
    }

    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: setFields },
      { new: true },
    ).select('-password').exec();

    if (!updated) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return updated;
  }

  async toggleGeneralEnrollment(userId: string, isEnrolled: boolean): Promise<UserDocument> {
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { isEnrolledGeneral: isEnrolled } },
      { new: true },
    ).select('-password').exec();

    if (!updated) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return updated;
  }

  async updatePoints(userId: string, points: number): Promise<UserDocument> {
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { totalPoints: points } },
      { new: true },
    ).select('-password').exec();

    if (!updated) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return updated;
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password').exec();
  }
}
