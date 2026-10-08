# The About opening film

The first 3.8 seconds of the About page's opening: the ball takes the hit,
catches fire, and is scanned away. It's a video so that everyone sees real
fire and real felt, which would be too heavy to draw live on every device.

It is not a separate animation. It renders the page's own scene code
(`../src/scripts/orbit/film/`, with the shared clock in `score.ts`, the ball's
spin in `ball.ts` and the camera in `layout.ts`), so its last frames line up
exactly with the live scene that takes over from it.

## Render

```bash
cd video
npm install          # once: Remotion and React, for this folder only
npm run render       # both cuts, encoded into ../public/about/orbit/
npm run studio       # scrub it in Remotion Studio
```

From the site root, `npm run render:film` does the same.

Outputs, in `public/about/orbit/`:

| File | What |
|---|---|
| `opening-16x9.mp4`, `.webm` | the wide cut, for landscape screens |
| `opening-9x16.mp4`, `.webm` | the tall cut, for phones |
| `opening-16x9.webp`, `.avif` (and 9x16) | the first frame, shown while the film loads (it's the page's largest paint, so it loads first) |

No sound track: the page synthesises the sound from the same clock, so it can
be muted, and so the voiceover and the effects stay in step.

## Speed

On a Mac, Remotion renders on the GPU: minutes. In a cloud container with no
GPU it renders in software, which works but is very slow (about two minutes a
frame). The committed film was rendered in software from this same scene code
with a lean frame-capture script (claude-learning,
`about-animation/tools/film.mjs`) and encoded with ffmpeg.

## When to re-render

After changing anything the film draws or times: `src/scripts/orbit/film/`,
`ball.ts`, `layout.ts` or `score.ts`. If you change the score, re-render the
film before deploying, or the page's live points will no longer meet the
film's scan line.

## Licence

Remotion is free for individuals under the
[Remotion License](https://www.remotion.dev/license). It's a build tool: only
the videos it renders ship. See `../docs/licences.md`.
