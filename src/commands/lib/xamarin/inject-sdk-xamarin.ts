import * as asyncFs from 'async-file';
import * as fs from 'fs';
import * as path from 'path';

import { AndroidCodeBag, AndroidCodeWalker } from './android/android-code-walker';
import { SlnBag, SlnWalker } from './sln-walker';
import { XmlBag, XmlTag, XmlWalker } from "../util/xml-walker";

import { MobileCenterSdkModule } from "../models/mobilecenter-sdk-module";
import TextCutter from "../util/text-cuter";
import { XamarinProjectType } from "./xamarin-project-type";
import { cleanSdkAndroidCs } from "./android/clean-sdk-android-cs";
import { cleanSdkPackagesConfig } from "./clean-sdk-packages-config";
import { injectSdkAndroidCs } from "./android/inject-sdk-android-cs";
import { injectSdkCsproj } from "./inject-sdk-csproj";
import { injectSdkPackagesConfig } from "./inject-sdk-packages-config";

const ANDROID_PROJECT_TYPE: string = 'EFBA0AD7-5A72-4C68-AF49-83D382785DCF';
const IOS_PROJECT_TYPE: string = 'FEACFBD2-3405-455C-9665-78FE426C6842';

// const androidTargetFrameworks: { [vesion: string]: string; } = {
//     ['v7.1']: 'monoandroid71',
//     ['v6.0']: 'monoandroid60',
//     ['v4.0.3']: 'monoandroid403',
// };

export async function injectSdkXamarin(csprojPath: string, sdkVersion: string,
  androidAppSecret: string, iOsAppSecret: string, sdkModules: MobileCenterSdkModule): Promise<any> {

  if (!csprojPath || !sdkVersion || !sdkModules)
    return Promise.reject(new Error("Invalid arguments."));

  let promise = Promise.resolve({
    csprojPath,
    referenceTags: [],
    codeFiles: []
  });

  promise = promise
    .then(readCsproj)
    .then(analyzeCsproj)
    .then(findSln)
    .then(readPackagesConfig)
    .then(determineProjectType)
    .then(function (projectInfo: IXamarinProjectInfo) {
      switch (projectInfo.projectType) {
        case XamarinProjectType.Android:
          return Promise.resolve(projectInfo)
            .then(androidFindMainActivity)
            .then(function (projectInfo: IXamarinProjectInfo) {
              return androidInjectMainActivity(projectInfo, androidAppSecret, sdkModules);
            })
      }
    })
    .then(function (projectInfo: IXamarinProjectInfo) {
      return injectPackagesConfig(projectInfo, sdkVersion, sdkModules);
    })
    .then(function (projectInfo: IXamarinProjectInfo) {
      return injectCsproj(projectInfo, sdkVersion, sdkModules);
    })
    .then(saveChanges);

  return promise;
}

async function findSln(projectInfo: IXamarinProjectInfo): Promise<IXamarinProjectInfo> {

  let slnFolder: string = path.dirname(projectInfo.csprojPath);
  while (true) {
    let files = await asyncFs.readdir(slnFolder);

    for (let slnPath of files.filter(x => path.extname(x).toLowerCase() === '.sln').map(x => path.join(slnFolder, x))) {
      let slnContent = await asyncFs.readTextFile(slnPath, 'utf8');
      let bag = new SlnBag();
      let walker = new SlnWalker(slnContent, bag);
      walker.walk();
      if (bag.projects.some(x => x.guid.toLowerCase() === projectInfo.projectGuid.toLowerCase())) {
        projectInfo.slnPath = slnPath;
        break;
      }
    }

    if (projectInfo.slnPath || slnFolder == path.dirname(slnFolder))
      break;
    slnFolder = path.dirname(slnFolder);
  }
  return projectInfo;
}

async function readCsproj(projectInfo: IXamarinProjectInfo): Promise<IXamarinProjectInfo> {

  return new Promise<IXamarinProjectInfo>(function (resolve, reject) {

    fs.exists(projectInfo.csprojPath, function (exists: boolean) {
      if (!exists)
        return reject(new Error('The project file is not found.'));

      fs.readFile(projectInfo.csprojPath, 'utf8', function (err, data: string) {
        if (err)
          reject(err);
        projectInfo.csprojContent = data;
        resolve(projectInfo);
      });
    });
  });
}

function readPackagesConfig(projectInfo: IXamarinProjectInfo): Promise<IXamarinProjectInfo> {
  projectInfo.packagesConfigPath = path.join(path.dirname(projectInfo.csprojPath), 'packages.config');
  return new Promise<IXamarinProjectInfo>(function (resolve, reject) {
    fs.readFile(projectInfo.packagesConfigPath, 'utf8', function (err, data: string) {
      projectInfo.packagesConfigContent = err ? '' : data;
      resolve(projectInfo);
    });
  });
}

function analyzeCsproj(projectInfo: IXamarinProjectInfo): Promise<IXamarinProjectInfo> {
  let xmlBag: XmlBag = new XmlBag();
  xmlBag.onTagReaded = (tag: XmlTag) => {
    switch (tag.path) {
      case 'Project/PropertyGroup/ProjectGuid':
        projectInfo.projectGuid = tag.body.text;
        break;
      case 'Project/PropertyGroup/ProjectTypeGuids':
        projectInfo.projectTypeGuids = tag.body.text;
        break;
      case 'Project/PropertyGroup/TargetFrameworkVersion':
        projectInfo.androidProject = { targetFrameworkVersion: tag.body.text };
        break;
      case 'Project/ItemGroup/Reference':
        if (tag.attributes.Include && tag.attributes.Include.startsWith("Microsoft.Azure.Mobile"))
          projectInfo.referenceTags.push(tag);
        break;
      case 'Project/ItemGroup/None':
        if (tag.attributes.Include === "packages.config")
          projectInfo.packagesConfigTag = tag;
        break;
      case 'Project/ItemGroup/Compile':
        if (tag.attributes.Include && tag.attributes.Include.endsWith(".cs"))
          projectInfo.codeFiles.push(tag.attributes.Include);
        break;
    }
  }

  let xmlWalker: XmlWalker<XmlBag> = new XmlWalker(projectInfo.csprojContent, xmlBag);
  xmlWalker.walk();

  return xmlBag.error ? Promise.reject(xmlBag.error) : Promise.resolve(projectInfo);
}

function determineProjectType(projectInfo: IXamarinProjectInfo): Promise<IXamarinProjectInfo> {

  if (~projectInfo.projectTypeGuids.toUpperCase().indexOf(ANDROID_PROJECT_TYPE) && projectInfo.androidProject)
    projectInfo.projectType = XamarinProjectType.Android;
  else
    return Promise.reject(new Error('Unknown project type'));

  return Promise.resolve(projectInfo);
}

function androidFindMainActivity(projectInfo: IXamarinProjectInfo): Promise<IXamarinProjectInfo> {

  let promise = Promise.resolve(undefined);
  for (let codeFile of projectInfo.codeFiles) {
    promise = promise.then(function (isFound: boolean) {
      if (isFound)
        return Promise.resolve(true);
      let fullPath = path.join(path.dirname(projectInfo.csprojPath), codeFile);
      return new Promise<boolean>(function (resolve, reject) {
        fs.exists(fullPath, function (exists: boolean) {
          if (!exists)
            return resolve(false);

          fs.readFile(fullPath, 'utf8', function (err: NodeJS.ErrnoException, data: string) {
            if (err)
              return reject(err);

            let androidCodeWalker = new AndroidCodeWalker(data, new AndroidCodeBag());
            androidCodeWalker.addTrap(
              bag => bag.isWithinClass,
              bag => {
                androidCodeWalker.stop();
                projectInfo.androidProject.mainActivityPath = fullPath;
                projectInfo.androidProject.mainActivityContent = data;
                return resolve(true);
              }
            );
            androidCodeWalker.walk();
            resolve(false);
          });
        });
      });
    });
  }

  return promise.
    then(function (isFound: boolean) {
      if (!isFound)
        throw new Error('Main activity is not found.');
      return projectInfo;
    });
}

function androidInjectMainActivity(projectInfo: IXamarinProjectInfo, appSecret: string, sdkModules: MobileCenterSdkModule): Promise<IXamarinProjectInfo> {

  let usingLines: string[] = [];
  let sdkModulesList: string[] = [];
  if (sdkModules)
    usingLines.push('using Microsoft.Azure.Mobile;');
  if (sdkModules & MobileCenterSdkModule.Analytics) {
    usingLines.push('using Microsoft.Azure.Mobile.Analytics;');
    sdkModulesList.push('typeof(Analytics)');
  }
  if (sdkModules & MobileCenterSdkModule.Crashes) {
    usingLines.push('using Microsoft.Azure.Mobile.Crashes;');
    sdkModulesList.push('typeof(Crashes)');
  }
  if (sdkModules & MobileCenterSdkModule.Distribute) {
    usingLines.push('using Microsoft.Azure.Mobile.Distribute;');
    sdkModulesList.push('typeof(Distribute)');
  }

  let startSdkLines: string[] = [];
  startSdkLines.push(`MobileCenter.Start("${appSecret}",`);
  startSdkLines.push(`        ${sdkModulesList.join(', ')});`);

  try {
    let cleanedCode = cleanSdkAndroidCs(projectInfo.androidProject.mainActivityContent);
    projectInfo.androidProject.mainActivityContent = injectSdkAndroidCs(cleanedCode, usingLines, startSdkLines);
  } catch (err) {
    return Promise.reject(err);
  }
  return Promise.resolve(projectInfo);
}

function injectPackagesConfig(projectInfo: IXamarinProjectInfo, sdkVersion: string, sdkModules: MobileCenterSdkModule): Promise<IXamarinProjectInfo> {
  let packagesStatements: string[] = [];

  let targetFramework: string = determineTargetFramework(projectInfo.androidProject.targetFrameworkVersion);

  if (sdkModules)
    packagesStatements.push(`<package id="Microsoft.Azure.Mobile" version="${sdkVersion}" targetFramework="${targetFramework}" />`);
  if (sdkModules & MobileCenterSdkModule.Analytics)
    packagesStatements.push(`<package id="Microsoft.Azure.Mobile.Analytics" version="${sdkVersion}" targetFramework="${targetFramework}" />`);
  if (sdkModules & MobileCenterSdkModule.Crashes)
    packagesStatements.push(`<package id="Microsoft.Azure.Mobile.Crashes" version="${sdkVersion}" targetFramework="${targetFramework}" />`);
  if (sdkModules & MobileCenterSdkModule.Distribute)
    packagesStatements.push(`<package id="Microsoft.Azure.Mobile.Distribute" version="${sdkVersion}" targetFramework="${targetFramework}" />`);

  try {
    let cleanedCode = cleanSdkPackagesConfig(projectInfo.packagesConfigContent);
    projectInfo.packagesConfigContent = injectSdkPackagesConfig(cleanedCode, packagesStatements);
  } catch (err) {
    return Promise.reject(err);
  }
  return Promise.resolve(projectInfo);
}

function determineTargetFramework(targetFrameworkVersion: string): string {
  let matches = /^v((?:\d\.)*\d)/i.exec(targetFrameworkVersion);
  return 'monoandroid' +
    (matches && matches[1] ? matches[1].replace(/\./g, '') : '403');
}

function injectCsproj(projectInfo: IXamarinProjectInfo, sdkVersion: string, sdkModules: MobileCenterSdkModule): Promise<IXamarinProjectInfo> {
  //clean csproj
  // TODO: handle packages.config declaration
  let textCutter = new TextCutter(projectInfo.csprojContent);
  projectInfo.referenceTags.forEach((tag: XmlTag) =>
    textCutter
      .goto(tag.position)
      .cut(tag.text.length)
      .cutEmptyLine()
  );
  let cleanedCode = textCutter.result;

  let packagesFolder = path.relative(projectInfo.csprojPath, projectInfo.slnPath);
  let referenceLines: string[] = getReferenceLines(projectInfo.projectType, sdkVersion, sdkModules);
  let noneLines: string[] = [];
  if (!projectInfo.packagesConfigTag && projectInfo.packagesConfigContent.trim())
    noneLines.push('<None Include="packages.config" />');
  try {
    projectInfo.csprojContent = injectSdkCsproj(cleanedCode, referenceLines, noneLines);
  } catch (err) {
    return Promise.reject(err);
  }
  return Promise.resolve(projectInfo);
}

function getReferenceLines(projectType: XamarinProjectType, sdkVersion: string, sdkModules: MobileCenterSdkModule) {
  let result: string[] = [];
  if (sdkModules) {
    switch (projectType) {
      case XamarinProjectType.Android:
        result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile', sdkVersion));
        result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile', sdkVersion, 'Microsoft.Azure.Mobile.Android.Bindings'));
        if (sdkModules & MobileCenterSdkModule.Analytics) {
          result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile.Analytics', sdkVersion));
          result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile.Analytics', sdkVersion, 'Microsoft.Azure.Mobile.Analytics.Android.Bindings'));
        }
        if (sdkModules & MobileCenterSdkModule.Crashes) {
          result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile.Crashes', sdkVersion));
          result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile.Crashes', sdkVersion, 'Microsoft.Azure.Mobile.Crashes.Android.Bindings'));
        }
        if (sdkModules & MobileCenterSdkModule.Distribute) {
          result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile.Distribute', sdkVersion));
          result.push(buildReferenceTag(projectType, 'Microsoft.Azure.Mobile.Distribute', sdkVersion, 'Microsoft.Azure.Mobile.Distribute.Android.Bindings'));
        }
        break;
    }
  }
  return result;
}

function buildReferenceTag(projectType: XamarinProjectType, packageName: string, sdkVersion: string, referenceName: string = packageName): string {
  let targetFramework: string;
  switch (projectType) {
    case XamarinProjectType.Android:
      targetFramework = 'MonoAndroid403';
      break;
  }
  // TODO: correctly locate packages folder
  return `<Reference Include="${referenceName}, Version=0.0.0.0, Culture=neutral, processorArchitecture=MSIL">\n` +
    `  <HintPath>..\\packages\\${packageName}.${sdkVersion}\\lib\\${targetFramework}\\${referenceName}.dll</HintPath>\n` +
    '</Reference>';
}

function saveChanges(projectInfo: IXamarinProjectInfo): Promise<any> {
  return Promise.resolve(undefined)
    .then(() => new Promise(function (resolve, reject) {
      fs.writeFile(projectInfo.packagesConfigPath, projectInfo.packagesConfigContent, function (err) {
        if (err)
          reject(err);
        resolve();
      });
    }))
    .then(() => new Promise(function (resolve, reject) {
      fs.writeFile(projectInfo.csprojPath, projectInfo.csprojContent, function (err) {
        if (err)
          reject(err);
        resolve();
      });
    }))
    .then(() => new Promise(function (resolve, reject) {
      switch (projectInfo.projectType) {
        case XamarinProjectType.Android:
          fs.writeFile(projectInfo.androidProject.mainActivityPath, projectInfo.androidProject.mainActivityContent, function (err) {
            if (err)
              reject(err);
            resolve();
          });
          break;
      }
    }));
}

interface IXamarinProjectInfo {
  projectGuid: string;

  csprojPath: string;
  csprojContent?: string;

  slnPath?: string;

  packagesConfigPath?: string;
  packagesConfigContent?: string;

  projectType?: XamarinProjectType;

  referenceTags: XmlTag[];
  packagesConfigTag?: XmlTag;

  codeFiles: string[];
  projectTypeGuids?: string;

  androidProject?: IAndroidProjectInfo;
}

interface IAndroidProjectInfo {
  targetFrameworkVersion?: string;
  mainActivityPath?: string;
  mainActivityContent?: string;
}
