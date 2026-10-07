import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

/**
 * Open Graph card generation.
 *
 * The card is the design brief's title block at 1200x630: a ruled sheet, the
 * name in the top margin, the title set in Unbounded, and the facts along the
 * bottom in mono. Same information hierarchy as a project page, so a link
 * preview and the page itself read as the same object.
 *
 * Fonts live in assets/og-fonts as TTF because satori cannot read woff2. They
 * are build-time only — never served to a browser, so they cost the page
 * nothing.
 */

const FONT_DIR = path.join(process.cwd(), 'assets/og-fonts');
const fonts = [
  { name: 'Unbounded', data: fs.readFileSync(path.join(FONT_DIR, 'Unbounded-800.ttf')), weight: 800 as const, style: 'normal' as const },
  { name: 'IBM Plex Mono', data: fs.readFileSync(path.join(FONT_DIR, 'IBMPlexMono-400.ttf')), weight: 400 as const, style: 'normal' as const },
];

const VOID = '#05060A';
const FROST = '#EEF2F7';
const MIST = '#8A94A6';
const ICE = '#4DF3FF';
const BALL = '#D4FF3A';
const RULE = '#5B677B';

const MONO = 'IBM Plex Mono';
const DISPLAY = 'Unbounded';

type Status = 'shipped' | 'in-progress' | 'planned';

const STATUS_LABEL: Record<Status, string> = {
  shipped: 'SHIPPED',
  'in-progress': 'IN PROGRESS',
  planned: 'PLANNED',
};

/** The status square from the site: filled, half-filled, or hollow. */
function statusMark(status: Status) {
  const color = status === 'in-progress' ? ICE : status === 'planned' ? MIST : FROST;
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: '22px',
        height: '22px',
        border: `3px solid ${color}`,
        marginRight: '14px',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              width: status === 'shipped' ? '16px' : status === 'in-progress' ? '8px' : '0px',
              height: '16px',
              background: color,
            },
          },
        },
      ],
    },
  };
}

/** Long titles step down rather than overflowing the card. */
function titleSize(title: string) {
  if (title.length > 64) return 54;
  if (title.length > 44) return 64;
  if (title.length > 28) return 76;
  return 88;
}

export interface OgOptions {
  title: string;
  /** Omitted for non-project pages. */
  status?: Status;
  /** Bottom-right facts, e.g. "Started Sept 2026 · hardware · software". */
  facts?: string;
  domain: string;
}

export async function renderOg({ title, status, facts, domain }: OgOptions): Promise<Buffer> {
  const statusColor = status === 'in-progress' ? ICE : status === 'planned' ? MIST : FROST;

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: VOID,
          backgroundImage: 'radial-gradient(circle at 88% 22%, rgba(77,243,255,0.20), transparent 46%), radial-gradient(circle at 78% 70%, rgba(139,92,255,0.16), transparent 50%)',
          padding: '56px 64px',
          border: `2px solid ${RULE}`,
        },
        children: [
          // Top margin: who this is, and where it lives.
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: MONO,
                fontSize: '22px',
                letterSpacing: '4px',
                color: MIST,
              },
              children: [
                { type: 'div', props: { children: 'BRANDON GREENE' } },
                { type: 'div', props: { children: domain.toUpperCase() } },
              ],
            },
          },

          // The title, set the way the page sets it.
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: `${titleSize(title)}px`,
                lineHeight: 1.12,
                color: FROST,
                letterSpacing: '-2px',
                maxWidth: '1000px',
                paddingRight: '40px',
              },
              children: title,
            },
          },

          // Bottom rule and the facts, in fixed order.
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column' },
              children: [
                {
                  type: 'div',
                  props: { style: { display: 'flex', height: '1px', background: RULE, marginBottom: '24px' } },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontFamily: MONO,
                      fontSize: '24px',
                      color: MIST,
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', alignItems: 'center', color: statusColor, letterSpacing: '2px' },
                          children: status
                            ? [statusMark(status), { type: 'div', props: { children: STATUS_LABEL[status] } }]
                            : [],
                        },
                      },
                      { type: 'div', props: { style: { display: 'flex' }, children: facts ?? '' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { width: 1200, height: 630, fonts }
  );

  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
}
