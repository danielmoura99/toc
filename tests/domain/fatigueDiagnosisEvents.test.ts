import { describe, expect, it } from 'vitest';

import { createAttemptConfig } from '@/features/trail/domain/attempt';
import {
  computeFatigueDiagnosisEvents,
  SUSTAINED_CHANGE_WINDOW_SEC,
} from '@/features/trail/domain/fatigueDiagnosisEvents';
import { buildScenario } from '@/features/trail/scenarios/builder';
import type { FatigueParams } from '@/features/trail/domain/types';

/**
 * Fixture de migração: "leve" começa mais lento (candidata inicial), "pesado"
 * começa mais rápido mas com carga relativa 3× maior (no teto) — drena mais
 * depressa (mesmas equações do motor, sem injetar perda de energia à mão) e
 * eventualmente fica mais lento que "leve". `drainPerSec` agressivo só para
 * o teste não precisar simular horas; a fórmula é a mesma do modelo.
 */
function migrationScenario() {
  return buildScenario({
    id: 'lab-migracao',
    revision: 1,
    distanceM: 1_000_000,
    timeLimitSec: 100_000,
    defaultSeed: 'lab-migracao',
    characters: [
      { id: 'pesado', displayName: 'Pesado', baseSpeedKmh: 6.0, referenceLoadKg: 10, variability: 0 },
      { id: 'leve', displayName: 'Leve', baseSpeedKmh: 4.0, referenceLoadKg: 10, variability: 0 },
    ],
    initialOrder: ['pesado', 'leve'],
    initialLoadKgByCharacter: { pesado: 30, leve: 10 },
  });
}

const AGGRESSIVE_PARAMS: FatigueParams = {
  version: 'test-migration',
  drainPerSec: 0.002,
  loadDrainCoefficient: 0.5,
  minFatigueFactor: 0.6,
};

describe('computeFatigueDiagnosisEvents', () => {
  it('EV17/§7.5 — migração emergente: a candidata muda de quem começou mais lento para quem drena mais rápido', () => {
    const scenario = migrationScenario();
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: AGGRESSIVE_PARAMS });

    const { events, truncated } = computeFatigueDiagnosisEvents(config);

    expect(truncated).toBe(false);
    const changes = events.filter((event) => event.kind === 'candidate_change');
    expect(changes.length).toBeGreaterThan(0);

    // "leve" começa como candidata (mais lento); a primeira mudança sustentada
    // tira "leve" da lista e coloca "pesado" — a carga relativa 3× maior dele
    // drena energia mais rápido, mesmo tendo começado com o ritmo mais alto.
    const firstChange = changes[0];
    expect(firstChange.candidateIdsBefore).toContain('leve');
    expect(firstChange.candidateIdsAfter).toContain('pesado');
    expect(firstChange.atSec).toBeGreaterThan(0);
  });

  it('não é obrigatório em toda partida: fadiga desligada não produz nenhum evento de migração', () => {
    const scenario = migrationScenario();
    const config = createAttemptConfig(scenario, { fatigueMode: 'disabled' });

    const { events } = computeFatigueDiagnosisEvents(config);
    expect(events.filter((event) => event.kind === 'candidate_change')).toHaveLength(0);
  });

  it('chegada é identificada como chegada, nunca como migração por fadiga', () => {
    const scenario = buildScenario({
      id: 'lab-chegada',
      revision: 1,
      distanceM: 50,
      timeLimitSec: 10000,
      defaultSeed: 'lab-chegada',
      characters: [
        { id: 'rapido', displayName: 'Rápido', baseSpeedKmh: 7.2, referenceLoadKg: 10, variability: 0 },
        { id: 'lento', displayName: 'Lento', baseSpeedKmh: 3.6, referenceLoadKg: 10, variability: 0 },
      ],
      initialOrder: ['rapido', 'lento'],
      initialLoadKgByCharacter: { rapido: 10, lento: 10 },
    });
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: AGGRESSIVE_PARAMS });

    const { events } = computeFatigueDiagnosisEvents(config);
    const arrivalEvents = events.filter((event) => event.kind === 'arrival');

    expect(arrivalEvents.length).toBeGreaterThan(0);
    expect(arrivalEvents[0].characterId).toBe('rapido');
    // Nenhum evento de "candidate_change" deveria coincidir exatamente com o
    // instante da chegada — a chegada reinicia a base de comparação em vez
    // de contar como mudança de candidata.
    const changeAtArrival = events.find(
      (event) => event.kind === 'candidate_change' && event.atSec === arrivalEvents[0].atSec,
    );
    expect(changeAtArrival).toBeUndefined();
  });

  it('a janela de sustentação é de 30 s simulados', () => {
    expect(SUSTAINED_CHANGE_WINDOW_SEC).toBe(30);
  });

  it('trunca em 100 eventos e sinaliza — não persiste tudo indefinidamente', () => {
    const scenario = migrationScenario();
    const config = createAttemptConfig(scenario, { fatigueMode: 'enabled', fatigueParams: AGGRESSIVE_PARAMS });

    const { truncated } = computeFatigueDiagnosisEvents(config, 0);
    expect(truncated).toBe(true);
  });
});
