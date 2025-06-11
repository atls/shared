import type { EscapeRegExpUtilType } from './escape-reg-exp-util.interface.js'
import type { Replacement }          from './replacement.interface.js'

export interface FileContentReplacementProcessorProps {
  filePath: string
  replacements: Array<Replacement>
  escapeRegExpUtil: EscapeRegExpUtilType
}

export type FileContentReplacementProcessorType = (
  props: FileContentReplacementProcessorProps
) => void
