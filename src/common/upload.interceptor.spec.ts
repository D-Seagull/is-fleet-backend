import {
  Controller,
  INestApplication,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UploadInterceptor } from './upload.interceptor';

// Real multipart requests through the interceptor (P1-1): limits, counts,
// total size and type, with the i18n keys the clients translate.
@Controller('t')
class UploadTestController {
  @Post('docs')
  @UseInterceptors(UploadInterceptor('files', 'document'))
  docs(@UploadedFiles() files: Express.Multer.File[]) {
    return { count: files.length, types: files.map((f) => f.mimetype) };
  }

  @Post('avatar')
  @UseInterceptors(UploadInterceptor('file', 'image', { single: true }))
  avatar(@UploadedFile() file: Express.Multer.File) {
    return { name: file.originalname };
  }
}

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);
const PDF = Buffer.from('%PDF-1.7\n');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const MB = 1024 * 1024;

describe('UploadInterceptor', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadTestController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  const post = (path: string) => request(app.getHttpServer()).post(path);

  it('passes allowed files through (Cyrillic names intact)', async () => {
    const res = await post('/t/docs')
      .attach('files', PDF, {
        filename: 'нпу.pdf',
        contentType: 'application/pdf',
      })
      .attach('files', JPEG, {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
  });

  it('413 errors.fileTooLarge for a file over the limit', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(21 * MB)]);
    const res = await post('/t/docs').attach('files', big, {
      filename: 'big.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(413);
    expect(res.body.message).toBe('errors.fileTooLarge');
  });

  it('413 errors.tooManyFiles for an 11th file', async () => {
    let req = post('/t/docs');
    for (let i = 0; i < 11; i++) {
      req = req.attach('files', PDF, {
        filename: `f${i}.pdf`,
        contentType: 'application/pdf',
      });
    }
    const res = await req;
    expect(res.status).toBe(413);
    expect(res.body.message).toBe('errors.tooManyFiles');
  });

  it('413 errors.uploadTooLarge from Content-Length, before reading', async () => {
    const res = await post('/t/avatar')
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .set('Content-Length', String(50 * MB))
      .send('');
    expect(res.status).toBe(413);
    expect(res.body.message).toBe('errors.uploadTooLarge');
  });

  it('415 errors.fileTypeNotSupported for HTML disguised as a PDF', async () => {
    const res = await post('/t/docs').attach('files', HTML, {
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(415);
    expect(res.body.message).toBe('errors.fileTypeNotSupported');
  });

  it('avatars: images only', async () => {
    const ok = await post('/t/avatar').attach('file', JPEG, {
      filename: 'me.jpg',
      contentType: 'image/jpeg',
    });
    expect(ok.status).toBe(201);
    const bad = await post('/t/avatar').attach('file', PDF, {
      filename: 'me.pdf',
      contentType: 'application/pdf',
    });
    expect(bad.status).toBe(415);
  });
});
