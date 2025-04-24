import type { Config } from "./config.interface.js";
import type { ApplyReplacementProcessorType } from "./apply-replacement-processor.interface.js";
import type { FileContentReplacementProcessorType } from "./file-content-replacement-processor.interface.js";
import type { EscapeRegExpUtilType } from "./escape-reg-exp-util.interface.js";

export interface DirecotryReplacementProcessorProps {
  directory: string;
  config: Config;
  applyReplacementProcessor: ApplyReplacementProcessorType;
  fileContentReplacementProcessor: FileContentReplacementProcessorType;
  escapeRegExpUtil: EscapeRegExpUtilType;
}

export type DirecotryReplacementProcessorType = (
  props: DirecotryReplacementProcessorProps,
) => Promise<void>;
