/**
 * Contratos do domínio da Fábrica de componentes (guia §10).
 *
 * Este módulo é TypeScript puro: não importa React, PixiJS nem APIs de
 * navegador, e não depende do motor da trilha — são exercícios independentes
 * que só compartilham convenções de projeto (§2: "não adaptar o motor
 * contínuo da caminhada para processar rodadas").
 */

/**
 * Versão do motor. Mudar ao alterar regras de transferência ou semântica de métricas.
 * 1.1.0: capacidade disponível = dado + bônus + melhoria (evolução "Restrição e
 * fluxo"). Com bônus e melhoria zero, a física é idêntica à 1.0.0.
 */
export const ENGINE_VERSION = '1.1.0';

/** Versão do modelo de perfis de capacidade (bônus estrutural + melhoria). */
export const CAPACITY_MODEL_VERSION = 'capacity-profile-1';

/** Bônus estrutural dos setores que não são a restrição original na experiência "Restrição e fluxo". */
export const NON_CONSTRAINT_BONUS = 2;

export type Experience = 'dependency-variability' | 'constraint-flow';

export type AddedCapacity = 1 | 2 | 3;

/** Capacidade estrutural de um setor além do dado — não é sorteio e não participa da chave do RNG. */
export interface CapacityProfile {
  stageId: StageId;
  baseBonus: number;
  upgrade: number;
}

/** Melhoria de capacidade testada a partir de uma linha de base. */
export interface Intervention {
  baselineRunId: string;
  targetStageId: StageId;
  addedCapacity: AddedCapacity;
  prediction: string;
}

/** Média de capacidade de um dado justo de seis faces — a "referência", nunca uma promessa de entrega (§1). */
export const REFERENCE_CAPACITY_PER_ROUND = 3.5;

/** Faces possíveis do dado. */
export const DIE_MIN = 1;
export const DIE_MAX = 6;

export type StageId = string;

export type Horizon = 10 | 20 | 30;

/** Quantidade de setores aceita pelo MVP (§3: "opção de 4 a 12"). */
export const MIN_STAGE_COUNT = 4;
export const MAX_STAGE_COUNT = 12;

export interface StageDefinition {
  id: StageId;
  /** Rótulo do setor (ex.: "Pintura") — metadado, não participa do sorteio (§10). */
  sectorName: string;
  /** Nome de quem representa o setor, opcional — também metadado. */
  participantName: string;
}

export interface ProductionLineConfig {
  engineVersion: string;
  rngVersion: string;
  seed: string;
  /** Ordem fixa, da primeira etapa (entrada) à última (expedição). Não muda durante a partida (§4.2). */
  stages: StageDefinition[];
  rounds: Horizon;
  hypothesis: string;
  initialInventory: 'empty';
  capacityModel: 'fair-d6';
  experience: Experience;
  capacityModelVersion: string;
  /** Um perfil por setor, na mesma ordem de `stages`. Tudo zero em "Dependência e variabilidade". */
  capacityProfiles: CapacityProfile[];
  /** Setor central em "Restrição e fluxo"; nulo na experiência antiga. */
  originalConstraintStageId: StageId | null;
  /** Agrupa linha de base e intervenções derivadas dela; nulo na experiência antiga. */
  experimentId: string | null;
  /** Nula na linha de base e na experiência antiga. */
  intervention: Intervention | null;
}

export interface TurnEvent {
  roundIndex: number;
  stageIndex: number;
  stageId: StageId;
  /** Face do dado, inteiro 1..6 — só o componente variável, nunca a capacidade total. */
  die: number;
  /** `die + baseBonus + upgrade`; igual a `die` na experiência antiga. */
  availableCapacity: number;
  /** Nulo apenas na primeira etapa (fonte irrestrita, sem estoque finito). */
  availableBefore: number | null;
  transferred: number;
  unusedCapacity: number;
  inventoryAfter: Record<StageId, number>;
  introducedTotal: number;
  deliveredTotal: number;
}

export type RunStatus = 'active' | 'completed';

export interface ProductionLineState {
  nextRoundIndex: number;
  nextStageIndex: number;
  completedRounds: number;
  inventoryByStage: Record<StageId, number>;
  introduced: number;
  delivered: number;
  events: TurnEvent[];
  status: RunStatus;
}

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
