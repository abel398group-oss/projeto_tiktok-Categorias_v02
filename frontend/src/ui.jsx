/**
 * Kit mínimo de UI — portado do padrão do product-seeker.
 *
 * Duas regras que valem por todo o kit:
 *
 * 1. Cor só com significado: `bom/meio/ruim/info/mute` e mais nada. Cor
 *    decorativa treina o olho a ignorar cor — e aí a que importa passa
 *    despercebida.
 * 2. Toda tag leva `title`: o tooltip é a documentação embutida. Uma etiqueta
 *    "saturado" sem explicação vira jargão; com o porquê no hover, vira
 *    critério que qualquer pessoa audita.
 */

const CORES_TAG = {
  bom: { border: "#3d7a6a", background: "rgba(26,74,61,0.35)", color: "#7ee0c3" },
  meio: { border: "#8a6d3b", background: "rgba(90,68,26,0.35)", color: "#f0c674" },
  ruim: { border: "#7a3d3d", background: "rgba(74,26,26,0.35)", color: "#f5a3a3" },
  info: { border: "#3b5f8a", background: "rgba(26,45,74,0.35)", color: "#9cc4f0" },
  mute: { border: "var(--tk-border)", background: "transparent", color: "inherit" }
};

/**
 * Etiqueta semântica com explicação no hover.
 * @param {{ kind?: keyof typeof CORES_TAG, title?: string, children: import("react").ReactNode }} props
 */
export function Tag({ kind = "mute", title, children }) {
  const cor = CORES_TAG[kind] ?? CORES_TAG.mute;
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        padding: "0.1rem 0.45rem",
        margin: "0 0.25rem 0.2rem 0",
        fontSize: "0.68rem",
        fontWeight: 600,
        borderRadius: 999,
        border: `1px solid ${cor.border}`,
        background: cor.background,
        color: cor.color,
        whiteSpace: "nowrap",
        cursor: title ? "help" : "default"
      }}
    >
      {children}
    </span>
  );
}

/**
 * Cartão KPI: rótulo pequeno, valor grande, nota de procedência por baixo.
 * @param {{ rotulo: string, valor: import("react").ReactNode, sub?: string, title?: string }} props
 */
export function Card({ rotulo, valor, sub, title }) {
  return (
    <div
      title={title}
      style={{
        padding: "0.6rem 0.8rem",
        borderRadius: 10,
        border: "1px solid var(--tk-border)",
        background: "var(--tk-bg-elev, transparent)",
        minWidth: "8rem"
      }}
    >
      <div style={{ fontSize: "0.68rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {rotulo}
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0.15rem 0" }}>{valor}</div>
      {sub ? <div style={{ fontSize: "0.7rem", opacity: 0.65 }}>{sub}</div> : null}
    </div>
  );
}

/**
 * Secção com título e nota explicativa — para a tela se explicar sozinha.
 * @param {{ titulo: string, nota?: string, children: import("react").ReactNode }} props
 */
export function Painel({ titulo, nota, children }) {
  return (
    <section style={{ margin: "1.2rem 0" }}>
      <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.2rem" }}>{titulo}</h2>
      {nota ? (
        <p style={{ fontSize: "0.74rem", opacity: 0.7, margin: "0 0 0.6rem", lineHeight: 1.45 }}>{nota}</p>
      ) : null}
      {children}
    </section>
  );
}
