import type { Replacement } from "./replacement.interface.js";

export interface Config {
  replacements: Array<Replacement>;
  deletions: Array<string>;
}
