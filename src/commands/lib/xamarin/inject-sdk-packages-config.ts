import { XmlBag, XmlWalker } from "../util/xml-walker";

export function injectSdkPackagesConfig(code: string, packages: string[]): string {
  let result: string;
  result = code.trim() ?
    code.replace(/<\s*packages\s*\/\s*>/, '<packages>\n</packages>') :
    '<?xml version="1.0" encoding="utf-8"?>\n<packages>\n</packages>';
  let info = analyzeCode(result);

  const intend = '\n  ';
  result =
    result.substr(0, info.injectAt).replace(/\s*$/, intend) +
    packages.join(intend) +
    result.substr(info.injectAt).replace(/^\s*\n/, '\n');

  return result;
}

function analyzeCode(code: string): InjectBag {
  let injectBag = new InjectBag();
  let xmlWalker = new XmlWalker<InjectBag>(code, injectBag);
  xmlWalker.walk();
  if (injectBag.error)
    throw injectBag.error;

  if (!injectBag.root || injectBag.root.name !== 'packages' || !injectBag.root.body)
    throw new Error('Incorrect packages.config file format.');

  injectBag.injectAt = injectBag.root.body.position;

  return injectBag;
}

class InjectBag extends XmlBag {
  injectAt: number;
}