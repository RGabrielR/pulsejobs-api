import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty()
  createdAt!: Date;
}