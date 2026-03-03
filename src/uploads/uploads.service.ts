import { Injectable } from '@nestjs/common';
import { Upload } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateUploadInput {
  originalFileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedById: string;
}

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async createUpload(input: CreateUploadInput): Promise<Upload> {
    return this.prisma.upload.create({
      data: {
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        size: input.size,
        storagePath: input.storagePath,
        uploadedById: input.uploadedById,
      },
    });
  }
}