import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface UsePaneResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function usePaneResize({
  initialWidth,
  minWidth,
  maxWidth,
}: UsePaneResizeOptions) {
  const [width, setWidth] = useState(initialWidth);
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setWidth(prev => Math.min(maxWidth, Math.max(minWidth, prev)));
  }, [minWidth, maxWidth]);

  useEffect(() => {
    setWidth(prev => {
      const target = Math.min(maxWidth, Math.max(minWidth, initialWidth));
      return prev < minWidth || (prev < initialWidth && initialWidth - prev > 40) ? target : prev;
    });
  }, [initialWidth, minWidth, maxWidth]);

  const onDividerPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    []
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const container = document.getElementById('forecast-table-split-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const next = e.clientX - rect.left;
      setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
    };

    const onPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [minWidth, maxWidth]);

  return { regPaneWidth: width, setRegPaneWidth: setWidth, onDividerPointerDown, isDragging };
}
