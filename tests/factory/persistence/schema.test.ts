import { describe, expect, it } from 'vitest';

import { createProductionLineConfig } from '@/features/factory/domain/config';
import { createInitialState, runToEnd, stepTurn } from '@/features/factory/domain/engine';
import { summarize } from '@/features/factory/domain/metrics';
import { ENGINE_VERSION, type ProductionLineConfig } from '@/features/factory/domain/types';
import { buildSessionPayload } from '@/features/factory/persistence/sessionPayload';
import { SCHEMA_VERSION, validateSessionPayload, type RunResult, type SessionPayload } from '@/features/factory/persistence/schema';

function makeRun(seed: string): RunResult {
  const config = createProductionLineConfig({ stageCount: 5, rounds: 10, seed });
  const finalState = runToEnd(config);
  return {
    id: `run-${seed}`,
    createdAt: new Date().toISOString(),
    config,
    finalState,
    summary: summarize(config, finalState),
  };
}

function validPayload(): SessionPayload {
  const draft = createProductionLineConfig({ stageCount: 5, rounds: 10, seed: 'draft-seed' });
  const run = makeRun('run-seed');
  return buildSessionPayload(draft, 30, [run], null, null);
}

describe('validateSessionPayload — payload válido', () => {
  it('aceita um payload construído a partir do próprio motor', () => {
    const payload = validPayload();
    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('sobrevive a um roundtrip JSON completo', () => {
    const payload = validPayload();
    const roundtripped = JSON.parse(JSON.stringify(payload));
    const result = validateSessionPayload(roundtripped);
    expect(result.ok).toBe(true);
  });

  it('aceita uma partida ativa (não concluída) salva no meio do caminho', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'active-seed' });
    let state = createInitialState(config);
    for (let i = 0; i < 7; i += 1) state = stepTurn(config, state);
    expect(state.status).toBe('active');

    const payload = buildSessionPayload(config, null, [], null, { config, state });
    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(true);
  });
});

describe('validateSessionPayload — rejeição de formato antigo', () => {
  it('rejeita schemaVersion diferente da atual com mensagem específica', () => {
    const payload = { ...validPayload(), schemaVersion: 0 };
    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatch(/formato anterior/);
  });
});

describe('validateSessionPayload — versão do motor', () => {
  it('rejeita engineVersion diferente da atual', () => {
    const payload = { ...validPayload(), engineVersion: '9.9.9' };
    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatch(/motor incompatível/);
  });
});

describe('validateSessionPayload — adulteração detectada por recomputação', () => {
  it('rejeita um estado final gravado que não bate com o que o motor recalcula', () => {
    const payload = validPayload();
    const tampered: SessionPayload = {
      ...payload,
      history: [
        {
          ...payload.history[0],
          finalState: { ...payload.history[0].finalState, delivered: payload.history[0].finalState.delivered + 100 },
        },
      ],
    };
    const result = validateSessionPayload(tampered);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('não corresponde ao que o motor produz'))).toBe(true);
  });

  it('rejeita uma partida ativa cujo estoque foi editado à mão', () => {
    const config = createProductionLineConfig({ stageCount: 4, rounds: 10, seed: 'tamper-active' });
    let state = createInitialState(config);
    for (let i = 0; i < 5; i += 1) state = stepTurn(config, state);

    const tamperedState = { ...state, delivered: state.delivered + 50 };
    const payload = buildSessionPayload(config, null, [], null, { config, state: tamperedState });
    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
  });

  it('rejeita métricas gravadas que não batem com as recalculadas', () => {
    const payload = validPayload();
    const tampered: SessionPayload = {
      ...payload,
      history: [{ ...payload.history[0], summary: { ...payload.history[0].summary, delivered: 9999 } }],
    };
    const result = validateSessionPayload(tampered);
    expect(result.ok).toBe(false);
  });
});

describe('validateSessionPayload — limites e formas inválidas', () => {
  it('rejeita entrada que não é um objeto', () => {
    expect(validateSessionPayload(null).ok).toBe(false);
    expect(validateSessionPayload('not an object').ok).toBe(false);
    expect(validateSessionPayload(42).ok).toBe(false);
  });

  it('rejeita histórico acima de 20 partidas', () => {
    const payload = validPayload();
    const history = Array.from({ length: 21 }, (_, i) => makeRun(`bulk-${i}`));
    const result = validateSessionPayload({ ...payload, history });
    expect(result.ok).toBe(false);
  });

  it('a config engineVersion consumida bate com a constante do domínio', () => {
    const config: ProductionLineConfig = createProductionLineConfig({ seed: 'x' });
    expect(config.engineVersion).toBe(ENGINE_VERSION);
  });

  it('rejeita config com número de setores fora de 4–12', () => {
    const config = createProductionLineConfig({ stageCount: 4, seed: 'shrink' });
    const broken = { ...config, stages: config.stages.slice(0, 2) };
    const payload = buildSessionPayload(broken, null, [], null, null);
    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
  });
});

describe('SCHEMA_VERSION', () => {
  it('começa em 1, módulo novo sem histórico de formatos anteriores', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
