# Avaliação do objetivo pedagógico — 20/09/2026

## Conclusão

O simulador sustenta uma demonstração facilitada de restrição, dependência,
dispersão e redistribuição de carga. Isso ainda não comprova aprendizagem dos
participantes nem equivalência completa com a caminhada narrada em A Meta.

## Execução desta revisão

- 278 testes unitários/de aplicação aprovados.
- 8 testes E2E aprovados, incluindo comparação e recuperação do histórico.
- Calibração executada novamente: 24 seeds × 5 estratégias × 6 cenários
  (A, B e uma expedição gerada para cada tamanho 4, 6, 9 e 12) = 720 execuções.
  Nenhum timeout. Não são 720 cenários independentes.
- Sessão de 12 participantes gerada no navegador, reproduzida até a conclusão
  (63:39), sem erro JavaScript. Capturas `visual-preview/review-12-*.png`.

## Evidência principal

Medianas do cenário A, motor 1.0.0:

| Estratégia | Tempo (s) | Dispersão máxima mediana (m) |
| --- | ---: | ---: |
| Inicial | 3849 | 1070,1 |
| Reorganizar | 3849 | 0 |
| Redistribuir | 2692 | 137,4 |
| Ambas | 2686,5 | 95,2 |
| Transferir em excesso | 2916,5 | 463,0 |

Redistribuição: redução de 30,1% sobre a mediana inicial em A e 27,5% em B.
Nos quatro cenários gerados avaliados, redução de aproximadamente 23,7% a
28,9%. Ordem sozinha praticamente não altera o tempo. A estratégia de excesso
é pior que a redistribuição equilibrada, embora melhor que a inicial.

Fonte numérica: `calibration/calibration-1.0.0.json`, atualizado nesta revisão.

## Limites pedagógicos observados

1. **Variabilidade pouco isolada.** Diagnóstico separado em memória, sem
   alterar os cenários persistidos: removendo a variabilidade de A, a situação
   inicial termina em 3840 s, com dispersão máxima de 1066,4 m. Redistribuir
   termina em 2609 s, com dispersão de 23,8 m. A diferença de capacidade já
   explica quase toda a dispersão inicial. É necessário discutir as velocidades
   disponível/efetiva e a recuperação dos espaços para ensinar flutuação;
   não atribuir todos os espaços à aleatoriedade.
2. **Doze participantes prejudicam a leitura visual.** A separação vertical
   encolhe, mas os desenhos mantêm seu tamanho. Avatares se sobrepõem no início
   e agrupamentos em movimento também colidem com alguns rótulos. A tabela
   continua acessível, mas o canvas perde força como recurso de projeção.
3. **Transferência de aprendizado depende do facilitador.** A jornada atual
   tem três etapas. Uma nova expedição permite outro exercício, mas não há
   mais a antiga quarta etapa guiada com mudança explícita da restrição.
4. **Cenários são selecionados para fins didáticos.** O gerador exige ganho
   mínimo de redistribuição e que excesso seja pior que equilíbrio, porém
   melhor que a situação inicial. As fórmulas não dão bônus artificiais, mas
   esse filtro não permite concluir que tal padrão vale para toda configuração.
5. **A analogia com produção precisa de explicação.** Reordenar pessoas é
   permitido aqui; etapas produtivas podem ter precedências fixas. Dispersão
   não mede diretamente estoque financeiro ou prejuízo. A interface pergunta
   pelos limites da analogia, mas não os desenvolve explicitamente.

## Próxima validação

Piloto com seis participantes: hipótese inicial → reorganizar → redistribuir
→ excesso → nova expedição. Pedir que o grupo explique, usando os resultados,
por que uma fila compacta não garante menor tempo, por que alguém rápido fica
limitado, e por que transferir peso pode mudar a restrição. Avaliar essas
explicações antes de declarar o objetivo de aprendizagem atingido.

Referência externa consultada: [Goldratt Research Labs — simuladores](https://www.goldrattresearchlabs.com/simulators).
A página relaciona a caminhada de A Meta à restrição e ao alívio de sua carga.
Sua afirmação de que liderar com Herbie aumenta throughput não foi adotada
como resultado deste modelo: aqui a ordem isolada quase não muda o tempo,
como previsto pelo guia local. Não foi feita auditoria textual de uma edição
integral do livro.
