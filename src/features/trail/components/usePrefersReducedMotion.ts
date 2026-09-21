'use client';

/**
 * Preferência de redução de movimento (§9.2), reativa a mudanças em tempo
 * real — o operador pode ligar essa preferência do sistema operacional com a
 * aplicação já aberta, numa sala de treinamento, sem precisar recarregar.
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia(QUERY);
    const onChange = () => setReduced(mediaQuery.matches);

    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
