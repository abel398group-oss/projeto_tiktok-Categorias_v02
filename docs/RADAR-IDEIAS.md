# Radar de ideias (parking lot)

Ficheiro **voluntário** para anotar o que podemos fazer ou explorar **sem** obrigar backlog formal.

- **Tarefas com compromisso** continuam apenas em **`docs/ROADMAP.md`** (`- [ ]`, `[~]`, etc.).
- Quando uma ideia ficar decidida ou priorizada: **copiar** como item no ROADMAP (ou criar ADR se for decisão de arquitetura).
- Actualizar este radar à medida que fores pensando — tu ou a IA podem acrescentar secções ou bullets.

---

## Observabilidade / padrões do TikTok Shop

- Monitorizar **instabilidade do feed** ao refrescar o mesmo `/c/.../` (ordenção vs catálogo real vs personalização).
- Métricas leves por corrida: contagem de `product_id` únicos, hash do top‑N IDs, diff entre `ScrapeRun` consecutivos na mesma categoria.
- Registo estruturado (JSON lines em `output/extra/` ou resumo gravado junto ao run) para séries temporais.
- Documentar premissas: mesmo perfil Playwright, cookies, país, hora — o “padrão” mede o **que nós captamos**, não a plataforma no abstracto.

_(Acrescenta aqui sub-itens conforme falares.)_

---

## Outras ideias

- _(livre para novas bullets ou secções — ex.: n8n, novas fontes, UX do painel, etc.)_

---

## Histórico de ideias já “promovidas”

_Use esta lista só para referência rápida; o estado oficial da tarefa está no ROADMAP._

- _(vazio)_
