import { describe, expect, it } from 'vitest';

import { createProductionLineConfig } from '@/features/factory/domain/config';
import { validateConfig } from '@/features/factory/domain/validation';
import { ENGINE_VERSION } from '@/features/factory/domain/types';

describe('validateConfig', () => {
  it('aceita uma configuração recém-criada', () => {
    const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'valid' });
    expect(validateConfig(config).valid).toBe(true);
  });

  it('rejeita versão de motor incompatível', () => {
    const config = createProductionLineConfig({ seed: 'x' });
    const result = validateConfig({ ...config, engineVersion: '0.0.0' });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('engine_version_mismatch');
  });

  it('rejeita horizonte fora de {10, 20, 30}', () => {
    const config = { ...createProductionLineConfig({ seed: 'x' }), rounds: 15 };
    // @ts-expect-error -- 15 não é um Horizon válido; testando a defesa em runtime contra JSON importado.
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'invalid_rounds')).toBe(true);
  });

  it('rejeita menos de 4 ou mais de 12 setores', () => {
    const tooFew = createProductionLineConfig({ stageCount: 4, seed: 'x' });
    expect(validateConfig({ ...tooFew, stages: tooFew.stages.slice(0, 3) }).valid).toBe(false);

    const tooMany = createProductionLineConfig({ stageCount: 12, seed: 'x' });
    expect(
      validateConfig({ ...tooMany, stages: [...tooMany.stages, { id: 'stage-12', sectorName: 'Extra', participantName: '' }] })
        .valid,
    ).toBe(false);
  });

  it('rejeita setores duplicados', () => {
    const config = createProductionLineConfig({ stageCount: 4, seed: 'x' });
    const broken = { ...config, stages: [config.stages[0], config.stages[0], config.stages[2], config.stages[3]] };
    const result = validateConfig(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'duplicate_stage')).toBe(true);
  });

  it('rejeita hipótese acima de 500 caracteres', () => {
    const config = createProductionLineConfig({ seed: 'x' });
    const result = validateConfig({ ...config, hypothesis: 'a'.repeat(501) });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'hypothesis_too_long')).toBe(true);
  });

  it('rejeita capacityModel ou initialInventory diferentes do único modo suportado', () => {
    const config = createProductionLineConfig({ seed: 'x' });
    // @ts-expect-error -- testando defesa em runtime contra JSON importado com valor fora do literal.
    expect(validateConfig({ ...config, capacityModel: 'other' }).valid).toBe(false);
    // @ts-expect-error -- idem.
    expect(validateConfig({ ...config, initialInventory: 'full' }).valid).toBe(false);
  });

  it('a versão do motor exportada bate com a usada na configuração padrão', () => {
    const config = createProductionLineConfig({ seed: 'x' });
    expect(config.engineVersion).toBe(ENGINE_VERSION);
  });
});
