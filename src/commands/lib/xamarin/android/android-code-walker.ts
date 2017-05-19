import * as _ from 'lodash'

import { CodeBag, CodeWalker } from "../../util/code-walker";

export class AndroidCodeWalker<TBag extends AndroidCodeBag> extends CodeWalker<TBag> {

  constructor(text: string, bag: TBag) {
    super(text, bag);

    //attributes
    this.addTrap(
      bag =>
        !bag.isWithinClass &&
        this.currentChar === ']',
      bag => {
        let matches = this.backpart.match(/\[\s*(\w+)\s*(\([^]*\))?\s*$/);
        if (matches && matches[1])
          bag.attributes.push({
            name: matches[1],
            arguments: matches[2] || ''
          });
      }
    );

    //class definition
    this.addTrap(
      bag =>
        !bag.isWithinClass &&
        this.currentChar === '{',
      bag => {
        const looksLikeActivityClass = /class\s+(\w+)\s*:\s*[\w<>\.]+\s*$/.test(this.backpart);
        const hasActivityAttribute = bag.attributes.some(x => x.name === 'Activity');
        const hasActivityAttributeWithMainLauncher = bag.attributes.some(x => x.name === 'Activity' &&
          /MainLauncher\s*=\s*true/.test(x.arguments));
        // TODO: handle string intent values
        const hasLauncherIntentFilters = bag.attributes.some(x => x.name === 'IntentFilter' &&
          /Intent\s*.\s*ActionMain/.test(x.arguments) &&
          /Intent\s*.\s*CategoryLauncher/.test(x.arguments));
        if (looksLikeActivityClass && (hasActivityAttributeWithMainLauncher || hasActivityAttribute && hasLauncherIntentFilters)) {
          bag.isWithinClass = true;
          bag.classBlockLevel = bag.blockLevel;
        }
      }
    );
    this.addTrap(
      bag =>
        bag.isWithinClass &&
        bag.blockLevel < bag.classBlockLevel &&
        this.currentChar === '}',
      bag => {
        bag.isWithinClass = false;
        bag.classBlockLevel = null;
        bag.attributes = [];
      }
    );

    //onCreate method definition
    this.addTrap(
      bag =>
        bag.isWithinClass &&
        this.currentChar === '{',
      bag => {
        let matches = this.backpart.match(/^([ \t]+)(?:override\s+protected|protected\s+override)\s+void\s+OnCreate\s*\(\s*Bundle\s+\w+\s*\)\s*$/m);
        if (matches) {
          bag.isWithinMethod = true;
          bag.indent = matches[1];
        }
      }
    );
    this.addTrap(
      bag =>
        bag.isWithinMethod &&
        bag.blockLevel <= bag.classBlockLevel,
      bag =>
        bag.isWithinMethod = false
    );
  }
}

export class AndroidCodeBag extends CodeBag {
  isWithinClass: boolean;
  isWithinMethod: boolean;
  indent: string;

  attributes: IAttribute[] = [];

  classBlockLevel: number;
}

interface IAttribute {
  name: string;
  arguments: string;
}