import { languageName } from '../lib/translation'

/**
 * The line's translation, shown once the singer has answered.
 *
 * Held back until then on purpose: the translation is the strongest possible
 * hint, so showing it with the prompt would turn a recall drill into a reading
 * exercise. Afterwards it is the thing that makes a foreign text stick — which
 * is why a two-language score keeps its second language instead of having it
 * stripped out (see src/lib/translation.ts).
 */
export function TranslationReveal({
  translation,
  language,
}: {
  translation?: string
  language?: string
}) {
  if (!translation?.trim()) return null

  return (
    <section className="mt-3 rounded-2xl border border-border bg-bg-soft/60 px-4 py-3" aria-live="polite">
      <p className="text-xs uppercase tracking-[0.15em] text-text-dim">
        Translation{language ? ` · ${languageName(language)}` : ''}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-text/80 italic">
        {translation}
      </p>
    </section>
  )
}
