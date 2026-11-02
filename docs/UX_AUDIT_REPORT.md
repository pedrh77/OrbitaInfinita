# Auditoria UX/UI — Órbita Infinita

> Atualização: houve medição e instalação posteriores no tablet. Consulte [TABLET_PERFORMANCE.md](TABLET_PERFORMANCE.md) para os resultados e limitações atuais; as observações abaixo registram a revisão anterior.

- Data: 2026-10-30.
- Base: commit `9556ef4`, com alterações locais desta sessão.
- Escopo: desempenho e jogabilidade revisados por dois agentes; correções de Canvas/JavaScript e ponte de anúncios.
- Evidência: testes automatizados sem dependências, navegador local e build/lint Android debug.
- Limites: sem Android físico, medição de FPS/GPU/bateria ou acesso à Play Console. Não houve publicação.

## Resumo executivo

**Veredito: correções implementadas e verificadas em testes; prontidão para produção INCONCLUSIVA sem teste real em aparelho.** Os quatro achados P1 e as correções dos demais problemas concretos estão implementados. O candidato a gargalo GPU recebeu mitigação; seu impacto ainda exige perfil em aparelho.

A revisão foi dirigida aos achados abaixo. Não foi atribuída pontuação ou cobertura global: não houve auditoria integral de todas as dimensões do checklist. Não se deve interpretar ausência de falhas nos testes como certificação completa do jogo.

## Top 5 problemas corrigidos

| ID | Prioridade original | Problema | Correção |
| --- | --- | --- | --- |
| JOG-01 | P1 | Previsão ignorava vento solar/fendas | Voo e previsão usam `advanceFlight`, mesmo passo, forças e amortecimento; colisões seguem mesmos raios e ordem para planetas, asteroides, portais e minas. |
| JOG-02 | P1 | Segundo dedo podia alterar/disparar mira | Um `pointerId` possui o gesto; outros dedos e teclado não o encerram. Cancelamento, perda de captura e pausa liberam a captura sem disparar. |
| PERF-01 | P1 | Física perdia tempo abaixo de 30 FPS | Acumulador com passos fixos de 1/120 s, até 250 ms de recuperação; interrupções maiores pausam a viagem sem avanço súbito. |
| PERF-02 | P1 | Pausa mantinha render e previsão contínuos | Um quadro estático ao pausar; fila de animação fica vazia. Redimensionamento pode solicitar novo quadro; retomada reinicia relógio sem backlog. |
| JOG-03 | P2 | Arrasto dependia do FPS | Amortecimento exponencial por tempo, compartilhado entre previsão e voo. |

## Checklist detalhado

| ID | Estado | Evidência / mudança | Critério relacionado |
| --- | --- | --- | --- |
| JOG-01 | Corrigido, teste passou | Todos os pontos de previsão comparados com voo real em cenas com vento/fenda ±1, nebulosa, portal e planeta móvel; sem consumo de itens durante previsão. | QLT-08, VIS-06 |
| JOG-02 | Corrigido, teste passou | Segundo dedo não altera mira nem dispara; cancelamento do principal não lança; captura liberada; teclado e ponteiro isolados. | QLT-08 |
| PERF-01 | Corrigido, teste passou | Mesma posição/velocidade e tempo de corrida a 20/30/60/120 FPS simulados. Hitch de 250 ms avança; interrupção acima disso pausa. | QLT-05, QLT-08 |
| PERF-02 | Corrigido, teste passou | RAF fica sem callbacks após desenhar pausa; background não agenda quadro; retorno exige retomada. Consumo real não foi medido. | VIS-05, QLT-05 |
| JOG-03 | Corrigido, teste passou | Oráculo independente compara atenuação após 1 s com `exp(-0.65)`, em quatro frequências. | QLT-08 |
| JOG-04 | Corrigido, teste passou | Rotação pausa e cancela mira; coordenadas, raios, órbitas e velocidades permanecem iguais. Canvas adapta o mundo proporcionalmente com margens, sem comprimir a física. | VIS-09, QLT-03 |
| FDB-01 | Corrigido, teste passou | Falhas/indisponibilidade diferem de anúncio fechado sem recompensa. Erro da ponte resolve solicitação e remove timeout. | FDB-04, CPY-04 |
| PERF-03 | Corrigido por inspeção | Previsão reutiliza buffer numérico, atualiza no máximo 20 vezes/s sem nova entrada e invalida imediatamente quando mira muda. Integração usa objetos temporários reutilizados. | QLT-05 |
| PERF-04 | Mitigado; perfil pendente | Gradiente de fundo é reutilizado e quatro nebulosas usam sprites pré-renderizados. Sombras dinâmicas continuam compondo o visual. Nenhum ganho numérico de FPS/GPU foi alegado. | VIS-05, QLT-05 |
| PERF-05 | Corrigido, teste passou | Resize com mesmas dimensões, DPR e modo de layout retorna antes de reconstruir canvas. Durante partida não recria mundo/estrelas. | QLT-05 |

Além disso: preferência de som sincronizada, Escape usa navegação existente, espaço em controles não inicia mira, link para relato no GitHub, contraste dos botões/links e redução de movimento das transições de UI. A redução de movimento não desativa a animação do jogo.

## Fluxos testados

1. `node scripts/test-game.cjs`: 11 grupos passaram. Cobrem som salvo, forças com oráculos independentes, equivalência previsão/voo, quatro frequências, multitoque, captura, teclado, rotação, fila RAF, pausa, Hangar, interrupções, câmera lenta, cronômetro e mensagens de anúncio.
2. `node scripts/test-admob.cjs`: passou. Cobertura de indisponibilidade web, ponte desconectada, recompensa válida, callback duplicado, `not-loaded` e timeout.
3. `node --check dist/game.js` e `git diff --check`: passaram.
4. Navegador local: jogo executou sem erros no console; observada tela de pausa. Na etapa anterior, inspeção visual móvel a 390 × 844 e abertura/fechamento do Hangar. Não houve medição de fluidez.
5. `assembleDebug` e `lintDebug`: passaram. Lint: 0 erros e 1 aviso de atualização disponível para AndroidX WebKit. Não houve atualização de dependência fora do escopo.

O erro anterior de build foi resolvido com a propriedade temporária `jdk.net.unixdomain.tmpdir` apontada para `.gradle/tmp` e SDK existente em `ANDROID_HOME`, sem mudança de firewall, rede ou configuração global. Comando reproduzível no README.

## Plano de implementação

As correções de código desta revisão estão concluídas. Próxima etapa externa: instalar o APK de debug em aparelhos para validar controles/rotação e perfilar tempo de quadro; depois gerar uma atualização assinada para o teste fechado. O roteiro está em `CLOSED_TESTING.md`. O APK debug usa anúncios de teste e não foi publicado.

## Critérios de aceite das correções

- Trajetórias equivalentes entre previsão e voo nos cenários exercitados: passou.
- Segundo dedo e teclado não interferem no gesto principal: passou.
- Física e relógio equivalentes a 20/30/60/120 FPS simulados: passou.
- Pausa sem avanço ou render contínuo; retomada sem backlog: passou.
- Rotação preserva mundo e velocidade, pausando para retomada explícita: passou.
- Anúncio não carregado informa indisponibilidade e não concede recompensa: passou.

## O que NÃO recomendo adicionar

Analytics, serviços, rankings ou recompensas para fabricar engajamento. Não é necessário mudar decisões de balanceamento sem feedback real. As correções preservam o progresso local e as regras de economia existentes.

## Perguntas / dados faltantes

- Medir tempo de quadro/GPU/consumo em Android de entrada e intermediário; testar sessões longas, multitoque e mudanças de orientação reais.
- Validar consentimento e anúncios com aparelhos de teste. Mocks não comprovam comportamento dos SDKs em dispositivo.
- Investigar com jogadores penalidade de 30% ao desistir e consumo automático de escudos/impulsos. São decisões de balanceamento ainda não testadas, não defeitos demonstrados.
- Elegibilidade, participação e os 14 dias adicionais só podem ser confirmados no ciclo real. Referência oficial: https://support.google.com/googleplay/android-developer/answer/14151465?hl=pt-BR
