// sdk integrate command

import * as _ from "lodash";
import * as path from "path";

import { Command, CommandArgs, CommandResult, ErrorCodes, defaultValue, failure, getCurrentApp, help, required, success } from "../util/commandline";
import { IAndroidJavaProjectDescription, IIosObjectiveCSwiftProjectDescription, ProjectDescription } from "./lib/models/project-description";
import { checkAndroidJava, injectAndroidJava } from "./lib/android/operations";
import { getLocalApp, getLocalAppNonInteractive } from "./lib/get-local-app";
import { getProjectDescription, getProjectDescriptionNonInteractive } from "./lib/get-project-description";
import { getRemoteApp, getRemoteAppNonInteractive } from "./lib/get-remote-app";
import { getSdkModules, getSdkModulesNonInteractive } from "./lib/get-sdk-modules";
import { hasArg, longName, shortName } from './../util/commandline/option-decorators';
import { out, prompt } from "../util/interaction";

import { IRemoteApp } from "./lib/models/i-remote-app";
import { MobileCenterClient } from "../util/apis";
import collectBuildGradleInfo from "./lib/android/collect-build-gradle-info";
import collectMainActivityInfo from "./lib/android/collect-main-activity-info";
import { getLatestSdkVersion } from "./lib/get-sdk-versions";
import { injectSdkIos } from "./lib/ios/inject-sdk-ios";
import { reportProject } from "./lib/format-project";

@help("Integrate Mobile Center SDK into the project")
export default class IntegrateSDKCommand extends Command {
  constructor(args: CommandArgs) {
    super(args);
  }

  @help("Specify application for command to act on")
  @shortName("a")
  @longName("app")
  @hasArg
  appName: string;

  @help("Specify application for command to act on")
  @shortName("n")
  @longName("create-new")
  createNew: boolean;

  @help("The OS the app will be running on")
  @shortName("o")
  @longName("os")
  @hasArg
  os: string;

  @help("The platform of the app")
  @shortName("p")
  @longName("platform")
  @hasArg
  platform: string;

  @help("App's root directory. If not provided current directory is used.")
  @longName("app-dir")
  @hasArg
  appDir: string;

  @help("Branch name")
  @shortName("b")
  @longName("branch")
  @hasArg
  public branchName: string;

  @help("Enable Analytics module")
  @longName("analytics")
  analytics: boolean;

  @help("Enable Crashes module")
  @longName("crashes")
  crashes: boolean;

  @help("Enable Distribute module")
  @longName("distribute")
  distribute: boolean;

  @help("Enable Push module")
  @longName("push")
  push: boolean;

  @help("Initialize sample app")
  @longName("sample-app")
  sampleApp: boolean;

  @help("Gradle module name for Android app")
  @longName("android-module")
  @hasArg
  androidModule: string;

  @help("Build variant for Android app")
  @longName("android-build-variant")
  @hasArg
  androidBuildVariant: string;

  @help("Project or workspace path for iOS app")
  @longName("ios-project-path")
  @hasArg
  iosProjectPath: string;

  @help("Podfile path for iOS app")
  @longName("ios-podfile-path")
  @hasArg
  iosPodfilePath: string;

  @help("Non-interactive mode")
  @longName("non-interactive")
  nonInteractive: boolean;

  async run(client: MobileCenterClient): Promise<CommandResult> {
    let os = normalizeOs(this.os);
    let platform = normalizePlatform(this.platform);
    let appDir = this.appDir || "./";
    if (!path.isAbsolute(appDir)) {
      appDir = path.join(process.cwd(), appDir);
    }
    try {
      let localApp = this.nonInteractive ?
        await getLocalAppNonInteractive(appDir, os, platform, this.sampleApp) :
        await getLocalApp(appDir, os, platform, this.sampleApp);
        
      if (localApp) {
        appDir = localApp.dir;
        os = localApp.os;
        platform = localApp.platform;
      }

      const remoteApp = this.nonInteractive ?
        await getRemoteAppNonInteractive(client, this.appName, os, platform, this.createNew) :
        await getRemoteApp(client, this.appName, os, platform, this.createNew);
        
      if (!localApp) {
        localApp = {
          dir: appDir,
          os: remoteApp.os,
          platform: remoteApp.platform 
        };
      }

      const projectDescription = this.nonInteractive ? 
        await getProjectDescriptionNonInteractive(client, localApp, remoteApp, 
          this.branchName, 
          this.androidModule, 
          this.androidBuildVariant,
          this.iosProjectPath,
          this.iosPodfilePath) :
        await getProjectDescription(client, localApp, remoteApp, 
          this.branchName, 
          this.androidModule, 
          this.androidBuildVariant,
          this.iosProjectPath,
          this.iosPodfilePath);

      const sdkModules = this.nonInteractive ?
        await getSdkModulesNonInteractive(this.analytics, this.crashes, this.distribute, this.push) :
        await getSdkModules(this.analytics, this.crashes, this.distribute, this.push);

      reportProject(remoteApp, projectDescription);

      if (!this.nonInteractive && !await prompt.confirm("Do you really want to integrate SDK into the project?")) {
        out.text("Mobile Center SDK integration was cancelled");
        return success();
      }

      const latestSdkVersion = await getLatestSdkVersion(remoteApp.platform.toLowerCase());

      switch (remoteApp.os.toLowerCase()) {
        case "android":
          switch (remoteApp.platform.toLowerCase()) {
            case "java":
              const androidJavaProjectDescription = projectDescription as IAndroidJavaProjectDescription;
              const buildGradle = await collectBuildGradleInfo(path.join(appDir, androidJavaProjectDescription.moduleName, "build.gradle"));
              const mainActivity = await collectMainActivityInfo(buildGradle, androidJavaProjectDescription.buildVariant);

              await out.progress("Integrating SDK into the project...",
                injectAndroidJava(buildGradle,
                  mainActivity,
                  latestSdkVersion,
                  remoteApp.appSecret,
                  sdkModules));
              break;
          }
          break;

        case "ios":
          const iosObjectiveCSwiftProjectDescription = projectDescription as IIosObjectiveCSwiftProjectDescription;
          await out.progress("Integrating SDK into the project...",
            injectSdkIos(path.join(appDir, iosObjectiveCSwiftProjectDescription.projectOrWorkspacePath),
              iosObjectiveCSwiftProjectDescription.podfilePath && path.join(appDir, iosObjectiveCSwiftProjectDescription.podfilePath),
              remoteApp.appSecret,
              sdkModules,
              latestSdkVersion));
          break;

        default:
          break;
      }
    } catch (err) {
      return err.errorMessage ? err : failure(ErrorCodes.Exception, err);
    }

    out.text("Success.");
    return success();
  }
}

function normalizeOs(os: string): string {
  switch (os && os.toLowerCase()) {
    case "android": return "Android";
    case "ios": return "iOS";
    default: return os;
  }
}

function normalizePlatform(platform: string): string {
  switch (platform && platform.toLowerCase()) {
    case "java": return "Java";
    case "objective-c-swift": return "Objective-C-Swift";
    case "react-native": return "React-Native";
    case "xamarin": return "Xamarin";
    default: return platform;
  }
}