import React from 'react'

/** Minimal, dependency-free markdown → HTML for AI answers. Escapes first. */
function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string): string {
  return escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[(\d+)\]/g, '<span class="chip" style="padding:0 .4rem">$1</span>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
}

export function mdToHtml(md: string): string {
  const lines = (md || '').split('\n')
  let html = ''
  let inList = false
  let inCode = false
  let para: string[] = []
  const flushPara = () => {
    if (para.length) {
      html += `<p>${inline(para.join(' '))}</p>`
      para = []
    }
  }
  const closeList = () => {
    if (inList) {
      html += '</ul>'
      inList = false
    }
  }
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushPara()
      closeList()
      if (!inCode) {
        html += '<pre><code>'
        inCode = true
      } else {
        html += '</code></pre>'
        inCode = false
      }
      continue
    }
    if (inCode) {
      html += escape(line) + '\n'
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      flushPara()
      closeList()
      const lvl = h[1].length
      html += `<h${lvl}>${inline(h[2])}</h${lvl}>`
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara()
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`
      continue
    }
    if (line.trim() === '') {
      flushPara()
      closeList()
      continue
    }
    para.push(line.trim())
  }
  flushPara()
  closeList()
  if (inCode) html += '</code></pre>'
  return html
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div
      className={`prose-sm ${className}`}
      dangerouslySetInnerHTML={{ __html: mdToHtml(text) }}
    />
  )
}
