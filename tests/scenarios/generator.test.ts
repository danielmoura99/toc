import { describe, expect, it } from 'vitest';

import {
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  MAX_GENERATION_ATTEMPTS,
  buildCandidateSpec,
  buildReserveSpec,
  evaluateGeneratedScenario,
  generateExpedition,
} from '@/features/trail/scenarios/generator';
import { buildScenario } from '@/features/trail/scenarios/builder';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { conservesItems, validateConfig } from '@/features/trail/domain/validation';
import { MAX_LOAD_FACTOR } from '@/features/trail/domain/types';
import { buildSessionPayload } from '@/features/trail/persistence/sessionPayload';
import { validateSessionPayload } from '@/features/trail/persistence/schema';

/** Tamanhos representativos: os dois extremos e alguns pontos intermediários. */
const REPRESENTATIVE_SIZES = [MIN_PARTY_SIZE, 5, 6, 8, MAX_PARTY_SIZE];

describe('tamanho do grupo', () => {
  it('rejeita tamanhos abaixo do mínimo', () => {
    expect(() => buildCandidateSpec('seed', MIN_PARTY_SIZE - 1)).toThrow();
    expect(() => buildReserveSpec(MIN_PARTY_SIZE - 1)).toThrow();
  });

  it('rejeita tamanhos acima do máximo', () => {
    expect(() => buildCandidateSpec('seed', MAX_PARTY_SIZE + 1)).toThrow();
    expect(() => buildReserveSpec(MAX_PARTY_SIZE + 1)).toThrow();
  });

  it('rejeita tamanhos não inteiros', () => {
    expect(() => buildCandidateSpec('seed', 6.5)).toThrow();
  });

  it('aceita os dois extremos do intervalo', () => {
    expect(() => buildCandidateSpec('seed', MIN_PARTY_SIZE)).not.toThrow();
    expect(() => buildCandidateSpec('seed', MAX_PARTY_SIZE)).not.toThrow();
  });

  it('generateExpedition rejeita um tamanho fora do intervalo', async () => {
    await expect(generateExpedition(MIN_PARTY_SIZE - 1, 'seed')).rejects.toThrow();
    await expect(generateExpedition(MAX_PARTY_SIZE + 1, 'seed')).rejects.toThrow();
  });

  for (const size of REPRESENTATIVE_SIZES) {
    it(`buildCandidateSpec(seed, ${size}) produz exatamente ${size} personagens`, () => {
      const spec = buildCandidateSpec('seed-fixo', size);
      expect(spec.characters).toHaveLength(size);
      expect(spec.initialOrder).toHaveLength(size);
      expect(new Set(spec.initialOrder).size).toBe(size);
    });
  }
});

describe('reprodutibilidade — a mesma seed sorteia sempre a mesma expedição', () => {
  it('buildCandidateSpec é determinístico para a mesma seed e tamanho', () => {
    const a = buildCandidateSpec('seed-abc', 7);
    const b = buildCandidateSpec('seed-abc', 7);
    expect(a).toEqual(b);
  });

  it('seeds diferentes produzem especificações diferentes', () => {
    const a = buildCandidateSpec('seed-abc', 7);
    const b = buildCandidateSpec('seed-xyz', 7);
    expect(a).not.toEqual(b);
  });

  it('generateExpedition com seedOverride é determinístico', async () => {
    const first = await generateExpedition(6, 'seed-reproduzir');
    const second = await generateExpedition(6, 'seed-reproduzir');

    expect(second.scenario).toEqual(first.scenario);
    expect(second.usedReserve).toBe(first.usedReserve);
    expect(second.attempts).toBe(first.attempts);
  });

  it('a ordem sorteada é uma permutação dos ids dos personagens, não necessariamente a identidade', () => {
    // Várias seeds: ao menos uma deve produzir uma ordem diferente da ordem de
    // criação dos personagens, confirmando que o embaralhamento de fato roda.
    const creationOrder = buildCandidateSpec('qualquer', 6).characters.map((character) => character.id);
    const shuffledSomewhere = Array.from({ length: 10 }, (_, i) => buildCandidateSpec(`seed-${i}`, 6)).some(
      (spec) => spec.initialOrder.join(',') !== creationOrder.join(','),
    );
    expect(shuffledSomewhere).toBe(true);
  });
});

describe('geração assíncrona não bloqueante', () => {
  it('resolve dentro do orçamento de tentativas e nunca excede MAX_GENERATION_ATTEMPTS', async () => {
    const result = await generateExpedition(6, 'seed-orcamento');
    expect(result.attempts).toBeGreaterThan(0);
    expect(result.attempts).toBeLessThanOrEqual(MAX_GENERATION_ATTEMPTS);
  });

  for (const size of REPRESENTATIVE_SIZES) {
    it(`gera uma expedição válida para ${size} pessoas sem travar (seed fixa)`, async () => {
      const result = await generateExpedition(size, `seed-tamanho-${size}`);
      expect(result.scenario.characters).toHaveLength(size);
      expect(evaluateGeneratedScenario(result.scenario).ok).toBe(true);
    });
  }
});

describe('configuração de reserva — pronta para cada tamanho de grupo', () => {
  for (let size = MIN_PARTY_SIZE; size <= MAX_PARTY_SIZE; size += 1) {
    it(`a reserva de ${size} pessoas já é uma configuração adequada ao treino`, () => {
      const scenario = buildScenario(buildReserveSpec(size));
      const check = evaluateGeneratedScenario(scenario);
      expect(check.ok, check.reason).toBe(true);
    });
  }

  it('a reserva é determinística — não sorteia nada', () => {
    const a = buildReserveSpec(9);
    const b = buildReserveSpec(9);
    expect(a).toEqual(b);
  });
});

describe('propriedades físicas preservadas do motor existente', () => {
  for (const size of REPRESENTATIVE_SIZES) {
    it(`maxLoadKg = ${MAX_LOAD_FACTOR} × referenceLoadKg para todo personagem gerado (${size} pessoas)`, () => {
      const scenario = buildScenario(buildCandidateSpec(`seed-carga-${size}`, size));
      for (const character of scenario.characters) {
        expect(character.maxLoadKg).toBe(MAX_LOAD_FACTOR * character.referenceLoadKg);
      }
    });

    it(`a configuração inicial gerada é fisicamente válida (${size} pessoas)`, () => {
      const scenario = buildScenario(buildCandidateSpec(`seed-validade-${size}`, size));
      const config = createAttemptConfig(scenario);
      const result = validateConfig(config);
      expect(result.valid, JSON.stringify(result.issues)).toBe(true);
    });

    it(`itens são conservados ao redistribuir (${size} pessoas)`, () => {
      const scenario = buildScenario(buildCandidateSpec(`seed-conservacao-${size}`, size));
      const before = createAttemptConfig(scenario);
      // Move todos os itens do primeiro da fila para o último — mesma carga
      // total, mesmos ids, só o dono muda; conservesItems não deve reprovar.
      const [first, ...rest] = before.order;
      const last = rest[rest.length - 1] ?? first;
      const ownerByItem = { ...before.ownerByItem };
      for (const item of scenario.items) {
        if (ownerByItem[item.id] === first) ownerByItem[item.id] = last;
      }
      const after = { ...before, ownerByItem };

      expect(conservesItems(before, after)).toBe(true);
    });
  }

  it('a reserva também respeita maxLoadKg = 3 × referenceLoadKg', () => {
    const scenario = buildScenario(buildReserveSpec(10));
    for (const character of scenario.characters) {
      expect(character.maxLoadKg).toBe(MAX_LOAD_FACTOR * character.referenceLoadKg);
    }
  });
});

describe('as características sorteadas não dependem de nomes', () => {
  it('buildCandidateSpec não recebe nem produz nomes de participantes', () => {
    const spec = buildCandidateSpec('seed-sem-nomes', 6);
    // A especificação só conhece "Caminhante N" — quem representa cada
    // personagem é decidido depois, na aplicação (participantByCharacter),
    // sem nenhuma influência sobre atributos, mochilas ou ordem.
    for (const character of spec.characters) {
      expect(character.displayName).toMatch(/^Caminhante \d+$/);
    }
  });
});

describe('a expedição gerada sobrevive à persistência existente', () => {
  it('uma expedição sorteada, salva e recarregada, mantém a mesma configuração', async () => {
    const { scenario } = await generateExpedition(8, 'seed-persistencia');
    const draft = createAttemptConfig(scenario, { guidedStage: 1 });
    const payload = buildSessionPayload(draft, [], null);

    const roundtripped = JSON.parse(JSON.stringify(payload));
    const result = validateSessionPayload(roundtripped);

    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(result.payload?.preparation.scenario).toEqual(scenario);
  });
});
