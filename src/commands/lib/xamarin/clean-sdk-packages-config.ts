import { XmlBag, XmlTag, XmlWalker } from "../util/xml-walker";

import { ISnippet } from "./../models/i-snippet";
import TextCutter from "../util/text-cuter";

export function cleanSdkPackagesConfig(code: string): string {
  let result: string;
  let info = analyzeCode(code);

  let textCutter = new TextCutter(code);

  info.packages.forEach(fragment =>
    textCutter
      .goto(fragment.position)
      .cut(fragment.text.length)
      .cutEmptyLine()
  );

  result = textCutter.result;
  if (/<packages>\s*<\/packages>/.test(result))
    result = '';

  return result;
}

function analyzeCode(code: string): CleanBag {

  let cleanBag = new CleanBag();
  let xmlWalker = new XmlWalker<CleanBag>(code, cleanBag);
  cleanBag.onTagReaded = (tag: XmlTag) => {
    if (tag.path === 'packages/package' && tag.attributes.id && tag.attributes.id.startsWith("Microsoft.Azure.Mobile"))
      cleanBag.packages.push(tag);
  };
  return xmlWalker.walk();
}

class CleanBag extends XmlBag {
  packages: ISnippet[] = [];
}