# Fluidez Android e apresentação de quadros — 06/11/2026

## Diagnóstico confirmado

Havia dois gargalos diferentes. O Canvas 2D mantinha custo alto na cadeia de rasterização/composição, mesmo com física barata e caches. Além disso, nesta WebView Huawei, o Pixi podia executar aproximadamente 60 callbacks/desenhos JavaScript por segundo enquanto a janela entregava cerca de 30 buffers por segundo ao SurfaceFlinger. Trocar o renderizador sem verificar a janela teria produzido uma conclusão incorreta de “60 FPS”.

Uma comparação controlada no mesmo APK confirmou a segunda causa: desabilitar a sincronização nativa mantém o intervalo da janela perto de 33,3 ms; habilitá-la reduz esse intervalo para aproximadamente 16,7 ms. A sincronização usa `Choreographer` para invalidar a View no ritmo da tela. Ela não avança a simulação física.

FPS JavaScript, duração de comandos de desenho, buffers apresentados e quadros visualmente distintos não são medidas intercambiáveis. Uma experiência com invalidação forçada no Canvas demonstrou isso: a janela podia produzir buffers rapidamente enquanto o conteúdo JavaScript ficava lento. Essa combinação foi rejeitada. O pulso de produção acompanha somente o renderizador Pixi e seu loop ativo.

## Ambiente e método

- MatePad Huawei AGS6-W09, Android 10 / API 29, Huawei WebView 114.0.5.302, GPU Mali-G51.
- Tela física em paisagem: 1920 × 1200. Área lógica observada: aproximadamente 1098,286 × 686,286. Canvas Balanceada: 1386 × 866, ou 1.200.276 pixels.
- PixiJS 8.22.0 local, antialias confirmado pelo contexto WebGL real. Sem CDN.
- APK debug, progresso preservado por cópia isolada durante os cenários. Spacedesk fechado com autorização do usuário.
- As primeiras coletas usaram uma janela flutuante de 536.796 pixels. Elas ficaram como exploração e não representam a comparação em tela cheia.
- As coletas seguintes usam `--windowingMode 1`, mesma qualidade, seed 12345 e duração por cenário. Capturas de tela ficam desligadas nas medições principais.
- Três segundos de aquecimento e janelas de cinco segundos no registrador JavaScript. As estatísticas globais da janela Android também incluem aquecimento/inicialização; não devem ser comparadas como se tivessem o mesmo recorte temporal.
- Temperatura, bateria, WebView, hashes dos APKs e condições de cada execução constam dos JSONs. Não houve bloqueio de frequência nem alteração do modo de energia para favorecer um resultado. A ordem dos renderizadores foi alternada entre os ensaios.

## Comparação controlada de apresentação

Cena `stress`, 20 s medidos, Balanceada, tela cheia. A tabela abaixo usa as três janelas após a primeira janela de inicialização da cena. Os intervalos nativos foram extraídos da segunda coluna dos timestamps da camada da Activity, enquanto o jogo estava em execução.

| Configuração | FPS JavaScript nas janelas estáveis | p95 da apresentação da janela |
| --- | --- | --- |
| Canvas com invalidação nativa forçada | 45,46–48,53 | 33,37–33,39 ms |
| Pixi com sincronização nativa desabilitada | 59,95–60,07 | 33,36–33,63 ms |
| Pixi com sincronização de produção | 59,81–60,01 | 16,69–16,71 ms |

Fontes: `benchmarks/nov06-canvas-native-cadence.json`, `benchmarks/nov06-pixi-native-off-control.json`, `benchmarks/nov06-pixi-production-cadence.json`. A diferença entre as duas últimas condições é o controle debug que desabilita o pulso nativo. O cenário e a resolução permanecem iguais.

As médias globais do SurfaceFlinger, incluindo abertura/aquecimento, foram respectivamente 47,939 / 27,791 / 56,940 buffers/s. Nas janelas estáveis, o Pixi sincronizado ficou próximo do ritmo de 60 Hz. Não usamos a média global para esconder os picos da abertura.

Em uma suíte anterior do mesmo trabalho, o `gfxinfo` do processo pai apresentou p95 de 53 ms e 83,61% de quadros classificados como janky no Canvas, contra p95 de 11 ms e 1,95% no Pixi. Esses números descrevem o pipeline HWUI do processo; não medem isoladamente GPU nem latência física de toque. Fontes: `benchmarks/nov06-full-final-canvas.json` e `benchmarks/nov06-full-final-pixi-aa.json`.

## Arquitetura escolhida

Pixi/WebGL é o renderizador preferido. Canvas permanece como fallback funcional para indisponibilidade, erro de inicialização ou perda do contexto. O Canvas continua visível até o primeiro desenho WebGL bem-sucedido. A troca de renderizador não recria o estado físico nem os saves.

`RenderPulseBridge` faz a ligação com a apresentação Android. O JavaScript solicita a cadência somente quando o modo muda, sem atravessar a bridge a cada quadro. A cadência para em pausa, background, perda de foco e painéis que cobrem o jogo. O perfil Econômica com limite explícito solicita 30 FPS; o modo normal acompanha o display, incluindo telas mais rápidas. O código usa o thread de UI e remove callbacks ao pausar/destruir a Activity.

O pulso não é aplicado normalmente ao Canvas. Forçá-lo nessa cadeia não resolveu o custo de desenho no controle curto. Uma coleta prolongada anterior não monitorava o estado da tela; posteriormente o aparelho foi encontrado com a tela desligada. Esse registro foi excluído da comparação final, sem atribuir sua degradação à retomada ou ao renderizador.

O Canvas recebeu camadas reutilizáveis para o fundo: gradiente estático, tile periódico de estrelas e sprites de nebulosas. O movimento da câmera altera a composição sem repintar centenas de estrelas. Essa mudança isolada não resolveu o gargalo de apresentação no MatePad; não lhe atribuímos o ganho obtido com Pixi e sincronização nativa. O tile adicional ocupa aproximadamente 3 MB nesse tamanho de tela.

## Medição e ferramentas

O registrador agora separa o relógio dos callbacks RAF do relógio da simulação. Iniciar outra viagem/fixture pode reiniciar o relógio físico, mas não pode apagar o tempo gasto no frame das estatísticas. Uma regressão reproduz 20 ms de trabalho entre frames: o medidor deve mostrar aproximadamente 27 quadros/s, não 60. A física mantém sua política anterior de reset.

O benchmark de voo relança depois de um pouso. Antes ele podia permanecer em órbita após o primeiro pouso. Assim, as métricas antigas de `flight` não são uma comparação rigorosa de voo contínuo contra o driver novo. Os controles em `stress` acima não têm esse problema.

As medições usam:

- CPU JavaScript: Chrome DevTools CPU Profiler, arquivos em `profiles/*.cpuprofile`.
- Preparação de desenho: tempo JavaScript em torno da submissão; não é tempo de GPU.
- Janela Android: `gfxinfo`, timestamps e histogramas `present2present` do SurfaceFlinger.
- Inicialização: atrace Android, com resumo em `profiles/nov06-startup-summary.json`. O trace bruto fica fora do Git, em `.gradle/perf/`.
- Memória: API JS aproximada e `dumpsys meminfo` do processo pai. Um renderer WebView separado pode não estar incluído no PSS desse processo.

O trace de abertura registrou seções inclusivas `WebViewChromium.init` de até 146,55 ms, `WebViewFunctor::drawGl` de até 125,45 ms e `DrawFrame` de até 130,35 ms. São durações decorridas inclusivas, não utilização exclusiva de CPU/GPU. Ainda há picos curtos na abertura; não foi demonstrada ausência de todo hitch desde o primeiro frame.

O DevTools confirmou antialias habilitado e Mali-G51. No perfil estável observado, a preparação JavaScript do Pixi custava mais que a do Canvas, apesar de apresentar melhor cadência. Isso confirma que escolher apenas pelo tempo de `draw()` teria sido insuficiente. Não coletamos um contador confiável de utilização/tempo exclusivo da GPU.

A checagem final `profiles/nov06-final-save-visual.json` confirmou Pixi 8.22.0, antialias, Mali-G51 e 1386 × 866 pixels no APK instalado. O save permaneceu com comprimento 378 e checksum `83167ad5` antes, durante e após restaurar o benchmark. Esse checksum local verifica igualdade, não expõe o conteúdo do save. A captura `profiles/nov06-final-save-visual.png` foi feita via screencap Android: o screenshot do DevTools nesta WebView pode omitir a superfície WebGL. O perfil e a captura ficam fora da comparação de FPS porque alteram a carga.

No mesmo APK final, a extensão `WEBGL_lose_context` provocou uma perda real de contexto durante a abertura normal. O log confirmou `renderer-fallback: WebGL context lost`, seguido de frames Canvas no menu, sem erro fatal/JavaScript. Fonte: `profiles/nov06-final-context-loss.json`. Ao entregar, o aplicativo foi reiniciado sem parâmetros de diagnóstico e deixado em primeiro plano, com tela ligada. A instalação debug não substitui o pacote de produção.

## Jogabilidade e progresso

- A câmera usa tempo real para suavizar a transição, enquanto a simulação durante a mira continua com o fator anterior de 18%. O tempo aproximado para chegar a 95% da transição deixa de variar de 0,85 s para 4,75 s ao segurar a mira.
- O recorde da partida é comparado com o valor capturado no início. Empatar não recebe “Novo recorde”. A primeira superação recebe um aviso verdadeiro, preservando instruções de novos fenômenos no mesmo pouso.
- A derrota informa empate ou uma próxima meta real. Não foram alteradas recompensas, preços, dificuldade, gravidade, colisões ou frequência de anúncios.
- Auto recupera qualidade até Balanceada. Alta permanece uma escolha explícita: atingir o limite de vsync não prova folga de GPU para quase dobrar pixels.

As hipóteses e testes estão em `GAME_FEEL_PLAN_2026-11-06.md`. Não foram duplicados os sistemas existentes de combos, eventos, missões ou cosméticos.

## Validação prolongada e estado de entrega

Uma sessão de 600 s com Pixi antes da sincronização nativa terminou sem crash/perda de contexto, mas seu contador JS próximo de 60 não representava os aproximadamente 30 buffers/s observados na janela. Ela também precede a separação dos relógios RAF/simulação. Não deve ser usada como prova de 60 FPS visíveis. As coletas prolongadas sem monitoramento de tela/foco foram excluídas da comparação final.

O coletor final verifica `dumpsys power` e o foco da janela a cada cinco segundos, interrompendo a execução se o jogo perder o primeiro plano fora da passagem programada pelo background. A Activity usa `FLAG_KEEP_SCREEN_ON` para impedir suspensão automática enquanto sua janela estiver visível, sem alterar o tempo de bloqueio do sistema nem impedir o botão físico de desligar a tela.

As sessões finais de 600 s terminaram com o mesmo APK, seed, perfil Balanceada e 1.200.276 pixels. A ordem foi Canvas e depois Pixi, alternando a ordem da comparação prolongada exploratória anterior. Ambas incluíram ida programada ao background e retorno. Todas as verificações de tela/foco foram válidas: 105 no Canvas e 102 no Pixi. Nenhum erro JavaScript, crash nativo ou fallback inesperado foi registrado.

| Medida na sessão final | Canvas normal | Pixi com sincronização nativa |
| --- | --- | --- |
| FPS JS, ponderado pela duração das janelas | 14,51 | 59,42 |
| Mediana do p95 JS por janela | 83,32 ms | 16,66 ms |
| p50 da apresentação Android amostrada | 66,66 ms | 16,66 ms |
| p95 da apresentação Android amostrada | 83,34 ms | 16,69 ms |
| p99 da apresentação Android amostrada | 99,98 ms | 16,73 ms |
| Intervalos nativos válidos amostrados | 8.894 | 14.931 |

Fontes: `benchmarks/nov06-awake-canvas-final.json`, `benchmarks/nov06-awake-pixi-final.json` e `benchmarks/nov06-awake-comparison-summary.json`. Os timestamps nativos são snapshots periódicos da janela, sem pretensão de cobrir cada quadro dos dez minutos. A agregação elimina pares repetidos, timestamps zero/pendentes e intervalos maiores ou iguais a um segundo; não conecta lacunas entre snapshots. Os percentis usam o índice `floor((n−1) × p)`. Os percentis JS por janela não foram misturados como se fossem um percentil global.

Os snapshots nas extremidades podem conter transições de inicialização/restauração. Na checagem específica do menu, as três janelas JS após a primeira ficaram em 59,96 / 60,00 / 60,07 FPS. Os dois snapshots nativos intermediários deram p95 de 16,69 e 16,71 ms. O último snapshot, já na restauração do benchmark para Canvas, deu 33,33 ms e não foi usado como cadência estável do menu Pixi. Fonte: `benchmarks/nov06-awake-menu-final.json`.

No Canvas, as primeiras janelas registraram 37,48 e 46,22 FPS, caindo para cerca de 14 após a passagem pelo background. O Pixi manteve aproximadamente 59–60 FPS durante a maior parte da sessão. O retorno ao background é parte deste cenário; não extrapolamos esse comportamento do Canvas para todas as condições de uso. O ganho final combina renderizador e sincronização; o controle curto anterior isola o efeito da sincronização.

Ainda houve picos: o maior p99 JS entre janelas foi 199,96 ms no Canvas e 166,63 ms no Pixi, este na primeira janela. Portanto, os resultados sustentam melhora forte e sustentada da fluidez, sem afirmar eliminação de todo hitch.

A média global de `timestats` do Pixi reportou 62,074 buffers/s, acima dos 60 Hz do painel. Esse valor do coletor não foi usado como prova de taxa visível. Os intervalos nativos amostrados dão aproximadamente 59,83 buffers/s e concordam com os 59,42 FPS JS. Sem filmagem externa, buffers apresentados continuam distintos de quadros visualmente únicos.

O PSS do processo pai foi de 112.390 para 250.410 KiB no Canvas e de 98.324 para 273.037 KiB no Pixi. As primeiras medidas precedem o aquecimento dos recursos; dois pontos não distinguem cache de vazamento. O heap aproximado reportado pela WebView permaneceu em 19,3 MB e 29,4 MB, respectivamente, mas essa API é pouco granular. Os testes de churn verificam caches limitados; a coleta física não demonstra estabilidade ilimitada de memória.

## Reproduzir

APK debug de entrega: `app/build/outputs/apk/debug/app-debug.apk`, SHA-256 `9214697c3f950b7147fc30becb778528c6f1b3518b2c89fc6bb893b8e0f7eb2f`. Os 13 arquivos de `dist/` foram comparados byte a byte com os assets desse APK, sem diferenças. O aplicativo debug recebe o nome “Órbita Infinita (teste)” para distinguir sua instalação do aplicativo de produção.

`npm test`: 70 grupos aprovados. `assembleDebug --offline`: aprovado. `lintDebug --offline`: aprovado, sem problemas encontrados. No JDK 21 desta máquina, o Gradle exigiu `-Djava.nio.channels.spi.SelectorProvider=sun.nio.ch.WindowsSelectorProvider` em `JAVA_TOOL_OPTIONS`; a variável foi restaurada após a execução.

```powershell
npm test
.\gradlew.bat assembleDebug
python scripts/benchmark-tablet.py --renderer canvas --scenario long --quality balanced --seconds 600 --background --surface --apk app/build/outputs/apk/debug/app-debug.apk --label canvas-long
python scripts/benchmark-tablet.py --renderer pixi --scenario long --quality balanced --seconds 600 --background --surface --apk app/build/outputs/apk/debug/app-debug.apk --label pixi-long
node scripts/profile-webview.cjs pixi pixi-cpu
```

O runner aceita até 900 s. `--redraw` força invalidação para pesquisa; não representa o caminho normal do Canvas. `--no-native-pulse` desabilita a correção em debug para comparação. `--screenshots` faz readback durante a medição e deve ficar desligado nas comparações principais. O profiler usa somente o target local deste jogo e remove o encaminhamento ADB ao terminar.

A interpretação dos timestamps segue o [coletor do Chromium](https://android.googlesource.com/platform/external/chromium_org/+/d0247b1/build/android/pylib/perf/surface_stats_collector.py); a coleta `present2present` segue a [orientação Android para FPS de jogos](https://developer.android.com/topic/performance/issues/slow-session). O agendamento usa a API [Choreographer](https://developer.android.com/reference/android/view/Choreographer).

## Limitações explícitas

O aparelho físico validado é este MatePad. 90/120 Hz e outras GPUs ainda precisam de teste físico, embora a simulação e apresentação tenham regressões automatizadas em frequências diferentes. Não medimos latência dedo–fóton com câmera de alta velocidade nem contamos visualmente todos os quadros únicos. AdMob/consentimento mantêm os contratos existentes e testes de bridge; esta revisão não é uma certificação de monetização real. A aprovação do Google Play depende do processo de testes reais da plataforma.
