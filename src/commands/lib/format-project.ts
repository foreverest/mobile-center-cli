import { IAndroidJavaProjectDescription, IIosObjectiveCSwiftProjectDescription, ProjectDescription } from "./models/project-description";

import { IRemoteApp } from "./models/i-remote-app";
import { out } from "../../util/interaction";

export function reportProject(app: IRemoteApp, projectDescription: ProjectDescription): void {
  reportApp(app);

  switch (app.os) {
    case "Android":
      switch (app.platform) {
        case "Java":
          reportAndroidJava(projectDescription as IAndroidJavaProjectDescription);
          break;
      }
      break;

    case "iOS":
      switch (app.platform) {
        case "Objective-C-Swift":
          reportIosObjectiveCSwift(projectDescription as IIosObjectiveCSwiftProjectDescription);
          break;
      }
      break;

    default:
      break;
  }
}

function reportApp(app: IRemoteApp): void {
  out.report(
    [
      ["App", "appName"],
      ["App secret", "appSecret"],
      ["OS", "os"],
      ["Platform", "platform"]
    ], app);
}

function reportIosObjectiveCSwift(projectDescription: IIosObjectiveCSwiftProjectDescription): void {
  out.report(
    [
      ["Project or workspace path", "projectOrWorkspacePath"],
      ["Podfile path", "podfilePath"]
    ], projectDescription);
}

function reportAndroidJava(projectDescription: IAndroidJavaProjectDescription): void {
  out.report(
  [
    [ "Gradle module", "moduleName"],
    [ "Build variant", "buildVariant"],
  ], projectDescription);
}