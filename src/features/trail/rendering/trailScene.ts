/**
 * Cena PixiJS da trilha.
 *
 * Módulo sem React: transforma snapshots do motor em elementos visuais. Não
 * resolve regra, peso, aleatoriedade ou chegada — o domínio é a única fonte de
 * verdade para posições e resultados (§10.2). Este módulo só lê `SimulationState`
 * e desenha.
 *
 * Não interpola: a posição desenhada é sempre a posição lógica do tick mais
 * recente. Não existe estado físico aqui, só leitura.
 */

import { Application, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';

import { drawWalker } from './walkerArtwork';

import type { AttemptConfig, CharacterId, SimulationState } from '../domain/types';

export interface WalkerVisualSpec {
  id: CharacterId;
  displayName: string;
  /** Rótulo curto, para não sobrecarregar o desenho quando os avatares se aproximam. */
  shortLabel: string;
  colorHex: number;
  loadKg?: number;
}

export interface CreateTrailSceneOptions {
  container: HTMLElement;
  distanceM: number;
  /** Da frente para trás; fixa durante toda a execução (R02). */
  order: CharacterId[];
  walkers: WalkerVisualSpec[];
  /** Chamado quando a seleção muda por um clique no próprio canvas (frente 3 da evolução pedagógica). */
  onSelect?: (characterId: CharacterId | null) => void;
}

const TRACK_COLOR = 0xe7d7b9;
const TRACK_COLOR_DARK = 0x514936;
const MARKER_COLOR = 0x536b60;
const ARRIVAL_ZONE_COLOR = 0xe8f6ee;
const ARRIVAL_ZONE_COLOR_DARK = 0x0f2a1c;
const AVATAR_RING_RADIUS = 20;
const MIN_GAP_PX = 160;
// Espaçamento entre raias por caminhante, para até 6 — o que os cenários A/B
// sempre tiveram. Grupos maiores (expedição gerada, até MAX_PARTY_SIZE = 12,
// ver scenarios/generator.ts) usam um valor menor, calculado por instância em
// `laneOffsetForCount`, para caber no mesmo espaço vertical (ver HALF_SPREAD_PX).
const LANE_OFFSET_PX = 32;
// Metade do espalhamento vertical máximo (grupo inteiro nu mesmo agrupamento
// ou empilhado na chegada), em pixels a partir do centro da trilha. Fixo,
// independente do tamanho do grupo: `laneOffsetForCount` encolhe o espaço
// entre raias conforme o grupo cresce para nunca ultrapassar este total —
// por isso TICK_LABEL_OFFSET_PX abaixo também pode ser um valor fixo.
const HALF_SPREAD_PX = 80;
const HORIZONTAL_PADDING = 40;
const ARRIVAL_ZONE_WIDTH = 80;
// Centralizada: sobra a mesma folga acima e abaixo para o grupo formado e
// para os rótulos estáticos da trilha, nos dois sentidos.
const TRACK_Y_RATIO = 0.5;
// Distância vertical mínima entre a linha da trilha e os textos fixos
// (marcadores de distância), suficiente para nunca colidir com o maior
// agrupamento possível de avatares — HALF_SPREAD_PX é o mesmo para qualquer
// tamanho de grupo — mais o raio do anel de seleção mais a altura do rótulo
// abaixo do avatar.
const TICK_LABEL_OFFSET_PX = HALF_SPREAD_PX + AVATAR_RING_RADIUS + 6;

/**
 * Espaço entre raias de um grupo de `count` caminhantes, em pixels, limitado
 * para que o espalhamento total (agrupados ou empilhados na chegada) nunca
 * ultrapasse `2 × HALF_SPREAD_PX` — o que os cenários fixos de 6 já ocupavam.
 * Com até 6, o resultado é sempre LANE_OFFSET_PX (comportamento inalterado);
 * acima disso, encolhe para o grupo caber no mesmo espaço.
 */
function laneOffsetForCount(count: number): number {
  if (count <= 1) return 0;
  return Math.min(LANE_OFFSET_PX, (2 * HALF_SPREAD_PX) / (count - 1));
}
const ZONE_VERTICAL_PADDING_PX = 8;
/**
 * Taxa de aproximação da posição desenhada em relação à posição lógica, por
 * segundo real. Maior = alcança mais rápido. Com 18, a distância restante cai
 * a ~1% em pouco mais de 250 ms — suave, mas sem atraso perceptível.
 */
const POSITION_SMOOTHING_RATE_PER_SEC = 18;

const LABEL_STYLE: TextStyleOptions = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 12,
  fontWeight: '600',
  fill: 0x203c30,
};

const SELECTION_LABEL_STYLE: TextStyleOptions = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 12,
  fontWeight: '600',
  fill: 0x111318,
};

const DISTANCE_LABEL_STYLE: TextStyleOptions = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 12,
  fill: MARKER_COLOR,
};

interface WalkerView {
  spec: WalkerVisualSpec;
  container: Container;
  ring: Graphics;
  body: Graphics;
  label: Text;
  labelSelected: boolean;
}

/**
 * Detecta o tema para as cores estáticas da cena (trilha, marcadores). Os
 * avatares mantêm cor própria em ambos os temas — cor nunca é o único
 * identificador (§9.2), então isso não compromete a distinção.
 */
function prefersDarkTheme(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class TrailScene {
  readonly app: Application;
  readonly canvas: HTMLCanvasElement;

  private readonly distanceM: number;
  private readonly order: CharacterId[];
  private readonly laneOffsetPx: number;
  private readonly walkers = new Map<CharacterId, WalkerView>();
  private readonly trackLayer = new Container();
  private readonly walkersLayer = new Container();
  private readonly reducedMotion = prefersReducedMotion();
  private readonly darkTheme = prefersDarkTheme();

  private widthPx = 0;
  private heightPx = 0;
  private selectedId: CharacterId | null = null;
  private readonly onSelect?: (characterId: CharacterId | null) => void;
  private destroyed = false;

  // Interpolação visual (§7.5: "Animação interpola estados; não cria novos
  // estados físicos"). O motor só garante uma posição nova por tick de 1 s;
  // em reprodução rápida, vários ticks chegam entre um quadro e outro do
  // Pixi. Sem isto, o avatar "pula" de posição em posição em vez de deslizar.
  // A posição desenhada persegue a posição lógica mais recente a cada quadro
  // — nunca o contrário: o motor nunca lê nada daqui.
  private lastRenderTimestamp: number | null = null;
  private readonly renderedX = new Map<CharacterId, number>();
  private readonly renderedY = new Map<CharacterId, number>();

  private constructor(app: Application, options: CreateTrailSceneOptions) {
    this.app = app;
    this.canvas = app.canvas as HTMLCanvasElement;
    this.distanceM = options.distanceM;
    this.order = [...options.order];
    this.laneOffsetPx = laneOffsetForCount(this.order.length);
    this.onSelect = options.onSelect;

    this.app.stage.addChild(this.trackLayer);
    this.app.stage.addChild(this.walkersLayer);

    for (const spec of options.walkers) {
      this.walkers.set(spec.id, this.buildWalkerView(spec));
    }

    for (const view of this.walkers.values()) {
      this.walkersLayer.addChild(view.container);
    }

    this.app.ticker.add(this.onTick);
  }

  /**
   * Cria a Application PixiJS e aguarda sua inicialização assíncrona antes de
   * anexar o canvas ao DOM (§10.3). O chamador é responsável por não usar o
   * resultado se o componente tiver desmontado enquanto a promise resolvia.
   */
  static async create(options: CreateTrailSceneOptions): Promise<TrailScene> {
    const app = new Application();

    await app.init({
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      backgroundAlpha: 0,
      width: Math.max(1, options.container.clientWidth),
      height: Math.max(1, options.container.clientHeight || 220),
    });

    const scene = new TrailScene(app, options);
    scene.widthPx = app.screen.width;
    scene.heightPx = app.screen.height;
    scene.drawTrack();
    scene.layoutWalkers();

    return scene;
  }

  /** Redimensiona sem recriar o motor nem reiniciar a tentativa (§10.3). */
  resize(widthPx: number, heightPx: number): void {
    if (this.destroyed || widthPx <= 0 || heightPx <= 0) return;

    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.app.renderer.resize(widthPx, heightPx);
    this.drawTrack();
    this.layoutWalkers();
  }

  /** Lê o snapshot mais recente e atualiza o desenho. Não muta o estado recebido. */
  render(state: SimulationState): void {
    if (this.destroyed) return;

    const trackWidth = this.trackWidthPx();
    const positions = this.order.map((id) => ({
      id,
      xPx: HORIZONTAL_PADDING + (state.characters[id].positionM / this.distanceM) * trackWidth,
      arrived: state.characters[id].arrivalTimeSec !== null,
      positionM: state.characters[id].positionM,
    }));

    const offsets = this.computeOverlapOffsets(positions);
    const arrivalOrder = this.order
      .filter((id) => state.characters[id].arrivalTimeSec !== null)
      .sort((a, b) => state.characters[a].arrivalTimeSec! - state.characters[b].arrivalTimeSec!);

    const trackY = this.heightPx * TRACK_Y_RATIO;
    const walkPhase = this.reducedMotion ? 0 : state.elapsedSec * 0.7;

    const now = performance.now();
    const dtSec =
      this.lastRenderTimestamp === null ? null : Math.min(0.25, (now - this.lastRenderTimestamp) / 1000);
    this.lastRenderTimestamp = now;
    // Sem preferência de redução de movimento, sem timestamp anterior (primeiro
    // quadro) ou com um salto grande demais (aba ficou oculta, "Avançar 30 s"),
    // desenha direto na posição lógica — perseguir de longe pareceria um
    // deslize errático, não suavidade.
    const smoothingFactor =
      this.reducedMotion || dtSec === null ? 1 : 1 - Math.exp(-POSITION_SMOOTHING_RATE_PER_SEC * dtSec);

    for (const entry of positions) {
      const view = this.walkers.get(entry.id);
      if (!view) continue;

      let x = entry.xPx;
      let y = trackY + offsets.get(entry.id)!;

      if (entry.arrived) {
        const slot = arrivalOrder.indexOf(entry.id);
        x = HORIZONTAL_PADDING + trackWidth + ARRIVAL_ZONE_WIDTH / 2;
        y = trackY - ((this.order.length - 1) / 2) * this.laneOffsetPx + slot * this.laneOffsetPx;
      } else if (!this.reducedMotion) {
        // Microanimação: leve oscilação vertical proporcional ao movimento
        // observado, sem qualquer efeito no motor (§9.2).
        const isMoving = state.characters[entry.id].actualSpeedMps > 0;
        y += isMoving ? Math.sin(walkPhase + entry.xPx * 0.05) * 1.5 : 0;
      }

      // A posição lógica (x, y) já está decidida; o que falta é só a suavização
      // visual entre o último quadro desenhado e ela — nunca o contrário.
      const previousX = this.renderedX.get(entry.id) ?? x;
      const previousY = this.renderedY.get(entry.id) ?? y;
      const renderX = previousX + (x - previousX) * smoothingFactor;
      const renderY = previousY + (y - previousY) * smoothingFactor;
      this.renderedX.set(entry.id, renderX);
      this.renderedY.set(entry.id, renderY);

      view.container.position.set(renderX, renderY);
      const isSelected = this.selectedId === entry.id;
      view.ring.visible = isSelected;

      // Selecionar mostra nome e distância exata — a separação por sobreposição
      // é só visual, e a distância numérica precisa continuar acessível (§9.2).
      if (isSelected !== view.labelSelected) {
        view.label.style = isSelected ? SELECTION_LABEL_STYLE : LABEL_STYLE;
        view.labelSelected = isSelected;
      }
      const name = view.spec.displayName;
      const compactName = name.length > 12 ? `${name.slice(0, 11)}…` : name;
      view.label.text = isSelected
        ? `${name} · ${Math.round(entry.positionM)} m`
        : `${view.spec.shortLabel} · ${compactName} · ${view.spec.loadKg ?? 0} kg`;
      const placeLeft = renderX + 24 + view.label.width > this.widthPx - 12;
      view.label.anchor.set(placeLeft ? 1 : 0, 0.5);
      view.label.position.set(placeLeft ? -24 : 24, -2);
      view.label.style.fill = this.darkTheme ? 0xf0f5e9 : 0x203c30;
      if (isSelected) this.walkersLayer.setChildIndex(view.container, this.walkersLayer.children.length - 1);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.app.ticker.remove(this.onTick);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
  }

  private onTick = (): void => {
    // Mantido para futura animação orientada a delta-time do próprio Pixi.
    // A leitura do snapshot é acionada externamente via render(), a partir do
    // laço de física — não daqui — para não duplicar fontes de verdade.
  };

  private trackWidthPx(): number {
    return Math.max(40, this.widthPx - HORIZONTAL_PADDING * 2 - ARRIVAL_ZONE_WIDTH);
  }

  private buildWalkerView(spec: WalkerVisualSpec): WalkerView {
    const container = new Container();
    container.eventMode = 'static';
    container.cursor = 'pointer';

    const ring = new Graphics()
      .circle(0, 0, AVATAR_RING_RADIUS)
      .stroke({ width: 2, color: spec.colorHex, alpha: 0.9 });
    ring.visible = false;

    const body = drawWalker(spec.colorHex, spec.loadKg ?? 0);

    const label = new Text({ text: spec.shortLabel, style: LABEL_STYLE });
    label.anchor.set(0, 0.5);
    label.position.set(24, -2);
    label.resolution = 2;

    container.addChild(ring, body, label);

    container.on('pointertap', () => {
      this.selectedId = this.selectedId === spec.id ? null : spec.id;
      this.onSelect?.(this.selectedId);
    });

    return { spec, container, ring, body, label, labelSelected: false };
  }

  /**
   * Sincroniza a seleção vinda de fora (a tabela, por exemplo) — a mesma
   * seleção vale nos dois lugares (frente 3 da evolução pedagógica). Não
   * chama `onSelect` de volta: quem originou a mudança já sabe.
   */
  setSelected(characterId: CharacterId | null): void {
    this.selectedId = characterId;
  }

  private layoutWalkers(): void {
    // Posição inicial: todos em x=0 (origem), sem sobreposição de rótulo.
    const trackY = this.heightPx * TRACK_Y_RATIO;

    this.order.forEach((id, index) => {
      const view = this.walkers.get(id);
      if (!view) return;
      const offset = (index - (this.order.length - 1) / 2) * this.laneOffsetPx;
      view.container.position.set(HORIZONTAL_PADDING, trackY + offset);
    });
  }

  /**
   * Avatares próximos na fila recebem um leve deslocamento vertical alternado
   * quando estão a menos de MIN_GAP_PX de distância. É apenas visual — a
   * posição lógica não muda — e existe para que a dispersão continue legível
   * quando o grupo se aproxima (§9.2: separação de sobreposição é visual;
   * a distância exata aparece ao selecionar o avatar).
   */
  private computeOverlapOffsets(
    positions: Array<{ id: CharacterId; xPx: number; arrived: boolean }>,
  ): Map<CharacterId, number> {
    const offsets = new Map<CharacterId, number>();
    const inTransit = positions.filter((entry) => !entry.arrived);

    let clusterStart = 0;
    while (clusterStart < inTransit.length) {
      let clusterEnd = clusterStart;
      while (
        clusterEnd + 1 < inTransit.length &&
        Math.abs(inTransit[clusterEnd + 1].xPx - inTransit[clusterEnd].xPx) < MIN_GAP_PX
      ) {
        clusterEnd += 1;
      }

      const clusterSize = clusterEnd - clusterStart + 1;

      for (let i = clusterStart; i <= clusterEnd; i += 1) {
        const rank = i - clusterStart;
        const offset = clusterSize === 1 ? 0 : (rank - (clusterSize - 1) / 2) * this.laneOffsetPx;
        offsets.set(inTransit[i].id, offset);
      }

      clusterStart = clusterEnd + 1;
    }

    for (const entry of positions) {
      if (entry.arrived) offsets.set(entry.id, 0);
    }

    return offsets;
  }

  private drawTrack(): void {
    for (const child of this.trackLayer.removeChildren()) child.destroy({ children: true });

    const trackWidth = this.trackWidthPx();
    const trackY = this.heightPx * TRACK_Y_RATIO;
    const originX = HORIZONTAL_PADDING;
    const destinationX = HORIZONTAL_PADDING + trackWidth;
    const trackColor = this.darkTheme ? TRACK_COLOR_DARK : TRACK_COLOR;
    const arrivalColor = this.darkTheme ? ARRIVAL_ZONE_COLOR_DARK : ARRIVAL_ZONE_COLOR;

    // A área de chegada ocupa quase toda a altura do canvas: é onde os
    // avatares se empilham ao chegar (§9.2), e precisa de espaço vertical
    // suficiente para as seis posições de chegada sem se sobrepor ao rótulo.
    const zoneTop = ZONE_VERTICAL_PADDING_PX;
    const zoneHeight = this.heightPx - ZONE_VERTICAL_PADDING_PX * 2;

    const landscape = new Graphics()
      .rect(0, 0, this.widthPx, this.heightPx)
      .fill(this.darkTheme ? 0x172b24 : 0xf3f7ed)
      .ellipse(this.widthPx * 0.3, -20, this.widthPx * 0.5, 70)
      .fill({ color: this.darkTheme ? 0x294333 : 0xe0ebd6 })
      .ellipse(this.widthPx * 0.85, -20, this.widthPx * 0.4, 60)
      .fill({ color: this.darkTheme ? 0x21392d : 0xe7efdf });
    this.trackLayer.addChild(landscape);
    const caption = new Text({
      text: 'A CAMINHADA  →  Todos precisam chegar',
      style: { ...DISTANCE_LABEL_STYLE, fontWeight: '600', fill: this.darkTheme ? 0xe1ecdb : 0x36533e },
    });
    caption.position.set(16, 12);
    this.trackLayer.addChild(caption);

    const zone = new Graphics()
      .rect(destinationX, zoneTop, ARRIVAL_ZONE_WIDTH, zoneHeight)
      .fill({ color: arrivalColor });
    this.trackLayer.addChild(zone);

    const line = new Graphics()
      .moveTo(originX, trackY)
      .lineTo(destinationX, trackY)
      .stroke({ width: 22, color: trackColor, cap: 'round' });
    this.trackLayer.addChild(line);

    // Marcadores de distância a cada 25% do percurso. O rótulo numérico fica
    // bem abaixo da linha — longe o suficiente para nunca colidir com o maior
    // agrupamento possível de avatares (ver TICK_LABEL_OFFSET_PX). "0 m" já
    // identifica a origem; não há rótulo de texto redundante ali.
    for (let fraction = 0; fraction <= 1; fraction += 0.25) {
      const x = originX + trackWidth * fraction;
      const tick = new Graphics()
        .moveTo(x, trackY - 6)
        .lineTo(x, trackY + 6)
        .stroke({ width: 2, color: MARKER_COLOR });
      this.trackLayer.addChild(tick);

      const label = new Text({
        text: `${Math.round(this.distanceM * fraction)} m`,
        style: DISTANCE_LABEL_STYLE,
      });
      label.resolution = 2;
      label.anchor.set(0.5, 0);
      label.style.fill = this.darkTheme ? 0xdce6d8 : MARKER_COLOR;
      label.position.set(x, Math.min(this.heightPx - 22, trackY + TICK_LABEL_OFFSET_PX));
      this.trackLayer.addChild(label);
    }

    // "Chegada" fica dentro da própria área, no topo — não acima dela, que não
    // sobraria espaço quando a zona ocupa quase toda a altura do canvas.
    const destinationLabel = new Text({ text: 'Chegada', style: DISTANCE_LABEL_STYLE });
    destinationLabel.resolution = 2;
    destinationLabel.anchor.set(0.5, 0);
    destinationLabel.position.set(destinationX + ARRIVAL_ZONE_WIDTH / 2, zoneTop + 4);
    this.trackLayer.addChild(destinationLabel);
  }
}

/** Deriva a especificação visual dos personagens a partir da configuração. */
export function walkerSpecsFromConfig(
  config: AttemptConfig,
  colorByCharacter: Record<CharacterId, number>,
): WalkerVisualSpec[] {
  return config.scenario.characters.map((character) => ({
    id: character.id,
    displayName: config.participantByCharacter[character.id] || character.displayName,
    loadKg: config.scenario.items.reduce((sum, item) => sum + (config.ownerByItem[item.id] === character.id ? item.weightKg : 0), 0),
    shortLabel: character.displayName.replace(/\D+/g, '') || character.displayName.slice(0, 2),
    colorHex: colorByCharacter[character.id] ?? 0x64748b,
  }));
}
