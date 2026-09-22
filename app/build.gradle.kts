import java.util.Properties

plugins {
    id("com.android.application")
}

val localEnv = Properties().apply {
    val envFile = rootProject.file(".env")
    if (envFile.exists()) envFile.inputStream().use { load(it) }
}

fun envValue(name: String, fallback: String): String =
    providers.environmentVariable(name).orNull
        ?: providers.gradleProperty(name).orNull
        ?: localEnv.getProperty(name)
        ?: fallback

val releaseKeystore = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.orbita.infinita"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.orbita.infinita"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        manifestPlaceholders["ADMOB_APP_ID"] = envValue(
            "ADMOB_APP_ID",
            "ca-app-pub-3940256099942544~3347511713",
        )

        buildConfigField(
            "String",
            "ADMOB_REWARDED_AD_UNIT_ID",
            "\"${envValue("ADMOB_REWARDED_AD_UNIT_ID", "ca-app-pub-3940256099942544/5224354917")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_INTERSTITIAL_AD_UNIT_ID",
            "\"${envValue("ADMOB_INTERSTITIAL_AD_UNIT_ID", "ca-app-pub-3940256099942544/1033173712")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_TEST_REWARDED_AD_UNIT_ID",
            "\"${envValue("ADMOB_TEST_REWARDED_AD_UNIT_ID", "ca-app-pub-3940256099942544/5224354917")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_TEST_INTERSTITIAL_AD_UNIT_ID",
            "\"${envValue("ADMOB_TEST_INTERSTITIAL_AD_UNIT_ID", "ca-app-pub-3940256099942544/1033173712")}\"",
        )
    }

    signingConfigs {
        if (releaseKeystore.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(releaseKeystore.getProperty("storeFile"))
                storePassword = releaseKeystore.getProperty("storePassword")
                keyAlias = releaseKeystore.getProperty("keyAlias")
                keyPassword = releaseKeystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("boolean", "ADMOB_USE_TEST_ADS", "true")
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            buildConfigField("boolean", "ADMOB_USE_TEST_ADS", "false")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (releaseKeystore.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main").assets.srcDir(rootProject.file("dist"))
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // API 37 está instalado localmente como preview, mas a Play exige API 36 em 2026.
        disable += "OldTargetApi"
    }
}

dependencies {
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.webkit:webkit:1.17.0")
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")
}
