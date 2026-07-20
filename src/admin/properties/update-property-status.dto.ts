import { PropertyStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePropertyStatusDto {
  @IsEnum(PropertyStatus)
  status!: PropertyStatus;
}
