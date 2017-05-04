import * as _ from "lodash";

import { MobileCenterSdkModule } from "./models/mobilecenter-sdk-module";
import { Question } from "../../util/interaction/prompt";
import { prompt } from "../../util/interaction";

export default async function getSdkModules(analytics: boolean, crashes: boolean, distribute: boolean): Promise<MobileCenterSdkModule> {
  let sdkModules: MobileCenterSdkModule = MobileCenterSdkModule.None;
  if (this.analyticsModule)
    sdkModules |= MobileCenterSdkModule.Analytics;
  if (this.crashesModule)
    sdkModules |= MobileCenterSdkModule.Crashes;
  if (this.distributeModule)
    sdkModules |= MobileCenterSdkModule.Distribute;

  return sdkModules || inquireSdkModules();
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