# Atualização visual da caminhada

A primeira entrega ficou restrita a `rendering/trailScene.ts`, ao novo módulo
`rendering/walkerArtwork.ts` e à referência da fonte em `src/app/globals.css`.
Após a conclusão das correções paralelas, a apresentação foi integrada em
`TrailRun.tsx` e `TrailExperience.tsx`.

- Caminhantes vetoriais com mochila dimensionada pela carga, sem novas imagens
  externas ou dependências.
- Rótulos com identificação, nome do participante quando preenchido e carga.
- Cenário discreto com escala horizontal linear: espaços continuam comparáveis.
- Separação vertical apenas visual e rótulos voltados para dentro na chegada.
- Oscilação ligada ao tempo simulado e ao movimento observado; não avança
  durante a pausa e respeita a preferência de redução de movimento.
- Correção de `--font-sans` para a variável Geist já definida no layout.

A API pública de `TrailScene` foi preservada. `WalkerVisualSpec.loadKg` é
opcional para compatibilidade. Nenhuma fórmula, posição ou resultado do motor
foi alterado. A interpolação visual adicionada na revisão paralela foi preservada.

## Integração concluída

- Pergunta da etapa em destaque, com objetivo coletivo e estado da execução.
- Indicadores maiores, identificados semanticamente e com explicações curtas.
- Seed, versão do motor e revisão do cenário em detalhes expansíveis.
- Unidades de reprodução explícitas e explicação das velocidades da tabela.
- Layout mais amplo e espaçamentos compactos para projeção em 1366 × 768.
- Título neutro da tela; o estado mostra se está pronta, pausada ou concluída.

Verificação: cinco fluxos Playwright existentes passaram; lint e TypeScript
passaram. Inspeção visual em 1366 × 768, 1920 × 1080 e largura de 390 px.
As capturas da integração estão em `docs/visual-preview/integrated-*.png`.
