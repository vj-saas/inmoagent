import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ConversationState } from '@prisma/client';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsEnum(ConversationState)
  state?: ConversationState;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
