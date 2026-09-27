/**
 * Motor da Fábrica de componentes: por turno, determinístico, sem dependência
 * de frames (guia §4).
 *
 * Invariantes sustentadas aqui:
 *  - TG01 toda etapa usa a mesma distribuição de faces, sem ajuste por nome,
 *    posição ou desempenho anterior;
 *  - TG03 conservação, inteiros não negativos e limites da transferência
 *    valem após cada turno;
 *  - TG04 o que uma etapa transfere fica disponível para a próxima na MESMA
 *    rodada — não há atraso artificial de uma rodada entre setores;
 *  - a ordem das etapas é fixa durante a partida (§4.2).
 */

import type { ProductionLineConfig, ProductionLineState, RunStatus, StageId, TurnEvent } from './types';
import { DIE_MAX, DIE_MIN } from './types';
import { rollDie } from './random';

/** Sorteia a face de um turno a partir da configuração — a via de produção, nunca chamada em fixtures de teste. */
function productionRollFace(config: ProductionLineConfig): (stageId: StageId, roundIndex: number) => number {
  return (stageId, roundIndex) => rollDie(config.rngVersion, config.seed, stageId, roundIndex);
}

/**
 * Função que decide a face de um turno. Em produção é sempre
 * `productionRollFace(config)`; fixtures de teste podem fornecer uma
 * sequência fixa (§10: "permitir fornecer uma sequência de faces apenas em
 * fixtures de teste, fora dos controles e do formato importável de
 * produção") — por isso este tipo só existe como parâmetro de função pura,
 * nunca como campo de `ProductionLineConfig` nem do payload persistido.
 */
export type RollFace = (stageId: StageId, roundIndex: number) => number;

export function createInitialState(config: ProductionLineConfig): ProductionLineState {
  const inventoryByStage: Record<StageId, number> = {};
  for (const stage of config.stages) {
    inventoryByStage[stage.id] = 0;
  }

  return {
    nextRoundIndex: 0,
    nextStageIndex: 0,
    completedRounds: 0,
    inventoryByStage,
    introduced: 0,
    delivered: 0,
    events: [],
    status: 'active',
  };
}

/**
 * Descreve o turno que `stepTurn` executaria a seguir, sem executá-lo — usado
 * pela interface para "Dia N de H · setor S de T" e para decidir qual etapa
 * destacar. Indefinido quando a partida já terminou: os índices terminais
 * (ver `stepTurn`) não representam um turno futuro (§10).
 */
export function nextTurnDescriptor(
  config: ProductionLineConfig,
  state: ProductionLineState,
): { roundIndex: number; stageIndex: number; stageId: StageId } | null {
  if (state.status === 'completed') return null;
  const stage = config.stages[state.nextStageIndex];
  return { roundIndex: state.nextRoundIndex, stageIndex: state.nextStageIndex, stageId: stage.id };
}

/**
 * Executa exatamente um turno: a etapa da vez lança o dado e efetua sua
 * transferência (§4.2, §4.3). Não muta `state`; em estado já concluído, não
 * sorteia de novo — devolve o mesmo estado, sem lançar exceção.
 *
 * `rollFace` é opcional e existe só para fixtures de teste reproduzirem
 * sequências fixas de faces (§10); em produção, omitir o parâmetro sorteia
 * pela seed da configuração.
 */
export function stepTurn(
  config: ProductionLineConfig,
  state: ProductionLineState,
  rollFace: RollFace = productionRollFace(config),
): ProductionLineState {
  if (state.status === 'completed') {
    return state;
  }

  const { stages, rounds } = config;
  const stageIndex = state.nextStageIndex;
  const roundIndex = state.nextRoundIndex;
  const stage = stages[stageIndex];
  const isFirstStage = stageIndex === 0;
  const isLastStage = stageIndex === stages.length - 1;

  const die = rollFace(stage.id, roundIndex);
  if (!Number.isInteger(die) || die < DIE_MIN || die > DIE_MAX) {
    throw new Error(`Face de dado inválida para a etapa "${stage.id}" na rodada ${roundIndex}: ${die}.`);
  }

  const inventoryByStage = { ...state.inventoryByStage };
  let availableBefore: number | null;
  let transferred: number;
  let introduced = state.introduced;
  let delivered = state.delivered;

  if (isFirstStage) {
    // Fonte irrestrita: sem estoque finito, sorteia inclusive assim (§4.1, §4.3).
    availableBefore = null;
    transferred = die;
    introduced += transferred;
  } else {
    availableBefore = inventoryByStage[stage.id] ?? 0;
    transferred = Math.min(die, availableBefore);
    inventoryByStage[stage.id] = availableBefore - transferred;
  }

  if (!isLastStage) {
    const nextStage = stages[stageIndex + 1];
    inventoryByStage[nextStage.id] = (inventoryByStage[nextStage.id] ?? 0) + transferred;
  } else {
    delivered += transferred;
  }

  const unusedCapacity = die - transferred;

  const event: TurnEvent = {
    roundIndex,
    stageIndex,
    stageId: stage.id,
    die,
    availableBefore,
    transferred,
    unusedCapacity,
    inventoryAfter: inventoryByStage,
    introducedTotal: introduced,
    deliveredTotal: delivered,
  };

  const completingRound = isLastStage;
  const nextStageIndex = completingRound ? 0 : stageIndex + 1;
  const nextRoundIndex = completingRound ? roundIndex + 1 : roundIndex;
  const completedRounds = completingRound ? state.completedRounds + 1 : state.completedRounds;

  // A partida termina ao concluir a última etapa da última rodada — não antes
  // (§4.3). Os índices terminais (nextRoundIndex === rounds, nextStageIndex
  // === 0) são uma representação consistente de "nada mais a jogar", não um
  // turno futuro real — ver `nextTurnDescriptor`.
  const status: RunStatus = completingRound && nextRoundIndex >= rounds ? 'completed' : 'active';

  return {
    nextRoundIndex,
    nextStageIndex,
    completedRounds,
    inventoryByStage,
    introduced,
    delivered,
    events: [...state.events, event],
    status,
  };
}

/**
 * Executa até o fim da partida. Útil para testes e para o script de
 * calibração; não deve bloquear a interface durante a animação.
 */
export function runToEnd(config: ProductionLineConfig, rollFace?: RollFace): ProductionLineState {
  let state = createInitialState(config);
  const roll = rollFace ?? productionRollFace(config);

  while (state.status === 'active') {
    state = stepTurn(config, state, roll);
  }

  return state;
}

/** Soma dos estoques intermediários — exclui fonte e saída (§8: "Estoque em processo atual"). */
export function inventoryInProcess(state: ProductionLineState): number {
  return Object.values(state.inventoryByStage).reduce((sum, value) => sum + value, 0);
}
