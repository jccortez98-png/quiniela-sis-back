import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(userData: any): Promise<UserDocument> {
    const { email, password, realName, nickname, avatarUrl } = userData;

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
    });

    const savedUser = await newUser.save();
    // Clear password from returned object
    savedUser.password = undefined;
    return savedUser;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-password').exec();
  }

  async findByNickname(nickname: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ nickname }).select('-password').exec();
  }

  async updateProfile(userId: string, updateData: any): Promise<UserDocument> {
    const { realName, nickname, avatarUrl } = updateData;

    // If nickname is changing, check uniqueness
    if (nickname) {
      const existing = await this.userModel.findOne({ nickname, _id: { $ne: userId } });
      if (existing) {
        throw new ConflictException('El nickname ya está en uso');
      }
    }

    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { realName, nickname, avatarUrl } },
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
