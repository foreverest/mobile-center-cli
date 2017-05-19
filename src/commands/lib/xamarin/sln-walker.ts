import TextWalker from "../util/text-walker";

export class SlnWalker<TBag extends SlnBag> extends TextWalker<TBag> {

  constructor(text: string, bag: TBag) {
    super(text, bag);

    //comments
    this.addTrap(
      bag =>
        this.currentChar === '#',
      bag => {
        let matches = this.forepart.match(/^\#.*\n/); // TODO: it doesn't catch comments
        if (matches && matches[0])
          this.jump(matches[0].length);
      }
    );

    // project
    this.addTrap(
      bag =>
        this.forepart.substr(0, 7) === 'Project',
      bag => {
        let matches = this.forepart.match(/^Project\s*\(\s*"({\w{8}-\w{4}-\w{4}-\w{4}-\w{12}})"\s*\)\s*=\s*"((?:\w|\.)+)"\s*,\s*"((?:\w|\.|\\)+)"\s*,\s*"({\w{8}-\w{4}-\w{4}-\w{4}-\w{12}})"\s*EndProject/);
        if (matches && matches[0]) {
          bag.projects.push({
            typeGuid: matches[1],
            name: matches[2],
            path: matches[3],
            guid: matches[4]
          });
          this.jump(matches[0].length);
        }
      }
    );
  }
}

export class SlnBag {
  projects: IProject[] = [];
}

interface IProject {
  typeGuid: string;
  name: string;
  path: string;
  guid: string;
}