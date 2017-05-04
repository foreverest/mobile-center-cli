import { MobileCenterClient, clientRequest, models } from "../../util/apis/index";
import { Question, Questions, Separator } from "../../util/interaction/prompt";
import { out, prompt } from "../../util/interaction/index";

import { IRemoteApp } from "./models/i-remote-app";
import { toDefaultApp } from "../../util/profile/index";

export default async function getRemoteApp(client: MobileCenterClient,
  appName: string,
  os: string,
  platform: string,
  createNew: boolean): Promise<IRemoteApp> {

  if (!createNew) {
    const appsResponse = await out.progress("Getting app list ...",
      clientRequest<models.AppResponse[]>(cb => client.apps.list(cb)));

    if (appsResponse.response.statusCode >= 400) {
      throw new Error("Unknown error when loading apps");
    }

    const apps = appsResponse.result.filter(app =>
      !os || app.os === os &&
      !platform || app.platform === platform);

    appName = await inquireAppName(apps, appName);

    if (!appName)
      createNew = true;
    else {
      const app = toDefaultApp(appName);
      if (!app) {
        throw new Error(`'${appName}' is not a valid application id`);
      }

      const appDetailsResponse = await out.progress("Getting app details ...",
        clientRequest<models.AppResponse>(cb => client.apps.get(app.ownerName, app.appName, cb)));

      const statusCode = appDetailsResponse.response.statusCode;

      if (statusCode >= 400) {
        switch (statusCode) {
          case 400:
            throw new Error("the request was rejected for an unknown reason");
          case 404:
            throw new Error(`the app "${app.identifier}" could not be found`);
          default:
            throw new Error("Unknown error when loading apps");
        }
      }

      return {
        appName: appDetailsResponse.result.name,
        ownerName: appDetailsResponse.result.owner.name,
        appSecret: appDetailsResponse.result.appSecret,
        os: appDetailsResponse.result.os,
        platform: appDetailsResponse.result.platform
      }
    }
  }

  if (createNew) {
    const newAppDetails = await inquireNewAppDetails(appName, os, platform);

    const createAppResponse = await out.progress("Creating app ...",
      clientRequest<models.AppResponse>(cb => client.apps.create(newAppDetails, cb))
    );
    const statusCode = createAppResponse.response.statusCode;
    if (statusCode >= 400) {
      switch (statusCode) {
        case 400:
          throw new Error("the request was rejected for an unknown reason");
        case 404:
          throw new Error("there appears to be no such user");
        case 409:
          throw new Error("an app with this 'name' already exists");
      }
    }

    return {
      appName: createAppResponse.result.name,
      ownerName: createAppResponse.result.owner.name,
      appSecret: createAppResponse.result.appSecret,
      os: createAppResponse.result.os,
      platform: createAppResponse.result.platform
    }
  }
}

async function inquireAppName(apps: models.AppResponse[], appName: string): Promise<string> {
  const createNewText: string = "Create new...";

  const question: Question = {
    type: "list",
    name: "appName",
    message: "Please choose a Mobile Center app to work with",
    choices: [createNewText].concat(apps.map(app => `${app.owner.name}/${app.name}`))
  };
  const answers = await prompt.autoAnsweringQuestion(question, appName);

  return answers.appName === createNewText ? null : answers.appName as string;
}

async function inquireNewAppDetails(appName: string, os: string, platform: string): Promise<models.AppRequest> {
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