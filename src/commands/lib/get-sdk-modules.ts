import * as _ from "lodash";

import { ErrorCodes, failure } from "../../util/commandline/index";

import { MobileCenterSdkModule } from "./models/mobilecenter-sdk-module";
import { Question } from "../../util/interaction/prompt";
import { prompt } from "../../util/interaction";

export async function getSdkModules(analytics: boolean, crashes: boolean, distribute: boolean): Promise<MobileCenterSdkModule> {
  return inquireSdkModules(analytics, crashes, distribute);
}

export async function getSdkModulesNonInteractive(analytics: boolean, crashes: boolean, distribute: boolean): Promise<MobileCenterSdkModule> {
  let sdkModules = MobileCenterSdkModule.None;
  if (analytics)
    sdkModules |= MobileCenterSdkModule.Analytics;
  if (crashes)
    sdkModules |= MobileCenterSdkModule.Crashes;
  if (distribute)
    sdkModules |= MobileCenterSdkModule.Distribute;

  if (!sdkModules)
    throw failure(ErrorCodes.IllegalCommand, "You must provide at least one of --analytics, --crashes or --distribute flags.");
  
  return sdkModules;
}

async function inquireSdkModules(analytics: boolean, crashes: boolean, distribute: boolean): Promise<MobileCenterSdkModule> {
  let questions: Question = {
    type: "checkbox",
    name: "modules",
    message: "Which modules do you want to insert?",
    choices: [{
      name: "Analytics",
      value: "analytics"
    }, {
      name: "Crashes",
      value: "crashes"
    }, {
      name: "Distribute",
      value: "distribute"
    }],
    validate: (x: any) => {
      return x && x.length ? true : "Please choose at least one module";
    }
  };

  let modules: string[] = [];
  if (analytics)
    modules.push("analytics");
  if (crashes)
    modules.push("crashes");
  if (distribute)
    modules.push("distribute");
  if (!modules.length)
     modules = null;

  const answers = await prompt.autoAnsweringQuestion(questions, modules);
  modules = answers.modules as string[];
  let sdkModules = MobileCenterSdkModule.None;
  if (_.includes(modules, "analytics"))
    sdkModules |= MobileCenterSdkModule.Analytics;
  if (_.includes(modules, "crashes"))
    sdkModules |= MobileCenterSdkModule.Crashes;
  if (_.includes(modules, "distribute"))
    sdkModules |= MobileCenterSdkModule.Distribute;

  return sdkModules;
}