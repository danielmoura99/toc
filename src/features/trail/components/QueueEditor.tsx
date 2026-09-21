'use client';

/**
 * Ordenação da fila, da frente para trás.
 *
 * Duas formas equivalentes de reordenar, por exigência do AC12: arrastar e
 * soltar, e botões de posição operáveis por teclado. O drag-and-drop nunca é o
 * único caminho — numa projeção com o operador usando teclado, os botões são o
 * caminho principal.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

import type { AttemptConfig, CharacterId } from '../domain/types';
import { colorForCharacter } from './characterColors';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface QueueEditorProps {
  config: AttemptConfig;
  loads: Record<CharacterId, number>;
  disabled: boolean;
  onReorder: (order: CharacterId[]) => void;
  onMove: (characterId: CharacterId, direction: -1 | 1) => void;
  onParticipantChange: (characterId: CharacterId, name: string) => void;
}

export function QueueEditor({
  config,
  loads,
  disabled,
  onReorder,
  onMove,
  onParticipantChange,
}: QueueEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = config.order.indexOf(String(active.id));
    const to = config.order.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    onReorder(arrayMove(config.order, from, to));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Ordem da fila</h3>
        <p className="text-xs text-muted-foreground">
          Do primeiro ao último · ninguém ultrapassa quem está à frente
        </p>
      </div>

      <DndContext
        // ID estável: sem ele o dnd-kit deriva os ids de acessibilidade de um
        // contador de módulo, que diverge entre o render do servidor e o do
        // cliente e quebra a hidratação.
        id="trail-queue"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={config.order} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-1.5">
            {config.order.map((characterId, index) => (
              <SortableWalker
                key={characterId}
                characterId={characterId}
                index={index}
                total={config.order.length}
                config={config}
                loadKg={loads[characterId] ?? 0}
                disabled={disabled}
                onMove={onMove}
                onParticipantChange={onParticipantChange}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortableWalkerProps {
  characterId: CharacterId;
  index: number;
  total: number;
  config: AttemptConfig;
  loadKg: number;
  disabled: boolean;
  onMove: (characterId: CharacterId, direction: -1 | 1) => void;
  onParticipantChange: (characterId: CharacterId, name: string) => void;
}

function SortableWalker({
  characterId,
  index,
  total,
  config,
  loadKg,
  disabled,
  onMove,
  onParticipantChange,
}: SortableWalkerProps) {
  const reducedMotion = usePrefersReducedMotion();
  // `transition: null` desliga a animação de reposicionamento do dnd-kit —
  // tanto ao arrastar quanto ao reordenar pelos botões de posição, já que os
  // dois caminhos disparam o mesmo recálculo de layout (§9.2).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: characterId,
    disabled,
    transition: reducedMotion ? null : undefined,
  });

  const character = config.scenario.characters.find((item) => item.id === characterId)!;
  const participant = config.participantByCharacter[characterId] ?? '';
  const isOverloaded = loadKg > character.maxLoadKg;

  return (
    <li
      ref={setNodeRef}
      data-testid={`queue-${characterId}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border bg-background p-2 ${
        isDragging ? 'z-10 shadow-lg' : ''
      } ${isOverloaded ? 'border-destructive' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Arrastar ${character.displayName}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span
        className="size-7 shrink-0 rounded-full border-2 border-background"
        style={{ backgroundColor: colorForCharacter(config.scenario, characterId) }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <span className="text-muted-foreground">{index + 1}º</span> {character.displayName}
        </p>
        <p className="text-xs text-muted-foreground">
          {character.baseSpeedKmh} km/h sem carga · referência {character.referenceLoadKg} kg ·
          máximo {character.maxLoadKg} kg
        </p>
      </div>

      <label className="hidden sm:block">
        <span className="sr-only">Participante que representa {character.displayName}</span>
        <input
          type="text"
          className="w-32 rounded-md border bg-background px-2 py-1 text-xs"
          placeholder="Participante"
          value={participant}
          maxLength={40}
          onChange={(event) => onParticipantChange(characterId, event.target.value)}
        />
      </label>

      <p
        className={`w-16 shrink-0 text-right text-sm tabular-nums ${
          isOverloaded ? 'font-semibold text-destructive' : ''
        }`}
      >
        {loadKg} kg
      </p>

      {/* Alternativa por teclado ao arrastar e soltar. */}
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
          aria-label={`Mover ${character.displayName} para frente`}
          disabled={disabled || index === 0}
          onClick={() => onMove(characterId, -1)}
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-accent disabled:opacity-30"
          aria-label={`Mover ${character.displayName} para trás`}
          disabled={disabled || index === total - 1}
          onClick={() => onMove(characterId, 1)}
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
    </li>
  );
}
