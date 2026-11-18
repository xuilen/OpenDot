import { useState } from 'react';
import { api } from '../../api/client';
import { useTasksStore } from '../../stores/tasks';
import { extractErrorMessage } from '../../utils/error';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

// Only project expressions this editor can round-trip. Advanced expressions
// stay in their original spelling until the user changes them.
function readWeekly(value: string) {
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

type Preview = { timezone: string; occurrences: string[] };

function CronPreview({ expression }: { expression: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      setPreview(
        await api.get<Preview>(
          '/api/tasks/schedule-preview?expression=' +
            encodeURIComponent(expression),
        ),
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void load()}
        disabled={!expression || busy}
      >
        {busy ? '正在计算…' : '预览接下来 3 次'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      {preview && (
        <div role="status" className="text-xs text-muted-foreground">
          <p>预计触发时间（{preview.timezone}）</p>
          <ol className="mt-1 space-y-1">
            {preview.occurrences.map((iso) => (
              <li key={iso}>
                <time dateTime={iso}>
                  {new Date(iso).toLocaleString('zh-CN', {
                    timeZone: preview.timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </time>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function CronScheduleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const timezone = useTasksStore((s) => s.timezone);
  const [draftTime, setDraftTime] = useState('09:00');
  const weekly = readWeekly(value);
  const time = weekly?.time ?? draftTime;
  const days = weekly?.days ?? [];
  function update(time: string, selected: number[]) {
    const [hour, minute] = time.split(':').map(Number);
    const ordered = weekOrder.filter((day) => selected.includes(day));
    const field = ordered.length === 7 ? '*' : ordered.join(',');
    onChange(field ? `${minute} ${hour} * * ${field}` : '');
  }
  return (
    <div className="space-y-2">
      {weekly || !value.trim() ? (
        <fieldset className="space-y-2">
          <legend className="text-xs text-muted-foreground">每周执行日</legend>
          <div className="flex flex-wrap gap-1">
            {weekOrder.map((day) => (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={days.includes(day) ? 'default' : 'outline'}
                aria-pressed={days.includes(day)}
                onClick={() => {
                  setDraftTime(time);
                  update(
                    time,
                    days.includes(day)
                      ? days.filter((d) => d !== day)
                      : [...days, day],
                  );
                }}
              >
                {weekdays[day]}
              </Button>
            ))}
          </div>
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            执行时间（{timezone || '服务器时区'}）
            <Input
              type="time"
              className="w-auto"
              value={time}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                setDraftTime(next);
                if (days.length) update(next, days);
              }}
            />
          </label>
        </fieldset>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange('0 9 * * 1-5')}
        >
          改为工作日 09:00
        </Button>
      )}
      <Input
        aria-label="Cron 表达式"
        className="font-mono"
        value={value}
        placeholder="例如 0 9 * * 1-5 或 @daily"
        onChange={(e) => onChange(e.target.value)}
      />
      <CronPreview key={value.trim()} expression={value.trim()} />
    </div>
  );
}
