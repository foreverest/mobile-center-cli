import { expect } from "chai";
import * as Os from "os";
import * as Fs from "async-file";
import * as Path from "path";

import { AddCocoapodsDependencies } from "../../../../../src/commands/lib/ios/sdk-integration-steps/add-cocoapods-dependencies";
import { XcodeIntegrationStepContext } from "../../../../../src/commands/lib/ios/xcode-sdk-integration";
import { MobileCenterSdkModule } from "../../../../../src/commands/lib/models/mobilecenter-sdk-module";

describe("AddCocoapodsDependencies", () => {
  async function runStep(podfileContent: string, sdkModules: MobileCenterSdkModule, sdkVersion?: string) {
    const step = new AddCocoapodsDependencies();
    step.nextStep = null;
    const podfilePath = Path.join(Os.tmpdir(), Math.random() * 10000000 + "-Podfile");
    if (podfileContent) {
      await Fs.writeTextFile(podfilePath, podfileContent);
    }

    const context = new XcodeIntegrationStepContext(Os.tmpdir(), podfilePath, "***", sdkModules, sdkVersion);
    context.projectRootDirectory = Path.join(context.projectOrWorkspacePath, "../");
    context.projectName = "TestProject";
    await step.run(context);
    await context.runActions();
    const content = context.podfilePath && Fs.readTextFile(context.podfilePath);
    if (context.podfilePath) {
      await Fs.delete(context.podfilePath);
    }

    return content;
  }

  it("Create new Podfile", async function () {
    let content = await runStep(null, MobileCenterSdkModule.All);
    expect(removeFirstLine(content)).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterCrashes'
  pod 'MobileCenter/MobileCenterDistribute'
end`);

    content = await runStep(null, MobileCenterSdkModule.Analytics | MobileCenterSdkModule.Distribute);
    expect(removeFirstLine(content)).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterDistribute'
end`);

    content = await runStep(null, MobileCenterSdkModule.Analytics | MobileCenterSdkModule.Crashes);
    expect(removeFirstLine(content)).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterCrashes'
end`);

    content = await runStep(null, MobileCenterSdkModule.Crashes | MobileCenterSdkModule.Distribute);
    expect(removeFirstLine(content)).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterCrashes'
  pod 'MobileCenter/MobileCenterDistribute'
end`);

    function removeFirstLine(text: string) {
      return text.substring(text.indexOf("\n") + 1);
    }
  });

  it("Update Podfile", async function () {
    const testContent = `target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterCrashes'
  pod 'MobileCenter/MobileCenterDistribute'
end`;

    let content = await runStep(testContent, MobileCenterSdkModule.All);
    expect(content).to.eq(testContent);

    content = await runStep(testContent, MobileCenterSdkModule.Analytics | MobileCenterSdkModule.Distribute);
    expect(content).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterDistribute'
end`);

    content = await runStep(testContent, MobileCenterSdkModule.Analytics | MobileCenterSdkModule.Crashes);
    expect(content).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterCrashes'
end`);

    content = await runStep(testContent, MobileCenterSdkModule.Crashes | MobileCenterSdkModule.Distribute);
    expect(content).to.eq(`target 'TestProject' do
  use_frameworks!
  pod 'MobileCenter/MobileCenterCrashes'
  pod 'MobileCenter/MobileCenterDistribute'
end`);
  });

  it("Update Podfile with nested target", async function () {
    const testContent = `target 'ParentTarget' do
  target 'TestProject' do
    use_frameworks!
  end
end`;

    let content = await runStep(testContent, MobileCenterSdkModule.All);
    expect(content).to.eq(`target 'ParentTarget' do
  target 'TestProject' do
    use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterCrashes'
  pod 'MobileCenter/MobileCenterDistribute'
  end
end`);
  });

  it("Update Podfile different formats", async function () {
    const testContent = `target :TestProject do
  use_frameworks!
  pod \u2018MobileCenter/MobileCenterAnalytics\u2019
  pod "MobileCenter/MobileCenterCrashes"
  # pod 'MobileCenter/MobileCenterDistribute'
end`;

    let content = await runStep(testContent, MobileCenterSdkModule.All);
    expect(content).to.eq(`target :TestProject do
  use_frameworks!
  pod 'MobileCenter/MobileCenterAnalytics'
  pod 'MobileCenter/MobileCenterCrashes'
  # pod 'MobileCenter/MobileCenterDistribute'
  pod 'MobileCenter/MobileCenterDistribute'
end`);
  });
});