import { describe, expect, it } from 'vitest';

import { generateComparisonFeedback } from '@/features/trail/application/feedback';
import type { ComparisonResult } from '@/features/trail/domain/metrics';

function baseComparison(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    comparable: true,
    issues: [],
    changes: {
      orderChanged: false,
      loadChanged: false,
      referenceOrder: ['p1', 'p2'],
      currentOrder: ['p1', 'p2'],
      loadDeltaKgByCharacter: {},
    },
    improvementPct: null,
    totalTimeDeltaSec: null,
    maxSpreadDeltaM: null,
    ...overrides,
  };
}

describe('generateComparisonFeedback — não comparável', () => {
  it('lista os motivos de incomparabilidade e não calcula percentual', () => {
    const comparison = baseComparison({ comparable: false, issues: ['seed', 'scenario'] });
    const sentences = generateComparisonFeedback(comparison);

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain('Seed diferente');
    expect(sentences[0]).toContain('Cenário diferente');
    expect(sentences[0]).toMatch(/sem percentual de melhoria/i);
  });
});

describe('generateComparisonFeedback — timeout', () => {
  it('avisa que não há tempo total sem inventar um valor', () => {
    const comparison = baseComparison({ comparable: true, improvementPct: null });
    const sentences = generateComparisonFeedback(comparison);

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatch(/não chegou a um resultado concluído/i);
  });
});

describe('generateComparisonFeedback — melhoria', () => {
  it('segue o formato do exemplo do guia: tempo caiu X%, dispersão aumentou Y m', () => {
    const comparison = baseComparison({ improvementPct: 30.1, maxSpreadDeltaM: 45 });
    const sentences = generateComparisonFeedback(comparison);

    expect(sentences[0]).toBe('O tempo caiu 30.1%, enquanto a dispersão máxima aumentou 45 m.');
  });

  it('usa "subiu" quando o tempo piora', () => {
    const comparison = baseComparison({ improvementPct: -12, maxSpreadDeltaM: -10 });
    const sentences = generateComparisonFeedback(comparison);

    expect(sentences[0]).toContain('O tempo subiu 12.0%');
    expect(sentences[0]).toContain('dispersão máxima diminuiu 10 m');
  });

  it('trata tempo igual sem forçar um sinal', () => {
    const comparison = baseComparison({ improvementPct: 0, maxSpreadDeltaM: 0 });
    const sentences = generateComparisonFeedback(comparison);

    expect(sentences[0]).toBe('O tempo total não mudou entre as duas tentativas.');
  });

  it('nunca declara solução ótima', () => {
    const comparison = baseComparison({ improvementPct: 99, maxSpreadDeltaM: -900 });
    const sentences = generateComparisonFeedback(comparison);

    for (const sentence of sentences) {
      expect(sentence.toLowerCase()).not.toContain('ótima');
      expect(sentence.toLowerCase()).not.toContain('melhor solução');
    }
  });
});

describe('generateComparisonFeedback — múltiplas variáveis', () => {
  it('avisa quando ordem e carga mudaram juntas, sem atribuir causa', () => {
    const comparison = baseComparison({
      improvementPct: 20,
      maxSpreadDeltaM: -50,
      changes: {
        orderChanged: true,
        loadChanged: true,
        referenceOrder: ['p1', 'p2'],
        currentOrder: ['p2', 'p1'],
        loadDeltaKgByCharacter: { p1: -3, p2: 3 },
      },
    });

    const sentences = generateComparisonFeedback(comparison);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]).toMatch(/não dá para isolar qual/i);
    expect(sentences[1]).toMatch(/uma variável de cada vez/i);
  });

  it('não avisa sobre múltiplas variáveis quando só uma mudou', () => {
    const comparison = baseComparison({
      improvementPct: 20,
      maxSpreadDeltaM: -50,
      changes: {
        orderChanged: false,
        loadChanged: true,
        referenceOrder: ['p1', 'p2'],
        currentOrder: ['p1', 'p2'],
        loadDeltaKgByCharacter: { p1: -3, p2: 3 },
      },
    });

    const sentences = generateComparisonFeedback(comparison);
    expect(sentences).toHaveLength(1);
  });
});
