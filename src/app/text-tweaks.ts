import { C, F, type XY } from "@thegraid/common-lib";
import { Container, Text } from "@thegraid/easeljs-module";

export type BASELINE = "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
export type TWEAKS = {
  color?: string, align?: ('left' | 'center' | 'right'),  baseline?: BASELINE,
  style?: string, weight?: string | number, size?: number, family?: string,
  xwide?: number,    // if supplied: shrink fontSize to fit within xwide
  rotation?: number, // if supplied: degrees of rotation
  dx?: number, dy?: number, lineno?: number, nlh?: number, // add lead to after/btwn each line.
};

/**
 * supply Container to hold the tweaked Text
 *
 * override setGlyph() for your glyphRE.
 */
export class TextTweaks {
  /** override to detect and inject glyphs */
  glyphRE?: RegExp;
  /** override to define alternate fonts for /<:f(\d+)>/ */
  fontFamily: string[] = ['Fishmonger CS', 'SF Compact Rounded', 'Helvetica Neue', 'Nunito'];

  cont: Container;

  constructor(cont: Container) {
    this.cont = cont;
  }

  /** setTextTweaks [Centered] with Tweaks: { color, dx, dy, baseline, align, nlh, glyphRE }
   *
   * for each line: setLineMaybeItalic -> setLineWithGlyphs -> setGlyph|setTextFrag -> makeText
   *
   * @param text string | Text
   * @param fontStr is fed to makeText (resolve as fam_wght)
   * @param tweaks: dx, dy: initial x, y-coord, nlh: advance dy per newline; style, wght, size, font override fontStr
   * @returns the final Text child
   */
  setTextTweaks(text: string | Text, fontStr: string, tweaks?: TWEAKS): Text {
    fontStr = (text instanceof Text) ? text.font : fontStr; // use font from given Text
    const lines = (text instanceof Text) ? text.text : text;
    // Note: dx, dy, lineno are wrt this.cont (parent of the Text objects)
    const { dx, dy: dy0, align, nlh } = { dx: 0, dy: 0, align: 'center', ...tweaks }

    // Do each line:
    let cText!: Text, dy = dy0;
    lines.split('\n').forEach(line => {
      const nchild = this.cont.children.length;
      cText = this.setLineWithFontFrags(line, fontStr, { ...tweaks, dx, dy, align: 'left' });
      const llen = (cText.x + cText.getMeasuredWidth() - dx);
      const offs = llen * (align == 'center' ? .5 : (align == 'right') ? 1 : 0);
      this.cont.children.slice(nchild).forEach(dObj => dObj.x -= offs);
      const mlh = cText.getMeasuredHeight();
      const incy = (line ? (nlh ?? mlh) : mlh);
      dy += incy;
    })
    return cText; // last Text added
  }

  /**
   * italic weight family
   * @returns the final Text child
   */
  setLineWithFontFrags(line: string, fontStr: string, tweaks: TWEAKS) {
    const fontRE = /<:(i?\d*f?\d?):(.+?)>|<:([A-Za-z]*)/;    // ASSERT: 3 capture groups (spec)(text)(bold)
    const frags = (fontRE && line.match(fontRE)) ? line.split(fontRE) : [line];
    let dx = tweaks.dx!;   // ASSERT: tweaks.dx set by caller
    const fontTweaks: TWEAKS = {}, nr = 4;
    frags.forEach((frag, n) => {
      const itweaks: TWEAKS = { ...tweaks, dx };
      if (frag == undefined) return;
      // if (n % nr == 1 ) return;
      if (n % nr == 1) {
        fontTweaks.style = frag.startsWith('i') ? 'italic' : undefined;
        fontTweaks.weight = frag.match(/\d\d+/)?.[0];
        const isFam = frag.match(/f(\d)/);
        fontTweaks.family = isFam ? this.fontFamily[Number.parseInt(isFam[1])] : undefined;
        return;
      }
      else if (n % nr == 2)  {
        const { style, weight, family } = fontTweaks;
        if (style !== undefined) { itweaks.style = style }
        if (weight !== undefined) { itweaks.weight = weight }
        if (family !== undefined) { itweaks.family = family }
      }
      else if (n % nr == 3) {
        itweaks.weight = 'bold';
      }
      dx = this.setFragWithGlyphs(frag, fontStr, itweaks); // addChild @ tweaks.[dx, dy]
    })
    // ASSERT: split always gives a final Text after any glyph; maybe just Text('')
    return this.cont.children[this.cont.children.length - 1] as Text; //  the last Text frag to be placed.
  }

  /**
   * Set a SINGLE line (no newlines) filling graphic glyphs.
   * @param frag string to interpolate
   * @param fontStr font to use for Text
   * @param tweaks \{ dx, dy, ... } = initial (x-coord, y-coord)
   * @returns x-coord at end of frag
   */
  setFragWithGlyphs(frag: string, fontStr: string, tweaks: TWEAKS) {
    const glyphRE = this.glyphRE
    let fragT: Text, dx = tweaks.dx!, dy = tweaks.dy!; // ASSERT: dx, dy are set
    if (glyphRE && frag.match(glyphRE)) {
      const frags = frag.split(glyphRE);    // ASSERT: this line has a regex match
      const matches = frag.match(glyphRE)!;
      frags?.forEach(frag => {              // ASSERT: frag has no newline and no glyph
        fragT = this.setTextFrag(frag, fontStr, { ...tweaks, dx });
        dx += fragT.getMeasuredWidth();  // ASSERT: fragT.x = dx
        const fragn = matches?.shift();  // the portion of line that matched glyphRE (eg: '$2')
        if (fragn) {                     // ASSERT: a fragn between or after each fragt
          dx += this.setGlyph(this.cont, fragT, fragn, dx, dy); // there's a glyphRE, so set it:
        }
      })
      return dx;
    }
    fragT = this.setTextFrag(frag, fontStr, tweaks); // @ tweaks[dx, dy]
    return dx + fragT.getMeasuredWidth(); //  tweaks.dx + frag.width
  }

  /**
   * Set a textFrag @ tweaks.
   * @param frag a fragment with no newline, no glyph, no font change.
   * @param fontStr font (style size weight family => dx) for this fragment
   * @param tweaks \{ dx, dy, align, baseline }
   * @returns Text which ends at: (rv.x + rv.getMeasuredWidth(), rv.y)
   */
  setTextFrag(frag: string, fontStr: string, tweaks: TWEAKS) {
    const { dx, dy, align, baseline, rotation } = { dx: 0, dy: 0, rotation: 0, align: 'left', baseline: 'top', ...tweaks }
    const cText = this.makeText(frag, fontStr, tweaks); // make Text object with fontStr (style, weight, size, family)
    cText.textBaseline = baseline; // 'top' | 'middle' | 'bottom'
    cText.textAlign = align;
    cText.rotation = rotation;
    cText.x = dx;
    cText.y = dy;
    return this.cont.addChild(cText);
  }

  /** make Text with fontStr & tweaks; optionally shrink size to fit xwide.
   * @param text string for Text
   * @param fontStr (recalculate size if xwide !== undefined)
   * @param tweaks override fontStr { style, weight, size, family }
   * @param xwide max width of Text, shrink fontSize fit. Leave [undefined] to use fontStr as is.
   */
  makeText(text: string, fontStr: string, tweaks: TWEAKS) {
    const { style, weight, size, family, color, xwide } = { ...this.parseFontStr(fontStr), ...tweaks };
    const fontStr1 = F.fontSpec(size, family, weight, style);
    const size1 = (xwide == undefined) ? size : this.shrinkFontForWidth(xwide, text, fontStr1);
    const fontStr2 = (xwide == undefined) ? fontStr1 : F.fontSpec(size1, family, weight, style);
    return new Text(text, fontStr2, color);
  }

  /** <style>? <weight|attribute* >?<size>px <family> */
  parseFontStr(fontStr: string) {
    // fontStr like: 'italic 410 compressed 36px SF Compact Rounded'
    const weights = /(thin|light|regular|normal|bold|semibold|heavy)/i;
    // for F.fontSpec(), we conjoin <weight|attributes> in match[2]
    // attributes like: 'condensed'
    const regex = /^ *(normal|italic|oblique)? *([\w ]* |\d+ )? *(\d+)px (.*)$/i;
    const match = fontStr.match(regex);
    const style = match?.[1] ?? F.defaultStyle; // normal
    const weight = match?.[2] ?? F.defaultWght; // 410
    const sizen = match?.[3] ?? F.defaultSize;  // 32px
    const size = (typeof sizen == 'number') ? sizen : Number.parseInt(sizen);
    const family = match?.[4] ?? F.defaultFont;  // 'SF Compact Rounded' or 'Times New Roman'
    return { style, weight, size, family }
  }

  /** overrideable: used by xwidth(xwide < 0) */
  get cardw() { return 200 }

  /** overrideable: normalize xwide when negative (for shrinkFontForWidth)*/
  xwidth(xwide = 0) {
    return (xwide <= 0) ? (xwide + this.cardw) : xwide;
  }
  /** reduce font size so longest line of text fits in xwide */
  shrinkFontForWidth(xwide: number, text: string, fontspec: string) {
    const size = F.fontSize(fontspec);
    const xwidth = this.xwidth(xwide);
    const lines = text.split('\n');
    let width = 0;
    lines.forEach(line => {
      const wide = new Text(line, fontspec).getMeasuredWidth();
      width = Math.max(width, wide);
    })
    return (width <= xwidth) ? size : Math.floor(size * xwidth / width);
  }

  /**
   * reference implementation of a glyph function (set trigger text in italic bold).
   * @param cont Container to hold glyph dispObj
   * @param fragt previous Text (to get size, height, alignment, etc)
   * @param trigger the matched text to be replaced with a glyph
   * @param dx x location for glyph (textAlign: left)
   * @param dy y location for glyph (textBaseline: 'top' |middle|bottom)
   * @return width consumed by glyph (pre- and post- space)
   */
  setGlyph(cont: Container, fragt: Text, trigger: string, dx = 0, dy = 0) {
    // simply insert trigger text: (in italic bold)
    const gText = this.setTextFrag(trigger, fragt.font, { dx, dy, style: 'italic', weight: 'bold' });
    cont.addChild(gText); // move to proper container
    return gText.getMeasuredWidth();
  }
}
