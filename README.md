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

## Integrações

- AdMob com anúncios premiados e intersticiais.
- Google UMP para consentimento e opções de privacidade.
- Recompensas de poeira estelar por anúncios premiados opcionais.
- O progresso é salvo localmente no navegador.
