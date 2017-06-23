// sdk integrate command

import { shortName, longName, hasArg } from './../util/commandline/option-decorators';
import { CommandArgs, CommandResult, help, failure, ErrorCodes, success, getCurrentApp, required, defaultValue, Command } from "../util/commandline";
import { out, prompt } from "../util/interaction";
import { DefaultApp, toDefaultApp } from "../util/profile";
import { MobileCenterClient, clientRequest, models, ClientResponse } from "../util/apis";
import * as process from "process";
import * as path from "path";
import * as request from "request";
import * as JsZip from "jszip";
import * as JsZipHelper from "../util/misc/jszip-helper";
import * as fs from "async-file";
import * as mkdirp from "mkdirp";

const debug = require("debug")("mobile-center-cli:commands:apps:list");
import { inspect } from "util";
import { injectAndroidJava, checkAndroidJava } from "./lib/android/operations";
import { injectSdkIos } from "./lib/ios/inject-sdk-ios";
import { MobileCenterSdkModule } from "./lib/models/mobilecenter-sdk-module";
import { reportProject } from "./lib/format-project";
import { getProjectDescription, IAndroidJavaProjectDescription, IIosObjectiveCSwiftProjectDescription, ProjectDescription } from "./lib/project-description";
import * as _ from "lodash";
import collectBuildGradleInfo from "./lib/android/collect-build-gradle-info";
import collectMainActivityInfo from "./lib/android/collect-main-activity-info";
import { Questions, Question, Separator } from "../util/interaction/prompt";
import { glob } from "../util/misc/promisfied-glob";

@help("Integrate Mobile Center SDK into the project")
export default class IntegrateSDKCommand extends Command {
  constructor(args: CommandArgs) {
    super(args);
  }

  @help("Specify application for command to act on")
  @shortName("a")
  @longName("app")
  @hasArg
  app: string;

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
  analyticsModule: boolean;

  @help("Enable Crashes module")
  @longName("crashes")
  crashesModule: boolean;

  @help("Enable Distribute module")
  @longName("distribute")
  distributeModule: boolean;

  @help("Initialize sample app")
  @longName("sample-app")
  sampleApp: boolean;

  async run(client: MobileCenterClient): Promise<CommandResult> {
    const appDir = path.isAbsolute(this.appDir || "./") ? this.appDir : path.join(process.cwd(), this.appDir || "./");
    let appDirSuffix = "";

    let app: DefaultApp;
    let appResponse: models.AppResponse;
    let appName = this.app;
    let createNew = this.createNew;
    let branchName = this.branchName;
    let os = this.os;
    let platform = this.platform;

    const currentDirApp = await detectCurrentDirApp(appDir);
    let useDetectedApp;
    if (currentDirApp) {
      useDetectedApp = await prompt.confirm(`An existing ${currentDirApp.os}/${currentDirApp.platform} is detected. Do you want to use it?`);
      if (useDetectedApp) {
        os = currentDirApp.os;
        platform = currentDirApp.platform;
      }
    }

    let sampleApp: boolean;
    if (!useDetectedApp) {
      const sampleAppDetails = await inquireSampleApp(this.sampleApp, this.os, this.platform);
      sampleApp = sampleAppDetails.confirm;
      os = sampleAppDetails.os;
      platform = sampleAppDetails.platform;
    }

    if (sampleApp) {
      appDirSuffix = await downloadSample(appDir, os, platform);
    }

    if (!appName && !createNew) {
      const appsResponse = await out.progress("Getting app list ...",
        clientRequest<models.AppResponse[]>(cb => client.apps.list(cb)));

      if (appsResponse.response.statusCode >= 400) {
        return failure(ErrorCodes.Exception, "Unknown error when loading apps");
      }

      appName = await inquireAppName(appsResponse.result);
      if (!appName)
        createNew = true;
    }

    if (createNew) {
      const appAttributes = await inquireNewAppAttributes(appName, os, platform);

      debug(`Creating app with attributes: ${inspect(appAttributes)}`);
      const createAppResponse = await out.progress("Creating app ...",
        clientRequest<models.AppResponse>(cb => client.apps.create(appAttributes, cb))
      );
      const statusCode = createAppResponse.response.statusCode;
      if (statusCode >= 400) {
        switch (statusCode) {
          case 400:
            return failure(ErrorCodes.Exception, "the request was rejected for an unknown reason");
          case 404:
            return failure(ErrorCodes.NotFound, "there appears to be no such user");
          case 409:
            return failure(ErrorCodes.InvalidParameter, "an app with this 'name' already exists");
        }
      }

      appResponse = createAppResponse.result;
      app = {
        appName: appResponse.name,
        ownerName: appResponse.owner.name,
        identifier: appResponse.id
      };

    } else { // !createNew
      app = toDefaultApp(appName);
      if (!app) {
        return failure(ErrorCodes.Exception, `'${this.app}' is not a valid application id`);
      }

      const appDetailsResponse = await out.progress("Getting app details ...",
        clientRequest<models.AppResponse>(cb => client.apps.get(app.ownerName, app.appName, cb)));

      const statusCode = appDetailsResponse.response.statusCode;

      if (statusCode >= 400) {
        switch (statusCode) {
          case 400:
            return failure(ErrorCodes.Exception, "the request was rejected for an unknown reason");
          case 404:
            return failure(ErrorCodes.NotFound, `the app "${app.identifier}" could not be found`);
          default:
            return failure(ErrorCodes.Exception, "Unknown error when loading apps");
        }
      }

      appResponse = appDetailsResponse.result
    }

    let sdkModules: MobileCenterSdkModule = MobileCenterSdkModule.None;
    if (this.analyticsModule)
      sdkModules |= MobileCenterSdkModule.Analytics;
    if (this.crashesModule)
      sdkModules |= MobileCenterSdkModule.Crashes;
    if (this.distributeModule)
      sdkModules |= MobileCenterSdkModule.Distribute;
    if (!sdkModules) {
      sdkModules = await inquireSdkModules();
    }

    let inputManually = false;
    let projectDescription: ProjectDescription;

    if (!branchName) {

      const branches = await getBranchesWithBuilds(client, app);

      if (branches.length) {
        branchName = await inquireBranchName(branches);
        if (!branchName)
          inputManually = true;
      } else {
        inputManually = true;
      }
    }

    if (!inputManually && branchName) {
      const branchResponse = await out.progress("Getting branch configuration ...",
        clientRequest<models.BranchConfiguration>(cb =>
          client.branchConfigurations.get(branchName, app.ownerName, app.appName, cb)));

      if (branchResponse.response.statusCode >= 400) {
        inputManually = true;
      } else {
        projectDescription = getProjectDescription(branchResponse.result);
      }
    }

    if (inputManually) {
      projectDescription = await inquireProjectDescription(appResponse, path.join(appDir, appDirSuffix));
    }

    reportProject(appResponse, projectDescription);

    if (!await prompt.confirm("Do you really want to integrate SDK into the project?")) {
      out.text("Mobile Center SDK integration was cancelled");
      return success();
    }

    try {
      switch (appResponse.os) {
        case "Android":
          switch (appResponse.platform) {
            case "Java":
              const androidJavaProjectDescription = projectDescription as IAndroidJavaProjectDescription;
              const buildGradle = await collectBuildGradleInfo(path.join(appDir, appDirSuffix, androidJavaProjectDescription.moduleName, "build.gradle"));
              const mainActivity = await collectMainActivityInfo(buildGradle, androidJavaProjectDescription.buildVariant);

              await out.progress("Integrating SDK into the project...",
                injectAndroidJava(buildGradle, mainActivity, "0.6.1", // TODO: Retrieve SDK version from somewhere
                  appResponse.appSecret, sdkModules));

              break;
          }
          break;

        case "iOS":
          const iosObjectiveCSwiftProjectDescription = projectDescription as IIosObjectiveCSwiftProjectDescription;
          await out.progress("Integrating SDK into the project...",
            injectSdkIos(path.join(appDir, appDirSuffix, iosObjectiveCSwiftProjectDescription.projectOrWorkspacePath),
              path.join(appDir, appDirSuffix, iosObjectiveCSwiftProjectDescription.podfilePath),
              appResponse.appSecret,
              sdkModules/*,
              "sdk version"*/));
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

async function inquireSampleApp(sampleApp: boolean, os: string, platform: string): Promise<{ confirm: boolean, os: string, platform: string }> {
  const questions: Questions = [];
  if (!sampleApp) {
    questions.push({
      type: "confirm",
      name: "confirm",
      message: "Do you want to download sample app?",
      default: false
    });
  }

  if (!os) {
    questions.push({
      type: "list",
      name: "os",
      message: "Please specify sample app's OS",
      choices: ["Android", "iOS"],
      when: (answers: any) => answers.confirm || sampleApp
    });
  }

  if (!platform) {
    questions.push({
      type: "list",
      name: "platform",
      message: "Please specify sample app's platform",
      choices: answers => {
        switch (answers.os) {
          case "iOS": return ["Objective-C-Swift", "React-Native", "Xamarin"];
          case "Android": return ["Java", "React-Native", "Xamarin"];
          default: return [];
        }
      },
      when: (answers: any) => answers.confirm || sampleApp
    });
  }

  const answers = await prompt.question(questions);

  return {
    confirm: sampleApp || answers.confirm as boolean,
    os: os || answers.os as string,
    platform: platform || answers.platform as string,
  };
}

async function inquireAppName(apps: models.AppResponse[]): Promise<string> {
  const createNewText: string = "Create new...";

  const question: Question = {
    type: "list",
    name: "appName",
    message: "Please choose a Mobile Center app to work with",
    choices: [createNewText].concat(apps.map(app => `${app.owner.name}/${app.name}`))
  };
  const answers = await prompt.question(question);

  let appName = answers.appName as string;

  return appName === createNewText ? null : appName;
}

async function inquireNewAppAttributes(appName: string, os: string, platform: string): Promise<models.AppRequest> {
  let questions: Questions = [{
    type: "input",
    name: "appName",
    message: "Please specify new app's name",
    when: () => !appName
  }, {
    type: "list",
    name: "os",
    message: "Please specify new app's OS",
    choices: ["iOS", "Android"],
    when: () => !os
  }, {
    type: "list",
    name: "platform",
    message: "Please specify new app's platform",
    choices: answers => {
      switch (answers.os) {
        case "iOS": return ["Objective-C-Swift", "React-Native", "Xamarin"];
        case "Android": return ["Java", "React-Native", "Xamarin"];
        default: return [];
      }
    },
    when: () => !platform
  }];

  const answers = await prompt.question(questions);

  return {
    displayName: appName || answers.appName as string,
    os: os || answers.os as string,
    platform: platform || answers.platform as string,
  };
}

async function inquireSdkModules(): Promise<MobileCenterSdkModule> {
  let questions: Question = {
    type: "checkbox",
    name: "modules",
    message: "Which modules do you want to insert?",
    choices: [{
      name: "Analytics",
      value: "analitics",
      checked: true
    }, {
      name: "Crashes",
      value: "crashes",
      checked: true
    }, {
      name: "Distribute",
      value: "distribute",
      checked: true
    }],
    validate: (x: any) => {
      return x && x.length ? true : "Please choose at least one module";
    }
  };

  let sdkModules = MobileCenterSdkModule.None;
  const answers = await prompt.question(questions);
  if (_.includes(answers.modules as string[], "analitics"))
    sdkModules |= MobileCenterSdkModule.Analytics;
  if (_.includes(answers.modules as string[], "crashes"))
    sdkModules |= MobileCenterSdkModule.Crashes;
  if (_.includes(answers.modules as string[], "distribute"))
    sdkModules |= MobileCenterSdkModule.Distribute;

  return sdkModules;
}

async function getBranchesWithBuilds(client: MobileCenterClient, app: DefaultApp): Promise<models.BranchStatus[]> {
  debug(`Getting list of branches for app ${app.appName}`);
  let branchesStatusesRequestResponse: ClientResponse<models.BranchStatus[]>;
  try {
    branchesStatusesRequestResponse = await out.progress(`Getting statuses for branches of app ${app.appName}...`,
      clientRequest<models.BranchStatus[]>((cb) => client.builds.listBranches(app.ownerName, app.appName, cb)));
  } catch (error) {
    debug(`Request failed - ${inspect(error)}`);
    return [];
  }

  return _(branchesStatusesRequestResponse.result)
    .filter((branch) => !_.isNil(branch.lastBuild))
    .sortBy((b) => b.lastBuild.sourceBranch)
    .value();
}

async function inquireBranchName(branches: models.BranchStatus[]): Promise<string> {
  const inputManuallyText = "Input manually..."
  const question: Question = {
    type: "list",
    name: "branchName",
    message: "Where do you want to get project settings from?",
    choices: [inputManuallyText].concat(branches.map(branch => branch.lastBuild.sourceBranch))
  };
  const answers = await prompt.question(question);

  let branchName = answers.branchName as string;

  return branchName === inputManuallyText ? null : branchName;
}

async function inquireProjectDescription(app: models.AppResponse, dir: string): Promise<ProjectDescription> {
  if (app.os === "Android" && app.platform === "Java") {
    let questions: Questions = [{
      type: "list",
      name: "moduleName",
      message: "Gradle module name",
      choices: await findGradleModules(dir)
    }];
    const answers = await prompt.question(questions);
    const moduleName = answers.moduleName as string;
    if (moduleName) {
      const filePath = path.join(dir, moduleName, "build.gradle");
      const buildGradle = await collectBuildGradleInfo(filePath);
      if (buildGradle.buildVariants && buildGradle.buildVariants.length) {
        let questions: Questions = [{
          type: "list",
          name: "buildVariant",
          message: "Build variant",
          choices: buildGradle.buildVariants
        }];
        const answers = await prompt.question(questions);
        return {
          moduleName,
          buildVariant: answers.buildVariant as string
        };
      } else
        throw new Error(`Incorrect file format: ${filePath}`);
    }
  }

  if (app.os === "iOS" && app.platform === "Objective-C-Swift") {
    let questions: Questions = [{
      type: "list",
      name: "projectOrWorkspacePath",
      message: "Path to project or workspace",
      choices: await findProjectsAndWorkspaces(dir)
    }];
    const answers = await prompt.question(questions);
    return {
      projectOrWorkspacePath: answers.projectOrWorkspacePath as string,
      podfilePath: "./podfile" //TODO: ???
    };
  }

  throw new Error(`Unsupported OS/Platform: ${app.os}/${app.platform}`);
}

async function downloadSample(appDir: string, os: string, platform: string): Promise<string> {

  const { uri, name } = getArchiveUrl(os, platform);
  const response = await out.progress(`Downloading the file... ${uri}`, downloadFile(uri));
  await out.progress("Unzipping the archive...", unzip(path.join(appDir, name), response.result));
  return name;

  function getArchiveUrl(os: string, platform: string): { uri: string, name: string } {
    switch (os) {
      case "Android":
        switch (platform) {
          case "Java": return { uri: "https://github.com/MobileCenter/quickstart-android/archive/master.zip", name: "android-sample" };
          case "React-Native": break;
          case "Xamarin": return { uri: "https://github.com/MobileCenter/quickstart-xamarin/archive/master.zip", name: "xamarin-sample" };
        }
      case "iOS":
        switch (platform) {
          case "Objective-C-Swift": return { uri: "https://github.com/MobileCenter/quickstart-ios/archive/master.zip", name: "ios-sample" };
          case "React-Native": break;
          case "Xamarin": return { uri: "https://github.com/MobileCenter/quickstart-xamarin/archive/master.zip", name: "xamarin-sample" };
        }
    }

    throw failure(ErrorCodes.InvalidParameter, "Unsupported OS or platform");
  }

  async function downloadFile(uri: string): Promise<ClientResponse<Buffer>> {
    return new Promise<ClientResponse<Buffer>>((resolve, reject) => {
      request.get(uri, { encoding: null }, (error, response, body: Buffer) => {
        if (error) {
          reject(error);
        } else {
          resolve({ result: body, response });
        }
      });
    });
  }

  async function unzip(directory: string, buffer: Buffer) {
    const zip = await new JsZip().loadAsync(buffer);
    for (const file of _.values(zip.files) as JSZipObject[]) {
      if (file.dir) {
        continue;
      }

      const match = /.+?\/(.+)/.exec(file.name);
      if (!match) {
        continue;
      }

      const filePath = path.join(directory, match[1]);
      const dirName = path.dirname(filePath);
      if (!await fs.exists(dirName)) {
        mkdirp.sync(dirName);
      }
      await fs.writeTextFile(filePath, await file.async("string"));
    }
  }
}

async function findGradleModules(dir: string): Promise<string[]> {
  const files = await glob(path.join(dir, "**/!(android-sample)/build.gradle")); // TODO: Handle fake modules
  const modules: string[] = [];
  for (let file of files) {
    let contents = await fs.readTextFile(file);
    if (/apply plugin:\s*['"]com\.android\.application['"]/m.test(contents)) {
      const matches = path.relative(dir, file).match(/\/?(.+)[\/\\]build\.gradle/);
      if (matches && matches[1])
        modules.push(matches[1]);
    }
  }
  return modules;
}

async function findProjectsAndWorkspaces(dir: string): Promise<string[]> {
  const dirs = await glob(path.join(dir, "*.*(xcworkspace|xcodeproj)/"));
  return dirs.map(d => path.relative(dir, d));
}

async function detectCurrentDirApp(dir: string): Promise<{ os: string, platform: string }> {
  const xcodeDirs = await glob(path.join(dir, "*.*(xcworkspace|xcodeproj)/"));
  if (xcodeDirs.length)
    return { os: 'iOS', platform: "Objective-C-Swift" };
  const gradleFiles = await glob(path.join(dir, "build.gradle"));
  if (gradleFiles.length)
    return { os: 'Android', platform: "Java" };
  return null;
}
