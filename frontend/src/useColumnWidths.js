import { useCallback, useEffect, useRef, useState } from "react";

const MIN_W = 40;
const MAX_W = 900;

/**
 * Anchos de coluna editáveis (px) para `<colgroup>` — arrastar a borda direita do cabeçalho.
 * @param {number[]} defaultsPx Um valor por `<col>` (mesma ordem que as células).
 */
export function useColumnWidths(defaultsPx) {
  const [widths, setWidths] = useState(() => [...defaultsPx]);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const dragRef = useRef(/** @type {{ idx: number, startX: number, startW: number } | null */ null);

  const onGripMouseDown = useCallback((colIdx) => (/** @type {React.MouseEvent} */ e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      idx: colIdx,
      startX: e.clientX,
      startW: widthsRef.current[colIdx]
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (/** @type {MouseEvent} */ e) => {
      const d = dragRef.current;
      if (!d) return;
      const nw = d.startW + (e.clientX - d.startX);
      setWidths((prev) => {
        const next = [...prev];
        next[d.idx] = Math.min(MAX_W, Math.max(MIN_W, Math.round(nw)));
        return next;
      });
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const colElements = widths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />);

  return { widths, colElements, onGripMouseDown };
}

/** Grip na borda direita do cabeçalho (entre duas colunas). */
export function ColumnResizeGrip({ onMouseDown }) {
  return (
    <span
      aria-hidden
      title="Arrastar para redimensionar a coluna"
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        right: -4,
        top: 0,
        bottom: 0,
        width: 8,
        cursor: "col-resize",
        zIndex: 2,
        touchAction: "none"
      }}
    />
  );
}
