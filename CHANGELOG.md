# Histórico de mudanças

## 1.0.2 — Fluidez entre órbitas

### Mais fluidez

- PixiJS/WebGL passa a ser o renderizador preferido, mantendo Canvas como alternativa automática.
- A WebView Android acompanha a cadência da tela por meio de Choreographer.
- A sincronização para em pausa, background e painéis que cobrem o jogo.
- O fundo Canvas reutiliza camadas de estrelas, gradientes e nebulosas.
- A qualidade automática não sobe além de Balanceada. Alta permanece uma opção manual.

### Controles e feedback

- A câmera responde durante a mira sem acelerar a física do jogo.
- Empatar o recorde recebe uma mensagem própria; superar recebe um aviso verdadeiro.
- A tela permanece acordada enquanto a janela do jogo está visível.

### Confiabilidade

- Falha de inicialização ou perda de contexto WebGL aciona Canvas sem recriar a partida.
- O diagnóstico mede callbacks JavaScript separadamente da simulação e da apresentação Android.
- Saves, recompensas, preços e regras de anúncios foram preservados.

### Validação

70 grupos de testes aprovados, build debug e lint aprovados, duas sessões de dez minutos no MatePad e checagens de menu, save e perda de contexto. No cenário medido, o p95 da apresentação Android amostrada passou de 83,3 ms no Canvas para 16,7 ms no Pixi sincronizado. Há picos na abertura; desempenho varia conforme aparelho e WebView.

Detalhes: [relatório técnico](docs/PERFORMANCE_2026-11-06.md).
