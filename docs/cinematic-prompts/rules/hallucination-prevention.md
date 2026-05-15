# Prevenção de Alucinação (IA de vídeo)

## Objetivo

Padronizar técnicas para reduzir alucinações e instabilidades recorrentes (geometria, contexto, física e interpolação) ao gerar vídeos de produto com IA.

## Princípio do sistema

- Produto como **static hero object**: rígido, grounded, sem rotação, sem animação.
- Cinematografia por **camera-only motion**: orbit/dolly/push-in lentos e controlados.
- Menos mudança entre frames = menos “reconstrução” = menos morphing.

## Problemas recorrentes e prevenção

### 1) Industrial context contamination

**Sintomas**

- O modelo adiciona elementos industriais não solicitados:
  - drills / grinders / rotary machines
  - mandrels / chucks / holders
  - “corpos de máquina” acoplados ao produto

**Causa típica**

- O prompt sugere “uso funcional” (ex.: girar, perfurar, cortar).
- O produto lembra parte de uma ferramenta; o modelo completa o “sistema”.

**Prevenção**

- Tornar explícito: “standalone hero object” (sem dispositivos acoplados).
- Bloquear “ação”: no drilling action, no cutting action, no sparks.
- Adicionar negativos industriais específicos: ver [negative-prompt-rules.md](file:///c:/Users/abelm/OneDrive/Documentos/GitHub/projeto_tiktok-Categorias_v02/docs/cinematic-prompts/rules/negative-prompt-rules.md).

### 2) Geometry instability (morphing / shape mutation)

**Sintomas**

- O produto “vira outro” ao longo do vídeo: muda proporções, cria/remove furos, muda arestas, cria peças extras.

**Causa típica**

- Rotação do produto, spin, tilt, “animar o objeto”.
- Mudanças grandes de perspectiva do próprio objeto entre frames.

**Prevenção**

- Proibir explicitamente: no rotating product / no spinning object / no animated product.
- Reforçar em 2 lugares do prompt:
  - no início (core constraint)
  - em “SCENE DIRECTION”
- Fixar “rigidity” e “deformation allowed: false”.

### 3) Frame interpolation instability

**Sintomas**

- Deformação em transições; “derretimento” ou troca de forma ao alternar frames.

**Causa típica**

- Frames subjacentes muito diferentes (mudança brusca de composição/ângulo).

**Prevenção**

- Manter:
  - mesma composição base
  - mesmo enquadramento relativo (distância/lente coerentes)
  - mudanças pequenas (leve orbit/push-in)
- Preferir movimentos contínuos e lentos (evitar “cortes” implícitos no prompt).

### 4) Physics instability (floating / unrealistic motion)

**Sintomas**

- Produto flutua, gira sem contato, oscila como gelatina, “gravidade errada”.

**Causa típica**

- Prompt permite motion do objeto ou descreve dinâmica física desnecessária.

**Prevenção**

- Reforçar “physically grounded” e “camera choreography only”.
- Evitar verbos de dinâmica do objeto: rotate, spin, wobble, bounce, levitate.
- Negativos: no floating product, no unrealistic physics.

## Palavras e instruções de alto risco (evitar)

- rotate / rotation / spinning / spin
- floating / levitating
- action verbs funcionais: drilling, cutting, grinding, machining
- “tool in use”, “working”, “operating”, “powered”

## Checklist rápido (antes de rodar)

- Produto descrito como static hero object e grounded
- Proibição explícita de rotação/animação do produto
- Camera motion definido como orbit/dolly/push-in lento e contínuo
- “Must preserve” inclui geometria, proporções, materiais e acabamento
- “Must avoid” inclui contaminação industrial e peças extras
- Sem “uso funcional” na cena

## Regras complementares

- Câmera: ver [camera-motion.md](file:///c:/Users/abelm/OneDrive/Documentos/GitHub/projeto_tiktok-Categorias_v02/docs/cinematic-prompts/rules/camera-motion.md).
- Física: ver [physics-rules.md](file:///c:/Users/abelm/OneDrive/Documentos/GitHub/projeto_tiktok-Categorias_v02/docs/cinematic-prompts/rules/physics-rules.md).
