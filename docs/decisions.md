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
