import { IBuildGradle, IBuildVariant, ISourceSet, IDependenciesBlock } from './models/build-gradle';
import * as fs from "async-file";
const gjs = require("gradlejs");
import * as _ from "lodash"
import { CodeBag, CodeWalker } from "../util/code-walker";
import removeComments from "../util/remove-comments";

export default async function collectBuildGradleInfo(buildGradlePath: string): Promise<IBuildGradle> {
  let contents = await fs.readTextFile(buildGradlePath, "utf8");

  const buildVariants = await getBuildVariants(contents);
  const sourceSets = await getSourceSets(contents);
  
  const info = analyze(contents);

  return {
    path: buildGradlePath,
    contents,
    buildVariants,
    sourceSets,
    dependenciesBlocks: info.dependenciesBlocks
  };
}

async function getBuildVariants(buildGradleContents: string): Promise<IBuildVariant[]> {
  const matches = buildGradleContents.match(/(android\s*{[^]*})/);
  let buildGradle = await gjs.parseText(matches && matches.length ? matches[0] : buildGradleContents);

  let buildTypes: string[] = ["debug", "release"];
  let productFlavors: string[];
  if (buildGradle && buildGradle.android) {
    if (buildGradle.android.buildTypes) {
      Object.keys(buildGradle.android.buildTypes).forEach((buildType: string) => {
        if (!_.includes(buildTypes, buildType) && buildType.trim()) {
          buildTypes.push(buildType);
        }
      });
    }

    if (buildGradle.android.productFlavors) { //TODO: handle flavorDimensions & variantFilters
      productFlavors = Object.keys(buildGradle.android.productFlavors).filter(x => x.trim());
    }
  }

  let buildVariants: IBuildVariant[];
  if (!productFlavors || !productFlavors.length) {
    buildVariants = buildTypes.map(x => getBuildVariant(x));
  } else {
    buildVariants = [];
    productFlavors.forEach(productFlavor => {
      buildTypes.forEach(buildType => {
        buildVariants.push(getBuildVariant(buildType, [productFlavor])); //TODO: handle flavorDimensions
      });
    });
  }

  return buildVariants;
}

function getBuildVariant(buildType: string, productFlavors?: string[]): IBuildVariant {
  let name = buildType;
  if (productFlavors)
    productFlavors.forEach(pf => name = pf + name[0].toLocaleUpperCase() + name.substr(1));
  return {
    name,
    buildType,
    productFlavors
  };
}

async function getSourceSets(buildGradleContents: string): Promise<ISourceSet[]> {
  const matches = buildGradleContents.match(/(android\s*{[^]*})/);
  let buildGradle = await gjs.parseText(matches && matches.length ? matches[0] : buildGradleContents);

  const sourceSets: ISourceSet[] = [];
  if (buildGradle && buildGradle.android && buildGradle.android.sourceSets) {
    sourceSets.push(...Object.keys(buildGradle.android.sourceSets).map(sourceSetName => {
      return <ISourceSet>{
        name: sourceSetName,
        manifestSrcFile: buildGradle.android.sourceSets[sourceSetName]["manifest.srcFile"],
        javaSrcDirs: buildGradle.android.sourceSets[sourceSetName]["java.srcDirs"]
      }
    }));
  }

  return sourceSets;
}

function analyze(contents: string): CleanBag {
  let cleanBag = new CleanBag();
  let textWalker = new CodeWalker<CleanBag>(contents, cleanBag);

  // Collecting dependencies blocks
  textWalker.addTrap(
    bag =>
      bag.blockLevel === 1 &&
      !bag.currentBlock &&
      textWalker.prevChar === "{",
    bag => {
      let matches = removeComments(textWalker.backpart).match(/dependencies\s*{$/);
      if (matches && matches[0]) {
        bag.currentBlock = {
          position: textWalker.position,
          text: "",
          defs: [],
          compiles: []
        };
      }
    }
  );
  textWalker.addTrap(
    bag =>
      bag.blockLevel === 1 &&
      bag.currentBlock &&
      textWalker.nextChar === "}",
    bag => {
      if (bag.currentBlock.compiles.length) {
        bag.currentBlock.text = contents.substring(bag.currentBlock.position, textWalker.position + 1);
        bag.dependenciesBlocks.push(bag.currentBlock);
      }
      bag.currentBlock = null;
    }
  );

  // Catching defs
  textWalker.addTrap(
    bag =>
      bag.currentBlock &&
      textWalker.forepart.startsWith("def"),
    bag => {
      let matches = removeComments(textWalker.forepart).match(/^def\s+(\w+)\s*=\s*["'](.+?)["']/);
      if (matches && matches[1] && matches[2])
        bag.currentBlock.defs.push({
          text: matches[0],
          name: matches[1],
          value: matches[2],
          position: textWalker.position - bag.currentBlock.position
        });
    }
  );

  // Catching compiles
  textWalker.addTrap(
    bag =>
      bag.currentBlock &&
      textWalker.forepart.startsWith("compile"),
    bag => {
      let matches = removeComments(textWalker.forepart).match(/^compile\s*["']com.microsoft.azure.mobile:mobile-center-(analytics|crashes|distribute):[^]+?["']/);
      if (matches && matches[1])
        bag.currentBlock.compiles.push({
          text: matches[0],
          moduleName: matches[1],
          position: textWalker.position - bag.currentBlock.position
        });
    }
  );

  return textWalker.walk();
}

class CleanBag extends CodeBag {
  currentBlock: IDependenciesBlock;
  dependenciesBlocks: IDependenciesBlock[] = [];
}