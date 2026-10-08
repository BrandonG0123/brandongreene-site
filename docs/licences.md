# Licences

Every asset the site uses, and the terms it's used under. Add a row whenever
something new arrives (a sound, a clip, a font), before it ships.

## Code and tools

| What | Where | Licence | Notes |
|---|---|---|---|
| Astro 7 | the site's build | MIT | |
| three.js 0.186 | the 3D on every page, and the opening film | MIT | |
| Motion 14 | scroll-linked and spring animation | MIT | |
| Remotion 4.0.534 | `video/`: renders the About opening film | [Remotion Free License](https://www.remotion.dev/license) | Free for an individual. A build tool only: nothing of it ships to the page, only the videos it renders. |
| React 19 | `video/` only | MIT | |

## Fonts

| What | Where | Licence |
|---|---|---|
| Unbounded | `public/fonts`, `assets/og-fonts` | SIL Open Font License 1.1 |
| Atkinson Hyperlegible Next | `public/fonts` | SIL Open Font License 1.1 |
| IBM Plex Mono | `public/fonts`, `assets/og-fonts` | SIL Open Font License 1.1 |
| Fraunces | `assets/og-fonts` | SIL Open Font License 1.1 |

## The About opening

| What | Where | Source | Licence |
|---|---|---|---|
| The film (both cuts) and its posters | `public/about/orbit/opening-*` | Rendered from this repo's own scene code (`src/scripts/orbit/film/`) | This site's own |
| The piece stills | `public/about/orbit/pieces/` | Rendered from `src/scripts/orbit/` | This site's own |
| The calibration object | `public/models/footscan-calibration-object.stl`, simplified into `public/about/orbit/calibration.bin` | Brandon's own model (footscan) | Brandon's own |
| Sound effects | `src/scripts/orbit/sound.ts` | Synthesised in the browser: no recordings, no files | This site's own |
| Piano (stand-in) | `src/scripts/orbit/sound.ts` | An original phrase on a synthesised piano, written for this page | This site's own. To be replaced by Brandon's own playing: it must be his own music or a piece out of copyright, not a song. |
| Library sound effects | none yet | Public domain (CC0) only, each one's source recorded here when added | — |
| Footage and photos | none yet | Brandon's own, each frame checked for other people's faces, school names, signs and locations | Brandon's own |
| Voiceover | none yet (`public/about/voiceover.*`) | Brandon's own voice | Brandon's own |
