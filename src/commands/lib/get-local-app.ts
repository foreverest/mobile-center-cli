import * as JsZip from "jszip";
import * as JsZipHelper from "../../util/misc/jszip-helper";
import * as _ from "lodash";
import * as fs from "async-file";
import * as mkdirp from "mkdirp";
import * as path from "path";
import * as request from "request";

import { ErrorCodes, failure } from "../../util/commandline/index";
import { Question, Questions, Separator } from "../../util/interaction/prompt";
import { out, prompt } from "../../util/interaction";

import { ClientResponse } from "../../util/apis/index";
import { ILocalApp } from "./models/i-local-app";
import { glob } from "../../util/misc/promisfied-glob";

export default async function getLocalApp(dir: string, osArg: string, platformArg: string, sampleAppArg: boolean): Promise<ILocalApp> {
  const detectedApp = await detectLocalApp(dir);
  if (detectedApp && await prompt.confirm(`An existing ${detectedApp.os}/${detectedApp.platform} is detected. Do you want to use it?`)) 
    return detectedApp;
    
  const sampleApp = await inquireSampleApp(sampleAppArg, osArg, platformArg);

  if (sampleApp.confirm) 
    return await downloadSampleApp({ 
      dir, 
      os: sampleApp.os, 
      platform: sampleApp.platform 
    });

  return null;
}

async function downloadSampleApp(app: ILocalApp): Promise<ILocalApp> {

  const { uri, name } = getArchiveUrl(app.os, app.platform);
  const appDir = path.join(app.dir, name);
  const response = await out.progress(`Downloading the file... ${uri}`, downloadFile(uri));
  await out.progress("Unzipping the archive...", unzip(appDir, response.result));
  return {
    dir: appDir,
    os: app.os,
    platform: app.platform
  };

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

async function detectLocalApp(dir: string): Promise<ILocalApp> {
  const xcodeDirs = await glob(path.join(dir, "*.*(xcworkspace|xcodeproj)/"));
  if (xcodeDirs.length)
    return { 
      dir, 
      os: 'iOS', 
      platform: "Objective-C-Swift" 
    };
  const gradleFiles = await glob(path.join(dir, "build.gradle"));
  if (gradleFiles.length)
    return { 
      dir, 
      os: 'Android', 
      platform: "Java" 
    };
  return null;
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