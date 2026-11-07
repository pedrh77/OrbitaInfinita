# Fluidez: implementação e evidências — 02/11/2026

> Registro histórico. A revisão atual, incluindo comparação física, apresentação Android e evolução para Pixi, está em [PERFORMANCE_2026-11-06.md](PERFORMANCE_2026-11-06.md). O estado de entrega abaixo descreve a etapa anterior.

## Estado da entrega

Branch: `performance/optimize-rendering`, partindo de `40f5996`. Canvas continua sendo o renderizador normal. As mudanças estão locais; não foram publicadas nem mescladas na main.

Código implementado, 60 grupos de testes aprovados e APK debug compilado. Os 13 arquivos de `dist/` foram comparados byte a byte com os assets do APK. **A versão atual ainda não foi instalada nem medida no MatePad.** Não há evidência suficiente para declarar que os travamentos no tablet foram eliminados.

Em 02/11, a lista de dispositivos ADB estava vazia. O endereço informado pelo usuário, `192.168.0.7`, recusou conexão ADB em `5555`; a descoberta mDNS não encontrou depuração sem fio. Estar na mesma rede não ativa esse serviço. É necessário obter a porta correta ou autorizar uma conexão USB de dados para ativar ADB por Wi-Fi. Nenhuma configuração de rede/energia do aparelho foi alterada.

APK: `app/build/outputs/apk/debug/app-debug.apk`, pacote `com.orbita.infinita.debug`.

SHA-256: `1e286fd48c644a745be0738967db3297b3cd3ef6bee2fbd9fb5441c5902b6bf2`.

Baseline instrumentada preservada localmente em `.gradle/perf/legacy-instrumented.apk` (ignorada pelo Git), SHA-256 `f831b4645f4802e62dc3591fcce998cf5df42cede15f5fccd73a572b3f798056`. Sua coleta iniciada anteriormente não deixou resultado disponível nesta retomada. Não reconstruir números a partir dessa tentativa.

## Mudanças aplicadas

- Perfis Alta, Balanceada e Econômica, com seleção automática ou manual, persistida em chave separada do progresso. O modo automático começa Balanceada, reduz um nível após lentidão sustentada e usa espera maior para recuperar qualidade. Não altera regras, forças, colisões nem recompensas.
- Limites de aproximadamente 2,2 / 1,2 / 0,65 milhões de pixels, respectivamente; DPR máximo 2 / 1,5 / 1. Redução proporcional de estrelas, brilho e partículas. Todos os tipos de ameaças permanecem visíveis.
- Limite opcional de 30 FPS somente no perfil Econômica. Física permanece em passos de 1/120 s. Em telas mais rápidas, o modo normal acompanha o RAF, sem impor 60 FPS.
- Interpolação de nave em voo, câmera e entidades por fachadas reutilizadas, sem escrever nos objetos físicos. Evita deslocamentos visuais alternados em telas de 90 Hz. Novas entidades, teletransporte e transições de modo não interpolam contra posições antigas. Atraso visual limitado a um passo físico.
- Pool de partículas e teto proporcional ao perfil: 256 / 218 / 141 ativas. Pool limitado a 256 objetos. Reutilização invalida a posição anterior da interpolação.
- Contador de evento escreve no DOM somente quando o texto muda. Teste de um segundo confirma até 12 escritas, em vez de uma por passo de 120 Hz.
- Removido cálculo prévio de trajetória no menu. Teste integrado confirma zero simulações de previsão no cenário de menu.
- Mantidos os caches anteriores de corpos planetários, halos, fundo e geometria da previsão, além de culling e física compartilhada entre previsão e voo. Os caches têm limites; objetos fora da câmera continuam exercendo gravidade.
- Mudança de resolução ocorre antes do próximo desenho, evitando limpar o canvas logo depois de apresentar um quadro.
- Painel de gráficos com opções explícitas e medidor opcional de FPS/p95.

## Medição reproduzível

`dist/performance.js` registra intervalos entre apresentações, FPS médio, mínimo instantâneo, p50/p95/p99, maior intervalo e quantidade acima de 33,5 ms. Separa atualização física, cálculo da previsão e preparação JavaScript do desenho. **Preparação do desenho não é tempo de GPU.** Memória JS é opcional; contagem de GC indisponível fica `null`.

`dist/benchmark.js` executa menu, início em órbita, mira, voo, cenário avançado e partículas. Usa semente fixa, entradas por passo físico, três segundos de aquecimento e janelas de cinco segundos. O cenário longo alterna mira/voo/cenário avançado durante 120 s por padrão. Cópia temporária do progresso impede salvar recompensas ou preferências do teste; conclusão, cancelamento e falha restauram o estado capturado. Inícios simultâneos não sobrescrevem essa cópia. Interrupções superiores a um segundo são registradas sem avançar a física durante o intervalo perdido; no jogo normal continuam provocando pausa segura.

O script `scripts/benchmark-tablet.py` coleta logs locais, capturas, `dumpsys meminfo`, `gfxinfo` e erros Java/JavaScript do processo debug. Memória nativa desse processo não representa toda a memória de um renderer WebView separado. `gfxinfo` também não substitui uma análise de GPU/compositor. Não há telemetria remota nova.

Após estabelecer o endpoint ADB autorizado, executar no mesmo aparelho, orientação e condições:

```powershell
python scripts/benchmark-tablet.py --serial IP:PORTA --renderer canvas --scenario suite --quality balanced --seconds 20 --label candidate-canvas
python scripts/benchmark-tablet.py --serial IP:PORTA --renderer pixi --scenario suite --quality balanced --seconds 20 --label candidate-pixi
python scripts/benchmark-tablet.py --serial IP:PORTA --renderer canvas --scenario long --quality eco --seconds 120 --background --label candidate-long-eco
```

Para o antes/depois, instalar primeiro a baseline preservada e coletar a mesma suíte Canvas, depois instalar o APK candidato e repetir. Registrar hashes dos APKs. A baseline precede as reduções de efeitos do perfil Balanceada; para isolar mudanças de arquitetura, comparar também pixels/efeitos equivalentes. Não misturar resultados de menu com os de voo. Repetir a ordem dos renderizadores para avaliar aquecimento. Finalizar abrindo o app sem extras de benchmark.

## PixiJS 8: protótipo, sem promoção

Versão exata 8.22.0, bundle e licença MIT locais em `dist/vendor/`. Carregamento sob demanda somente quando o diagnóstico solicita Pixi. O protótipo usa camadas, sprites, texturas e pools; não envia um canvas de tela inteira para uma textura a cada quadro. O loop principal controla o desenho; não há segundo ticker. Falha de inicialização/perda de contexto retorna a Canvas e invalida a comparação, em vez de registrar Canvas como Pixi.

Teste real de funcionamento no navegador de desktop, cena `stress`, seed 12345, perfil Balanceada, canvas de 921.600 pixels, 3 s de aquecimento + 5 s medidos, mesma página e script carregado (`game.js?v=10`, antes dos últimos ajustes de ciclo de vida/interpolação):

| Métrica | Canvas | Pixi WebGL |
| --- | ---: | ---: |
| FPS médio | 144 | 144 |
| Mínimo instantâneo | 136,99 | 140,85 |
| Intervalo p95 / p99 | 7 / 7,1 ms | 7 / 7,1 ms |
| Atualização p95 | 0,1 ms | 0,1 ms |
| Previsão p95 | 0,3 ms | 0,3 ms |
| Preparação JS p95 | 0,3 ms | 1,3 ms |
| Quadros >33,5 ms | 0 | 0 |

Ambos completaram e restauraram o menu e os valores exibidos do progresso. Isso confirma inicialização e execução reais de WebGL no desktop, não desempenho Android. Amostra curta, sem trace de GPU e limitada pela atualização da tela. Os valores de heap instantâneos diferiram, mas ordem de execução/GC impedem atribuir essa diferença ao renderizador.

Não há ganho de apresentação demonstrado nessa amostra. Antialias e tesselação de curvas ainda precisam de comparação visual no aparelho. Portanto Pixi permanece experimental; não há migração de produção aprovada por evidência.

## Verificações realizadas e pendências

`npm test`: 60 grupos aprovados. Cobrem física em frequências diferentes, previsão com fenômenos e planetas móveis, gesto/multitoque, rotação, pausa, anúncios por bridge simulada, políticas de qualidade, apresentação, pools, percentis e restauração dos diagnósticos. Mock de Pixi cobre criação, execução, resize, churn de setores e falhas; não comprova fidelidade de GPU real.

`assembleDebug --offline`: aprovado. `git diff --check`: aprovado. Todos os assets do APK correspondem às fontes finais. A origem dos assets Android é diretamente `dist/`, declarada no sourceSet; não existe cópia manual separada para manter.

O ambiente Windows exigiu `ANDROID_HOME` apontando ao SDK local e `JAVA_TOOL_OPTIONS` temporário com `-Djava.nio.channels.spi.SelectorProvider=sun.nio.ch.WindowsSelectorProvider -Djdk.net.unixdomain.tmpdir=C:\Projetos\OrbitaInfinita\.gradle\uds` para contornar falha de socket local do JDK. As variáveis foram restauradas após o comando; não houve mudança permanente no projeto para esse contorno.

Pendentes: instalar no MatePad, medir suítes A/B e sessão longa real, inspecionar p95/p99 no aparelho, verificar retomada Android e perda real de contexto, comparar capturas de todos os estilos/efeitos e validar offline no dispositivo. Não foram alterados identificadores de anúncios, consentimento, assinatura ou IDs de produção. A evidência atual não permite prometer ausência de travamentos.
