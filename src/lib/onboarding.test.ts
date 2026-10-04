import { describe, expect, it } from 'vitest';
import {
  formatSubmissionVendor,
  isReportSource,
  REPORT_SOURCE_OPTIONS,
  routeFileNameExample,
} from './onboarding';

describe('onboarding report-source rules', () => {
  it('offers Parlevel, another system, and not sure as mutually exclusive choices', () => {
    expect(REPORT_SOURCE_OPTIONS.map((option) => option.value)).toEqual([
      'parlevel',
      'other',
      'not_sure',
    ]);
  });

  it('preserves a named non-Parlevel system for the review queue', () => {
    expect(formatSubmissionVendor('other', '  Nayax  ')).toBe('Nayax');
    expect(formatSubmissionVendor('not_sure', '')).toBe('Not sure');
  });

  it('uses an unambiguous route and ISO-date filename example', () => {
    expect(routeFileNameExample('South Route', '2026-10-03')).toBe('South Route - 2026-10-03.pdf');
  });

  it('rejects unknown stored source values', () => {
    expect(isReportSource('parlevel')).toBe(true);
    expect(isReportSource('unknown-vendor')).toBe(false);
  });
});
