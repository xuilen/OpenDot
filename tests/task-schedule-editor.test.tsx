// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { CronScheduleEditor } from '../web/src/components/tasks/CronScheduleEditor';
import {
  groupTasksByNextRun,
  describeCron,
  decomposeInterval,
  intervalMilliseconds,
  formatInterval,
} from '../web/src/utils/task-utils';
import { api } from '../web/src/api/client';
import { TaskDetail } from '../web/src/components/tasks/TaskDetail';
import { MemoryRouter } from 'react-router-dom';
import { useGroupsStore } from '../web/src/stores/groups';
import { useTasksStore, type ScheduledTask } from '../web/src/stores/tasks';

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

test('stored intervals round-trip at millisecond precision across the supported range', () => {
  for (const ms of [
    '60000',
    '90000',
    '90001',
    '3600000',
    '86400000',
    '31536000000',
  ]) {
    const draft = decomposeInterval(ms);
    expect(intervalMilliseconds(draft.num, draft.unitMs)).toBe(ms);
  }
  expect(formatInterval(90000)).toBe('90 秒');
  expect(formatInterval(90001)).toBe('90001 毫秒');
  expect(decomposeInterval('15 9 * * 1').num).toBe('');
});

test('interval submission rejects partial, missing and out-of-range values', () => {
  for (const value of ['', '1.5', '2x', '-2', '0', '1e3', '526001']) {
    expect(intervalMilliseconds(value, '60000')).toBeNull();
  }
  expect(intervalMilliseconds('59', '1000')).toBeNull();
  expect(intervalMilliseconds('60', '1000')).toBe('60000');
  expect(intervalMilliseconds('365', '86400000')).toBe('31536000000');
});

test('weekly summaries normalize weekday order and preserve advanced expressions verbatim', () => {
  expect(describeCron('5 9 * * 3,1,3')).toBe('周一、周三 09:05');
  expect(describeCron('0 9 * * 7,6')).toBe('周六、周日 09:00');
  expect(describeCron('0 8 * * 1-5')).toBe('周一至周五 08:00');
  expect(describeCron('59 23 * * *')).toBe('每天 23:59');
  for (const cron of ['@daily', '0 */2 * * *', '0 9 1 * *', '0 0 9 * * 1']) {
    expect(describeCron(cron)).toBe(cron);
  }
});

test('saving task details preserves a 90-second interval and accepts an exact replacement', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const root = createRoot(target);
  const tasks = useTasksStore.getState();
  const groups = useGroupsStore.getState();
  const updateTask = vi.fn().mockResolvedValue(undefined);
  const request = vi.spyOn(api, 'get').mockResolvedValue({});
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useTasksStore.setState({
    updateTask,
    loadLogs: vi.fn().mockResolvedValue(undefined),
  });
  useGroupsStore.setState({ loadGroups: vi.fn().mockResolvedValue(undefined) });
  const task: ScheduledTask = {
    id: 'sample',
    group_folder: 'sample',
    chat_jid: 'web:sample',
    prompt: '检查提醒',
    schedule_type: 'interval',
    schedule_value: '90000',
    execution_mode: 'container',
    context_mode: 'isolated',
    status: 'paused',
    next_run: null,
    created_at: '2026-03-01T00:00:00Z',
  };
  const click = async (label: string) => {
    const button = Array.from(target.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === label,
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TaskDetail task={task} />
        </MemoryRouter>,
      ),
    );
    await click('编辑');
    const input = () =>
      target.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(input().value).toBe('90');
    await click('保存');
    expect(updateTask).not.toHaveBeenCalled();
    await click('编辑');
    await act(async () => {
      const field = input();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(field, '91');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('保存');
    expect(updateTask).toHaveBeenCalledWith('sample', {
      schedule_value: '91000',
    });
  } finally {
    await act(async () => root.unmount());
    target.remove();
    request.mockRestore();
    useTasksStore.setState(tasks, true);
    useGroupsStore.setState(groups, true);
    vi.unstubAllGlobals();
  }
});
