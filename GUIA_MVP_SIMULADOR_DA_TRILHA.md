# Guia de desenvolvimento — MVP Simulador da Trilha

Versão: 1.0 · Data: 20/09/2026 · Idioma do produto: português do Brasil

Público: produto, desenvolvimento e assistentes de IA utilizados na implementação.

## 1. Objetivo e decisões de produto

Construir um jogo web cooperativo para treinamentos sobre Teoria das Restrições, inspirado na caminhada dos escoteiros de *A Meta*, de Eliyahu M. Goldratt e Jeff Cox. Os participantes organizam uma fila, observam o efeito da variabilidade e das dependências e redistribuem mochilas para melhorar o desempenho coletivo.

O produto deve permitir experimentar, comparar e explicar decisões. A métrica principal é o tempo para **todos** chegarem ao destino. A chegada do primeiro e a velocidade média individual não representam, isoladamente, sucesso.

Decisões confirmadas:

- Next.js com App Router, React e TypeScript.
- PixiJS para a trilha e os personagens desde o MVP.
- Treinamento presencial com tela compartilhada e um operador.
- Seis personagens fixos por cenário; participantes escolhem qual personagem representar.
- Decisões coletivas entre tentativas; caminhada automática durante cada tentativa.
- Ordem da fila, distribuição de carga e comparação de resultados como mecânicas centrais.
- Motor determinístico, independente da renderização.
- Persistência local; sem contas, banco de dados ou multiplayer online no MVP.

Os parâmetros numéricos deste documento são **valores iniciais de projeto**, sujeitos à calibração. Não foram extraídos do livro nem representam fisiologia humana validada. Este documento especifica uma adaptação didática, não uma reprodução literal de páginas ou diálogos.

## 2. Resultado pedagógico esperado

Ao terminar, os participantes devem conseguir explicar:

1. Por que capacidades individuais altas não garantem bom resultado coletivo.
2. Como variações de ritmo interagem com a impossibilidade de ultrapassar.
3. Por que um atraso exige capacidade disponível para ser recuperado.
4. A diferença entre reduzir a dispersão da fila e aumentar sua capacidade de avanço.
5. Por que aliviar a restrição pode ter mais efeito do que melhorar alguém já suficientemente rápido.
6. Como uma redistribuição excessiva pode criar uma nova restrição.

Não ensinar uma regra universal de colocar o recurso mais lento na primeira etapa de uma fábrica. A trilha permite reorganizar pessoas; processos produtivos frequentemente têm precedências físicas fixas. O facilitador deve explicitar esse limite da analogia.

Não identificar automaticamente “quem mais espera” como a restrição. Um personagem rápido pode passar muito tempo limitado por alguém à frente. A interface deve separar capacidade estimada, avanço observado e limitação pela fila.

## 3. Escopo

### 3.1 Incluído

- Uma trilha 2D com distância configurada pelo cenário.
- Seis avatares com nome, cor, ícone, ritmo base, carga e variabilidade.
- Nome/apelido opcional do participante associado a cada avatar.
- Ordenação por arrastar e soltar e alternativa por botões de posição.
- Transferência de itens de mochila entre personagens, quando liberada pela etapa.
- Campo de hipótese antes de iniciar, opcional e com até 500 caracteres.
- Iniciar, pausar, continuar, avançar um intervalo e alterar velocidade de reprodução.
- Reiniciar como nova tentativa preservando o histórico concluído.
- Painel ao vivo, resultados, comparação de até três tentativas e histórico de até 20.
- Mesmas condições aleatórias em tentativas comparáveis.
- Modo guiado e cenário de transferência de aprendizado.
- Gravação local de configurações e resultados; exportação/importação de sessão em JSON.
- Tela com perguntas para discussão e explicações derivadas das métricas.

### 3.2 Fora do MVP

- Energia, fadiga acumulada, corrida, alimentação e recuperação por descanso.
- Política editável de ritmo, paradas programadas e mudanças de estratégia no meio da trilha.
- Clima, terrenos com física própria, acidentes e eventos narrativos aleatórios.
- Troca/exclusão de personagens para remover o integrante de menor capacidade.
- Controle manual contínuo de cada personagem.
- Salas online, WebSockets, votação pelo celular, contas e ranking público.
- IA/LLM durante a partida, diálogos gerados e análise remota de dados.
- Relatórios PDF, integrações corporativas e telemetria externa.
- PWA/offline garantido, editor completo de cenários e simulação de fábrica ou CCPM.
- 3D, física de colisões realista e animação artística complexa.

Pausar a reprodução serve à discussão: congela o relógio simulado e não representa descanso. A mudança de velocidade de reprodução também não altera o ritmo dos personagens.

## 4. Jornada de uso

1. Facilitador abre o aplicativo e inicia uma sessão.
2. Grupo recebe o objetivo, escolhe representantes e organiza a fila.
3. Grupo registra, se desejar, a hipótese da tentativa.
4. Operador inicia a caminhada; grupo observa posições, espaços e limitações.
5. Operador pode pausar para discussão, sem alterar a configuração em execução.
6. Quando todos chegam, a aplicação registra o resultado automaticamente.
7. Grupo cria nova tentativa, altera decisões permitidas e repete o cenário.
8. Aplicação compara resultados e apresenta perguntas para discussão.
9. Grupo aplica o aprendizado em um segundo cenário.

### 4.1 Etapas guiadas

| Etapa | Decisões permitidas | Condições preservadas | Pergunta principal |
| --- | --- | --- | --- |
| 1 — Observar | Ordem inicial da fila | Elenco, carga inicial e seed do cenário A | Onde os espaços aparecem e o que limita o conjunto? |
| 2 — Reorganizar | Alterar a ordem | Mesmos pesos, capacidades e seed da etapa 1 | A fila ficou mais compacta? O tempo mudou? |
| 3 — Redistribuir | Ordem e transferência de carga | Mesmos itens totais, capacidades e seed | Qual redistribuição melhora a chegada de todos? |
| 4 — Transferir | Ordem e carga no cenário B | Novo cenário, explicitamente identificado | A estratégia funciona quando a restrição muda? |

Cada etapa aceita novas tentativas. A primeira execução concluída da etapa 1 vira a referência inicial. O operador avança de etapa manualmente; não há desbloqueio por pontuação.

Comparar duas mudanças simultâneas não isola a causa. O painel deve listar o que mudou e o facilitador pode pedir que a equipe altere uma variável por vez.

## 5. Regras funcionais

| ID | Regra obrigatória |
| --- | --- |
| R01 | Todos os seis personagens devem participar exatamente uma vez. |
| R02 | A ordem permanece fixa durante uma execução, inclusive pausada. |
| R03 | Ninguém ultrapassa o personagem imediatamente à frente. |
| R04 | O personagem da frente não é limitado por alguém atrás; espaços podem surgir. |
| R05 | A velocidade depende de capacidade base, carga e variação do período. |
| R06 | Não há bônus de liderança nem penalidade especial associada ao nome ou ID de um personagem. |
| R07 | Cada item tem um único dono; nenhum item pode desaparecer ou ser duplicado. |
| R08 | Redistribuição acontece apenas na preparação e respeita o limite de carga. |
| R09 | Recuperar espaço exige caminhar mais rápido que o avanço de quem está à frente. |
| R10 | A execução termina apenas quando todos chegam, ou atinge o limite de tempo simulado. |
| R11 | Uma nova tentativa começa com todos na origem e tempo zero. |
| R12 | Configuração e resultado de tentativas concluídas são imutáveis. |
| R13 | Personagens, condições e seed são preservados nas comparações controladas. |
| R14 | Alterar FPS, tamanho da janela ou velocidade de reprodução não altera o resultado. |
| R15 | Nenhum código deve conter uma condição do tipo “se personagem X estiver na frente, melhorar resultado”. |

O jogo não exige fila compacta para aceitar a chegada. Dispersão é uma métrica de diagnóstico, não uma penalidade arbitrária adicionada ao tempo.

## 6. Cenários e parâmetros iniciais

### 6.1 Cenário A — Trilha inicial

Distância: 3.000 m. Terreno uniforme. Seed padrão: `trilha-a-001`. Passo de simulação: 1 s. Bloco de variabilidade: 30 s. Limite da execução: 14.400 s simulados.

| ID | Nome inicial editável | Ritmo sem carga (km/h) | Carga de referência (kg) | Carga inicial (kg) | Variabilidade relativa |
| --- | --- | ---: | ---: | ---: | ---: |
| p1 | Caminhante 1 | 4,8 | 12 | 6 | 0,20 |
| p2 | Caminhante 2 | 4,6 | 12 | 6 | 0,20 |
| p3 | Caminhante 3 | 5,0 | 14 | 6 | 0,20 |
| p4 | Caminhante 4 | 4,7 | 10 | 6 | 0,20 |
| p5 | Caminhante 5 | 4,5 | 6 | 18 | 0,20 |
| p6 | Caminhante 6 | 4,9 | 12 | 6 | 0,20 |

Ordem inicial sugerida: `p1, p2, p5, p3, p4, p6`, da frente para trás. Os jogadores podem alterá-la na preparação.

Cada mochila contém inicialmente unidades de suprimentos de 1 kg, cada uma com ID exclusivo. Total: 48 itens e 48 kg. A interface pode agrupar a exibição por quantidade; o domínio preserva cada item. Transferir 1, 3 ou todos os itens selecionados pode ser feito por um único controle.

Carga de referência é um parâmetro do modelo, não limite médico. Carga máxima permitida: três vezes a carga de referência. O personagem p5 começa exatamente no limite de 18 kg.

### 6.2 Cenário B — Transferência de aprendizado

Mesma distância, velocidades base, variabilidade e total de 48 kg. Seed: `trilha-b-001`. Alterações: carga de referência de p2 passa a 6 kg; de p5 passa a 12 kg. Cargas iniciais de p2 e p5 passam a 18 kg e 6 kg, respectivamente. Demais cargas: 6 kg.

Ordem inicial sugerida: `p3, p1, p4, p2, p6, p5`. O objetivo é impedir que a equipe memorize um nome ou uma posição como solução.

Comparações A × B devem ser identificadas como cenários diferentes e não receber percentual de melhoria controlada.

### 6.3 Calibração antes do piloto

Os cenários são configurações versionadas no código. Validar, sem alterar as regras por personagem, que:

- A configuração inicial produz espaços observáveis na trilha.
- Reorganizar a ordem pode mudar dispersão e limitação, sem necessariamente reduzir muito o tempo.
- Aliviar a carga do personagem restritivo pode melhorar o tempo coletivo.
- Transferir peso demais para outro pode deslocar a restrição.
- O efeito não depende de uma única seed conveniente.

Avaliar as estratégias em um conjunto fixo de pelo menos 20 seeds durante a calibração e registrar mediana e faixa de tempos. Isso é validação de desenvolvimento; não exige um modo de Monte Carlo na interface do MVP. Se os efeitos não aparecerem, revisar parâmetros e documentar a mudança. Não inserir recompensas artificiais para obter a conclusão desejada.

## 7. Modelo da simulação

### 7.1 Unidades e simplificações

- Tempo interno: segundos; posição: metros; velocidade: metros/segundo.
- Exibir velocidade em km/h e converter por `kmh / 3.6`.
- Posição lógica é unidimensional, entre zero e a distância total.
- Todos iniciam em `x = 0`. Empate de posições é permitido; ultrapassagem não.
- O desenho separa os avatares visualmente quando necessário, sem alterar as posições do motor.
- Peso afeta velocidade; não existe um estado de energia no MVP.
- Cálculos usam precisão completa; arredondar somente na apresentação.

### 7.2 Velocidade disponível

Para personagem `i`, no início do tick `t`:

```text
carga_i = soma dos pesos dos itens atribuídos a i
fator_carga_i = 1 / (1 + 0.20 × carga_i / carga_referencia_i)
bloco = floor(t / 30)
u_i = aleatorioDeterministico(seed, id_i, bloco)  // intervalo [0, 1)
fator_variacao_i = 1 + variabilidade_i × (2 × u_i - 1)
velocidade_disponivel_i = (ritmo_base_kmh_i / 3.6)
                         × fator_carga_i × fator_variacao_i
```

Exemplo sem variação: p5 com 18 kg tem `4,5 / (1 + 0,20 × 18/6) = 2,8125 km/h`. Com 6 kg, passa a `3,75 km/h`. O ganho decorre da fórmula comum a todos.

A variação permanece constante durante cada bloco de 30 s e é independente por personagem. Não sortear a cada frame, a cada clique ou em função da posição na fila.

### 7.3 Aleatoriedade reproduzível

Implementar uma função pura de hash de 32 bits versionada, por exemplo FNV-1a com mistura final, sobre uma chave serializada sem ambiguidades: `JSON.stringify([seed, characterId, blockIndex])`. Fixar algoritmo e vetores de teste no repositório. Converter o inteiro sem sinal para `[0, 1)` dividindo por `2 ** 32`.

O algoritmo é didático, não criptográfico. Não usar `Math.random()`, horário do sistema, ordem de iteração de objetos ou sorteios globais sequenciais para calcular variações.

Consequência exigida: mudar p5 da terceira para a primeira posição preserva sua sequência de variações nos mesmos instantes simulados. Sua carga pode mudar sua velocidade final, mas não o sorteio recebido.

### 7.4 Avanço e dependência

Usar passos fixos de 1 s. Primeiro calcular a velocidade disponível de todos usando o estado anterior. Depois resolver as novas posições da frente para trás:

```text
para cada personagem i, na ordem da frente para trás:
    alvo_livre = min(distancia_total, posicao_anterior_i + velocidade_i × dt)

    se i é o primeiro:
        posicao_nova_i = alvo_livre
    senão:
        posicao_nova_i = min(alvo_livre, posicao_nova_do_personagem_a_frente)

    avanco_i = posicao_nova_i - posicao_anterior_i
```

O uso da **nova posição** de quem está à frente é intencional: permite seguir seu movimento no mesmo tick, sem impor um atraso artificial de 1 s por personagem. É uma aproximação discreta da caminhada, não uma física contínua de corpos.

Nunca limitar todos diretamente à menor velocidade instantânea do grupo: isso apagaria a formação e recuperação dos espaços.

Chegada individual é registrada uma única vez no fim do tick em que a posição alcança o destino. Resolução dos tempos: 1 s. Personagens que chegaram permanecem no destino e deixam de acumular métricas de limitação. Quando o último chega, registrar conclusão antes de verificar timeout; assim, uma chegada exatamente no limite é válida.

### 7.5 Relógio e reprodução

- Velocidade padrão: 30 segundos simulados por segundo real.
- Opções: 10, 30 e 60 segundos simulados por segundo real; indicar unidades na interface.
- “Avançar 30 s” executa exatamente 30 ticks, ou até concluir, somente quando pausado.
- Animação interpola estados; não cria novos estados físicos.
- Usar acumulador de tempo real para decidir quantos ticks executar.
- Não mudar `dt` para acelerar. Uma execução rápida percorre os mesmos ticks.
- Limitar trabalho por frame e manter o saldo do acumulador; não descartar ticks silenciosamente.
- Ao ocultar a aba, pausar automaticamente e descartar a duração real em segundo plano. Retomar exige ação do operador.
- Se o computador não acompanhar, a reprodução pode ficar mais lenta em tempo real; o resultado simulado permanece igual.

### 7.6 Estados da execução

Estados: `ready`, `running`, `paused`, `completed`, `timed_out`, `aborted`.

| Estado | Ações válidas |
| --- | --- |
| ready | Editar preparação, iniciar e carregar configuração anterior |
| running | Pausar, mudar reprodução e abandonar tentativa |
| paused | Continuar, avançar 30 s, mudar reprodução e abandonar tentativa |
| completed / timed_out | Ver resultado, comparar e criar nova tentativa |
| aborted | Criar nova tentativa; não tratar como resultado concluído |

Reiniciar uma execução ativa exige confirmação de descarte do progresso. Criar nova tentativa a partir de uma concluída não altera a anterior. Recarregar a página não promete retomar uma execução em andamento: preservar configuração e histórico e informar a interrupção.

## 8. Métricas e comparação

### 8.1 Métricas obrigatórias

| Métrica | Definição |
| --- | --- |
| Tempo total | Tempo simulado em que o último personagem chega; nulo em timeout/abandono |
| Progresso coletivo | `min(posicoes) / distancia_total × 100` |
| Chegadas individuais | Primeiro tick em que cada personagem alcança o destino |
| Dispersão instantânea | `max(posicoes) - min(posicoes)`, em metros |
| Dispersão máxima | Maior dispersão ao longo de todos os ticks |
| Dispersão média | Soma da dispersão ao final de cada tick dividida pelos ticks executados |
| Tempo limitado pela fila | Soma de `dt` quando `posicao_nova < alvo_livre - epsilon`, apenas antes de chegar |
| Tempo parado pela fila | Subconjunto limitado pela fila em que o avanço é menor que epsilon |
| Velocidade efetiva do tick | Avanço real do personagem dividido por `dt` |
| Carga por personagem | Soma dos itens na configuração da tentativa |

Usar `epsilon = 1e-9 m` para comparações numéricas internas. Não chamar “tempo limitado” de “tempo parado”: o personagem pode continuar andando, apenas abaixo da sua capacidade disponível.

Também calcular tempo equivalente perdido por limitação: `(alvo_livre - posicao_nova) / velocidade_disponivel`, somado por tick, quando a velocidade for positiva. É diagnóstico auxiliar; não deve ser confundido com duração total do projeto ou desperdício econômico.

A dispersão final tende a zero porque todos terminam no mesmo ponto. Mostrar dispersão máxima/média, e não apenas a foto do final.

### 8.2 Comparação entre tentativas

Exibir até três tentativas lado a lado com ordem, cargas, hipótese, tempo total e dispersão. Mostrar diferenças de configuração explicitamente.

Comparação controlada exige igualdade de: versão do motor, cenário e revisão, elenco e atributos, itens e pesos totais, distância, seed, variabilidade e passo de tempo. Ordem e dono dos itens podem mudar. Nomes dos participantes e velocidade de reprodução não influenciam a comparabilidade.

Percentual de melhoria: `(tempo_referencia - tempo_atual) / tempo_referencia × 100`. Positivo significa redução de tempo. Só calcular se ambas as tentativas foram concluídas e são comparáveis. Para timeout, mostrar progresso alcançado e status, sem inventar um tempo de conclusão.

Não criar pontuação composta que esconda o conflito entre tempo e dispersão. O tempo total é o objetivo principal; dispersão e limitação explicam o resultado.

### 8.3 Perguntas para discussão

- Qual era a hipótese e o que os resultados sustentam?
- Quem tinha capacidade disponível, mas não conseguia utilizá-la?
- A mudança reduziu dispersão, tempo ou ambos?
- Onde retirar carga ajudou mais? Onde acrescentá-la criou um novo problema?
- O que essa situação representa no trabalho e onde a analogia deixa de valer?

Feedback automático usa templates e valores calculados. Exemplo: “O tempo caiu X%, enquanto a dispersão máxima aumentou Y m”. Não atribuir causalidade a uma mudança isolada quando várias foram feitas e não declarar “solução ótima” sem prova.

## 9. Interface e direção visual

### 9.1 Organização da tela

- Cabeçalho: cenário, etapa, objetivo e estado da tentativa.
- Painel de preparação: avatares ordenáveis, características, mochilas e hipótese.
- Área central PixiJS: trilha, personagens, origem, destino e marcadores de distância.
- Barra de execução: iniciar/pausar/continuar, avanço de 30 s e reprodução.
- Painel de indicadores: relógio simulado, progresso do último e dispersão.
- Área de resultados: comparação, detalhes por personagem e perguntas.

Desktop é o alvo principal, incluindo projeção em 1366 × 768 e 1920 × 1080. Em telas menores, empilhar painéis mantendo acesso aos controles; experiência completa em celular não é requisito do MVP.

### 9.2 Visual PixiJS

- Estilo 2D simples e consistente, com avatares próprios, mochilas e cenário discreto.
- Trilha com percurso visual mapeado a uma distância lógica única.
- Posição no desenho calculada por distância percorrida ao longo do caminho, sem atalhos em curvas.
- Nomes, ícones e cores distinguem personagens; cor nunca é o único identificador.
- Microanimação de caminhada proporcional ao movimento observado, sem efeito no motor.
- Separação de rótulos/avatares sobrepostos é apenas visual; mostrar distância numérica ao selecionar.
- Ao chegar, representar os personagens em área de chegada sem mudar os resultados.
- Câmera e escala devem permitir ver o grupo e seus espaços; evitar zoom automático que esconda a dispersão.

Controles e textos principais ficam em HTML/React, com navegação por teclado e foco visível. Oferecer tabela textual equivalente às posições e indicadores. Respeitar preferência de redução de movimento. Não depender de áudio.

## 10. Arquitetura técnica

### 10.1 Stack

| Responsabilidade | Tecnologia/decisão |
| --- | --- |
| Aplicação web | Next.js App Router + React + TypeScript em modo strict |
| Renderização da trilha | PixiJS, integração direta e isolada em componente cliente |
| Interface | Tailwind CSS + shadcn/ui |
| Estado de aplicação | Store pequeno, preferencialmente Zustand, sem gravar cada frame no React |
| Contratos e importação | Zod ou validação equivalente já adotada pelo projeto |
| Motor | TypeScript puro, sem dependências de React, PixiJS ou navegador |
| Persistência | localStorage por adaptador versionado |
| Testes de domínio | Vitest |
| Fluxos essenciais | Playwright |

Fixar versões estáveis compatíveis no início da implementação e commitar o lockfile. Não atualizar dependências automaticamente durante uma entrega. Escolher o Node.js suportado pela versão efetivamente adotada do Next.js. As referências PixiJS consultadas são da linha 8; não misturar snippets de APIs de versões diferentes.

Vitest é apenas a ferramenta de teste; a aplicação usa Next.js, não Vite.

### 10.2 Fronteiras

1. **Domínio:** cenário, regras, PRNG, avanço, métricas e invariantes.
2. **Aplicação:** criação de tentativas, execução, comparação e persistência.
3. **Apresentação React:** controles, formulários, tabelas e mensagens.
4. **Renderizador PixiJS:** transforma snapshots em elementos visuais.

O motor é a única fonte de verdade para posições e resultados. PixiJS não resolve regra, peso, aleatoriedade ou chegada. React não calcula física em efeitos ligados a renderizações.

O loop de execução pode permanecer no cliente, desacoplado do renderizador. Publicar snapshots para HUD a até 10 Hz e renderizar o canvas na cadência disponível. Atualizações finais e ações do usuário devem refletir imediatamente.

### 10.3 Integração Next.js/PixiJS

- Manter shell/página compatível com renderização do servidor.
- Colocar a experiência interativa em Client Component.
- Carregar o componente do canvas dinamicamente com `ssr: false` a partir de um Client Component.
- Acessar `window`, `document`, WebGL e localStorage apenas no cliente.
- Criar a aplicação PixiJS uma vez por montagem e aguardar sua inicialização assíncrona.
- Proteger a inicialização contra desmontagem antes da resolução da promise.
- No cleanup, remover listeners, ticker, canvas e recursos possuídos pela instância.
- Garantir funcionamento sob React Strict Mode, sem canvas ou loop duplicado.
- Usar resize do contêiner sem recriar motor ou reiniciar tentativa.
- Se o renderizador falhar, preservar histórico e exibir erro acionável; nunca deixar tela vazia.

Essas decisões seguem as fronteiras de cliente/servidor e o carregamento dinâmico documentados pelo Next.js e o ciclo de inicialização da aplicação PixiJS. Ver referências ao final.

### 10.4 Organização sugerida

| Caminho | Responsabilidade |
| --- | --- |
| `src/app/page.tsx` | Entrada da aplicação |
| `src/features/trail/domain/types.ts` | Tipos do domínio |
| `src/features/trail/domain/engine.ts` | Passos da simulação |
| `src/features/trail/domain/random.ts` | Aleatoriedade determinística |
| `src/features/trail/domain/metrics.ts` | Acumuladores e resultados |
| `src/features/trail/domain/validation.ts` | Invariantes e configuração |
| `src/features/trail/scenarios/` | Cenários versionados |
| `src/features/trail/application/` | Controller, comparação e store |
| `src/features/trail/rendering/` | Aplicação PixiJS, avatares e mapa da trilha |
| `src/features/trail/components/` | Preparação, HUD, resultados e histórico |
| `src/features/trail/persistence/` | Serialização, localStorage e migração |
| `public/trail/` | Assets locais |
| `tests/` | Testes do motor e fluxos do usuário |

Não criar serviços remotos, API routes, Server Actions, Prisma ou Postgres sem uma necessidade que entre explicitamente no escopo.

## 11. Contratos de dados

Os tipos abaixo definem o contrato mínimo. Acrescentar campos operacionais sem alterar o significado das regras.

```ts
type CharacterId = string;
type ItemId = string;

interface CharacterDefinition {
  id: CharacterId;
  displayName: string;
  baseSpeedKmh: number;
  referenceLoadKg: number;
  maxLoadKg: number;
  variability: number;
}

interface SupplyItem {
  id: ItemId;
  label: string;
  weightKg: number;
}

interface Scenario {
  id: string;
  revision: number;
  distanceM: number;
  timeLimitSec: number;
  variabilityBlockSec: 30;
  characters: CharacterDefinition[];
  items: SupplyItem[];
  initialOrder: CharacterId[];
  initialOwnerByItem: Record<ItemId, CharacterId>;
  defaultSeed: string;
}

interface AttemptConfig {
  engineVersion: string;
  scenario: Scenario; // snapshot completo, sem referência mutável
  seed: string;
  order: CharacterId[];
  ownerByItem: Record<ItemId, CharacterId>;
  participantByCharacter: Partial<Record<CharacterId, string>>;
  hypothesis: string;
  guidedStage: 1 | 2 | 3 | 4;
  tickSec: 1;
}

interface CharacterState {
  id: CharacterId;
  positionM: number;
  availableSpeedMps: number;
  actualSpeedMps: number;
  arrivalTimeSec: number | null;
  limitedTimeSec: number;
  stoppedByQueueTimeSec: number;
  equivalentLostTimeSec: number;
}

interface SimulationState {
  elapsedSec: number;
  characters: Record<CharacterId, CharacterState>;
  maxSpreadM: number;
  sumSpreadM: number;
  ticksExecuted: number;
  status: 'running' | 'completed' | 'timed_out';
}

interface AttemptResult {
  id: string;
  createdAt: string; // metadado; nunca participa da física
  config: AttemptConfig;
  outcome: 'completed' | 'timed_out';
  finalState: SimulationState;
  totalTimeSec: number | null;
  meanSpreadM: number;
}
```

Estado de execução da UI (`ready`, `paused`, `aborted` etc.) pertence ao controller. O motor não conhece pausa de apresentação. Configurações em edição, snapshots de tentativas e estado ativo devem ser objetos separados para evitar mutação retroativa.

API mínima do domínio:

```ts
validateConfig(config: AttemptConfig): ValidationResult;
createInitialState(config: AttemptConfig): SimulationState;
step(config: AttemptConfig, state: SimulationState): SimulationState;
runToEnd(config: AttemptConfig): SimulationState;
finalizeResult(config: AttemptConfig, state: SimulationState): ResultMetrics;
compareAttempts(a: AttemptResult, b: AttemptResult): ComparisonResult;
```

`step` avança exatamente um tick e não muta suas entradas. `runToEnd` é útil para teste e calibração; não deve bloquear a interface durante a animação. Definir os tipos auxiliares no módulo correspondente.

### 11.1 Validação obrigatória

- Ordem contém exatamente os IDs do elenco, sem duplicações.
- Todos os itens têm um dono válido e aparecem exatamente uma vez.
- Velocidades, referências de carga e limites são positivos e finitos.
- Variabilidade está entre 0 e 0,5; pesos são positivos e finitos.
- Carga calculada não supera o limite individual.
- Distância e limite de tempo são positivos; tick e bloco seguem a versão do motor.
- Não aceitar valores `NaN`, `Infinity`, IDs estranhos ou versões incompatíveis.
- Validar permissões da etapa na aplicação, além da validade física no domínio.

## 12. Persistência e intercâmbio

- Chave local sugerida: `trail-mvp:session:v1`.
- Payload inclui `schemaVersion`, versão do motor, cenário atual, preparação e até 20 resultados.
- Salvar após mudanças confirmadas na preparação e ao concluir uma execução; nunca a cada frame.
- Não persistir texturas, objetos PixiJS, DOM, callbacks ou estado derivado da tela.
- Armazenar snapshots de configuração e métricas finais; não é necessário guardar todos os ticks.
- Exportar sessão em JSON com nome legível; importar por seleção de arquivo.
- Limite inicial de importação: 2 MiB. Validar schema e invariantes antes de substituir a sessão.
- Mostrar resumo da importação e confirmar a substituição dos dados locais existentes.
- Payload desconhecido/corrompido não deve apagar dados válidos. Oferecer mensagem clara.
- Ao atingir 20 resultados, solicitar exportação ou exclusão seletiva para continuar armazenando; não descartar silenciosamente.
- Se localStorage estiver indisponível/cheio, manter a sessão em memória e oferecer exportação, com aviso de que o histórico não será preservado no navegador.
- Dados locais não são sincronizados entre computadores. Nome de participante é opcional.
- Importar resultados de versão incompatível apenas para leitura, se houver suporte explícito; no MVP, rejeitar com mensagem clara e manter a sessão atual.

## 13. Critérios de aceite e verificação

Testar o domínio porque ele sustenta o aprendizado; evitar testes que apenas reproduzam detalhes internos de componentes.

| ID | Critério verificável |
| --- | --- |
| AC01 | Aplicação abre em desktop, permite preparar seis personagens e iniciar sem login. |
| AC02 | Nenhum personagem ultrapassa seu predecessor em nenhum tick. |
| AC03 | Redistribuir itens preserva IDs e peso total; sobrecarga bloqueia início. |
| AC04 | Com seed e configuração iguais, duas execuções produzem estados finais e métricas iguais. |
| AC05 | Alterar ordem não altera os sorteios associados ao mesmo personagem/bloco. |
| AC06 | Execução animada em velocidades diferentes coincide com `runToEnd`. |
| AC07 | Pausar por tempo real arbitrário não altera tempo simulado nem resultado. |
| AC08 | Redimensionar e ocultar/retomar a aba não muda o resultado para o mesmo número de ticks. |
| AC09 | Tempo total só aparece quando todos chegam; timeout é identificado separadamente. |
| AC10 | Histórico permanece após recarregar; falha de persistência é comunicada. |
| AC11 | Comparação mostra o que mudou e não calcula ganho controlado entre cenários/seeds diferentes. |
| AC12 | Reordenar e redistribuir são possíveis por teclado, sem depender de drag-and-drop. |
| AC13 | Montar/desmontar a experiência repetidamente não duplica canvas, listeners ou loop. |
| AC14 | Não existe bônus por posição/nome; os resultados derivam do mesmo motor. |
| AC15 | Cenários A e B permitem discutir restrição, dispersão e redistribuição com resultados observáveis. |

### 13.1 Casos mínimos do motor

- Um personagem isolado, sem variação: chegada em `ceil(distancia / velocidade_efetiva)` segundos.
- Dois personagens com a mesma velocidade e sem variação: avançam juntos, sem atraso artificial por ordem de atualização.
- Dois personagens, rápido à frente e lento atrás: surge espaço.
- Dois personagens, lento à frente e rápido atrás: não há ultrapassagem; o rápido acumula tempo limitado.
- Personagem perto do destino: o corte por chegada não conta como limitação pela fila.
- Duas distribuições de mochila: verificar fórmula, conservação e limites.
- Carga zero e carga máxima: resultados finitos, positivos e coerentes.
- Última chegada exatamente no limite: status concluído.
- Timeout antes de todos chegarem: tempo total nulo e progresso parcial válido.
- Configuração inválida, importação corrompida e versão incompatível: falha controlada.

Usar pelo menos um resultado calculável manualmente como referência; não aprovar o motor apenas porque ele coincide consigo mesmo em duas funções.

### 13.2 Verificação de integração

Um fluxo automatizado deve cobrir: preparar → concluir → alterar ordem → concluir → comparar → recarregar → recuperar histórico. Outro cobre pausa/continuação e importação inválida. Fazer inspeção visual da projeção, rótulos e sobreposição com os seis avatares juntos e separados.

## 14. Plano de implementação

| Entrega | Conteúdo | Condição para avançar |
| --- | --- | --- |
| 1 — Domínio | Tipos, validação, cenários, RNG, motor e métricas | Casos manuais e invariantes passam sem UI |
| 2 — Preparação | Página Next.js, elenco, ordem, mochilas e hipótese | Configuração válida chega ao motor; inválida é bloqueada |
| 3 — Simulação visual | PixiJS, trilha, avatares, relógio e controles | Resultado visual coincide com execução sem renderização |
| 4 — Aprendizado | Etapas guiadas, resultados e comparação | Mudanças e limites de comparação ficam explícitos |
| 5 — Persistência | Histórico, JSON e recuperação de erros | Dados válidos preservados e importação inválida rejeitada |
| 6 — Piloto | Calibração, acessibilidade e teste com grupo | Participantes explicam os efeitos usando seus resultados |

Não estimar sucesso pela qualidade artística. O MVP está pronto para piloto quando as decisões funcionam, o modelo é reproduzível e a comparação sustenta a discussão.

## 15. Instruções para desenvolvimento com IA

Este documento é a referência funcional. Assistentes de código devem:

1. Ler as regras do repositório e este guia antes de propor alterações.
2. Implementar uma entrega de cada vez, preservando as fronteiras do domínio.
3. Declarar suposições novas e registrar decisões relevantes em `docs/decisions.md`.
4. Não incluir funcionalidades fora do MVP por iniciativa própria.
5. Não substituir Next.js ou PixiJS nem acrescentar backend sem mudança explícita de escopo.
6. Implementar fórmulas, unidades, aleatoriedade e critérios de chegada antes de melhorar animações.
7. Não inventar resultados, percentuais de melhoria ou personagens com comportamento especial.
8. Não usar FPS, `Date.now()` ou sorteios não reproduzíveis na física.
9. Não interpretar a câmera, a posição de um sprite ou uma animação como estado do domínio.
10. Não apresentar fadiga/energia como implementada enquanto estiver fora do modelo.
11. Atualizar versão do motor quando mudar fórmula, RNG, passo ou semântica de métricas; atualizar revisão do cenário quando mudar seus dados.
12. Entregar alterações com resumo do comportamento, verificações realizadas e limitações reais.

Prompt inicial sugerido:

> Leia este guia e as instruções do repositório. Implemente primeiro a entrega 1: domínio puro em TypeScript, cenários A/B, validação, aleatoriedade determinística, avanço com passo fixo e métricas. Verifique os critérios aplicáveis com casos calculáveis manualmente. Não implemente bônus por personagem, física vinculada a frames, energia, backend ou multiplayer. Registre decisões novas e mantenha o contrato pronto para integração posterior com Next.js e PixiJS.

## 16. Evoluções após validar o MVP

- Energia e fadiga com modelo próprio, regras transparentes e calibração separada.
- Ritmo planejado, paradas e intervenções em pontos de decisão com custo explícito.
- Comparação estatística de múltiplas seeds na interface.
- Salas com participantes em dispositivos diferentes, exigindo autoridade única de simulação no servidor.
- Turmas, contas e histórico centralizado, com banco de dados apenas nessa etapa.
- Outros contextos de treinamento, mantendo visíveis as diferenças entre trilha, produção e projetos.

Essas evoluções não devem criar campos, dependências ou telas sem uso no MVP.

## 17. Referências e limites de uso

- Goldratt, Eliyahu M.; Cox, Jeff. *A Meta*. Referência conceitual à caminhada, dependência, variabilidade e restrição. A paginação varia por edição; fórmulas e parâmetros deste guia são decisões do simulador.
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): fronteira entre servidor e cliente.
- [Next.js — Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading): carregamento do canvas no cliente.
- [PixiJS — Application](https://pixijs.com/8.x/guides/components/application): aplicação gráfica e inicialização.
- [PixiJS — Ticker](https://pixijs.com/8.x/guides/components/ticker): atualização visual; o relógio físico continua sob controle do motor.

Referências técnicas consultadas em 20/09/2026. Validar exemplos de API contra as versões fixadas no repositório. As fontes técnicas orientam a integração; não validam pedagogicamente os parâmetros propostos.
