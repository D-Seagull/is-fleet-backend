import { ConfigService } from '@nestjs/config';
import { SupabaseStorageService } from './supabase-storage.service';
import { assertAllowedFile } from 'src/common/upload-policy';

// HEIC (iPhone) is still accepted by the upload policy (P1-1) and still
// converted to JPEG before storage, so it opens inline everywhere.
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
jest.mock('heic-convert', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
}));

const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.from('mif1heic'),
]);

describe('HEIC uploads', () => {
  it('pass the policy and are stored as JPEG', async () => {
    const file = {
      buffer: HEIC,
      originalname: 'IMG_0042.HEIC',
      mimetype: 'image/heic',
      size: HEIC.length,
    } as Express.Multer.File;

    expect(assertAllowedFile(file, 'document')).toBe('heic');

    const service = new SupabaseStorageService({
      getOrThrow: () => 'x',
    } as unknown as ConfigService);
    await (
      service as unknown as {
        normaliseHeic(f: Express.Multer.File): Promise<void>;
      }
    ).normaliseHeic(file);

    expect(file.mimetype).toBe('image/jpeg');
    expect(file.originalname).toBe('IMG_0042.jpg');
    expect(file.buffer[0]).toBe(0xff);
  });
});
