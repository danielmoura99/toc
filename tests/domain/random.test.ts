import { describe, expect, it } from 'vitest';
import {
  blockIndexForTime,
  deterministicRandom,
  fnv1a32,
  fnv1a32Raw,
  randomKey,
  variationFactor,
} from '@/features/trail/domain/random';

describe('fnv1a32Raw — vetores de teste oficiais', () => {
  // Vetores públicos do FNV-1a de 32 bits. Fixam o algoritmo no repositório:
  // se alguém trocar a implementação, estes casos quebram.
  const vectors: Array<[string, number]> = [
    ['', 0x811c9dc5],
    ['a', 0xe40c292c],
    ['b', 0xe70c2de5],
    ['c', 0xe60c2c52],
    ['foobar', 0xbf9cf968],
    ['hello', 0x4f9f2cab],
  ];

  for (const [input, expected] of vectors) {
    it(`"${input}" produz 0x${expected.toString(16)}`, () => {
      expect(fnv1a32Raw(input)).toBe(expected);
    });
  }
});

describe('deterministicRandom', () => {
  it('produz valores no intervalo [0, 1)', () => {
    for (let block = 0; block < 500; block += 1) {
      const value = deterministicRandom('trilha-a-001', 'p3', block);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('é puro: a mesma chave produz sempre o mesmo valor', () => {
    const first = deterministicRandom('seed-x', 'p1', 7);
    const second = deterministicRandom('seed-x', 'p1', 7);
    expect(first).toBe(second);
  });

  it('separa personagens, blocos e seeds', () => {
    const base = deterministicRandom('seed-x', 'p1', 7);
    expect(deterministicRandom('seed-x', 'p2', 7)).not.toBe(base);
    expect(deterministicRandom('seed-x', 'p1', 8)).not.toBe(base);
    expect(deterministicRandom('seed-y', 'p1', 7)).not.toBe(base);
  });

  it('serializa a chave sem ambiguidade entre campos', () => {
    // Sem a serialização por JSON, ('ab', 'c') e ('a', 'bc') colidiriam.
    expect(randomKey('ab', 'c', 1)).not.toBe(randomKey('a', 'bc', 1));
    expect(deterministicRandom('ab', 'c', 1)).not.toBe(deterministicRandom('a', 'bc', 1));
  });

  it('distribui razoavelmente ao longo do intervalo', () => {
    const buckets = new Array(10).fill(0);
    const samples = 10000;

    for (let block = 0; block < samples; block += 1) {
      buckets[Math.floor(deterministicRandom('trilha-a-001', 'p1', block) * 10)] += 1;
    }

    // Uniformidade grosseira: nenhum décimo com menos de metade ou mais que o
    // dobro do esperado. Não é um teste estatístico rigoroso, apenas uma trava
    // contra um hash degenerado.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(samples / 10 / 2);
      expect(count).toBeLessThan((samples / 10) * 2);
    }
  });
});

describe('blockIndexForTime', () => {
  it('mantém o mesmo bloco durante 30 s', () => {
    expect(blockIndexForTime(0)).toBe(0);
    expect(blockIndexForTime(29)).toBe(0);
    expect(blockIndexForTime(30)).toBe(1);
    expect(blockIndexForTime(59)).toBe(1);
    expect(blockIndexForTime(60)).toBe(2);
  });
});

describe('variationFactor', () => {
  it('fica dentro de [1 - v, 1 + v]', () => {
    const variability = 0.2;

    for (let block = 0; block < 1000; block += 1) {
      const factor = variationFactor('trilha-a-001', 'p5', block, variability);
      expect(factor).toBeGreaterThanOrEqual(1 - variability);
      expect(factor).toBeLessThanOrEqual(1 + variability);
    }
  });

  it('com variabilidade zero é sempre 1', () => {
    for (let block = 0; block < 50; block += 1) {
      expect(variationFactor('qualquer', 'p1', block, 0)).toBe(1);
    }
  });
});

describe('fnv1a32 com mistura final', () => {
  it('retorna inteiro sem sinal de 32 bits', () => {
    for (const input of ['', 'a', 'trilha-a-001', '["seed","p1",0]']) {
      const value = fnv1a32(input);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});
