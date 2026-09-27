# Guia do MVP — Fábrica de Componentes Aeronáuticos

Versão 1.1 · 26/09/2026 · Português do Brasil

Público: desenvolvimento, produto e IA responsável pela implementação.

Revisão 1.1: adota a temática industrial aeronáutica na apresentação, preservando integralmente as regras de transferência, os sorteios e os exemplos numéricos. O nome deste arquivo é mantido para continuidade da referência anterior.

## 1. Objetivo

Criar um exercício cooperativo inspirado no jogo de tigelas, fósforos e dado do capítulo 14 de *A Meta*, de Eliyahu M. Goldratt e Jeff Cox. Demonstrar como **eventos dependentes e flutuações estatísticas** afetam a entrega de uma sequência de etapas, mesmo quando todas têm a mesma capacidade média.

O participante precisa distinguir capacidade disponível, transferência realizada, estoque intermediário e entrega final. O objetivo do grupo é observar quantos lotes chegam à saída no horizonte da partida e explicar o resultado.

Não há jogador permanentemente mais lento, mochila ou capacidade individual sorteada. Todos usam a mesma distribuição de capacidade: um dado justo de seis faces. Não criar um “Herbie” neste exercício.

A referência de 3,5 lotes por dia simulado é a média de capacidade individual do dado, **não uma promessa de entrega do sistema**. Os 20 fósforos entregues em dez rodadas na narrativa não são um resultado obrigatório da aplicação.

### 1.1 Temática e unidade de trabalho

Nome do exercício na plataforma: **“Fábrica de componentes”**. Subtítulo: “Fluxo de componentes aeronáuticos — exercício inspirado em A Meta”.

Cada unidade representa **um lote padronizado de componentes**, que percorre todos os setores. Usar “lotes” em indicadores, exemplos, gráficos e resultados. Não alternar entre peças, lotes e aviões nem definir tamanho variável de lote. Um lote entra, é processado e continua como um lote: não há divisão, combinação, montagem ou mudança de quantidade.

Linha padrão de cinco setores:

**Usinagem → Tratamento superficial → Pintura → Inspeção → Expedição**

Esta sequência é uma ambientação didática genérica, não um roteiro validado de fabricação de um componente específico. Todos os setores usam a mesma regra e a mesma distribuição de capacidade. Inspeção não reprova lotes e Expedição também tem capacidade sorteada; o nome do setor não introduz regra especial.

| Exercício original | Apresentação industrial |
| --- | --- |
| Tigela | Fila de lotes aguardando processamento no setor |
| Fósforo | Um lote padronizado de componentes |
| Dado | Capacidade disponível hoje, em lotes |
| Rodada | Um dia simulado |
| Saída da última tigela | Lotes expedidos ao cliente |

Para quantidades diferentes de cinco setores, usar “Setor 1”, “Setor 2” etc., identificando primeiro/último como entrada/saída. Não inventar automaticamente cadeias aeronáuticas supostamente reais. O nome do participante aparece separadamente: “Pintura · Ana”. Sem nome, mostrar apenas o setor e seu número.

### 1.2 Limites da analogia industrial

“Dia simulado” é uma unidade do exercício. Os setores são resolvidos em sequência e um lote pode percorrer vários setores no mesmo dia; não há duração real de processamento, calendário, turnos de trabalho ou tempo de transporte.

O termo técnico “turno” nas regras abaixo significa uma jogada/ação de um setor, não um turno industrial de oito horas. Na interface, preferir “Processar próximo setor” e “Completar dia”. Explicar brevemente antes de iniciar: “Cada dia, os setores atuam em sequência. A simulação representa fluxo e capacidade, não prazos reais de fabricação.”

Não representar aviões completos passando entre galpões nem etapas paralelas que convergem para montagem. Falta de fornecedores, custos, certificação, retrabalho, rejeição, gargalos fixos e capacidade distinta entre setores permanecem fora do escopo.

## 2. Stack e integração

- Next.js com App Router, React e TypeScript.
- PixiJS para setores, filas de lotes, dado e animações de transferência.
- Componentes de formulário, tabela e navegação em React/HTML acessível.
- Reutilizar estilos, componentes e dependências compatíveis do projeto da trilha. Não impor novas versões de bibliotecas.
- Motor puro em TypeScript, independente de React, PixiJS, FPS e relógio real.
- Estado e histórico locais; sem login, backend, banco de dados ou multiplayer.
- Reutilizar os frameworks de teste existentes; se inexistentes, Vitest para domínio e Playwright para os fluxos principais.

Se a implementação ocorrer no repositório da trilha, adicionar um módulo independente, com entrada “Fábrica de componentes” no seletor de exercícios. Preservar a rota e o comportamento da trilha. Se o repositório for novo, implementar somente este módulo, sem copiar toda a aplicação anterior.

Separar domínio, controller, interface e persistência. Compartilhar componentes e utilitários quando fizer sentido, mas não adaptar o motor contínuo da caminhada para processar rodadas. Carregar PixiJS no cliente conforme o padrão já adotado no repositório, destruindo aplicação, listeners e animações ao desmontar.

## 3. Escopo do MVP

### Incluído

- Treinamento presencial com um operador e tela compartilhada.
- Cinco etapas por padrão, como no trecho do livro; opção de 4 a 12 para acomodar o grupo.
- Nomes opcionais dos participantes associados aos setores. Nome do setor e nome da pessoa são campos distintos; aplicar os rótulos da seção 1.1. Nomes repetidos são permitidos e distinguidos pelo número do setor.
- Horizonte escolhido antes de iniciar: 10 dias simulados por padrão, ou 20/30; cada dia equivale a uma rodada do motor.
- Uma ação por vez, uma rodada completa ou reprodução automática.
- Dado de 1 a 6 em todas as etapas; sementes reproduzíveis internamente.
- Indicadores, gráfico por rodada, registro de jogadas, resultados e comparação de partidas.
- Hipótese opcional antes da partida, até 500 caracteres.
- Histórico local de até 20 partidas, exportação/importação JSON.

### Fora desta entrega

- Fadiga, energia, mochilas, diferentes capacidades por jogador ou reorganização durante a partida.
- Dado viciado, escolha manual de resultados, rerrolagem ou bônus de desempenho.
- Limite de espaço das filas intermediárias, descarte, defeitos, retrabalho ou bloqueio por estoque cheio.
- Estoque inicial editável, buffers, controle de liberação, DBR ou políticas de melhoria.
- Modo sem variabilidade, capacidade fixa de 3,5 e lotes fracionários.
- Pontuação financeira, custos monetários, ranking de pessoas ou punições por resultado individual.
- IA em tempo de execução, serviços externos, salas online ou novos relatórios PDF.

O MVP reproduz o mecanismo básico e permite investigá-lo. Experimentos de intervenção ficam para uma etapa posterior, explicitamente especificada.

## 4. Convenção física: esta seção é obrigatória

### 4.1 Componentes

Cada participante representa uma etapa de processamento. Há uma fonte de lotes de entrada com fornecimento irrestrito antes da primeira etapa, estoques de entrada nas etapas seguintes e uma área de produtos entregues depois da última.

A fila de entrada de cada setor representa **os lotes esperando para ser processados por ele**. O que sai do último setor conta como lote expedido; não permanece no estoque em processo.

O primeiro setor retira diretamente da fonte o número de lotes sorteado, processa e passa ao segundo. Sua estação é uma representação visual de processamento, sem estoque finito persistente. Não confundir o fornecimento irrestrito com estoque em processo. Na tela, identificá-la como “Entrada disponível”, sem contar os lotes ainda não liberados.

No estado inicial: estoques intermediários zero, entregas zero, entrada acumulada zero. Para simplificar o contrato, manter `inventoryByStage[firstStageId] = 0` sempre.

### 4.2 Turno e rodada

- **Turno:** uma etapa lança o dado e efetua sua transferência.
- **Rodada:** todas as etapas executam um turno, uma única vez, da primeira até a última.
- O que uma etapa transfere fica disponível imediatamente para a etapa seguinte, inclusive na mesma rodada.
- Não executar todas as etapas em paralelo e não introduzir atraso obrigatório de uma rodada entre setores.
- Não mudar a ordem das etapas durante a partida.

Esta convenção é essencial: a partida narrada permite que fósforos percorram várias etapas na primeira rodada. Um modelo de atualização simultânea seria outro experimento.

### 4.3 Regras de transferência

Se `d` é o resultado do dado e `s` a etapa atual:

```text
se s é a primeira:
    transferred = d
    introduced += transferred
senão:
    availableBefore = inventory[s]
    transferred = min(d, availableBefore)
    inventory[s] -= transferred

se existe próxima etapa:
    inventory[next(s)] += transferred
senão:
    delivered += transferred

unusedCapacity = d - transferred
```

Para a primeira etapa, `availableBefore` é nulo no log, com indicação de fonte irrestrita; sua capacidade não utilizada é zero.

Regras adicionais:

- Sortear inclusive quando a fila de entrada estiver vazia; registrar transferência zero e toda a capacidade não utilizada.
- Sobras permanecem para turnos posteriores.
- Capacidade não utilizada não pode ser guardada, transferida a outra pessoa ou somada ao próximo dado.
- Os lotes são quantidades inteiras e não negativas. IDs individuais por lote não são necessários.
- Não retirar lotes de outra fila para completar uma jogada.
- Conservação após **cada turno**: `introduced = delivered + soma(inventory)`.
- A partida termina ao concluir a última etapa da última rodada. Não esvaziar automaticamente as filas depois disso: o estoque restante é parte do resultado.

## 5. Sorteio e reprodução

Gerar uma seed ao criar uma nova partida, usando mecanismo adequado do ambiente. Dentro do motor, calcular os lançamentos deterministicamente a partir de:

```text
[versaoDoRng, seed, stageId, roundIndex]
```

Usar IDs estáveis de etapa, nunca nomes dos participantes. Reutilizar o RNG puro e versionado do projeto se compatível, documentando o mapeamento para faces 1–6 e seus vetores de teste. Não usar chamadas a `Math.random()` no avanço do domínio nem um sorteio por frame.

Animação do dado é decorativa: o resultado vem do domínio. Clique duplo, mudança de velocidade, pausa, redimensionamento e remontagem de componentes não podem produzir outro lançamento para o mesmo turno.

Ações no resultado:

- **Repetir os mesmos sorteios:** mesma configuração e seed, zerando estoques e contadores. Deve reproduzir exatamente os eventos.
- **Nova sequência de dados:** mesmos participantes, posições e horizonte, com nova seed. Identificar como repetição com outras condições aleatórias, não como melhoria de estratégia.
- **Nova partida:** voltar à preparação para alterar número de etapas ou horizonte.

Não selecionar ou rejeitar seeds para obrigar uma produção baixa, estoque alto ou resultado parecido com o livro.

## 6. Estado, avanço e animação

Estados de UI: `ready`, `running`, `paused`, `completed`. Abandonar uma partida ativa exige confirmação de descarte do progresso atual; resultados concluídos permanecem no histórico.

Controles:

| Controle | Comportamento |
| --- | --- |
| Processar próximo setor | Executa exatamente um turno. Disponível em preparação de execução ou pausa. |
| Completar dia | Executa apenas os turnos restantes da rodada atual, em ordem. Se estiver no início, executa uma rodada inteira. |
| Automático | Executa turnos sucessivos até pausar ou concluir. |
| Pausar | Interrompe antes do próximo turno; finaliza a representação de um turno já confirmado. |
| Reprodução | 0,5×, 1× ou 2×; altera somente a apresentação. |

Um turno é uma transação atômica: sortear, calcular, atualizar estado e log uma vez. Bloquear ações concorrentes enquanto sua apresentação estiver em andamento. Ao pausar, refletir imediatamente o último estado confirmado nos contadores, tabela e canvas. Não deixar o gráfico ou os números defasados em relação ao motor.

Indicar “Dia 3 de 10 · setor 2 de 5”. Ao concluir uma rodada, atualizar seus agregados e apontar para a primeira etapa da próxima. Antes de qualquer ação na rodada seguinte, permitir ver o fechamento anterior. Ao ocultar a aba, pausar o automático; não executar rodadas para compensar o tempo fora da tela.

O modo manual e o automático devem consumir os mesmos turnos e produzir resultados idênticos.

## 7. Interface e observação

### Preparação

Escolher quantidade de setores, cadastrar participantes, escolher horizonte em dias e registrar previsão de lotes expedidos. Mostrar a média do dado, 3,5, e a pergunta: “Se cada setor pode processar em média 3,5 lotes por dia, quantos lotes esperamos expedir?”. Não revelar antecipadamente que o grupo ficará abaixo de uma meta.

### Linha de produção

- Área de entrada, setores numerados, filas de lotes aguardando e área de lotes expedidos claramente identificadas.
- Manter o dado visível com o rótulo “Capacidade disponível hoje”. A animação não deve sugerir uma fórmula oculta de produtividade.
- Destaque da etapa cujo turno será executado.
- Contagem exata nas filas, mesmo quando o desenho usa poucos ícones ilustrativos de caixas ou bandejas de componentes. Mostrar “Aguardando: N lotes” antes de cada setor; a fila pertence ao setor que ainda vai processá-la.
- Usar cartões ou estações 2D, setas e símbolos simples de processo. Sem 3D, desenhos técnicos realistas, marcas de fabricantes ou animações caras. A legibilidade para projeção é prioritária.
- Última jogada: **“Pintura · capacidade: 6 lotes · material disponível: 2 lotes · processados e transferidos: 2 lotes · capacidade não utilizada: 4 lotes”**. Mostrar também a face do dado que definiu a capacidade.
- Explicação curta ao limitar a transferência: “Havia apenas 2 lotes disponíveis”.
- Quando `transferred = 0`, indicar “Sem material para processar”, sem culpar o participante.

Com muitas etapas, usar faixa horizontal com rolagem e acompanhamento visual da etapa ativa, sem reduzir texto até ficar ilegível ou reorganizar a sequência em uma ordem ambígua. A tabela HTML deve oferecer todas as informações sem depender do canvas, do mouse ou somente de cores.

A animação não deve exibir mais de uma transferência lógica simultânea. Ícones decorativos de lotes não são fonte de verdade. Não criar estoques adicionais entre a saída de um setor e a entrada do próximo: são a mesma fila lógica. Reduzir movimento conforme a preferência de acessibilidade do navegador; anunciar a jogada manual em região acessível, evitando excesso de anúncios no automático.

### Resultados

Apresentar entregue, estoque restante, referência de capacidade média, desvios e gráfico. Mostrar que um estoque intermediário não é uma entrega ao cliente. Permitir abrir o registro turno a turno para conferir os cálculos.

Não chamar automaticamente quem menos transferiu de “gargalo” nem eleger o pior jogador. A última etapa pode produzir menos porque recebeu pouco material. Separar o que o dado permitiu do que efetivamente pôde ser realizado.

## 8. Métricas e gráficos

Calcular agregados por rodada somente depois de todas as etapas concluírem seus turnos. Durante rodada incompleta, marcar métricas parciais e não misturar participantes com números de turnos diferentes numa comparação de metas.

| Métrica | Definição |
| --- | --- |
| Entrega acumulada | Lotes que saíram da última etapa. |
| Lotes expedidos por dia | Transferência da última etapa naquela rodada/dia simulado. |
| Estoque em processo atual | Soma dos estoques intermediários; exclui fonte e saída. |
| Entrada acumulada | Total liberado pela primeira etapa. |
| Capacidade sorteada da etapa | Soma das faces do dado dessa etapa. |
| Transferência realizada da etapa | Soma das transferências efetivas. |
| Capacidade não utilizada por falta de material | Soma de `dado − transferência`. Não é tempo de espera nem perda financeira. |
| Referência acumulada | `3,5 × rodadas concluídas`. |
| Desvio acumulado da etapa | `transferência acumulada − 3,5 × turnos executados por ela`. |
| Saída média observada | `entregue / rodadas concluídas`; antes da primeira rodada, mostrar “—”. |

Na tela principal, priorizar entrega, referência e estoque em processo. Usar um gráfico de saída acumulada versus referência `3,5 × rodada`, com eixo em lotes e eixo horizontal em dias simulados e pontos no encerramento de cada rodada. Em um segundo gráfico simples ou aba, mostrar o desvio acumulado por etapa, inspirado no registro de Alex, incluindo valores negativos.

Chamar a linha de 3,5 de **“Referência pela capacidade média”**, não “produção garantida”. Não somar as capacidades das etapas como se fossem entregas independentes. Se mostrar estoques máximos ou médios, especificar se são amostrados a cada turno ou no fim da rodada; não acrescentar métricas sem uso claro nesta entrega.

## 9. Histórico e comparação

Cada resultado contém snapshot da configuração, eventos, agregados finais e por rodada. Concluir registra uma única vez, inclusive após remontagem ou reload. Comparar até três partidas.

Exibir número da partida, data/hora, participantes, etapas, horizonte, seed abreviada, entrega final, estoque e curvas. Ordenar cronologicamente e distinguir:

- Mesma configuração e seed: reprodução; não é experimento independente.
- Mesma configuração, seed diferente: outra realização aleatória; não atribuir a diferença a aprendizado ou estratégia.
- Quantidade de etapas ou horizonte diferente: condições diferentes; não apresentar percentual de melhoria controlada.

Não converter automaticamente o desvio em atraso temporal. Em dez dias simulados, uma referência de 35 e entrega de 20 significa desvio de −15 lotes; não permite inferir quantas rodadas seriam necessárias para recuperar a diferença.

Persistir sob chave e schema próprios do módulo. Não sobrescrever sessões da trilha. Se compartilhar o arquivo de exportação, usar envelope versionado por exercício e manter compatibilidade explícita.

Salvar após cada turno confirmado para recuperar partidas em andamento, retomando sempre pausado, sem repetir o último turno. Persistir apenas dados serializáveis. Ao importar, validar antes de substituir, mostrar resumo e pedir confirmação da substituição. Arquivo inválido não apaga a sessão existente.

Limites: 20 resultados e 2 MiB por arquivo JSON inicialmente. Ao atingir o limite, oferecer exportação ou exclusão seletiva, sem descarte silencioso. Falha de armazenamento mantém a sessão em memória e informa que ela não está salva.

## 10. Contrato mínimo de domínio

Os nomes podem se adaptar ao repositório, preservando os significados. Se já houver tipos `BowlConfig`/`BowlState`, não é necessário refatorar todo o código somente para renomeá-los. IDs, seeds e chaves de persistência já usados devem continuar estáveis; mudança visual não é mudança de motor. Salvar os rótulos dos setores e dos participantes no snapshot; ambos são metadados e não participam do sorteio:

```ts
type StageId = string;
interface ProductionLineConfig {
  engineVersion: string;
  rngVersion: string;
  seed: string;
  stages: { id: StageId; sectorName: string; participantName: string }[]; // ordem fixa
  rounds: 10 | 20 | 30;
  hypothesis: string;
  initialInventory: 'empty';
  capacityModel: 'fair-d6';
}
interface TurnEvent {
  roundIndex: number; // zero-based
  stageIndex: number;
  stageId: StageId;
  die: number; // inteiro 1..6, validado em runtime
  availableBefore: number | null; // null somente na fonte
  transferred: number;
  unusedCapacity: number;
  inventoryAfter: Record<StageId, number>;
  introducedTotal: number;
  deliveredTotal: number;
}
interface ProductionLineState {
  nextRoundIndex: number;
  nextStageIndex: number;
  completedRounds: number;
  inventoryByStage: Record<StageId, number>;
  introduced: number;
  delivered: number;
  events: TurnEvent[];
  status: 'active' | 'completed';
}
```

API pura: `validateConfig`, `createInitialState`, `stepTurn`, `runToEnd`, `summarize`, `compareRuns`. `stepTurn` não muta entradas; em estado concluído não lança novamente. UI controla pausa e agendamento. Definir representação terminal consistente para os índices, sem tratá-los como um turno adicional.

Permitir fornecer uma sequência de faces apenas em fixtures de teste, fora dos controles e do formato importável de produção. Para importação de partidas ativas, validar cursor e eventos mediante replay determinístico. Recusar inconsistências em conservação, faces, IDs, estoques, contadores, ordem ou versões não suportadas. Não confiar em totais arbitrários do JSON.

Sessões anteriores deste módulo sem `sectorName` podem receber rótulos de apresentação derivados da quantidade e posição, sem alterar IDs, sorteios ou métricas. Se houver migração de schema, fazê-la explicitamente e preservar os dados.

Versões antigas só são reproduzidas se o motor correspondente for suportado; caso contrário, rejeitar com mensagem clara preservando os dados atuais. Nomes não alteram sorteios, mas resultados concluídos mantêm os nomes de seu próprio snapshot.

## 11. Referência manual para testar o motor

Cinco setores A → B → C → D → E, começando sem estoque. No cenário padrão, correspondem a Usinagem, Tratamento superficial, Pintura, Inspeção e Expedição. Quantidades em lotes; cada rodada equivale a um dia:

| Rodada | Dados A/B/C/D/E | Transferências A/B/C/D/E | Estoques finais A/B/C/D/E | Entrega acumulada | Entrada acumulada |
| --- | --- | --- | --- | ---: | ---: |
| 1 | 2 / 4 / 5 / 1 / 1 | 2 / 2 / 2 / 1 / 1 | 0 / 0 / 0 / 1 / 0 | 1 | 2 |
| 2 | 6 / 6 / 3 / 6 / 3 | 6 / 6 / 3 / 4 / 3 | 0 / 0 / 3 / 0 / 1 | 4 | 8 |

Esse exemplo reproduz a mecânica dos dois primeiros ciclos narrados, não a sequência completa do livro. Conferir: depois de duas rodadas, entrada 8 = entrega 4 + estoque 4. Referência acumulada 7; desvio da entrega −3.

Fixtures adicionais:

- Todos tiram 6: entrega 6 por rodada desde a primeira e estoque final zero. Isso impede que se introduza atraso artificial entre etapas ou teto de 3,5.
- A tira 6 e B tira 1: sobra estoque na entrada de B; ele não desaparece na próxima rodada.
- Fila de entrada vazia e dado alto: teste unitário defensivo da regra de transferência, com transferência zero e capacidade não utilizada igual ao dado. No fluxo padrão, como a fonte sempre libera pelo menos 1 e as etapas atuam sequencialmente, cada etapa recebe pelo menos 1 por rodada; não fabricar filas vazias no turno para demonstrar espera total.
- Estoque suficiente: transferência igual ao dado, com sobra correta.
- No modo padrão, ao fim de R rodadas, a entrega fica entre R e 6 × R. Capacidade não utilizada continua possível mesmo sem turnos de transferência zero.

## 12. Validação e critérios de aceite

| ID | Aceite |
| --- | --- |
| TG01 | Todas as etapas usam a mesma distribuição de faces; não há ajuste por nome, posição ou desempenho anterior. |
| TG02 | Referência manual passa, incluindo estoque e saída de cada turno. |
| TG03 | Conservação, inteiros não negativos e limites da transferência valem após cada turno. |
| TG04 | Recebimento pode ser processado na mesma rodada; não há atualização simultânea oculta. |
| TG05 | Manual, rodada completa e automático produzem eventos e métricas iguais com a mesma configuração. |
| TG06 | Cliques repetidos, pausa e troca de reprodução não duplicam turnos nem sorteios. |
| TG07 | Recarregar no meio recupera o estado correto, pausado; concluir não duplica o histórico. |
| TG08 | Importação inválida não apaga dados; exportar/importar preserva snapshots e eventos. |
| TG09 | Nome repetido ou editado não troca IDs nem altera resultado físico. |
| TG10 | Tela distingue dado, transferência, estoque e saída; gráficos incluem desvios negativos. |
| TG11 | Teste visual com 5 e 12 etapas, controles por teclado, valores disponíveis fora do canvas. |
| TG12 | Trilha e fábrica mantêm sessões separadas; navegação não apaga dados nem deixa loops ativos. |
| TG13 | Temática e rótulos não alteram os eventos: mesmo cenário, IDs e seed preservam os números da referência anterior. Filas não são contadas duas vezes; unidades são lotes em toda a UI. |

Um E2E deve cobrir: preparar → jogar manualmente → completar rodada → automático → pausar → recarregar → concluir → comparar com repetição → exportar/importar. Adaptar testes existentes sem duplicar infraestrutura.

### Verificação estatística de desenvolvimento

Criar script sem UI para 100 seeds fixas, com 5 etapas e horizontes 10, 20 e 30; verificar também 4 e 12 etapas em dez rodadas. Registrar versão, parâmetros, mediana, mínimo/máximo, média de saída, estoques e proporção de partidas abaixo da referência. Preservar zeros e resultados acima da referência.

Não estabelecer como teste obrigatório que todas as seeds entreguem menos de 35 ou que a saída por rodada diminua continuamente. Estoques e saídas podem subir ou descer localmente; uma rodada favorável não invalida o mecanismo. Diferenciar partidas independentes de prefixos da mesma sequência.

A conservação e os exemplos manuais são critérios rígidos; a distribuição de resultados é evidência descritiva. Não ajustar dados ou escolher seeds convenientes para cumprir uma conclusão pedagógica.

## 13. Mini roteiro do facilitador

1. **Prever:** “Todos os setores têm capacidade média de 3,5 lotes por dia. Quanto esperamos expedir em dez dias?”
2. **Observar:** “A pintura tinha capacidade para seis lotes. Por que processou apenas dois?”
3. **Investigar:** “Onde há acúmulo? Onde falta material? Podemos guardar a capacidade que sobrou?”
4. **Comparar:** “Qual setor teve capacidade alta, mas processou pouco? Quantos lotes foram expedidos de fato?”
5. **Repetir:** “Outra sequência muda os números? Qual mecanismo continua valendo?”
6. **Conectar:** “No trabalho, quando alguém tem capacidade, mas precisa esperar uma entrega anterior?”

Não antecipar os resultados nem culpar participantes. O primeiro recurso ter bom desempenho não garante a entrega final. Avaliar aprendizagem pela explicação dos resultados, não pela quantidade de lotes obtida.

## 14. Ordem de implementação e instruções para IA

1. Ler instruções do repositório; identificar componentes reutilizáveis e registrar decisões relevantes em `docs/decisions.md`.
2. Implementar domínio e RNG com exemplos manuais e invariantes.
3. Implementar preparação, controller e controles de turno/rodada.
4. Integrar PixiJS, tabela acessível, métricas e gráficos.
5. Implementar persistência, recuperação, importação/exportação e comparação.
6. Executar verificações, script estatístico e inspeção visual. Corrigir desvios antes de declarar pronto para piloto.

Não ampliar esta entrega para experimentos de melhoria. Não importar as regras de carga, restrição fixa, fadiga ou cronômetro contínuo da trilha. Não criar dependências, backend ou LLM sem uso previsto. Não alterar o motor da trilha para acomodar este módulo.

Entregar resumo das mudanças, comandos executados, resultados reais de testes/estatísticas, instruções de uso e limitações. Não afirmar que houve validação pedagógica com pessoas se apenas testes automatizados foram executados. Não publicar deploy sem solicitação específica.

## 15. Base conceitual e decisões de produto

Referência conceitual: Goldratt e Cox, *A Meta*, capítulo 14; a paginação varia por edição. Na conversa, foi consultada uma transcrição em inglês desse capítulo. Não houve auditoria integral de uma edição portuguesa.

Fontes consultadas:

- Transcrição do trecho: https://agoalbook.wordpress.com/2013/03/07/the-goal-chapter-14-page-112-121/
- Apresentação do exercício pela Goldratt Research Labs: https://www.goldrattresearchlabs.com/simulators

A aplicação usa regras e explicações próprias, sem reproduzir diálogos, imagens ou texto extenso do livro. Cinco etapas, dado 1–6 e processamento sequencial fundamentam o exercício narrado. Temática aeronáutica, nomes dos setores, lotes padronizados, dias simulados, escolha de 4–12 etapas, horizontes selecionáveis, reprodução determinística, interface e persistência são decisões desta adaptação. Tigelas e fósforos aparecem somente na explicação da origem do exercício; não são a apresentação principal do produto.

Não transportar percentuais promocionais de simuladores externos para os critérios de aceite. O que precisa ser fiel é o mecanismo de dependência, disponibilidade de material e variação de capacidade, não uma saída numérica predeterminada.
