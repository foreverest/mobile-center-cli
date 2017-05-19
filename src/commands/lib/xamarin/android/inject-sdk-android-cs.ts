import { AndroidCodeBag, AndroidCodeWalker } from './android-code-walker';

export function injectSdkAndroidCs(code: string, usingLines: string[], startSdkLines: string[]): string {
  let result: string;
  let info = analyzeCode(code);

  if (info.injectStartSdkAt == undefined)
    throw new Error("Cannot integrate the MobileCenter SDK into the main activity file.");
  info.indent = info.indent || '            ';
  info.injectUsingsAt = info.injectUsingsAt || 0;

  let singleIndent = info.indent.substring(0, info.indent.length / info.classBlockLevel);

  result = code.substr(0, info.injectUsingsAt);
  usingLines.forEach(x => result += '\r\n' + x);
  result += code.substr(info.injectUsingsAt, info.injectStartSdkAt - info.injectUsingsAt).replace(/^\s*/, '\r\n\r\n');
  startSdkLines.forEach(x => result += '\r\n' + info.indent + singleIndent + x);
  result += code.substr(info.injectStartSdkAt).replace(/^[ \t]*}/, '\r\n' + info.indent + '}');

  return result;
}

function analyzeCode(code: string): InjectBag {

  let injectBag = new InjectBag();
  let walker = new AndroidCodeWalker<InjectBag>(code, injectBag);

  //using statements
  walker.addTrap(
    bag =>
      !bag.isWithinClass &&
      walker.prevChar === ';',
    bag => {
      let matches = walker.backpart.match(/using\s+[^;]+?;$/);
      if (matches && matches[0]) {
        bag.injectUsingsAt = walker.position;
      }
    }
  );

  //start SDK position
  walker.addTrap(
    bag =>
      bag.isWithinMethod,
    bag => {
      bag.injectStartSdkAt = walker.position + 1;
      walker.stop();
    }
  );

  return walker.walk();
}

class InjectBag extends AndroidCodeBag {
  injectUsingsAt: number;
  injectStartSdkAt: number;
}