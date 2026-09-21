/**
 * Estatísticas descritivas da calibração.
 *
 * Apenas mediana, mínimo e máximo. Não existe pontuação composta: o tempo total
 * é o objetivo, e a dispersão é relatada ao lado dele, nunca somada a ele.
 */

export interface Summary {
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function summarize(values: number[]): Summary {
  if (values.length === 0) {
    return { count: 0, median: null, min: null, max: null };
  }

  return {
    count: values.length,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** Formata segundos como mm:ss, para leitura rápida no terminal. */
export function formatSeconds(value: number | null): string {
  if (value === null) return '—';

  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatMeters(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} m`;
}
