import type { FileContentReplacementProcessorType } from '../interfaces/index.js'

import fs                                           from 'node:fs'

export const fileContentReplacementProcessor: FileContentReplacementProcessorType = ({
  filePath,
  replacements,
  escapeRegExpUtil,
}) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    let modified = false

    for (const { from, to } of replacements) {
      const newContent = content.replace(new RegExp(escapeRegExpUtil(from), 'g'), to)

      if (newContent !== content) {
        console.info(`Content on ${filePath} replaced: from ${from} to ${to}`)
        content = newContent
        modified = true
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8')
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error)
  }
}
