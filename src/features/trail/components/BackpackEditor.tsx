'use client';

/**
 * Redistribuição de carga entre mochilas.
 *
 * A interface agrupa a exibição por quantidade, mas cada unidade de 1 kg é um
 * item com ID próprio no domínio (R07): transferir move itens existentes, nunca
 * cria ou destrói peso. O total do cenário é constante por construção.
 *
 * Transferir 1, 3 ou todos é feito pelo mesmo controle.
 */

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { itemsOwnedBy } from '../domain/attempt';
import type { AttemptConfig, CharacterId, ItemId } from '../domain/types';
import { colorForCharacter } from './characterColors';

const TRANSFER_AMOUNTS = [1, 3] as const;

interface BackpackEditorProps {
  config: AttemptConfig;
  loads: Record<CharacterId, number>;
  disabled: boolean;
  onTransfer: (itemIds: ItemId[], toCharacterId: CharacterId) => void;
}

export function BackpackEditor({ config, loads, disabled, onTransfer }: BackpackEditorProps) {
  // Destino padrão: o segundo da fila, apenas para que o controle já venha
  // utilizável. O grupo escolhe o destino real.
  const [targetByCharacter, setTargetByCharacter] = useState<Record<CharacterId, CharacterId>>({});

  const totalKg = Object.values(loads).reduce((sum, value) => sum + value, 0);

  const transfer = (from: CharacterId, to: CharacterId, amount: number) => {
    const available = itemsOwnedBy(config, from);
    onTransfer(available.slice(0, amount), to);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Mochilas</h3>
        <p className="text-xs text-muted-foreground">
          Total do grupo: <span className="tabular-nums">{totalKg} kg</span> · constante
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {config.order.map((characterId) => {
          const character = config.scenario.characters.find((item) => item.id === characterId)!;
          const loadKg = loads[characterId] ?? 0;
          const isOverloaded = loadKg > character.maxLoadKg;
          const fillPct = Math.min(100, (loadKg / character.maxLoadKg) * 100);

          const others = config.order.filter((id) => id !== characterId);
          const target = targetByCharacter[characterId] ?? others[0];

          return (
            <li
              key={characterId}
              data-testid={`backpack-${characterId}`}
              className={`flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 ${
                isOverloaded ? 'border-destructive' : ''
              }`}
            >
              <span
                className="size-7 shrink-0 rounded-full border-2 border-background"
                style={{ backgroundColor: colorForCharacter(config.scenario, characterId) }}
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{character.displayName}</p>
                <div className="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      isOverloaded ? 'bg-destructive' : 'bg-primary'
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>

              <p
                className={`w-24 shrink-0 text-right text-sm tabular-nums ${
                  isOverloaded ? 'font-semibold text-destructive' : ''
                }`}
              >
                {loadKg} / {character.maxLoadKg} kg
              </p>

              <div className="flex items-center gap-1">
                <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />

                <label>
                  <span className="sr-only">Destino da carga de {character.displayName}</span>
                  <select
                    className="rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50"
                    value={target}
                    disabled={disabled}
                    onChange={(event) =>
                      setTargetByCharacter((current) => ({
                        ...current,
                        [characterId]: event.target.value,
                      }))
                    }
                  >
                    {others.map((id) => (
                      <option key={id} value={id}>
                        {config.scenario.characters.find((item) => item.id === id)!.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                {TRANSFER_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
                    disabled={disabled || loadKg < amount}
                    onClick={() => transfer(characterId, target, amount)}
                  >
                    {amount} kg
                  </button>
                ))}

                <button
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
                  disabled={disabled || loadKg === 0}
                  onClick={() => transfer(characterId, target, loadKg)}
                >
                  Tudo
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
