/* A minimal ANSI terminal screen, for cells whose output is escape-code
 * driven (the Matrix-effect style of program: clear, cursor addressing,
 * SGR colors). It interprets the subset such programs use:
 *
 *   ESC [ 2 J        clear the screen (0 J: cursor to end)
 *   ESC [ r ; c H    move the cursor (no args: home)
 *   ESC [ n m        SGR: 0 reset, 1 bold, 30-37/90-97 foreground colors
 *   ESC [ K          erase to end of line
 *   \n \r \b         cursor movement; other C0 controls are ignored
 *
 * Anything else passes through as plain characters. The screen grows on
 * demand and is capped (MAX_ROWS x MAX_COLS) so a runaway writer cannot
 * exhaust memory; the frame is meant to be rendered as a styled grid.
 */

export interface TermChar {
  c: string
  s: string /* tailwind-ish class list for the character */
}

export interface TerminalFrame {
  rows: TermChar[][]
  cursorRow: number
  cursorCol: number
}

const MAX_ROWS = 400
const MAX_COLS = 500

const FG: Record<number, string> = {
  30: 'text-[#5c6370]', 31: 'text-[#e06c75]', 32: 'text-[#19c37d]', 33: 'text-[#d19a66]',
  34: 'text-[#61afef]', 35: 'text-[#c678dd]', 36: 'text-[#56b6c2]', 37: 'text-[#abb2bf]',
  90: 'text-muted', 91: 'text-[#ff7b86]', 92: 'text-[#4ce38a]', 93: 'text-[#f2d17b]',
  94: 'text-[#8cc8ff]', 95: 'text-[#e2a2ff]', 96: 'text-[#8ce0e4]', 97: 'text-secondary',
}

const ESC = String.fromCharCode(27)
const CSI_RE = new RegExp(ESC + String.fromCharCode(92, 91) /* \[ */)

export function hasAnsi(text: string): boolean {
  return CSI_RE.test(text)
}

export class AnsiScreen {
  private rows: TermChar[][] = []
  private row = 0
  private col = 0
  private style = ''
  private bold = false

  feed(text: string): void {
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === '\u001b') {
        if (text[i + 1] === '[') {
          /* CSI: parameters until the final byte */
          let j = i + 2
          while (j < text.length && !/[@-~]/.test(text[j])) j++
          if (j >= text.length) break /* incomplete sequence: drop it */
          this.csi(text.slice(i + 2, j), text[j])
          i = j + 1
          continue
        }
        /* non-CSI escape: skip one more char (ESC c, ESC ( B, …) */
        i += 2
        continue
      }
      if (ch === '\n') { this.row++; this.col = 0; i++; continue }
      if (ch === '\r') { this.col = 0; i++; continue }
      if (ch === '\b') { if (this.col > 0) this.col--; i++; continue }
      if (ch === '\t') { this.col = Math.min(this.col + 8, MAX_COLS - 1); i++; continue }
      if (ch < ' ') { i++; continue }
      this.put(ch)
      i++
    }
  }

  private put(ch: string): void {
    if (this.row >= MAX_ROWS || this.col >= MAX_COLS) return
    while (this.rows.length <= this.row) this.rows.push([])
    const line = this.rows[this.row]
    while (line.length < this.col) line.push({ c: ' ', s: '' })
    line[this.col] = { c: ch, s: this.styleFor() }
    this.col++
  }

  private styleFor(): string {
    return this.style + (this.bold ? ' font-bold' : '')
  }

  private blank(): TermChar {
    return { c: ' ', s: this.styleFor() }
  }

  private csi(params: string, final: string): void {
    const args = params === '' ? [] : params.split(';').map((p) => parseInt(p, 10) || 0)
    const n = (k: number, dflt = 1) => (args[k] !== undefined && args[k] > 0 ? args[k] : dflt)
    switch (final) {
      case 'J': {
        const mode = args[0] ?? 0
        if (mode === 2 || mode === 3) {
          this.rows = []
          this.row = 0
          this.col = 0
        } else {
          while (this.rows.length > this.row + 1) this.rows.pop()
          const line = this.rows[this.row]
          if (line) line.length = this.col
        }
        break
      }
      case 'H':
      case 'f':
        this.row = Math.max(0, n(0, 1) - 1)
        this.col = Math.max(0, n(1, 1) - 1)
        break
      case 'K': {
        const mode = args[0] ?? 0
        const line = this.rows[this.row]
        if (!line) break
        if (mode === 0) line.length = this.col
        else if (mode === 1) { for (let k = 0; k <= this.col && k < line.length; k++) line[k] = this.blank() }
        else { const l = this.rows[this.row]; for (let k = 0; k < l.length; k++) l[k] = this.blank() }
        break
      }
      case 'A': this.row = Math.max(0, this.row - n(0)); break
      case 'B': this.row += n(0); break
      case 'C': this.col += n(0); break
      case 'D': this.col = Math.max(0, this.col - n(0)); break
      case 'm': {
        if (args.length === 0) args.push(0)
        for (const a of args) {
          if (a === 0) { this.style = ''; this.bold = false }
          else if (a === 1) this.bold = true
          else if (a === 22) this.bold = false
          else if (FG[a]) this.style = FG[a]
        }
        break
      }
      default: break /* cursor visibility, modes, …: ignored */
    }
  }

  frame(): TerminalFrame {
    return {
      rows: this.rows.map((line) => line.slice()),
      cursorRow: this.row,
      cursorCol: this.col,
    }
  }

  /** rows of plain text (testing / export) */
  text(): string {
    return this.rows.map((line) => line.map((tc) => tc.c).join('')).join('\n')
  }
}
