import { describe, expect, it } from 'vitest';

import { formatSeconds, median, summarize } from '../../scripts/calibration/stats';

describe('formatSeconds', () => {
  it('formata segundos positivos como mm:ss', () => {
    expect(formatSeconds(90)).toBe('1:30');
    expect(formatSeconds(5)).toBe('0:05');
  });

  it('formata negativos com um único sinal na frente — não "mm:-ss" (calibração de pares com/sem variabilidade)', () => {
    expect(formatSeconds(-90)).toBe('-1:30');
    expect(formatSeconds(-5)).toBe('-0:05');
    expect(formatSeconds(-92)).toBe('-1:32');
  });

  it('nulo vira travessão', () => {
    expect(formatSeconds(null)).toBe('—');
  });

  it('zero não ganha sinal', () => {
    expect(formatSeconds(0)).toBe('0:00');
  });
});

describe('median / summarize', () => {
  it('mediana de lista ímpar e par', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('summarize de lista vazia', () => {
    expect(summarize([])).toEqual({ count: 0, median: null, min: null, max: null });
  });

  it('summarize aceita valores negativos (diferenças com − sem)', () => {
    const result = summarize([-10, 5, -3]);
    expect(result.count).toBe(3);
    expect(result.min).toBe(-10);
    expect(result.max).toBe(5);
  });
});
