import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { SupabaseStorageService } from './supabase-storage.service';

// The Supabase client is never called by optimisePhoto — a dummy is enough.
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const service = new SupabaseStorageService({
  getOrThrow: () => 'x',
} as unknown as ConfigService);

/** A screenshot-like image: flat background + sharp-edged text. */
async function screenshotPng(width: number, height: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${Array.from({ length: 30 }, (_, i) => `<text x="20" y="${30 + i * 30}" font-size="16" font-family="Arial">CMR 4825 · DE 67550 · row ${i} · 0123456789</text>`).join('')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A photo-like image: noisy gradients JPEG compresses well, PNG doesn't. */
async function cameraJpeg(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++)
    raw[i] = (i * 31 + ((i * 7) % 251)) & 0xff;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .withMetadata({ exif: { IFD0: { Make: 'Phone' } } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

const asUpload = (buffer: Buffer, name: string, mimetype: string) =>
  ({
    buffer,
    originalname: name,
    mimetype,
    size: buffer.length,
  }) as Express.Multer.File;

// sharp on 4–20 MP images: can exceed 5 s while all suites run in parallel.
jest.setTimeout(30_000);

describe('SupabaseStorageService.optimisePhoto', () => {
  it('keeps a PNG screenshot lossless PNG (pixels identical), with a preview', async () => {
    const png = await screenshotPng(1920, 1080);
    const file = asUpload(
      png,
      'screenshot-2026-10-06-14-32-05.png',
      'image/png',
    );

    const thumb = await service.optimisePhoto(file);

    expect(thumb).not.toBeNull();
    expect(file.mimetype).toBe('image/png');
    expect(file.originalname).toMatch(/\.png$/);
    const after = await sharp(file.buffer).metadata();
    expect(after.format).toBe('png');
    expect(after.width).toBe(1920); // not shrunk — below SCREENSHOT_MAX
    // Lossless: decoded pixels equal the original's.
    const [a, b] = await Promise.all([
      sharp(png).raw().toBuffer(),
      sharp(file.buffer).raw().toBuffer(),
    ]);
    expect(b.equals(a)).toBe(true);
  });

  it('shrinks only PNGs wider than a 4K screen, still as PNG', async () => {
    const file = asUpload(
      await screenshotPng(5120, 1440),
      'wide.png',
      'image/png',
    );
    await service.optimisePhoto(file);
    const after = await sharp(file.buffer).metadata();
    expect(after.format).toBe('png');
    expect(after.width).toBe(3840);
  });

  it('still turns a large camera JPEG into a ≤2560 px JPEG', async () => {
    const file = asUpload(
      await cameraJpeg(4000, 3000),
      'IMG_1.jpg',
      'image/jpeg',
    );
    await service.optimisePhoto(file);
    const after = await sharp(file.buffer).metadata();
    expect(after.format).toBe('jpeg');
    expect(Math.max(after.width, after.height)).toBe(2560);
    expect(file.mimetype).toBe('image/jpeg');
  });
});
