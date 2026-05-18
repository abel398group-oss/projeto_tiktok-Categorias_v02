# Veo — Behavior Notes (observações de teste)

## Escopo

Notas práticas sobre comportamento observado em testes de comerciais curtos de produto, com foco em estabilidade geométrica e prevenção de contaminação de contexto.

## Padrões observados (gerais)

- Responde melhor quando o prompt repete as restrições-chave (static hero object, camera-only motion) em mais de um bloco (abertura + scene direction).
- Se o prompt permitir rotação/animação do objeto, aumenta a taxa de:
  - morphing / shape mutation
  - peças extras e “mecanismos” implícitos
  - troca de material/acabamento entre frames
- A estabilidade melhora quando a mudança visual entre frames é pequena:
  - orbit lento
  - macro parallax
  - push-in controlado

## Falhas recorrentes

### Contaminação industrial

- Produtos industriais tendem a puxar “complementos” (máquinas, chucks, mandrels, corpos de ferramenta) quando o prompt sugere uso funcional.

Mitigação: negativos industriais específicos + “standalone hero object” + “no functional operation”.

### Interpolação fraca com mudanças bruscas

- Mudanças grandes de ângulo/composição no mesmo clipe aumentam deformação.

Mitigação: coreografia contínua e lenta; evitar instruções que pareçam “cut” ou “jump”.

### Física criativa (floating/spin)

- Se o prompt descreve dinâmica física do objeto, há risco de “float/spin” não realistas.

Mitigação: grounded object + camera choreography only + negativos de física.

## Alavancas que aumentam estabilidade

- Linguagem de “preservação” explícita:
  - preserve exact geometry, proportions, materials, surface finish
  - geometrically unchanged during the entire shot
- Regras de movimento claras:
  - the object itself must never rotate/spin/tilt/float/animate
  - all movement comes exclusively from the camera
- Redução de elementos de cena:
  - fundo simples/limpo
  - evitar props e contexto industrial “rico”

## Defaults recomendados para este projeto

- Conceito: static hero object + cinematic orbit camera
- Duração: 3–5s
- Movimento: orbit lento + macro parallax + push-in leve
- Negativos: morphing/deformation/extra parts + contaminação industrial quando aplicável

## Checklist de validação (pós-geração)

- Geometria do produto não muda ao longo do clipe
- Não surgem peças extras (chuck/mandrel/holder/máquina)
- Produto permanece grounded (sem flutuar)
- Sem “uso funcional” (perfuração/corte/faíscas)
