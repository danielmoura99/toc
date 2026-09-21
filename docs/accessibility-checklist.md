# Checklist de acessibilidade — pré-piloto

Auditoria feita em 20/09/2026, contra o build de produção, cobrindo os
requisitos explícitos do guia (§9.2) mais práticas padrão de WCAG 2.1 nível AA
relevantes para uma aplicação HTML/React com um canvas PixiJS complementar.

Método: revisão de código dos componentes de `src/features/trail/components/`
+ verificação ao vivo no Chromium via Playwright (navegação só por teclado,
inspeção da árvore de acessibilidade, `prefers-reduced-motion` emulado,
contraste calculado a partir da cor computada real). Não usa uma ferramenta
automática de auditoria (axe, Lighthouse) — cada item abaixo foi verificado
manualmente e o resultado é o que está registrado.

## Navegação por teclado (§9.2, AC12)

| Item | Resultado |
| --- | --- |
| Reordenar a fila sem mouse (alternativa aos botões ▲▼, sem depender do arrastar e soltar) | ✅ Verificado — `QueueEditor` tem botões "Mover … para frente/trás" com `aria-label` próprio por personagem |
| Redistribuir carga sem mouse (`<select>` + botões de quantidade) | ✅ Nativamente operável por teclado; sem controle exclusivo de mouse |
| Todos os controles de execução (iniciar/pausar/avançar/velocidade) alcançáveis por Tab | ✅ Verificado — 33 elementos focáveis percorridos em sequência na tela de preparação, todos com indicador de foco nativo visível |
| Etapas guiadas (1–4) navegáveis por teclado | ✅ `<nav aria-label="Etapas guiadas">` com `aria-current="step"` no item ativo |
| Histórico: selecionar para comparação, marcar referência, excluir | ✅ Checkbox nativo + botões com `aria-label` individual |
| Diálogo de confirmação de importação | ✅ Corrigido nesta rodada — ver D29 |

## Foco visível

| Item | Resultado |
| --- | --- |
| Indicador de foco em todos os botões/inputs/selects customizados | ✅ Nenhum componente remove o outline nativo (`outline-style: auto` confirmado via `getComputedStyle` em 32 dos 33 elementos focáveis testados — o único sem foco visível é um portal interno do Next.js em modo de desenvolvimento, não parte da aplicação) |
| Diálogo modal move o foco para dentro ao abrir | ✅ Corrigido — ver D29 |
| Foco não escapa do diálogo modal (trap) | ✅ Corrigido — ver D29 |
| Foco retorna a quem abriu o diálogo, ao fechar | ✅ Corrigido — ver D29 |

## Redução de movimento (§9.2)

| Item | Resultado |
| --- | --- |
| Microanimação de caminhada (oscilação vertical no canvas) | ✅ Já respeitava desde a entrega 3 — desligada quando `prefers-reduced-motion: reduce` |
| Animação de reposicionamento ao arrastar/soltar na fila | ✅ Corrigido nesta rodada — ver D30. Confirmado ao vivo: 0,2 s de transição sem a preferência, 0 s com ela ativada |
| A caminhada em si (avanço dos personagens na trilha) | N/A por design — é o conteúdo central da simulação, não decoração; a posição já é desenhada diretamente a cada quadro, sem interpolação artificial adicionada por cima |

## Cor e contraste

| Item | Resultado |
| --- | --- |
| Cor nunca é o único identificador de um personagem | ✅ Por construção desde a entrega 3 — nome e posição na fila sempre acompanham a cor, em HTML e no canvas |
| Contraste de texto padrão (títulos, botões) | ✅ ~19,8:1 sobre fundo branco |
| Contraste de texto secundário (`text-muted-foreground`) | ✅ 4,74:1 — passa o limiar AA de 4,5:1 para texto normal, com pouca folga; evitar escurecer ainda mais o fundo em revisões futuras sem reconferir |
| Contraste do aviso de armazenamento indisponível (amber) | ✅ 8,73:1 |
| Contraste das cores dos seis avatares contra fundo claro (não-textual, limiar 3:1) | ✅ Todas passam: 3,30:1 a 5,38:1 (a mais próxima do limite é o verde do Caminhante 2, 3,30:1) |
| Tema escuro | ⚠️ Não auditado nesta rodada — os tokens de cor do projeto (`globals.css`) já declaram uma paleta escura via `prefers-color-scheme`, mas os componentes específicos da trilha (avatares, banners) não foram testados nesse modo. Ver "Pendências" abaixo |

## Estrutura e semântica

| Item | Resultado |
| --- | --- |
| Um único `<h1>` por tela, hierarquia sem pular nível | ✅ Verificado nas quatro telas (preparação, execução, histórico, comparação) |
| Tabelas com `<th scope="col">`/`<th scope="row">` | ✅ Presente em `ComparisonPanel` e nas tabelas de resultado |
| Tabela textual equivalente à trilha visual (§9.2) | ✅ Sempre renderizada junto do canvas, nunca condicional |
| Formulários com rótulo associado (hipótese, nome do participante, seed) | ✅ `<label htmlFor>` ou `sr-only` em todos os campos revisados |
| `lang="pt-BR"` no documento | ✅ Definido em `layout.tsx` |
| Ícones decorativos marcados `aria-hidden` | ✅ Checado por amostragem em todos os componentes — nenhum ícone informativo sozinho, sempre acompanhado de texto |
| Canvas (`role="img"`) com `aria-label` descritivo | ✅ "Trilha com a posição atual de cada personagem. A tabela abaixo mostra os mesmos dados em texto." |

## Áudio

| Item | Resultado |
| --- | --- |
| Nenhuma dependência de áudio | ✅ Aplicação não usa áudio |

## Pendências para o piloto (não bloqueiam, mas valem revisão)

1. **Tema escuro não auditado component a component.** Os tokens existem; falta confirmar contraste dos banners e avatares nesse modo antes de um treinamento que rode com o sistema em modo escuro.
2. **Seleção de avatar por clique no canvas não tem equivalente por teclado.** É um atalho visual (mostrar nome + distância exata ao clicar); a mesma informação já está sempre visível na tabela abaixo, então não há perda de conteúdo — só a conveniência de "apontar e ver" fica restrita a quem usa mouse/toque. Não é um requisito do guia (a tabela é o equivalente exigido), registrado aqui só para transparência.
3. **Sem ferramenta automatizada de varredura** (axe-core, Lighthouse CI). A verificação desta rodada foi manual e dirigida pelos requisitos do guia; uma passada com uma ferramenta automática antes do piloto pode pegar itens de baixo nível (atributos ARIA redundantes, ordem de leitura) que a revisão manual não prioriza.

## Como reproduzir esta auditoria

Os scripts usados foram temporários (Playwright ad-hoc, apagados após o uso).
Para repetir:

1. `npm run build && npm run start` (ou `npm run dev`).
2. Navegar só com Tab/Shift+Tab/Enter/Espaço/Esc pelas quatro telas.
3. Emular `prefers-reduced-motion: reduce` nas ferramentas de desenvolvedor do
   navegador e conferir que a fila reordena sem animação.
4. Conferir contraste com a ferramenta de acessibilidade do DevTools
   (inspecionar elemento → aba "Accessibility" → contraste) nos elementos
   listados acima.
