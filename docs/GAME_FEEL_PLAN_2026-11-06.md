# Ajustes pequenos de jogabilidade — 06/11/2026

## Hipóteses e critérios de teste

As prioridades são fluidez e preservação da física. Combos, cosméticos, missões e eventos já existem; não é necessário criar sistemas equivalentes. Nenhuma mudança de economia ou dificuldade está proposta nesta revisão.

1. **Câmera responsiva ao mirar.** Atualmente a suavização usa `worldDt`, reduzido para 18% enquanto o dedo está pressionado. A mesma transição visual leva aproximadamente 0,85 s para chegar a 95% normalmente e 4,75 s durante a mira. Hipótese: usar tempo real somente para a câmera permite enquadrar rapidamente o próximo lançamento, preservando o tempo reduzido de planetas, forças e colisões. Aceite: câmera percorre a mesma distância no mesmo tempo real com e sem mira; física mantém a redução existente e a trajetória continua consistente.
2. **Recorde verdadeiro.** `save.best` é atualizado ao pousar, mas a derrota considera `score >= save.best` como recorde novo. Um empate com o melhor resultado anterior recebe uma mensagem incorreta. Hipótese: comparar com o recorde capturado no início da partida e avisar a primeira superação no pouso reforça um objetivo real. Aceite: abaixo/empate/superação produzem mensagens distintas; um único aviso por partida; recompensas e valor persistido permanecem iguais.

A nave já gira a cada desenho conforme a direção atual do dedo. A previsão física completa continua limitada a uma atualização a cada 50 ms. Não se acrescenta uma linha redundante de mira nem se aumenta a frequência da simulação para obter feedback que já existe.

## Ordem de execução

Medir Canvas/Pixi no MatePad, selecionar a correção de renderização com evidência e então aplicar os dois ajustes acima. Após a implementação, executar regressões e validação prolongada no APK final. Medidas de software não são latência física entre dedo e emissão de luz; esta última requer instrumentação externa.

## Implementação e verificação

Os dois ajustes foram implementados em `dist/game.js`. As regressões em `scripts/test-game-integration.cjs` verificam câmera sob mira, empate, superação, aviso único e preservação das instruções de fase e recompensas. O relatório `PERFORMANCE_2026-11-06.md` reúne a escolha do renderizador, medições físicas e limites da validação. A percepção dos controles e do feedback ainda deve ser acompanhada com jogadores reais; testes automatizados não comprovam satisfação ou retenção.
