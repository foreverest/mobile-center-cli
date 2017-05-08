// sdk integrate command

import * as path from "path";
import * as _ from "lodash";

import { Command, CommandArgs, CommandResult, ErrorCodes, defaultValue, failure, getCurrentApp, help, required, success } from "../util/commandline";
import { IAndroidJavaProjectDescription, IIosObjectiveCSwiftProjectDescription, ProjectDescription } from "./lib/models/project-description";
import { checkAndroidJava, injectAndroidJava } from "./lib/android/operations";
import { hasArg, longName, shortName } from './../util/commandline/option-decorators';
import { out, prompt } from "../util/interaction";

import { IRemoteApp } from "./lib/models/i-remote-app";
import { MobileCenterClient } from "../util/apis";
import collectBuildGradleInfo from "./lib/android/collect-build-gradle-info";
import collectMainActivityInfo from "./lib/android/collect-main-activity-info";
import getLocalApp from "./lib/get-local-app";
import getProjectDescription from "./lib/get-project-description";
import getRemoteApp from "./lib/get-remote-app";
import getSdkModules from "./lib/get-sdk-modules";
import { injectSdkIos } from "./lib/ios/inject-sdk-ios";
import { reportProject } from "./lib/format-project";
import { getSdkVersions } from "./lib/get-sdk-versions";

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

  @help("Initialize sample app")
  @longName("sample-app")
  sampleApp: boolean;

  @help("Not initialize sample app")
  @longName("no-sample-app")
  noSampleApp: boolean;

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
  iosPodfilePath: string

  async run(client: MobileCenterClient): Promise<CommandResult> {
    let os = this.os;
    let platform = this.platform;
    let appDir = this.appDir || "./";
    if (!path.isAbsolute(appDir)) {
      appDir = path.join(process.cwd(), appDir);
    }
    try {
      let localApp = await getLocalApp(appDir, os, platform, this.sampleApp, this.noSampleApp);
      if (localApp) {
        appDir = localApp.dir;
        os = localApp.os;
        platform = localApp.platform;
      }

      const remoteApp = await getRemoteApp(client, this.appName, os, platform, this.createNew);
      if (!localApp) {
        localApp = {
          dir: appDir,
          os: remoteApp.os,
          platform: remoteApp.platform 
        };
      }

      const projectDescription = await getProjectDescription(client, localApp, remoteApp, 
        this.branchName, 
        this.androidModule, 
        this.androidBuildVariant,
        this.iosProjectPath,
        this.iosPodfilePath);

      const sdkModules = await getSdkModules(this.analytics, this.crashes, this.distribute);

      reportProject(remoteApp, projectDescription);

      if (!await prompt.confirm("Do you really want to integrate SDK into the project?")) {
        out.text("Mobile Center SDK integration was cancelled");
        return success();
      }

      const sdkVersions = await getSdkVersions(remoteApp.platform.toLowerCase());
      const latestSdkVersion = _.last(sdkVersions);

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
              path.join(appDir, iosObjectiveCSwiftProjectDescription.podfilePath),
              remoteApp.appSecret,
              sdkModules,
              latestSdkVersion));
          break;

        default:
          break;
      }
    } catch (err) {
      return failure(ErrorCodes.Exception, err);
    }

    out.text("Success.");
    return success();
  }
}