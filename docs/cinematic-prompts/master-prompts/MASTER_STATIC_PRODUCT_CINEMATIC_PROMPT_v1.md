# MASTER_STATIC_PRODUCT_CINEMATIC_PROMPT_v1

## Objetivo

Prompt master para gerar um comercial cinematográfico premium com **produto estático** e **movimento apenas de câmera**.

## Uso

- Copiar este prompt e preencher os campos.
- Manter o produto como **único hero object** (sem dispositivos extras).
- Se necessário, adicionar negativos específicos por categoria em `../rules/negative-prompt-rules.md`.

## Template (EN)

```
A premium cinematic commercial video featuring [PRODUCT NAME] as a static hero object, perfectly rigid, physically grounded, and geometrically unchanged during the entire shot.

Use the product images and metadata as the absolute primary visual reference. Preserve the exact geometry, proportions, materials, surface finish, color, texture, machining details, and product identity.

The object itself must never rotate, spin, tilt, float, animate, or perform any motion. All cinematic movement must come exclusively from the camera choreography around the stationary product.

VISUAL CATEGORY:
[visualCategory] / [subcategory]

MATERIALS:
[materials]

SURFACE FINISH:
[surfaceFinish]

CINEMATIC STYLE:
[cinematicProfile.style]

CAMERA:
[cinematicProfile.camera]

LIGHTING:
[cinematicProfile.lighting]

CAMERA MOTION:
- Type: camera_orbit_showcase
- Intensity: slow
- Style: macro_parallax, dolly_orbit, hero_arc_shot, cinematic_push_in

PHYSICS:
- Rigidity: [physicsProfile.rigidity]
- Allowed motion: camera_only
- Deformation allowed: false

MUST PRESERVE:
[visualRules.mustPreserve]

MUST AVOID:
[visualRules.mustAvoid]

SCENE DIRECTION:
The product remains completely static, rigid, physically grounded, and geometrically unchanged during the entire shot.
The object itself must never rotate, spin, tilt, float, animate, or perform any motion.
All cinematic movement must come exclusively from the camera: slow orbit shots, macro parallax, dolly movement, hero arc shots, controlled push-ins, and premium commercial camera choreography around the stationary product.
No functional operation. No deformation. No wobbling. No chaotic motion. No camera shake.

OUTPUT FORMAT:
Vertical 9:16 TikTok commercial.
Duration: 3 to 5 seconds.
No voice, no subtitles, no text overlays.
Silent cinematic product shot prepared for editing in CapCut.
```

## Explicação por seção (o que cada bloco “resolve”)

### Opening constraint (static hero object)

Este bloco define o conceito central do sistema: o produto é o herói e **não se move**. A intenção é reduzir variação inter-frame do objeto e evitar morphing/peças extras.

### Visual reference priority (use images/metadata as primary reference)

Este bloco declara que as imagens e o metadata são a referência absoluta para: geometria, proporções, materiais e acabamento. A intenção é reduzir “invenção” de detalhes e troca de identidade do produto.

### Motion constraint (camera-only motion)

Este bloco bloqueia explicitamente rotação/animação/flutuação do produto e força a cinematografia vir exclusivamente da câmera. A intenção é maximizar estabilidade geométrica.

### Visual category / subcategory

Este bloco ancora o modelo em um “modo visual” (ex.: industrial). A intenção é facilitar aplicação de negativos específicos (ex.: evitar contaminação com máquinas/ferramentas completas).

### Materials / surface finish

Este bloco trava a leitura de materiais e acabamento (metal, pintura, fosco, polido, etc.). A intenção é evitar troca de material entre frames e “upgrades”/“downgrades” de textura.

### Cinematic style / camera / lighting

Este bloco define linguagem cinematográfica (lente, iluminação, look premium) sem mover o produto. A intenção é produzir sensação de dinamismo com câmera e luz (reflexos/parallax).

### Camera motion (type/intensity/style)

Este bloco escolhe um padrão aprovado: orbit lento + macro parallax + dolly/push-in controlados. A intenção é manter mudanças pequenas e previsíveis entre frames.

### Physics (rigidity / deformation allowed)

Este bloco impede qualquer “física criativa” (wobble, deformação, flex). A intenção é manter o produto rígido e “grounded”.

### Must preserve / must avoid

Este bloco é o “cinto de segurança” do prompt: o que não pode mudar e o que não pode aparecer. A intenção é prevenir contaminação de contexto e alucinações recorrentes.

### Scene direction

Este bloco repete as restrições de forma explícita e operacional (sem tremor, sem ação funcional, sem caos). A intenção é reduzir ambiguidades e aumentar aderência do modelo.

### Output format

Este bloco especifica formato final (9:16, 3–5s, sem texto/voz). A intenção é padronizar entregáveis e evitar elementos indesejados (subtitles/watermarks/text overlays).

## Notas de estabilidade (curtas)

- Evitar instruções de “rotate/float/spin” no corpo do prompt.
- Preferir “camera orbit” e “macro parallax”.
- Evitar cenas com muitos elementos além do produto.
