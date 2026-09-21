/**
 * Motor da simulação: passo fixo, determinístico, sem dependência de frames.
 *
 * Invariantes sustentadas aqui:
 *  - R02 a ordem é fixa durante a execução;
 *  - R03 ninguém ultrapassa quem está imediatamente à frente;
 *  - R04 quem está na frente não é limitado por quem está atrás;
 *  - R09 recuperar espaço exige andar mais rápido que quem está à frente;
 *  - R14 o resultado não depende de FPS, janela ou velocidade de reprodução;
 *  - R15 nenhuma regra condicionada a um personagem específico.
 */

import type {
  AttemptConfig,
  CharacterDefinition,
  CharacterId,
  CharacterState,
  SimulationState,
} from './types';
import { EPSILON_M, LOAD_PENALTY_COEFFICIENT } from './types';
import { blockIndexForTime, variationFactor } from './random';

/** Converte km/h em m/s. */
export function kmhToMps(kmh: number): number {
  return kmh / 3.6;
}

/** Soma dos pesos dos itens atribuídos a cada personagem. */
export function computeLoadByCharacter(config: AttemptConfig): Record<CharacterId, number> {
  const loadByCharacter: Record<CharacterId, number> = {};

  for (const character of config.scenario.characters) {
    loadByCharacter[character.id] = 0;
  }

  for (const item of config.scenario.items) {
    const ownerId = config.ownerByItem[item.id];
    if (ownerId === undefined) continue;
    loadByCharacter[ownerId] = (loadByCharacter[ownerId] ?? 0) + item.weightKg;
  }

  return loadByCharacter;
}

/**
 * Penalidade por carga: 1 / (1 + 0,20 × carga / carga_referência).
 * Fórmula comum a todos os personagens — não há exceção por ID.
 */
export function loadFactor(loadKg: number, referenceLoadKg: number): number {
  return 1 / (1 + LOAD_PENALTY_COEFFICIENT * (loadKg / referenceLoadKg));
}

/**
 * Velocidade disponível do personagem no início do tick, em m/s.
 * Depende de capacidade base, carga e variação do bloco — nunca da posição na fila.
 */
export function availableSpeedMps(
  character: CharacterDefinition,
  loadKg: number,
  seed: string,
  elapsedSec: number,
  blockSec: number,
): number {
  const variation = variationFactor(
    seed,
    character.id,
    blockIndexForTime(elapsedSec, blockSec),
    character.variability,
  );

  return kmhToMps(character.baseSpeedKmh) * loadFactor(loadKg, character.referenceLoadKg) * variation;
}

export function createInitialState(config: AttemptConfig): SimulationState {
  const characters: Record<CharacterId, CharacterState> = {};

  for (const character of config.scenario.characters) {
    characters[character.id] = {
      id: character.id,
      positionM: 0,
      availableSpeedMps: 0,
      actualSpeedMps: 0,
      arrivalTimeSec: null,
      limitedTimeSec: 0,
      stoppedByQueueTimeSec: 0,
      equivalentLostTimeSec: 0,
    };
  }

  return {
    elapsedSec: 0,
    characters,
    maxSpreadM: 0,
    sumSpreadM: 0,
    ticksExecuted: 0,
    status: 'running',
  };
}

/**
 * Avança exatamente um tick. Não muta as entradas.
 *
 * As velocidades disponíveis de todos são calculadas a partir do estado
 * anterior; só depois as posições são resolvidas da frente para trás, usando a
 * posição NOVA de quem está à frente. Isso é intencional: permite acompanhar o
 * movimento de quem vai na frente no mesmo tick, sem impor um atraso artificial
 * de 1 s por pessoa na fila.
 */
export function step(config: AttemptConfig, state: SimulationState): SimulationState {
  if (state.status !== 'running') {
    return state;
  }

  const dt = config.tickSec;
  const { distanceM, timeLimitSec, variabilityBlockSec } = config.scenario;
  const loadByCharacter = computeLoadByCharacter(config);
  const characterById = new Map<CharacterId, CharacterDefinition>(
    config.scenario.characters.map((character) => [character.id, character]),
  );

  // Fase 1: capacidade de cada um, a partir do estado anterior.
  const available = new Map<CharacterId, number>();
  for (const characterId of config.order) {
    const definition = characterById.get(characterId);
    if (!definition) continue;
    available.set(
      characterId,
      availableSpeedMps(
        definition,
        loadByCharacter[characterId] ?? 0,
        config.seed,
        state.elapsedSec,
        variabilityBlockSec,
      ),
    );
  }

  // Fase 2: posições, resolvidas da frente para trás.
  const nextCharacters: Record<CharacterId, CharacterState> = {};
  const elapsedAfter = state.elapsedSec + dt;
  let positionAhead: number | null = null;

  for (const characterId of config.order) {
    const previous = state.characters[characterId];
    const speed = available.get(characterId) ?? 0;

    // Quem já chegou permanece no destino e deixa de acumular limitação.
    if (previous.arrivalTimeSec !== null) {
      nextCharacters[characterId] = {
        ...previous,
        availableSpeedMps: speed,
        actualSpeedMps: 0,
      };
      positionAhead = previous.positionM;
      continue;
    }

    const freeTarget = Math.min(distanceM, previous.positionM + speed * dt);
    // Anotação explícita: positionAhead recebe newPosition ao fim do laço, e
    // sem ela a inferência fica circular.
    const newPosition: number =
      positionAhead === null ? freeTarget : Math.min(freeTarget, positionAhead);
    const advance = newPosition - previous.positionM;

    // Limitação pela fila: avançou menos do que poderia por causa de quem está
    // à frente. O corte por chegada ao destino já está embutido em freeTarget,
    // portanto não é contado como limitação.
    const isLimited = newPosition < freeTarget - EPSILON_M;
    const isStopped = isLimited && advance < EPSILON_M;
    const equivalentLost = isLimited && speed > 0 ? (freeTarget - newPosition) / speed : 0;

    const hasArrived = newPosition >= distanceM - EPSILON_M;

    nextCharacters[characterId] = {
      id: characterId,
      positionM: newPosition,
      availableSpeedMps: speed,
      actualSpeedMps: advance / dt,
      arrivalTimeSec: hasArrived ? elapsedAfter : null,
      limitedTimeSec: previous.limitedTimeSec + (isLimited ? dt : 0),
      stoppedByQueueTimeSec: previous.stoppedByQueueTimeSec + (isStopped ? dt : 0),
      equivalentLostTimeSec: previous.equivalentLostTimeSec + equivalentLost,
    };

    positionAhead = newPosition;
  }

  // Fase 3: dispersão e desfecho.
  const positions = config.order.map((characterId) => nextCharacters[characterId].positionM);
  const spread = Math.max(...positions) - Math.min(...positions);
  const ticksExecuted = state.ticksExecuted + 1;

  const everyoneArrived = config.order.every(
    (characterId) => nextCharacters[characterId].arrivalTimeSec !== null,
  );

  // A conclusão é verificada antes do timeout: uma chegada exatamente no limite é válida.
  let status: SimulationState['status'] = 'running';
  if (everyoneArrived) {
    status = 'completed';
  } else if (elapsedAfter >= timeLimitSec) {
    status = 'timed_out';
  }

  return {
    elapsedSec: elapsedAfter,
    characters: nextCharacters,
    maxSpreadM: Math.max(state.maxSpreadM, spread),
    sumSpreadM: state.sumSpreadM + spread,
    ticksExecuted,
    status,
  };
}

/**
 * Executa até concluir ou atingir o limite de tempo simulado.
 * Útil para teste e calibração; não deve bloquear a interface durante a animação.
 */
export function runToEnd(config: AttemptConfig): SimulationState {
  let state = createInitialState(config);

  while (state.status === 'running') {
    state = step(config, state);
  }

  return state;
}
