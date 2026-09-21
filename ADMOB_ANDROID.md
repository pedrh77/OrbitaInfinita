# AdMob no app Android

O site/PWA não carrega o SDK nativo do AdMob. O arquivo `dist/admob.js` expõe a ponte usada pelo jogo e, dentro do APK Android, espera um objeto JavaScript chamado `OrbitaNativeAds`.

## Configuração

1. Leia os valores do `.env` no build Android e exponha-os como `BuildConfig.ADMOB_*`.
2. Adicione `implementation("com.google.android.gms:play-services-ads:25.5.0")` ao módulo do app.
3. No `AndroidManifest.xml`, dentro de `<application>`, adicione:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="${ADMOB_APP_ID}" />
```

4. Inicialize `MobileAds` somente depois de concluir o fluxo de consentimento aplicável.
5. Registre `AdMobBridge` no `WebView` antes de abrir o jogo:

```kotlin
MobileAds.initialize(this) {}
webView.settings.javaScriptEnabled = true
webView.addJavascriptInterface(AdMobBridge(this, webView), "OrbitaNativeAds")
```

Durante desenvolvimento, use os IDs de teste definidos no `.env`. Mude `ADMOB_USE_TEST_ADS` para `false` somente no build de produção validado.

## Regras implementadas no jogo

- O anúncio premiado é voluntário e informa a recompensa antes de abrir.
- A recompensa só é creditada após `onUserEarnedReward`.
- O intersticial aparece apenas na tela de fim, a cada quatro partidas.
- “Remover anúncios” desativa intersticiais, mas mantém anúncios premiados opcionais.
