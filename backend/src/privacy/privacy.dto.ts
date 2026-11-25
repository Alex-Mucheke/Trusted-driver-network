import { Equals, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDataRequestDto {
  @IsIn(['CORRECTION', 'OBJECTION', 'RESTRICTION'])
  type: 'CORRECTION' | 'OBJECTION' | 'RESTRICTION';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class EraseAccountDto {
  @IsString()
  @MaxLength(72)
  password: string;

  /** Typed confirmation so a stray request cannot delete an account. */
  @Equals('DELETE', { message: 'confirm must be the word DELETE' })
  confirm: string;
}
