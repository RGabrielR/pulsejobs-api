import { Role } from '@prisma/client';

export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
}