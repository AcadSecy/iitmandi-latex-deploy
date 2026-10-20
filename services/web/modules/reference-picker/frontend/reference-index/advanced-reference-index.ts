import { ReferenceIndex } from '@/features/ide-react/references/reference-index'
import Bib2Json from '@/features/ide-react/references/bib2json'
import type {
  Changes,
  Bib2JsonEntry,
  AdvancedReferenceSearchResult,
} from '@/features/ide-react/references/types'

const FIELDS = [
  'author',
  'journal',
  'title',
  'year',
  'date',
  'booktitle',
  'publisher',
]

// Upstream's parser only converts the braced form \"{u}. Rewrite {\"u}, \"u and
// an accented i (\'i, \'{i}) to \"{u} / \'{\i} so they convert as well.
function normalizeAccents(content: string): string {
  return content
    .replace(/\{(\\["'`^~=.])([A-Za-z])\}/g, '$1{$2}')
    .replace(/(\\["'`^~=.])([A-Za-z])(?![A-Za-z])/g, '$1{$2}')
    .replace(/(\\["'`^~=.])\{i\}/g, '$1{\\i}')
}

// Lower-case and drop accents, so "muller" finds "Müller" and the reverse.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default class AdvancedReferenceIndex extends ReferenceIndex {
  fileIndex: Map<string, Set<string>> = new Map()
  entryIndex: Map<string, Bib2JsonEntry> = new Map()
  searchText: Map<string, string> = new Map()

  parseEntries(content: string): Bib2JsonEntry[] {
    // @ts-expect-error Bib2Json works as both a constructor and a function
    const { entries } = Bib2Json(normalizeAccents(content), FIELDS)
    for (const entry of entries) {
      const f = entry.Fields
      // biblatex entries may carry only a date such as 2024-03-15
      const year = parseInt(f.year || f.date)
      f.year = Number.isNaN(year) ? '' : year.toString()
      for (const name of [...FIELDS, 'date']) {
        f[name] = f[name] || ''
      }
    }
    return entries
  }

  updateIndex({ updates, deletes }: Changes): Set<string> {
    for (const path of deletes) {
      const keys = this.fileIndex.get(path)
      if (keys) {
        for (const k of keys) {
          this.entryIndex.delete(k)
          this.searchText.delete(k)
        }
      }
      this.fileIndex.delete(path)
    }

    for (const { path, content } of updates) {
      const previous = this.fileIndex.get(path)
      if (previous) {
        for (const k of previous) {
          this.entryIndex.delete(k)
          this.searchText.delete(k)
        }
      }

      const fileReferences = new Set<string>()
      const entries = this.parseEntries(content)

      for (const entry of entries) {
        fileReferences.add(entry.EntryKey)
        this.entryIndex.set(entry.EntryKey, entry)
        this.searchText.set(
          entry.EntryKey,
          fold(
            [entry.EntryKey, ...FIELDS.map(name => entry.Fields[name])].join(' ')
          )
        )
      }

      this.fileIndex.set(path, fileReferences)
    }

    this.keys = new Set(
      this.fileIndex.values().flatMap(entry => Array.from(entry))
    )

    return this.keys
  }

  async search(query: string): Promise<AdvancedReferenceSearchResult> {
    const q = fold(query || '').trim()

    // Empty query: return all entries
    if (!q) {
      return this.list()
    }

    const tokens = q.split(/\s+/).filter(Boolean)

    const hits: { _source: Bib2JsonEntry }[] = []

    for (const entry of this.entryIndex.values()) {
      const text = this.searchText.get(entry.EntryKey) ?? ''
      if (tokens.every(token => text.includes(token))) {
        hits.push({ _source: entry })
      }
    }

    return { hits }
  }

  private list(limit: number = 0): AdvancedReferenceSearchResult {
    const results: { _source: Bib2JsonEntry }[] = []
    for (const entry of this.entryIndex.values()) {
      if (limit && results.length >= limit) break
      results.push({ _source: entry })
    }
    return { hits: results }
  }
}
