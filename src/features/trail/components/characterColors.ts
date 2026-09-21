/**
 * Cores de apoio para distinguir personagens.
 *
 * Cor nunca é o único identificador (§9.2): nome e posição na fila sempre
 * acompanham o avatar, em HTML e no canvas.
 *
 * A cor de um personagem é a sua posição no array `scenario.characters`
 * (não o `id`): os cenários fixos usam `p1`..`p6`, a expedição gerada usa
 * `c1`..`c12` — indexar pela posição, em vez de manter um mapa fixo por id
 * literal, é o que permite a mesma paleta cobrir os dois sem depender do
 * formato do id (`docs/decisions.md`, geração de expedições).
 */

import type { CharacterId, Scenario } from '../domain/types';

/** 12 cores distintas, uma por posição — cobre o teto de participantes (`MAX_PARTY_SIZE`). */
const PALETTE: readonly string[] = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#ca8a04',
  '#4338ca',
  '#059669',
  '#db2777',
  '#65a30d',
  '#0f766e',
];

export const DEFAULT_CHARACTER_COLOR = '#64748b';

function cssHexToNumber(cssHex: string): number {
  return Number.parseInt(cssHex.replace('#', ''), 16);
}

export const DEFAULT_CHARACTER_COLOR_HEX = cssHexToNumber(DEFAULT_CHARACTER_COLOR);

function colorIndex(scenario: Scenario, characterId: CharacterId): number {
  return scenario.characters.findIndex((character) => character.id === characterId);
}

export function colorForCharacter(scenario: Scenario, characterId: CharacterId): string {
  const index = colorIndex(scenario, characterId);
  return index === -1 ? DEFAULT_CHARACTER_COLOR : PALETTE[index % PALETTE.length];
}

/** Todas as cores do cenário de uma vez, para passar a `walkerSpecsFromConfig`. */
export function colorsForScenarioHex(scenario: Scenario): Record<CharacterId, number> {
  const colors: Record<CharacterId, number> = {};
  scenario.characters.forEach((character, index) => {
    colors[character.id] = cssHexToNumber(PALETTE[index % PALETTE.length]);
  });
  return colors;
}
