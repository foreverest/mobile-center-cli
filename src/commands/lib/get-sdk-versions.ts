import { downloadString } from "../../util/misc/promisfied-https";

export async function getSdkVersions(platform: string): Promise<string[]> {
  const repository = getRepositoryForPlatform(platform);
  const versions = await getReleasesVersions(repository);
  return versions;

  function getRepositoryForPlatform(platform: string) {
    switch (platform) {
      case "java": return "mobile-center-sdk-android";
      case "objective-c-swift": return "mobile-center-sdk-ios";
      case "react-native": return "mobile-center-sdk-react-native";
      case "xamarin": return "mobile-center-sdk-dotnet";
    }
  }

  async function getReleasesVersions(repo: string) {
    const response = await downloadString(`https://api.github.com/repos/Microsoft/${repo}/releases`);
    const releases = JSON.parse(response.result) as any[];
    return releases.map(x => x.name as string).map(x => x.replace(/[^0-9.]/g, "")).reverse();
  }
}