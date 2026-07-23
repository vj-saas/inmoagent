import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  /** El login no valida longitud mínima: solo se valida al crear la persona. */
  @IsString()
  password!: string;
}
