/**
 * Repasse fino: a lógica das estratégias mora em
 * `src/features/trail/scenarios/strategies.ts`, porque o gerador de
 * expedições (entrega posterior ao MVP inicial) também precisa delas. Este
 * arquivo existe só para o script de calibração não precisar mudar seu
 * caminho de import.
 */
export {
  STRATEGIES,
  effectiveSpeedKmh,
  reorderSlowestFirst,
  redistributeFromBottleneck,
  overloadFastest,
  type Strategy,
  type StrategyId,
} from '../../src/features/trail/scenarios/strategies';
