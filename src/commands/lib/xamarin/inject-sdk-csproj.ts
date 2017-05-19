import * as _ from 'lodash'

import { XmlBag, XmlTag, XmlWalker } from "../util/xml-walker";

export function injectSdkCsproj(code: string, referenceLines: string[], noneLines: string[]): string {

  let info = analyzeCode(code, 'Reference');

  const intend = '\n    ';
  let result: string =
    code.substr(0, info.injectAt).replace(/\s*$/, intend) +
    referenceLines.map(x => x.split('\n').join(intend)).join(intend) +
    code.substr(info.injectAt).replace(/^\s*\n/, '\n');

  info = analyzeCode(result, 'None');
  if (info.injectAt && noneLines && noneLines.length) {
    result =
      result.substr(0, info.injectAt).replace(/\s*$/, intend) +
      noneLines.join(intend) +
      result.substr(info.injectAt).replace(/^\s*\n/, '\n');
  }

  return result;
}

function analyzeCode(code: string, itemName: string): InjectBag {
  let injectBag = new InjectBag();
  let xmlWalker = new XmlWalker<InjectBag>(code, injectBag);
  xmlWalker.walk();
  if (injectBag.error)
    throw injectBag.error;

  if (!injectBag.root || injectBag.root.name !== 'Project' || !injectBag.root.children.length)
    throw new Error('Incorrect project file format.');

  let itemGroup = _.find(injectBag.root.children, (tag: XmlTag) => tag.name === 'ItemGroup' && tag.children.some(child => child.name === itemName));

  if (!itemGroup)
    throw new Error('Could not find appropriate ItemGroup in the project file.');

  injectBag.injectAt = itemGroup.body.position;

  return injectBag;
}

class InjectBag extends XmlBag {
  injectAt: number;
}