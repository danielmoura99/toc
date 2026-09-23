import { describe, expect, it } from 'vitest';

import { buildSessionPayload } from '@/features/trail/persistence/sessionPayload';
import {
  SCHEMA_VERSION,
  validateSessionPayload,
  type SessionPayload,
} from '@/features/trail/persistence/schema';
import { createAttemptConfig } from '@/features/trail/domain/attempt';
import { runToEnd } from '@/features/trail/domain/engine';
import { finalizeResult } from '@/features/trail/domain/metrics';
import { ENGINE_VERSION } from '@/features/trail/domain/types';
import type { AttemptResult } from '@/features/trail/domain/types';
import { SCENARIO_A } from '@/features/trail/scenarios';

function makeAttempt(seed = SCENARIO_A.defaultSeed): AttemptResult {
  const config = createAttemptConfig(SCENARIO_A, { seed, guidedStage: 1 });
  const finalState = runToEnd(config);
  const metrics = finalizeResult(config, finalState);

  return {
    id: `attempt-${seed}`,
    createdAt: new Date().toISOString(),
    config,
    outcome: metrics.outcome,
    finalState,
    totalTimeSec: metrics.totalTimeSec,
    meanSpreadM: metrics.meanSpreadM,
    metrics,
  };
}

function validPayload(): SessionPayload {
  const draft = createAttemptConfig(SCENARIO_A, { guidedStage: 1 });
  const attempt = makeAttempt();
  return buildSessionPayload(draft, [attempt], attempt.id);
}

describe('validateSessionPayload — payload válido', () => {
  it('aceita um payload construído a partir do próprio motor', () => {
    const payload = validPayload();
    const result = validateSessionPayload(payload);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.payload?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('sobrevive a um roundtrip JSON completo', () => {
    const payload = validPayload();
    const roundtripped = JSON.parse(JSON.stringify(payload));
    const result = validateSessionPayload(roundtripped);

    expect(result.ok).toBe(true);
  });

  it('aceita histórico vazio e referência nula', () => {
    const draft = createAttemptConfig(SCENARIO_A, { guidedStage: 1 });
    const payload = buildSessionPayload(draft, [], null);
    const result = validateSessionPayload(payload);

    expect(result.ok).toBe(true);
  });

  it('aceita payload salvo antes de variabilityMode existir (aditivo, não uma quebra de formato)', () => {
    const payload = validPayload();
    // Simula uma sessão salva antes da frente 2 da evolução pedagógica: sem
    // `variabilityMode` no histórico.
    const stripped = JSON.parse(JSON.stringify(payload));
    for (const attempt of stripped.history) delete attempt.config.variabilityMode;

    const result = validateSessionPayload(stripped);
    expect(result.ok, result.issues.join(' | ')).toBe(true);
    expect(result.payload?.history[0]?.config.variabilityMode).toBe('standard');
  });

  it('aceita payload salvo antes de fatigueMode/energy existirem (aditivo, evolução pedagógica frente 5)', () => {
    const payload = validPayload();
    const stripped = JSON.parse(JSON.stringify(payload));
    delete stripped.preparation.fatigueMode;
    delete stripped.preparation.fatigueParams;
    for (const attempt of stripped.history) {
      delete attempt.config.fatigueMode;
      delete attempt.config.fatigueParams;
      for (const characterId of Object.keys(attempt.finalState.characters)) {
        delete attempt.finalState.characters[characterId].energy;
      }
    }

    const result = validateSessionPayload(stripped);
    expect(result.ok, result.issues.join(' | ')).toBe(true);
    expect(result.payload?.preparation.fatigueMode).toBe('disabled');
    expect(result.payload?.history[0]?.config.fatigueMode).toBe('disabled');
  });
});

describe('validateSessionPayload — fadiga (evolução pedagógica, frente 5)', () => {
  it('recupera modos, coeficientes e resultados de uma tentativa com fadiga, sem reescrevê-los (EV16)', () => {
    const config = createAttemptConfig(SCENARIO_A, {
      guidedStage: 1,
      fatigueMode: 'enabled',
    });
    const finalState = runToEnd(config);
    const metrics = finalizeResult(config, finalState);
    const attempt: AttemptResult = {
      id: 'attempt-fadiga',
      createdAt: new Date().toISOString(),
      config,
      outcome: metrics.outcome,
      finalState,
      totalTimeSec: metrics.totalTimeSec,
      meanSpreadM: metrics.meanSpreadM,
      metrics,
    };

    const draft = createAttemptConfig(SCENARIO_A, { guidedStage: 1 });
    const payload = buildSessionPayload(draft, [attempt], attempt.id);
    const roundtripped = JSON.parse(JSON.stringify(payload));

    const result = validateSessionPayload(roundtripped);
    expect(result.ok, result.issues.join(' | ')).toBe(true);

    const recovered = result.payload!.history[0];
    expect(recovered.config.fatigueMode).toBe('enabled');
    expect(recovered.config.fatigueParams).toEqual(config.fatigueParams);
    // Energia final de cada personagem sobrevive intacta — nada foi
    // recalculado ou arredondado no caminho.
    for (const characterId of Object.keys(finalState.characters)) {
      expect(recovered.finalState.characters[characterId].energy).toBe(finalState.characters[characterId].energy);
    }
  });
});

describe('validateSessionPayload — forma inválida', () => {
  it('rejeita algo que não é um objeto', () => {
    expect(validateSessionPayload('um texto qualquer').ok).toBe(false);
    expect(validateSessionPayload(null).ok).toBe(false);
    expect(validateSessionPayload(42).ok).toBe(false);
    expect(validateSessionPayload([]).ok).toBe(false);
  });

  it('rejeita objeto sem os campos obrigatórios', () => {
    const result = validateSessionPayload({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejeita schemaVersion diferente da atual', () => {
    const payload = { ...validPayload(), schemaVersion: 99 };
    expect(validateSessionPayload(payload).ok).toBe(false);
  });

  it('rejeita uma sessão v2 (sem isLimited no estado dos personagens), com mensagem clara', () => {
    const payload = { ...validPayload(), schemaVersion: 2 };
    const result = validateSessionPayload(payload);

    expect(result.ok).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.issues.join(' ')).toContain('schemaVersion 2');
  });

  it('rejeita histórico com mais de 20 tentativas', () => {
    const draft = createAttemptConfig(SCENARIO_A, { guidedStage: 1 });
    const history = Array.from({ length: 21 }, (_, i) => makeAttempt(`seed-${i}`));
    const payload = buildSessionPayload(draft, history, null);

    expect(validateSessionPayload(payload).ok).toBe(false);
  });

  it('não derruba a aplicação com tipos trocados nos campos', () => {
    const payload = validPayload();
    const corrupted = { ...payload, history: 'não é uma lista' };
    const result = validateSessionPayload(corrupted);

    expect(result.ok).toBe(false);
    expect(result.payload).toBeNull();
  });
});

describe('validateSessionPayload — versão do motor', () => {
  it('rejeita com mensagem clara quando o motor é de outra versão', () => {
    const payload = { ...validPayload(), engineVersion: '0.0.1' };
    const result = validateSessionPayload(payload);

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain('0.0.1');
    expect(result.issues[0]).toContain(ENGINE_VERSION);
  });
});

describe('validateSessionPayload — invariantes físicas', () => {
  it('rejeita tentativa com carga acima do limite', () => {
    const payload = validPayload();
    const corrupted: SessionPayload = structuredClone(payload);
    const item = corrupted.history[0].config.scenario.items[0];
    // Move um item extra para p5, que já está no teto no cenário A.
    corrupted.history[0].config.ownerByItem[item.id] = 'p5';

    const result = validateSessionPayload(corrupted);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('acima do limite'))).toBe(true);
  });

  it('rejeita ordem com personagem faltando', () => {
    const payload = validPayload();
    const corrupted: SessionPayload = structuredClone(payload);
    corrupted.history[0].config.order = corrupted.history[0].config.order.slice(1);

    expect(validateSessionPayload(corrupted).ok).toBe(false);
  });

  it('rejeita referência apontando para tentativa inexistente', () => {
    const payload = validPayload();
    const corrupted = { ...payload, referenceAttemptId: 'fantasma' };

    const result = validateSessionPayload(corrupted);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('referência'))).toBe(true);
  });
});

describe('validateSessionPayload — coerência do resultado (recomputação)', () => {
  it('rejeita finalState com status "running"', () => {
    const payload = structuredClone(validPayload());
    payload.history[0].finalState.status = 'running';

    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('em andamento'))).toBe(true);
  });

  it('rejeita outcome que não bate com o status do estado final', () => {
    const payload = structuredClone(validPayload());
    payload.history[0].outcome = 'timed_out';
    // finalState.status continua 'completed' — divergência proposital.

    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('não bate com o status'))).toBe(true);
  });

  it('rejeita posição final adulterada (não corresponde ao que o motor produz)', () => {
    const payload = structuredClone(validPayload());
    const firstCharacterId = Object.keys(payload.history[0].finalState.characters)[0];
    payload.history[0].finalState.characters[firstCharacterId].positionM += 500;

    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('não corresponde ao que o motor produz'))).toBe(
      true,
    );
  });

  it('rejeita tempo de chegada adulterado', () => {
    const payload = structuredClone(validPayload());
    const firstCharacterId = Object.keys(payload.history[0].finalState.characters)[0];
    const character = payload.history[0].finalState.characters[firstCharacterId];
    if (character.arrivalTimeSec !== null) character.arrivalTimeSec += 1000;

    expect(validateSessionPayload(payload).ok).toBe(false);
  });

  it('rejeita totalTimeSec inflado sem tocar no finalState', () => {
    const payload = structuredClone(validPayload());
    payload.history[0].totalTimeSec = (payload.history[0].totalTimeSec ?? 0) + 1;

    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('tempo total'))).toBe(true);
  });

  it('rejeita métricas adulteradas isoladamente (dispersão máxima)', () => {
    const payload = structuredClone(validPayload());
    payload.history[0].metrics.maxSpreadM += 999;

    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('métricas'))).toBe(true);
  });

  it('rejeita carga adulterada em loadKgByCharacter, mesmo sem mexer no config', () => {
    const payload = structuredClone(validPayload());
    const firstCharacterId = Object.keys(payload.history[0].metrics.loadKgByCharacter)[0];
    payload.history[0].metrics.loadKgByCharacter[firstCharacterId] += 100;

    expect(validateSessionPayload(payload).ok).toBe(false);
  });

  it('não é sensível à ordem das chaves ao comparar (deep-equal, não string)', () => {
    const payload = validPayload();
    // Reconstrói o mesmo objeto de characters com as chaves em ordem inversa.
    const attempt = structuredClone(payload).history[0];
    const reorderedCharacters = Object.fromEntries(
      Object.entries(attempt.finalState.characters).reverse(),
    );
    attempt.finalState.characters = reorderedCharacters;
    const reordered = { ...structuredClone(payload), history: [attempt] };

    expect(validateSessionPayload(reordered).ok).toBe(true);
  });

  it('aceita uma tentativa de timeout coerente (sem inventar chegada)', () => {
    const timedOutScenario = structuredClone(SCENARIO_A);
    timedOutScenario.timeLimitSec = 600;
    const config = createAttemptConfig(timedOutScenario, { guidedStage: 1 });
    const finalState = runToEnd(config);
    const metrics = finalizeResult(config, finalState);

    const attempt: AttemptResult = {
      id: 'attempt-timeout',
      createdAt: new Date().toISOString(),
      config,
      outcome: metrics.outcome,
      finalState,
      totalTimeSec: metrics.totalTimeSec,
      meanSpreadM: metrics.meanSpreadM,
      metrics,
    };

    const draft = createAttemptConfig(SCENARIO_A, { guidedStage: 1 });
    const payload = buildSessionPayload(draft, [attempt], null);

    const result = validateSessionPayload(payload);
    expect(result.ok).toBe(true);
  });
});
