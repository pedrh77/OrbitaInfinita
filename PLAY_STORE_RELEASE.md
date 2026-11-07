# Publicação na Google Play

## Identidade do aplicativo

- Nome: Órbita Infinita
- Application ID: `com.orbita.infinita`
- Versão preparada: `1.0.2` (`versionCode 3`; conferir disponibilidade na Play antes do upload)
- Target SDK: Android 16 / API 36
- Formato: Android App Bundle (`.aab`)

O Application ID não deve ser alterado depois da primeira publicação.

## Situação em 06/11/2026

A nova solicitação de acesso à produção foi enviada pelo Console. O Google confirmou o recebimento e informa que a análise geralmente leva até sete dias, podendo demorar mais. Esse envio solicita acesso; não publica automaticamente o binário novo.

O código da versão 1.0.2 e as notas estão preparados. A configuração `keystore.properties` e a chave de upload deste aplicativo não foram encontradas no projeto nem na busca nos locais comuns do computador. Não use a chave de outro aplicativo nem crie uma substituta sem verificar o certificado esperado na Play. O AAB gerado sem essa configuração não está assinado e não pode ser enviado como atualização válida.

`bundleRelease --offline` e `lintRelease --offline` concluíram com sucesso; o lint não encontrou problemas. AAB preparado: `app/build/outputs/bundle/release/app-release.aab`, SHA-256 `2ff40c764e08622d586ab23d54e1652ee44602a1411623c274465506fee75c2d`. A inspeção do ZIP confirmou ausência de blocos de assinatura em `META-INF`. Este arquivo é um artefato de preparação, não um pacote pronto para upload.

As notas para a loja estão em [store-assets/release-notes/pt-BR.txt](store-assets/release-notes/pt-BR.txt). O [histórico](CHANGELOG.md) e o [relatório técnico](docs/PERFORMANCE_2026-11-06.md) documentam as mudanças e os testes executados.

Para concluir o envio Android: localizar a configuração de assinatura original, conferir o certificado de upload e o maior versionCode na Play, gerar/verificar o AAB assinado e enviar à faixa apropriada. Se a chave foi perdida, será necessário seguir a recuperação oficial da chave de upload no Play Console.

## 1. Monetização da primeira versão

Esta versão não contém compras nem produtos pagos. A monetização usa somente AdMob:

- anúncio intersticial ao fim de cada 2 partidas;
- anúncio premiado opcional que concede 150 de poeira estelar;
- anúncio premiado opcional para continuar uma partida.

## 2. Configurar privacidade no AdMob

No AdMob, abra **Privacidade e mensagens** e publique a mensagem de consentimento aplicável. O aplicativo consulta o UMP em toda inicialização, não carrega anúncios antes da autorização e mostra “Opções de privacidade” quando o SDK exigir.

Os builds `debug` sempre usam IDs oficiais de teste. O build `release` usa os IDs de produção do `.env`.

## 3. Criar a chave de upload

Crie uma chave e mantenha uma cópia segura fora do repositório:

```powershell
keytool -genkeypair -v -keystore orbita-upload.jks -alias orbita-upload -keyalg RSA -keysize 4096 -validity 10000
Copy-Item keystore.properties.example keystore.properties
```

Edite `keystore.properties` com o caminho e as senhas escolhidas. Os arquivos de chave e configuração estão ignorados pelo Git.

## 4. Gerar o pacote

```powershell
.\gradlew.bat clean bundleRelease
```

Saída esperada:

`app/build/outputs/bundle/release/app-release.aab`

Antes do envio, confira a assinatura:

```powershell
jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab
```

## 5. Declarações da Play Console

- Enviar as artes de `store-assets/` seguindo a ordem e os textos alternativos descritos em `store-assets/README.md`.
- Marcar que o aplicativo contém anúncios.
- Informar a política: `https://pedrh77.github.io/OrbitaInfinita/privacy.html`.
- Preencher Segurança dos dados considerando Google Mobile Ads e UMP.
- Preencher público-alvo, classificação de conteúdo e acesso ao app.
- Informar site, e-mail de suporte e categoria “Jogo casual”.
- Ativar Play App Signing.

## 6. Testes obrigatórios

1. Enviar primeiro para teste interno.
2. Instalar pelo link da Play Store para validar exatamente o pacote que chegará aos usuários.
3. Testar anúncios premiados, intersticiais e consentimento em aparelhos reais.
4. Confirmar que a recompensa só é concedida depois de assistir ao anúncio completo.
5. Se a conta pessoal foi criada depois de 13/11/2023, manter pelo menos 12 testadores no teste fechado por 14 dias contínuos antes de solicitar produção.

Após a resposta solicitando mais testes, siga [CLOSED_TESTING.md](CLOSED_TESTING.md) para organizar o período adicional, registrar feedback real e validar correções. Os requisitos de inscrição não substituem o uso efetivo do jogo pelos testadores.

## 7. Pendência externa: app-ads.txt

O AdMob procura `app-ads.txt` na raiz do domínio do site do desenvolvedor. Para o domínio atual, o arquivo deve responder em:

`https://pedrh77.github.io/app-ads.txt`

Uma página hospedada apenas em `/OrbitaInfinita/` não atende essa verificação. Crie o site de usuário `pedrh77.github.io` ou use um domínio próprio e publique ali o trecho personalizado fornecido pelo AdMob.
