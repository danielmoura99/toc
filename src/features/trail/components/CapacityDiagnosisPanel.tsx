'use client';

/**
 * Diagnóstico de restrição pela capacidade — evolução pedagógica, frente 1.
 *
 * Recolhido em `<details>` (acessível por teclado, igual a "Detalhes da
 * tentativa" em `TrailRun`) até a primeira caminhada da expedição concluir —
 * `defaultOpen` decide isso, vindo de `canAccessStage`/`hasCompletedFirstStage`,
 * a mesma condição que já libera as etapas 2 e 3. Nada aqui marca o
 * personagem no canvas: é só texto, nesta seção.
 */

import { diagnoseCapacity } from '../domain/diagnosis';
import type { AttemptConfig } from '../domain/types';
import { characterLabel } from './characterLabel';

interface CapacityDiagnosisPanelProps {
  config: AttemptConfig;
  defaultOpen: boolean;
}

export function CapacityDiagnosisPanel({ config, defaultOpen }: CapacityDiagnosisPanelProps) {
  const diagnosis = diagnoseCapacity(config);
  const single = diagnosis.candidateIds.length === 1;

  return (
    <details open={defaultOpen} className="rounded-lg border bg-card p-4 text-sm">
      <summary className="w-fit cursor-pointer select-none font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
        Ver diagnóstico
      </summary>
      <div className="mt-2">
        {single ? (
          <p>
            Com esta distribuição, <strong>{characterLabel(config, diagnosis.candidateIds[0])}</strong>{' '}
            tem o menor ritmo de referência:{' '}
            <strong>{diagnosis.referenceSpeedKmhByCharacter[diagnosis.candidateIds[0]].toFixed(1)} km/h</strong>.
            As flutuações e a dependência da fila também influenciam a execução.
          </p>
        ) : (
          <p>
            <strong>Capacidades próximas:</strong> não há uma única candidata clara —{' '}
            {diagnosis.candidateIds.map((id) => characterLabel(config, id)).join(', ')}. As
            flutuações e a dependência da fila também influenciam a execução.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Estimativa pela capacidade calculada, sem flutuação e antes da fila — não prova sozinha
          quem determina o tempo final do grupo.
        </p>
      </div>
    </details>
  );
}
