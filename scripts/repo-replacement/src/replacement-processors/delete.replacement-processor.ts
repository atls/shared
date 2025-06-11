import type { DeleteReplacementProcessorType } from '../interfaces/index.js'

import fs                                      from 'node:fs'
import path                                    from 'node:path'

export const deleteReplacementProcessor: DeleteReplacementProcessorType = ({
  targetDir,
  deletions,
}) => {
  if (deletions) {
    deletions.forEach((deletePath) => {
      const absoluteDeletePath = path.resolve(targetDir, deletePath)
      console.log(absoluteDeletePath)
      fs.rmSync(absoluteDeletePath, { recursive: true, force: true })
      console.info(`Delete: ${deletePath}`)
    })

    return
  }

  console.info(`Deletions is empty, skip`)
}
