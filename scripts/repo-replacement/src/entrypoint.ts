import type { Config }                     from './interfaces/index.js'

import { getArguments }                    from './getters/index.js'
import { direcotryReplacementProcessor }   from './replacement-processors/index.js'
import { applyReplacementProcessor }       from './replacement-processors/index.js'
import { fileContentReplacementProcessor } from './replacement-processors/index.js'
import { deleteReplacementProcessor }      from './replacement-processors/index.js'
import { checkDirectoryExist }             from './utils/index.js'
import { escapeRegExpUtil }                from './utils/index.js'
import { checkArgumentsUtil }              from './utils/index.js'

const { configString, targetDir } = getArguments()
checkArgumentsUtil({ configString, targetDir })

export const main = async () => {
  try {
    const config: Config = JSON.parse(configString)

    checkDirectoryExist(targetDir)

    console.log('Starting delete process...')
    deleteReplacementProcessor({
      targetDir,
      deletions: config.deletions,
    })
    console.log('Delete completed successfully!')

    console.log('Starting replacement process...')
    await direcotryReplacementProcessor({
      directory: targetDir,
      config,
      applyReplacementProcessor,
      fileContentReplacementProcessor,
      escapeRegExpUtil,
    })
    console.log('Replacement completed successfully!')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
