import { useCallback, useEffect, useRef, useState } from 'react';

/** Gorizontal aylanadigan blok: chap/o'ng chetda yana kontent bormi (soya ko'rsatish uchun) */
export function useEdgeFade<T extends HTMLElement>(deps: unknown) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [update, deps]);

  return { ref, ...edges };
}
