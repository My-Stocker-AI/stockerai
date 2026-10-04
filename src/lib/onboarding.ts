export type ReportSource = 'parlevel' | 'other' | 'not_sure';

export const ONBOARDING_VERSION = 1;

export const REPORT_SOURCE_OPTIONS: Array<{
  value: ReportSource;
  title: string;
  description: string;
}> = [
  {
    value: 'parlevel',
    title: 'Parlevel',
    description: 'I export my route-picking report from Parlevel.',
  },
  {
    value: 'other',
    title: 'Another vending system',
    description: 'I have a similar route or prekitting export from another system.',
  },
  {
    value: 'not_sure',
    title: 'I am not sure',
    description: 'Help me identify the right report and submit an example.',
  },
];

export const routeFileNameExample = (routeName = 'South Route', date = 'YYYY-MM-DD') =>
  `${routeName} - ${date}.pdf`;

export const isReportSource = (value: string): value is ReportSource =>
  REPORT_SOURCE_OPTIONS.some((option) => option.value === value);

export const formatSubmissionVendor = (source: ReportSource, sourceName: string) => {
  if (source === 'parlevel') return 'Parlevel';
  const trimmed = sourceName.trim();
  return trimmed || (source === 'not_sure' ? 'Not sure' : 'Other');
};
