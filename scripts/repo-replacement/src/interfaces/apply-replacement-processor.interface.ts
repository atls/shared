import { Replacement } from "./replacement.interface.js";
import type { EscapeRegExpUtilType } from "./escape-reg-exp-util.interface.js";

export interface ApplyReplacementProcessorProps {
  directory: string;
  replacements: Array<Replacement>;
  escapeRegExpUtil: EscapeRegExpUtilType;
}

export type ApplyReplacementProcessorReturn = string;

export type ApplyReplacementProcessorType = (
  props: ApplyReplacementProcessorProps,
) => ApplyReplacementProcessorReturn;
