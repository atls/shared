import type { EscapeRegExpUtilType } from "../interfaces/index.js";

export const escapeRegExpUtil: EscapeRegExpUtilType = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
