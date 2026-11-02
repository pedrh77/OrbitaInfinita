# Próximo ciclo de teste fechado

O e-mail de 16/10/2026 solicita mais 14 dias de testes com pessoas reais. A passagem do tempo, por si só, não comprova testes nem garante acesso à produção.

Referência oficial: https://support.google.com/googleplay/android-developer/answer/14151465?hl=pt-BR

## Preparação

- Publique uma atualização na faixa de teste fechado, com `versionCode` maior que todos os pacotes já enviados. Não reinstale para atualizar: confirme que o progresso é preservado.
- Mantenha pelo menos 12 testadores inscritos continuamente por 14 dias, conforme a exigência aplicável à conta. Confirme a elegibilidade no painel da Play Console.
- Distribua o link de adesão e o link da loja aos participantes. Instale pela Play Store para testar o pacote distribuído.
- Explique que o feedback pode ser privado pela Play Store. O atalho “Relatar problema · GitHub” abre um canal público que exige conta; não inclua informações pessoais ali.

## Roteiro de uso real

Os blocos abaixo organizam a cobertura; não representam uma exigência do Google de duração ou frequência diária de sessões. As pessoas devem jogar e relatar sua experiência real.

| Período | Cenários | Evidência a registrar |
| --- | --- | --- |
| Dias 1–3 | Primeira partida, entendimento da mira, força e pousos | Onde houve dúvida; aparelho, Android e versão |
| Dias 4–6 | Missões, nave/rastro, escudo/impulso, saldo antes/depois | Resultado esperado e observado; passos reproduzíveis |
| Dias 7–9 | Minimizar durante voo, bloquear tela, abrir Hangar, retornar, girar aparelho | Nave e corrida pausadas; retomada explícita; legibilidade |
| Dias 10–12 | Jogar offline, indisponibilidade de anúncio, consentimento e recompensa opcional | Saída recuperável; recompensa somente após conclusão; sem cobrança |
| Dias 13–14 | Atualizar sem apagar dados e repetir casos corrigidos | Versão corrigida, resultado do reteste e pendências |

Nunca peça que testadores cliquem em anúncios. Para testes de anúncios, configure aparelhos de teste no AdMob. Não automatize engajamento nem ofereça recompensas por avaliações positivas.

## Registro de feedback

Preencha uma linha por relato real. Use um identificador do participante, sem publicar e-mails ou outros dados pessoais.

| Data | Participante | Versão/aparelho/Android | Cenário e passos | Esperado | Observado | Correção/issue | Versão e resultado do reteste |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Antes da nova solicitação

- Confirme os requisitos no painel e que o período adicional foi cumprido com testes reais.
- Resuma como recrutou os participantes e quais funcionalidades eles utilizaram.
- Relate os problemas recebidos, as alterações realmente feitas e os resultados dos retestes.
- Registre pendências e explique por que considera o jogo pronto usando evidências do ciclo.
- Execute o relatório de pré-lançamento e revise travamentos/ANRs disponíveis na Play Console.

Não declare que houve feedback, atualização publicada ou reteste enquanto isso não tiver acontecido. Este repositório não comprova a participação dos testadores nem o estado atual da Play Console.
