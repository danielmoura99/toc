# Evolução da fábrica — Restrição, variabilidade e taxa de entrega

Versão 1.0 · 28/09/2026
Público: desenvolvedores e IA responsável pela implementação.

## 1. Ponto de partida e limite desta entrega

O `GUIA_MVP_SIMULADOR_DAS_TIGELAS.md`, versão 1.1, já foi implementado integralmente. Este documento é uma especificação incremental: não reconstruir preparação, motor, canvas, histórico, importação/exportação ou comparação que já existem.

Manter a experiência atual como **“Dependência e variabilidade”**. Acrescentar uma experiência separada, **“Restrição e melhoria do fluxo”**, reutilizando a infraestrutura existente. Preservar a trilha e as partidas antigas da fábrica.

Stack permanece Next.js, React, TypeScript e PixiJS, com estado local e frameworks de teste do repositório. Não adicionar backend, autenticação, banco, serviços de IA ou dependências sem necessidade concreta.

Esta entrega permite:

1. Observar uma linha com um setor de menor capacidade média.
2. Identificar essa restrição usando capacidade e disponibilidade de material.
3. Escolher um setor para receber capacidade adicional.
4. Reexecutar sob os mesmos sorteios e comparar entrega, estoque e aproveitamento da restrição.
5. Verificar quando a restrição original deixa de ser a única de menor capacidade.

Não implementar agora o experimento sem variabilidade, controle de entrada, DBR, buffers editáveis, fadiga, defeitos, custos ou vendas. As regras numéricas abaixo são decisões didáticas desta adaptação, não uma reprodução literal de um segundo jogo do livro.

## 2. Objetivo pedagógico

O grupo deve conseguir explicar:

- Capacidade disponível não é igual à quantidade processada: falta de material pode impedir o uso de capacidade.
- Um setor com maior capacidade média ainda pode afetar o fluxo quando sua entrega oscila.
- Aumentar capacidade em um setor pode aumentar somente seu processamento ou o estoque, sem ganho equivalente na entrega final.
- Uma melhoria deve ser julgada pela saída do sistema e pelos efeitos no estoque.
- Após ampliar a restrição, é necessário reavaliar a linha.

Não prometer que melhorar um não gargalo nunca ajuda. Em uma linha variável e em horizonte finito, isso pode ajudar a alimentar ou escoar a restrição. Também não prometer uma porcentagem fixa de ganho ao ampliar o gargalo.

Esta experiência trabalha principalmente identificação e ampliação da capacidade. Não apresentar como implementação completa dos cinco passos de focalização da TOC: exploração e subordinação exigem intervenções adicionais, fora desta entrega.

## 3. Regras herdadas

Preservar as regras físicas do MVP:

- Uma unidade é um lote inteiro; mesma unidade em todos os setores.
- Fonte irrestrita antes do primeiro setor; filas intermediárias inicialmente vazias.
- Setores atuam sequencialmente, uma vez por dia; recebimentos podem ser processados no mesmo dia.
- Primeiro setor introduz sua capacidade disponível; demais processam o mínimo entre capacidade disponível e fila de entrada.
- Sobra de material fica na fila; capacidade não utilizada não é armazenada.
- Saída do último setor conta como entrega; filas restantes não são esvaziadas no encerramento.
- Após cada jogada: entrada acumulada = entrega acumulada + estoque em processo.
- Pausa, velocidade, animação e recarregamento não alteram os sorteios ou a física.

A única alteração física desta entrega é o cálculo da capacidade disponível por setor. A transferência continua usando a mesma regra.

## 4. Modelo de capacidade da nova experiência

### 4.1 Cenário padrão

Usar cinco setores e os nomes industriais existentes. Horizonte recomendado: **20 dias**; manter opções de 10 e 30 dias. Outros tamanhos de 4 a 12 continuam disponíveis.

Definir o setor central como restrição original:

```text
restrictionIndex = floor(stageCount / 2) // índice zero-based
```

Com cinco setores, a restrição original é Pintura. Não sortear capacidades individuais, não escolher seeds por resultado e não esconder a regra do motor. O destaque diagnóstico fica disponível após o grupo registrar sua hipótese; a tabela de capacidades permanece consultável desde o início.

### 4.2 Capacidade diária

Preservar o dado justo de seis faces e seu sorteio determinístico existente. Na nova experiência:

```text
die(stage, day) = dado existente, inteiro 1..6
baseBonus = 0 no setor restritivo original; 2 nos demais
upgrade = 0 na linha de base; 1, 2 ou 3 no único setor escolhido
availableCapacity = die + baseBonus + upgrade
nominalMeanCapacity = 3.5 + baseBonus + upgrade
```

| Perfil inicial | Capacidade diária | Capacidade média |
| --- | --- | --- |
| Restrição original | 1 a 6 lotes | 3,5 lotes/dia |
| Demais setores | 3 a 8 lotes | 5,5 lotes/dia |

Todos os setores continuam variáveis. O bônus representa capacidade estrutural adicional; não é outro sorteio e não depende de nome, estoque ou desempenho.

Na experiência antiga, preservar exatamente `capacity = die`, sem bônus e sem alteração dos vetores de RNG.

### 4.3 Exibição do dado

Na experiência nova, o dado sozinho não representa toda a capacidade. Mostrar explicitamente:

> Dado: 4 + capacidade adicional do setor: 2 + melhoria: 1 = capacidade disponível hoje: 7 lotes.

Rótulos recomendados: “Dado — componente variável”, “Capacidade disponível hoje” e “Capacidade média do setor”. Não exibir uma face 7 ou 8 em dado de seis faces. Não continuar chamando a face isolada de capacidade total neste modo.

## 5. Intervenções e comparação controlada

Após concluir a linha de base, liberar **“Testar melhoria de capacidade”**:

1. Escolher um único setor.
2. Escolher acréscimo de +1, +2 ou +3 lotes por dia.
3. Registrar previsão e justificativa opcionais.
4. Reexecutar desde o dia 1, com filas vazias, mesmo horizonte, ordem, IDs, perfis e seed da linha de base.

Cada intervenção deriva diretamente da linha de base. Não acumular melhorias de tentativas anteriores. Não modificar uma execução em andamento. Identificar o setor e o acréscimo nos resultados, histórico e comparação.

Sugerir inicialmente comparar a mesma melhoria **+1** em dois setores: na restrição e em um não gargalo escolhido pelo grupo. Isso compara intervenções de igual magnitude física; não representa igualdade de custo financeiro.

Depois, permitir +2 ou +3 na restrição original:

- +1: média da restrição sobe a 4,5; continua única menor média.
- +2: todas as médias ficam em 5,5; há empate, não uma nova restrição única.
- +3: setor original passa a 6,5; os demais empatam na menor média de 5,5.

A ferramenta deve explicar o empate, sem inventar um novo gargalo exclusivo. Em futuras entregas podem existir perfis diferentes para ilustrar mudança para um setor específico; não é necessário agora.

Manter até três partidas na comparação existente. Permitir comparar linha de base com duas alternativas. Outra seed é outro experimento; não misturar sua diferença aleatória com o efeito da intervenção.

O RNG deve continuar vinculado a seed, ID do setor, dia e versão do RNG. O bônus, a melhoria e o ID da tentativa não participam da chave do sorteio. Na comparação controlada, verificar igualdade das faces correspondentes, além da configuração relevante.

## 6. Diagnóstico explícito da restrição

### 6.1 Hipótese antes da resposta

Após a linha de base, perguntar:

- “Qual setor você considera a restrição?”
- “Que evidências sustentam sua escolha?”

Permitir selecionar um setor ou “Ainda não sei”, com justificativa opcional. Em seguida, mostrar o diagnóstico. Não usar pontuação, ranking de pessoas ou bloqueio por resposta incorreta.

### 6.2 Separar estrutura e observação

**Diagnóstico estrutural:** setor ou conjunto de setores com menor capacidade média configurada. Mostrar as médias de todos e destacar a menor. Usar “Restrição por capacidade média” e, quando aplicável, “Empate na menor capacidade média”.

**Evidências observadas:** capacidade sorteada/disponível, processamento realizado, capacidade não utilizada por falta de material, dias com material insuficiente e fila de entrada ao final de cada dia.

Não deduzir automaticamente a restrição por menor transferência, maior fila, dado de um único dia ou utilização mais alta. Não apresentar o diagnóstico estrutural como explicação suficiente de todas as oscilações da entrega.

Exemplo de explicação:

> Pintura tem a menor capacidade média. Nesta execução, também deixou de aproveitar X lotes de capacidade porque não havia material suficiente. Isso mostra que a restrição depende das entregas anteriores.

Após a intervenção, recalcular o diagnóstico pelas novas médias. Exibir separadamente o desempenho do setor restritivo original para permitir a comparação antes/depois.

## 7. Variabilidade nos não gargalos

Não acrescentar novo sorteio de indisponibilidade nesta entrega. A variação do dado já representa oscilações de capacidade diária em todos os setores.

Sinalizar uma jogada quando `availableBefore < availableCapacity`, exceto no primeiro setor. Mostrar a diferença e a explicação “Material insuficiente para aproveitar toda a capacidade”.

Distinguir:

- Antes da restrição: oscilações podem reduzir a alimentação que chega a ela.
- Depois da restrição: oscilações podem atrasar a expedição e gerar estoque após ela.

No modelo atual, as filas não têm limite. Logo, um setor posterior não bloqueia fisicamente a restrição por falta de espaço. Não afirmar que esse bloqueio aconteceu.

Como todas as capacidades são pelo menos 1 e a atualização é sequencial com fonte irrestrita, cada setor processa pelo menos um lote por dia. **Não fabricar episódios de processamento zero** para ilustrar espera. Falta parcial de material já demonstra o fenômeno. O tratamento defensivo de fila vazia pode permanecer no motor e nos testes.

## 8. Indicadores e observação

Reutilizar os indicadores existentes. Na nova experiência, priorizar:

| Indicador | Regra |
| --- | --- |
| Lotes expedidos | Saída acumulada do último setor. |
| Taxa de entrega | Lotes expedidos nos dias encerrados / número de dias encerrados. Antes do primeiro fechamento, “—”. |
| Estoque em processo | Soma das filas, excluindo fonte e saída. |
| Capacidade disponível acumulada por setor | Soma de `die + baseBonus + upgrade`. |
| Capacidade não utilizada por falta de material | Soma de `availableCapacity − transferred`. |
| Aproveitamento da capacidade disponível | Soma processada / soma da capacidade disponível, em percentual. |
| Dias com material insuficiente | Número de jogadas em que material disponível < capacidade; excluir fonte irrestrita. |

Mostrar capacidade não utilizada e aproveitamento do setor restritivo original no resumo da comparação. Um percentual alto de utilização local não é objetivo nem prova de eficiência global.

“Taxa de entrega” é uma medida física de saída, em lotes/dia. Pode haver ajuda contextual “throughput físico”. Não chamá-la de ganho financeiro: o módulo não modela vendas, preços ou custos totalmente variáveis.

Durante dias incompletos, manter referência e gráficos apenas dos dias encerrados. Não dividir entregas parciais pelo número de dias completos; calcular a taxa a partir do último fechamento persistido. Indicadores instantâneos continuam identificados como parciais.

### 8.1 Referências dos gráficos

Na experiência antiga, nada muda.

Na nova experiência:

- Referência global = menor média de capacidade configurada × dias encerrados.
- Rótulo: “Referência pela menor capacidade média — não é garantia de entrega”.
- Desvio de cada setor = transferência acumulada − sua própria capacidade média × jogadas executadas.
- Exibir a média usada na referência; ela muda após determinadas melhorias.
- Na comparação, a principal evidência é entrega real e sua diferença; não comparar apenas desvios contra referências diferentes.

Essa referência não é teto rígido de uma partida curta. Uma realização aleatória pode ficar acima dela. Não recortar o gráfico, limitar a produção à média ou corrigir os resultados para obter uma conclusão.

### 8.2 Interface

Adicionar um seletor simples de experiência antes da preparação. Reutilizar o fluxo atual de participantes, hipótese, execução e resultados.

No canvas e na tabela da nova experiência, apresentar capacidade total e processamento efetivo de forma distinguível. Nas jogadas com falta de material, destacar a capacidade não utilizada sem culpar a pessoa que representa o setor.

No resultado, usar a sequência: hipótese → diagnóstico → escolher melhoria → prever → executar → comparar → reavaliar. Manter os detalhes extensos recolhidos e os indicadores principais visíveis para projeção.

## 9. Contratos, versões e persistência

Adaptar nomes à arquitetura real do repositório. Não duplicar o motor inteiro.

Campos conceituais novos:

```ts
type Experience = 'dependency-variability' | 'constraint-flow';
interface CapacityProfile {
  stageId: string;
  baseBonus: number;
  upgrade: number;
}
interface Intervention {
  baselineRunId: string;
  targetStageId: string;
  addedCapacity: 1 | 2 | 3;
  prediction: string;
}
// No snapshot: experience, capacityProfiles, originalConstraintStageId,
// experimentId, intervention (null na base), versão do modelo de capacidade.
// No evento: die preservado, availableCapacity explícita.
```

Invariantes de configuração:

- Modo antigo: bônus e melhoria zero.
- Nova linha de base: exatamente um bônus 0 no setor central e bônus 2 nos demais; nenhuma melhoria.
- Tentativa: exatamente um setor com melhoria 1, 2 ou 3; demais com melhoria zero; mesmos perfis da base.
- IDs únicos e existentes; valores inteiros; rejeitar configurações inválidas em runtime e importação.

Não reaproveitar `die` para armazenar capacidade total. Atualizar explicitamente os cálculos que antes usavam a face como capacidade, inclusive agregados e validações.

Versionar schema/motor conforme convenções existentes. Preservar replay do modo antigo. Para dados antigos sem o campo de experiência, fazer migração explícita para `dependency-variability`, com capacidade igual ao dado; não reinterpretar partidas antigas com bônus.

Persistir perfis, intervenção, diagnóstico do grupo e vínculo com a base. Uma comparação precisa continuar compreensível depois de exportar/importar ou excluir o resultado da base: cada tentativa conserva snapshot suficiente para sua própria reprodução. Não depender apenas de referência a um objeto que pode desaparecer.

Reutilizar limites de histórico, tamanho de arquivo, confirmação de importação e recuperação pausada. Não apagar dados antigos silenciosamente. Verificar replay determinístico incluindo capacidade total, filas e métricas novas.

## 10. Exemplos de referência

Usar fixtures de domínio, sem permitir edição manual dos dados na interface de produção.

### Exemplo A — Primeiro dia

Cinco setores, restrição no terceiro, bônus `[2,2,0,2,2]`, faces `[1,1,6,1,1]`, sem melhoria:

```text
Capacidades:             3 / 3 / 6 / 3 / 3
Transferências:          3 / 3 / 3 / 3 / 3
Capacidade não utilizada:0 / 0 / 3 / 0 / 0
Filas finais:            0 / 0 / 0 / 0 / 0
Entrada: 3; entrega: 3; estoque: 0.
```

A restrição por média teve capacidade 6, mas processou 3 por falta de material. Não há contradição: média estrutural e capacidade de um dia são coisas diferentes.

### Exemplo B — Mais entrada sem mais entrega imediata

Mesmos perfis e faces `[6,6,1,6,6]`:

```text
Base: capacidades 8/8/1/8/8; transferências 8/8/1/1/1.
Filas finais 0/0/7/0/0; entrada 8; entrega 1; estoque 7.

+1 no primeiro setor: capacidades 9/8/1/8/8.
Filas finais 0/1/7/0/0; entrada 9; entrega 1; estoque 8.

+1 no terceiro setor: capacidades 8/8/2/8/8.
Filas finais 0/0/6/0/0; entrada 8; entrega 2; estoque 6.
```

São exemplos didáticos específicos, não garantias de todas as partidas. Reexecutar cada alternativa do estado inicial, sem carregar filas do exemplo anterior.

## 11. Calibração e critérios de aceite

### Testes obrigatórios incrementais

1. Regressão: partidas antigas mantêm os mesmos eventos e resultados.
2. Exemplos A/B passam com todas as filas e totais corretos.
3. Conservação e `transferred <= availableCapacity` em cada jogada; capacidade não utilizada usa capacidade total.
4. Mesma seed/base gera faces idênticas em manual, automático, reload e intervenções.
5. Apenas o setor escolhido recebe o acréscimo; recomeço zera estoques e não acumula intervenções.
6. Diagnóstico usa médias configuradas e trata os empates de +2/+3 corretamente.
7. Métricas parciais não contaminam a taxa dos dias encerrados.
8. Histórico/comparação distingue reprodução, intervenção controlada, outra seed e outra configuração.
9. Importação/exportação preserva versão, perfis e vínculo; entrada inválida não apaga sessão.
10. E2E: base → hipótese → diagnóstico → melhoria no não gargalo → melhoria na restrição → comparação, com reload no meio de uma tentativa.
11. Inspeção visual com 5 e 12 setores: leitura de capacidade total, falta de material e melhoria escolhida; informação disponível também em HTML.

### Script de desenvolvimento

Estender o script estatístico existente; não criar tela de calibração.

Para 100 seeds fixas, cinco setores e 20 dias, executar por seed:

- Linha de base.
- +1 em cada um dos cinco setores, separadamente.
- +2 e +3 na restrição original.

Total: 800 execuções, organizadas em 100 grupos pareados, não 800 cenários independentes. Registrar versão, perfis, seed, saída, estoque, taxa de entrega e falta de material na restrição original. Calcular diferenças pareadas versus base e reportar média, mediana e mínimo/máximo; registrar casos sem ganho e casos de ganho em não gargalos.

Usar também um conjunto menor, documentado, de 20 seeds para 4 e 12 setores e horizontes 10/30, validando invariantes e casos de fronteira.

Não filtrar seeds, acrescentar bônus oculto ou exigir que melhorar a restrição seja estritamente superior em toda partida. No motor sequencial atual, com os mesmos sorteios e apenas aumento de capacidade, a entrega acumulada final não deve diminuir; usar isso como propriedade de regressão. Estoque pode aumentar ou diminuir.

Antes de liberar, avaliar se os resultados agregados deixam a diferença entre melhoria local e entrega do sistema observável. Se não, registrar o limite e revisar os parâmetros explicitamente, atualizando a especificação; não manipular execuções individuais.

## 12. Mini roteiro e ordem de execução

Roteiro do facilitador:

1. “Onde está a restrição? Como você sabe?”
2. “Ela usou toda a capacidade disponível? O que faltou?”
3. “Qual setor você melhoraria primeiro? O que espera mudar na entrega?”
4. “Com os mesmos sorteios, a melhoria aumentou a entrega ou o estoque?”
5. “Ao ampliar a restrição, ela continua sendo a menor capacidade? Há empate?”
6. “No nosso trabalho, que decisão local aumenta atividade sem necessariamente aumentar a entrega final?”

Ordem de implementação:

1. Ler instruções do repositório e identificar os pontos existentes de extensão; registrar decisões em `docs/decisions.md`.
2. Acrescentar experiência, perfis de capacidade e intervenções no domínio, com fixtures e compatibilidade.
3. Atualizar métricas, persistência e replay.
4. Integrar preparação, hipótese, diagnóstico, melhoria e comparação usando os componentes existentes.
5. Ajustar canvas e tabela para capacidade total; executar testes e calibração.
6. Entregar resumo de alterações, comandos realmente executados, resultados e limitações; realizar novo piloto para esta experiência.

Não tratar o piloto do MVP original como validação pedagógica automática desta extensão. Não refazer funcionalidades já prontas nem misturar nesta entrega as melhorias cosméticas do review anterior, salvo o que for necessário para tornar os novos conceitos legíveis. Deploy depende de solicitação específica.
