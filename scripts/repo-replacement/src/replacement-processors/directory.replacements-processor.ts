import type { DirecotryReplacementProcessorProps } from '../interfaces/index.js'

import fs                                          from 'node:fs'
import path                                        from 'node:path'

export const direcotryReplacementProcessor = async ({
  directory,
  config,
  applyReplacementProcessor,
  fileContentReplacementProcessor,
  escapeRegExpUtil,
}: DirecotryReplacementProcessorProps) => {
  const newDirectoryName = applyReplacementProcessor({
    directory,
    replacements: config.replacements,
    escapeRegExpUtil,
  })

  const shouldIgnore = config.ignore?.some(
    (ignorePath) => directory.includes(ignorePath) || path.basename(directory) === ignorePath
  )

  if (shouldIgnore) {
    console.log(`Skipping ignored directory: ${directory}`)
    return
  }

  if (path.basename(directory) === '.git') {
    console.log(`Skipping .git directory: ${directory}`)
    return
  }

  if (newDirectoryName !== directory) {
    fs.renameSync(directory, newDirectoryName)
    console.info(`Direcotry renamed: from ${directory} to ${newDirectoryName}`)
    directory = newDirectoryName
  }

  const items = fs.readdirSync(directory, { withFileTypes: true })

  for (const item of items) {
    let fullPath = path.join(directory, item.name)
    const newName = applyReplacementProcessor({
      directory: item.name,
      replacements: config.replacements,
      escapeRegExpUtil,
    })

    if (item.isDirectory()) {
      if (newName !== item.name) {
        const newPath = path.join(directory, newName)
        fs.renameSync(fullPath, newPath)
        console.info(`Direcotry renamed: from ${fullPath} to ${newPath}`)
        await direcotryReplacementProcessor({
          directory: newPath,
          config,
          applyReplacementProcessor,
          fileContentReplacementProcessor,
          escapeRegExpUtil,
        })
      } else {
        await direcotryReplacementProcessor({
          directory: fullPath,
          config,
          applyReplacementProcessor,
          fileContentReplacementProcessor,
          escapeRegExpUtil,
        })
      }
    } else if (item.isFile()) {
      if (newName !== item.name) {
        const newPath = path.join(directory, newName)
        fs.renameSync(fullPath, newPath)
        console.info(`File renamed: from ${directory} to ${newDirectoryName}`)
        fullPath = newPath
      }

      fileContentReplacementProcessor({
        filePath: fullPath,
        replacements: config.replacements,
        escapeRegExpUtil,
      })
    }
  }
}
