// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { CronScheduleEditor } from '../web/src/components/tasks/CronScheduleEditor';
import { groupTasksByNextRun } from '../web/src/utils/task-utils';
import { api } from '../web/src/api/client';
import type { ScheduledTask } from '../web/src/stores/tasks';

test('agenda orders persisted triggers by instant and groups them by displayed local day', () => {
  const task = (
    id: string,
    at: string | null,
    patch: Partial<ScheduledTask> = {},
  ) => ({ id, next_run: at, status: 'active', ...patch }) as ScheduledTask;
  const rows = [
    task('third', '2026-03-07T05:30:00Z'),
    task('second', '2026-03-07T03:00:00Z'),
    task('first', '2026-03-06T22:00:00Z'),
    task('paused', '2026-03-06', { status: 'paused' }),
    task('trash', '2026-03-06', { deleted_at: '2026-03-01' }),
    task('missing', null),
    task('bad', 'invalid'),
  ];
  expect(
    groupTasksByNextRun(rows, 'America/New_York').map((s) =>
      s.tasks.map((t) => t.id),
    ),
  ).toEqual([['first', 'second'], ['third']]);
  expect(
    groupTasksByNextRun(rows, 'UTC').map((s) => s.tasks.map((t) => t.id)),
  ).toEqual([['first'], ['second', 'third']]);
});

test('changing weekdays invalidates a pending preview and keeps custom expressions until edited', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const globals = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const actEnv = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  let finish!: (result: unknown) => void;
  const get = vi.spyOn(api, 'get').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  function Editor() {
    const [value, setValue] = useState('@daily');
    return <CronScheduleEditor value={value} onChange={setValue} />;
  }
  const expression = () =>
    container.querySelector<HTMLInputElement>(
      'input[aria-label="Cron 表达式"]',
    )!.value;
  const click = (label: string) =>
    act(async () => {
      const button = [...container.querySelectorAll('button')].find(
        (b) => b.textContent === label,
      );
      expect(button).toBeDefined();
      button!.click();
    });
  try {
    await act(async () => root.render(<Editor />));
    expect(expression()).toBe('@daily');
    await click('预览接下来 3 次');
    expect(get).toHaveBeenCalledWith(
      '/api/tasks/schedule-preview?expression=%40daily',
    );
    await click('改为工作日 09:00');
    await click('周三');
    expect(expression()).toBe('0 9 * * 1,2,4,5');
    await act(async () =>
      finish({ timezone: 'UTC', occurrences: ['2026-03-06T09:00:00Z'] }),
    );
    expect(container.querySelector('time')).toBeNull();
    await click('预览接下来 3 次');
    await act(async () =>
      finish({ timezone: 'UTC', occurrences: ['2026-03-09T09:00:00Z'] }),
    );
    expect(container.querySelector('time')?.dateTime).toBe(
      '2026-03-09T09:00:00Z',
    );
    expect(container.textContent).toContain('预计触发时间（UTC）');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    get.mockRestore();
    globals.IS_REACT_ACT_ENVIRONMENT = actEnv;
  }
});
