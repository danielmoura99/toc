/**
 * Identificação de um setor na interface (guia §1.1): "Pintura · Ana" — nome
 * do setor primeiro, nome de quem representa depois, separados por "·". Sem
 * nome de participante preenchido, mostra só o setor (§1.1: "Sem nome,
 * mostrar apenas o setor e seu número").
 */

import type { StageDefinition } from '../domain/types';

export function stageLabel(stage: StageDefinition): string {
  const participant = stage.participantName.trim();
  return participant ? `${stage.sectorName} · ${participant}` : stage.sectorName;
}
