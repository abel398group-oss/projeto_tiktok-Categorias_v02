# Kling — Behavior Notes (observações de teste)

## Escopo

Notas práticas sobre comportamento observado em testes de comerciais curtos de produto, focadas em: estabilidade geométrica, consistência visual e prevenção de contaminação de contexto.

## Padrões observados (gerais)

- Quando o prompt é ambíguo sobre “quem se move”, o modelo pode mover o produto (rotação/spin) e isso aumenta instabilidade.
- A consistência melhora quando:
  - o produto é declarado como static hero object
  - o movimento é restrito a camera-only motion
  - o prompt explicita “geometrically unchanged during the entire shot”
- Cenários “industriais” tendem a puxar contexto (máquinas/holders) se não houver negativos e “standalone hero object”.

## Falhas recorrentes

### Geometry instability ao rotacionar o produto

- Rotação/animação do objeto aumenta morphing e mutação de forma.

Mitigação: proibir rotação/animação do produto e mover somente a câmera (orbit lento).

### Elementos extras em produtos industriais

- Aparição de chuck/mandrel/holders e corpos de máquina.

Mitigação: negativos industriais + “no attached device” + “no functional operation”.

### Física instável

- Floating/spin não realistas se o prompt permitir dinâmica do objeto.

Mitigação: grounded object + no unrealistic physics + camera choreography only.

## Defaults recomendados para este projeto

- Movimento: orbit lento, contínuo, sem shake
- Produto: 100% estático, grounded, rígido
- Prompt: repetir restrição de motion (abertura + scene direction)
- Negativos: morphing/deformation/extra parts + negativos industriais quando aplicável

## Checklist de validação (pós-geração)

- Produto não gira e não “muda de identidade”
- Não aparecem dispositivos/maquinário adicionais
- Sem texto/overlays/watermarks
- Movimento de câmera suave e contínuo (sem saltos)
