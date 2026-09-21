'use client';

/**
 * Trap de foco para diálogos modais (padrão APG "Dialog (Modal)").
 *
 * Sem isto, um modal com `role="dialog"` é só uma caixa visual: o teclado
 * continua livre para vagar pela tela atrás dele, o que confunde quem navega
 * sem mouse — pode parecer que o diálogo bloqueia a interação, mas não
 * bloqueia de verdade. Move o foco para dentro ao abrir, prende Tab/Shift+Tab
 * dentro do diálogo, fecha com Escape e devolve o foco a quem abriu, ao
 * fechar.
 */

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);

  // Mantém a ref sincronizada com a callback mais recente — sem escrever nela
  // durante o render, que o React 19 trata como acesso indevido a ref.
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    const first = focusables()[0];
    (first ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = focusables();
      if (elements.length === 0) return;

      const firstEl = elements[0];
      const lastEl = elements[elements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [containerRef]);
}
