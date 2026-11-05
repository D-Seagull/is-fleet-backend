import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { assertAllowedFile } from './upload-policy';

// P1-1: type is decided by extension (or MIME when there's none), the
// declared MIME must fit, and the first bytes must match.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ');
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0x06, 0]);
const XLS = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.from('mif1heic'),
]);
const HTML = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

const file = (
  originalname: string,
  mimetype: string,
  buffer: Buffer,
  size?: number,
) => ({
  originalname,
  mimetype,
  buffer,
  size: size ?? buffer.length,
});
const MB = 1024 * 1024;

describe('assertAllowedFile — documents', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', JPEG],
    ['scan.png', 'image/png', PNG],
    ['cmr.pdf', 'application/pdf', PDF],
    ['order.docx', 'application/octet-stream', DOCX], // generic MIME → bytes decide
    ['old.xls', 'application/vnd.ms-excel', XLS],
    ['IMG_0001.HEIC', 'image/heic', HEIC],
    ['notes.txt', 'text/plain', Buffer.from('Plates: WX 123, WX 456')],
    ['loads.csv', 'text/csv', Buffer.from('date;plate\n2026-10-31;WX 1')],
  ])('accepts %s', (name, mime, buf) => {
    expect(() =>
      assertAllowedFile(file(name, mime, buf), 'document'),
    ).not.toThrow();
  });

  it('an iPhone "IMG_0042.HEIC" that is really JPEG is accepted and named for what it is', () => {
    const f = file('IMG_0042.HEIC', 'image/jpeg', JPEG);
    expect(assertAllowedFile(f, 'image')).toBe('jpeg');
    expect(f.originalname).toBe('IMG_0042.jpg');
    expect(f.mimetype).toBe('image/jpeg');
  });

  it('a PNG labelled .jpg is fixed up, not refused', () => {
    const f = file('shot.jpg', 'image/jpeg', PNG);
    expect(assertAllowedFile(f, 'document')).toBe('png');
    expect(f.mimetype).toBe('image/png');
    expect(f.originalname).toBe('shot.png');
  });

  it('accepts a phone photo with no extension when MIME and bytes agree', () => {
    expect(
      assertAllowedFile(file('photo', 'image/jpeg', JPEG), 'document'),
    ).toBe('jpeg');
  });

  it.each([
    ['HTML renamed to .pdf', file('invoice.pdf', 'application/pdf', HTML)],
    ['an .exe renamed to .jpg', file('photo.jpg', 'image/jpeg', EXE)],
    ['SVG', file('logo.svg', 'image/svg+xml', SVG)],
    ['HTML', file('page.html', 'text/html', HTML)],
    ['a .txt that is really HTML', file('readme.txt', 'text/plain', HTML)],
    ['an executable', file('setup.exe', 'application/x-msdownload', EXE)],
    ['a PDF declared as an image', file('cmr.pdf', 'image/png', PDF)],
    ['an archive', file('docs.zip', 'application/zip', DOCX)],
  ])('refuses %s with 415', (_label, f) => {
    expect(() => assertAllowedFile(f, 'document')).toThrow(
      new UnsupportedMediaTypeException('errors.fileTypeNotSupported'),
    );
  });

  it('refuses a file over 20 MB with 413', () => {
    expect(() =>
      assertAllowedFile(
        file('big.pdf', 'application/pdf', PDF, 21 * MB),
        'document',
      ),
    ).toThrow(new PayloadTooLargeException('errors.fileTooLarge'));
  });
});

describe('assertAllowedFile — avatars / logos / group pictures', () => {
  it('accepts JPEG / PNG / HEIC', () => {
    expect(assertAllowedFile(file('a.jpg', 'image/jpeg', JPEG), 'image')).toBe(
      'jpeg',
    );
    expect(assertAllowedFile(file('a.png', 'image/png', PNG), 'image')).toBe(
      'png',
    );
    expect(assertAllowedFile(file('a.heic', 'image/heic', HEIC), 'image')).toBe(
      'heic',
    );
  });

  it('refuses a PDF, a GIF and an SVG', () => {
    for (const f of [
      file('a.pdf', 'application/pdf', PDF),
      file('a.gif', 'image/gif', Buffer.from('GIF89a')),
      file('a.svg', 'image/svg+xml', SVG),
    ]) {
      expect(() => assertAllowedFile(f, 'image')).toThrow(
        UnsupportedMediaTypeException,
      );
    }
  });

  it('caps an avatar at 10 MB', () => {
    expect(() =>
      assertAllowedFile(file('a.jpg', 'image/jpeg', JPEG, 11 * MB), 'image'),
    ).toThrow(PayloadTooLargeException);
  });
});
