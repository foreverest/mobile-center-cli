import * as _ from "lodash";
import * as fs from "async-file";
import * as path from "path";

import { ClientResponse, MobileCenterClient, clientRequest, models } from "../../util/apis/index";
import { Question, Questions } from "../../util/interaction/prompt";
import { out, prompt } from "../../util/interaction/index";

import { ILocalApp } from './models/i-local-app';
import { IRemoteApp } from './models/i-remote-app';
import { ProjectDescription } from "./models/project-description";
import collectBuildGradleInfo from "./android/collect-build-gradle-info";
import { glob } from "../../util/misc/promisfied-glob";

export default async function getProjectDescription(client: MobileCenterClient, 
    localApp: ILocalApp, 
    remoteApp: IRemoteApp, 
    branchName: string): Promise<ProjectDescription> {

  let inputManually = false;
  let projectDescription: ProjectDescription;

  if (!branchName) {

    const branches = await getBranchesWithBuilds(client, remoteApp);

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
        client.branchConfigurations.get(branchName, remoteApp.ownerName, remoteApp.appName, cb)));

    if (branchResponse.response.statusCode >= 400) {
      inputManually = true;
    } else {
      if (branchResponse.result.toolsets.android) {
        return {
          moduleName: branchResponse.result.toolsets.android.module,
          buildVariant: branchResponse.result.toolsets.android.buildVariant
        }
      }
      if (branchResponse.result.toolsets.xcode) {
        return {
          projectOrWorkspacePath: branchResponse.result.toolsets.xcode.projectOrWorkspacePath,
          podfilePath: branchResponse.result.toolsets.xcode.podfilePath
        }
      }
      throw new Error("Unsupported OS/Platform");
    }
  }

  if (inputManually) 
    return inquireProjectDescription(remoteApp, localApp.dir);
}

async function getBranchesWithBuilds(client: MobileCenterClient, app: IRemoteApp): Promise<models.BranchStatus[]> {
  let branchesStatusesRequestResponse: ClientResponse<models.BranchStatus[]>;
  try {
    branchesStatusesRequestResponse = await out.progress(`Getting statuses for branches of app ${app.appName}...`,
      clientRequest<models.BranchStatus[]>((cb) => client.builds.listBranches(app.ownerName, app.appName, cb)));
  } catch (error) {
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
  const answers = await prompt.autoAnsweringQuestion(question);

  let branchName = answers.branchName as string;

  return branchName === inputManuallyText ? null : branchName;
}

async function inquireProjectDescription(app: IRemoteApp, dir: string): Promise<ProjectDescription> {
  if (app.os === "Android" && app.platform === "Java") {
    let question: Question = {
      type: "list",
      name: "moduleName",
      message: "Gradle module name",
      choices: await findGradleModules(dir)
    };
    const answers = await prompt.autoAnsweringQuestion(question);
    const moduleName = answers.moduleName as string;
    if (moduleName) {
      const filePath = path.join(dir, moduleName, "build.gradle");
      const buildGradle = await collectBuildGradleInfo(filePath);
      if (buildGradle.buildVariants && buildGradle.buildVariants.length) {
        let questions: Question = {
          type: "list",
          name: "buildVariant",
          message: "Build variant",
          choices: buildGradle.buildVariants
        };
        const answers = await prompt.autoAnsweringQuestion(questions);
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

