interface DeleteReplacementProcessorProps {
  targetDir: string
  deletions: Array<string>
}

export type DeleteReplacementProcessorType = (props: DeleteReplacementProcessorProps) => void
