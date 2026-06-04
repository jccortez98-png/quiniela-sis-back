import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JackpotRequestDocument = JackpotRequest & Document;

@Schema({ timestamps: true })
export class JackpotRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Match', required: true })
  matchId: Types.ObjectId;

  @Prop({ required: true, enum: ['pending_payment', 'approved', 'rejected'], default: 'pending_payment' })
  status: string;
}

export const JackpotRequestSchema = SchemaFactory.createForClass(JackpotRequest);

// Compound index to ensure a user only requests a jackpot once per match
JackpotRequestSchema.index({ userId: 1, matchId: 1 }, { unique: true });
