import {
  attachmentFileType,
  parseDurationMs,
  parseWaveform,
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

  it('caps an absurd claim at 65 seconds (the apps stop at 60)', () => {
    expect(parseDurationMs('99999999')).toBe(65000);
    expect(parseDurationMs('60400')).toBe(60400);
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

describe('parseWaveform', () => {
  it('keeps well-formed loudness values', () => {
    expect(parseWaveform('0,10,40,100,55,3,8,20')).toBe('0,10,40,100,55,3,8,20');
  });

  it('rounds decimals and trims blanks', () => {
    expect(parseWaveform('0, 10.4 ,40.6,100,55,3,8,20')).toBe(
      '0,10,41,100,55,3,8,20',
    );
  });

  it.each([
    undefined,
    null,
    42,
    '',
    '1,2,3', // too few bars
    Array(200).fill('5').join(','), // too many
    '0,10,40,101,55,3,8,20', // out of range
    '0,10,-4,10,55,3,8,20', // negative
    '0,10,abc,10,55,3,8,20',
    '0;10;40;10;55;3;8;20',
  ])('gives null for %p', (raw) => {
    expect(parseWaveform(raw)).toBeNull();
  });
});
