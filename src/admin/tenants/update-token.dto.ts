import { IsString, MinLength } from 'class-validator';

export class UpdateTokenDto {
  /** Token de Meta en texto plano; el server lo cifra antes de guardarlo. */
  @IsString()
  @MinLength(1)
  accessToken!: string;
}
