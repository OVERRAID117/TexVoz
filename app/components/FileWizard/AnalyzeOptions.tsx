'use client'

import type { Dispatch, SetStateAction } from 'react'
import styles from '../FileWizard.module.css'
import type { AnalysisOptions } from './types'

type Props = {
  analysisOptions: AnalysisOptions
  setAnalysisOptions: Dispatch<SetStateAction<AnalysisOptions>>
}

const OPTIONS: { key: keyof AnalysisOptions; label: string }[] = [
  { key: 'keyPoints',       label: 'Puntos importantes' },
  { key: 'risks',           label: 'Riesgos' },
  { key: 'inconsistencies', label: 'Inconsistencias' },
  { key: 'obligations',     label: 'Obligaciones y pendientes' },
  { key: 'recommendations', label: 'Recomendaciones' },
]

export default function AnalyzeOptions({ analysisOptions, setAnalysisOptions }: Props) {
  const activeCount = Object.values(analysisOptions).filter(Boolean).length

  const toggle = (key: keyof AnalysisOptions) => {
    // No permitir que queden todas desmarcadas
    if (analysisOptions[key] && activeCount === 1) return
    setAnalysisOptions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      <p className={styles.configBlockTitle}>¿Qué quieres detectar?</p>

      <div className={styles.radioGroupV}>
        {OPTIONS.map(opt => (
          <label
            key={opt.key}
            className={`${styles.radioItem} ${analysisOptions[opt.key] ? styles.radioActive : ''}`}
          >
            <input
              type="checkbox"
              checked={analysisOptions[opt.key]}
              onChange={() => toggle(opt.key)}
            />
            <div>
              <strong>{opt.label}</strong>
            </div>
          </label>
        ))}
      </div>

      <div className={styles.includesBox}>
        <p className={styles.includesItem}>
          💡 La IA adaptará el análisis al tipo de documento.
        </p>
      </div>
    </>
  )
}
