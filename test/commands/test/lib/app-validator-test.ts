import { AppValidator } from "../../../../src/commands/test/lib/app-validator";
import { expect } from "chai";
import * as path from "path";
import * as fs from "fs";
import * as temp from "temp";
import * as JsZip from "jszip";
import * as JsZipHelper from "../../../../src/util/misc/jszip-helper";

function createFakeAppFile(appFilePath: string, entryNames: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    temp.mkdir("app-validator-tests", (error, dirPath) => {
      try {
        if (error) {
          reject(error);
          return;
        }

        let inputFile = path.join(dirPath, appFilePath);
        let zip = new JsZip();
        for (let entryName of entryNames) {
          zip.file(entryName, new Buffer("Fake file"));
        }

        JsZipHelper.writeZipToPath(inputFile, zip, "STORE").then(() => resolve(inputFile), (writingError) => reject(writingError));
      }
      catch (err) {
        reject(err);
      }
    });
  });
}

describe("Validating application file", () => {
  it("should accept iOS application", async () => {
    let appPath = await createFakeAppFile("myApp.ipa", []);
    await AppValidator.validate(appPath);
  });

  it("should accept Android app without shared runtime", async () => {
    let appPath = await createFakeAppFile("myApp.apk", []);
    await AppValidator.validate(appPath);
  });

  it("should reject Android app with shared runtime", async () => {
    let appPath = await createFakeAppFile("myApp.apk", [ "libmonodroid.so" ]);
    let errorCaught = false;
    try {
      await AppValidator.validate(appPath);
    }
    catch (error) {
      errorCaught = true;
    }

    expect(errorCaught).to.equal(true);
  });

  it("should reject non-Android and non-iOS applications", async () => {
    let appPath = await createFakeAppFile("myApp.foo", []);
    let errorCaught = false;
    try {
      await AppValidator.validate(appPath);
    }
    catch (error) {
      errorCaught = true;
    }

    expect(errorCaught).to.equal(true);
  });
});

