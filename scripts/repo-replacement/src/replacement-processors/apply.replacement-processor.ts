import type { ApplyReplacementProcessorProps }  from '../interfaces/index.js'
import type { ApplyReplacementProcessorReturn } from '../interfaces/index.js'

export const applyReplacementProcessor = ({
  directory,
  replacements,
  escapeRegExpUtil,
}: ApplyReplacementProcessorProps): ApplyReplacementProcessorReturn => {
  let result = directory

  for (const { from, to } of replacements) {
    result = result.replace(new RegExp(escapeRegExpUtil(from), 'g'), to)
  }
  return result
}
