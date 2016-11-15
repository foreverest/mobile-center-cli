import { AppCommand, CommandArgs, CommandResult,
         help, success, name, shortName, longName, required, hasArg,
         position, failure, notLoggedIn } from "../../util/commandLine";
import { out } from "../../util/interaction";
import { getUser } from "../../util/profile";
import { MobileCenterClient, models, clientCall } from "../../util/apis";
import * as os from "os";

@help("Checks state of test run submitted to Visual Studio Mobile Center")
export default class CheckStateCommand extends AppCommand {
  @help("Id of the test run")
  @longName("test-run-id")
  @required
  @hasArg
  testRunId: string;

  @help("Continuously checks the state until the test run completes")
  @longName("continuous")
  continuous: boolean;

  constructor(args: CommandArgs) {
    super(args);
    this.continuous = this.continuous !== undefined;
  }

  async run(client: MobileCenterClient): Promise<CommandResult> {
    let exitCode = 0;

    while (true) {
      let state = await out.progress("Checking state...", this.getTestRunState(client));
      out.text(state.message.join(os.EOL));

      if (!this.continuous || (typeof state.exitCode === "number")) {
        if (state.exitCode) {
          exitCode = state.exitCode;
        }
        break;
      }

      out.text(`Waiting ${state.waitTime} seconds...`)
      await this.delay(1000 * state.waitTime);
    }

    if (exitCode !== 0) {
      return failure(exitCode, "");
    }
    else {
      return success();
    }
  }

  private async delay(milliseconds: number) {
    return new Promise<void>(resolve => {
      setTimeout(resolve, milliseconds);
    });
  }

  private getTestRunState(client: MobileCenterClient): Promise<models.TestRunState> {
    return clientCall(cb => {
      client.test.getTestRunState(
        this.testRunId,
        this.app.ownerName,
        this.app.appName,
        cb
      );
    });
  }
}