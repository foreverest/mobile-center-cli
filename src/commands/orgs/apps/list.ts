import { Command, CommandResult, help, success, failure, ErrorCodes, shortName, longName, hasArg, required } from "../../../util/commandline";
import { out } from "../../../util/interaction";
import { MobileCenterClient, models, clientRequest } from "../../../util/apis";

const debug = require("debug")("mobile-center-cli:commands:orgs:apps:list");
import { inspect } from "util";
import { getPortalOrgLink } from "../../../util/portal/portal-helper";
import { getOrgUsers } from "../lib/org-users-helper";

@help("Lists applications of organization")
export default class OrgAppsListCommand extends Command {
  @help("Name of the organization")
  @shortName("n")
  @longName("name")
  @required
  @hasArg
  name: string;

  async run(client: MobileCenterClient, portalBaseUrl: string): Promise<CommandResult> {
    try {
      const httpResponse = await out.progress("Loading list of organization apps...", clientRequest<models.AppResponse[]>((cb) => client.apps.listForOrg(this.name, cb)));
      if (httpResponse.response.statusCode < 400) {
        const table = [["Display Name", "Name", "OS", "Platform", "Origin"]].concat(httpResponse.result.map((app) => [app.displayName, app.name, app.os, app.platform, app.origin]));
        out.table(out.getNoTableBordersCollapsedVerticallyOptions(""), table);
        return success();
      } else {
        throw httpResponse.response;
      }
    } catch (error) {
      if (error.statusCode === 404) {
        return failure(ErrorCodes.InvalidParameter, `organization ${this.name} doesn't exist`);
      } else {
        debug(`Failed to load apps of organization - ${inspect(error)}`);
        return failure(ErrorCodes.Exception, `failed to load apps of organization`);
      }
    }
  }
}
