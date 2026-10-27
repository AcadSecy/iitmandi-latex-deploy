import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  OLDropdownDivider,
  OLDropdownHeader,
  OLDropdownItem,
} from '@/shared/components/ol/ol-dropdown-menu'
import { useDetachCompileContext as useCompileContext } from '@/shared/context/detach-compile-context'
import { useProjectContext } from '@/shared/context/project-context'
import { getJSON } from '@/infrastructure/fetch-json'
import { debugConsole } from '@/utils/debugging'
import { useChapterChoice } from '../chapter-choice'

// "Compile one chapter" in the recompile menu: the whole document, or one of
// the chapters the main file loads with \include
function ChapterCompileMenuItems() {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const { compiling, startCompile } = useCompileContext()
  const [chapter, setChapter] = useChapterChoice()
  const [chapters, setChapters] = useState<string[]>([])

  // The menu mounts when first opened; after that, refresh the list after
  // each compile so new or renamed chapters show up.
  useEffect(() => {
    if (compiling) return
    getJSON(`/project/${projectId}/chapters`)
      .then(data => setChapters(data.chapters))
      .catch(debugConsole.error)
  }, [projectId, compiling])

  // forget a chapter that is gone; the server compiles everything for it
  useEffect(() => {
    if (chapter && chapters.length > 0 && !chapters.includes(chapter)) {
      setChapter('')
    }
  }, [chapter, chapters, setChapter])

  if (chapters.length === 0) {
    return null
  }

  const choose = (value: string) => {
    setChapter(value)
    startCompile({ includeOnly: value })
  }

  return (
    <>
      <OLDropdownDivider />
      <OLDropdownHeader>{t('compile_one_chapter')}</OLDropdownHeader>
      <li role="none">
        <OLDropdownItem
          as="button"
          onClick={() => choose('')}
          disabled={compiling}
          trailingIcon={!chapter ? 'check' : null}
        >
          {t('whole_document')}
        </OLDropdownItem>
      </li>
      {chapters.map(name => (
        <li role="none" key={name}>
          <OLDropdownItem
            as="button"
            onClick={() => choose(name)}
            disabled={compiling}
            trailingIcon={chapter === name ? 'check' : null}
          >
            {name}
          </OLDropdownItem>
        </li>
      ))}
    </>
  )
}

export default ChapterCompileMenuItems
