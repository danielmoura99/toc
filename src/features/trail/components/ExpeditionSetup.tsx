'use client';

/**
 * Configuração de uma nova expedição: quantas pessoas, quem são, e o sorteio
 * da configuração — substitui a entrada direta num cenário fixo.
 *
 * Três passos internos (tamanho → nomes → gerando); ao concluir, a tela
 * seguinte é a própria `Preparation` já existente, na etapa 1 — travada,
 * porque a expedição recém-gerada começa sempre observada antes de mexida
 * (ver `application/stages.ts` e `docs/decisions.md`). Não existe uma tela de
 * "revisão" separada: reaproveitar a preparação em modo bloqueado já cumpre
 * esse papel, com os mesmos componentes (`QueueEditor`, `BackpackEditor`) que
 * o resto do app usa.
 */

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Shuffle } from 'lucide-react';

import type { CharacterId, Scenario } from '../domain/types';
import { MAX_PARTY_SIZE, MIN_PARTY_SIZE, generateExpedition } from '../scenarios';
import { usePreparationStore } from '../application/preparationStore';

type Step = 'size' | 'names' | 'generating';

interface ExpeditionSetupProps {
  onDone: () => void;
}

export function ExpeditionSetup({ onDone }: ExpeditionSetupProps) {
  const [step, setStep] = useState<Step>('size');
  const [partySize, setPartySize] = useState<number | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [usedReserveNotice, setUsedReserveNotice] = useState(false);
  const startExpedition = usePreparationStore((state) => state.startExpedition);

  const chooseSize = (size: number) => {
    setPartySize(size);
    setNames((current) => {
      const next = current.slice(0, size);
      while (next.length < size) next.push('');
      return next;
    });
    setStep('names');
  };

  const canGenerate = partySize !== null && names.every((name) => name.trim().length > 0);

  const generate = async () => {
    if (!canGenerate || partySize === null) return;
    setStep('generating');

    const result = await generateExpedition(partySize);
    setUsedReserveNotice(result.usedReserve);

    const participantByCharacter = buildParticipantAssignment(result.scenario, names);
    startExpedition(result.scenario, participantByCharacter);
    onDone();
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 rounded-xl border bg-card p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Nova expedição
        </p>
        <h2 className="text-xl font-semibold">
          {step === 'size' && 'Quantas pessoas vão participar?'}
          {step === 'names' && 'Quem são os participantes?'}
          {step === 'generating' && 'Sorteando a expedição…'}
        </h2>
      </div>

      {step === 'size' && (
        <SizeStep min={MIN_PARTY_SIZE} max={MAX_PARTY_SIZE} onChoose={chooseSize} />
      )}

      {step === 'names' && partySize !== null && (
        <NamesStep
          names={names}
          onChange={setNames}
          onBack={() => setStep('size')}
          onSubmit={generate}
          canSubmit={canGenerate}
        />
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Sorteando ritmo, mochilas e ordem dentro de faixas calibradas — e conferindo se o
            resultado é adequado ao treino antes de aceitar.
          </p>
        </div>
      )}

      {usedReserveNotice && (
        <p role="status" className="text-xs text-muted-foreground">
          Nenhum sorteio dentro do orçamento de tentativas produziu uma configuração adequada;
          usamos uma configuração de reserva, calibrada para este tamanho de grupo.
        </p>
      )}
    </div>
  );
}

/** Cada nome, na ordem em que foi digitado, para o personagem de mesmo índice — sem relação com atributos. */
function buildParticipantAssignment(
  scenario: Scenario,
  names: string[],
): Partial<Record<CharacterId, string>> {
  const assignment: Partial<Record<CharacterId, string>> = {};
  scenario.characters.forEach((character, index) => {
    const name = names[index]?.trim();
    if (name) assignment[character.id] = name;
  });
  return assignment;
}

function SizeStep({
  min,
  max,
  onChoose,
}: {
  min: number;
  max: number;
  onChoose: (size: number) => void;
}) {
  const sizes = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Entre {min} e {max} pessoas. Cada uma representa um personagem da expedição.
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            className="rounded-md border px-3 py-3 text-lg font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => onChoose(size)}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}

function NamesStep({
  names,
  onChange,
  onBack,
  onSubmit,
  canSubmit,
}: {
  names: string[];
  onChange: (names: string[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  const setName = (index: number, value: string) => {
    const next = [...names];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Os nomes identificam quem representa cada personagem — as características de cada um são
        sorteadas à parte, sem relação com quem digitou o quê ou em que ordem.
      </p>

      <ol className="flex flex-col gap-2">
        {names.map((name, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <label className="flex-1">
              <span className="sr-only">Nome do participante {index + 1}</span>
              <input
                type="text"
                required
                maxLength={40}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={`Participante ${index + 1}`}
                value={name}
                onChange={(event) => setName(index, event.target.value)}
              />
            </label>
          </li>
        ))}
      </ol>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-accent"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          <Shuffle className="size-4" aria-hidden="true" />
          Gerar expedição
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
