import getMeta from '@/utils/meta'
import type { LogEntry } from '@/features/pdf-preview/util/types'

// Longer prompts make URLs that some servers refuse
const MAX_PROMPT_LENGTH = 6000

const WINDOW_NAME = 'ask-ai'

export type AskAiSettings = { url: string; name: string }

/** The configured assistant, or null when Ask AI is switched off. */
export function getAskAiSettings(): AskAiSettings | null {
  const { askAiUrl, askAiName } = getMeta('ol-ExposedSettings')
  return askAiUrl ? { url: askAiUrl, name: askAiName || 'AI' } : null
}

export function selectionPrompt(text: string) {
  return `I'm writing a LaTeX document. Help me with this part of it:\n\n\`\`\`latex\n${text}\n\`\`\``
}

export function errorPrompt(entry: LogEntry) {
  const location = entry.file
    ? ` (in ${entry.file}${entry.line ? `, line ${entry.line}` : ''})`
    : ''
  const details =
    [entry.message, entry.content].filter(Boolean).join('\n') || entry.raw
  return `My LaTeX document fails to compile with this error${location}:\n\n${details}\n\nWhat causes it and how do I fix it?`
}

/**
 * Open the assistant in a window on the right of the screen, with the prompt
 * filled in. Assistants refuse to load inside other sites' pages, so a window
 * beside the editor is the closest to a split screen. `url` ends with the
 * query parameter that takes the prompt, e.g. https://chatgpt.com/?q=
 */
export function openAssistant(url: string, prompt = '') {
  const screen = window.screen as Screen & {
    availLeft?: number
    availTop?: number
  }
  const width = Math.round(screen.availWidth * 0.4)
  const left = (screen.availLeft ?? 0) + screen.availWidth - width
  const features = [
    'popup',
    `width=${width}`,
    `height=${screen.availHeight}`,
    `left=${left}`,
    `top=${screen.availTop ?? 0}`,
  ].join(',')

  const assistantWindow = window.open(
    url + encodeURIComponent(prompt.slice(0, MAX_PROMPT_LENGTH)),
    WINDOW_NAME,
    features
  )
  if (assistantWindow) {
    try {
      // The assistant's page must not be able to navigate this one
      assistantWindow.opener = null
    } catch {
      // Already navigated cross-origin
    }
    assistantWindow.focus()
  }
  return assistantWindow
}
