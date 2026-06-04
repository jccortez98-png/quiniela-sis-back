import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PredictionDocument = Prediction & Document;

@Schema({ _id: false })
export class PredictedScore {
  @Prop({ required: true, min: 0 })
  home: number;

  @Prop({ required: true, min: 0 })
  away: number;
}

@Schema({ timestamps: true })
export class Prediction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Match', required: true })
  matchId: Types.ObjectId;

  @Prop({ required: true, enum: ['general', 'jackpot'] })
  type: string;

  @Prop({ required: true, type: PredictedScore })
  predictedScore: PredictedScore;

  @Prop({ default: 0 })
  pointsEarned: number;
}

export const PredictionSchema = SchemaFactory.createForClass(Prediction);

// Compound index to ensure a user only makes one general prediction and one jackpot prediction per match
PredictionSchema.index({ userId: 1, matchId: 1, type: 1 }, { unique: true });
