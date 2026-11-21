import type Anthropic from '@anthropic-ai/sdk';
import heicConvert from 'heic-convert';
import sharp from 'sharp';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

/** An order as the manager handed it over: a file, or text pasted from a mail. */
export type OrderSource =
  | { kind: 'file'; buffer: Buffer; fileName: string; mimeType: string }
  | { kind: 'text'; text: string };

export class UnsupportedOrderInput extends Error {}

/** Longest side of a photo sent to the model: plenty for reading text. */
const IMAGE_MAX_SIDE = 2000;
/** Text inputs past this are refused rather than silently cut. */
const MAX_TEXT_CHARS = 200_000;

const ext = (name: string) => /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase();

/**
 * Turns the order into content blocks for the model. PDFs and photos go as
 * they are (the model reads both text and page images — tables where loading
 * and unloading sit side by side survive that); Word becomes HTML so its
 * tables keep their columns; Excel becomes tab-separated rows per sheet.
 * Only the format the upload policy already let through arrives here.
 */
export async function toContentBlocks(
  source: OrderSource,
): Promise<{ blocks: ContentBlock[]; isPdf: boolean }> {
  if (source.kind === 'text') {
    return { blocks: [textBlock(source.text, 'pasted text')], isPdf: false };
  }

  const e = ext(source.fileName);
  const mime = source.mimeType.toLowerCase();

  if (e === 'pdf' || mime === 'application/pdf') {
    return {
      blocks: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: source.buffer.toString('base64'),
          },
        },
      ],
      isPdf: true,
    };
  }

  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(e ?? '')
  ) {
    return { blocks: [await imageBlock(source.buffer, mime, e)], isPdf: false };
  }

  if (e === 'docx') {
    const { value } = await mammoth.convertToHtml(
      { buffer: source.buffer },
      // Pictures inside the order (logos, stamps) carry nothing for the trip.
      {
        convertImage: mammoth.images.imgElement(() =>
          Promise.resolve({ src: '' }),
        ),
      },
    );
    return {
      blocks: [textBlock(value, 'Word document as HTML')],
      isPdf: false,
    };
  }

  if (e === 'xlsx') {
    return {
      blocks: [textBlock(await xlsxToText(source.buffer), 'Excel workbook')],
      isPdf: false,
    };
  }

  if (e === 'txt' || e === 'csv' || mime.startsWith('text/')) {
    return {
      blocks: [textBlock(source.buffer.toString('utf8'), 'text file')],
      isPdf: false,
    };
  }

  throw new UnsupportedOrderInput(source.fileName);
}

function textBlock(text: string, label: string): ContentBlock {
  const body = text.trim();
  if (!body) throw new UnsupportedOrderInput('empty');
  if (body.length > MAX_TEXT_CHARS) throw new UnsupportedOrderInput('too long');
  return {
    type: 'text',
    text: `<order source="${label}">\n${body}\n</order>`,
  };
}

/**
 * Any photo → JPEG of at most IMAGE_MAX_SIDE px: iPhone HEIC is not an input
 * format the API takes, and a 12 MP phone photo is past its per-image size.
 */
async function imageBlock(
  buffer: Buffer,
  mime: string,
  e: string | undefined,
): Promise<ContentBlock> {
  let input = buffer;
  if (/hei[cf]/.test(mime) || e === 'heic' || e === 'heif') {
    input = Buffer.from(
      await heicConvert({ buffer, format: 'JPEG', quality: 0.9 }),
    );
  }
  const jpeg = await sharp(input)
    .rotate() // honour EXIF orientation: phone photos of paper are often sideways
    .resize(IMAGE_MAX_SIDE, IMAGE_MAX_SIDE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: jpeg.toString('base64'),
    },
  };
}

async function xlsxToText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // exceljs types predate Node's generic Buffer; the bytes are what it reads.
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const parts: string[] = [];
  wb.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(cellText).join('\t'));
    });
    if (rows.length) parts.push(`## Sheet: ${sheet.name}\n${rows.join('\n')}`);
  });
  return parts.join('\n\n');
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).replace(/\s+/g, ' ');
}
