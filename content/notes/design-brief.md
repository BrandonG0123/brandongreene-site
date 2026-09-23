# Design brief — brandongreene.* — v1, 2026-09-18
Status: awaiting Brandon's approval. No CSS gets written until this is signed off.

## The one idea: the drawing sheet

Brandon does CAD, 3D printing, and is building a scanner whose entire output is
measured geometry. So the site borrows one thing from an engineering drawing —
not the look, the INFORMATION STRUCTURE:

  A drawing keeps the drawn object clean and pushes every fact about it
  (date, revision, scale, who drew it, what changed) into a title block and
  margin callouts.

Carried through the site as:
  - Every project page opens with a TITLE BLOCK: name, status, started, last
    updated, solo/group, role. Fixed field order on every page, so a reader
    skimming four projects finds the same fact in the same place each time.
  - A left MARGIN RAIL holds metadata as mono callouts. The reading column
    holds only prose and images.
  - Section dividers are a single hairline, the way a drawing rules off a zone.

One idea, three consistent applications. Explicitly NOT doing: blueprint-blue
backgrounds, faux grid paper texture, drafting-compass icons, animated
"scanning" effects. If a flourish doesn't help a reader find a fact faster, cut.

## Palette

Premise: graphite on warm paper, not black on white. Two accents only, each
with an assigned JOB, so color always means something.

  Graphite   #1A1C1E  Body text, light theme. Pencil, not pure black - 21:1 pure
                      black on white glares at long reading lengths.
  Vellum     #FAF7F2  Page ground, light theme. Warm off-white of drafting
                      vellum; lowers glare without tinting photos.
  Slate      #4A4F55  Secondary text, captions, callouts. Recedes without
                      dropping under 4.5:1.
  Section    #005F73  Links, focus rings, In-progress status. Deep teal of a
                      section cut-line. Sole interactive color - if it's this
                      color, it does something.
  Markup     #A4321E  Reserved ONLY for the "what failed / what I'd do
                      differently" annotations. The red pencil of a review
                      markup. Restraint is the point: it appears a few times
                      per site and therefore still means something.
  Rule       #8C857A  Borders and boundaries (light). Verified 3.42:1.

Dark theme is a separate design, not an inversion - a lit drawing in a dark
room:
  Ground #15171A / Surface #1D2025 / Ink #E9E5DD / Muted #A5AAB2
  Section #6FD2E2 / Markup #F08A72 / Rule #67707B

### Verified contrast (computed, not estimated)
  LIGHT  ink/vellum        15.99:1   need 4.5  PASS
  LIGHT  slate/vellum       7.73:1   need 4.5  PASS
  LIGHT  section/vellum     6.81:1   need 4.5  PASS
  LIGHT  markup/vellum      6.44:1   need 4.5  PASS
  LIGHT  rule/vellum        3.42:1   need 3.0  PASS
  DARK   ink/ground        14.30:1   need 4.5  PASS
  DARK   muted/ground       7.69:1   need 4.5  PASS
  DARK   section/ground    10.26:1   need 4.5  PASS
  DARK   markup/ground      7.34:1   need 4.5  PASS
  DARK   rule/ground        3.57:1   need 3.0  PASS

## Type — three faces, three jobs. All OFL, all self-hosted woff2 subsets.

  DISPLAY  Fraunces
    h1, h2, project titles, pull quotes.
    Variable serif with optical-size and "wonk" axes - it has actual opinions
    at large sizes. Set with wonk dialled low so it reads considered, not cute.
    Not Inter. Not Space Grotesk. Not a default.

  BODY     Atkinson Hyperlegible Next
    All running prose.
    Drawn by the Braille Institute specifically so low-vision readers can tell
    characters apart - disambiguated 1/l/I, 0/O, rn/m. Choosing it puts the
    accessibility commitment in the typography itself rather than only in the
    audit. It is also genuinely pleasant at 18px.

  MONO     IBM Plex Mono
    Title-block fields, dates, status labels, margin callouts, code, data.
    Industrial lineage, reads as instrumentation. Carries the drawing-sheet
    idea without any decoration.

  Scale: 1.25 major third off an 18px body. Line height 1.65 body, 1.15
  display. Reading experience is settled BEFORE anything else gets added.

  MEASURE — revised 2026-09-23 after measuring the built site.
  The brief originally said 65ch. That was wrong: `ch` is the width of the "0"
  glyph, and in a proportional face it overshoots badly. 65ch rendered 95
  actual characters per line on both iPad and Mac. Now --measure: 33rem, which
  measures 65 characters at 744px, 1180px and 1440px. Do not express the
  measure in ch.

  Alternative if Fraunces reads too warm - say so and I'll swap:
    Instrument Serif (sharper, more editorial) or Archivo Expanded (engineered,
    technical). One swap, not a redesign.

## Layout concept (two sentences)

One measured reading column capped near 65 characters sits beside a persistent
left margin rail, and every fact about the work - date, status, revision, links
- lives in that rail as a mono callout so the reading column carries nothing
but prose and images. Below 900px the rail collapses into a labeled block above
the content rather than disappearing, so no information is ever viewport-
dependent.

## Status system — shape + label + color, never color alone

  Shipped      filled square, label "Shipped", Graphite
  In progress  half-filled square, label "In progress", Section teal,
               plus "N log entries - last updated <date>"
  Planned      hollow square, label "Planned", Muted
               one line on /projects, NO page, NOT in the main grid

Legible with color vision differences, in greyscale, and when printed. The
In-progress badge carrying its own entry count and date is deliberate: it makes
the claim self-evidencing.

## What I am not doing
No gradient hero. No card grid of identical tiles. No skill bars. No
"passionate developer." No counters animating up. No project that does not
exist getting a page.
