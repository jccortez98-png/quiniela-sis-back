import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password?: string; // Hashed password

  @Prop({ required: true, trim: true })
  realName: string;

  @Prop({ required: true, unique: true, trim: true })
  nickname: string;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ required: true, enum: ['user', 'admin'], default: 'user' })
  role: string;

  @Prop({ default: false })
  isEnrolledGeneral: boolean;

  @Prop({ default: 0 })
  totalPoints: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Team' }], default: [] })
  favoriteTeams: Types.ObjectId[];

  @Prop({ required: true, enum: ['male', 'female', 'other'] })
  gender: string;

  @Prop({ required: true, min: 1 })
  age: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
