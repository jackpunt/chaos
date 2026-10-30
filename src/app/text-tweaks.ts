import { F } from "@thegraid/common-lib";
import { NamedContainer } from "@thegraid/easeljs-lib";
import type { DisplayObject } from "@thegraid/easeljs-module";
import { Container, Text } from "@thegraid/easeljs-module";

export type BASELINE = "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
export type TEXTALIGN = "left" | "center" | "right";

declare module '@thegraid/easeljs-module' {
  interface Text {
    getMetrics(): { width: number, height: number, lines: string[] };
  }
}
/**
 * As used by setTextTweaks:
 *
 * - dx?: initial/current x coord [0]
 * - dy?: initial/current y coord [0]
 * - xwide?: if supplied: shrink fontSize to fit within xwide [undefined]
 * - rotation?: if supplied: degrees of rotation [undefined]
 * - lineno?: number, (obsolete? use dy += lineno * nlh)
 * - nlh?: number,       // overrides getMeasuredLineHeight() to change leading between each line
 * - lineWidth?: number, // set to enable lineWrap
 * - x0?: number,        // recurring dx for lineWrap [dx]
 */
export type TWEAKS = {
  color?: string, align?: ('left' | 'center' | 'right'),  baseline?: BASELINE,
  style?: string, weight?: string | number, size?: number, family?: string,
  xwide?: number,    // if supplied: shrink fontSize to fit within xwide
  rotation?: number, // if supplied: degrees of rotation
  dx?: number, dy?: number, lineno?: number, nlh?: number, // add lead to after/btwn each line.
  lineWidth?: number, x0?: number,    // wrap lines @ lineWidth, start next line at (x0, dy+(nlh??mlh))
  cNdx?: number      // context while placing text frags (internal only)
};

/** internal TWEAKS with numbers set */
export type TWEAKSI = TWEAKS & { dx: number, dy: number, x0: number, baseline: BASELINE, cNdx: number, maxLH: number }

// don't break & wrap for &nbsp;
class Text2 extends Text {
  // copy DisplayObject and Text properties
  override clone(): Text2 {
    return (this as any)._cloneProps(new Text2(this.text, this.font, this.color))
  }

  /**
	 * Draws multiline text.
	 * @method _drawText
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {Object} o
	 * @param {Array} lines
	 * @return {Object}
	 * @protected
	 **/
  _drawText(ctx: CanvasRenderingContext2D, o: any, lines: string[]) {
    const TextA = Text as any;
    const thisA = (this as any);
		var paint = !!ctx;
		if (!paint) {
			ctx = TextA._workingContext;
			ctx.save();
			thisA._prepContext(ctx);
		}
		var lineHeight = this.lineHeight||this.getMeasuredLineHeight();

		var maxW = 0, count = 0;
		var hardLines = String(this.text).split(/(?:\r\n|\r|\n)/);
		for (var i=0, l=hardLines.length; i<l; i++) {
			var str = hardLines[i];
			var w = null;

			if (this.lineWidth != null && (w = ctx.measureText(str).width) > this.lineWidth) {
				// text wrapping: (without nbsp = \u0160)
				var words = str.split(/([\t\n\v\f\r \u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff])/); // /([\s--\xa0])/v
				// var words = str.split(/([\s--\xA0])/)v; // ECMAScript-2024
				str = words[0];
				w = ctx.measureText(str).width;

				for (var j=1, jl=words.length; j<jl; j+=2) {
					// Line needs to wrap:
					var wordW = ctx.measureText(words[j] + words[j+1]).width;
					if (w + wordW > this.lineWidth) {
						if (paint) { thisA._drawTextLine(ctx, str, count*lineHeight); }
						if (lines) { lines.push(str); }
						if (w > maxW) { maxW = w; }
						str = words[j+1];
						w = ctx.measureText(str).width;
						count++;
					} else {
						str += words[j] + words[j+1];
						w += wordW;
					}
				}
			}

			if (paint) { thisA._drawTextLine(ctx, str, count*lineHeight); }
			if (lines) { lines.push(str); }
			if (o && w == null) { w = ctx.measureText(str).width; }
			if (w! > maxW) { maxW = w!; }
			count++;
		}

		if (o) {
			o.width = maxW;
			o.height = count*lineHeight;
		}
		if (!paint) { ctx.restore(); }
		return o;
	};
}

/**
 * Create Text objects with various attributes; replace special characters with glyph.
 *
 * Supply a Container to hold the tweaked Text.
 *
 * override glyphRE & setGlyph() for your glyphRE.
 */
export class TextTweaks {
  /** override to detect and inject glyphs */
  glyphRE?: RegExp;
  /** override to define alternate fonts for /<:f(\d+)>/ */
  fontFamily: string[] = ['Fishmonger CS', 'SF Compact Rounded', 'Helvetica Neue', 'Nunito'];

  cont: Container;
  /**
   * Supply an initial Container for Text frags
   *
   * @param cont Container to hold the tweaked Text OR name of a new NamedContainer ['tweaks']
   */
  constructor(cont: Container | string = 'tweaks') {
    this.cont = (typeof cont == 'string') ? new NamedContainer(cont) : cont;
  }

  /** setTextTweaks [Centered] with Tweaks: { color, dx, dy, baseline, align, nlh, glyphRE }
   *
   * for each line: setLineWithFontFrags -> setLineWithGlyphs -> setGlyph|setTextFrag -> makeText
   *
   * all the Text objects are added as children to this.cont
   *
   * @param text string | Text; raw text including glyphs and directives
   * @param fontStr is fed to makeText (resolve as fam_wght)
   * @param tweaks: dx, dy: initial x, y-coord, nlh: advance dy per newline; style, wght, size, font override fontStr
   * - align: ['center']
   * - dx: [0] start text at dx; updates for each frag/glyph
   * - dy: [0] start text at dy; updates for each line (nlh ?? mlh(fontStr))
   * - x0: [dx] newline starts at (x0, dy + lh)
   * - lineWidth: [undefined] trigger wrap if (dx - x0 > linewidth)
   * - xwide: [undefined] shrink font instead of wrapping (see also: Text.maxWidth)
   * @returns the final Text child (with font, y, color)
   */
  setTextTweaks(text: string | Text, fontStr: string, tweaks?: TWEAKS): Text {
    fontStr = (text instanceof Text) ? text.font : fontStr; // use font from given Text
    const lines = (text instanceof Text) ? text.text : text;
    // Note: dx, dy, lineno are wrt this.cont (parent of the Text objects)
    const { dx, dy: dy0, } = { dx: 0, dy: 0, ...tweaks }

    // Do each line:
    let cText!: Text, dy = dy0, x0 = tweaks?.x0 ?? dx;
    lines.split('\n').forEach(line => {
      const cNdx = this.cont.children.length;  // index to find new frags
      const lineTweaks: TWEAKSI = { x0, baseline: 'middle', ...tweaks, dx, dy, cNdx, maxLH: 0 }; // TODO: use 'top' or 'hanging'
      cText = this.setLineWithFontFrags(line, fontStr, lineTweaks);
      this.alignLineFrags(lineTweaks);
      const mlh = lineTweaks.maxLH;    // cText may be multi-line! (wrapped); maxLH of all frags of 'line'
      dy += mlh;     // down to next line; TODO: for different maxLH: half at EOL, half at BOL
      if (tweaks) {
        tweaks.dx = lineTweaks.dx;
        tweaks.dy = lineTweaks.dy;
      }
    })
    return cText; // last Text added (useful for lines with no glyphs)
  }

  // initially compose everything with textAlign = 'left', x=x0..,
  // Here we adjust for 'center' or 'right'; 'right' aligns with the original x0 ([dx])
  //
  // For each complete/composite line, set alignment of glyphs & text frags:
  // (pure text lines can just set textAlign = tweaks.align)
  /** adjust x offsets to align left/center/right of text to cont.x = 0 */
  alignLineFrags(lineTweaks: TWEAKSI) {
    const { dx, align, cNdx } = lineTweaks;
    const offs = dx * (align == 'center' ? .5 : (align == 'right') ? 1 : 0);
    this.cont.children.slice(cNdx).forEach(dObj => dObj.x -= offs);
    lineTweaks.cNdx = this.cont.children.length;  // record that all those children are aligned
  }

  alignWrapLines(lineTweaks: TWEAKSI) {
    const { x0, align, cNdx, lineWidth } = {align: 'center', ... lineTweaks};
    // Assert: cNdx = numChildren - 1  (exactly 1 Text element at/after cNdx)
    const offs = x0 + lineWidth! * (align == 'center' ? .5 : (align == 'right') ? 1 : 0);
    this.cont.children.slice(cNdx).forEach(txt => {
      ;(txt as Text).textAlign = align; // txt.x = x0;
      txt.x = offs;
     })
    lineTweaks.cNdx = this.cont.children.length;  // record that all those children are aligned
  }

  /**
   * split line into fragments with same font: parseFontStr -> { style weight size family }
   *
   * Inline font change can be specified in text with \<:SPEC:text> (from cubitos)
   *
   * - SPEC: \<:iWGHTfn: text >
   * - italic: \<:i: text >    (style = italic)
   * - weight: \<:WGHT: text > (weight = WGHT)
   * - family: \<:fn: text > (family = this.fontFamily[n])
   * - token:  \<:TOKEN text > (weight = bold) [shortcut from cubitos]
   *
   * TODO: inline change of tweaks.size?
   *
   * Each frag is tweaked and added to this.cont
   *
   * @returns the final Text child
   */
  setLineWithFontFrags(line: string, fontStr: string, tweaks: TWEAKSI) {
    // (n % nr) == 1: italic, 2:
    const fontRE = /<:(i?\d*f?\d?):(.+?)>|<:([A-Za-z]*)/;    // ASSERT: 3 capture groups (spec)(text)(bold)
    const frags = (fontRE && line.match(fontRE)) ? line.split(fontRE) : [line];
    let dx = tweaks.dx;    // ASSERT: tweaks.dx set by caller
    const fontTweaks: TWEAKS = {}, nr = 4;
    frags.forEach((frag, n) => {
      const itweaks: TWEAKSI = { ...tweaks, dx };
      if (frag == undefined) return; // the separator? eol?
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
      const fontStr2 = this.tweakFont(fontStr, itweaks);    // fontStr for these frags
      dx = this.setFragWithGlyphs(frag, fontStr2, itweaks); // addChild @ tweaks.[dx, dy], dx += gMW
      tweaks.dy = itweaks.dy;
      tweaks.dx = dx;
    })
    // ASSERT: split always gives a final Text after any glyph; maybe just Text('')
    return this.cont.children[this.cont.children.length - 1] as Text; //  the last Text frag to be placed.
  }

  /**
   * Set a SINGLE line (no newlines) filling graphic glyphs. (now: allow lineWrap!)
   * @param frag string to interpolate
   * @param fontStr font to use for Text
   * @param tweaks \{ dx, dy, ... } = initial (x-coord, y-coord)
   * @returns x-coord at end of frag
   */
  setFragWithGlyphs(frag: string, fontStr: string, tweaks: TWEAKSI) {
    const glyphRE = this.glyphRE
    let fragT: Text, glyphs: RegExpMatchArray;
    if (glyphRE && (glyphs = frag.match(glyphRE)!)) {
      const frags = frag.split(glyphRE);    // ASSERT: this line has a regex match
      frags?.forEach(frag => {              // ASSERT: frag has no newline and no glyph
        fragT = this.setTextFrag(frag, fontStr, tweaks);  // may do multi-line: update dx, dy
        tweaks.maxLH = Math.max(tweaks.maxLH, fragT.getMeasuredHeight());   // record maxLH
        const fragWrap = (tweaks.dx == tweaks.x0);  // setFrag wrapped, putting '' on new line (trimmed a space)
        const fragn = glyphs?.shift();  // the portion of line that matched glyphRE (eg: '$2')
        if (fragn) {                     // ASSERT: a fragn between each fragt
          const glyph = this.setGlyph(this.cont, fragT, fragn, tweaks); // there's a glyphRE, so set it:
          const glyphWrap = tweaks.dx - tweaks.x0 > tweaks.lineWidth!;
          // check: fragT triggered wrap || glyph triggered wrap
          if (fragWrap || glyphWrap) {
            this.tryKeep(fragWrap, fragT, glyph, fontStr, tweaks)
          }
        }
      })
      return tweaks.dx;
    }
    fragT = this.setTextFrag(frag, fontStr, tweaks); // @ tweaks[dx, dy]
    return tweaks.dx;      // at end of fragT
  }

  // glyph was set when tweaks.dx = fragWrap ? x0 : frat.x+gMW (and > lineWidth)
  tryKeep(fragWrap: boolean, fragT: Text, glyph: DisplayObject, fontStr: string, tweaks: TWEAKSI) {
    const cont = this.cont; // fragT = cont.children[-2], glyph = cont.children[-1]
    const tx = tweaks.dx - (fragWrap ? tweaks.x0 : fragT.x + fragT.getMeasuredWidth());
    const dx = glyph.x - (tweaks.dx - tx);
    const dy = glyph.y - (tweaks.dy);
    // wrap to next line; remove glyph from line:
    cont.removeChild(glyph);
    tweaks.dx -= tx;         // either x0 or (fragT.x + fragT.gMW())
    // maybe keep digit at end of fragT with glyph:
    const keepDigit = fragT.text.match(/(.*)(\s+\d)$/); // [whole, (frag) ( digit)]
    if (keepDigit) {
      fragT.text = keepDigit[1];    // make fragT shorter; dx will still be near EOL
      tweaks.dx = fragT.x + fragT.getMeasuredWidth(); // exact length so align: 'center' & 'right' will work
      tweaks.dy = fragT.y;
    }
    this.alignLineFrags(tweaks);   // finish previous line
    // newline:
    tweaks.dy = fragT.y + (tweaks.nlh ?? tweaks.maxLH);
    tweaks.dx = tweaks.x0;
    if (keepDigit) {
      const digiT = fragT.clone();
      digiT.text = `${keepDigit[2].trimStart()} `; // move space after fragT digit
      digiT.x = tweaks.dx;
      digiT.y = tweaks.dy;
      cont.addChild(digiT);
      tweaks.dx += digiT.getMeasuredWidth();
    }
    glyph.x = tweaks.dx + dx;
    glyph.y = tweaks.dy + dy;
    this.cont.addChild(glyph);
    tweaks.dx += tx;
  }

  /**
   * Set a textFrag @ tweaks.
   * @param frag a fragment with no newline, no glyph, no font change.
   * @param fontStr font (style size weight family => dx) for this fragment
   * @param tweaks \{ dx, dy, baseline }
   * @returns Text which ends at: (tweaks.dx, tweaks.dy) as updated
   */
  setTextFrag(frag: string, fontStr: string, tweaks: TWEAKSI) {
    const cText = this.makeText(frag, fontStr, tweaks); // make Text object with fontStr (style, weight, size, family)
    if (!cText) {
      return this.cont.children[this.cont.numChildren-1] as Text;   // makeText/wrapText did it all...
    }

    const { dx, rotation } = { ...tweaks }
    // for simple string only! for compound text: put it on a cont and rotate that.
    if (rotation !== undefined) cText.rotation = rotation;
    tweaks.dx = dx + cText.getMeasuredWidth();
    return this.cont.addChild(cText);
  }

  /**
   * tweaks the style, weight, size, family; (maybe shrink size with xwide)
   *
   * - TODO: use maxWidth instead of xwide
   * @returns fontSpec
   */
  tweakFont(fontStr: string, tweaks: TWEAKSI) {
    const fontParse = this.parseFontStr(fontStr);
    const { style, weight, size, family, xwide } = { ...fontParse, ...tweaks };
    const fontSpec = F.fontSpec(size, family, weight, style);
    return fontSpec;
    // TODO: use Text.maxWidth to narrow glyphs
    // const size1 = (xwide == undefined) ? size : this.shrinkFontForWidth(xwide, text, fontStr1);
    // const fontStr2 = (xwide == undefined) ? fontStr1 : F.fontSpec(size1, family, weight, style);
    // return fontStr2;
  }

  /** make Text with fontStr & tweaks; optionally shrink size to fit xwide.
   * @param text string for Text
   * @param fontStr (recalculate size if xwide !== undefined)
   * @param tweaks override fontStr { style, weight, size, family }
   * - dx x position of new Text [required]
   * - dy y position of new Text [required]
   * - xwide max x-width of Text, shrink fontSize fit. Leave [undefined] to use fontStr as is.
   * - lineWidth max x-width of Text, wrap text back to x0 ?? 0
   * - x0 start new line at x0 if lineWidth is defined and exceeded
   * @returns the new Text object
   */
  makeText(text: string, fontStr: string, tweaks: TWEAKSI) {
    const { color, dx, x0, lineWidth, dy, rotation } = tweaks;
    const text0 = new Text2(text, fontStr, color); // Text2 with nbsp wrapping
      text0.x = dx; text0.y = dy;
      text0.textBaseline = tweaks.baseline;
      if (rotation) text0.rotation = rotation;
      if (tweaks.nlh) {
        (text0.lineHeight = tweaks.nlh);
      } else {
        tweaks.maxLH = Math.max(tweaks.maxLH, text0.getMeasuredHeight());
      }

    const textW = text0.getMeasuredWidth();
    if (lineWidth !== undefined && (dx - x0 + textW) > lineWidth) {
      this.wrapText(text0, fontStr, tweaks)
      return undefined;
    }
    return text0;
  }
  static trouble = [
      // 'B2_2_2', 'B4_3_1', 'B7_3_0',
      'C1_-1_3', 'C3_3_3', 'C5_-1_6', 'C6_6_-2',
      // 'D4_0_4', 'H5_0_3', '<--', 'H6_0_3', 'H8_1_3',
      // 'I10_1_3', 'I2_5_0', 'I14_2_2', 'I2_5_0', 'I3_3_2', 'I5_2_2', 'I7_4_0',
      // 'R4_8_2'
    ]

  wrapText(textf: Text, fontStr: string, tweaks: TWEAKSI) {
    const str = textf.text;
    const { lineWidth, x0, nlh } = tweaks;
    const mlh = nlh ? (textf.lineHeight = nlh) : (tweaks.maxLH = Math.max(tweaks.maxLH, textf.getMeasuredLineHeight()));
    textf.lineWidth = lineWidth! - (tweaks.dx - x0);  // length remaining on line for textf

    const line0 = textf.getMetrics().lines[0];     // the 'short' line
    const text0 = textf.clone(); text0.text = line0; // new Text2(line0) with all the same attributes
      text0.x = tweaks.dx; text0.y = tweaks.dy;
      tweaks.dx = text0.x + text0.getMeasuredWidth(); // Assert: < lineWidth
      tweaks.dy = text0.y + mlh;
      this.cont.addChild(text0);
    this.alignLineFrags(tweaks);

    const line1 = str.slice(line0.length).trimStart()
    const text1 = textf.clone(); text1.text = line1;  // new Text2(line1) with all the attrs
      text1.x = x0; text1.y = tweaks.dy;
      text1.lineWidth = lineWidth!;  // wrap the remaining text; find the end point (uni-font!)
    this.alignWrapLines(tweaks);  // set textAlign and update cNdx
    line1 && this.cont.addChild(text1);  // do not insert empty Text; also .lines is empty, gMW==0

    const lines = text1.getMetrics().lines;
    const linen = lines.pop();
    const lineN = new Text(linen ?? '', fontStr);
    tweaks.dy = tweaks.dy + mlh * lines.length; // using same LH as text0... (even tho lines are all fontStr)
    tweaks.dx = x0 + lineN.getMeasuredWidth();
    return;
  }

  /** <style>? <weight|attribute* >?<size>px <family> */
  parseFontStr(fontStr: string) {
    // fontStr like: 'italic 410 compressed 36px SF Compact Rounded'
    const weights = /(thin|light|regular|normal|bold|semibold|heavy)/i;
    // for F.fontSpec(), we conjoin <weight|attributes> in match[2]
    // attributes like: 'condensed'; weight: INTEGER; size: FLOAT
    const regex = /^ *(normal|italic|oblique)? *([\w]* |\d+ )? *([\d.]+)px (.*)$/i;
    const match = fontStr.match(regex);
    const style = match?.[1] ?? F.defaultStyle; // normal
    const weight = match?.[2] ?? F.defaultWght; // 410
    const sizen = match?.[3] ?? F.defaultSize;  // 32px
    const size = (typeof sizen == 'number') ? sizen : Math.round(Number.parseFloat(sizen)*10)/10;
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
   *
   * addChild(glyph); set glyph (dx, dy); advance tweaks.dy by glyph width.
   * @param cont Container to hold glyph dispObj [generally this.cont]
   * @param fragt previous Text (to get size, height, alignment, etc)
   * @param trigger the matched text to be replaced with a glyph
   * @param dx x location for glyph (textAlign: left)
   * @param dy y location for glyph (textBaseline: 'top' |middle|bottom)
   * @return the glyph (Bitmap)
   */
  setGlyph(cont: Container, fragt: Text, trigger: string, tweaks: TWEAKSI): DisplayObject {
    // simply insert trigger text: (in italic bold)
    const gText = this.setTextFrag(trigger, fragt.font, { ...tweaks, style: 'italic', weight: 'bold' });
    cont.addChild(gText); // move to proper container
    gText.x = tweaks.dx;
    gText.y = tweaks.dy;
    tweaks.dx += gText.getMeasuredWidth();
    return gText;
  }
}
