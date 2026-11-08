import {
  attachmentFileType,
  parseDurationMs,
  voicePreview,
  voicePreviewSql,
} from './attachment-kind';

describe('attachmentFileType', () => {
  it('tells photos, voice messages and documents apart', () => {
    expect(attachmentFileType('image/jpeg')).toBe('PHOTO');
    expect(attachmentFileType('audio/mp4')).toBe('AUDIO');
    expect(attachmentFileType('audio/webm')).toBe('AUDIO');
    expect(attachmentFileType('application/pdf')).toBe('DOCUMENT');
    expect(attachmentFileType('')).toBe('DOCUMENT');
  });
});

describe('parseDurationMs', () => {
  it('parses a multipart string into whole milliseconds', () => {
    expect(parseDurationMs('7421')).toBe(7421);
    expect(parseDurationMs('7421.6')).toBe(7422);
  });

  it.each([undefined, null, '', 'abc', '0', '-5', NaN, Infinity])(
    'gives null for %p',
    (raw) => {
      expect(parseDurationMs(raw)).toBeNull();
    },
  );

  it('caps an absurd claim at 10 minutes', () => {
    expect(parseDurationMs('99999999')).toBe(600000);
  });
});

describe('voicePreview', () => {
  it('shows the length as m:ss', () => {
    expect(voicePreview(7000)).toBe('🎤 0:07');
    expect(voicePreview(83000)).toBe('🎤 1:23');
    expect(voicePreview(300000)).toBe('🎤 5:00');
  });

  it('is just the microphone when the length is unknown', () => {
    expect(voicePreview(null)).toBe('🎤');
    expect(voicePreview(undefined)).toBe('🎤');
  });
});

describe('voicePreviewSql', () => {
  it('builds a CASE on the given alias', () => {
    const sql = voicePreviewSql('td').sql;
    expect(sql).toContain('td."durationMs"');
    expect(sql).toContain('CASE WHEN');
  });
});
