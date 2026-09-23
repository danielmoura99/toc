# Ajustes incrementais — Simulador da Trilha

Data: 22/09/2026. Instruções para a IA implementar no repositório existente.

## Contexto e limite da tarefa

O MVP e o gerador de expedições já estão implementados. Aplique somente os ajustes abaixo, identificados no teste de navegação da plataforma em 21/09/2026.

Leia as instruções do repositório e os componentes envolvidos. Reutilize a arquitetura e os dados existentes. Não reimplemente o guia do MVP, não altere fórmulas, seeds, geração de cenários ou métricas e não adicione dependências para estes ajustes.

O teste com seis participantes concluiu três caminhadas:

| Tentativa | Tempo | Dispersão máxima |
| --- | --- | --- |
| Configuração inicial | 59min41s | 965 m |
| Reorganização, mesmas cargas | 59min41s | 0 m |
| Redistribuição, ordem inicial | 44min52s | 79 m |

Comparação e recuperação do histórico após recarregar funcionaram. Esses números são evidência de uma expedição específica, não valores esperados para qualquer novo sorteio.

Implemente os itens 2, 3 e 4. O item 1 é condicional ao esforço, conforme abaixo. Execute o trabalho; não entregue apenas um plano.

## 1. Bloqueio da primeira rodada — somente se a correção for localizada

**Problema reproduzido:** gerar uma expedição → clicar em “2 — Reorganizar”, antes de qualquer caminhada → mover um personagem. Os controles da etapa 1 estavam desabilitados, mas mudar de etapa liberou a edição.

Inspecione se o estado/histórico existente permite identificar uma tentativa concluída da etapa 1 **da expedição atual**. Se permitir, faça a correção pontual:

- Bloquear acesso às etapas 2 e 3 até essa conclusão.
- Aplicar a condição no controle visual e no handler/controller existente que muda a etapa.
- Mostrar uma mensagem curta: “Conclua a primeira caminhada para liberar as próximas etapas.”
- Pausa, abandono, timeout e resultados de outra expedição não liberam o acesso.
- Após recarregar, preservar a liberação se a conclusão estiver no histórico recuperado.

Não criar uma máquina de estados nova, migrar todo o histórico ou refatorar a arquitetura para resolver este item. Se isso for necessário, registre em `docs/decisions.md` o motivo concreto do adiamento e conclua os demais ajustes, sem parar para pedir confirmação.

## 2. Usar os nomes dos participantes de maneira consistente

**Problema:** o canvas mostra os nomes cadastrados, mas preparação, mochilas, tabelas, histórico e comparação usam principalmente “Caminhante N”. Isso dificulta acompanhar o próprio personagem.

- Usar o nome do participante como identificação principal nas superfícies citadas, destinos de transferência, botões e rótulos acessíveis.
- Manter o identificador do personagem como informação secundária quando necessário. Exemplo: “Ana · Caminhante 3”.
- Sem nome preenchido, usar o nome padrão do personagem.
- Preservar IDs internos para movimentação, transferência, aleatoriedade e persistência. Nunca usar o nome como chave.
- Aceitar nomes repetidos, distinguindo os personagens pelo identificador secundário.
- Em tentativas concluídas, usar o nome salvo no snapshot da própria tentativa; não substituir pelo nome atualmente editado na preparação.
- Sessões antigas sem nome devem continuar funcionando pelo fallback, sem migração ampla.

Centralize a resolução do nome se houver duplicação simples de lógica. Não faça uma refatoração geral de componentes.

## 3. Retirar a solução do exemplo de hipótese

Substituir o placeholder atual:

> Ex.: tirando peso de quem está sobrecarregado, o grupo todo chega antes.

Por:

> O que vocês esperam observar nesta caminhada? Por quê?

Preservar o campo opcional, o limite e o comportamento existentes. Não acrescentar dicas que antecipem a redistribuição na primeira etapa.

## 4. Identificar e ordenar melhor as tentativas na comparação

**Problema:** as colunas mostram “Base”, “#2” e “#3”, mas a numeração apresentada não representa necessariamente a ordem em que as tentativas aconteceram. No teste, a redistribuição apareceu antes da reorganização.

- Manter a referência selecionada como primeira coluna, com indicação explícita “Referência”. Preservar a regra atual de escolha da referência.
- Ordenar as demais tentativas selecionadas cronologicamente, da mais antiga para a mais recente.
- Mostrar o número cronológico da tentativa e o nome da etapa, além de data/hora quando necessário.
- Exemplo: “Tentativa 1 · Observar — Referência”, “Tentativa 2 · Reorganizar”, “Tentativa 3 · Redistribuir”.
- A numeração deve identificar a tentativa no histórico, não sua posição na seleção ou coluna. Reutilizar numeração existente; caso não exista, derivar uma ordem consistente do histórico disponível, sem mudar o formato persistido apenas por isso.
- Usar os mesmos títulos nos comentários abaixo da tabela, substituindo “#2 em relação à base” pelo título identificável da tentativa.
- Preservar a detecção real do que mudou. O nome da etapa não prova que a configuração foi alterada: uma tentativa de “Redistribuir” pode mudar ordem, carga, ambas ou nenhuma.
- Preservar os bloqueios de comparabilidade e os cálculos existentes.

## Verificação proporcional ao escopo

Reutilize a suíte existente. Acrescente ou adapte testes apenas para riscos concretos:

- Nomes repetidos e ausentes não trocam personagens; histórico usa o snapshot correto.
- A comparação mantém a referência primeiro e ordena as demais tentativas corretamente, independentemente da ordem de seleção.
- Se o item 1 for implementado: bloqueio antes da conclusão, liberação após conclusão e preservação após recarregar.

Confira visualmente os nomes e cabeçalhos com seis participantes. Não é necessário executar uma nova calibração estatística, pois esta tarefa não altera o motor nem o gerador. Não escreva teste isolado apenas para verificar o texto do placeholder.

## Entrega

Atualize a documentação somente onde houver mudança relevante. Ao terminar, informe:

- Itens implementados e arquivos principais alterados.
- Resultado do item 1: corrigido ou adiado, com motivo.
- Verificações executadas e como reproduzir o fluxo atualizado.

Não ampliar esta entrega para energia, novos cenários, redesign completo ou outras melhorias não solicitadas. Não publicar o deploy sem solicitação específica.
