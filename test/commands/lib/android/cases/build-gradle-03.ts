import { IBuildGradle } from "./../../../../../src/commands/lib/android/models/build-gradle";
import { IBuildGradleCase } from "./models";

const name = "case #03 (https://github.com/owncloud/android)";

const content = `
// Gradle build file
//
// This project was started in Eclipse and later moved to Android Studio. In the transition, both IDEs were supported.
// Due to this, the files layout is not the usual in new projects created with Android Studio / gradle. This file
// merges declarations usually split in two separates build.gradle file, one for global settings of the project in
// its root folder, another one for the app module in subfolder of root.

buildscript {
    repositories {
        jcenter()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:2.2.3'
    }
}

apply plugin: 'com.android.application'

ext {
    supportLibraryVersion = '24.2.1'
}

repositories {
    jcenter()

    flatDir {
        dirs 'libs'
    }
}

configurations.all {
    resolutionStrategy {
        force "com.android.support:support-annotations:\${supportLibraryVersion}"
    }
}

dependencies {
    /// dependencies for app building
    compile name: 'touch-image-view'
    compile project(':owncloud-android-library')
    compile "com.android.support:support-v4:\${supportLibraryVersion}"
    compile "com.android.support:design:\${supportLibraryVersion}"
    compile 'com.jakewharton:disklrucache:2.0.2'
    compile 'com.google.android.exoplayer:exoplayer:r2.2.0'
    compile "com.android.support:appcompat-v7:\${supportLibraryVersion}"
    compile 'com.getbase:floatingactionbutton:1.10.1'


    /// dependencies for local unit tests
    testCompile 'junit:junit:4.12'
    testCompile 'org.mockito:mockito-core:1.10.19'


    /// dependencies for instrumented tests
    // JUnit4 Rules
    androidTestCompile 'com.android.support.test:rules:0.5'

    // Android JUnit Runner
    androidTestCompile 'com.android.support.test:runner:0.5'

    // Espresso core
    androidTestCompile 'com.android.support.test.espresso:espresso-core:2.2.2'

    // UIAutomator - for cross-app UI tests, and to grant screen is turned on in Espresso tests
    androidTestCompile 'com.android.support.test.uiautomator:uiautomator-v18:2.1.2'

    // fix conflict in dependencies; see http://g.co/androidstudio/app-test-app-conflict for details
    androidTestCompile "com.android.support:support-annotations:\${supportLibraryVersion}"

}

tasks.withType(Test) {
    /// increased logging for tests
    testLogging {
        events "passed", "skipped", "failed"
    }
}

android {
    compileSdkVersion 24
    buildToolsVersion "24.0.2"

    defaultConfig {
        testInstrumentationRunner "android.support.test.runner.AndroidJUnitRunner"

        // arguments to be passed to functional tests
        testInstrumentationRunnerArgument "TEST_USER", "\"$System.env.OCTEST_APP_USERNAME\""
        testInstrumentationRunnerArgument "TEST_PASSWORD", "\"$System.env.OCTEST_APP_PASSWORD\""
        testInstrumentationRunnerArgument "TEST_SERVER_URL", "\"$System.env.OCTEST_SERVER_BASE_URL\""

        jackOptions {
            enabled false
        }

    }

    // adapt structure from Eclipse to Gradle/Android Studio expectations;
    // see http://tools.android.com/tech-docs/new-build-system/user-guide#TOC-Configuring-the-Structure
    sourceSets {
        main {
            manifest.srcFile 'AndroidManifest.xml'
            java.srcDirs = ['src']
            resources.srcDirs = ['src']
            aidl.srcDirs = ['src']
            renderscript.srcDirs = ['src']
            res.srcDirs = ['res']
            assets.srcDirs = ['assets']
        }


        // move whole local unit tests structure as a whole from src/test/* to test/*
        test.setRoot('test')

        // move whole instrumented tests structure as a whole from src/androidTest/* to androidTest/*
        androidTest.setRoot('androidTest')


        // Move the build types to build-types/<type>
        // For instance, build-types/debug/java, build-types/debug/AndroidManifest.xml, ...
        // This moves them out of them default location under src/<type>/... which would
        // conflict with src/ being used by the main source set.
        // Adding new build types or product flavors should be accompanied
        // by a similar customization.
        debug.setRoot('build-types/debug')
        release.setRoot('build-types/release')
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_7
        targetCompatibility JavaVersion.VERSION_1_7
    }

    lintOptions {
        abortOnError false
    }

    packagingOptions {
        exclude 'META-INF/LICENSE.txt'
    }

    adbOptions {
        timeOutInMs(20 * 60 * 1000)
    }

    signingConfigs {
        release {
            if (System.env.OC_RELEASE_KEYSTORE) {
                storeFile file(System.env.OC_RELEASE_KEYSTORE)  // use an absolute path
                storePassword System.env.OC_RELEASE_KEYSTORE_PASSWORD
                keyAlias System.env.OC_RELEASE_KEY_ALIAS
                keyPassword System.env.OC_RELEASE_KEY_PASSWORD
            }
        }
    }

    buildTypes {
        release {
            if (System.env.OC_RELEASE_KEYSTORE) {
                signingConfig signingConfigs.release
            }
        }
    }

    applicationVariants.all { variant ->
        def appName = System.env.OC_APP_NAME
        setOutputFileName(variant, appName, project)
    }

}

// Updates output file names of a given variant to format
// [appName].[variant.versionName].[OC_BUILD_NUMBER]-[variant.name].apk.
//
// OC_BUILD_NUMBER is an environment variable read directly in this method. If undefined, it's not added.
//
// @param variant           Build variant instance which output file name will be updated.
// @param appName           String to use as first part of the new file name. May be undefined, the original
//                          project.archivesBaseName property will be used instead.
// @param callerProject     Caller project.

def setOutputFileName(variant, appName, callerProject) {
    logger.info("Setting new name for output of variant $variant.name")

    def originalFile = variant.outputs[0].outputFile;
    def originalName = originalFile.name;
    logger.info("$variant.name: originalName is $originalName")

    def newName = ""

    if (appName) {
        newName += appName
    } else {
        newName += callerProject.archivesBaseName
    }

    newName += "_$variant.versionName"

    def buildNumber = System.env.OC_BUILD_NUMBER
    if (buildNumber) {
        newName += ".$buildNumber"
    }

    newName += originalName.substring(callerProject.archivesBaseName.length())

    logger.info("$variant.name: newName is $newName")
    variant.outputs[0].outputFile = new File(originalFile.parent, newName)
}

dependencies {
    def mobileCenterSdkVersion = '0.6.1'
    compile "com.microsoft.azure.mobile:mobile-center-analytics:\${mobileCenterSdkVersion}"
    compile "com.microsoft.azure.mobile:mobile-center-crashes:\${mobileCenterSdkVersion}"
}
`;

const expectedResult: IBuildGradle = {
  path: null,
  contents: null,
  buildVariants: [{ 
    name: "debug", 
    buildType: "debug"
  }, {
    name: "release",
    buildType: "release"
  }],
  sourceSets: [{
    name: "main",
    manifestSrcFile: "'AndroidManifest.xml'",
    javaSrcDirs: ["'src'"]
  }],
  dependenciesBlocks: [{
    position: 6613,
    text: `
    def mobileCenterSdkVersion = '0.6.1'
    compile "com.microsoft.azure.mobile:mobile-center-analytics:\${mobileCenterSdkVersion}"
    compile "com.microsoft.azure.mobile:mobile-center-crashes:\${mobileCenterSdkVersion}"
`,
    defs: [{
      position: 5,
      text: "def mobileCenterSdkVersion = '0.6.1'",
      name: "mobileCenterSdkVersion",
      value: "0.6.1"
    }],
    compiles: [{
      position: 46,
      text: 'compile "com.microsoft.azure.mobile:mobile-center-analytics:\${mobileCenterSdkVersion}"',
      moduleName: "analytics"
    },{
      position: 137,
      text: 'compile "com.microsoft.azure.mobile:mobile-center-crashes:\${mobileCenterSdkVersion}"',
      moduleName: "crashes"
    }]
  }]
}

const bgCase: IBuildGradleCase = { name, content, expectedResult };
export default bgCase;

