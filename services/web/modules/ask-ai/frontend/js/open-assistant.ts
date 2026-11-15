import getMeta from '@/utils/meta'
import type { LogEntry } from '@/features/pdf-preview/util/types'
import { wellFormed } from '../../shared/assistance-policy.mjs'

const WINDOW_NAME = 'ask-ai'

export type AskAiSettings = { url: string; name: string; managed?: boolean }

export function assistantDestination(url: string) {
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    )
      return null
    return parsed.href
  } catch {
    return null
  }
}

/** The configured assistant, or null when Ask AI is switched off. */
export function getAskAiSettings(): AskAiSettings | null {
  const { askAiUrl, askAiName, askAiManaged } = getMeta('ol-ExposedSettings')
  if (askAiManaged) return { url: '', name: askAiName || 'AI', managed: true }
  return askAiUrl && assistantDestination(askAiUrl)
    ? { url: askAiUrl, name: askAiName || 'AI' }
    : null
}

export function selectionPrompt(text: string) {
  return `I'm writing a LaTeX document. Help me with this part of it:\n\n\`\`\`latex\n${text}\n\`\`\``
}

export function errorPrompt(entry: LogEntry) {
  const details =
    [entry.message, entry.content].filter(Boolean).join('\n') || entry.raw
  return `My LaTeX document fails to compile with this error:\n\n${details}\n\nWhat causes it and how do I fix it?`
}

/**
 * Open the assistant in a window on the right of the screen, with the prompt
 * filled in. Assistants refuse to load inside other sites' pages, so a window
 * beside the editor is the closest to a split screen. `url` ends with the
 * query parameter that takes the prompt, e.g. https://chatgpt.com/?q=
 */
export function openAssistant(url: string, prompt = '') {
  if (!assistantDestination(url)) throw new Error('invalid_destination')
  const destination = url + encodeURIComponent(wellFormed(prompt))
  if (new TextEncoder().encode(destination).length > 8192)
    throw new Error('context_too_large')
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
    'noopener',
    'noreferrer',
  ].join(',')

  const assistantWindow = window.open(destination, WINDOW_NAME, features)
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
