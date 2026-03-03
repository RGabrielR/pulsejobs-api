import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@pulsejobs.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, description: 'Optional display name for audit metadata.' })
  @IsOptional()
  @IsString()
  name?: string;
}