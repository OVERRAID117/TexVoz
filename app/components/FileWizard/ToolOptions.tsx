'use client'

import type { Dispatch, SetStateAction } from 'react'
import ExplainOptions from './ExplainOptions'
import SummaryOptions from './SummaryOptions'

import StudyGuideOptions from './StudyGuideOptions'
import AnalyzeOptions from './AnalyzeOptions'
import type { ExplainLevel, GuideType, AnalysisOptions } from './types'

type Props = {
  iaMode: number
  extension: number
  setExtension: Dispatch<SetStateAction<number>>
  explainLevel: ExplainLevel
  setExplainLevel: Dispatch<SetStateAction<ExplainLevel>>
    guideType: GuideType
  setGuideType: Dispatch<SetStateAction<GuideType>>
  analysisOptions: AnalysisOptions
  setAnalysisOptions: Dispatch<SetStateAction<AnalysisOptions>>
}

// iaMode: 0 Explícamelo · 1 Resúmelo · 2 Preguntas · 3 Guía de estudio · 4 Analizar
export default function ToolOptions({
  iaMode,
  extension, setExtension,
  explainLevel, setExplainLevel,
  guideType, setGuideType,
  analysisOptions, setAnalysisOptions,
}: Props) {
  switch (iaMode) {
    case 0:
      return <ExplainOptions explainLevel={explainLevel} setExplainLevel={setExplainLevel} />
    case 1:
      return <SummaryOptions extension={extension} setExtension={setExtension} />
    
    case 2:
      return <StudyGuideOptions guideType={guideType} setGuideType={setGuideType} />
    case 3:
      return <AnalyzeOptions analysisOptions={analysisOptions} setAnalysisOptions={setAnalysisOptions} />
    default:
      return <ExplainOptions explainLevel={explainLevel} setExplainLevel={setExplainLevel} />
  }
}
