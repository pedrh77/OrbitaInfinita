# Desempenho e jogabilidade — 02/11/2026

## O que a revisão encontrou

A análise compartilhada descreve parte de uma versão anterior. O projeto local já tinha orçamento de 1,2 milhão de pixels, física com passos fixos de 1/120 s, brilhos/nebulosas em sprites e previsão com prazo de cache de 50 ms. O antigo `Math.min(.034, ...)` já não era usado.

Ainda havia problemas concretos:

| Problema confirmado no código | Correção desta etapa |
| --- | --- |
| Cada `pointermove` invalidava o prazo da previsão; arrastar podia voltar a calcular a cada quadro | Entrada continua imediata, mas o recálculo respeita 50 ms. Pressionar, pousar e mudar o mundo ainda invalidam a previsão. |
| A linha da previsão enviava até 184 vértices para desenho a cada quadro | Simulação continua completa; linha visual usa até 46 segmentos e geometria `Path2D` reutilizada. Há fallback sem `Path2D` e o ponto de colisão final é mantido. |
| Corpos de planetas recriavam gradientes por quadro | Sprites compartilhados por cor/tipo e faixa de raio; cache limitado a 64 variantes, com referências fracas para planetas. O desenho é escalado ao raio real, sem alterar colisões. Anéis e superfícies continuam animados. |
| Fundo repetia composição de nebulosas e centenas de pequenos desenhos de estrelas | Camada opaca reutilizada por até 50 ms quando a câmera está parada. Movimento da câmera força atualização para preservar parallax; cometas continuam na frequência normal. |
| Objetos totalmente fora da câmera ainda eram desenhados | Culling com margens conservadoras para halos, luas, anéis e feixes. Apenas desenho é descartado; física continua considerando os objetos. |
| Filtro de partículas alocava um novo array a cada passo de física | Compactação no próprio array e amortecimento calculado uma vez por atualização. |
| Toda persistência reescrevia textos/atributos do HUD, mesmo sem mudança | Atualização apenas dos valores que mudaram. A gravação do progresso continua imediata. |
| Uma engasgada de pouco mais de 250 ms exigia retomada manual | Recuperação limitada a 250 ms sem pausa indesejada em interrupções curtas. Interrupções acima de 1 s e saída do aplicativo continuam pausando. |

O limite de recuperação evita simular uma quantidade ilimitada de passos depois de uma engasgada. Uma interrupção curta acima desse orçamento descarta o excesso, em vez de avançar a nave abruptamente; não há alteração na trajetória em funcionamento contínuo.

## Medições no tablet

Dispositivo: AGS6-W09, paisagem, 1920 × 1200. Em ambas as versões o canvas manteve aproximadamente 1,2 milhão de pixels. O aparelho estava conectado por USB, com bateria em 1%, temperatura reportada de 32 °C e `low_power=0` na leitura efetuada. Não foi alterada configuração de energia.

| Menu parado | Três janelas consecutivas de FPS | P95 dos intervalos de quadro |
| --- | --- | --- |
| APK anterior, coletado em 02/11 | 51,4 / 55,6 / 55,4 | 33,33 ms nas três |
| Nova renderização e caches | 55,4 / 59,4 / 60,0 | 16,67 ms nas três |

Fontes: `performance-nov02-before.json` e `performance-nov02-final.json`. São amostras curtas no mesmo aparelho e cena de menu, sem controle de temperatura ao longo de toda a execução ou de processos externos. Não representam garantia de 60 FPS durante uma viagem inteira.

Na nova coleta de menu, o fundo foi reconstruído 72–76 vezes por janela de aproximadamente 5 s, enquanto 278–301 quadros foram apresentados. Nenhum corpo de planeta precisou ser reconstruído nessas janelas. Os detalhes decorativos lentos reutilizam a camada; os elementos de primeiro plano continuam sendo desenhados a cada quadro.

A coleta intermediária em `performance-nov02-after.json` inclui jogo ativo e tela de derrota, não o menu: 34,9 FPS em viagem e 60 FPS na derrota. Ela foi feita antes do último compartilhamento de texturas e da geometria de trajetória em cache. Não foi usada para calcular um ganho contra o menu.

A primeira coleta de órbita em `performance-nov02-orbit.json`, antes da última otimização da linha, registrou 44,3 FPS e P95 de 33,33 ms. Isso identifica um limite restante: resultado do menu não deve ser apresentado como resultado de jogabilidade.

Na versão final, `performance-nov02-path.json` registrou **55,7 / 43,5 / 50,0 FPS** em três janelas de partida, todas com P95 de 33,33 ms. Houve navegação entre planetas durante a coleta; a segunda janela reconstruiu o fundo 190 vezes por movimento de câmera, contra 70–74 nas outras. Portanto essa coleta não é um ensaio de órbita parada idêntico ao anterior, nem comprova isoladamente um ganho causado por `Path2D`. A estabilidade durante a viagem continua inferior à do menu.

## Verificação e entrega

- `node scripts/test-game.cjs`: 17 grupos passaram. Incluem equivalência de física a 20/30/60/120 FPS, previsão contra voo real com forças/portal/planeta móvel, gesto, rotação, pausa, orçamento da previsão sob eventos a 120 Hz, reutilização de textura, fundo/parallax, culling sem remover gravidade e reutilização do caminho visual com ponto final correto.
- `node scripts/test-admob.cjs`: passou.
- `assembleDebug` e `lintDebug`: passaram; lint sem erros, com aviso preexistente de versão disponível para AndroidX WebKit.
- Inspeção visual no tablet: menu e tela de derrota mantêm layout e aparência do jogo; o cache preserva animações de primeiro plano.
- A nova versão debug foi instalada preservando os dados. Nada foi publicado nem enviado ao GitHub.
- Todos os assets do APK final foram comparados byte a byte com os arquivos de `dist/`, sem diferenças. SHA-256 do APK: `6ddad6c3f4409560856ab77c3caabb4fcd020a08da68146ace9ad7975af4c438`.

O coletor local de diagnóstico também foi corrigido: mudanças de estado e pausas reiniciam a janela. Novos registros não misturam tempo em background/menu/partida na mesma estatística. Os contadores adicionais medem reconstruções de fundo, corpos e previsão, sem transmitir dados.

## Limites

Ainda é necessário avaliar sessões longas e setores mais complexos na versão final, com percentis de quadro e condições de carga semelhantes. Os testes de trajetória e FPS simulados comprovam consistência da física, não velocidade real da GPU. Não foi demonstrada eliminação de todas as engasgadas nem 60 FPS constantes na partida.
