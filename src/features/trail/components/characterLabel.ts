/**
 * Identificação de quem representa cada personagem.
 *
 * O nome do participante é a identificação principal em toda a interface —
 * fila, mochilas, tabelas, histórico e comparação — com o identificador do
 * personagem sempre junto, como secundário: nomes podem se repetir entre
 * participantes, e é o identificador quem continua distinguindo cada um
 * (ajuste de navegação, 22/09/2026). Sem nome preenchido, usa só o
 * identificador do personagem — o mesmo que sessões antigas, salvas antes de
 * existir nome de participante, sempre mostraram.
 *
 * Lido sempre do próprio `AttemptConfig`/`Scenario` recebido, nunca de outra
 * fonte: uma tentativa concluída passa seu próprio snapshot, então o nome
 * mostrado é o que valia quando ela rodou — não o nome atualmente editado na
 * preparação.
 */

import type { CharacterId, Scenario } from '../domain/types';

export function characterLabel(
  config: { scenario: Scenario; participantByCharacter: Partial<Record<CharacterId, string>> },
  characterId: CharacterId,
): string {
  const character = config.scenario.characters.find((candidate) => candidate.id === characterId);
  const fallback = character?.displayName ?? characterId;
  const participant = config.participantByCharacter[characterId]?.trim();
  return participant ? `${participant} · ${fallback}` : fallback;
}
