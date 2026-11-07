import {
  CallHandler,
  ExecutionContext,
  HttpException,
  mixin,
  NestInterceptor,
  PayloadTooLargeException,
  Type,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { Observable } from 'rxjs';
import {
  assertAllowedFile,
  UPLOAD_POLICIES,
  type UploadKind,
} from './upload-policy';

/**
 * Multipart upload for one field, with the limits of `kind` (upload-policy):
 *   1. the whole request is refused from Content-Length before a byte is
 *      read into memory (413 errors.uploadTooLarge);
 *   2. multer stops a file past maxFileBytes or a count past maxFiles
 *      (413 errors.fileTooLarge / errors.tooManyFiles);
 *   3. every received file must be an allowed type by extension, MIME and
 *      first bytes (415 errors.fileTypeNotSupported).
 * Replaces Nest's FileInterceptor / FilesInterceptor on every upload route,
 * whose errors were untranslated English and which had no limits at all.
 * `single: true` fills `req.file` (FileInterceptor shape), else `req.files`.
 */
export function UploadInterceptor(
  field: string,
  kind: UploadKind,
  opts: { single?: boolean } = {},
): Type<NestInterceptor> {
  const policy = UPLOAD_POLICIES[kind];

  class MixinUploadInterceptor implements NestInterceptor {
    private readonly multer = multer({
      storage: multer.memoryStorage(),
      // Browsers and the apps send file names as UTF-8 (Cyrillic "нпу.pdf").
      defParamCharset: 'utf8',
      limits: {
        fileSize: policy.maxFileBytes,
        files: policy.maxFiles,
        fields: 20,
        fieldSize: 64 * 1024,
      },
    } as multer.Options);

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();

      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > policy.maxTotalBytes) {
        throw new PayloadTooLargeException('errors.uploadTooLarge');
      }

      const handler = opts.single
        ? this.multer.single(field)
        : this.multer.array(field, policy.maxFiles);
      await new Promise<void>((resolve, reject) => {
        // No (or a lying) Content-Length: count the bytes as they stream in and
        // cut the request off at the cap, before multer buffers it all.
        let seen = 0;
        let done = false;
        const onData = (chunk: Buffer) => {
          seen += chunk.length;
          if (!done && seen > policy.maxTotalBytes) {
            done = true;
            req.off('data', onData);
            req.unpipe();
            req.resume(); // drain and discard the rest
            reject(new PayloadTooLargeException('errors.uploadTooLarge'));
          }
        };
        req.on('data', onData);
        handler(req, res, (err: unknown) => {
          req.off('data', onData);
          if (done) return;
          done = true;
          err ? reject(toHttpError(err)) : resolve();
        });
      });

      const files = opts.single
        ? req.file
          ? [req.file]
          : []
        : ((req.files as Express.Multer.File[] | undefined) ?? []);
      // A chunked request has no Content-Length, so the check above never saw
      // it — enforce the whole-request cap on what multer actually received.
      const received = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
      if (received > policy.maxTotalBytes) {
        throw new PayloadTooLargeException('errors.uploadTooLarge');
      }
      for (const file of files) assertAllowedFile(file, kind);

      return next.handle();
    }
  }
  return mixin(MixinUploadInterceptor);
}

function toHttpError(err: unknown): HttpException | unknown {
  if (err instanceof HttpException) return err;
  const code = (err as { code?: string }).code;
  if (code === 'LIMIT_FILE_SIZE') {
    return new PayloadTooLargeException('errors.fileTooLarge');
  }
  // More files than allowed arrives as LIMIT_FILE_COUNT, or — for a field
  // capped by maxCount — LIMIT_UNEXPECTED_FILE.
  if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
    return new PayloadTooLargeException('errors.tooManyFiles');
  }
  if (
    code === 'LIMIT_FIELD_VALUE' ||
    code === 'LIMIT_FIELD_COUNT' ||
    code === 'LIMIT_PART_COUNT'
  ) {
    return new PayloadTooLargeException('errors.uploadTooLarge');
  }
  return err;
}
