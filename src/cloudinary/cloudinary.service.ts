import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
  constructor(private config: ConfigService) {
    const cloudName = config.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = config.get('CLOUDINARY_API_KEY');
    const apiSecret = config.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'Cloudinary configuration missing in environment variables',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ url: string; publicId: string }> {
    if (!file?.buffer) throw new Error('No file buffer found');

    const isImage = file.mimetype.startsWith('image/');

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: isImage ? 'is-fleet/photos' : 'is-fleet/documents',
            resource_type: isImage ? 'image' : 'raw',
            type: 'upload',                 // публічний доступ
            ...(isImage && {
              quality: 'auto:eco',
              fetch_format: 'auto',
            }),
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(new Error(error.message || 'Upload failed'));
            } else {
              // Для raw-ресурсів деякі версії SDK повертають /image/upload/ у secure_url.
              // Явно виправляємо URL відповідно до resource_type.
              const url = isImage
                ? result!.secure_url
                : result!.secure_url.replace('/image/upload/', '/raw/upload/');
              resolve({
                url,
                publicId: result!.public_id,
              });
            }
          },
        )
        .end(file.buffer);
    });
  }

  async deleteFile(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
