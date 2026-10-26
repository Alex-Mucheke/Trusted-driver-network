import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;

  // E.164-ish, e.g. +254712345678
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'phone must be 9-15 digits, optionally starting with +' })
  phone: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsIn(['CUSTOMER', 'DRIVER'])
  role: 'CUSTOMER' | 'DRIVER';
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(72)
  password: string;
}
