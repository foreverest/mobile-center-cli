//
// file-token-store - implementation of token store that stores the data in
// a JSON encoded file on dist.
//
// This doesn't secure the data in any way, relies on the directory having
// proper security settings.
//

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as rx from "rx-lite";
import { toPairs } from "lodash";

import { profileDirName } from "../../misc/constants";

const debug = require("debug")("mobile-center-cli:util:token-store:file:file-token-store");

import { TokenEntry, TokenStore, TokenKeyType, TokenValueType } from "../token-store";

const defaultPath = profileDirName;
const defaultFile = "tokens.json";

export class FileTokenStore implements TokenStore {
  private filePath: string;
  private tokenStoreCache: { [key: string]: TokenValueType };

  constructor(filePath: string) {
    this.filePath = filePath;
    this.tokenStoreCache = null;
  }

  getStoreFilePath(): string {
    return this.filePath;
  }

  list(): rx.Observable<TokenEntry> {
    this.loadTokenStoreCache();
    return rx.Observable.from(toPairs(this.tokenStoreCache)).map(pair => ({ key: pair[0], accessToken: pair[1]}));
  }

  get(key: TokenKeyType): Promise<TokenEntry> {
    this.loadTokenStoreCache();
    const token = this.tokenStoreCache[key];
    if (!token) {
      return Promise.resolve(null);
    }
    return Promise.resolve({key: key, accessToken: token});
  }

  set(key: TokenKeyType, value: TokenValueType): Promise<void> {
    this.loadTokenStoreCache();
    this.tokenStoreCache[key] = value;
    this.writeTokenStoreCache();
    return Promise.resolve();
  }

  remove(key: TokenKeyType): Promise<void> {
    this.loadTokenStoreCache();
    delete this.tokenStoreCache[key];
    this.writeTokenStoreCache();
    return Promise.resolve();
  }

  private loadTokenStoreCache(): void {
    if (this.tokenStoreCache === null) {
      debug(`Loading token store cache from file ${this.filePath}`);
      try {
        this.tokenStoreCache = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
        debug(`Token store loaded from file`);
      } catch (err) {
        if (err.code !== "ENOENT") {
          debug(`Failed to load or parse token store file`);
          throw err;
        }
        debug(`No token cache file, creating new empty cache`);
        this.tokenStoreCache = {};
      }
    }
  }

  private writeTokenStoreCache(): void {
    debug(`Saving token store file to ${this.filePath}`);
    fs.writeFileSync(this.filePath, JSON.stringify(this.tokenStoreCache));
  }
}

export function createFileTokenStore(pathName: string): TokenStore {
  return new FileTokenStore(pathName);
}