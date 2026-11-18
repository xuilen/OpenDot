/**
 * Shared task utilities used by CreateTaskForm, TaskCard, and TaskDetail.
 */
import type { ScheduledTask } from '../stores/tasks';

export function groupTasksByNextRun(tasks: ScheduledTask[], timezone: string) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    dateStyle: 'full',
  });
  const sections = new Map<string, ScheduledTask[]>();
  const scheduled = tasks
    .filter(
      (task) => !task.deleted_at && task.status === 'active' && task.next_run,
    )
    .map((task) => ({ task, at: Date.parse(task.next_run!) }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((a, b) => a.at - b.at || a.task.id.localeCompare(b.task.id));
  for (const { task, at } of scheduled) {
    const date = formatter.format(at);
    const section = sections.get(date);
    if (section) section.push(task);
    else sections.set(date, [task]);
  }
  return Array.from(sections, ([title, tasks]) => ({
    key: title,
    title,
    tasks,
  }));
}

export const weekdays = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
];
export const weekOrder = [1, 2, 3, 4, 5, 6, 0];

// Only project expressions this editor can round-trip. Advanced expressions
// stay in their original spelling until the user changes them.
export function readWeekly(value: string) {
  const match =
    /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\*|1-5|[0-7](?:,[0-7])*)$/.exec(
      value.trim(),
    );
  if (!match || Number(match[1]) > 59 || Number(match[2]) > 23) return null;
  const days =
    match[3] === '*'
      ? weekOrder
      : match[3] === '1-5'
        ? weekOrder.slice(0, 5)
        : match[3].split(',').map((day) => Number(day) % 7);
  return {
    time: match[2].padStart(2, '0') + ':' + match[1].padStart(2, '0'),
    days,
  };
}

export function describeCron(value: string): string {
  const weekly = readWeekly(value);
  if (!weekly) return value;
  const days = weekOrder.filter((day) => weekly.days.includes(day));
  let label = days.map((day) => weekdays[day]).join('、');
  if (days.length === 7) label = '每天';
  else if (days.join(',') === '1,2,3,4,5') label = '周一至周五';
  return label + ' ' + weekly.time;
}

export const INTERVAL_UNITS = [
  { label: '毫秒', ms: 1 },
  { label: '秒', ms: 1000 },
  { label: '分钟', ms: 60_000 },
  { label: '小时', ms: 3_600_000 },
  { label: '天', ms: 86_400_000 },
] as const;

export const CHANNEL_OPTIONS = [
  { key: 'feishu', label: '飞书' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'qq', label: 'QQ' },
  { key: 'wechat', label: '微信' },
  { key: 'dingtalk', label: '钉钉' },
  { key: 'discord', label: 'Discord' },
  { key: 'whatsapp', label: 'WhatsApp' },
] as const;

/** Pick the largest unit that can represent the stored duration exactly. */
export function decomposeInterval(ms: string): { num: string; unitMs: string } {
  const n = Number(ms);
  if (!Number.isSafeInteger(n) || n <= 0) return { num: '', unitMs: '60000' };
  for (let i = INTERVAL_UNITS.length - 1; i >= 0; i--) {
    const unit = INTERVAL_UNITS[i];
    if (n % unit.ms === 0)
      return { num: String(n / unit.ms), unitMs: String(unit.ms) };
  }
  return { num: '', unitMs: '60000' };
}

export function formatInterval(ms: string | number): string {
  const { num, unitMs } = decomposeInterval(String(ms));
  if (!num) return String(ms);
  const unit = INTERVAL_UNITS.find((option) => String(option.ms) === unitMs)!;
  return num + ' ' + unit.label;
}

export const INTERVAL_HINT = '请输入正整数，执行间隔须在 1 分钟至 365 天之间';

export function intervalMilliseconds(
  amount: string,
  unit: string,
): string | null {
  const value = amount.trim();
  if (!/^\d+$/.test(value)) return null;
  const ms = Number(value) * Number(unit);
  return Number.isSafeInteger(ms) && ms >= 60_000 && ms <= 365 * 86_400_000
    ? String(ms)
    : null;
}

export function formatTaskStatus(
  status: 'active' | 'paused' | 'completed' | 'parsing',
  isRunning = false,
): string {
  if (isRunning) return '执行中';
  switch (status) {
    case 'active':
      return '已启用';
    case 'parsing':
      return 'AI 解析中';
    case 'paused':
      return '已暂停';
    case 'completed':
      return '已完成';
  }
}

export function formatContextMode(mode: 'group' | 'isolated'): string {
  return mode === 'isolated' ? '独立任务会话' : '主会话执行';
}

/**
 * Toggle a channel in a nullable channel list where null = "all connected".
 * Pure function — returns the new list.
 */
export function toggleNotifyChannel(
  current: string[] | null,
  key: string,
  connectedKeys: string[],
): string[] | null {
  if (current === null) {
    // Was "all connected" → uncheck this one
    return connectedKeys.filter((c) => c !== key);
  }
  if (current.includes(key)) {
    return current.filter((c) => c !== key);
  }
  const next = [...current, key];
  // If all connected channels selected, normalize back to null (= all)
  if (
    connectedKeys.length > 0 &&
    connectedKeys.every((c) => next.includes(c))
  ) {
    return null;
  }
  return next;
}
