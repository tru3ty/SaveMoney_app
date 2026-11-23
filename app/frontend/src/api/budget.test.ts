import { describe, expect, it, vi } from 'vitest';
import { createBudgetApi, toBudgetData, type Snapshot } from './budget';

const snapshot: Snapshot = {
  schemaVersion: 1,
  categories: [],
  incomeSources: [],
  obligations: [],
  goals: [],
  periodClosures: [],
  transactions: [],
  settings: {},
  periods: [{ id: 'remote-period', year: 2026, month: 11, startDate: '2026-11-01', endDate: '2026-11-30', status: 'active' }],
  envelopes: [{ id: 'remote-envelope', periodId: 'remote-period', categoryId: 'food', limitAmount: 1000, carryOverAmount: 0 }],
};

describe('контракт REST', () => {
  it('оставляет серверные идентификаторы в снимке и показывает календарные периоды в интерфейсе', async () => {
    const transport = vi.fn(async () => Response.json(snapshot));
    const api = createBudgetApi(transport);
    const result = await api.load();
    expect(transport.mock.calls[0]).toEqual(['/api/v1/snapshots/current', expect.objectContaining({ cache: 'no-store' })]);
    expect(toBudgetData(result).envelopes[0]).toMatchObject({ id: 'remote-envelope', periodId: '2026-11' });
    expect(result.periods[0]?.id).toBe('remote-period');
  });

  it('передаёт серверную ошибку и поддерживает ответы без тела', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Период уже закрыт' } }, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createBudgetApi(transport);
    await expect(api.write('PATCH', '/transactions/tx', { amount: 100 })).rejects.toMatchObject({
      status: 409, message: 'Период уже закрыт',
    });
    await expect(api.write('DELETE', '/transactions/tx')).resolves.toBeUndefined();
  });

  it('сообщает об ошибке, если вместо снимка пришла страница фронтенда', async () => {
    const api = createBudgetApi(async () => new Response('<!doctype html>', { status: 200 }));
    await expect(api.load()).rejects.toThrow('Сервер вернул некорректный ответ');
  });
});
