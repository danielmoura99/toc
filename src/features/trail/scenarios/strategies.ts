/**
 * Estratégias de reorganização e redistribuição, derivadas dos dados do
 * cenário — capacidade, carga de referência e limite. Nenhuma delas menciona
 * um personagem específico: é isso que permite aplicá-las a qualquer cenário,
 * fixo ou gerado, e verificar se o efeito acompanha a restrição quando ela
 * muda de lugar.
 *
 * Vive em `src/` (não em `scripts/`) porque tem dois consumidores: o script
 * de calibração (`scripts/calibrate.ts`, via um repasse fino em
 * `scripts/calibration/strategies.ts`) e o gerador de expedições
 * (`generator.ts`), que reaproveita as mesmas estratégias para verificar, no
 * momento da geração, se uma configuração sorteada é adequada ao treino.
 */

import type { AttemptConfig, CharacterId } from '../domain/types';
import { computeLoadByCharacter, loadFactor } from '../domain/engine';
import { itemsOwnedBy, transferItems } from '../domain/attempt';

export type StrategyId = 'inicial' | 'ordem' | 'carga' | 'ambas' | 'excesso';

export interface Strategy {
  id: StrategyId;
  label: string;
  description: string;
  apply: (config: AttemptConfig) => AttemptConfig;
}

/**
 * Velocidade do personagem sem o termo de variação, em km/h.
 * Serve para ordenar e comparar capacidades de forma determinística.
 */
export function effectiveSpeedKmh(config: AttemptConfig, characterId: CharacterId): number {
  const character = config.scenario.characters.find((candidate) => candidate.id === characterId);
  if (!character) throw new Error(`Personagem desconhecido: ${characterId}`);

  const loadKg = computeLoadByCharacter(config)[characterId] ?? 0;
  return character.baseSpeedKmh * loadFactor(loadKg, character.referenceLoadKg);
}

/** Velocidade sem variação de todos, em km/h. */
function speedsByCharacter(config: AttemptConfig): Map<CharacterId, number> {
  const loads = computeLoadByCharacter(config);
  const speeds = new Map<CharacterId, number>();

  for (const character of config.scenario.characters) {
    speeds.set(
      character.id,
      character.baseSpeedKmh * loadFactor(loads[character.id] ?? 0, character.referenceLoadKg),
    );
  }

  return speeds;
}

/**
 * Coloca o mais lento na frente e o mais rápido atrás.
 *
 * A fila não pode ser ultrapassada, então quem vai na frente define o teto de
 * avanço de todos que vêm atrás. Empates são desfeitos pelo ID para manter o
 * resultado determinístico.
 */
export function reorderSlowestFirst(config: AttemptConfig): AttemptConfig {
  const speeds = speedsByCharacter(config);

  const order = [...config.order].sort((a, b) => {
    const delta = speeds.get(a)! - speeds.get(b)!;
    return delta !== 0 ? delta : a.localeCompare(b);
  });

  return { ...config, order };
}

/**
 * Redistribui carga do mais lento para quem tem folga, preservando a ordem.
 *
 * Subida de encosta sobre o gargalo: enquanto mover 1 kg do personagem mais
 * lento para o mais rápido com folga elevar a menor velocidade do grupo, mova.
 * Para quando nenhuma transferência melhora o gargalo — inclusive quando a
 * própria transferência criaria uma nova restrição, que é o efeito que o
 * treinamento precisa deixar visível.
 */
export function redistributeFromBottleneck(config: AttemptConfig): AttemptConfig {
  let current = config;
  // Teto de segurança: no máximo uma transferência por kg existente.
  const maxMoves = config.scenario.items.length;

  for (let move = 0; move < maxMoves; move += 1) {
    const speeds = speedsByCharacter(current);
    const loads = computeLoadByCharacter(current);

    const ranked = [...current.order].sort((a, b) => {
      const delta = speeds.get(a)! - speeds.get(b)!;
      return delta !== 0 ? delta : a.localeCompare(b);
    });

    const slowest = ranked[0];
    const slowestItems = itemsOwnedBy(current, slowest);
    if (slowestItems.length === 0) break;

    const currentBottleneck = speeds.get(slowest)!;

    // Candidatos a receber: do mais rápido para o mais lento, com folga no limite.
    let bestCandidate: AttemptConfig | null = null;
    let bestBottleneck = currentBottleneck;

    for (const receiver of [...ranked].reverse()) {
      if (receiver === slowest) continue;

      const definition = current.scenario.characters.find(
        (candidate) => candidate.id === receiver,
      )!;

      if ((loads[receiver] ?? 0) + 1 > definition.maxLoadKg) continue;

      const candidate = transferItems(current, [slowestItems[0]], receiver);
      const candidateSpeeds = speedsByCharacter(candidate);
      const candidateBottleneck = Math.min(...candidate.order.map((id) => candidateSpeeds.get(id)!));

      if (candidateBottleneck > bestBottleneck + 1e-12) {
        bestBottleneck = candidateBottleneck;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) break;
    current = bestCandidate;
  }

  return current;
}

/**
 * Despeja toda a carga do gargalo sobre o personagem mais rápido.
 *
 * Reproduz o erro que o treinamento precisa deixar visível: identificar
 * corretamente a restrição, concluir que "quem é mais rápido aguenta mais" e
 * transferir de uma vez só. O alívio é real, mas a restrição não desaparece —
 * ela muda de dono. Comparada com a redistribuição equilibrada, mostra que o
 * problema não era a carga estar no lugar errado, e sim estar concentrada.
 *
 * Respeita o limite individual: o excesso que não couber permanece com o dono.
 */
export function overloadFastest(config: AttemptConfig): AttemptConfig {
  const speeds = speedsByCharacter(config);
  const loads = computeLoadByCharacter(config);

  const ranked = [...config.order].sort((a, b) => {
    const delta = speeds.get(a)! - speeds.get(b)!;
    return delta !== 0 ? delta : a.localeCompare(b);
  });

  const slowest = ranked[0];
  const fastest = ranked[ranked.length - 1];
  if (slowest === fastest) return config;

  const receiver = config.scenario.characters.find((candidate) => candidate.id === fastest)!;
  const headroomKg = receiver.maxLoadKg - (loads[fastest] ?? 0);

  // Itens de 1 kg: a folga em kg é o número de itens que cabem.
  const moving = itemsOwnedBy(config, slowest).slice(0, Math.max(0, Math.floor(headroomKg)));
  if (moving.length === 0) return config;

  return transferItems(config, moving, fastest);
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'inicial',
    label: 'Configuração inicial',
    description: 'Ordem e cargas exatamente como o cenário define.',
    apply: (config) => config,
  },
  {
    id: 'ordem',
    label: 'Reorganização da fila',
    description: 'Mais lento à frente, mais rápido atrás. Cargas preservadas.',
    apply: reorderSlowestFirst,
  },
  {
    id: 'carga',
    label: 'Redistribuição de carga',
    description: 'Alivia o gargalo enquanto isso elevar a menor velocidade. Ordem preservada.',
    apply: redistributeFromBottleneck,
  },
  {
    id: 'ambas',
    label: 'Ordem e carga',
    description: 'Redistribui a carga e depois reorganiza a fila pelas velocidades resultantes.',
    apply: (config) => reorderSlowestFirst(redistributeFromBottleneck(config)),
  },
  {
    id: 'excesso',
    label: 'Redistribuição excessiva',
    description: 'Despeja toda a carga do gargalo sobre o mais rápido. Ordem preservada.',
    apply: overloadFastest,
  },
];
