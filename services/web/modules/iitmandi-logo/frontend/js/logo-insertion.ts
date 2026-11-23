import {
  documentBodyStart,
  ensurePackage,
  lineChanges,
  TextChange,
} from '../../../page-setup/frontend/js/preamble'

export function logoBlock(fileName: string) {
  return [
    '\\begin{center}',
    `    \\includegraphics[width=3cm]{${fileName}}`,
    '\\end{center}',
  ].join('\n')
}

/**
 * The edits that insert the logo at the cursor, on lines of its own. In a
 * main file graphicx is loaded if needed, a cursor in the preamble moves to
 * the start of the document body, and a cursor after \end{document} moves to
 * just before it (text after it is never typeset).
 */
export function logoInsertion(
  doc: string,
  cursor: number,
  fileName: string
): TextChange[] {
  const changes = lineChanges(
    doc,
    ensurePackage(doc, 'graphicx', ['graphics', 'graphbox'])
  )

  let at = cursor
  const bodyStart = documentBodyStart(doc)
  if (bodyStart !== -1 && cursor <= bodyStart) {
    const newline = doc.indexOf('\n', bodyStart)
    at = newline === -1 ? doc.length : newline + 1
  }
  const end = bodyStart === -1 ? -1 : documentEnd(doc, bodyStart)
  if (end !== -1 && at > end) {
    at = end
  }
  const lineStart = doc.lastIndexOf('\n', at - 1) + 1
  const newline = doc.indexOf('\n', at)
  const lineEnd = newline === -1 ? doc.length : newline
  const textBefore = doc.slice(lineStart, at).trim() !== ''
  const textAfter = doc.slice(at, lineEnd).trim() !== ''
  const insert =
    (textBefore ? '\n' : '') +
    logoBlock(fileName) +
    (textAfter || at === lineStart ? '\n' : '')

  return [...changes, { from: at, to: at, insert }]
}

/** Where the first \end{document} outside comments and literal text starts, or -1 */
function documentEnd(doc: string, from: number) {
  const pattern =
    /%|\\(?:begin\{(verbatim\*?|lstlisting|minted|comment)\}|verb\*?(?=[^a-zA-Z\s])|end\{document\})/g
  pattern.lastIndex = from
  for (let match; (match = pattern.exec(doc)); ) {
    const lineStart = doc.lastIndexOf('\n', match.index - 1) + 1
    const before = doc.slice(lineStart, match.index)
    // A token after an odd run of backslashes is escaped.
    if (/(^|[^\\])\\(\\\\)*$/.test(before)) {
      continue
    }
    if (match[0] === '%') {
      const newline = doc.indexOf('\n', pattern.lastIndex)
      pattern.lastIndex = newline === -1 ? doc.length : newline + 1
    } else if (match[1]) {
      const closing = `\\end{${match[1]}}`
      const end = doc.indexOf(closing, pattern.lastIndex)
      if (end === -1) return -1
      pattern.lastIndex = end + closing.length
    } else if (match[0].startsWith('\\verb')) {
      const delimiter = doc[pattern.lastIndex]
      const end = doc.indexOf(delimiter, pattern.lastIndex + 1)
      const newline = doc.indexOf('\n', pattern.lastIndex)
      pattern.lastIndex =
        end !== -1 && (newline === -1 || end < newline)
          ? end + 1
          : newline === -1
            ? doc.length
            : newline + 1
    } else {
      return match.index
    }
  }
  return -1
}
