export type ReminderOption = {
  label: string;
  value: number | null; // null = 通知なし, 0 = 期限ちょうど, N = N分前
};

export const REMINDER_OPTIONS: ReminderOption[] = [
  { label: '通知なし', value: null },
  { label: '期限ちょうど', value: 0 },
  { label: '10分前', value: 10 },
  { label: '30分前', value: 30 },
  { label: '1時間前', value: 60 },
  { label: '1日前', value: 1440 },
];

export function getReminderLabel(minutes: number): string {
  const opt = REMINDER_OPTIONS.find((o) => o.value === minutes);
  return opt?.label ?? `${minutes}分前`;
}
