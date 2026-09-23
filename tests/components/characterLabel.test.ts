import { describe, expect, it } from 'vitest';

import { characterLabel } from '@/features/trail/components/characterLabel';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { SCENARIO_A } from '@/features/trail/scenarios';

describe('characterLabel', () => {
  it('sem nome de participante, usa só o identificador do personagem (sessões antigas, fallback)', () => {
    const config = createAttemptConfig(SCENARIO_A);
    expect(characterLabel(config, 'p1')).toBe('Caminhante 1');
  });

  it('com nome de participante, o nome vem primeiro e o identificador continua junto', () => {
    const config = createAttemptConfig(SCENARIO_A, { participantByCharacter: { p1: 'Ana' } });
    expect(characterLabel(config, 'p1')).toBe('Ana · Caminhante 1');
  });

  it('nomes em branco contam como ausentes', () => {
    const config = createAttemptConfig(SCENARIO_A, { participantByCharacter: { p1: '   ' } });
    expect(characterLabel(config, 'p1')).toBe('Caminhante 1');
  });

  it('nomes repetidos continuam distinguíveis pelo identificador secundário', () => {
    const config = createAttemptConfig(SCENARIO_A, {
      participantByCharacter: { p1: 'Ana', p2: 'Ana' },
    });
    expect(characterLabel(config, 'p1')).toBe('Ana · Caminhante 1');
    expect(characterLabel(config, 'p2')).toBe('Ana · Caminhante 2');
    expect(characterLabel(config, 'p1')).not.toBe(characterLabel(config, 'p2'));
  });

  it('um id de personagem desconhecido cai no próprio id, sem lançar', () => {
    const config = createAttemptConfig(SCENARIO_A);
    expect(characterLabel(config, 'inexistente')).toBe('inexistente');
  });
});
