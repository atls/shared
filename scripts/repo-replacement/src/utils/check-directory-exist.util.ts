import fs from "node:fs";
import type { CheckDirectoryExistType } from "../interfaces/index.js";

export const checkDirectoryExist: CheckDirectoryExistType = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory ${dirPath} does not exist`);
  }
};
