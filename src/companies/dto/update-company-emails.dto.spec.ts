import { ValidationPipe } from '@nestjs/common';
import { UpdateCompanyEmailsDto } from './update-company-emails.dto';
import { UpsertRatingDto } from 'src/users/dto/upsert-rating.dto';

// Same pipe options as main.ts. Regression for the C9 mass assignment: the
// body used to be an inline type, which ValidationPipe never touches.
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = (metatype: new () => object, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('PATCH /companies/emails body', () => {
  it('strips Prisma nested writes and unknown fields', async () => {
    const out = await run(UpdateCompanyEmailsDto, {
      hrEmail: 'hr@acme.co',
      users: { update: { where: { id: 'me' }, data: { role: 'ADMIN' } } },
      isActive: true,
    });
    expect(out).toEqual({ hrEmail: 'hr@acme.co' });
  });

  it('rejects a non-email value', async () => {
    await expect(
      run(UpdateCompanyEmailsDto, { hrEmail: { set: 'x' } }),
    ).rejects.toBeDefined();
  });

  it('accepts null / empty string to clear a contact', async () => {
    await expect(
      run(UpdateCompanyEmailsDto, { hrEmail: '', accountingEmail: null }),
    ).resolves.toEqual({ hrEmail: '', accountingEmail: null });
  });
});

describe('POST /users/:id/ratings body', () => {
  it('accepts a 1–5 integer score', async () => {
    await expect(
      run(UpsertRatingDto, { score: 4, comment: 'ok' }),
    ).resolves.toEqual({
      score: 4,
      comment: 'ok',
    });
  });

  it('rejects out-of-range or non-numeric scores', async () => {
    for (const score of [0, 6, 2.5, '5', { gt: 0 }]) {
      await expect(run(UpsertRatingDto, { score })).rejects.toBeDefined();
    }
  });
});
