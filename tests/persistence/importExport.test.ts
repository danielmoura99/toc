import { describe, expect, it } from 'vitest';

import { IMPORT_MAX_BYTES } from '@/features/trail/persistence/schema';
import { parseJsonText, readSessionFile } from '@/features/trail/persistence/importExport';

function makeFile(content: string, name = 'sessao.json'): File {
  return new File([content], name, { type: 'application/json' });
}

describe('parseJsonText', () => {
  it('aceita JSON válido', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, raw: '{"a":1}' });
  });

  it('rejeita JSON malformado sem lançar', () => {
    const result = parseJsonText('{a: 1,}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_json');
      expect(result.detail).toBeTruthy();
    }
  });

  it('rejeita texto vazio', () => {
    expect(parseJsonText('').ok).toBe(false);
  });
});

describe('readSessionFile', () => {
  it('lê o conteúdo de um arquivo pequeno', async () => {
    const result = await readSessionFile(makeFile('{"ok":true}'));
    expect(result).toEqual({ ok: true, raw: '{"ok":true}' });
  });

  it('rejeita arquivo maior que o limite, sem tentar ler o conteúdo', async () => {
    const oversized = 'x'.repeat(IMPORT_MAX_BYTES + 1);
    const result = await readSessionFile(makeFile(oversized));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too_large');
      expect(result.detail).toContain('MiB');
    }
  });

  it('aceita um arquivo exatamente no limite', async () => {
    const exact = 'x'.repeat(IMPORT_MAX_BYTES);
    const result = await readSessionFile(makeFile(exact));
    expect(result.ok).toBe(true);
  });
});
