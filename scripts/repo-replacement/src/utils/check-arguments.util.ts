import type { CheckArgumentsUtilType } from '../interfaces/index.js'

export const checkArgumentsUtil: CheckArgumentsUtilType = ({ configString, targetDir }) => {
  if (!configString || !targetDir) {
    console.error('Not all arguments provided')
    console.info('Usage: yarn process <config-json-string> <target-directory>')
    process.exit(1)
  }
}
