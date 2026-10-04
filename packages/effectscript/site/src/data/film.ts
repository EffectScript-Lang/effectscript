/**
 * The launch film's slot on the landing page (ADR-0082). The film ("Introducing EffectScript",
 * `brand/film/TREATMENT.md`) isn't rendered yet, so the page shows its poster and stills and says
 * it premieres at launch. Set `src` to the hosted video when it is: Workers static assets cap a
 * file at 25 MiB, so the video lives elsewhere (R2 or Stream), not in `public/`.
 */
export const film: {
  readonly src: string | undefined
  readonly duration: string
  readonly seconds: number
} = {
  src: undefined,
  duration: "2:40",
  seconds: 160
}

/** Stills from the film, with the act each one belongs to and its time range (the treatment's acts). */
export const stills = [
  {
    name: "film-paper-avalanche",
    time: "0:30–0:54",
    act: "The ceremony",
    alt: "A room buried in an avalanche of printed pages"
  },
  {
    name: "film-threads-hall",
    time: "0:30–0:54",
    act: "The ceremony",
    alt: "A vast hall hung with tangled threads, one person standing below"
  },
  { name: "film-one-thread", time: "0:54–1:08", act: "The question", alt: "Two fingers holding one taut thread" },
  { name: "film-dawn", time: "2:06–2:24", act: "3:07 AM", alt: "An empty desk at dawn, the city outside the window" }
] as const
