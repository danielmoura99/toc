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
  FatigueMode,
  FatigueParams,
  SimulationState,
  VariabilityMode,
} from './types';
import { EPSILON_M, LOAD_PENALTY_COEFFICIENT } from './types';
import { fatigueFactor } from './fatigue';
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
 * Velocidade de referência: capacidade base com a penalidade de carga, SEM
 * variabilidade nem fadiga — a mesma grandeza que o diagnóstico de
 * capacidade usa (`domain/diagnosis.ts`) e o denominador do esforço relativo
 * do modelo de fadiga (§7.2: "não usar velocidade já reduzida como
 * denominador"). Sempre positiva, pelas validações de `baseSpeedKmh` e
 * `referenceLoadKg` já existentes.
 */
export function referenceSpeedMps(character: CharacterDefinition, loadKg: number): number {
  return kmhToMps(character.baseSpeedKmh) * loadFactor(loadKg, character.referenceLoadKg);
}

/** Entradas do modelo de fadiga para um personagem num tick — energia do INÍCIO do tick (§7.2). */
export interface FatigueInputs {
  energy: number;
  fatigueMode: FatigueMode;
  fatigueParams: FatigueParams;
}

/**
 * Velocidade disponível do personagem no início do tick, em m/s.
 * Depende de capacidade base, carga, variação do bloco e fadiga — nunca da
 * posição na fila.
 *
 * `variabilityMode: 'disabled'` (experimento da evolução pedagógica, frente 2)
 * usa fator 1 em vez do sorteio: não chama `variationFactor`, não toca no RNG
 * nem em `character.variability` — só a aplicação do fator muda. O mesmo
 * princípio vale para `fatigue` (frente 5): com `fatigueMode: 'disabled'` ou
 * omitido, o multiplicador é exatamente 1, preservando o comportamento de
 * antes desta frente byte a byte.
 */
export function availableSpeedMps(
  character: CharacterDefinition,
  loadKg: number,
  seed: string,
  elapsedSec: number,
  blockSec: number,
  variabilityMode: VariabilityMode = 'standard',
  fatigue?: FatigueInputs,
): number {
  const variation =
    variabilityMode === 'disabled'
      ? 1
      : variationFactor(seed, character.id, blockIndexForTime(elapsedSec, blockSec), character.variability);

  const fatigueMultiplier =
    fatigue && fatigue.fatigueMode === 'enabled'
      ? fatigueFactor(fatigue.energy, fatigue.fatigueParams.minFatigueFactor)
      : 1;

  return referenceSpeedMps(character, loadKg) * variation * fatigueMultiplier;
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
      isLimited: false,
      limitedTimeSec: 0,
      stoppedByQueueTimeSec: 0,
      equivalentLostTimeSec: 0,
      energy: 1,
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
  const fatigueMode = config.fatigueMode;
  const fatigueParams = config.fatigueParams;

  // Fase 1: capacidade de cada um, a partir do estado anterior — inclui a
  // velocidade de referência (sem variabilidade nem fadiga), guardada à
  // parte para o denominador do esforço relativo na fase de energia, mais
  // abaixo (§7.2: "não usar velocidade já reduzida como denominador").
  const available = new Map<CharacterId, number>();
  const referenceSpeeds = new Map<CharacterId, number>();
  for (const characterId of config.order) {
    const definition = characterById.get(characterId);
    if (!definition) continue;
    const loadKg = loadByCharacter[characterId] ?? 0;
    const previous = state.characters[characterId];

    referenceSpeeds.set(characterId, referenceSpeedMps(definition, loadKg));
    available.set(
      characterId,
      availableSpeedMps(
        definition,
        loadKg,
        config.seed,
        state.elapsedSec,
        variabilityBlockSec,
        config.variabilityMode,
        { energy: previous.energy, fatigueMode, fatigueParams },
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

    // Quem já chegou permanece no destino, deixa de acumular limitação e não
    // acumula desgaste — `energy` vem do spread de `previous`, sem mudar
    // (§7.2: "quem estava no destino antes do tick não acumula desgaste").
    if (previous.arrivalTimeSec !== null) {
      nextCharacters[characterId] = {
        ...previous,
        availableSpeedMps: speed,
        actualSpeedMps: 0,
        isLimited: false,
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
    const actualSpeedMpsValue = advance / dt;

    // Energia atualizada DEPOIS de resolver o movimento deste tick, nunca
    // antes (§7.2) — usa o avanço já cortado pelo destino (`advance`, dentro
    // de `actualSpeedMpsValue`) e a velocidade de referência (não a
    // disponível, já reduzida por variabilidade/fadiga) como denominador do
    // esforço relativo. Sem avanço, o esforço relativo é 0 e o desgaste
    // desta versão também é — a mesma fórmula, sem caso especial.
    let energy = previous.energy;
    if (fatigueMode === 'enabled') {
      const loadRatio = (loadByCharacter[characterId] ?? 0) / characterById.get(characterId)!.referenceLoadKg;
      const relativeEffort = actualSpeedMpsValue / referenceSpeeds.get(characterId)!;
      const energyLoss =
        fatigueParams.drainPerSec * (1 + fatigueParams.loadDrainCoefficient * loadRatio) * relativeEffort ** 2 * dt;
      energy = Math.max(0, previous.energy - energyLoss);
    }

    nextCharacters[characterId] = {
      id: characterId,
      positionM: newPosition,
      availableSpeedMps: speed,
      actualSpeedMps: actualSpeedMpsValue,
      arrivalTimeSec: hasArrived ? elapsedAfter : null,
      isLimited,
      limitedTimeSec: previous.limitedTimeSec + (isLimited ? dt : 0),
      stoppedByQueueTimeSec: previous.stoppedByQueueTimeSec + (isStopped ? dt : 0),
      equivalentLostTimeSec: previous.equivalentLostTimeSec + equivalentLost,
      energy,
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
