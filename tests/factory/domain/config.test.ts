import { describe, expect, it } from 'vitest';

import { createProductionLineConfig, defaultSectorName } from '@/features/factory/domain/config';

describe('defaultSectorName', () => {
  it('usa a linha temática de cinco setores quando stageCount === 5', () => {
    expect(defaultSectorName(0, 5)).toBe('Usinagem');
    expect(defaultSectorName(1, 5)).toBe('Tratamento superficial');
    expect(defaultSectorName(2, 5)).toBe('Pintura');
    expect(defaultSectorName(3, 5)).toBe('Inspeção');
    expect(defaultSectorName(4, 5)).toBe('Expedição');
  });

  it('usa "Setor N" genérico para outras contagens, marcando entrada/saída', () => {
    expect(defaultSectorName(0, 4)).toBe('Setor 1 (entrada)');
    expect(defaultSectorName(1, 4)).toBe('Setor 2');
    expect(defaultSectorName(2, 4)).toBe('Setor 3');
    expect(defaultSectorName(3, 4)).toBe('Setor 4 (saída)');
  });
});

describe('createProductionLineConfig', () => {
  it('gera uma seed quando nenhuma é fornecida', () => {
    const a = createProductionLineConfig();
    const b = createProductionLineConfig();
    expect(a.seed).not.toBe(b.seed);
    expect(a.seed.length).toBeGreaterThan(0);
  });

  it('usa 5 setores e horizonte de 10 rodadas por padrão', () => {
    const config = createProductionLineConfig({ seed: 'default-test' });
    expect(config.stages).toHaveLength(5);
    expect(config.rounds).toBe(10);
  });

  it('aceita de 4 a 12 setores com IDs posicionais estáveis', () => {
    const config = createProductionLineConfig({ stageCount: 12, seed: 'twelve' });
    expect(config.stages).toHaveLength(12);
    expect(config.stages.map((s) => s.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `stage-${i}`),
    );
  });

  it('trunca a hipótese em 500 caracteres', () => {
    const config = createProductionLineConfig({ seed: 'x', hypothesis: 'a'.repeat(600) });
    expect(config.hypothesis).toHaveLength(500);
  });

  it('participantNameByStage preenche o nome do participante por ID de etapa', () => {
    const config = createProductionLineConfig({
      stageCount: 4,
      seed: 'x',
      participantNameByStage: { 'stage-1': 'Ana' },
    });
    expect(config.stages[1].participantName).toBe('Ana');
    expect(config.stages[0].participantName).toBe('');
  });
});
