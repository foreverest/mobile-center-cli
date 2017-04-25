import { MobileCenterSdkModule } from "../mobilecenter-sdk-module";

export abstract class SdkIntegrationStepBase<T> {
  protected nextStep: SdkIntegrationStepBase<T>;
  protected context: T;

  public async run(context: T): Promise<void> {
    this.context = context;
    await this.step();
    await this.runNextStep();
  }

  protected abstract step(): any;

  private runNextStep(): Promise<void> {
    if (this.nextStep) {
      return this.nextStep.run(this.context);
    }
  }
}

export class SdkIntegrationError extends Error {
  constructor(message: string) {
    super(message);
  }

  public toString() {
    return this.message;
  }
}

export abstract class SdkIntegrationStepContextBase {
  public projectPath: string;
  public sdkVersion: string;
  public appSecret: string;
  public sdkModules: MobileCenterSdkModule;

  private actions: (() => (Promise<void> | void))[] = [];

  constructor(projectPath: string, sdkVersion: string, appSecret: string, sdkModules: MobileCenterSdkModule) {
    this.projectPath = projectPath;
    this.sdkVersion = sdkVersion;
    this.appSecret = appSecret;
    this.sdkModules = sdkModules;
  }

  public enqueueAction(action: () => (Promise<void> | void)) {
    this.actions.push(action);
  }

  public async runActions() {
    for (const action of this.actions) {
      await action();
    }
  }

  public get analyticsEnabled() {
    return (this.sdkModules & MobileCenterSdkModule.Analytics) === MobileCenterSdkModule.Analytics;
  }
  public get crashesEnabled() {
    return (this.sdkModules & MobileCenterSdkModule.Crashes) === MobileCenterSdkModule.Crashes;
  }
  public get distributeEnabled() {
    return (this.sdkModules & MobileCenterSdkModule.Distribute) === MobileCenterSdkModule.Distribute;
  }
}