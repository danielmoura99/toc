/**
 * Etapas guiadas e suas permissões.
 *
 * Esta é a camada de aplicação: ela decide o que o grupo pode *editar* em cada
 * etapa. O domínio continua responsável pela validade física — uma ordem
 * inválida ou uma mochila acima do limite são rejeitadas pelo `validateConfig`
 * independentemente da etapa.
 *
 * O operador avança de etapa manualmente. Não há desbloqueio por pontuação.
 *
 * Diferente da primeira versão do MVP, a etapa não determina mais QUAL
 * cenário está em jogo — isso agora é responsabilidade de
 * `preparationStore` (`expedition`), que vale para qualquer origem de
 * cenário: uma expedição gerada ou um dos cenários fixos preservados como
 * referência de teste (`scenarios/index.ts`). A etapa só decide o que pode
 * ser editado na configuração corrente, seja ela qual for.
 */

import type { GuidedStage } from '../domain/types';

export interface StageDefinition {
  stage: GuidedStage;
  title: string;
  /** O que o grupo pode mudar nesta etapa. */
  allowedDecisions: string;
  /** O que é mantido igual, para que a comparação isole a causa. */
  preservedConditions: string;
  mainQuestion: string;
  canReorder: boolean;
  canRedistribute: boolean;
}

export const STAGES: Record<GuidedStage, StageDefinition> = {
  1: {
    stage: 1,
    title: 'Observar',
    allowedDecisions: 'Nenhuma — só observar a expedição sorteada',
    preservedConditions: 'Elenco, mochilas e ordem exatamente como foram gerados',
    mainQuestion: 'Onde os espaços aparecem e o que limita o conjunto?',
    canReorder: false,
    canRedistribute: false,
  },
  2: {
    stage: 2,
    title: 'Reorganizar',
    allowedDecisions: 'Alterar a ordem',
    preservedConditions: 'Mesmos pesos, capacidades e seed da etapa 1',
    mainQuestion: 'A fila ficou mais compacta? O tempo mudou?',
    canReorder: true,
    canRedistribute: false,
  },
  3: {
    stage: 3,
    title: 'Redistribuir',
    allowedDecisions: 'Ordem e transferência de carga',
    preservedConditions: 'Mesmos itens totais, capacidades e seed',
    mainQuestion: 'Qual redistribuição melhora a chegada de todos?',
    canReorder: true,
    canRedistribute: true,
  },
};

export const GUIDED_STAGES: GuidedStage[] = [1, 2, 3];

export function getStage(stage: GuidedStage): StageDefinition {
  return STAGES[stage];
}

/** Limite de caracteres do campo de hipótese (§3.1). */
export const HYPOTHESIS_MAX_LENGTH = 500;
