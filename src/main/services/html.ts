/**
 * Minimal HTML sanitiser for lesson content coming back from SEQTA.
 *
 * Teachers author these in a rich-text editor, so the markup is genuinely
 * useful — tables, headings, colour-coded outcome boxes — and stripping it to
 * plain text (what the previous parser did) loses the whole point. But it is
 * still remote content being injected into the renderer, so anything that can
 * execute or phone out is removed rather than trusted.
 *
 * Deliberately allowlist-free on presentational markup and attribute *values*
 * (inline styles are what make the tables readable), while being strict about
 * the vectors that matter: script execution, event handlers, embedded frames,
 * and javascript:/data: URLs.
 */

/** Elements dropped entirely, including their contents. */
const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'noscript', 'template']
/** Elements dropped but whose children are kept. */
const UNWRAP = ['link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select']

export function sanitizeHtml(input: string): string {
  if (!input) return ''
  let html = String(input)

  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '')
    // Unclosed/self-closed variants of the same tags.
    html = html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '')
  }
  for (const tag of UNWRAP) {
    html = html.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '')
  }

  // Inline event handlers: on*="..." / on*='...' / on*=bare
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')

  // javascript:/vbscript: URLs in any attribute.
  html = html.replace(/(href|src|action|formaction|xlink:href)\s*=\s*"(?:\s*)(?:javascript|vbscript|data):[^"]*"/gi, '$1="#"')
  html = html.replace(/(href|src|action|formaction|xlink:href)\s*=\s*'(?:\s*)(?:javascript|vbscript|data):[^']*'/gi, "$1='#'")

  // srcdoc smuggles a whole document into an allowed element.
  html = html.replace(/\ssrcdoc\s*=\s*"[^"]*"/gi, '')
  html = html.replace(/\ssrcdoc\s*=\s*'[^']*'/gi, '')

  return html.trim()
}

/** Readable plain text from lesson HTML — for search, the agent, and notebook import. */
export function htmlToText(input: string): string {
  if (!input) return ''
  return String(input)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    // Give block-level boundaries real line breaks so the text isn't one blob.
    .replace(/<\/(p|div|tr|h[1-6]|li|table|thead|tbody)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
