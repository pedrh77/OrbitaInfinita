# Fluidez no tablet — 30/10/2026

> Nova revisão em 02/11: [PERFORMANCE_2026-11-02.md](PERFORMANCE_2026-11-02.md). Os resultados abaixo registram a etapa de 30/10.

## Diagnóstico e evidência

Tablet conectado: AGS6-W09, orientação paisagem, tela física de 1920 × 1200. O usuário confirmou lentidão também no menu. A inspeção não encontrou exceção Java nos logs filtrados do processo durante a amostra registrada em `performance-js-final.json`.

O histórico inicial do Android tinha 97,81% de quadros classificados como janky e mediana de 57 ms. Na coleta curta anterior às alterações, o menu apresentou mediana de 40 ms e a partida 61 ms no `gfxinfo`. São métricas de renderização, não prova de crash/ANR.

As medições internas opcionais do jogo registraram física barata (P95 geralmente entre 0,2 e 0,5 ms) com intervalos de quadros irregulares. Isso sustenta priorizar rasterização/composição. O tempo JavaScript de `draw` não mede todo o trabalho posterior da GPU; não foi realizado um trace GPU que isolasse o custo de cada efeito.

| Etapa | Amostras internas de FPS | Canvas | Evidência |
| --- | --- | --- | --- |
| Antes das otimizações desta etapa | 16,0 na primeira janela; 39,2 e 25,9 nas seguintes | 2.308.322 pixels, DPR 1,75 | `performance-js-before.json` |
| Limite de pixels e composição padrão | 27,7 e 41,1 | 1.200.276 pixels, DPR ~1,262 | `performance-js-after.json` |
| Brilhos em cache e inicialização de anúncios em background | 21,6; 37,9; 39,5 | 1.200.276 pixels | `performance-js-final.json` |
| Canvas opaco e remoção de backdrop blur | 31,9 na primeira janela; 53,2 na seguinte | 1.200.276 pixels | `performance-opaque.json` |

Na última coleta, a mediana do `gfxinfo` foi **18 ms**, contra 42 ms na etapa anterior; a classificação janky caiu de 92,80% para 53,89%. Ainda ocorreram picos na abertura, inclusive P95 de intervalo de 132,85 ms na primeira janela. **Não há evidência de 60 FPS constantes nem de eliminação completa dos travamentos.**

As janelas duram aproximadamente cinco segundos e incluem inicialização, partidas/interações do usuário e possíveis mudanças de tela. A coluna `state` do registro indica o estado ao encerrar a janela. Não são benchmarks de uma cena idêntica, com temperatura e processos externos controlados; portanto não se atribui um ganho percentual isolado a cada mudança nem se usa FPS médio como garantia de fluidez.

## Correções instaladas

- Canvas com orçamento aproximado de 1,2 milhão de pixels. Posição, física e dimensões lógicas permanecem iguais; textos/controles DOM continuam na resolução nativa. O cenário fica um pouco mais suave em telas grandes.
- Contexto Canvas opaco e preenchimento explícito das margens para evitar composição transparente desnecessária.
- Composição padrão do WebView, removendo `setLayerType(HARDWARE)` permanente. A aceleração da janela não foi desativada. Camadas extras têm custo de memória/composição, conforme a [documentação Android](https://developer.android.com/develop/ui/views/graphics/hardware-accel).
- Halos de planetas, nave, coletáveis e fenômenos desenhados a partir de sprites reutilizados, com cache limitado a 48 entradas. O brilho e o pulso foram preservados sem desfoque Canvas recalculado por quadro.
- Remoção do `backdrop-filter` dos controles/painéis; permanecem os fundos escuros existentes.
- Inicialização do AdMob fora da thread principal, mantendo consentimento antes do SDK e carregamento dos anúncios na thread UI após callback válido. Essa abordagem segue a [orientação do Google](https://developers.google.com/admob/android/optimize-initialization).

## Validação

- `node scripts/test-game.cjs`: 12 grupos passaram, incluindo orçamento de pixels do tablet sem alteração das coordenadas/física, FPS, trajetória, gesto, rotação e pausa.
- `node scripts/test-admob.cjs`: passou.
- `assembleDebug` e `lintDebug`: passaram; lint sem erros, com aviso de atualização disponível para AndroidX WebKit.
- Conteúdo de todos os arquivos de `dist/` comparado byte a byte com os assets do APK final: passou.
- Instalação via ADB com substituição preservando dados: `Success`. A versão foi aberta e medida no próprio tablet. Não houve publicação.

APK: `app/build/outputs/apk/debug/app-debug.apk`.

SHA-256: `71498b50368d14b921045b1e59742613c55bd217f31dbdc5f079d5cccf6d7edd`.

## Repetir o diagnóstico

Somente o build debug habilita o coletor pelo extra `orbita.profile`. O coletor emite três resumos locais no logcat, sem rede, dados pessoais ou progresso do jogador:

```powershell
adb shell am force-stop com.orbita.infinita.debug
adb shell am start -W -n com.orbita.infinita.debug/com.orbita.infinita.MainActivity --ez orbita.profile true
adb logcat -s OrbitaPerf:I
```

Para comparações futuras, manter a mesma cena aberta, aguardar a inicialização terminar e registrar tanto percentis como FPS. Ainda é necessário perfilar os picos da abertura e sessões longas, em vez de apenas reduzir a média do tempo de quadro.
