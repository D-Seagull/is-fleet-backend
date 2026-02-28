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

  async uploadFile(file: Express.Multer.File): Promise<string> {
    if (!file?.buffer) throw new Error('No file buffer found');

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: 'is-fleet' }, (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(new Error(error.message || 'Upload failed'));
          } else {
            console.log('Cloudinary upload result:', result);
            resolve(result!.secure_url);
          }
        })
        .end(file.buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
