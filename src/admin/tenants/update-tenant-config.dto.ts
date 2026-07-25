import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** PATCH /admin/tenants/:tenantId/config — todos los campos opcionales (PATCH parcial). */
export class UpdateTenantConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  alertPhone?: string;

  @IsOptional()
  @IsBoolean()
  alertsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  humanHours?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  botName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  botTone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  schedulingLink?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  coverageAreas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  competitorsToAvoid?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayPhone?: string;

  /** Primera frase del saludo (el aviso Ley 25.326 lo agrega siempre el backend). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  welcomeIntro?: string;

  /** Frase intro del handoff (la línea de humanHours la agrega siempre el backend). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  handoffIntro?: string;
}
