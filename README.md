# Órbita Infinita

Protótipo mobile-first de jogo casual infinito feito em Canvas 2D.

## Jogar

**[Abrir Órbita Infinita](https://pedrh77.github.io/OrbitaInfinita/)**

## Como jogar

Arraste a partir da nave para escolher direção e força. Solte para lançar e tente alcançar um novo planeta.

## Android

O projeto Android usa o pacote `com.orbita.infinita`, API 36 e inclui os arquivos de `dist/` diretamente no aplicativo.

```powershell
.\gradlew.bat assembleDebug
.\gradlew.bat bundleRelease
```

Antes de gerar a versão de produção, copie `keystore.properties.example` para `keystore.properties` e configure uma chave de upload. Consulte [PLAY_STORE_RELEASE.md](PLAY_STORE_RELEASE.md).

## Verificação e teste fechado

Execute `node scripts/test-game.cjs` e `node scripts/test-admob.cjs` para verificar física em diferentes FPS, equivalência entre trajetória e voo, multitoque, rotação, pausa, relógio e falhas de anúncios. Os testes usam um DOM e uma ponte nativa simulados e não substituem a validação no Android.

Se o Gradle no Windows falhar com `Unable to establish loopback connection` / `UnixDomainSockets`, use temporariamente no terminal:

```powershell
New-Item -ItemType Directory -Force '.gradle/tmp' | Out-Null
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Projetos\OrbitaInfinita\.gradle\tmp'
$env:ANDROID_HOME = 'C:\Users\Pedro Santos\AppData\Local\Android\Sdk'
.\gradlew.bat assembleDebug lintDebug --no-daemon --console=plain
```

Adapte os caminhos para sua máquina. As variáveis acima valem apenas para esse terminal; não alteram configurações globais.

O roteiro de participação e registro de feedback está em [CLOSED_TESTING.md](CLOSED_TESTING.md).

Medições e otimizações realizadas no tablet: [docs/TABLET_PERFORMANCE.md](docs/TABLET_PERFORMANCE.md).

Revisão de 02/11, com caches adicionais e ajustes de jogabilidade: [docs/PERFORMANCE_2026-11-02.md](docs/PERFORMANCE_2026-11-02.md).

## Integrações

- AdMob com anúncios premiados e intersticiais.
- Google UMP para consentimento e opções de privacidade.
- Recompensas de poeira estelar por anúncios premiados opcionais.
- O progresso é salvo localmente no navegador.
