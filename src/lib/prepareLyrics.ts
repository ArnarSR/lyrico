import { detectPhrases, type PhraseOptions, type PhraseStats } from './phrases'
import { detectTranslations, type TranslationDetection } from './translation'

/**
 * The one entry point for turning raw imported text into lines worth drilling.
 *
 * Order matters and is the reason this wrapper exists: translations are found
 * first, so that phrase detection sees them as marked rows and leaves them
 * alone. The other way round, an English translation starting in lower case
 * under a German line with no end punctuation looks exactly like a phrase
 * continuation and would be merged into the sung text.
 */
export interface PrepareResult {
  lyrics: string
  phrases: PhraseStats
  translation: TranslationDetection
  /** True when the text was changed at all, so the UI can offer an undo. */
  changed: boolean
}

export function prepareLyrics(raw: string, opts: Partial<PhraseOptions> = {}): PrepareResult {
  const translation = detectTranslations(raw)
  const phrases = detectPhrases(translation.lyrics, opts)
  const normalizedInput = raw.replace(/\r\n?/g, '\n').trim()

  return {
    lyrics: phrases.lyrics,
    phrases: phrases.stats,
    translation,
    changed: phrases.lyrics.trim() !== normalizedInput,
  }
}

/** One line describing what changed, for the notice above the textarea. */
export function describePrepare(result: PrepareResult): string {
  const parts: string[] = []
  const { phrases, translation } = result
  if (phrases.merged > 0) parts.push(`${phrases.merged} joined`)
  if (phrases.split > 0) parts.push(`${phrases.split} split`)
  if (phrases.syllablesRejoined > 0) parts.push(`${phrases.syllablesRejoined} syllables rejoined`)
  if (phrases.furnitureRemoved > 0) parts.push(`${phrases.furnitureRemoved} score markings removed`)
  if (translation.marked > 0 && translation.strategy !== 'marked') {
    parts.push(`${translation.marked} translation lines set aside`)
  }
  return parts.join(' · ')
}
