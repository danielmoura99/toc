import { describe, expect, it } from 'vitest';
import { conservesItems, validateConfig } from '@/features/trail/domain/validation';
import { createAttemptConfig, itemsOwnedBy, transferItems } from '@/features/trail/domain/attempt';
import { SCENARIO_A, SCENARIO_B, deriveMaxLoadKg } from '@/features/trail/scenarios';
import { computeLoadByCharacter } from '@/features/trail/domain/engine';
import { ENGINE_VERSION } from '@/features/trail/domain/types';

function codes(config: ReturnType<typeof createAttemptConfig>): string[] {
  return validateConfig(config).issues.map((issue) => issue.code);
}

describe('cenários do MVP', () => {
  it('cenário A é válido e soma 48 kg em 48 itens', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const result = validateConfig(config);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(config.scenario.items).toHaveLength(48);

    const loads = computeLoadByCharacter(config);
    expect(Object.values(loads).reduce((sum, value) => sum + value, 0)).toBe(48);
  });

  it('cenário B é válido e também soma 48 kg', () => {
    const config = createAttemptConfig(SCENARIO_B);
    const result = validateConfig(config);

    expect(result.valid).toBe(true);
    const loads = computeLoadByCharacter(config);
    expect(Object.values(loads).reduce((sum, value) => sum + value, 0)).toBe(48);
  });

  it('cenário A: p5 começa exatamente no teto de 18 kg', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const p5 = config.scenario.characters.find((character) => character.id === 'p5')!;

    expect(p5.referenceLoadKg).toBe(6);
    expect(p5.maxLoadKg).toBe(18);
    expect(computeLoadByCharacter(config).p5).toBe(18);
  });

  it('cenário B: p2 começa exatamente no teto de 18 kg e p5 é aliviado', () => {
    const config = createAttemptConfig(SCENARIO_B);
    const p2 = config.scenario.characters.find((character) => character.id === 'p2')!;
    const loads = computeLoadByCharacter(config);

    expect(p2.referenceLoadKg).toBe(6);
    expect(p2.maxLoadKg).toBe(18);
    expect(loads.p2).toBe(18);
    expect(loads.p5).toBe(6);
  });

  it('a restrição muda de personagem entre A e B', () => {
    const a = createAttemptConfig(SCENARIO_A);
    const b = createAttemptConfig(SCENARIO_B);

    expect(computeLoadByCharacter(a).p5).toBe(18);
    expect(computeLoadByCharacter(b).p5).toBe(6);
    expect(computeLoadByCharacter(b).p2).toBe(18);
  });

  it('maxLoadKg é sempre 3 × referenceLoadKg nos dois cenários', () => {
    for (const scenario of [SCENARIO_A, SCENARIO_B]) {
      for (const character of scenario.characters) {
        expect(character.maxLoadKg).toBe(deriveMaxLoadKg(character.referenceLoadKg));
        expect(character.maxLoadKg).toBe(3 * character.referenceLoadKg);
      }
    }
  });

  it('itens têm IDs únicos e peso de 1 kg', () => {
    for (const scenario of [SCENARIO_A, SCENARIO_B]) {
      const ids = new Set(scenario.items.map((item) => item.id));
      expect(ids.size).toBe(scenario.items.length);
      expect(scenario.items.every((item) => item.weightKg === 1)).toBe(true);
    }
  });
});

describe('validateConfig — ordem', () => {
  it('rejeita ordem com personagem repetido', () => {
    const config = createAttemptConfig(SCENARIO_A, {
      order: ['p1', 'p1', 'p2', 'p3', 'p4', 'p5'],
    });
    expect(codes(config)).toContain('duplicate_in_order');
  });

  it('rejeita ordem com personagem faltando', () => {
    const config = createAttemptConfig(SCENARIO_A, { order: ['p1', 'p2', 'p3', 'p4', 'p5'] });
    const issues = codes(config);

    expect(issues).toContain('order_size_mismatch');
    expect(issues).toContain('missing_in_order');
  });

  it('rejeita personagem desconhecido na ordem', () => {
    const config = createAttemptConfig(SCENARIO_A, {
      order: ['p1', 'p2', 'p3', 'p4', 'p5', 'fantasma'],
    });
    const issues = codes(config);

    expect(issues).toContain('unknown_in_order');
    expect(issues).toContain('missing_in_order');
  });

  it('aceita qualquer permutação válida do elenco', () => {
    const config = createAttemptConfig(SCENARIO_A, {
      order: ['p6', 'p5', 'p4', 'p3', 'p2', 'p1'],
    });
    expect(validateConfig(config).valid).toBe(true);
  });
});

describe('validateConfig — itens e carga', () => {
  it('AC03 — sobrecarga bloqueia o início', () => {
    const config = createAttemptConfig(SCENARIO_A);
    // p5 já está no teto (18 kg). Um item a mais o coloca acima do limite.
    const extraItem = itemsOwnedBy(config, 'p1')[0];
    const overloaded = transferItems(config, [extraItem], 'p5');

    const result = validateConfig(overloaded);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('overloaded');
    expect(computeLoadByCharacter(overloaded).p5).toBe(19);
  });

  it('permite carregar exatamente o limite', () => {
    const config = createAttemptConfig(SCENARIO_A);
    // p3 tem referência 14 kg → teto 42 kg. Recebe 30 kg e chega a 36 kg.
    const donors = [
      ...itemsOwnedBy(config, 'p1'),
      ...itemsOwnedBy(config, 'p2'),
      ...itemsOwnedBy(config, 'p4'),
      ...itemsOwnedBy(config, 'p6'),
    ];
    const loaded = transferItems(config, donors, 'p3');

    expect(computeLoadByCharacter(loaded).p3).toBe(30);
    expect(validateConfig(loaded).valid).toBe(true);
  });

  it('R07 — transferir preserva IDs e peso total', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const moved = itemsOwnedBy(config, 'p5').slice(0, 6);
    const after = transferItems(config, moved, 'p3');

    expect(conservesItems(config, after)).toBe(true);
    expect(Object.keys(after.ownerByItem)).toHaveLength(48);

    const loadsBefore = computeLoadByCharacter(config);
    const loadsAfter = computeLoadByCharacter(after);
    const totalBefore = Object.values(loadsBefore).reduce((sum, value) => sum + value, 0);
    const totalAfter = Object.values(loadsAfter).reduce((sum, value) => sum + value, 0);

    expect(totalAfter).toBe(totalBefore);
    expect(loadsAfter.p5).toBe(12);
    expect(loadsAfter.p3).toBe(12);
  });

  it('transferir não muta a configuração original', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const before = structuredClone(config.ownerByItem);
    transferItems(config, itemsOwnedBy(config, 'p5').slice(0, 3), 'p1');
    expect(config.ownerByItem).toEqual(before);
  });

  it('rejeita item sem dono', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const ownerByItem = { ...config.ownerByItem };
    delete ownerByItem[config.scenario.items[0].id];

    expect(codes({ ...config, ownerByItem })).toContain('item_without_owner');
  });

  it('rejeita item atribuído a personagem inexistente', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const ownerByItem = { ...config.ownerByItem, [config.scenario.items[0].id]: 'fantasma' };

    expect(codes({ ...config, ownerByItem })).toContain('item_unknown_owner');
  });

  it('rejeita dono definido para item inexistente', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const ownerByItem = { ...config.ownerByItem, 'item-fantasma': 'p1' };

    expect(codes({ ...config, ownerByItem })).toContain('unknown_item_owned');
  });

  it('transferir item inexistente falha de forma controlada', () => {
    const config = createAttemptConfig(SCENARIO_A);
    expect(() => transferItems(config, ['nao-existe'], 'p1')).toThrow(/Item inexistente/);
  });
});

describe('validateConfig — maxLoadKg derivado', () => {
  it('rejeita maxLoadKg que divirja de 3 × referenceLoadKg', () => {
    // Simula um JSON importado com o campo adulterado.
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.characters[0].maxLoadKg = 50;

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('max_load_not_derived');
  });

  it('a mensagem indica o valor correto esperado', () => {
    const config = createAttemptConfig(SCENARIO_A);
    const p5Index = config.scenario.characters.findIndex((character) => character.id === 'p5');
    config.scenario.characters[p5Index].maxLoadKg = 20;

    const issue = validateConfig(config).issues.find(
      (candidate) => candidate.code === 'max_load_not_derived',
    );

    expect(issue?.message).toContain('18 kg');
    expect(issue?.path).toBe('scenario.characters.p5.maxLoadKg');
  });
});

describe('validateConfig — valores inválidos', () => {
  it('rejeita NaN e Infinity na distância', () => {
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.distanceM = Number.NaN;
    expect(codes(config)).toContain('invalid_distance');

    config.scenario.distanceM = Number.POSITIVE_INFINITY;
    expect(codes(config)).toContain('invalid_distance');
  });

  it('rejeita velocidade base não positiva', () => {
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.characters[0].baseSpeedKmh = 0;
    expect(codes(config)).toContain('invalid_base_speed');
  });

  it('rejeita variabilidade fora de [0, 0,5]', () => {
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.characters[0].variability = 0.6;
    expect(codes(config)).toContain('invalid_variability');

    config.scenario.characters[0].variability = -0.1;
    expect(codes(config)).toContain('invalid_variability');
  });

  it('aceita os extremos da variabilidade', () => {
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.characters[0].variability = 0;
    expect(codes(config)).not.toContain('invalid_variability');

    config.scenario.characters[0].variability = 0.5;
    expect(codes(config)).not.toContain('invalid_variability');
  });

  it('rejeita seed vazia', () => {
    expect(codes(createAttemptConfig(SCENARIO_A, { seed: '' }))).toContain('invalid_seed');
  });

  it('rejeita versão de motor incompatível', () => {
    const config = { ...createAttemptConfig(SCENARIO_A), engineVersion: '0.0.1' };
    const result = validateConfig(config);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('engine_version_mismatch');
    expect(result.issues[0].message).toContain(ENGINE_VERSION);
  });

  it('rejeita passo diferente de 1 s', () => {
    const config = { ...createAttemptConfig(SCENARIO_A), tickSec: 2 as 1 };
    expect(codes(config)).toContain('invalid_tick');
  });

  it('rejeita bloco de variabilidade diferente de 30 s', () => {
    const config = createAttemptConfig(SCENARIO_A);
    config.scenario.variabilityBlockSec = 60 as 30;
    expect(codes(config)).toContain('invalid_variability_block');
  });
});
