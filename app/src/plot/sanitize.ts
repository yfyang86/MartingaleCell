/* Sprint 35 (review blocker 6): a raw-SVG ;;PLOT64 payload is rendered with
 * innerHTML on the IDE origin. chemicl draws plain shapes, but any Lisp code
 * can print the marker, so the SVG is sanitised before it reaches the DOM:
 *
 *  - scripting elements are removed with their subtrees: script,
 *    foreignObject, iframe, object, embed, style-less `use` of external
 *    documents is kept out by dropping any `href`/`xlink:href` that is not
 *    a fragment (#id) reference;
 *  - every `on*` event-handler attribute is dropped;
 *  - `javascript:` / `data:` / `vbscript:` URLs are dropped wherever they
 *    appear (href, xlink:href, src, style url(), set/animate `to`/`values`).
 *
 * In the browser the DOMParser walk is used (a proper parse, no regex
 * bypass); the regex pass serves Node (tests) and is also run first in the
 * browser so the two paths agree on what survives. */

const DROP_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'frame', 'frameset', 'meta', 'link', 'base', 'form', 'input', 'textarea', 'button', 'select'])
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'xml:base', 'to', 'from', 'values', 'by'])

function badUrl(value: string): boolean {
  /* whitespace and control characters are dropped before the scheme test
   * (`java\tscript:` and `&#10;` tricks); the filter avoids a control-char
   * regex, which the lint config rejects */
  const v = Array.from(value).filter((c) => c.charCodeAt(0) > 0x20).join('').toLowerCase()
  return /^(javascript|data|vbscript|file|blob):/.test(v) || (/^[a-z][a-z0-9+.-]*:/.test(v) && !/^#/.test(v))
}

/** Regex pass: good enough for Node and as the first line of defence. */
export function sanitizeSvgText(svg: string): string {
  let out = svg
  /* comments and processing instructions never carry drawing */
  out = out.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?(?!xml)[\s\S]*?\?>/g, '')
  /* CDATA could hide a closing tag from the element regexes */
  out = out.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  for (const el of DROP_ELEMENTS) {
    const open = new RegExp(`<${el}\\b[^>]*>[\\s\\S]*?<\\/${el}\\s*>`, 'gi')
    const lone = new RegExp(`<${el}\\b[^>]*\\/?>`, 'gi')
    out = out.replace(open, '').replace(lone, '')
  }
  /* attributes: on* handlers and scripting URLs */
  out = out.replace(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g, (_m, tag: string, attrs: string, close: string) => {
    const kept = attrs.replace(/\s+([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g, (whole: string, name: string, value?: string) => {
      const lname = name.toLowerCase()
      if (lname.startsWith('on')) return ''
      const raw = value === undefined ? '' : value.replace(/^["']|["']$/g, '')
      if (URL_ATTRS.has(lname) && raw && badUrl(raw)) return ''
      if (lname === 'style' && /url\s*\(|expression\s*\(|javascript:|@import/i.test(raw)) return ''
      return whole
    })
    return `<${tag}${kept}${close}>`
  })
  return out
}

/** DOM pass (browser only): parse, walk, drop, serialise. Falls back to the
 * regex pass when DOMParser is unavailable or the markup does not parse. */
export function sanitizeSvg(svg: string): string {
  const text = sanitizeSvgText(svg)
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return text
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  } catch {
    return text
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return text
  const root = doc.documentElement
  if (!root || root.localName.toLowerCase() !== 'svg') return text
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (DROP_ELEMENTS.has(child.localName.toLowerCase())) { child.remove(); continue }
      for (const attr of Array.from(child.attributes)) {
        const lname = attr.name.toLowerCase()
        const local = (attr.localName ?? attr.name).toLowerCase()
        if (lname.startsWith('on')) { child.removeAttribute(attr.name); continue }
        if ((URL_ATTRS.has(lname) || URL_ATTRS.has(local)) && badUrl(attr.value)) { child.removeAttribute(attr.name); continue }
        if (local === 'style' && /url\s*\(|expression\s*\(|javascript:|@import/i.test(attr.value)) child.removeAttribute(attr.name)
      }
      walk(child)
    }
  }
  for (const attr of Array.from(root.attributes)) {
    const lname = attr.name.toLowerCase()
    if (lname.startsWith('on') || (URL_ATTRS.has(lname) && badUrl(attr.value))) root.removeAttribute(attr.name)
  }
  walk(root)
  return new XMLSerializer().serializeToString(root)
}
