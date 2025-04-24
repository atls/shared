import type { Replacement } from "./replacement.interface.js";
import type { EscapeRegExpUtilType } from "./escape-reg-exp-util.interface.js";

export interface FileContentReplacementProcessorProps {
  filePath: string;
  replacements: Array<Replacement>;
  escapeRegExpUtil: EscapeRegExpUtilType;
}

export type FileContentReplacementProcessorType = (
  props: FileContentReplacementProcessorProps,
) => void;
