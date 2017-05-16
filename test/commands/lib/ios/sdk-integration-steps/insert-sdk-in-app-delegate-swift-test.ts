import { expect } from "chai";
import * as Os from "os";
import * as Fs from "async-file";
import * as Path from "path";
import * as Mkdirp from "mkdirp";
import * as Rimraf from "rimraf";

import { InsertSdkInAppDelegateSwift } from "../../../../../src/commands/lib/ios/sdk-integration-steps/insert-sdk-in-app-delegate-swift";
import { XcodeIntegrationStepContext } from "../../../../../src/commands/lib/ios/xcode-sdk-integration";
import { MobileCenterSdkModule } from "../../../../../src/commands/lib/models/mobilecenter-sdk-module";

describe("InsertSdkInAppDelegateSwift", () => {
  async function runStep(content: string, sdkModules: MobileCenterSdkModule) {
    const step = new InsertSdkInAppDelegateSwift();
    step.nextStep = null;
    const appDelegatePath = Path.join(Os.tmpdir(), Math.random() * 10000000 + "-AppDelegate.swift");
    await Fs.writeTextFile(appDelegatePath, content);
    const context = new XcodeIntegrationStepContext(null, null, "***", sdkModules, null);
    context.appDelegateFile = appDelegatePath;
    await step.run(context);
    await context.runActions();
    return await Fs.readTextFile(appDelegatePath);
  }

  function appDelegateTemplate(importBlock?: string, startBlock?: string) {
    return `import UIKit${importBlock || ""}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplicationLaunchOptionsKey: Any]?) -> Bool {${startBlock || ""}
        return true
    }
}`;
  }

  it("Insert", async function () {
    const content = await runStep(appDelegateTemplate(), MobileCenterSdkModule.All);

    expect(content).to.eq(appDelegateTemplate(`
import MobileCenter
import MobileCenterAnalytics
import MobileCenterCrashes
import MobileCenterDistribute`, `
        MSMobileCenter.start("***", withServices: [MSAnalytics.self, MSCrashes.self, MSDistribute.self])`));
  });

  describe("Update", () => {
    const testContent = appDelegateTemplate(`
import MobileCenter
import MobileCenterAnalytics
import MobileCenterCrashes
import MobileCenterDistribute`, `
        MSMobileCenter.start("***", withServices: [MSAnalytics.self, MSCrashes.self, MSDistribute.self])`);

    it("#1", async function () {
      let content = await runStep(testContent, MobileCenterSdkModule.Analytics | MobileCenterSdkModule.Distribute);
      expect(content).to.eq(appDelegateTemplate(`
import MobileCenter
import MobileCenterAnalytics
import MobileCenterDistribute`, `
        MSMobileCenter.start("***", withServices: [MSAnalytics.self, MSDistribute.self])`));

      content = await runStep(content, MobileCenterSdkModule.Crashes);
      content = await runStep(content, MobileCenterSdkModule.All);

      expect(moveLine(content, 2, 3)).to.eq(testContent)
    });

    it("#2", async function () {
      let  content = await runStep(testContent, MobileCenterSdkModule.Analytics | MobileCenterSdkModule.Crashes);
      expect(content).to.eq(appDelegateTemplate(`
import MobileCenter
import MobileCenterAnalytics
import MobileCenterCrashes`, `
        MSMobileCenter.start("***", withServices: [MSAnalytics.self, MSCrashes.self])`));

      content = await runStep(content, MobileCenterSdkModule.Distribute);
      content = await runStep(content, MobileCenterSdkModule.All);

      expect(moveLine(content, 2, 4)).to.eq(testContent)
    });

    it("#3", async function () {
      let content = await runStep(testContent, MobileCenterSdkModule.Crashes | MobileCenterSdkModule.Distribute);
      expect(content).to.eq(appDelegateTemplate(`
import MobileCenter
import MobileCenterCrashes
import MobileCenterDistribute`, `
        MSMobileCenter.start("***", withServices: [MSCrashes.self, MSDistribute.self])`))

      content = await runStep(content, MobileCenterSdkModule.Analytics);
      content = await runStep(content, MobileCenterSdkModule.All);

      expect(content).to.eq(testContent)
    });

    it("#4", async function () {
      let content = await runStep(testContent, MobileCenterSdkModule.Analytics);
      expect(content).to.eq(appDelegateTemplate(`
import MobileCenter
import MobileCenterAnalytics`, `
        MSMobileCenter.start("***", withServices: [MSAnalytics.self])`));

      content = await runStep(content, MobileCenterSdkModule.Crashes | MobileCenterSdkModule.Distribute);
      content = await runStep(content, MobileCenterSdkModule.All);

      expect(moveLine(content, 4, 2)).to.eq(testContent)
    });

    function moveLine(text: string, fromIndex: number, toIndex: number) {
      const array = text.split("\n");
      const element = array[fromIndex];
      array.splice(fromIndex, 1);
      array.splice(toIndex, 0, element);
      return array.join("\n");
    }
  });
});