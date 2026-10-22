import logoWhiteUrl from '../../../assets/public/LogoWhite.webp';
import logoBrownUrl from '../../../assets/public/LogoBrown.webp';

/**
 * Brand logo for the PUBLIC website: the single place that knows which files are
 * used and their intrinsic size.
 *
 * The files in assets/public are web-sized WebP derivatives (360 px wide,
 * transparent) of assets/LogoWhite.png and assets/LogoBrown.png. The originals
 * (966-1080 px, 127-169 KB) stay untouched because the PMS uses them. To change
 * the logo later: export a new transparent image at ~360 px wide, overwrite the
 * two files below and update `width`/`height` to the new pixel size. Layout
 * boxes derive their aspect ratio from these numbers, so nothing else changes.
 */
export interface LogoAsset {
  src: string;
  width: number;
  height: number;
}

export const logo = {
  /** For dark backgrounds: transparent header over a hero, open menu, footer. */
  white: { src: logoWhiteUrl, width: 360, height: 194 } satisfies LogoAsset,
  /** For light backgrounds: the solid (scrolled) header. */
  brown: { src: logoBrownUrl, width: 360, height: 199 } satisfies LogoAsset,
} as const;
