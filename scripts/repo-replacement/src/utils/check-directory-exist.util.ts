import type { CheckDirectoryExistType } from '../interfaces/index.js'

import fs                               from 'node:fs'

export const checkDirectoryExist: CheckDirectoryExistType = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory ${dirPath} does not exist`)
  }
}
