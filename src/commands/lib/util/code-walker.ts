import TextWalker from "./text-walker";

export class CodeWalker<TBag extends CodeBag> extends TextWalker<TBag> {

  constructor(text: string, bag: TBag) {
    super(replaceComments(text), bag);

    // Block levels
    this.addTrap(
      bag =>
        this.currentChar === "{",
      bag =>
        bag.blockLevel++
    );
    this.addTrap(
      bag =>
        this.currentChar === "}",
      bag =>
        bag.blockLevel--
    );

    // Quotes
    this.addTrap(
      bag =>
        this.currentChar === "'" ||
        this.currentChar === "\"",
      bag => {
        let matches = this.forepart.match(`^${this.currentChar}([^${this.currentChar}\\\\]|\\\\.)*${this.currentChar}`);
        if (matches && matches[0])
          this.jump(matches[0].length);
      }
    );
  }
}

export class CodeBag {
  blockLevel: number = 0;
}

function replaceComments(text: string): string {
  let result = text;
  for (let comment of standardComments) {
    while (true) {
      let matches = comment.exec(result);
      if (!matches || !matches[0])
        break;
      result = result.substr(0, matches.index) + ' '.repeat(matches[0].length) + result.substr(matches.index + matches[0].length);
    }
  }
  return result;
}

const standardComments: RegExp[] = [
  /\/\/.*/g,
  /\/\*[^]*?\*\//g
]