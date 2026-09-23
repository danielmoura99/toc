# Evolução pedagógica — Simulador da Trilha

Data: 22/09/2026 · Revisão 1.1 · Especificação incremental para implementação com IA.

Revisão 1.1: adiciona energia/fadiga como quinta frente, com implementação obrigatória nesta entrega e ativação opcional durante o uso.

## 1. Objetivo e contexto

O MVP, o gerador de expedições com nomes e quantidade de participantes e os ajustes anteriores já foram implementados. Evoluir a experiência existente para que o grupo consiga identificar a provável restrição, distinguir diferenças de capacidade de flutuações e observar como os espaços se formam e se recuperam.

Esta entrega tem cinco frentes. Concluir e validar as quatro primeiras antes de implementar a quinta:

1. Diagnóstico explícito e fundamentado da restrição.
2. Experimento controlado com e sem variabilidade.
3. Melhor observação das velocidades, dependências e recuperação dos espaços.
4. Calibração dos cenários e validação das conclusões pedagógicas.
5. Energia e fadiga em um módulo opcional, com diagnóstico dinâmico e comparação própria.

Leia `AGENTS.md`, `GUIA_MVP_SIMULADOR_DA_TRILHA.md`, `AJUSTES_REVIEW_SIMULADOR_DA_TRILHA.md`, `docs/decisions.md` e os módulos envolvidos, quando presentes. O código atual e os documentos posteriores ao guia podem conter evoluções legítimas, como o elenco variável. Não restaurar o limite original de seis personagens nem a jornada antiga.

Este documento altera apenas os pontos explicitados abaixo. Reutilize Next.js, TypeScript, PixiJS, motor, histórico, gerador, controles e componentes atuais. Implemente as mudanças; não entregue apenas um plano. Não reescreva o MVP nem amplie a tarefa para as sugestões posteriores sobre paradas individuais, distribuição igual de mochilas ou novos exercícios socráticos.

## 2. Premissas que continuam válidas

- Objetivo principal: reduzir o tempo para todos chegarem. Fila compacta não garante menor tempo.
- Sem ultrapassagem; carga total conservada; limites de carga existentes preservados.
- Motor determinístico e independente de FPS, canvas, câmera e velocidade de reprodução.
- Mesma sequência aleatória por personagem e instante em tentativas equivalentes.
- Decisões de ordem e carga acontecem antes da execução.
- Pausar a reprodução congela o tempo simulado; não representa descanso.
- Variabilidade representa flutuação do ritmo. Energia representa uma reserva didática; fadiga é seu efeito acumulado sobre a capacidade, conforme a frente 5. A caminhada padrão mantém fadiga desligada.
- Alimentação, descanso, recuperação de energia, paradas individuais e intervenções durante a caminhada continuam fora do escopo.
- Não criar bônus por liderança, identidade do personagem ou estratégia escolhida.
- Não forçar melhora de tempo por reordenação, nem atribuir todos os espaços à aleatoriedade.
- Os parâmetros são uma adaptação didática, sem validação fisiológica ou equivalência literal com a fábrica do livro.

## 3. Frente 1 — Diagnóstico explícito da restrição

### 3.1 Separar três informações

Exibir um painel compacto, reaproveitando a tabela existente:

| Informação | Significado |
| --- | --- |
| Ritmo de referência com a carga | Capacidade calculada pela fórmula atual, sem flutuação e antes da limitação pela fila. |
| Velocidade disponível agora | Ritmo que o personagem poderia usar neste instante, com carga e flutuação. |
| Velocidade efetiva agora | Avanço realizado no tick dividido pelo tempo do tick, após as dependências. |

Usar km/h na apresentação. Não confundir ritmo base sem carga com ritmo de referência com carga. Reutilizar a função de cálculo do motor, evitando uma fórmula independente na UI.

### 3.2 Identificar uma candidata, sem fingir certeza

Na preparação, calcular o menor ritmo de referência com a carga atual. Exibir **“Provável restrição pela capacidade”**, com nome do participante, valor e explicação breve:

> “Com esta distribuição, Ana tem o menor ritmo de referência: 2,8 km/h. As flutuações e a dependência da fila também influenciam a execução.”

Regra inicial: incluir como candidatas todas as pessoas cujo ritmo de referência seja até 1% superior ao mínimo. Essa tolerância é uma decisão de apresentação, não uma lei da teoria; centralizá-la e registrá-la em `docs/decisions.md`. Quando houver mais de uma, mostrar **“Capacidades próximas: não há uma única candidata clara”**, com os nomes.

Essa análise não prova sozinha quem determina o tempo final sob variabilidade. Não usar “restrição confirmada” com base apenas nessa classificação.

Recalcular ao redistribuir carga. Reordenar sem mudar carga não muda essa estimativa inicial. Com fadiga ativa, acrescentar o diagnóstico durante a execução definido na frente 5; a ordem pode influenciar o esforço realizado e, portanto, a evolução da energia. Não escolher a candidata pelo maior tempo limitado, maior mochila em kg absolutos, último lugar na fila ou menor velocidade instantânea.

### 3.3 Evidência observada

Ao terminar, associar a estimativa às métricas existentes: tempo do grupo, ritmos, limitação pela fila e mudanças de carga. Um personagem rápido pode ficar muito limitado por outro; isso não o torna automaticamente a restrição.

Quando duas tentativas comparáveis tiverem conjuntos de candidatas diferentes, mostrar **“A provável restrição pela capacidade mudou”**, indicando antes/depois. Se houver empate ou sobreposição, mostrar a mudança dos candidatos sem afirmar uma substituição inequívoca.

Uma melhora após redistribuição é evidência do efeito daquela distribuição. Não atribuir causalidade exclusiva a uma pessoa quando várias cargas ou a ordem mudaram ao mesmo tempo.

### 3.4 Evitar antecipar a resposta

Durante a primeira caminhada da expedição, manter os dados observáveis, mas recolher o diagnóstico automático em “Ver diagnóstico”. Não marcar antecipadamente o personagem no canvas. Após a primeira conclusão, o painel pode ficar aberto por padrão. A revelação deve ser acessível por teclado e não modificar o motor ou liberar etapas.

## 4. Frente 2 — Experimento de variabilidade

### 4.1 Fluxo

Depois de concluir ao menos uma caminhada da expedição, disponibilizar **“Comparar com e sem variabilidade”** a partir de uma tentativa concluída sem fadiga. Nesta etapa, esse experimento mantém fadiga desligada nas duas condições para isolar o mecanismo. Se a tentativa selecionada tiver fadiga, orientar a seleção de uma referência sem fadiga, sem modificá-la silenciosamente.

Criar um experimento vinculado ao snapshot dessa tentativa, com duas condições:

- **Com variabilidade:** utilizar exatamente os parâmetros de variação registrados.
- **Sem variabilidade:** usar fator de variação igual a 1 para todos, mantendo os parâmetros originais no snapshot.

Preservar elenco, atributos, nomes, distância, ordem, itens, donos, cargas, seed, passo e demais regras. Não gerar outra expedição, redistribuir automaticamente ou procurar uma seed que produza uma diferença maior.

O usuário reproduz as condições sequencialmente no canvas existente. Exibir claramente a condição ativa e permitir os controles atuais de reprodução. Não criar duas simulações animadas simultâneas nem outra página complexa.

Se o resultado original for da condição padrão, íntegro e da versão compatível, reutilizá-lo na comparação; não duplicá-lo desnecessariamente. Reproduzi-lo visualmente pode exigir executar novamente o motor a partir do mesmo snapshot.

### 4.2 Regras de execução

- O modo sem variabilidade altera somente a aplicação do fator de flutuação, não o RNG, a fórmula de carga ou a atualização das posições.
- Não zerar permanentemente `variability` no cenário original nem editar resultados concluídos.
- Não permitir alternar a condição durante uma execução, inclusive pausada.
- O experimento não substitui a referência inicial da expedição nem avança/desbloqueia etapas por conta própria.
- Tentativa experimental é identificada como tal no histórico e conta para os limites de armazenamento existentes.
- Ao sair, a próxima tentativa normal usa a condição padrão, sem herdar silenciosamente “sem variabilidade”.

### 4.3 Comparação específica

Adicionar uma comparação de **efeito da variabilidade**, distinta da comparação de estratégias. A comparação comum continua exigindo condições de variabilidade iguais.

Um par experimental válido deve ter todos os dados físicos iguais, exceto a condição com/sem variabilidade. Verificar os dados, não apenas o identificador do par. Nomes e velocidade de reprodução não interferem nessa validação.

Apresentar tempo total, dispersão máxima/média e limitação por personagem. Mostrar diferenças assinadas com uma convenção explícita, por exemplo `com − sem`, rotuladas “Diferença observada”. Não apresentar desativar variabilidade como uma estratégia operacional de melhoria.

Texto de apoio:

> “Nesta comparação, apenas as flutuações foram retiradas. Os espaços que permanecem também podem decorrer das diferenças de capacidade. O resultado descreve esta configuração e esta sequência de variações.”

Se a diferença for pequena, informar isso. Não amplificar artificialmente o resultado. A diferença entre as condições não deve ser rotulada como uma decomposição exata ou universal da dispersão em causas independentes.

Se todos já tiverem variabilidade zero, informar que as condições seriam iguais e não criar resultados redundantes. Timeout não recebe um tempo inventado ou percentual de conclusão temporal; preservar as regras existentes.

## 5. Frente 3 — Observação e recuperação dos espaços

### 5.1 Tornar o movimento interpretável

Ao selecionar um participante no canvas ou na tabela, mostrar:

- Nome e identificação secundária consistente com o restante da plataforma.
- Ritmo de referência com carga, velocidade disponível e velocidade efetiva.
- Distância lógica para o predecessor, quando existir.
- Estado observado: “Limitado pela fila”, “Espaço diminuindo”, “Espaço aumentando” ou “Espaço estável”. Para o primeiro, usar “Sem predecessor”. Para quem chegou, usar “Chegou”.

“Limitado pela fila” deve vir da condição já calculada pelo motor. Um personagem pode estar limitado e continuar andando. Para os demais estados, comparar o espaço antes/depois do tick; usar tolerância visual centralizada compatível com a precisão exibida, sem mudar o epsilon ou a física do domínio.

Não classificar espaços usando distância entre sprites, deslocamentos verticais ou pixels. Próximo da chegada, identificar a chegada para evitar explicar o corte pelo destino como perda de capacidade ou bloqueio indevido.

### 5.2 Mostrar recuperação, não apenas abertura

Adicionar, no painel do participante selecionado, um gráfico simples dos últimos 120 segundos simulados com velocidade disponível e efetiva, legenda, unidades e escala comum. Reutilizar componentes gráficos existentes; não adicionar biblioteca se SVG ou canvas simples atenderem.

O gráfico deve permitir ver que disponibilidade maior não vira avanço quando a fila impede; com espaço e ritmo efetivo superior ao predecessor, a distância pode diminuir. A explicação deve se referir ao que foi observado, sem afirmar que todo espaço será recuperado antes do destino.

Guardar apenas a janela necessária em memória. Para selecionar outro participante, manter amostras compactas de todos, limitadas à janela. Pausa, velocidade de reprodução e FPS não mudam os dados. Não persistir todos os ticks nem aumentar indefinidamente o histórico.

Não é necessário criar um player histórico com busca no tempo. Para rever um resultado, pode-se usar reprodução determinística desde o início.

### 5.3 Projeção e elenco maior

Verificar o canvas com todos juntos e em movimento para 4, 6, 9 e 12 participantes, ou até o limite atual do produto. Ajustar escala visual dos avatares, espaçamento e posicionamento de rótulos para evitar sobreposição, mantendo destaque legível do selecionado. Não resolver isso alterando posições lógicas ou ocultando participantes.

Os valores e controles devem continuar acessíveis pela tabela e por teclado; cor não pode ser a única identificação. Priorizar uma tela compartilhada de treinamento, sem criar um redesign completo.

## 6. Frente 4 — Calibração e validação

### 6.1 Preservar a honestidade dos cenários

Reutilizar o script de calibração e suas cinco estratégias: inicial, reorganizar, redistribuir, ambas e transferir em excesso. Registrar como cada estratégia é definida no código atual.

A estratégia equilibrada de redistribuição não demonstra excesso se para antes de criar outro limitante. Manter a estratégia exagerada como intervenção separada, respeitando conservação de carga e limites individuais.

Se o gerador exigir que excesso seja pior que equilíbrio **e melhor que a situação inicial**, remover a segunda exigência. Excesso pode continuar melhor, empatar ou ficar pior que a situação inicial. Nos cenários selecionados para demonstrá-lo, exigir apenas a piora relevante frente à distribuição equilibrada, além das validações físicas; preservar ou documentar a tolerância numérica existente.

Não generalizar os resultados de cenários filtrados para todas as configurações possíveis. Documentar os filtros ativos, tentativas máximas de geração e fallback. Não aumentar indefinidamente as tentativas para encontrar uma história conveniente.

### 6.2 Separar os fenômenos na calibração

Avaliar:

1. **Heterogeneidade sem variabilidade:** capacidades distintas podem formar espaços mesmo com variação desligada.
2. **Flutuação e dependência:** em uma configuração de capacidades próximas, as variações podem criar limitação e espaços. Incluir uma fixture determinística de capacidades iguais para referência; sem variação, ela deve avançar junta segundo o motor atual.
3. **Recuperação:** uma sequência controlada deve abrir um espaço e depois reduzi-lo quando houver velocidade efetiva suficiente para isso. Isso é fixture de teste, não roteiro inserido nas partidas reais.
4. **Redistribuição e mudança da candidata:** comparar equilíbrio e excesso, verificando o diagnóstico antes/depois e o resultado coletivo, sem confundir um mínimo instantâneo com mudança permanente da restrição.

Fixtures sintéticas pertencem a testes/calibração e não substituem silenciosamente uma expedição do usuário. Nesta entrega, não é necessário expor um catálogo novo de cenários na interface.

Se os efeitos forem pouco observáveis, primeiro verificar instrumentação e configurações de carga. Ajustar faixas de parâmetros somente com evidência, registrando antes/depois e repetindo a calibração. Preservar as equações existentes; a única extensão física autorizada é o fator de fadiga da frente 5, quando habilitado. Não aumentar variação indiscriminadamente para produzir animação mais agitada.

### 6.3 Amostragem e relatório

- Usar no mínimo 20 seeds de simulação por configuração; reaproveitar o conjunto de 24 seeds existente, se disponível.
- Cobrir os cenários A/B ainda disponíveis e ao menos três expedições geradas independentemente para cada tamanho 4, 6, 9 e 12 suportado.
- Distinguir seed de geração, que define os atributos da expedição, da seed de simulação, que define as flutuações. Armazenar snapshots aceitos para reprodução.
- Executar as cinco estratégias no modo padrão. Para isolar a variabilidade, executar também os pares com/sem variação das configurações inicial e redistribuída, reaproveitando execuções equivalentes.
- Reportar mediana, mínimo/máximo e quantidade de timeouts para tempo e dispersão; nos pares, reportar também a distribuição das diferenças individuais `com − sem`, não apenas a diferença entre medianas.
- Uma condição sem variação repetida com seeds diferentes não constitui observações independentes. Pode ser executada uma vez por configuração e reutilizada nos pares.
- Informar quantas configurações distintas, seeds e execuções foram avaliadas. Não chamar todas as execuções de cenários independentes.

Atualizar o JSON e um resumo legível no diretório de calibração existente, com versões do motor, gerador e diagnóstico, parâmetros, filtros e comandos de reprodução. O relatório deve registrar resultados reais, inclusive ausência de efeito, inversões e falhas.

Essa calibração é script de desenvolvimento. Não implementar Monte Carlo na interface. Executar a matriz desta seção com fadiga desligada; a validação adicional da frente 5 é separada.

## 7. Frente 5 — Energia e fadiga opcionais

### 7.1 Objetivo e limites

Representar capacidade que muda com o esforço acumulado: alguém pode começar com capacidade suficiente e tornar-se uma candidata à restrição mais adiante. A mudança deve resultar das equações, nunca de um evento obrigatório ou personagem predeterminado.

Implementar esta frente depois da validação das quatro anteriores. “Opcional” significa que o facilitador escolhe ativá-la; não significa que a IA pode omitir sua implementação nesta entrega.

Usar uma única reserva `energy` entre 0 e 1, inicialmente 1 para todos. A fadiga é o efeito derivado dessa reserva sobre a velocidade, sem um segundo medidor independente. Não sortear resistência individual, criar atributos fisiológicos ou estimar calorias.

Este é um modelo didático proposto para o software, não uma fórmula extraída do livro nem um modelo fisiológico validado. A carga mantém seu efeito imediato existente; a energia acrescenta um efeito acumulado distinto. Calibrar os dois em conjunto para evitar uma penalização excessiva da mesma carga.

### 7.2 Modelo inicial implementável

Usar parâmetros globais versionados, iguais para todos. Valores iniciais para calibração, não constantes cientificamente validadas:

| Parâmetro | Valor inicial | Significado |
| --- | ---: | --- |
| `drainPerSec` | `1 / 10800` | Taxa básica de desgaste por segundo simulado. |
| `loadDrainCoefficient` | `0.5` | Aumento do desgaste conforme carga relativa. |
| `minFatigueFactor` | `0.6` | Piso do multiplicador de capacidade quando a reserva chega a zero. |

Em cada tick, usando a energia do início do tick:

```text
loadRatio_i = loadKg_i / referenceLoadKg_i
referenceSpeed_i = velocidade com carga pela fórmula já existente,
                   antes da variabilidade, fadiga e limitação pela fila
fatigueFactor_i = minFatigueFactor + (1 - minFatigueFactor) * energy_i
availableSpeed_i = referenceSpeed_i * variabilityFactor_i * fatigueFactor_i
```

Resolver as posições com a regra atual de dependência, sem ultrapassar. Depois atualizar a energia, sem recalcular o movimento do mesmo tick:

```text
actualSpeed_i = avanço_real_i / dt
relativeEffort_i = actualSpeed_i / referenceSpeed_i
energyLoss_i = drainPerSec * (1 + loadDrainCoefficient * loadRatio_i)
               * relativeEffort_i^2 * dt
nextEnergy_i = max(0, energy_i - energyLoss_i)
```

`referenceSpeed_i` é positivo pelas validações atuais e não inclui fadiga; não usar velocidade já reduzida como denominador. O esforço relativo pode superar 1 quando a variabilidade permite ritmo maior: não truncá-lo artificialmente em 1. Reutilizar as unidades internas em m/s e segundos.

Regras obrigatórias:

- Calcular velocidades a partir do estado anterior de todos; atualizar energia somente depois de resolver o movimento.
- Desgaste usa avanço efetivamente realizado, incluindo o corte pelo destino. Quem estava no destino antes do tick não acumula desgaste.
- Sem avanço, o desgaste desta versão é zero. Não há gasto basal nem recuperação: esta simplificação precisa constar na explicação do modelo.
- Ser limitado reduz desgaste somente na medida em que reduz o ritmo realizado. Não dar bônus específico por posição ou status “limitado”.
- Energia nunca aumenta, sai de `[0, 1]` ou altera os sorteios. Pausa da reprodução não consome nem recupera energia.
- Energia zero significa atingir a degradação máxima deste modelo, não colapso ou parada. O piso evita imobilização artificial; a pessoa continua sujeita à fila e ao timeout normal.
- Com fadiga desligada, ignorar desgaste, manter energia em 1 e aplicar multiplicador exatamente 1, preservando o comportamento anterior.
- Reiniciar uma tentativa repõe todas as reservas em 1. Não carregar desgaste de uma tentativa para outra.

Validar parâmetros finitos, `drainPerSec > 0`, `loadDrainCoefficient >= 0` e `0 < minFatigueFactor <= 1`. Não expor sliders ou edição livre desses coeficientes na UI nesta entrega.

### 7.3 Uso e comparação controlada

Após a primeira caminhada concluída, oferecer **“Experimentar com fadiga”** a partir de uma tentativa sem fadiga. Criar um par vinculado ao snapshot, mudando apenas `fatigueMode` de `disabled` para `enabled`.

Preservar a mesma condição de variabilidade, seed, ordem, carga, atributos e parâmetros de fadiga do par. Mesmo na condição desligada, registrar os parâmetros do experimento para auditoria. Reutilizar o resultado sem fadiga apenas se tiver semântica física e versão compatíveis; caso contrário, executar as duas condições na versão atual, mantendo intacto o histórico antigo.

Rotular as diferenças como “Efeito observado da fadiga”, com a convenção `com − sem`. Não permitir percentual de ganho de estratégia entre condições de fadiga diferentes. A comparação comum de estratégias exige o mesmo modo e os mesmos parâmetros de fadiga; comparar redistribuições com fadiga ativa é permitido nessas condições.

Para novas tentativas preparadas após a primeira conclusão, permitir ativação explícita de fadiga antes de iniciar. O padrão de toda nova tentativa continua desligado. Não alternar no meio da execução ou durante pausa; não mudar a referência inicial, desbloquear etapas nem editar snapshots existentes.

O experimento de variabilidade continua exigindo fadiga desligada nos dois lados. Não implementar uma matriz de quatro condições na interface agora.

### 7.4 Diagnóstico e observação durante a caminhada

Com fadiga ativa, acrescentar ao painel selecionado a **“Reserva de energia (modelo)”** em percentual e a **“Capacidade atual sem flutuação”**, calculada por `referenceSpeed * fatigueFactor`. Preservar separadamente a referência inicial, a velocidade disponível com flutuação e a velocidade efetiva.

A cada tick, estimar as candidatas entre quem ainda não chegou usando a capacidade atual sem flutuação e a mesma tolerância de 1%. Identificar o resultado como **“Provável restrição agora pela capacidade”**, mantendo a ressalva de que essa estimativa não comprova a influência sobre o tempo final.

Para evitar alertas oscilantes, registrar uma mudança apenas quando o novo conjunto de candidatas persistir por 30 segundos simulados consecutivos. Esse intervalo afeta apenas os avisos, não o cálculo físico ou os valores apresentados. Não emitir um alerta por frame.

Se a composição mudar porque alguém chegou, identificar o evento como chegada, não como migração por fadiga. Ao comparar capacidades antes/depois de um intervalo, usar o mesmo conjunto de participantes ainda ativos para fundamentar a interpretação.

No resultado, mostrar energia final individual e resumo das mudanças sustentadas, com seus instantes. Limitar o registro a 100 eventos por tentativa e sinalizar se houve truncamento; não persistir todos os ticks. Durante reprodução, os eventos podem ser recalculados deterministicamente.

É possível a candidata inicial permanecer a mesma. Não produzir uma narrativa de troca se os dados não a sustentarem. Com o modelo ativo, reordenar pode modificar o esforço acumulado e o tempo final; a conclusão do modo sem fadiga não deve ser imposta a essa extensão.

### 7.5 Calibração adicional e condição de conclusão

Preservar a matriz sem fadiga da frente 4. Para validar a extensão, reutilizar seus snapshots e pelo menos 20 seeds, comparando com/sem fadiga nas distribuições inicial e redistribuída. Relatar tempo, dispersão, energia final, frequência de energia zero, timeouts e mudanças sustentadas de candidatas, separadamente dos resultados do modelo anterior.

Adicionar fixtures simples para esforço livre versus limitado, carga relativa maior sob o mesmo esforço relativo, saturação em zero e mudança de candidata ao longo do tempo. A fixture de migração deve usar as equações comuns; não injetar perda de energia em alguém para fabricar o resultado.

Validar invariantes, incluindo: reduzir esforço realizado reduz desgaste quando os demais fatores são iguais; sem esforço não há consumo; velocidade disponível não aumenta por perda de energia, mantendo carga e flutuação fixas. Não exigir maior desgaste de toda pessoa mais carregada em qualquer situação, pois seu ritmo realizado também pode ser diferente.

Se quase todos atingirem energia zero cedo, os tempos crescerem de forma extrema ou o efeito ficar imperceptível na maioria das execuções, revisar os parâmetros e registrar evidências antes/depois. Não recalibrar cada seed separadamente nem filtrar todas as partidas para obrigar uma troca de restrição.

Concluir a frente apenas com parâmetros documentados, resultados reproduzíveis e limitações descritas. Isso demonstra coerência do modelo proposto, não realismo fisiológico.

## 8. Contratos, persistência e compatibilidade

Adaptar os contratos atuais, sem criar uma segunda fonte de verdade. São necessários, conceitualmente:

| Dado | Regra |
| --- | --- |
| Condição de variabilidade | Valor explícito equivalente a `standard` ou `disabled` no snapshot da tentativa. |
| Condição de fadiga | `enabled` ou `disabled`, versão do modelo e coeficientes globais no snapshot. Energia inicial sempre 1 nesta versão. |
| Estado de energia | Reserva por personagem no estado do motor; energia final e eventos resumidos no resultado. Sem persistência por tick. |
| Vínculo experimental | Referência à tentativa de origem, identificador e tipo: variabilidade ou fadiga. Não substitui a validação de comparabilidade. |
| Diagnóstico | Método/versionamento, ritmos de referência e IDs candidatos, calculados a partir do snapshot correspondente. |
| Observação recente | Amostras transitórias para o gráfico; não salvar no histórico por tick. |

Reutilizar campos equivalentes já existentes. Validar valores importados e manter imutáveis resultados anteriores. Para sessões antigas sem condições explícitas, assumir variabilidade padrão e fadiga desligada somente quando isso for compatível com sua versão. Não inventar energia histórica ou eventos ausentes: identificar como não registrados quando necessário.

Um diagnóstico derivado pode ser recalculado de um snapshot compatível; identificar a versão do método. Não recalcular ou sobrescrever tempos históricos com o motor novo. Quando não houver dados suficientes, exibir “Diagnóstico indisponível para esta tentativa”.

Versionar schema/motor conforme a política do repositório ao acrescentar as condições experimentais e o estado de energia. “Condição padrão” neste documento significa variabilidade padrão e fadiga desligada, devendo reproduzir os resultados anteriores para os mesmos dados. Caso seja necessário corrigir uma regra do motor, documentar a diferença e impedir comparações controladas entre semânticas incompatíveis.

Garantir importação/exportação e recuperação após recarregar para experimentos e tentativas normais, sem invalidar silenciosamente históricos existentes.

## 9. Critérios de aceite e verificações

Reutilizar a suíte atual e adicionar testes apenas para os riscos introduzidos:

| ID | Resultado verificável |
| --- | --- |
| EV01 | Candidata usa capacidade com carga; personagem rápido e muito limitado não é escolhido por esse motivo. |
| EV02 | Empates/capacidades próximas são apresentados sem falsa precisão. Redistribuição recalcula; apenas reordenar preserva a estimativa. |
| EV03 | Modo padrão preserva resultados de referência anteriores; modo sem variação usa fator 1 sem alterar o cenário salvo. |
| EV04 | Mesmo snapshot e mesma condição reproduzem os mesmos resultados, incluindo animação e execução sem renderização. |
| EV05 | Par experimental rejeita diferença adicional de carga, ordem, atributos, seed ou versão física; comparação normal continua rejeitando condições diferentes. |
| EV06 | Experimento não sobrescreve referência, não contorna o bloqueio da primeira rodada e não deixa o modo desativado na próxima tentativa normal. |
| EV07 | Fixture sem variação e capacidades iguais anda junta; fixture heterogênea mostra espaços sem depender de ruído. |
| EV08 | Fixture de recuperação abre e reduz um espaço; disponibilidade/avanço e estados visuais correspondem aos ticks do domínio. |
| EV09 | Recuperação de histórico e exportação/importação preservam condições, snapshots e nomes, inclusive com dados antigos suportados. |
| EV10 | Canvas, tabela e painel são legíveis com o elenco máximo; seleção funciona por teclado e sem depender só de cor. |
| EV11 | Relatório de calibração registra amostragem, diferenças pareadas, timeouts e limites de seleção, sem resultados inventados. |
| EV12 | Fadiga desligada preserva resultados anteriores; ativa usa a energia anterior ao tick e o esforço realizado para atualizar a reserva. |
| EV13 | Energia fica em `[0, 1]`, não aumenta, não muda durante pausa e não é herdada na tentativa seguinte; zero preserva o piso de capacidade. |
| EV14 | Caso numérico manual verifica consumo, limitação por fila e efeito no próximo tick, sem depender apenas de duas funções que concordam entre si. |
| EV15 | Diagnóstico distingue capacidade inicial e atual, respeita empates/30 s de persistência e não relata chegada como migração por fadiga. |
| EV16 | Par de fadiga rejeita alterações adicionais; experimentos de variabilidade rejeitam fadiga ativa; histórico recupera modos, coeficientes e resultados sem reescrevê-los. |
| EV17 | Calibração da fadiga é separada, registra energia zero e timeouts e verifica uma migração emergente em fixture, sem obrigá-la em toda partida. |

Cobrir um fluxo E2E: concluir caminhada → revelar diagnóstico → criar experimento → concluir condição complementar → comparar → recarregar → recuperar → iniciar tentativa normal com modo padrão.

Acrescentar um fluxo E2E de fadiga: referência sem fadiga → experimento ativo → energia observável e comparação → recarregar → recuperar → nova tentativa com fadiga desligada.

Não exigir que qualquer seed produza a mesma conclusão ou que toda redistribuição melhore o tempo. Testes determinísticos verificam mecanismos; a calibração avalia frequência e magnitude dos efeitos.

## 10. Sequência de implementação e entrega

1. Inspecionar o código; mapear o que já existe. Registrar somente divergências e decisões relevantes.
2. Implementar diagnóstico e apresentação dos três ritmos.
3. Implementar condição experimental, comparação específica e persistência compatível.
4. Melhorar observação, gráfico recente e leitura do canvas.
5. Executar testes direcionados e calibração das quatro primeiras frentes; corrigir desvios.
6. Implementar energia/fadiga opcional, diagnóstico dinâmico e comparação específica.
7. Executar verificações e calibração adicionais da extensão; atualizar documentação e apresentar os dois conjuntos de resultados.

Ao concluir, informar funcionalidades implementadas, arquivos principais, comandos/verificações executados, resultados reais da calibração e limitações restantes. Não publicar deploy sem solicitação específica.

O aceite técnico não comprova aprendizagem. Para o piloto, pedir ao grupo que explique, usando as próprias execuções: quem parecia limitar o conjunto e por quê; quais espaços persistiram sem variabilidade; quando um espaço diminuiu; e se redistribuir mudou a provável restrição. No exercício com fadiga, pedir também que diferenciem uma flutuação passageira de uma redução acumulada de capacidade e expliquem se a candidata mudou ao longo da caminhada. Registrar se os participantes sustentam essas respostas com evidências antes de declarar o objetivo pedagógico atingido.
