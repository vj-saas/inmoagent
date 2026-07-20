import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug debe ser minúsculas, números y guiones',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  phoneNumberId!: string;

  @IsOptional()
  @IsString()
  wabaId?: string;

  /** Token de Meta en texto plano; el server lo cifra antes de guardarlo. */
  @IsString()
  @MinLength(1)
  accessToken!: string;

  @IsOptional()
  @IsString()
  displayPhone?: string;

  @IsOptional()
  @IsString()
  botName?: string;

  @IsOptional()
  @IsString()
  botTone?: string;

  @IsOptional()
  @IsString()
  schedulingLink?: string;

  @IsOptional()
  @IsString()
  humanHours?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competitorsToAvoid?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  coverageAreas?: string[];

  @IsOptional()
  @IsString()
  alertPhone?: string;

  @IsOptional()
  @IsBoolean()
  alertsEnabled?: boolean;
}
