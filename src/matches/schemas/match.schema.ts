import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MatchDocument = Match & Document;

@Schema({ _id: false })
export class TeamDetails {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  flag: string;
}

@Schema({ _id: false })
export class MatchScore {
  @Prop({ required: true, min: 0 })
  home: number;

  @Prop({ required: true, min: 0 })
  away: number;
}

@Schema({ timestamps: true })
export class Match {
  @Prop({ required: true, type: TeamDetails })
  homeTeam: TeamDetails;

  @Prop({ required: true, type: TeamDetails })
  awayTeam: TeamDetails;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, default: 'Fase de Grupos' })
  stage: string;

  @Prop({ required: true, enum: ['pending', 'in_progress', 'finished'], default: 'pending' })
  status: string;

  @Prop({ type: MatchScore, default: null })
  actualScore: MatchScore | null;

  @Prop({ default: 0 })
  jackpotPot: number;

  @Prop({ default: 10 })
  jackpotFee: number;

  @Prop({ required: true, enum: ['open', 'paid_out', 'rolled_over'], default: 'open' })
  jackpotStatus: string;

  @Prop({ type: String, default: null, index: true })
  externalId: string | null;
}

export const MatchSchema = SchemaFactory.createForClass(Match);
