# Decisões de desenvolvimento

## 2026-09-20 — Integração visual após as correções funcionais

A tela de caminhada destaca a pergunta da etapa e os indicadores de tempo e
progresso coletivo. Seed, versão do motor e revisão do cenário ficam em
“Detalhes da tentativa”, acessíveis sem competir com a orientação do grupo.
O título da página passa a “Caminhada do grupo”; um estado textual separado
informa preparação, execução, pausa ou encerramento.

O layout usa até 1152 px e espaçamentos compactos para acomodar os controles,
indicadores e canvas na projeção de 1366 × 768 na configuração inicial. Hipótese,
avisos e detalhes abertos podem exigir rolagem. Os detalhes por personagem
continuam abaixo da trilha. Nenhuma regra do motor ou de persistência mudou.

O teste existente de pausa agora encontra o relógio pelo grupo acessível
“Relógio simulado”, sem depender da classe de tamanho de fonte. Cinco fluxos
E2E passaram após a integração. Registro visual em `docs/visual-trail-update.md`.

Registro de decisões tomadas durante a implementação que não estão explicitadas
no `GUIA_MVP_SIMULADOR_DA_TRILHA.md`. Cada entrada diz o que foi decidido, por
quê, e o que exigiria revisitá-la.

---

## 2026-09-20 — Entrega 1 (domínio)

### D01 — Estrutura em `src/`, com `features/` fora de `app/`

O guia (§10.4) propõe `src/app/…` e `src/features/trail/…`. O projeto estava
montado com `app/` na raiz. Migrado para `src/`, com `@/*` apontando para
`./src/*` e `components.json` atualizado para `src/app/globals.css`.

**Por quê:** seguir o guia e manter o domínio visivelmente fora da árvore de
rotas, reforçando que ele não depende de Next.js.

### D02 — `maxLoadKg` é derivado, nunca escrito à mão

`buildScenario()` calcula `maxLoadKg = 3 × referenceLoadKg` a partir de uma
constante única (`MAX_LOAD_FACTOR`). Os cenários declaram apenas
`referenceLoadKg`. A validação rejeita qualquer configuração cujo `maxLoadKg`
divirja da fórmula (código `max_load_not_derived`).

**Por quê:** evitar duas fontes de verdade e impedir que um JSON importado
adultere o limite de carga sem que isso apareça.

**Para mudar:** uma exceção por personagem exigiria alterar a regra
explicitamente e incrementar a versão do motor.

### D03 — IDs de item derivados do dono inicial

Itens recebem IDs estáveis no formato `<dono-inicial>-sNN` (ex.: `p5-s01`).
Cada unidade de 1 kg tem identidade própria; a interface pode agrupar a
exibição por quantidade.

**Por quê:** IDs previsíveis tornam os testes de conservação legíveis e
facilitam inspecionar um JSON exportado. O prefixo é apenas o dono *inicial*:
após uma transferência, `ownerByItem` é a única verdade sobre a posse.

### D04 — Hash separado da mistura final

`random.ts` expõe `fnv1a32Raw` (FNV-1a puro) e `finalMix` separadamente, além
do `fnv1a32` combinado.

**Por quê:** o guia (§7.3) pede vetores de teste fixados no repositório. O
FNV-1a tem vetores públicos conhecidos; a mistura final não. Separar permite
travar a parte padronizada contra vetores oficiais
(`tests/domain/random.test.ts`) em vez de apenas contra a própria implementação.

A mistura final existe porque o FNV-1a concentra pouca entropia nos bits altos
— justamente os que mais pesam ao dividir por `2**32`.

### D05 — Chegada e limitação pela fila no mesmo tick

`alvo_livre` já embute `min(distância_total, …)`. Portanto, quando o corte do
tick vem do destino e não de quem está à frente, o personagem **não** acumula
tempo limitado.

**Consequência observável, verificada em teste:** no caso "rápido atrás de
lento" com 100 m a 1 m/s, o rápido acumula 99 s de tempo limitado, não 100 s. No
último tick quem o corta é a linha de chegada, não a fila.

### D06 — `ComparisonResult` declara os motivos de incomparabilidade

`compareAttempts` devolve uma lista de `issues` tipadas (`seed`, `scenario`,
`cast`, `engine_version`, …) e um bloco `changes` com o que mudou entre as duas
tentativas, sempre — mesmo quando não são comparáveis.

**Por quê:** o guia (§8.2) exige mostrar as diferenças explicitamente e não
calcular ganho controlado entre cenários ou seeds diferentes. `improvementPct`
é `null` sempre que a comparação não é controlada ou alguma execução não
concluiu.

### D07 — Estratégias da calibração derivadas dos dados, não dos IDs

O script de calibração usa cinco estratégias genéricas:

1. **inicial** — como o cenário define;
2. **ordem** — mais lento à frente (velocidade sem variação, empate pelo ID);
3. **carga** — subida de encosta sobre o gargalo: move 1 kg do mais lento para o
   mais rápido com folga enquanto isso elevar a *menor* velocidade do grupo;
4. **ambas** — carga e depois ordem;
5. **excesso** — despeja toda a carga do gargalo sobre o mais rápido, até o
   limite dele, preservando a ordem.

**Por quê:** nenhuma menciona um personagem específico. É isso que permite
aplicar exatamente as mesmas cinco estratégias aos cenários A e B e verificar
se o efeito acompanha a restrição quando ela muda de lugar — que é o objetivo do
cenário B.

A estratégia **excesso** existe para cobrir o critério §6.3 "transferir peso
demais para outro pode deslocar a restrição", que as outras quatro não
exercitam: a estratégia de carga para exatamente quando a próxima transferência
criaria um novo gargalo, então nunca chega ao excesso. Ver D09.

### D08 — `@types/node` alinhado ao runtime

Subido de `^20` para `^24`, igual ao Node em uso (v24.11.1).

**Por quê:** o Vitest 5 exige `@types/node` `^22 || >=24`. Alinhar os tipos ao
runtime real resolve o conflito de peer dependency sem `--legacy-peer-deps`.

### D09 — A redistribuição excessiva alivia e desloca ao mesmo tempo

Nos dois cenários, despejar toda a carga do gargalo sobre o personagem mais
rápido produz p3 com 24 kg e um resultado **melhor que não fazer nada, e pior
que equilibrar**: −24,2% contra −30,1% no cenário A, −21,6% contra −27,5% no B.

**Por que isso importa para o treinamento:** a equipe acerta o diagnóstico
(identifica a restrição) e erra a dose. O ganho parcial é real e pode convencer
o grupo de que a solução estava completa. O número ao lado — a redistribuição
equilibrada — é o que mostra quanto ficou na mesa.

Detalhe observado na calibração: no cenário A o excesso *triplica* a dispersão
máxima em relação ao equilíbrio (463 m contra 137 m), enquanto no cenário B ela
fica baixíssima (18,5 m). A diferença é a posição do novo gargalo na fila — em B,
p3 já está em primeiro, e um gargalo na frente comprime o grupo atrás dele. Boa
munição para a discussão: dispersão descreve a formação, não a capacidade.

---

## Resultados da calibração — motor 1.0.0, RNG `fnv1a32-mix-1`

24 seeds fixas (`calib-001` … `calib-024`), nos dois cenários. Medianas:

### Cenário A (restrição: p5, 18 kg sobre referência de 6 kg)

| Estratégia | Tempo total | vs. inicial | Dispersão máx |
| --- | ---: | ---: | ---: |
| Inicial | 64:09 | — | 1070,1 m |
| Ordem | 64:09 | −0,0% | 0,0 m |
| Carga | 44:52 | −30,1% | 137,4 m |
| Ambas | 44:47 | −30,2% | 95,2 m |
| Excesso | 48:37 | −24,2% | 463,0 m |

### Cenário B (restrição: p2, 18 kg sobre referência de 6 kg)

| Estratégia | Tempo total | vs. inicial | Dispersão máx |
| --- | ---: | ---: | ---: |
| Inicial | 62:05 | — | 1109,9 m |
| Ordem | 62:05 | −0,0% | 0,3 m |
| Carga | 45:02 | −27,5% | 117,0 m |
| Ambas | 44:52 | −27,7% | 98,8 m |
| Excesso | 48:40 | −21,6% | 18,5 m |

Nenhum timeout em 240 execuções. As faixas são estreitas (cerca de 2 min entre
mínimo e máximo), então os efeitos não dependem de uma seed conveniente.

### Leitura pedagógica

O resultado central do §6.3 aparece: **reorganizar a fila zera a dispersão e não
muda o tempo**. Colocar o mais lento na frente deixa o grupo compacto, mas o
tempo do último continua sendo o tempo do gargalo — a fila ficou arrumada, a
capacidade de avanço não mudou. Aliviar a restrição, por outro lado, corta cerca
de 30% do tempo.

Isso é exatamente a distinção que o guia pede que os participantes consigam
explicar (§2.4): reduzir a dispersão da fila não é a mesma coisa que aumentar
sua capacidade de avanço.

Todos os cinco critérios de calibração do §6.3 estão cobertos, incluindo
"transferir peso demais para outro pode deslocar a restrição" — ver D09.

---

## 2026-09-20 — Entrega 2 (preparação)

### D10 — Permissões de etapa na aplicação, validade física no domínio

`application/stages.ts` declara, por etapa guiada, o que pode ser **editado**
(`canReorder`, `canRedistribute`, `scenarioId`). O domínio não conhece etapas:
`validateConfig` rejeita uma configuração fisicamente inválida em qualquer
etapa.

**Por quê:** é a separação que o guia pede em §11.1. Uma mochila acima do limite
é inválida sempre; já "esta etapa ainda não libera redistribuir" é uma regra de
condução do treinamento, não uma lei do modelo.

Na prática: nas etapas 1 e 2 o painel de mochilas aparece **desabilitado**, e não
escondido. O grupo precisa ver a distribuição para discutir onde está a
restrição — ele só não pode mudá-la ainda.

### D11 — Store guarda a preparação, nunca o estado por tick

`preparationStore` (Zustand) guarda apenas a etapa e a configuração em edição. O
estado por tick da simulação vive no componente de execução, numa `ref`.

**Por quê:** o guia (§10.1) pede explicitamente "sem gravar cada frame no
React". A 60 quadros por segundo a 30 s simulados/s, publicar cada tick no store
dispararia centenas de renderizações por segundo sem nenhum ganho.

Ao iniciar, a configuração é congelada com `structuredClone` e o componente de
execução é remontado por `key`. Editar a preparação durante ou depois de uma
tentativa não altera o que está rodando (R02, R12).

### D12 — Trocar de etapa descarta as edições

`setStage` recarrega a configuração inicial do cenário daquela etapa.

**Por quê:** cada etapa declara condições preservadas próprias (§4.1). Carregar
edições de uma etapa anterior tornaria ambíguo o que mudou entre as tentativas,
que é justamente o que a comparação controlada precisa isolar.

**Consequência:** o operador não pode "continuar de onde parou" ao avançar de
etapa. Se isso atrapalhar no piloto, a alternativa é oferecer a escolha
explicitamente, e não herdar em silêncio.

### D13 — `DndContext` com `id` fixo

O `DndContext` do dnd-kit recebe `id="trail-queue"`.

**Por quê:** sem ele, o dnd-kit deriva os ids de acessibilidade
(`aria-describedby`) de um contador de módulo, que começa em valores diferentes
no render do servidor e no do cliente. Isso produzia um erro de hidratação real,
detectado ao rodar a página no navegador — não aparecia nos testes de domínio.

### D14 — `data-testid` nas linhas de fila e mochila

Cada linha carrega `data-testid="queue-<id>"` ou `backpack-<id>"`.

**Por quê:** selecionar por texto é ambíguo aqui — o nome de um personagem
aparece também como *opção* no `select` de destino das outras linhas, e um
seletor por texto acaba agindo na linha errada. Os fluxos Playwright da entrega 5
vão precisar desses âncoras de qualquer forma.

---

## 2026-09-20 — Entrega 3 (simulação visual)

### D15 — Física e renderização desacopladas em duas cadências

`TrailRun` mantém `stateRef` (atualizada a cada tick, sem exceção) e `hudState`
(estado do React, publicado no máximo a 10 Hz — §10.2). O canvas PixiJS
(`PixiCanvas`) roda seu próprio laço de `requestAnimationFrame` e lê
`stateRef.current` a cada quadro, independente de quando o React re-renderiza.

**Por quê:** é a exigência literal do guia — "publicar snapshots para HUD a até
10 Hz e renderizar o canvas na cadência disponível". Sem essa separação, o
canvas ficaria preso à cadência de `setState`, e a tabela/indicadores
re-renderizariam a cada tick físico (até 60×/s em reprodução rápida) sem
necessidade.

### D16 — `TrailScene` não conhece React nem o motor

`rendering/trailScene.ts` é um módulo PixiJS puro: recebe `SimulationState` já
calculado e desenha. Não importa nada de `application/` ou de React. A fronteira
do §10.2 ("PixiJS não resolve regra, peso, aleatoriedade ou chegada") é
estrutural, não uma convenção a lembrar.

`PixiCanvas.tsx` é a única ponte: cria a `Application` assincronamente,
protege contra desmontagem antes da resolução da promise, e no cleanup remove
ticker, canvas e recursos possuídos pela instância (§10.3). Verificado sob
React Strict Mode (double-mount): sempre exatamente um canvas ao final.

### D17 — Geometria dos avatares dimensionada para o pior caso, não o caso comum

Primeira versão usava `LANE_OFFSET_PX` menor que o diâmetro do avatar — com os
seis personagens agrupados (o que acontece em todo `t=0`, sempre, já que todos
partem de `x=0`), os círculos se sobrepunham e alguns desapareciam atrás de
outros. Ajustado para `LANE_OFFSET_PX = 22` (diâmetro do avatar é 18px, sobra
~4px de vão) e os marcadores estáticos da trilha (textos de distância) foram
afastados da linha o suficiente para nunca colidir com o maior agrupamento
possível — não o típico, o máximo.

**Por quê:** o defeito só apareceu rodando no navegador; nenhum teste de
domínio o pegaria, porque é puramente geométrico. Fica registrado o método: ao
dimensionar qualquer offset visual que depende de contagem de personagens,
calcular para `n = 6` no mesmo ponto, não para o caso típico já espalhado.

### D18 — Seleção de avatar mostra a distância exata, sem round-trip ao React

Clicar num avatar alterna uma seleção interna à `TrailScene` (não ao estado do
React) e troca o rótulo daquele avatar de `shortLabel` para
`"<nome> · <distância> m"`, com anel de destaque. Satisfaz §9.2 ("separação de
sobreposição é visual; mostrar distância numérica ao selecionar") sem inventar
um canal de comunicação canvas→React que essa etapa não precisa.

### D19 — Área de chegada como visualização própria, não como ponto final da trilha

Ao chegar, o avatar sai da linha da trilha e passa a ocupar uma posição fixa
numa coluna vertical à direita do destino, empilhado por ordem de chegada
(primeiro no topo). Resolve dois requisitos do guia ao mesmo tempo: representar
os personagens numa área de chegada sem alterar os resultados (§9.2), e evitar
que a sobreposição do final — onde a dispersão tende a zero por construção —
esconda quem chegou em que ordem.

---

## 2026-09-20 — Entrega 4 (aprendizado)

### D20 — Gravação da tentativa dentro do laço de tick, não num efeito à parte

O registro no histórico acontece no exato ponto em que `advanceTicks` detecta
`isTerminal` — dentro do laço de física (chamado pelo `requestAnimationFrame`
ou pelo botão "Avançar 30 s"), não num `useEffect` observando `finished`.

**Por quê:** um `useEffect` que chama `setState` diretamente no corpo aciona o
aviso do React 19 sobre efeitos que disparam renderizações em cascata (visto
já na entrega 1, ao corrigir o reset de cenário — D-anterior). Gravar no mesmo
lugar onde o status já é decidido evita reintroduzir o problema e elimina
qualquer dúvida sobre "quando exatamente a tentativa foi registrada": é no
mesmo tick que ela terminou, nunca um render depois.

`recordedRef` garante exatamente uma gravação por tentativa, mesmo que
`advanceTicks` seja chamado de novo depois do status virar terminal (não
deveria acontecer, mas o guard é barato).

### D21 — Referência inicial é conveniência de UI, não conceito do domínio

`compareAttempts` (entrega 1) não sabe o que é "referência" — compara duas
`AttemptResult` quaisquer. `attemptsStore.referenceAttemptId` só decide *qual
coluna aparece primeiro* na tela de comparação por padrão, seguindo §4.1 ("a
primeira execução concluída da etapa 1 vira a referência inicial"). Quando a
referência está entre as tentativas selecionadas, ela sempre vira a base da
comparação, mesmo que tenha sido selecionada depois — do contrário a leitura
"tempo caiu X% em relação à referência" ficaria invertida conforme a ordem de
clique, o que não faz sentido pedagógico.

O operador pode trocar a referência manualmente (`setReferenceAttempt`) e
apagar a tentativa de referência não promove outra automaticamente — fica
`null` até alguém escolher, porque promover implicitamente inventaria uma
decisão que é do facilitador.

### D22 — Limite de 20 recusa gravar, não descarta a mais antiga

`recordAttempt` devolve `{ ok: false, reason: 'history_full' }` ao atingir 20
tentativas, em vez de substituir a mais antiga. A tela mostra um aviso
explícito e a tentativa recém-concluída fica só na tela (visível nos
resultados), não desaparece — mas não entra no histórico até haver espaço.

**Por quê:** o guia (§12) proíbe descarte silencioso. Substituir a mais antiga
seria silencioso do ponto de vista de quem está gravando a tentativa nova; a
exclusão seletiva (delivery já disponível, sem esperar a entrega 5) é o único
caminho para abrir espaço.

### D23 — Feedback gerado só a partir de `ComparisonResult`, nunca de números soltos

`application/feedback.ts` recebe o `ComparisonResult` já calculado pelo
domínio e só formata frases — nunca recalcula nem arredonda de outra forma. A
frase "ordem e carga mudaram juntas, não dá para isolar a causa" só aparece
quando `orderChanged && loadChanged` são ambos verdadeiros, nunca como uma
suposição.

**Por quê:** §8.3 pede o formato exato "O tempo caiu X%, enquanto a dispersão
máxima aumentou Y m" e proíbe atribuir causalidade quando várias mudanças
aconteceram ao mesmo tempo ou declarar "solução ótima". Testado literalmente
contra esse formato em `tests/application/feedback.test.ts`.

### Verificação no navegador

Rodei duas tentativas do cenário A (configuração inicial e com p5 movido para
a frente) até a conclusão. Resultado observável, sem eu ter que forçar nada:
**mesma seed e mesmo tempo total (62:35) nas duas, mas dispersão máxima caindo
de 1026 m para 0 m** — reorganizar a fila compacta o grupo sem mudar o tempo
do último, exatamente o resultado central da calibração (entrega 1). A tela
de comparação mostra isso com a referência como base, a frase de feedback
("o tempo total não mudou entre as duas tentativas") e a lista de perguntas
para discussão. Exclusão seletiva testada: apagar a tentativa de referência
limpa a referência sem promover outra, e o histórico vazio mostra a mensagem
correta.

---

## 2026-09-20 — Entrega 5 (persistência)

### D24 — Zod valida forma, `validateConfig` valida física; nenhum dos dois duplica o outro

`persistence/schema.ts` usa Zod só para o que Zod resolve bem: presença de
campos e tipos primitivos de um JSON arbitrário, sem lançar. A validade física
de cada tentativa (carga dentro do limite, ordem completa, item com dono
único) continua exclusivamente em `validateConfig`, chamado a partir daqui
sobre cada `attempt.config` do histórico importado. Duas fontes de verdade
para a mesma regra era exatamente o problema que D02 já tinha evitado para
`maxLoadKg`; aqui é o mesmo princípio aplicado à importação.

### D25 — Rejeição é tudo-ou-nada, não importação parcial

Um payload é aceito ou recusado inteiro — nunca "importa o histórico mas
ignora a preparação inválida" ou "importa 18 das 20 tentativas". A versão do
motor incompatível é verificada primeiro e, se falhar, as checagens físicas
nem rodam (elas falhariam pelo mesmo motivo em cada tentativa, poluindo a
mensagem sem acrescentar informação).

**Por quê:** o guia pede "validar schema e invariantes antes de substituir a
sessão" e "rejeitar com mensagem clara" — linguagem de portão único, não de
degradação parcial silenciosa. Import parcial impediria o operador de saber
com certeza o que está vendo na tela é exatamente o que estava no arquivo.

### D26 — `persistence/` não conhece Zustand; `application/sessionSync.ts` é quem liga os dois lados

`persistence/` (schema, adaptador de localStorage, importação/exportação de
arquivo) é puro: recebe dados, devolve dados, nunca importa uma store. Quem
decide *quando* salvar, *quando* restaurar e como aplicar um payload nas
stores é `application/sessionSync.ts`. Essa fronteira evita a tentação de
validar a preparação contra o cenário atual dentro de `schema.ts` — o que
puxaria `application/stages` e `scenarios/` para dentro da camada de
persistência, invertendo a direção de dependência que o resto do projeto já
segue (domínio ← persistência ← aplicação ← componentes).

### D27 — Autosave por assinatura da store, não por chamada espalhada pelos handlers

`TrailExperience` assina `preparationStore` e `attemptsStore` uma única vez e
salva com debounce de 500 ms a qualquer mudança, em vez de cada componente
(`QueueEditor`, `BackpackEditor`, `Preparation`, `TrailRun`) chamar
`saveCurrentSession()` manualmente. Como o laço de física nunca escreve nessas
stores — ele vive isolado numa `ref` desde a entrega 3 — reagir a *qualquer*
mudança nelas já significa reagir só a ações discretas do operador, nunca a um
tick. Isso cumpre "salvar após mudanças confirmadas... nunca a cada frame" por
construção, sem precisar decidir manualmente, em cada handler, se aquela ação
específica "conta" como confirmada.

### D28 — Restaurar ao montar é guardado por ref, não por dependência vazia sozinha

`hasRestoredRef` impede uma segunda restauração se o efeito rodar duas vezes
sob Strict Mode. Sem o guard, a segunda chamada releria o mesmo localStorage
(inofensivo aqui, já que nada muda entre as duas leituras) — mas o guard deixa
explícito que "restaurar" é uma operação de inicialização única, não algo que
deveria rodar de novo a cada remontagem do componente.

### Verificação no navegador — reload de verdade, não simulado

Completei uma tentativa, esperei o autosave (debounce de 500 ms) e chamei
`page.reload()` do Playwright — um recarregamento real do navegador, não uma
técnica de teste que só reencena o estado em memória. Depois do reload: título
volta para "Preparação da tentativa", banner "Sessão anterior restaurada
deste navegador" aparece, e o histórico mostra a tentativa gravada antes do
reload. É a verificação literal do AC10 e do fluxo do §13.2.

Também verificados, todos sem erro de JS e sem tela vazia:
- **Exportar → importar**: arquivo baixado é um JSON válido com `schemaVersion:1`;
  reimportado, mostra o resumo correto (1 tentativa, cenário A, sem hipótese)
  antes de qualquer substituição.
- **JSON corrompido**: rejeitado com mensagem clara ("Expected property name...");
  a sessão em tela permanece intacta.
- **Versão de motor incompatível**: rejeitado com a mensagem exata
  "Versão do motor incompatível: sessão salva com 0.0.1, versão atual é 1.0.0.";
  sessão em tela também permanece intacta.
- **localStorage bloqueado** (simulando navegação privada): a aplicação carrega,
  mostra o aviso amarelo, e continua 100% funcional em memória — dá para
  preparar e iniciar uma tentativa normalmente, só não sobrevive a fechar a aba.

---

## 2026-09-20 — Entrega 6, preparação do piloto (acessibilidade)

Auditoria completa em `docs/accessibility-checklist.md`. Dois defeitos reais
encontrados rodando no navegador — nenhum dos dois aparecia em teste de
domínio ou de store, só ficaram visíveis navegando só por teclado.

### D29 — Diálogo de importação não prendia o foco

`ImportSummaryDialog` tinha `role="dialog"` e `aria-modal="true"`, mas nada
impedia o Tab de sair dele: o foco continuava livre pela tela de preparação
atrás do modal, que ficava visualmente bloqueada (fundo escurecido) mas não
estava de fato bloqueada para quem navega só por teclado. Confirmado ao vivo
com Playwright: Tab repetido escapava do diálogo, e Escape não fazia nada.

Corrigido com `useFocusTrap` (`components/useFocusTrap.ts`), um hook pequeno
que segue o padrão APG "Dialog (Modal)": move o foco para dentro ao montar,
prende Tab/Shift+Tab dentro dos elementos focáveis do diálogo, Escape aciona
o cancelamento, e o foco volta para quem abriu o diálogo ao desmontar. Não é
específico do diálogo de importação — qualquer modal futuro reaproveita o
mesmo hook.

**Detalhe da correção:** a primeira versão escrevia `onEscapeRef.current =
onEscape` direto no corpo da função (fora de um efeito), o que o lint do
React 19 rejeita como acesso indevido a ref durante o render — o mesmo tipo de
problema já visto na entrega 1 (reset de cenário) e na entrega 4 (gravação de
tentativa). Corrigido movendo a atribuição para dentro de um `useEffect` sem
lista de dependências, que roda a cada render e mantém a ref sincronizada sem
tocar nela durante a fase de render.

### D30 — Reordenar a fila animava mesmo com redução de movimento ativada

O `useSortable` do dnd-kit aplica uma transição CSS de 200 ms nos itens que se
reacomodam quando a fila é reordenada — tanto arrastando quanto pelos botões
de posição. Isso nunca foi desligado por `prefers-reduced-motion`. A
microanimação da caminhada no canvas já respeitava a preferência desde a
entrega 3; esta era a mesma lacuna, só que na tela de preparação em vez da
execução.

Corrigido passando `transition: null` ao `useSortable` quando
`usePrefersReducedMotion()` (novo hook, `components/usePrefersReducedMotion.ts`)
é verdadeiro. O hook escuta o evento `change` do `matchMedia`, então reage se
o operador ligar a preferência do sistema com a aplicação já aberta — cenário
plausível numa sala de treinamento onde o notebook não é necessariamente
configurado com antecedência.

**Verificado ao vivo, não só por inspeção de código:** simulei um arrasto real
com o mouse do Playwright e li a `transition-duration` computada dos itens que
se reacomodam. Sem a preferência: 0,2 s. Com `prefers-reduced-motion: reduce`
emulado: 0 s em todos. Um teste anterior, mais simples, usando o botão de
mover por teclado em vez de arrastar, não detectava diferença — o dnd-kit só
aplica essa transição durante uma sessão de arrasto reconhecida por ele
mesmo, não quando a ordem muda por uma ação externa à store. Isso não invalida
a correção (o cenário real que motivou o item é o arrasto), mas é um lembrete
de testar o caminho que efetivamente produz o efeito, não um caminho parecido.

### O que a auditoria não encontrou problema

Contraste de cor (texto e os seis avatares), estrutura de heading, rótulos de
formulário, alternativa por teclado a arrastar e soltar (já existia desde a
entrega 2), tabela textual equivalente ao canvas, e indicador de foco nativo
em todos os controles — nenhum desses precisou de correção. Detalhes e
números em `docs/accessibility-checklist.md`.

### Pendências deixadas explícitas para o piloto

Registradas no checklist, não corrigidas agora por estarem fora do escopo
verificável sem mais contexto: tema escuro não auditado componente a
componente, seleção de avatar por clique no canvas sem equivalente de teclado
(informação já coberta pela tabela, então não é perda de conteúdo), e ausência
de uma ferramenta automatizada de varredura (axe-core/Lighthouse) complementar
à revisão manual.

---

## 2026-09-20 — Revisão externa: sete achados corrigidos

Revisão de código apontou sete problemas concretos, todos em áreas que as
entregas anteriores não tinham exercitado da forma certa (Playwright ad-hoc
descartado depois de usar, histórico artificialmente cheio, recarregar a
página no meio de uma execução real). Cada um foi verificado antes de
corrigir; todos os sete eram reais.

### D31 — Descarte de progresso agora pede confirmação; "Avançar 30 s" só pausado

O botão "Preparação" dentro da execução saía direto, sem aviso, sempre que
`runState` não era `running` — incluindo `paused`, onde já existe progresso
simulado de verdade. Corrigido com `ConfirmDialog` (reaproveita o
`useFocusTrap` da entrega 6): sair de `running`/`paused` agora exige confirmar
"Descartar e voltar"; `ready` e os estados terminais continuam sem
confirmação, porque não há nada a perder. "Avançar 30 s" tinha
`disabled={runState !== 'paused' && runState !== 'ready'}` — o guia (§7.6) só
lista essa ação para `paused`; corrigido para `disabled={runState !== 'paused'}`.

### D32 — Tentativa concluída nunca mais se perde por falta de espaço no histórico

O achado mais sério: a 21ª tentativa concluída não era gravada e, ao abrir o
histórico para excluir uma antiga, `TrailRun` desmontava — o resultado já
calculado desaparecia de vez, e a exportação também não o continha.
`attemptsStore` ganhou `pendingAttempt: AttemptResult | null`: quando o
histórico está cheio, `recordAttempt` guarda a tentativa ali em vez de
descartá-la, e devolve `{ok:false, reason:'history_full', attempt}` — o
`attempt` nunca mais se perde ao desmontar um componente. `removeAttempt`
aplica a pendente automaticamente assim que abre espaço, sem passo manual
extra. `discardPendingAttempt()` existe para um descarte explícito e
informado — diferente de perder sem avisar.

A referência inicial (§4.1) passou a ser decidida no momento em que a
tentativa entra no histórico (`commitToHistory`, compartilhado entre
`recordAttempt`, `removeAttempt` e `hydrateHistory`), não no momento em que
foi criada — senão uma tentativa pendente há muito tempo poderia roubar o
posto de referência de outra registrada depois dela.

`pendingAttempt` também passou a fazer parte do `SessionPayload`
(`persistence/schema.ts`), então sobrevive a salvar, recarregar, exportar e
importar — confirmado por um teste que enche o histórico, força uma
pendência, salva, simula um recarregamento e recupera, tudo com o motor real.

`Preparation` bloqueia "Iniciar caminhada" enquanto existir uma pendência —
não por causa do histórico estar cheio (isso sozinho é seguro: a próxima
tentativa concluída também vira pendente), mas porque duas pendências ao
mesmo tempo excederiam o único slot que o store guarda. Um
`PendingAttemptBanner` fica visível em qualquer tela (exceto durante uma
execução ativa) até a pendência ser resolvida.

### D33 — Permissão de etapa reforçada na store e na validação de importação, não só na UI desabilitada

Duas lacunas na mesma regra. Primeiro: `preparationStore.moveItems` (e, por
consistência, `moveCharacter`/`setOrder`) não verificavam
`getStage(stage).canRedistribute`/`canReorder` — só o `disabled` do
`BackpackEditor`/`QueueEditor` impedia o clique. Chamar a ação da store
diretamente contornava a regra. Corrigido: cada ação agora verifica a
permissão da etapa corrente e não faz nada se ela não permitir, exatamente
como o domínio já fazia com `validateConfig` — duas camadas, cada uma
responsável pela metade que lhe cabe.

Segundo, mais sério: `sessionSync.ts` validava uma preparação importada só
com `validateConfig` (física — carga dentro do limite, ordem completa), que
não sabe o que é uma etapa. Uma preparação de etapa 1 com as mochilas
redistribuídas é fisicamente válida e passava. `preparationSnapshotIssues`
ganhou duas checagens novas: se a etapa não permite redistribuir,
`ownerByItem` precisa bater exatamente com `scenario.initialOwnerByItem`; se
não permite reordenar, `order` precisa bater com `scenario.initialOrder`.
Cobre tanto `restoreSessionFromStorage` quanto `validateImportedRaw` — as
duas passam pela mesma função.

### D34 — Importação recomputa o resultado inteiro em vez de checar campo a campo

Antes, importar validava a forma (Zod) e a configuração de cada tentativa
(`validateConfig`) mas não conferia se `finalState`, `outcome`, `totalTimeSec`
e `metrics` eram entre si coerentes — um JSON editado à mão podia trazer uma
posição fora do trajeto, uma chegada que não bate com o status, ou uma
dispersão inventada, e nada acusava.

A correção usa o motor como árbitro único: para cada tentativa,
`attemptCoherenceIssues` roda `runToEnd(attempt.config)` — determinístico,
mesma seed, mesma configuração — e compara o resultado com
`attempt.finalState` por igualdade profunda (`deepEqual`, indiferente a
ordem de chaves, não `JSON.stringify`). Se bater, recalcula `finalizeResult`
e confere contra `attempt.metrics`/`totalTimeSec`/`meanSpreadM`. Uma única
checagem cobre todas as relações internas possíveis — posição, chegada,
status, dispersão, carga — porque todas são, por definição, função pura de
`(config, seed)`, e recomputá-las é mais confiável do que reimplementar cada
regra de novo aqui. `pendingAttempt`, quando presente no payload, passa pela
mesma checagem.

### D35 — Capacidade estimada e avanço observado, visíveis lado a lado; reutilizar tentativa do histórico

O motor sempre calculou `availableSpeedMps`, `actualSpeedMps`,
`stoppedByQueueTimeSec` e `equivalentLostTimeSec` por personagem (entrega 1),
mas nenhum componente mostrava isso — só "posição" e "limitado pela fila"
apareciam, o que não separa capacidade de movimento observado como o guia
(§2) pede explicitamente. A tabela de `TrailRun` ganhou colunas de velocidade
disponível e efetiva (km/h, ao vivo) e uma coluna "Parado" ao lado de
"Limitado" — a mesma distinção que o guia insiste em manter (parado é um
subconjunto de limitado, não sinônimo). "Tempo equivalente perdido" entra só
no resultado final, dentro de um `<details>` — é diagnóstico auxiliar
pós-tentativa (§8.1), não faz sentido apresentá-lo tick a tick.

`HistoryPanel` ganhou "Reutilizar configuração" por linha:
`sessionSync.reuseAttemptConfig` monta um `PreparationSnapshot` a partir do
`AttemptConfig` gravado (reaproveitando `preparationSnapshotFromDraft`, já
usado pela exportação) e passa pela mesma `preparationSnapshotIssues` que
valida uma importação — a mesma defesa contra uma revisão de cenário que
tenha mudado desde que a tentativa rodou.

### D36 — "Tentar novamente" do canvas corrigia o sintoma errado

`PixiCanvas` trocava para a tela de erro quando `TrailScene.create()`
rejeitava — e essa tela de erro substitui o `<div ref={hostRef}>`, não
convive com ele. O botão "Tentar novamente" só incrementava `attempt` (a
dependência do efeito de criação); `error` continuava com o valor antigo, o
componente continuava renderizando a tela de erro, e o efeito reexecutado
encontrava `hostRef.current === null` — `if (!host) return` saía sem tentar
nada. Um retry que nunca reconecta. Corrigido chamando `setError(null)`
junto com `setAttempt(n+1)`, no mesmo lote de atualização: o React
re-renderiza com o host de volta antes do efeito rodar de novo, então
`hostRef.current` existe quando precisa existir. A correção se apoia no
próprio modelo de execução do React (efeitos rodam depois do commit do
estado do mesmo handler); tentei também forçar um erro real de WebGL via
`HTMLCanvasElement.prototype.getContext` para reproduzir ao vivo, mas o
PixiJS 8 não expôs a falha por esse caminho num teste isolado — o raciocínio
sobre render→commit→efeito continua válido independente disso.

### D37 — Fluxos do §13.2 na suíte de verdade, não em script descartado

Os fluxos que o guia pede como automatizados — preparar → concluir → alterar
ordem → concluir → comparar → recarregar → recuperar histórico; pausa e
continuação; importação inválida — tinham sido verificados manualmente
durante o desenvolvimento com scripts Playwright ad-hoc, sempre apagados
depois de usar. A crítica está certa: verificado uma vez não é verificado, se
não fica repetível.

Adicionado `playwright.config.ts` + `tests/e2e/` com três specs reais
(`flow-a-full-cycle`, `flow-b-pause-resume`, `flow-c-invalid-import`),
rodáveis com `npm run test:e2e`, contra um `next dev` de verdade (o
`webServer` do Playwright sobe um se não achar um rodando). Não são scripts
soltos: usam `test`/`expect` do `@playwright/test`, falham com diff claro, e
ficam no repositório.

Rodar essa suíte pela primeira vez encontrou um oitavo problema, novo, que
nenhuma das outras camadas de teste pegaria: o autosave de `TrailExperience`
é debounced (500 ms, entrega 5, D27) para não salvar a cada tecla da
preparação — mas isso também atrasava salvar o resultado de uma tentativa
concluída, que o guia trata como gatilho de salvamento próprio ("ao concluir
uma execução"), não como uma edição de preparação em sequência rápida. Um
`page.reload()` chamado dentro da janela de debounce perdia a tentativa que
tinha acabado de terminar. Corrigido chamando `saveCurrentSession()`
imediatamente dentro de `TrailRun`, no mesmo instante em que `recordAttempt`
resolve — sem esperar o debounce. O teste `flow-a-full-cycle` falhou
exatamente nesse ponto antes da correção ("Histórico (1)" em vez de "(2)"
depois do reload) e passou a bater depois — é o tipo de regressão de tempo
real que só aparece testando contra um navegador de verdade, recarregando de
verdade.

---

## 2026-09-20 — Expedição gerada: melhoria incremental no fluxo de preparação

O MVP descrito no guia entrava direto num dos dois cenários fixos (trilha-a /
trilha-b). Esta entrega substitui essa entrada por um assistente — quantas
pessoas (4 a 12), nome de cada uma, sorteio da expedição — sem alterar o
motor, as telas de preparação/execução/histórico/comparação, nem a
persistência: tudo isso continua sendo o mesmo código, só alimentado por um
cenário que agora pode ser sorteado em vez de fixo. Os cenários A e B
continuam existindo, como referência de teste (`SCENARIO_A`/`SCENARIO_B`,
usados em toda a suíte de domínio).

### D38 — Cenário desacoplado de etapa guiada

`StageDefinition` tinha um campo `scenarioId`, e a etapa 4 ("Transferir")
existia só para trocar do cenário A para o B — a app assumia que "qual
cenário" era uma função de "em que etapa estou". Isso não tem como sobreviver
a um cenário sorteado, que não tem `id` fixo para procurar.

Removido `scenarioId` de `StageDefinition`; `preparationStore` passa a guardar
`expedition: Scenario` como estado próprio, independente da etapa. Etapas
agora só controlam o que pode ser editado (`canReorder`/`canRedistribute`),
nunca qual cenário está em jogo. A etapa 4 foi removida — a transferência de
aprendizado entre cenários A e B deixa de ser um passo dentro do fluxo guiado
e volta a ser o que já era descrita como sendo no guia (§13.2): rodar a mesma
sequência de novo, manualmente, com o outro cenário fixo, para efeito de
comparação pedagógica — os dois cenários continuam existindo para isso.
`GuidedStage` estreitou de `1|2|3|4` para `1|2|3`; `SCHEMA_VERSION` subiu para
2, com rejeição explícita (não migração silenciosa) de sessões salvas no
formato anterior — o mesmo padrão que D25 já estabeleceu para importação.

**Por quê revisitar:** se um dia a app precisar de uma etapa cujo propósito
seja comparar dois cenários lado a lado dentro do mesmo fluxo guiado (em vez
de duas rodadas manuais), esta é a decisão a reabrir.

### D39 — Gerador de expedições construído sobre a calibração existente, não ao lado dela

O pedido era reaproveitar o motor, a calibração e as estratégias já
validadas — não reimplementar as regras de "o que é uma configuração
adequada ao treino" numa segunda linguagem. `scripts/calibration/strategies.ts`
virou um repasse fino: a lógica de verdade (`STRATEGIES`,
`redistributeFromBottleneck`, `overloadFastest`, `reorderSlowestFirst`) mudou
para `src/features/trail/scenarios/strategies.ts`, porque `npm run calibrate`
(um script) pode depender de `src/`, mas o gerador (código de produção, em
`src/`) não pode depender de `scripts/` — a direção de dependência só faz
sentido de um jeito. Verificado que a mudança não alterou nada rodando
`npm run calibrate` antes e depois e comparando a saída.

`generateExpedition(partySize, seedOverride?)` sorteia até
`MAX_GENERATION_ATTEMPTS` (30) candidatas — velocidade, carga de referência,
mochilas e ordem inicial, todas via `deterministicRandom` (o mesmo PRNG da
variabilidade durante a caminhada, nunca `Math.random`) — e aceita a primeira
que passa em `evaluateGeneratedScenario`. Essa função verifica, reaproveitando
`runToEnd`/`finalizeResult`/`redistributeFromBottleneck`/`overloadFastest` tal
como o script de calibração usa: (1) a configuração inicial conclui dentro do
limite de tempo; (2) forma dispersão perceptível (≥10% da distância); (3)
alguém além de quem vai na frente fica limitado pela fila por tempo
suficiente; (4) redistribuir do gargalo melhora o tempo total em pelo menos
10%; (5) redistribuir demais (`overloadFastest`) fica pior que redistribuir
com equilíbrio, mas ainda melhor que não fazer nada — o efeito descrito em
D09, generalizado para qualquer N. `maxLoadKg = 3 × referenceLoadKg` nunca é
decidido pelo gerador: como os cenários A e B, ele só monta um `ScenarioSpec`
e delega a `buildScenario()`, que é a única fonte dessa regra.

O laço de geração é assíncrono e cede o controle entre tentativas
(`setTimeout(resolve, 0)`) para não travar a interface — cada candidata roda
até três simulações completas. Na prática, testado com seeds fixas em todos
os tamanhos de 4 a 12, a geração aceita a primeira ou a segunda tentativa; o
orçamento de 30 é folga generosa, não o caminho esperado.

### D40 — Reserva determinística por tamanho de grupo, para a geração nunca falhar

Se as 30 tentativas aleatórias não produzirem nada adequado,
`generateExpedition` usa `buildReserveSpec(partySize)` — sem sorteio nenhum,
a mesma estrutura calibrada dos cenários A/B (referência 6 kg × carga 18 kg
para o gargalo, referência 12 kg × carga 6 kg para o resto) parametrizada
pelo tamanho do grupo. Verificado (`tests/scenarios/generator.test.ts`) que a
reserva passa em `evaluateGeneratedScenario` para todo tamanho de 4 a 12 — ela
já é, por construção, uma configuração "pronta", não só um último recurso que
funciona por acidente.

### D41 — Cor do personagem por posição no cenário, não por id literal

`CHARACTER_COLORS` era um mapa fixo `p1..p6 → cor`, com um cinza de reserva
para qualquer id fora dessa lista — o que faria todo mundo numa expedição
gerada (`c1..c12`) cair no mesmo cinza, indistinguível. Trocado por uma
paleta de 12 cores indexada pela posição do personagem em
`scenario.characters` (`colorForCharacter`/`colorsForScenarioHex`): os
cenários fixos mantêm exatamente as mesmas cores de antes (mesma posição,
mesmo índice), e uma expedição de qualquer tamanho até `MAX_PARTY_SIZE`
ganha cores distintas sem precisar conhecer o formato do id.

### D42 — Espalhamento vertical do canvas limitado por um orçamento fixo, não por LANE_OFFSET_PX constante

`TrailScene` espalhava avatares agrupados (e empilhados na chegada) por
`LANE_OFFSET_PX` (32 px) por posição, com `TICK_LABEL_OFFSET_PX` calculado à
mão para o pior caso de 6 — comentado explicitamente como tal. Com até 12
personagens, o pior caso (grupo inteiro agrupado, ou todos empilhados na
chegada) passaria de ±80 px para ±176 px a partir do centro da trilha,
estourando tanto a altura fixa do canvas (`h-64`/`sm:h-72`) quanto a margem
reservada para os marcadores de distância.

Trocado por `laneOffsetForCount(count)`: o espaço entre raias encolhe
conforme o grupo cresce, para o espalhamento total nunca ultrapassar
`2 × HALF_SPREAD_PX` (80 px de cada lado) — o mesmo total que 6 pessoas já
ocupavam. Com até 6, o resultado é sempre 32 px (visual inalterado dos
cenários fixos); com 12, cai para ~14,5 px. `TICK_LABEL_OFFSET_PX` deixa de
ser um número mágico e passa a ser derivado do mesmo `HALF_SPREAD_PX`, válido
para qualquer tamanho de grupo sem precisar mudar de novo se o teto de
participantes mudar.

### D43 — `participantByCharacter` era descartado ao trocar de etapa (bug latente, sem sintoma até agora)

`preparationStore.setStage` e `resetDraft` reconstruíam o rascunho via
`createAttemptConfig(scenario, { guidedStage: stage })`, sem repassar
`participantByCharacter` — o nome de quem representa cada personagem se
perdia a cada troca de etapa. Nunca dava sintoma porque, até esta entrega,
nada preenchia esse campo antes do fim do fluxo (§13.2 nunca testa nomes
sobrevivendo etapa 1 → 2 → 3). O assistente de nova expedição precisa
exatamente disso: nomes coletados uma vez, na configuração, sobrevivendo o
fluxo guiado inteiro. Corrigido roteando `participantByCharacter` por um
helper único (`draftForStage`), usado tanto por `setStage` quanto por
`resetDraft`; coberto por teste dedicado em `tests/application/preparation.test.ts`
("trocar de etapa preserva quem representa cada personagem").

### D44 — Tela de configuração como padrão; sessão restaurada continua pulando direto para a preparação

`TrailExperience` decidia a view inicial (`'preparation'`) dentro de um
`useEffect`, com `setView('preparation')` chamado depois de
`restoreSessionFromStorage()` ter sucesso — o que o lint (`react-hooks/set-state-in-effect`,
já uma dor recorrente neste projeto, ver histórico de entregas anteriores)
rejeita: `setState` síncrono dentro de efeito pode empilhar renders.
`restoreSessionFromStorage()` só lê e valida, sem mutar nenhuma store, então é
seguro chamar dentro do inicializador preguiçoso do `useState` que decide a
view inicial — `'preparation'` se há sessão restaurável, `'setup'` (novo
padrão) caso contrário. O efeito continua existindo, chamando a mesma função
de novo (redundante, mas barata) só para de fato aplicar o payload
(`applySessionPayload`) e as stores — sem mais precisar tocar `setView`.

### Verificações desta entrega

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (278 testes, incluindo os
48 novos em `tests/scenarios/generator.test.ts`), `npm run calibrate`
(estendido para avaliar expedições geradas de 4, 6, 9 e 12 pessoas, seeds
fixas, ao lado dos cenários A e B) e `npx playwright test` (8 specs, incluindo
a nova `flow-d-expedition-setup.spec.ts`) passam. Os specs E2E existentes
foram ajustados para completar o assistente de configuração antes de
qualquer interação (a preparação deixou de ser a tela de entrada) e para não
supor mais que um personagem específico nunca está na frente da fila — a
ordem inicial de uma expedição sorteada é embaralhada, diferente da ordem
fixa dos cenários A e B.

---

## 2026-09-22 — Ajustes do teste de navegação (21/09/2026)

Quatro ajustes pontuais identificados num teste de navegação com seis
participantes, sem alterar fórmulas, seeds, geração de cenários ou métricas.

### D45 — Etapas 2 e 3 exigem concluir a etapa 1 desta expedição, não só gerá-la

**Problema reproduzido:** gerar uma expedição → clicar em "2 — Reorganizar"
antes de qualquer caminhada → mover um personagem. Os controles da etapa 1
estavam desabilitados, mas `setStage` trocava de etapa sem checar se a
primeira caminhada tinha sido concluída — a trava valia para os controles de
edição dentro de uma etapa, não para o próprio acesso à etapa seguinte.

A correção foi localizada: o histórico existente (`useAttemptsStore`) já
identifica uma conclusão da etapa 1 desta expedição específica sem precisar
de estado novo. `hasCompletedFirstStage(attempts, scenarioId)`
(`attemptsStore.ts`) verifica `outcome === 'completed' && guidedStage === 1 &&
scenario.id === scenarioId` sobre o histórico gravado mais a pendente
(`allKnownAttempts` — uma conclusão que ainda não coube no histórico de 20 já
conta, não precisa esperar espaço). `canAccessStage(stage, expedition,
history, pendingAttempt)` (`preparationStore.ts`) usa isso para decidir se a
etapa pode ser alcançada; a etapa 1 é sempre acessível.

Duas camadas, como as outras permissões de etapa já estabelecidas
(`canReorder`/`canRedistribute`): `setStage` na store recusa a troca (a
garantia de verdade — contornar o `disabled` da UI não abre uma segunda
porta), e `Preparation.tsx` desabilita os botões "2 — Reorganizar" / "3 —
Redistribuir" e mostra "Conclua a primeira caminhada para liberar as
próximas etapas." enquanto isso não acontecer. Pausa, abandono e timeout não
produzem uma entrada de conclusão (`recordAttempt` só é chamado ao concluir),
então não liberam; uma conclusão de OUTRA expedição tem outro `scenario.id`,
então também não libera esta. Como a checagem deriva do histórico, e não de
um campo novo persistido, a liberação sobrevive a um recarregamento de graça
— sem precisar de nenhuma migração de sessões salvas antes desta mudança.

`restoreDraft`/`reuseAttemptConfig` continuam sem passar por `setStage`
(restauram um estado já validamente alcançado antes, não uma transição nova),
então não são re-checados por este guard — comportamento já existente,
preservado.

**Resultado:** corrigido, sem precisar de máquina de estados nova nem migração
de histórico — a condição já era derivável do que existia.

### D46 — Nome do participante como identificação principal, id do personagem como secundário

Fila, mochilas, tabela de execução, histórico e comparação mostravam
"Caminhante N" mesmo quando um nome de participante já existia — só o canvas
(`trailScene.ts`, já preexistente) priorizava o nome. Centralizado em
`components/characterLabel.ts`: `characterLabel(config, characterId)` lê
`config.scenario`/`config.participantByCharacter` do PRÓPRIO `AttemptConfig`
recebido (nunca de outra fonte) e retorna `"Nome · Caminhante N"` quando há
nome, ou só `"Caminhante N"` sem ele — o mesmo fallback que sessões antigas,
salvas antes de existir nome de participante, sempre tiveram. Nomes
repetidos continuam distinguíveis pelo identificador secundário, sempre
presente.

Como cada superfície já recebe um `AttemptConfig` (o rascunho vivo na
preparação, ou `attempt.config` — o snapshot gravado — no histórico e na
comparação), usar o `config` de cada uma automaticamente resolve "tentativa
concluída usa o nome salvo no snapshot, não o nome editado agora na
preparação" — sem lógica condicional extra para isso: é só uma consequência
de nunca ler de outra fonte que não o `config` recebido.

`domain/validation.ts` (mensagem "X está com N kg, acima do limite") foi
deliberadamente deixado com `character.displayName` sozinho: mudar isso
exigiria ou importar de `components/` dentro de `domain/` (inverte a
camada — domínio não conhece nada acima dele) ou duplicar a lógica de rótulo
dentro do domínio para um único texto de mensagem, fora do escopo pedido.

### D47 — Coluna e comentário da comparação identificados pela posição cronológica real, não pela ordem de seleção

**Problema reproduzido:** selecionar tentativas no histórico fora da ordem em
que aconteceram (histórico mostra a mais recente primeiro) fazia a
comparação rotular as colunas "Base", "#2", "#3" pela ordem de clique — no
teste, a redistribuição (3ª a acontecer) apareceu como "#2", antes da
reorganização (2ª a acontecer). A numeração não identificava a tentativa, só
a posição na seleção.

Extraído `application/comparisonOrdering.ts` (lógica pura, testável sem
renderizar nada — mesma razão de existir de `feedback.ts`):
`orderAttemptsForComparison` mantém a referência selecionada sempre primeira
quando fizer parte da seleção (regra de sempre, §4.1; sem ela, a primeira
tentativa clicada continua sendo a base — também preservado), mas ordena as
demais pela posição real no histórico (`history.findIndex`), não pela ordem
de clique. `attemptLabel` gera `"Tentativa N · Etapa[ — Referência]"`, N
sendo essa posição cronológica (1 = mais antiga) — o mesmo texto no cabeçalho
da tabela e no comentário abaixo dela, substituindo "#2 em relação à base".
`ComparisonPanel.tsx` ficou só com a renderização; a ordenação e a rotulagem
são testadas diretamente em `tests/application/comparisonOrdering.test.ts`,
incluindo o cenário exato do relatório (seleção fora de ordem não deve ditar
a numeração). Detecção de comparabilidade e cálculos (`compareAttempts`)
não mudaram — só a ordem de exibição e o rótulo.

### D48 — Placeholder da hipótese não sugeria mais a resposta

"Ex.: tirando peso de quem está sobrecarregado, o grupo todo chega antes."
descrevia a própria solução (redistribuir) antes de qualquer caminhada.
Trocado por "O que vocês esperam observar nesta caminhada? Por quê?" — uma
pergunta, não uma dica. Campo, limite (500 caracteres) e comportamento
continuam os mesmos.

### Verificações desta entrega

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (301 testes — 23 novos:
`hasCompletedFirstStage`/`allKnownAttempts` em `attemptsStore.test.ts`, o
bloco de travamento entre etapas em `preparation.test.ts`,
`comparisonOrdering.test.ts` e `characterLabel.test.ts`) e `npx playwright
test` (9 specs — `flow-d-expedition-setup.spec.ts` ganhou o caso de
liberação após concluir a primeira caminhada e de sobrevivência a um
recarregamento; `flow-a-full-cycle.spec.ts` teve as asserções de cabeçalho
da comparação atualizadas para o novo formato) e `npm run build` passam. Não
foi necessário rodar a calibração de novo — nenhuma fórmula, seed ou regra de
geração mudou.

---

## 2026-09-22 — Evolução pedagógica, frentes 1–4

Diagnóstico da restrição, experimento de variabilidade, observação/recuperação
dos espaços e calibração estendida. A frente 5 (energia/fadiga) fica para
depois — o próprio documento manda concluir e validar estas quatro antes.

### D49 — Diagnóstico de capacidade: uma fórmula, um lugar, tolerância de 1% centralizada

`domain/diagnosis.ts` (novo) só combina duas peças que já existiam —
`kmhToMps` e `loadFactor`, do próprio motor — para calcular "ritmo de
referência com a carga": sem variabilidade, antes da fila, só a fórmula que
já valia. `diagnoseCapacity(config)` não olha `order` — reordenar sem
redistribuir não muda o diagnóstico por construção, não por um caso especial.
`CAPACITY_CANDIDATE_TOLERANCE = 0.01` (1% acima do mínimo ainda conta como
candidata) é uma decisão de apresentação, não da física do motor — como o
documento pede, registrada aqui e em um único lugar no código.

O painel (`CapacityDiagnosisPanel`) fica recolhido atrás de "Ver diagnóstico"
até a primeira caminhada da expedição concluir, e reaproveita exatamente a
condição que já libera as etapas 2 e 3 (`canAccessStage`/
`hasCompletedFirstStage`, do ajuste de navegação anterior) — a mesma
pergunta, "esta expedição já teve sua primeira caminhada concluída?", decide
as duas coisas, sem duplicar a checagem.

### D50 — `variabilityMode` é um parâmetro do motor, não um cenário paralelo

O experimento "com e sem variabilidade" (frente 2) precisa rodar a mesma
configuração duas vezes, mudando só a flutuação. A tentação seria zerar
`character.variability` numa cópia do cenário — mas isso alteraria o dado
que o operador vê, e o documento explicitamente proíbe ("não zerar
permanentemente `variability` no cenário original"). Em vez disso,
`AttemptConfig` ganhou `variabilityMode: 'standard' | 'disabled'`; em modo
`disabled`, `availableSpeedMps` usa fator 1 em vez de chamar
`variationFactor` — o RNG nunca é consultado, a fórmula de carga e a
atualização de posições não mudam uma linha. Com `variabilityMode` ausente
(configs antigas) ou `'standard'`, o comportamento é bit a bit idêntico ao de
sempre — condição necessária para `attemptCoherenceIssues` (schema.ts)
continuar recomputando e comparando tentativas antigas sem diferença.

`compareAttempts` (comparação comum) passou a rejeitar pares com
`variabilityMode` diferente (`variability_mode`, novo `ComparabilityIssue`)
— "a comparação comum continua exigindo condições de variabilidade iguais".

### D51 — Experimento de variabilidade reaproveita `TrailRun`/histórico inteiros; não duplica a condição "com"

`application/variabilityExperiment.ts` só constrói a condição nova ("sem
variabilidade": mesmo snapshot, `variabilityMode: 'disabled'`,
`experimentOf: {originAttemptId, kind: 'variability'}`) e valida o par
depois. A condição "com variabilidade" nunca é re-executada nem duplicada no
histórico — é a própria tentativa de origem, já gravada (§4.1: "reutilizá-lo
na comparação; não duplicá-lo desnecessariamente"). "Reproduzir
sequencialmente no canvas" (§4.1) foi interpretado como: o operador já viu a
condição "com" rodar quando a gravou originalmente; só a condição "sem" —
genuinamente nova — precisa ser assistida agora, pelo `TrailRun` normal, sem
nenhum modo de replay novo no canvas. Registrado aqui porque é uma leitura
deliberada do "pode exigir executar novamente o motor", não a única possível.

A tentativa experimental usa o `TrailRun`/`recordAttempt` normais — conta
para os 20 do histórico, aparece com um selo "Experimento" em
`HistoryPanel`. Duas exclusões pontuais garantem que ela nunca vira a
referência nem libera etapas por conta própria (`!attempt.config.experimentOf`
em `commitToHistory` e em `hasCompletedFirstStage`) — o documento pede as
duas coisas explicitamente (§4.2, §7.3, EV06).

`VariabilityComparisonPanel` resolve as duas pontas por `experimentOf`, lidas
do histórico (`useAttemptsStore`), não de estado local — sobrevive a um
recarregamento de graça, e é reencontrável por qualquer tentativa experimental
no histórico ("Ver comparação de variabilidade"), não só logo após concluir.

### D52 — `CharacterState.isLimited` é estado por tick, não um default seguro — schema sobe para v3 com rejeição, não migração

A frente 3 pede que "limitado pela fila" venha "da condição já calculada
pelo motor" — `step()` já computava isso a cada tick (`isLimited`), só nunca
expunha. Diferente de `variabilityMode` (D50), que tem um valor implícito
óbvio para todo dado antigo (o único modo que sempre existiu), `isLimited`
é um resultado físico por tick que sessões antigas nunca calcularam — um
`.default(false)` seria simplesmente errado para quem esteve de fato
limitado. Como `attemptCoherenceIssues` recomputa e compara bit a bit,
aceitar sessões v2 produziria falsos alarmes de adulteração. `SCHEMA_VERSION`
subiu para 3; uma sessão de formato diferente (não só a v2 imediatamente
anterior — qualquer uma) é rejeitada com mensagem clara, e a checagem de
"formato antigo" generalizou de "é exatamente a versão anterior" para
"é qualquer versão diferente da atual", já prevendo a próxima subida (frente
5) sem precisar reescrever essa checagem nesta entrega e na próxima.

### D53 — Amostras compactas por ref, publicação de gráfico por state — dois jeitos de respeitar as regras de render diferentes

O gráfico de 120 s (§5.2) precisa de uma amostra por TICK simulado, não por
quadro — coletar isso como `useState` custaria um render por tick, contra
tudo que `TrailRun` já protege (HUD publicado no máximo a 10 Hz). Solução:
`speedHistoryRef` (uma ref, todos os personagens, 120 amostras cada) é escrita
dentro de `advanceTicks` — uma função imperativa chamada por clique ou por
`requestAnimationFrame`, nunca pelo corpo de um render ou efeito, então
escrever nela não viola `react-hooks/refs` (a régua deste projeto contra ler
OU escrever refs durante o render, mais estrita que a recomendação oficial
do React, que só proíbe escrita). Só a fatia do personagem selecionado vira
`useState` (`selectedHistorySnapshot`), publicada no mesmo instante que
`setHudState` — o gráfico redesenha na mesma cadência do resto do HUD, sem
o componente ler a ref durante o render.

Selecionar alguém PAUSADO expôs a costura certa para isto: sem nenhum tick
rodando depois do clique, o `useState` só seria atualizado no próximo
`advanceTicks` — que pode nunca vir. `selectCharacter` (usada tanto pelo
clique na tabela quanto pelo `onSelect` do canvas) sincroniza a foto
imediatamente, no próprio handler de clique — coberto por um caso dedicado em
`flow-b-pause-resume.spec.ts`, que pausa antes de selecionar.

`isLimited` (D52) teve prioridade sobre a tendência de espaço em
`observedState` — "limitado" explica PORQUE o espaço não está mudando,
quando os dois coincidem; "sem predecessor" e "chegou" vêm antes de tudo, na
ordem que o documento lista.

### D54 — Calibração: sem exigir excesso melhor que o início; três expedições geradas por tamanho; pares com/sem variabilidade reaproveitando execuções

`evaluateGeneratedScenario` (gerador) exigia excesso pior que o equilíbrio E
melhor que a configuração inicial — o documento pede remover a segunda
exigência (§6.1). Removida; a suíte de 48 testes do gerador continua
passando sem alteração (a relaxação só amplia o aceito, nunca reduz).

`scripts/calibrate.ts`: `GENERATED_EXPEDITIONS_PER_SIZE = 3` (era 1), cada
uma com sua própria seed de geração (`generatedScenarioSeed(size, index)`) —
"pelo menos três expedições geradas independentemente" por tamanho (§6.3),
sem confundir seed de geração (qual expedição) com seed de simulação
(quais flutuações, a lista fixa de 24 já existente).

Pares com/sem variabilidade (`evaluateVariabilityPair`) reaproveitam as
execuções COM variabilidade que `evaluateStrategy` já calculou (24 seeds,
estratégias "inicial" e "carga") — só a condição SEM roda de novo, e apenas
uma vez (o resultado independe de seed): "uma condição sem variação repetida
com seeds diferentes não constitui observações independentes" (§6.3). O
relatório traz a distribuição das diferenças individuais `com − sem`
(mediana/mín/máx), não só a diferença entre medianas.

Os quatro fenômenos do §6.2 (heterogeneidade sem variabilidade, flutuação com
capacidades próximas, recuperação, mudança de candidata) viraram fixtures
dedicadas em `runPedagogicalChecks()` — não substituem nenhuma expedição real,
só isolam o mecanismo. A fixture de recuperação busca, entre as 24 seeds já
fixas, a primeira que abre e depois reduz o espaço de verdade (não um mínimo
instantâneo) — achou na primeira tentativa (`calib-001`); se nenhuma
mostrasse o efeito, o script reportaria isso como atenção, não faria a
verificação passar silenciosamente.

Bug encontrado e corrigido no caminho: `formatSeconds` (script de
calibração) produzia `"-1:-32"` para diferenças negativas — o sinal do
resto de uma divisão inteira negativa em JavaScript se somava ao sinal dos
minutos. Corrigido tirando o valor absoluto antes de calcular minutos e
segundos, e aplicando o sinal uma vez só, na frente. Coberto por
`tests/scripts/stats.test.ts` (novo — nenhum teste cobria este script antes).

### Verificações desta entrega

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (350 testes — 48 novos:
`diagnosis.test.ts`, `observation.test.ts`, `variabilityExperiment.test.ts`,
`stats.test.ts`, mais os casos de `isLimited`/`variabilityMode` em
`engine.test.ts`, o novo `variability_mode` em `metrics.test.ts` e a rejeição
de sessão v2 em `schema.test.ts`), `npx playwright test` (10 specs —
`flow-e-variability-experiment.spec.ts`, novo, cobre o fluxo completo do §9:
concluir → revelar diagnóstico → criar experimento → concluir condição
complementar → comparar → recarregar → recuperar → nova tentativa em modo
padrão; `flow-b-pause-resume.spec.ts` ganhou a seleção de participante
pausado), `npm run build` e `npm run calibrate` (relatório completo em
`docs/calibration/calibration-1.0.0.json`, incluindo os pares com/sem
variabilidade e os quatro fenômenos separados) passam.

## 2026-09-22 — Evolução pedagógica, frente 5 (energia/fadiga)

Reserva de energia única, fadiga como efeito derivado de velocidade,
experimento "com e sem fadiga", diagnóstico ao vivo de restrição por
capacidade e calibração estendida com fixtures dedicadas.

### D55 — Energia é um terceiro efeito no mesmo `step()`, calculado depois do movimento, nunca antes

`domain/fatigue.ts` (novo) isola o modelo: `FATIGUE_MODEL_VERSION =
'fatigue-1'`, `DEFAULT_FATIGUE_PARAMS` (`drainPerSec=1/10800`,
`loadDrainCoefficient=0.5`, `minFatigueFactor=0.6`),
`fatigueFactor(energy, minFatigueFactor)` e `validateFatigueParams`. O motor
ganhou uma terceira fase dentro do mesmo `step()`, não um novo laço: Fase 1
(velocidades de referência, sem fadiga, guardadas num `Map` por tick) →
Fase 2 (posições, usando o fator de fadiga da energia ANTERIOR) → dentro do
mesmo loop por personagem, após resolver o avanço, a energia é atualizada
com o avanço REAL já cortado pelo destino. Quem já chegou preserva a energia
por espalhamento de objeto (`...previous`), nunca por um caso especial na
fórmula — "sem avanço, sem desgaste" sai de graça da ordem das fases, não de
uma condição extra.

Com `fatigueMode !== 'enabled'`, a fase de energia nem roda — `energy` fica
em 1 e o multiplicador em exatamente 1, preservando bit a bit o
comportamento anterior (mesma garantia que `variabilityMode: 'standard'`
já tinha em D50, agora estendida a um segundo eixo independente).

### D56 — `fatigueMode`/`fatigueParams`/`energy` são aditivos puros — sem subir `SCHEMA_VERSION`, ao contrário de `isLimited` (D52)

D52 subiu o schema para v3 porque `isLimited` é um resultado físico por tick
que sessões antigas genuinamente calcularam de outro jeito (ou não
calcularam) — nenhum default reconstrói o que de fato aconteceu. `energy` é
diferente: antes desta entrega a fadiga simplesmente não existia, então
`energy` só podia ter sido 1 o tempo inteiro, para qualquer personagem, em
qualquer tick, de qualquer sessão antiga — não é uma suposição, é a única física
possível retroativamente. Por isso `fatigueMode`/`fatigueParams` no
schema (`AttemptConfigSchema` e `PreparationSnapshotSchema`, diferente de
`variabilityMode`, que não aparecia em rascunhos de preparação) e
`energy: z.number().min(0).max(1).default(1)` em `CharacterStateSchema` usam
`.default()` sem mexer em `SCHEMA_VERSION` (permanece 3) — e
`attemptCoherenceIssues` continua recomputando e comparando sessões antigas
sem falso alarme, porque o valor reconstruído é garantidamente correto, não
só plausível. Raciocínio comentado no próprio `schema.ts` para a próxima
entrega decidir com o mesmo critério.

### D57 — `fatigueExperiment.ts` espelha `variabilityExperiment.ts`, mas o par é seed a seed, não uma condição reaproveitada

Estrutura idêntica a D51 (`canStartFatigueExperiment`,
`buildWithFatigueConfig`, `validateFatiguePair`) — a condição "com fadiga"
nunca é re-executada como origem; só a condição nova entra no histórico,
selada com `experimentOf: {originAttemptId, kind: 'fatigue'}`. A diferença
que impede copiar D51 literalmente: a condição "sem fadiga" de um par de
variabilidade independe de seed (é sempre a mesma execução), mas a condição
"sem fadiga" de um par de fadiga NÃO é seed-invariante em relação à condição
"com" — as duas herdam a mesma variabilidade por flutuação — então o
comparador de calibração (`evaluateFatiguePair`, `scripts/calibrate.ts`)
roda as 24 seeds "com fadiga" de novo e pareia seed a seed contra as 24
"sem" já calculadas, produzindo uma distribuição de diferenças pareadas por
seed, não só uma comparação única.

`canStartFatigueExperiment`/`validateFatiguePair` rejeitam a origem se ela
já tiver `fatigueMode: 'enabled'` (o experimento só nasce de uma tentativa
"sem fadiga", igual o documento exige) e `variabilityExperiment.ts` ganhou a
checagem simétrica — nenhum dos dois experimentos aceita o outro modelo
ativo do lado oposto.

### D58 — Diagnóstico ao vivo de capacidade não persiste eventos; recomputa deterministicamente, com histerese de 30 s só na notificação

`diagnoseCurrentCapacity` (novo em `domain/diagnosis.ts`) reaproveita
`currentCapacityKmh` — a mesma fórmula de referência × fator de fadiga que
já existe no motor, chamada de fora, sem duplicar a física. É lido
diretamente do `hudState` (estado React já publicado a 10 Hz no máximo, não
uma ref) dentro do corpo de `TrailRun`, satisfazendo a mesma régua
`react-hooks/refs` que D53 já havia navegado — nenhum padrão novo, só reuso.

Os eventos "mudança sustentada de candidata" (`fatigueDiagnosisEvents.ts`,
novo) não persistem por tick: `computeFatigueDiagnosisEvents` resimula do
zero a partir de `createInitialState` sempre que é preciso (uma vez, via
`useMemo`, ao concluir a tentativa em `TrailRun`; de novo, independentemente,
no script de calibração) — o documento permite explicitamente recomputar
durante a reprodução, e o projeto já confiava nesse padrão desde a checagem
de coerência de sessão (D52/D54). A janela de 30 s consecutivos
(`SUSTAINED_CHANGE_WINDOW_SEC`) filtra só o REGISTRO do evento — o cálculo
físico e os valores exibidos ao vivo nunca esperam a janela; uma chegada que
muda quem está ativo é identificada como chegada, não como migração por
fadiga, comparando sempre o mesmo conjunto de participantes ainda ativos
entre os dois lados do intervalo. Registro limitado a 100 eventos por
tentativa, com sinalização de truncamento — nenhuma calibração ou execução
real chegou perto do limite.

### D59 — Calibração da frente 5: reaproveita cenários e seeds da frente 4; impacto assimétrico entre "inicial" e "redistribuir" é o resultado, não um bug

`evaluateFatiguePair` roda sobre os mesmos cenários e as mesmas 24 seeds já
fixas da frente 4 (§7.5: "reutilizar seus cenários e pelo menos 20 seeds") —
nenhum cenário novo foi inventado só para a fadiga. Resultado real (6 pares
cenário×estratégia, `docs/calibration/calibration-1.0.0.json`,
`fatiguePairs`):

- Estratégia "inicial" (sem redistribuir carga): tempo total sobe entre
  ~623 s e ~785 s de mediana por cenário (todas as 24 seeds, sem nenhum
  timeout), energia final mediana entre 70% e 78%, **nenhuma mudança
  sustentada de candidata em nenhuma das 24 seeds** de nenhum cenário — a
  fadiga aqui afeta o tempo total sem trocar quem restringe o grupo.
- Estratégia "redistribuir" (mesma carga total, distribuída): tempo total
  sobe bem menos, entre ~168 s e ~202 s de mediana, mas **todas as 24 seeds
  de todos os 6 cenários registraram ao menos uma mudança sustentada de
  candidata** — o modelo ativo muda a composição de quem restringe, não só
  o tempo, exatamente o comportamento que o documento antecipa em §7.4
  ("a conclusão sem fadiga não deve ser imposta a esta extensão").

`energyZeroOccurrences` ficou em 0 em todas as 864 amostras finais de
energia (144 ou 96 por par, conforme o tamanho do grupo) — com os parâmetros
padrão, ninguém chega à degradação máxima do modelo nestes cenários; nenhum
timeout novo apareceu. Como o efeito é claramente perceptível (não
imperceptível) e não satura em zero, os parâmetros padrão não precisaram de
revisão nesta entrega — decisão registrada aqui como evidência, não como
recalibração seed a seed (o documento proíbe explicitamente ajustar
parâmetro por seed individual).

Quatro fixtures novas em `runFatigueFixtures()` (mecanismo isolado, sem
substituir as expedições reais): esforço livre perde ~4× mais energia que
esforço limitado na mesma janela (`freeEnergyLoss ≈ 0.0001389` vs.
`limitedEnergyLoss ≈ 0.0000347` — proporção exata prevista pela fórmula,
`relativeEffort²`); carga relativa maior drena mais sob o mesmo esforço
relativo (`heavyEnergyLoss > lightEnergyLoss`, ambas mesmo `relativeEffort`);
saturação a zero é alcançável (`reachedZero: true`,
`availableAtZeroKmh = referenceKmh × minFatigueFactor`, confirmando o piso
de 60%); e a fixture de migração (`migrationOverTime`) prova, com as
equações comuns do motor — sem injetar perda de energia artificial — que uma
mudança de candidata sustentada realmente ocorre numa seed de laboratório
(`lab-calib-migracao`, aos 172 s simulados).

### Verificações desta entrega

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (386 testes — 36 novos:
bloco "energia e fadiga" em `engine.test.ts`, `fatigueDiagnosisEvents.test.ts`
e `fatigueExperiment.test.ts` novos, mais os casos de `currentCapacityKmh`/
`diagnoseCurrentCapacity` em `diagnosis.test.ts`, `fatigue_mode` em
`metrics.test.ts` e o roundtrip/retrocompatibilidade de fadiga em
`schema.test.ts`), `npx playwright test` (11 specs —
`flow-f-fatigue-experiment.spec.ts`, novo, cobre o segundo fluxo exigido pelo
§9: referência sem fadiga → experimento ativo → energia observável e
comparação → recarregar → recuperar → nova tentativa com fadiga desligada),
`npm run build` e `npm run calibrate` (relatório com as seções `fatiguePairs`
e `fatigueFixtures` em `docs/calibration/calibration-1.0.0.json`, resultados
reais resumidos em D59) passam.

## 2026-09-26 — Fábrica de componentes (novo módulo, `GUIA_MVP_SIMULADOR_DAS_TIGELAS.md`)

Segundo exercício independente no mesmo projeto — o jogo de tigelas,
fósforos e dado do capítulo 14 de *A Meta*, ambientado como "Fábrica de
componentes aeronáuticos". Motor, RNG, stores, persistência e rotas
inteiramente separados da trilha (TG12); só reaproveita peças
deliberadamente genéricas (hash puro do RNG, `ConfirmDialog`,
`useFocusTrap`, `usePrefersReducedMotion`, `formatDateTime`).

### D60 — RNG reaproveita o hash puro da trilha, mas com chave e versão próprias

O guia pede explicitamente a chave `[versãoDoRng, seed, stageId, roundIndex]`
(§5) — diferente da chave da trilha, `[seed, characterId, blockIndex]` (sem a
versão do algoritmo dentro do hash). Em vez de duplicar o FNV-1a com mistura
final, `factory/domain/random.ts` importa `fnv1a32` diretamente de
`trail/domain/random.ts` — é a mesma função pura, sem nenhuma noção de
personagem ou trilha embutida nela — e só monta uma chave e um rótulo de
versão (`RNG_VERSION = 'fnv1a32-mix-1-d6'`) próprios. Reuso explicitamente
autorizado pelo guia (§2, §5: "reutilizar o RNG puro e versionado do
projeto se compatível"), documentado no próprio arquivo para a próxima
entrega não reinventar o hash. Vetores de teste oficiais fixados em
`tests/factory/domain/random.test.ts`, no mesmo espírito dos vetores da
trilha — mudar qualquer um deles exige subir `RNG_VERSION`.

### D61 — Motor por turno: um objeto de estado imutável, `stepTurn` idempotente ao concluir

`ProductionLineState`/`TurnEvent`/`stepTurn` seguem quase literalmente o
contrato do §10 do guia. A decisão não trivial foi a leitura de "em estado
concluído não lança novamente" (§10): não é "não lança uma exceção" — é "não
lança o dado de novo" (o termo do próprio guia para o sorteio de um turno,
§4.2). `stepTurn` sobre um estado `completed` devolve o MESMO objeto de
estado, sem sortear nada — verificado por identidade de referência em teste
(`tests/factory/domain/engine.test.ts`, "stepTurn em estado concluído...").
Os índices terminais (`nextRoundIndex === rounds`, `nextStageIndex === 0`)
são uma representação consistente de "nada mais a jogar", não um turno
futuro real (§10) — `nextTurnDescriptor` devolve `null` nesse caso, e a
interface nunca tenta mostrar "Dia 11 de 10".

`rollFace` é um parâmetro opcional de `stepTurn`/`runToEnd`, nunca um campo
de `ProductionLineConfig` nem do payload persistido — exatamente a permissão
do guia (§10: "permitir fornecer uma sequência de faces apenas em fixtures
de teste, fora dos controles e do formato importável de produção"). A
referência manual do §11 (dois ciclos com dados fixos) e as fixtures
adicionais (todos tiram 6, estoque que não desaparece, fila vazia, estoque
suficiente) são implementadas injetando essa função — nunca adulterando o
RNG de produção.

### D62 — `application/runStore.ts`: `processNextStage` e `advanceAutoTurn` são ações DIFERENTES, não a mesma com um parâmetro

Erro encontrado via E2E (não em unitário, porque o teste unitário de
`processNextStage` só verificava o bloqueio contra si mesmo, nunca contra um
consumidor de fora): a primeira versão tinha uma única ação de turno que
recusava agir sempre que `uiStatus === 'running'` — pensada para bloquear
cliques manuais concorrentes com o automático (§6). Mas o PRÓPRIO laço de
reprodução automática chamava essa mesma ação para avançar — e como o
automático já está em `running` quando dispara, cada tique do intervalo era
recusado silenciosamente. O fluxo E2E completo (`flow-g-factory-full-
cycle.spec.ts`) pegou isso: depois de "Automático" + esperar + "Pausar", o
turno não tinha avançado nada.

Corrigido separando as duas ações: `processNextStage`/`completeDay`
(manuais) exigem `uiStatus !== 'running'` — continuam bloqueando ações
concorrentes com o automático, papel original. `advanceAutoTurn` (só chamada
pelo intervalo do próprio automático, em `ProductionLine.tsx`) exige o
OPOSTO — só age se `uiStatus` JÁ é `running` — e, ao contrário das manuais,
MANTÉM `running` depois de cada turno bem-sucedido (não rebaixa para
`paused`), para o próprio intervalo continuar dominando os turnos seguintes
sem downgrade prematuro. Coberto por quatro testes dedicados em
`tests/factory/application/runStore.test.ts`.

### D63 — Ordem de efeitos React: `ProductionLine` nunca inicia sua própria partida — só `FactoryExperience.start()` chama `startRun`

Segundo bug encontrado pelo mesmo E2E (depois de corrigir D62): recarregar
no meio de uma partida não recuperava o progresso — voltava para o início.
Causa: `ProductionLine` tinha um efeito de montagem que chamava `startRun`
sempre que não havia config no controlador ainda; `FactoryExperience` tinha
OUTRO efeito de montagem que restaurava a sessão salva e chamava
`resumeRun`. Efeitos de um componente FILHO disparam antes dos efeitos do
PAI (ordem "de baixo para cima" do React) — então, ao recarregar com uma
partida ativa salva, `ProductionLine` (filho) rodava seu `startRun` (uma
partida nova, vazia) ANTES de `FactoryExperience` (pai) sequer ter lido o
localStorage, e o próprio `startRun` disparava o salvamento imediato da
store de execução (D64), sobrescrevendo o progresso salvo com zero eventos
— tudo isso antes da restauração real acontecer.

Corrigido concentrando toda criação de partida NOVA em
`FactoryExperience.start()` (chamado só pelo clique em "Iniciar partida" na
preparação, depois de `usePreparationStore`/`useHistoryStore` já estarem
montados havia tempo) — `ProductionLine` não inicia mais nada sozinho.
Numa recarga com partida ativa salva, o próprio efeito de restauração do pai
chama `resumeRun` (sempre pausada, TG07); `ProductionLine`, ao montar, já
encontra a store preenchida e simplesmente lê o estado existente (mostra um
esqueleto de carregamento por um instante, se o efeito do pai ainda não
rodou — nunca dados incorretos). TG07 e a corrida entre efeitos ficaram
cobertos por asserções específicas no E2E (`progressBeforeReload` comparado
byte a byte com o texto exibido depois do `page.reload()`).

### D64 — Persistência: preparação/histórico com pequeno atraso; execução salva a CADA turno, sem atraso

A trilha espera 500 ms depois da última mudança confirmada antes de salvar,
porque nada nela muda por tick de física (a física fica isolada numa ref).
A fábrica é o oposto para a execução: o guia exige "salvar após cada turno
CONFIRMADO" (§9) explicitamente, e TG07 exige recuperar "o estado correto,
pausado" depois de recarregar — um atraso de 500 ms perderia o último turno
exatamente no momento em que ele acabou de ser confirmado, se a página
fechasse dentro dessa janela. Como turnos são discretos e pouco frequentes
(no máximo um a cada 250 ms no automático mais rápido, 2×), uma escrita
síncrona de `localStorage` por turno não é um problema de desempenho —
diferente da física a 60 fps da trilha, que nunca poderia se dar a esse
luxo. `FactoryExperience` tem duas inscrições separadas: uma debatida
(preparação + histórico) e uma imediata, só para `useRunStore`.

### D65 — Schema versão 1 desde o início: sem histórico de formatos anteriores para reconciliar

Diferente da trilha (que chegou à v3 acumulando decisões sobre o que é
aditivo vs. o que exige rejeição), a fábrica nasce com `SCHEMA_VERSION = 1`
— não há nenhuma versão anterior deste payload para ser compatível ou
incompatível com. A mesma checagem de coerência por recomputação da trilha
(`attemptCoherenceIssues`, recalcular e comparar bit a bit em vez de
reescrever cada invariante) foi reaproveitada aqui como `runResultIssues`/
`activeRunIssues` — a segunda é nova em relação ao padrão da trilha, porque
só a fábrica precisa validar um estado ATIVO (não só concluído) salvo no
meio de uma partida: `recomputeState` joga `events.length` turnos a partir
do estado inicial e compara com o que foi salvo, servindo igualmente para
`RunResult.finalState` (concluída) e `ActiveRun.state` (em andamento).

### D66 — Rota própria (`/fabrica`), não um seletor que substitui a raiz da trilha

A primeira tentativa colocou um "seletor de exercícios" como a NOVA raiz de
`/`, atrás do qual a trilha só aparecia depois de um clique — quebraria
"preservar a rota e o comportamento da trilha" (§2 do guia da fábrica, dito
explicitamente) e todos os fluxos E2E existentes da trilha, que assumem
`page.goto('/')` já entrega a trilha direto. Revertido: `/` continua sendo
só a trilha, sem nenhuma tela nova antes dela; `/fabrica` é uma rota
irmã (`src/app/fabrica/page.tsx`) com a fábrica. Cada experiência ganhou um
link discreto para a outra no próprio cabeçalho (ícone + rótulo, usando
`next/link` para navegação sem recarregar) — isso é o "seletor de
exercícios" que o guia pede (§2), só que como navegação cruzada em vez de
uma tela intermediária. Trocar de exercício no meio de uma tentativa da
trilha tem o mesmo efeito que um recarregamento (a trilha já lida com isso
via o marcador de interrupção existente); na fábrica, o efeito é menor
ainda — a partida ativa já está salva a cada turno (D64), então nada se
perde de qualquer forma.

### D67 — Calibração da fábrica: mecanismo de eventos dependentes confirmado em 500 execuções, sem intervenção

`scripts/calibrateFactory.ts`: 100 seeds fixas × 5 combinações (5 setores em
10/20/30 dias; 4 e 12 setores em 10 dias) — 500 partidas completas. Resultado
real (`docs/calibration/calibration-factory-1.0.0.json`): em TODAS as cinco
combinações, a entrega ficou abaixo da referência (`3,5 × rodadas`) em pelo
menos 99% das seeds — 100% em quatro das cinco. Nenhuma entrega zero,
nenhum resultado degenerado. Mais setores reduz a saída média (12 setores:
média 16,65 lotes em 10 dias; 5 setores: média 23,03) — o efeito de cadeia
mais longa amplificando o gargalo por dependência, coerente com o mecanismo
do livro. Como o próprio guia proíbe (§12): não foi exigido que TODA seed
fique abaixo da referência nem que a saída caia monotonicamente — o
resultado ficou perto de 100% "naturalmente", sem nenhum parâmetro ajustado
para produzir esse número; nenhuma seed foi escolhida a dedo.

### Verificações desta entrega

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (485 testes — 99 novos
só da fábrica: `random.test.ts`, `engine.test.ts` [referência manual do §11
+ fixtures + TG01/TG03/TG04/TG05], `metrics.test.ts`, `validation.test.ts`,
`config.test.ts`, `schema.test.ts`, `historyStore.test.ts`,
`preparationStore.test.ts`, `runStore.test.ts`, `sessionSync.test.ts`),
`npx playwright test` (12 specs — `flow-g-factory-full-cycle.spec.ts`,
novo, cobre o fluxo completo do §12: preparar → manual → completar rodada →
automático → pausar → recarregar → concluir → comparar com repetição →
exportar/importar), `npm run build` (rotas `/` e `/fabrica`) e
`npm run calibrate:factory` (resultados reais resumidos em D67) passam.

## 2026-09-26 — Tela inicial com seletor de exercícios e zerar histórico

### D68 — `/` volta a ser uma tela própria (pedido explícito do usuário); trilha migra para `/trilha`

D66 tinha decidido não usar uma tela seletora em `/` para preservar a rota e
o comportamento anteriores da trilha. O usuário pediu explicitamente uma
tela inicial com dois botões (Trilha / Fábrica) — instrução direta que
substitui aquela decisão. `TrailExperience` mudou de `/` para `/trilha`
(`src/app/trilha/page.tsx`); `/` agora é `HomeScreen` (`src/app/HomeScreen.tsx`),
um componente cliente simples com dois cartões-link e o botão "Zerar
histórico". Os links cruzados de cada exercício (adicionados em D66) foram
ajustados: a fábrica aponta para `/trilha` em vez de `/`, e as duas telas
ganharam um link "Início" de volta à tela inicial — sem ele, a tela inicial
seria um beco sem saída depois do primeiro clique. Os 11 `page.goto('/')`
nos specs E2E da trilha viraram `page.goto('/trilha')`.

### D69 — "Zerar histórico" limpa storage E memória, via reload — não tenta resetar cada store por fora

`resetAllData` (`src/app/resetAllData.ts`) é o único lugar do projeto que
importa dos dois módulos ao mesmo tempo — legítimo aqui, porque é
exatamente a tela que precisa conhecer os dois. Zera as duas chaves de
`localStorage` (`clearStoredSession` de cada módulo, mais o marcador de
tentativa ativa da trilha) e then força `window.location.reload()`. A
alternativa — chamar `setState` em cada store Zustand das duas features a
partir daqui — foi descartada: os stores são singletons de módulo que
sobrevivem à navegação client-side entre rotas: só limpar o `localStorage`
deixaria dados em memória de uma sessão já aberta reaparecerem (e serem
regravados) ao reentrar naquele exercício, e replicar a forma de cada store
aqui duplicaria conhecimento que já muda dentro de cada módulo. Um reload
depois de limpar o storage é simples, robusto, e não corre esse risco.
Confirmação obrigatória via `ConfirmDialog` (reaproveitado da trilha, já
genérico) antes de apagar — ação destrutiva e irreversível.

### Verificações desta entrega

`npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (485 testes, sem novos
— mudança só de roteamento/UI), `npx playwright test` (13 specs —
`flow-h-home-screen.spec.ts`, novo: navega para os dois exercícios e volta,
gera progresso na fábrica, cancela um "zerar histórico" e confirma que nada
mudou, confirma o segundo e verifica que a partida em andamento sumiu; as 11
ocorrências de `page.goto('/')` nos specs da trilha atualizadas para
`/trilha`) e `npm run build` (rotas `/`, `/trilha`, `/fabrica`) passam.

## 2026-09-26 — Correções da auditoria do guia das tigelas

### D70 — Conclusão registrada pelo controlador e pendência protegida

O controlador registra o resultado antes de publicar o estado terminal.
Histórico e execução são salvos imediatamente; somente a preparação mantém
debounce. Completar um dia publica cada turno confirmado. A conclusão deixa
de depender de um efeito React, inclusive no último clique antes de recarregar.
Com 20 resultados e uma partida pendente, novos inícios e repetições ficam
bloqueados até liberar espaço. Sessões antigas ou importadas com uma partida
ativa e outra pendente preservam ambas e bloqueiam o avanço até resolver a
pendência. `recordRun` também recusa sobrescrever a
pendência. A exportação continua incluindo esse resultado.

### D71 — Apresentação acompanha o estado confirmado

A ponte Pixi usa a API atual de criação, `fit`, `setTempo` e `settle`, aplica
o snapshot depois da criação assíncrona e acompanha o setor ativo com rolagem.
Pausar encerra a apresentação pendente no estado confirmado. A preferência
de movimento reduzido é respeitada. A sessão local é lida para escolher a
tela somente depois da hidratação, evitando divergência entre HTML do servidor
e sessão restaurada. Visitar o histórico pausa a execução; retomar preserva
o progresso e iniciar outra partida exige confirmação de descarte.

### D72 — Observação durante a partida e comparação auditável

Indicadores e gráficos ficam disponíveis durante a execução. Dias parciais
são identificados e os gráficos usam dias encerrados. A tabela mostra
capacidades acumuladas e jogadas por setor. Os fechamentos diários e o
registro completo de jogadas podem ser consultados na execução e nos
detalhes das partidas comparadas. A comparação inclui curvas de entrega
por partida, com horizonte e escala explícitos. Instruções iniciais,
unidades, rótulos dos campos e anúncios manuais esclarecem a experiência.
Nenhuma regra de sorteio, transferência ou conservação foi alterada.

### Evidência estatística

`npm run calibrate:factory` executado novamente: 500 partidas, em cinco
configurações. Com cinco setores, a entrega média foi 23,03 / 51,08 / 80,48
lotes em 10 / 20 / 30 dias. Com quatro setores houve uma partida acima da
referência entre 100 seeds, preservada no relatório. Esses resultados são
descritivos; não constituem validação pedagógica com pessoas.

### Verificações da auditoria corrigida

`npm test`: 488 testes aprovados. `npx tsc --noEmit`, `npm run lint` e
`npm run build`: aprovados. `npx playwright test`: 16 testes aprovados,
incluindo os fluxos existentes da trilha e três regressões novas da fábrica
(persistência imediata da conclusão, proteção da partida pendente e retomada
com 12 setores sem descarte nem erro de hidratação). O teste do controlador
foi executado novamente após incluir a proteção para sessões antigas:
17 testes aprovados, com nova checagem de retomada após liberar espaço.
Inspeção visual em Chromium com cinco e 12 setores, movimento reduzido,
foco por teclado e rolagem do canvas; sem exceções nas páginas inspecionadas.

## 2026-09-27 — Dado destacado e linha de produção em três colunas

### D73 — Animação manual e percurso em zigue-zague

As estações ficam em linhas de três, alternando o sentido do fluxo. As
curvas entre linhas usam o mesmo caminho para desenhar a esteira e mover
os lotes. A doca segue o último setor. O canvas acompanha o setor apresentado
com rolagem vertical, mantendo rolagem horizontal em telas estreitas.

O dado ficou maior e cada estação exibe seu último valor por escrito; o
último sorteio também ganha destaque fora do canvas. O turno manual tem
animação de 1,8 segundo e bloqueia o próximo avanço enquanto ela acontece.
Completar dia apresenta a sequência de forma mais rápida. Apenas pausar o
automático encerra a apresentação imediatamente; o modo manual deixa de ser
confundido com essa ação. Recuperação e movimento reduzido aplicam o estado
diretamente. O motor e o salvamento continuam independentes da animação.

Verificações: 488 testes unitários, cinco testes E2E da fábrica (incluindo
animação manual, movimento reduzido, retomada e 12 setores), TypeScript,
lint dos arquivos envolvidos e build aprovados. Inspeção visual com cinco
e 12 setores sem exceções no navegador.

## 2026-09-27 — Fábrica: toda partida nova sorteia dados novos

### D70 — A seed era gerada uma vez por rascunho e reaproveitada em toda partida

Reportado em uso: quatro partidas seguidas de 10 dias deram sempre o mesmo
resultado (21 expedidos, 15 em estoque). O dado é determinístico por seed (é
isso que permite "Repetir os mesmos sorteios" e a validação por replay na
importação), mas a seed só era gerada ao criar o rascunho da preparação — e
o rascunho fica salvo no navegador. "Iniciar partida" passava sempre o mesmo
rascunho, logo a mesma seed e os mesmos dados. Contrariava o §5 ("gerar uma
seed ao criar uma nova partida").

Corrigido com `preparationStore.newRunConfig()`: sorteia uma seed nova
(`crypto.randomUUID`) e devolve a configuração com que a partida começa; o
botão "Iniciar partida" usa isso. Só "Repetir os mesmos sorteios", na tela de
resultado, reaproveita a seed — de propósito. O botão "Nova sequência de
dados" da preparação foi removido (iniciar já sempre sorteia dados novos); o
da tela de resultado continua. Testes novos em `preparationStore.test.ts`
confirmam seeds diferentes e sequências de dados diferentes em 5 partidas.

## 2026-09-28 — Fábrica: experiência "Restrição e melhoria do fluxo" (`EVOLUCAO_FABRICA_RESTRICAO_E_FLUXO.md`)

A experiência atual passa a se chamar "Dependência e variabilidade"; a nova é
uma segunda experiência do MESMO módulo, com o mesmo motor, preparação,
execução, histórico e comparação. Seletor de experiência no topo da preparação.

### D71 — Uma única mudança física: capacidade = dado + bônus + melhoria

`domain/capacity.ts` (novo) concentra perfis, média nominal e diagnóstico
estrutural. `stepTurn` troca `die` por `availableCapacity(config, stageId, die)`
na transferência e em `unusedCapacity`; o evento guarda `die` (componente
variável, sempre 1–6) e `availableCapacity` (total) separados — `die` nunca é
reaproveitado para a capacidade total (§9). O bônus e a melhoria não entram na
chave do RNG: a chave continua `[versão, seed, stageId, roundIndex]`, então base
e intervenções têm faces idênticas por construção. Com perfis zero, a física é
a da 1.0.0 — os 104 testes antigos (vetores do RNG, referência manual do §11,
conservação) passaram sem alteração, e a calibração antiga reproduziu os mesmos
números (5 setores × 10 dias: média 23,03). `ENGINE_VERSION` 1.1.0.

### D72 — Configuração guarda experiência, perfis, restrição original, experimento e intervenção

Invariantes validados em runtime e na importação (`validation.ts`): experiência
antiga só com zeros; linha de base com bônus 0 exatamente no setor central
(`floor(n/2)`) e 2 nos demais; tentativa com exatamente um setor melhorado, o
da intervenção, com +1/+2/+3. `buildInterventionConfig` deriva SEMPRE da base
(`baselineConfigOf` zera melhorias) — nunca acumula tentativas. A tentativa
conserva seed, perfis e o vínculo `intervention.baselineRunId`; a base é
recalculável da própria tentativa, então a comparação antes/depois continua
funcionando mesmo se a base for excluída (§9). "Nova sequência de dados" gera
seed nova E experimento novo (`withNewSeed`): outra seed nunca vira tentativa do
experimento anterior.

### D73 — Diagnóstico estrutural separado das evidências; hipótese antes da resposta

`diagnoseConstraint` usa só as médias configuradas e trata empate explicitamente
(+2 na restrição: todos em 5,5; +3: os outros quatro empatam em 5,5). As
evidências (capacidade disponível, processado, não utilizada por falta de
material, dias com material insuficiente, fila no fim de cada dia) aparecem ao
lado, com o aviso de que nenhuma delas identifica a restrição sozinha. O
diagnóstico só aparece depois que o grupo registra a hipótese (setor ou "Ainda
não sei", justificativa opcional), gravada na linha de base
(`RunResult.constraintGuess`) — sem pontuação e sem bloqueio. A tabela de
capacidades médias fica visível desde a preparação, sem destacar a restrição (§4.1).

### D74 — Métricas: referência pela menor média; taxa pelos dias encerrados

`summarize` passou a somar `availableCapacity` (não o dado) e ganhou taxa de
entrega calculada do último fechamento, aproveitamento, dias com material
insuficiente e médias por setor. A referência é `menor média × dias encerrados`
e o desvio de cada setor usa a própria média — na experiência antiga isso
continua dando 3,5, sem mudar números. `classifyRunRelationship` ganhou
"intervenção controlada": mesma base e seed, só a melhoria muda, e as faces
correspondentes conferidas uma a uma; recebe as partidas (config + estado), não
só a config.

### D75 — Schema v2 com migração explícita da v1, conferida por replay

`SCHEMA_VERSION` 2. `persistence/migrations.ts` converte sessões v1 para
"Dependência e variabilidade" com perfis zero e `availableCapacity = die`, nunca
reinterpretando partidas antigas com bônus. As métricas antigas são conferidas
campo a campo contra o recálculo antes de serem substituídas — uma métrica
adulterada num arquivo v1 é rejeitada, não "corrigida". Depois, a validação
normal refaz cada partida. Outras versões continuam rejeitadas sem apagar nada.
A chave do localStorage não mudou (mudá-la faria sessões existentes sumirem).

### D76 — Calibração da nova experiência (§11)

`npm run calibrate:factory`, 100 seeds × 5 setores × 20 dias, 800 execuções em
100 grupos pareados (`docs/calibration/calibration-factory-1.1.0.json`):

| Variante | Entrega média | Δ entrega pareada (média; mín–máx) | Δ estoque médio | Seeds com ganho |
| --- | ---: | --- | ---: | ---: |
| Linha de base | 67,33 | — | — | — |
| +1 setor 1 | 67,73 | +0,40 (0–4) | +19,60 | 29 |
| +1 setor 2 | 67,66 | +0,33 (0–4) | −0,33 | 23 |
| +1 restrição (setor 3) | 83,43 | +16,10 (6–20) | −16,10 | 100 |
| +1 setor 4 | 67,54 | +0,21 (0–2) | −0,21 | 19 |
| +1 setor 5 | 67,56 | +0,23 (0–4) | −0,23 | 15 |
| +2 restrição | 91,60 | +24,27 (7–38) | −24,27 | 100 |
| +3 restrição | 93,96 | +26,63 (7–46) | −26,63 | 100 |

Nenhuma perda de entrega em nenhuma variante (propriedade de regressão: só
aumentar capacidade com os mesmos dados não reduz a entrega) e nenhuma face
divergente da base. Melhorar um não gargalo ajuda pouco e às vezes (15–29% das
seeds, até +4 lotes) — preservado, não escondido; +1 no primeiro setor quase só
acumula estoque (+19,6). A diferença entre melhoria local e entrega do sistema
ficou claramente observável, então os parâmetros do documento não foram
revisados. Fronteira (4 e 12 setores, 10 e 30 dias, 20 seeds, 880 execuções):
zero violações de conservação, de limite de capacidade, de faces e do
diagnóstico de empate.

### Verificações desta entrega

Ver o resumo entregue ao usuário: `tsc`, `eslint`, `vitest` (fábrica: 143
testes, 39 novos — `constraintFlow.test.ts` com exemplos A/B do §10,
`migration.test.ts`, stores), `build`, Playwright com o novo
`flow-j-constraint-flow.spec.ts` (base → hipótese → diagnóstico → +1 em não
gargalo com reload no meio → +1 na restrição → comparação controlada) e a
calibração acima. Inspeção visual com 5 e 12 setores. Não há validação
pedagógica com pessoas: o piloto desta experiência continua pendente.
