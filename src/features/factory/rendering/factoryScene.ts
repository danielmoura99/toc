/**
 * Cena PixiJS da linha de produção (guia §7 "Linha de produção").
 *
 * Cada setor é um "espaço": pilha de lotes aguardando à esquerda, operador no
 * meio, bancada com o dado à direita, e uma esteira até o próximo setor. Os
 * lotes transferidos viajam pela esteira até a pilha seguinte (ou ao caminhão
 * de expedição).
 *
 * O domínio continua sendo a única fonte de verdade: a cena só reproduz os
 * `TurnEvent` já calculados. A animação do dado é decorativa (§5) — a face
 * final é sempre `event.die`. Os eventos são reproduzidos um por vez, em
 * ordem (§7: "não exibir mais de uma transferência lógica simultânea"); ao
 * pausar, `settle()` leva o desenho direto ao último estado confirmado.
 */

import { Application, Container, Graphics, Text, type Ticker } from 'pixi.js';

import type { CapacityProfile, Experience, ProductionLineState, StageDefinition, StageId, TurnEvent } from '../domain/types';
import { REFERENCE_CAPACITY_PER_ROUND } from '../domain/types';

export interface CreateFactorySceneOptions {
  stages: StageDefinition[];
  reducedMotion: boolean;
  /** "Restrição e fluxo": o dado é só o componente variável — a cena mostra a soma (§4.3). */
  experience?: Experience;
  capacityProfiles?: CapacityProfile[];
  onPresentation?: (busy: boolean, stageIndex: number | null) => void;
}

// Layout em unidades de mundo, antes da escala.
const PAD = 190;
const ROW_GAP = 64;
const COLUMNS = 3;
const MARKER_SPACE = 26;
const ST_W = 156;
const ST_H = 190;
const GAP = 52;
const DOCK_W = 124;
const HEADER_H = 24;
const FLOOR_Y = 150;
const BELT_Y = FLOOR_Y - 14;
const BELT_H = 8;
const TABLE_X = 112;
const TABLE_W = 38;
const TABLE_TOP = FLOOR_Y - 28;
const OPERATOR_X = 92;
const PILE_X = 8;
const PILE_W = 68;
const CRATE_W = 13;
const CRATE_H = 10;
const PILE_COLS = 4;
const PILE_ROWS = 4;
const DOCK_COLS = 5;
const DOCK_ROWS = 4;
const SUPPLY_CRATES = 12;
const DIE_SIZE = 32;

// Legibilidade na projeção vem antes de caber tudo: abaixo disso, rola (§7).
const MIN_SCALE = 0.8;
const MAX_FLIGHTS = 5;
const QUEUE_LIMIT = 12;
const ROLL_FRACTION = 0.3;
const FLIGHT_FRACTION = 0.46;

const OPERATOR_COLORS = [
  0x2563eb, 0x16a34a, 0xdc2626, 0x9333ea, 0xea580c, 0x0891b2,
  0xdb2777, 0x65a30d, 0x4f46e5, 0xca8a04, 0x0d9488, 0x7c3aed,
];

interface Palette {
  wall: number;
  wallStroke: number;
  floor: number;
  floorLine: number;
  window: number;
  header: number;
  headerActive: number;
  headerText: number;
  text: number;
  muted: number;
  belt: number;
  roller: number;
  chevron: number;
  crate: number;
  crateStroke: number;
  crateTape: number;
  pallet: number;
  table: number;
  die: number;
  dieStroke: number;
  pip: number;
  highlight: number;
  bubble: number;
  bubbleStroke: number;
  truckBody: number;
  truckStroke: number;
  truckCab: number;
  wheel: number;
  tag: number;
  tagStroke: number;
  skin: number;
  eye: number;
  legs: number;
  shoe: number;
  hat: number;
  hatBrim: number;
}

const LIGHT: Palette = {
  wall: 0xf5efe0,
  wallStroke: 0xcbbf9f,
  floor: 0xd9cfb6,
  floorLine: 0x9c8c63,
  window: 0xbfdbfe,
  header: 0x334155,
  headerActive: 0x2563eb,
  headerText: 0xffffff,
  text: 0x2a2620,
  muted: 0x6b6349,
  belt: 0x475569,
  roller: 0x94a3b8,
  chevron: 0xcbd5e1,
  crate: 0xd9a066,
  crateStroke: 0x8a5a2b,
  crateTape: 0xf3d9a8,
  pallet: 0x8a5a2b,
  table: 0x64748b,
  die: 0xffffff,
  dieStroke: 0x334155,
  pip: 0x111827,
  highlight: 0xf59e0b,
  bubble: 0xffffff,
  bubbleStroke: 0x94a3b8,
  truckBody: 0xf8fafc,
  truckStroke: 0x64748b,
  truckCab: 0x2563eb,
  wheel: 0x1f2937,
  tag: 0xffffff,
  tagStroke: 0xcbbf9f,
  skin: 0xf1c27d,
  eye: 0x1f2937,
  legs: 0x334155,
  shoe: 0x1f2937,
  hat: 0xfacc15,
  hatBrim: 0xca8a04,
};

const DARK: Palette = {
  ...LIGHT,
  wall: 0x2a2620,
  wallStroke: 0x4b4436,
  floor: 0x3a342a,
  floorLine: 0x6b6349,
  window: 0x1e3a5f,
  header: 0x1e293b,
  text: 0xf1ede1,
  muted: 0xbfae87,
  belt: 0x334155,
  roller: 0x64748b,
  chevron: 0x94a3b8,
  pallet: 0x6b4423,
  table: 0x475569,
  bubble: 0x1f2937,
  bubbleStroke: 0x475569,
  truckBody: 0xe2e8f0,
  tag: 0x1f2937,
  tagStroke: 0x4b4436,
  legs: 0x475569,
};

const FONT = 'system-ui, sans-serif';

function prefersDarkTheme(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function lotLabel(count: number): string {
  return count === 1 ? 'lote' : 'lotes';
}

function drawCrate(g: Graphics, p: Palette, x: number, y: number): void {
  g.rect(x, y, CRATE_W, CRATE_H).fill(p.crate).stroke({ width: 1, color: p.crateStroke });
  g.rect(x + CRATE_W / 2 - 1, y, 2, CRATE_H).fill(p.crateTape);
}

function drawCrateStack(g: Graphics, p: Palette, left: number, baseY: number, count: number, cols: number): void {
  for (let c = 0; c < count; c += 1) {
    const col = c % cols;
    const row = Math.floor(c / cols);
    drawCrate(g, p, left + col * (CRATE_W + 3), baseY - (row + 1) * (CRATE_H + 1));
  }
}

function stackTopY(baseY: number, count: number, cols: number, rows: number): number {
  const shownRows = Math.min(rows, Math.ceil(count / cols));
  return baseY - shownRows * (CRATE_H + 1);
}

const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.5], [0.73, 0.5], [0.27, 0.73], [0.73, 0.73]],
};

function drawDie(
  g: Graphics,
  p: Palette,
  x: number,
  y: number,
  face: number | null,
  highlight: boolean,
  alpha: number,
): void {
  if (face === null) {
    g.roundRect(x, y, DIE_SIZE, DIE_SIZE, 4).stroke({ width: 1, color: p.dieStroke, alpha: 0.3 });
    return;
  }
  g.roundRect(x, y, DIE_SIZE, DIE_SIZE, 4)
    .fill({ color: p.die, alpha })
    .stroke({ width: highlight ? 2.5 : 1, color: highlight ? p.highlight : p.dieStroke, alpha });
  for (const [px, py] of PIP_LAYOUTS[face] ?? []) {
    g.circle(x + px * DIE_SIZE, y + py * DIE_SIZE, DIE_SIZE * 0.09).fill({ color: p.pip, alpha });
  }
}

/** Operador de perfil, virado para a bancada. `reach` (0–1) estende o braço até ela. */
function drawOperator(
  g: Graphics,
  p: Palette,
  cx: number,
  footY: number,
  color: number,
  bob: number,
  reach: number,
): void {
  g.rect(cx - 6, footY - 14, 5, 14).fill(p.legs);
  g.rect(cx + 1, footY - 14, 5, 14).fill(p.legs);
  g.rect(cx - 7, footY - 3, 7, 3).fill(p.shoe);
  g.rect(cx + 1, footY - 3, 8, 3).fill(p.shoe);

  const top = footY - 34 + bob;
  g.moveTo(cx - 7, top + 4).lineTo(cx - 10, top + 17).stroke({ width: 4, color, cap: 'round' });
  g.roundRect(cx - 9, top, 18, 21, 4).fill(color);
  g.rect(cx - 4, top + 7, 8, 5).fill({ color: 0xffffff, alpha: 0.25 });

  const handX = cx + 13 + 9 * reach;
  const handY = top + 14 - 6 * reach;
  g.moveTo(cx + 6, top + 4).lineTo(handX, handY).stroke({ width: 4, color, cap: 'round' });
  g.circle(handX, handY, 2.5).fill(p.skin);

  const headY = top - 8;
  g.circle(cx, headY, 7.5).fill(p.skin);
  g.circle(cx + 2, headY, 1.1).fill(p.eye);
  g.circle(cx + 5, headY, 1.1).fill(p.eye);
  g.roundRect(cx - 8, headY - 10, 16, 7, 4).fill(p.hat);
  g.rect(cx - 8, headY - 4.5, 19, 2).fill(p.hatBrim);
}

interface StationTexts {
  header: Text;
  name: Text | null;
  count: Text;
  overflow: Text;
  bubble: Text;
  dieValue: Text;
  meanLabel: Text | null;
}

interface PlayingEvent {
  event: TurnEvent;
  elapsed: number;
  duration: number;
}

interface Bubble {
  text: string;
  untilMs: number;
}

interface Point {
  x: number;
  y: number;
}

export class FactoryScene {
  readonly canvas: HTMLCanvasElement;

  private readonly app: Application;
  private readonly stages: StageDefinition[];
  private readonly reducedMotion: boolean;
  private readonly palette: Palette;
  private readonly world = new Container();
  private readonly staticG = new Graphics();
  private readonly pileG = new Graphics();
  private readonly dynamicG = new Graphics();
  private readonly stationTexts: StationTexts[] = [];
  private readonly dockCount: Text;
  private readonly dockOverflow: Text;
  private readonly marker: Text;
  private readonly contentW: number;
  private readonly contentH: number;
  private scale = 1;

  // Modelo visual: o que o desenho mostra agora. Converge para o estado do
  // motor à medida que os eventos pendentes são reproduzidos.
  private visInv: Record<StageId, number> = {};
  private visDelivered = 0;
  private lastDie: Array<number | null>;
  private bubbles: Array<Bubble | null>;
  private lastEventCount = -1;
  private queue: TurnEvent[] = [];
  private playing: PlayingEvent | null = null;
  private baseDurationMs = 700;
  private stateActiveIndex: number | null = null;
  private highlightIndex: number | null = null;
  private timeMs = 0;
  private disposed = false;
  private readonly onPresentation: CreateFactorySceneOptions['onPresentation'];
  private readonly isConstraintFlow: boolean;
  private readonly profiles: CapacityProfile[];

  private constructor(app: Application, options: CreateFactorySceneOptions) {
    this.app = app;
    this.canvas = app.canvas;
    this.canvas.style.display = 'block';
    this.stages = options.stages;
    this.onPresentation = options.onPresentation;
    this.isConstraintFlow = options.experience === 'constraint-flow';
    this.profiles = this.stages.map(
      (stage) => options.capacityProfiles?.find((profile) => profile.stageId === stage.id) ?? { stageId: stage.id, baseBonus: 0, upgrade: 0 },
    );
    this.reducedMotion = options.reducedMotion;
    this.palette = prefersDarkTheme() ? DARK : LIGHT;
    this.lastDie = this.stages.map(() => null);
    this.bubbles = this.stages.map(() => null);
    this.contentW = PAD * 2 + COLUMNS * ST_W + (COLUMNS - 1) * GAP;
    this.contentH = MARKER_SPACE + Math.ceil(this.stages.length / COLUMNS) * (ST_H + ROW_GAP) - ROW_GAP + 16;

    const p = this.palette;
    app.stage.addChild(this.world);
    this.world.addChild(this.staticG, this.pileG, this.dynamicG);

    this.stages.forEach((stage, i) => {
      const x = this.stationX(i);
      const y = this.stationY(i);

      const header = new Text({
        text: `${i + 1}. ${stage.sectorName}`,
        style: { fontFamily: FONT, fontSize: 11, fontWeight: '700', fill: p.headerText },
      });
      header.anchor.set(0.5);
      header.position.set(x + ST_W / 2, y + HEADER_H / 2);
      if (header.width > ST_W - 12) header.scale.set((ST_W - 12) / header.width);

      const participant = stage.participantName.trim();
      const name = participant
        ? new Text({
            text: truncate(participant, 16),
            style: { fontFamily: FONT, fontSize: 10, fontWeight: '600', fill: p.text },
          })
        : null;
      name?.position.set(x + 11, y + HEADER_H + 9);

      const count = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: p.text } });
      count.position.set(x + 7, y + FLOOR_Y + 12);

      const overflow = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: p.muted } });
      overflow.anchor.set(1, 1);

      const bubble = new Text({ text: '', style: { fontFamily: FONT, fontSize: 9.5, fontWeight: '600', fill: p.text } });
      bubble.anchor.set(0.5);
      bubble.visible = false;

      const dieValue = new Text({
        text: 'Dado: —',
        style: { fontFamily: FONT, fontSize: this.isConstraintFlow ? 13 : 17, fontWeight: '800', fill: p.text },
      });
      dieValue.position.set(x + 10, y + 52);

      const profile = this.profiles[i];
      const meanLabel = this.isConstraintFlow
        ? new Text({
            text: `Média ${(REFERENCE_CAPACITY_PER_ROUND + profile.baseBonus + profile.upgrade).toLocaleString('pt-BR')} lotes/dia${
              profile.upgrade ? ` · melhoria +${profile.upgrade}` : ''
            }`,
            style: { fontFamily: FONT, fontSize: 9.5, fontWeight: '600', fill: profile.upgrade ? p.headerActive : p.muted },
          })
        : null;
      meanLabel?.position.set(x + 7, y + FLOOR_Y + 25);

      this.world.addChild(header, count, overflow, bubble, dieValue);
      if (name) this.world.addChild(name);
      if (meanLabel) this.world.addChild(meanLabel);
      this.stationTexts.push({ header, name, count, overflow, bubble, dieValue, meanLabel });
    });

    const dx = this.dockX();
    const dockHeader = new Text({
      text: 'Cliente',
      style: { fontFamily: FONT, fontSize: 11, fontWeight: '700', fill: p.headerText },
    });
    dockHeader.anchor.set(0.5);
    dockHeader.position.set(dx + DOCK_W / 2, this.dockY() + HEADER_H / 2);

    this.dockCount = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: p.text } });
    this.dockCount.position.set(dx + 6, this.dockY() + FLOOR_Y + 12);

    this.dockOverflow = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fontWeight: '700', fill: p.muted } });
    this.dockOverflow.anchor.set(1, 1);

    this.marker = new Text({
      text: '▼ próximo',
      style: { fontFamily: FONT, fontSize: 11, fontWeight: '700', fill: p.headerActive },
    });
    this.marker.anchor.set(0.5);
    this.marker.visible = false;

    this.world.addChild(dockHeader, this.dockCount, this.dockOverflow, this.marker);

    this.drawStatic();
    this.drawPiles();
    this.drawDynamic();

    if (!this.reducedMotion) {
      this.app.ticker.add(this.onTick);
    }
  }

  static async create(options: CreateFactorySceneOptions): Promise<FactoryScene> {
    const app = new Application();
    await app.init({
      width: 640,
      height: 240,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    return new FactoryScene(app, options);
  }

  /**
   * Ajusta a escala à largura disponível. Abaixo de `MIN_SCALE` não encolhe
   * mais: o canvas fica mais largo que o contêiner e a faixa rola (§7).
   */
  fit(hostWidth: number): void {
    if (this.disposed || hostWidth <= 0) return;
    this.scale = Math.max(MIN_SCALE, Math.min(1, hostWidth / this.contentW));
    const scaledW = this.contentW * this.scale;
    const width = Math.max(hostWidth, Math.ceil(scaledW));
    const height = Math.ceil(this.contentH * this.scale);
    this.world.scale.set(this.scale);
    this.world.x = width > scaledW ? (width - scaledW) / 2 : 0;
    this.app.renderer.resize(width, height);
  }

  /** Centro horizontal de um setor, em pixels do canvas — para acompanhar a etapa ativa ao rolar. */
  stationCenterX(index: number): number {
    return this.world.x + (this.stationX(index) + ST_W / 2) * this.scale;
  }

  stationCenterY(index: number): number {
    return (this.stationY(index) + ST_H / 2) * this.scale;
  }

  setTempo(baseDurationMs: number): void {
    this.baseDurationMs = Math.max(160, baseDurationMs);
  }

  render(state: ProductionLineState, activeStageIndex: number | null): void {
    if (this.disposed) return;
    this.stateActiveIndex = activeStageIndex;
    const events = state.events;

    // Primeira leitura (inclusive partida recuperada), partida reiniciada ou
    // movimento reduzido: vai direto ao estado, sem reproduzir histórico.
    if (this.lastEventCount < 0 || events.length < this.lastEventCount || this.reducedMotion) {
      this.snap(state);
      return;
    }

    for (let i = this.lastEventCount; i < events.length; i += 1) this.queue.push(events[i]);
    this.lastEventCount = events.length;

    if (this.queue.length > QUEUE_LIMIT) {
      this.landPlaying();
      while (this.queue.length > QUEUE_LIMIT) this.applyLanding(this.queue.shift()!);
      this.drawPiles();
    }

    if (!this.playing && this.queue.length === 0) this.setHighlight(activeStageIndex);
    this.onPresentation?.(this.playing !== null || this.queue.length > 0, this.playing?.event.stageIndex ?? this.queue[0]?.stageIndex ?? activeStageIndex);
  }

  /** Conclui na hora tudo o que estava pendente — usado ao pausar (§6). */
  settle(): void {
    if (this.disposed) return;
    this.landPlaying();
    while (this.queue.length > 0) this.applyLanding(this.queue.shift()!);
    for (let i = 0; i < this.bubbles.length; i += 1) this.bubbles[i] = null;
    this.setHighlight(this.stateActiveIndex);
    this.drawPiles();
    this.drawDynamic();
    this.onPresentation?.(false, this.stateActiveIndex);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.ticker.remove(this.onTick);
    this.app.destroy(true, { children: true, texture: true });
  }

  // ─── Modelo visual ───────────────────────────────────────────────────────

  private snap(state: ProductionLineState): void {
    this.playing = null;
    this.queue = [];
    this.visInv = { ...state.inventoryByStage };
    this.visDelivered = state.delivered;
    this.lastDie = this.stages.map(() => null);
    for (const event of state.events) this.lastDie[event.stageIndex] = event.die;
    for (let i = 0; i < this.bubbles.length; i += 1) this.bubbles[i] = null;
    this.lastEventCount = state.events.length;
    this.setHighlight(this.stateActiveIndex);
    this.drawPiles();
    this.drawDynamic();
    this.onPresentation?.(false, this.stateActiveIndex);
  }

  private applyLanding(event: TurnEvent): void {
    this.visInv = { ...event.inventoryAfter };
    this.visDelivered = event.deliveredTotal;
    this.lastDie[event.stageIndex] = event.die;
  }

  private landPlaying(): void {
    if (!this.playing) return;
    this.applyLanding(this.playing.event);
    this.playing = null;
  }

  private durationFor(pending: number): number {
    if (pending <= 1) return this.baseDurationMs;
    return Math.max(160, Math.min(this.baseDurationMs, 1400 / pending));
  }

  private startNext(): void {
    const event = this.queue.shift();
    if (!event) return;
    const duration = this.durationFor(this.queue.length + 1);
    this.playing = { event, elapsed: 0, duration };

    // Os lotes saem da pilha do remetente no início; chegam ao destino só no fim.
    if (event.stageIndex > 0) {
      this.visInv = { ...this.visInv, [event.stageId]: event.inventoryAfter[event.stageId] };
    }

    const bubbleText =
      event.transferred === 0
        ? 'sem material'
        : event.availableBefore !== null && event.transferred < event.availableCapacity
          ? `havia só ${event.availableBefore}`
          : null;
    this.bubbles[event.stageIndex] = bubbleText ? { text: bubbleText, untilMs: this.timeMs + duration + 700 } : null;

    this.setHighlight(event.stageIndex);
    this.onPresentation?.(true, event.stageIndex);
    this.drawPiles();
  }

  private onTick = (ticker: Ticker): void => {
    this.update(Math.min(100, ticker.deltaMS));
  };

  private update(deltaMs: number): void {
    if (this.disposed) return;
    this.timeMs += deltaMs;

    if (!this.playing && this.queue.length > 0) this.startNext();

    if (this.playing) {
      this.playing.elapsed += deltaMs;
      if (this.playing.elapsed >= this.playing.duration) {
        this.landPlaying();
        this.drawPiles();
        if (this.queue.length > 0) this.startNext();
        else {
          this.setHighlight(this.stateActiveIndex);
          this.onPresentation?.(false, this.stateActiveIndex);
        }
      }
    }

    this.drawDynamic();
  }

  /** "Dado: 4" na experiência antiga; "Dado 4 + 2 + 1 = 7" quando há capacidade adicional (§4.3). */
  private dieText(index: number, face: number | null): string {
    if (!this.isConstraintFlow) return `Dado: ${face ?? '-'}`;
    const { baseBonus, upgrade } = this.profiles[index];
    const extra = baseBonus + upgrade;
    if (face === null) return extra ? `Capacidade ${1 + extra}–${6 + extra}` : 'Capacidade 1–6';
    const parts = [`Dado ${face}`];
    if (baseBonus) parts.push(String(baseBonus));
    if (upgrade) parts.push(String(upgrade));
    return extra ? `${parts.join(' + ')} = ${face + extra}` : `Dado ${face} = ${face}`;
  }

  private setHighlight(index: number | null): void {
    if (index === this.highlightIndex) return;
    this.highlightIndex = index;
    this.drawStatic();
  }

  // ─── Geometria ───────────────────────────────────────────────────────────

  private stationX(index: number): number {
    const row = Math.floor(index / COLUMNS);
    const col = row % 2 === 0 ? index % COLUMNS : COLUMNS - 1 - index % COLUMNS;
    return PAD + col * (ST_W + GAP);
  }

  private stationY(index: number): number {
    return MARKER_SPACE + Math.floor(index / COLUMNS) * (ST_H + ROW_GAP);
  }

  private direction(index: number): number {
    return Math.floor(index / COLUMNS) % 2 === 0 ? 1 : -1;
  }

  private dockX(): number {
    const last = this.stages.length - 1;
    return this.stationX(last) + (this.direction(last) > 0 ? ST_W + GAP : -GAP - DOCK_W);
  }

  private dockY(): number {
    return this.stationY(this.stages.length - 1);
  }

  /** Mesmo caminho para a esteira e os lotes, inclusive nas curvas entre linhas. */
  private beltPoint(index: number, t: number): Point {
    const direction = this.direction(index);
    const x = this.stationX(index) + (direction > 0 ? ST_W : 0);
    const y = this.stationY(index) + BELT_Y + BELT_H / 2;
    const last = index === this.stages.length - 1;
    const nextX = last ? this.dockX() + (direction > 0 ? 0 : DOCK_W) : this.stationX(index + 1) + (this.direction(index + 1) > 0 ? 0 : ST_W);
    const nextY = (last ? this.dockY() : this.stationY(index + 1)) + BELT_Y + BELT_H / 2;
    if (nextY === y) return { x: x + (nextX - x) * t, y };
    // Bézier em U: tangentes horizontais e inversão do sentido na linha seguinte.
    const reach = direction * 112;
    const a = 1 - t;
    return { x: a*a*a*x + 3*a*a*t*(x+reach) + 3*a*t*t*(nextX+reach) + t*t*t*nextX,
      y: a*a*a*y + 3*a*a*t*y + 3*a*t*t*nextY + t*t*t*nextY };
  }

  private flightPoint(stageIndex: number, u: number): Point {
    const y = this.stationY(stageIndex);
    const sx = this.stationX(stageIndex);
    const isLast = stageIndex === this.stages.length - 1;
    const nx = isLast ? this.dockX() : this.stationX(stageIndex + 1);

    const start: Point = { x: sx + TABLE_X + TABLE_W / 2, y: y + TABLE_TOP - 2 };
    const beltStart = this.beltPoint(stageIndex, 0);
    const beltEnd = this.beltPoint(stageIndex, 1);
    const nextY = isLast ? this.dockY() : this.stationY(stageIndex + 1);
    const end: Point = isLast
      ? { x: nx + 30, y: nextY + FLOOR_Y - 18 }
      : {
          x: nx + PILE_X + PILE_W / 2,
          y: stackTopY(
            nextY + FLOOR_Y - 6,
            this.visInv[this.stages[stageIndex + 1].id] ?? 0,
            PILE_COLS,
            PILE_ROWS,
          ),
        };

    const lerp = (a: Point, b: Point, t: number, arc: number): Point => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * arc,
    });

    if (u < 0.25) return lerp(start, beltStart, u / 0.25, 12);
    if (u < 0.75) return this.beltPoint(stageIndex, (u - 0.25) / 0.5);
    return lerp(beltEnd, end, (u - 0.75) / 0.25, 10);
  }

  // ─── Desenho ─────────────────────────────────────────────────────────────

  private drawStatic(): void {
    const g = this.staticG;
    const p = this.palette;
    const y = this.dockY();
    g.clear();

    this.stages.forEach((_, i) => {
      const x = this.stationX(i);
      const y = this.stationY(i);
      const active = i === this.highlightIndex;
      const headerColor = active ? p.headerActive : p.header;

      g.roundRect(x, y, ST_W, ST_H, 8).fill(p.wall);
      g.rect(x, y + FLOOR_Y, ST_W, ST_H - FLOOR_Y - 6).fill(p.floor);
      g.roundRect(x, y + ST_H - 12, ST_W, 12, 8).fill(p.floor);
      g.rect(x, y + FLOOR_Y - 1, ST_W, 3).fill(p.floorLine);

      g.roundRect(x + ST_W - 46, y + HEADER_H + 10, 16, 14, 2).fill(p.window).stroke({ width: 1, color: p.wallStroke });
      g.roundRect(x + ST_W - 26, y + HEADER_H + 10, 16, 14, 2).fill(p.window).stroke({ width: 1, color: p.wallStroke });

      g.roundRect(x, y, ST_W, HEADER_H, 8).fill(headerColor);
      g.rect(x, y + HEADER_H - 8, ST_W, 8).fill(headerColor);

      g.roundRect(x, y, ST_W, ST_H, 8).stroke({ width: active ? 3 : 1, color: active ? p.headerActive : p.wallStroke });

      g.rect(x + TABLE_X, y + TABLE_TOP, TABLE_W, 5).fill(p.table);
      g.rect(x + TABLE_X + 3, y + TABLE_TOP + 5, 3, FLOOR_Y - TABLE_TOP - 5).fill(p.table);
      g.rect(x + TABLE_X + TABLE_W - 6, y + TABLE_TOP + 5, 3, FLOOR_Y - TABLE_TOP - 5).fill(p.table);

      g.rect(x + PILE_X, y + FLOOR_Y - 6, PILE_W, 6).fill(p.pallet);

      const name = this.stationTexts[i]?.name;
      if (name) {
        g.roundRect(x + 6, y + HEADER_H + 6, name.width + 10, 16, 8).fill(p.tag).stroke({ width: 1, color: p.tagStroke });
      }

      // Esteira até o próximo setor (ou até o caminhão, depois do último).
      const start = this.beltPoint(i, 0);
      for (const [width, color] of [[BELT_H + 4, p.roller], [BELT_H, p.belt]]) {
        g.moveTo(start.x, start.y);
        for (let step = 1; step <= 40; step++) {
          const point = this.beltPoint(i, step / 40);
          g.lineTo(point.x, point.y);
        }
        g.stroke({ width, color, cap: 'round', join: 'round' });
      }
    });

    // Doca de expedição: cliente e caminhão.
    const dx = this.dockX();
    g.roundRect(dx, y, DOCK_W, HEADER_H, 8).fill(p.header);
    g.roundRect(dx, y + FLOOR_Y, DOCK_W, ST_H - FLOOR_Y, 6).fill(p.floor);
    g.rect(dx, y + FLOOR_Y - 1, DOCK_W, 3).fill(p.floorLine);
    g.roundRect(dx + 4, y + FLOOR_Y - 78, 84, 62, 4).fill(p.truckBody).stroke({ width: 1.5, color: p.truckStroke });
    g.roundRect(dx + 88, y + FLOOR_Y - 50, 30, 34, 5).fill(p.truckCab);
    g.rect(dx + 96, y + FLOOR_Y - 46, 16, 12).fill(p.window);
    g.rect(dx + 4, y + FLOOR_Y - 16, 114, 6).fill(p.wheel);
    for (const wx of [dx + 22, dx + 100]) {
      g.circle(wx, y + FLOOR_Y - 8, 8).fill(p.wheel);
      g.circle(wx, y + FLOOR_Y - 8, 3).fill(p.roller);
    }
  }

  private drawPiles(): void {
    const g = this.pileG;
    const p = this.palette;
    const y = this.dockY();
    g.clear();

    this.stages.forEach((stage, i) => {
      const x = this.stationX(i);
      const y = this.stationY(i);
      const baseY = y + FLOOR_Y - 6;
      const texts = this.stationTexts[i];
      const left = x + PILE_X + 2;

      if (i === 0) {
        drawCrateStack(g, p, left, baseY, SUPPLY_CRATES, PILE_COLS);
        texts.count.text = 'Entrada disponível';
        texts.overflow.text = '∞';
        texts.overflow.visible = true;
        texts.overflow.position.set(x + PILE_X + PILE_W, stackTopY(baseY, SUPPLY_CRATES, PILE_COLS, PILE_ROWS) - 1);
        return;
      }

      const count = this.visInv[stage.id] ?? 0;
      const shown = Math.min(count, PILE_COLS * PILE_ROWS);
      drawCrateStack(g, p, left, baseY, shown, PILE_COLS);
      texts.count.text = `Aguardando: ${count} ${lotLabel(count)}`;
      texts.overflow.visible = count > shown;
      texts.overflow.text = `+${count - shown}`;
      texts.overflow.position.set(x + PILE_X + PILE_W, stackTopY(baseY, shown, PILE_COLS, PILE_ROWS) - 1);
    });

    const dx = this.dockX();
    const cargoBase = y + FLOOR_Y - 18;
    const shown = Math.min(this.visDelivered, DOCK_COLS * DOCK_ROWS);
    drawCrateStack(g, p, dx + 8, cargoBase, shown, DOCK_COLS);
    this.dockCount.text = `Expedidos: ${this.visDelivered} ${lotLabel(this.visDelivered)}`;
    this.dockOverflow.visible = this.visDelivered > shown;
    this.dockOverflow.text = `+${this.visDelivered - shown}`;
    this.dockOverflow.position.set(dx + 86, y + FLOOR_Y - 80);
  }

  private drawDynamic(): void {
    const g = this.dynamicG;
    const p = this.palette;
    const t = this.timeMs;
    const playing = this.playing;
    const event = playing?.event ?? null;
    const progress = playing ? Math.min(1, playing.elapsed / playing.duration) : 0;
    g.clear();

    this.stages.forEach((_, i) => {
      const x = this.stationX(i);
      const y = this.stationY(i);
      const isCurrent = event?.stageIndex === i;

      // Divisas da esteira — andam só enquanto há lotes passando por ela.
      const moving = isCurrent && (event?.transferred ?? 0) > 0;
      const offset = moving ? (t / 1200) % 0.12 : 0;
      const count = (i + 1) % COLUMNS === 0 && i < this.stages.length - 1 ? 16 : 4;
      for (let step = 0; step < count; step++) {
        const u = (step / count + offset) % 1;
        const point = this.beltPoint(i, u);
        const ahead = this.beltPoint(i, Math.min(1, u + 0.01));
        const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        g.moveTo(point.x - dx * 3 - dy * 2, point.y - dy * 3 + dx * 2)
          .lineTo(point.x, point.y)
          .lineTo(point.x - dx * 3 + dy * 2, point.y - dy * 3 - dx * 2)
          .stroke({ width: 1.5, color: p.chevron });
      }

      const bob = this.reducedMotion ? 0 : isCurrent ? Math.sin(t / 60) * 1.5 : Math.sin(t / 700 + i) * 0.8;
      const reach = isCurrent && !this.reducedMotion ? 0.6 + 0.4 * Math.sin(t / 90) : 0;
      drawOperator(g, p, x + OPERATOR_X, y + FLOOR_Y, OPERATOR_COLORS[i % OPERATOR_COLORS.length], bob, reach);

      const dieX = x + TABLE_X + 3;
      const dieY = y + TABLE_TOP - DIE_SIZE - 1;
      if (isCurrent && playing && event) {
        const rolling = progress < ROLL_FRACTION;
        const face = rolling ? ((Math.floor(playing.elapsed / 55) + i) % 6) + 1 : event.die;
        const jump = rolling ? -Math.abs(Math.sin(playing.elapsed / 55)) * 6 : 0;
        drawDie(g, p, dieX, dieY + jump, face, !rolling, 1);
      } else {
        drawDie(g, p, dieX, dieY, this.lastDie[i], false, 0.65);
      }

      const value = this.stationTexts[i].dieValue;
      const rolling = isCurrent && progress < ROLL_FRACTION;
      const face = isCurrent && event ? event.die : this.lastDie[i];
      value.text = rolling ? 'Sorteando...' : this.dieText(i, face);
      value.style.fill = isCurrent ? p.headerActive : p.text;

      const bubble = this.bubbles[i];
      const bubbleText = this.stationTexts[i].bubble;
      if (bubble && t <= bubble.untilMs) {
        bubbleText.text = bubble.text;
        bubbleText.visible = true;
        const cx = x + OPERATOR_X;
        const top = y + FLOOR_Y - 78;
        const w = bubbleText.width + 12;
        g.roundRect(cx - w / 2, top, w, 17, 8).fill(p.bubble).stroke({ width: 1, color: p.bubbleStroke });
        g.poly([cx - 4, top + 17, cx + 4, top + 17, cx, top + 22]).fill(p.bubble);
        bubbleText.position.set(cx, top + 8.5);
      } else {
        bubbleText.visible = false;
      }
    });

    // Lotes em trânsito do setor atual até o próximo.
    if (event && event.transferred > 0) {
      const flights = Math.min(event.transferred, MAX_FLIGHTS);
      for (let k = 0; k < flights; k += 1) {
        const start = ROLL_FRACTION + (flights > 1 ? (k * 0.22) / (flights - 1) : 0);
        const local = (progress - start) / FLIGHT_FRACTION;
        if (local <= 0) continue;
        const pos = this.flightPoint(event.stageIndex, Math.min(1, local));
        drawCrate(g, p, pos.x - CRATE_W / 2, pos.y - CRATE_H);
      }
    }

    if (this.highlightIndex !== null) {
      this.marker.visible = true;
      const label = playing ? '▼ processando' : '▼ próximo';
      if (this.marker.text !== label) this.marker.text = label;
      const bounce = this.reducedMotion ? 0 : Math.sin(t / 250) * 2;
      this.marker.position.set(this.stationX(this.highlightIndex) + ST_W / 2, this.stationY(this.highlightIndex) - 12 + bounce);
    } else {
      this.marker.visible = false;
    }
  }
}
