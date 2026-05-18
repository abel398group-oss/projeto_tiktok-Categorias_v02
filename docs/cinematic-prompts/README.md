# Cinematic Prompt System (IA de vídeo)

Esta pasta documenta um sistema de prompts cinematográficos para IA de vídeo (ex.: Veo/Kling) focado em **estabilidade geométrica** e **consistência visual**.

## Conceitos-base

### Product motion vs camera motion

- **Product motion (ERRADO para este sistema):** o objeto “atua” (gira, flutua, inclina, roda, anima). Tende a aumentar alucinações (morphing, peças extras, forma mutante).
- **Camera motion (CORRETO):** o produto fica **completamente estático**, e toda a sensação de movimento vem da câmera (orbit/dolly/push-in) e da luz/reflexos.

### Conceito correto (aprovado)

- **Static hero object:** o produto é o “herói” e permanece **rigidamente fixo**, **grounded**, **sem rotação** e **sem animação**.
- **Cinematic orbit camera:** a câmera faz coreografias lentas ao redor do produto (orbit, macro parallax, dolly, hero arc).

## Por que camera-only estabiliza geometria

- Menor variação inter-frame do objeto → menos pressão de “interpolação” → menos deformação.
- A IA tende a “inventar” mecanismos quando vê ferramentas/objetos rotacionando (ex.: chuck, mandril, corpo de furadeira).
- Movimento do objeto aumenta risco de:
  - morphing (mudança de forma)
  - partes extras/faltando
  - troca de material/acabamento
  - “contaminação industrial” (aparecem dispositivos não solicitados)

## Por que rotação do objeto gera alucinações (regra prática)

- Rotação do produto muda drasticamente o silhouette e a leitura de detalhes (arestas/furos/roscas) entre frames; o modelo “reconstrói” a geometria continuamente e pode “preencher” com peças inexistentes.
- Em contexto industrial, rotação é interpretada como “uso funcional” (máquina/mandril/chuck/acionamento), ativando associações visuais fora do escopo do produto.
- A correção mais estável é tratar o produto como estátua (static hero object) e mover somente a câmera (cinematic orbit camera).

## Estrutura

- **master-prompts/**: prompts master versionados (base para copiar e adaptar).
- **industrial/**: perfis e negativos específicos por subcategoria industrial.
- **rules/**: regras de câmera, física, negativos e prevenção de alucinação.
- **research/**: notas de comportamento observadas em modelos (Veo/Kling).

## Versionamento

- Cada prompt master deve ter sufixo `vN` (ex.: `..._v1.md`).
- Mudanças devem explicar “o que mudou” e “por quê” (principalmente quando afetam estabilidade geométrica).

