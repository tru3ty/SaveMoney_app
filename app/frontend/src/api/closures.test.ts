import { describe, expect, it } from 'vitest';
import { initialData, PREV_PERIOD } from '../data/mock';
import { planClosures } from './closures';

const budget = () => structuredClone(initialData);
const periodEnvelopes = (data: ReturnType<typeof budget>) =>
  data.envelopes.filter((item) => item.periodId === PREV_PERIOD);
const burnAll = (data: ReturnType<typeof budget>) => Object.fromEntries(
  periodEnvelopes(data).map(({ id }) => [id, { decision: 'burn' as const, goalId: null }]),
);

describe('проверка пакета решений до отправки', () => {
  it('выбирает только оставшиеся конверты после частичного сохранения', () => {
    const data = budget();
    const [first] = periodEnvelopes(data);
    data.closures.push({ envelopeId: first.id, decision: 'burn', leftoverAmount: 0, goalId: null });
    const result = planClosures(data, burnAll(data));
    expect(result.periodId).toBe(PREV_PERIOD);
    expect(result.decisions).toHaveLength(periodEnvelopes(data).length - 1);
    expect(result.decisions.every((row) => row.envelopeId !== first.id)).toBe(true);
  });

  it('отклоняет перевод без цели даже при наличии остальных решений', () => {
    const data = budget();
    const [first] = periodEnvelopes(data);
    expect(() => planClosures(data, {
      ...burnAll(data), [first.id]: { decision: 'to_goal', goalId: null },
    })).toThrow('выберите цель');
  });

  it('отклоняет двойной перенос родительского и дочернего конвертов', () => {
    const data = budget();
    const parent = periodEnvelopes(data).find((item) => item.categoryId === 'food')!;
    const child = { ...parent, id: 'groceries-envelope', categoryId: 'groceries' };
    data.envelopes.push(child, { ...child, id: 'active-groceries-envelope', periodId: '2026-11' });
    const carry = { decision: 'carry_over' as const, goalId: null };
    expect(() => planClosures(data, {
      ...burnAll(data), [parent.id]: carry, [child.id]: carry,
    })).toThrow('пересекающихся конвертов');
  });
});
