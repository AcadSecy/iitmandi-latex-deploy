import { useTranslation } from 'react-i18next'
import MaterialIcon from '@/shared/components/material-icon'
import OLButton from '@/shared/components/ol/ol-button'
import { useDetachCompileContext as useCompileContext } from '@/shared/context/detach-compile-context'
import { useChapterChoice } from '../chapter-choice'

// Shown over a PDF of one chapter, so nobody mistakes it for the whole
// document. Numbers and references to other chapters come from the last
// whole-document compile, and print ?? if there was none.
function ChapterCompileBanner() {
  const { t } = useTranslation()
  const { compiling, lastCompileOptions, pdfFile, startCompile } =
    useCompileContext()
  const [, setChapter] = useChapterChoice()
  // the chapter the server compiled, not the one chosen since
  const chapter: string | undefined = lastCompileOptions.includeOnly

  // A stopped chapter compile shows the partial-PDF banner instead,
  // which sits in the same place
  if (!chapter || !pdfFile || pdfFile.partial) {
    return null
  }

  const compileWholeDocument = () => {
    setChapter('')
    startCompile({ includeOnly: '' })
  }

  return (
    <div className="pdf-partial-banner-container">
      <div className="pdf-partial-banner" role="status">
        <MaterialIcon type="menu_book" />
        {t('chapter_compile_only', { chapter })}
        <OLButton
          variant="link"
          size="sm"
          onClick={compileWholeDocument}
          disabled={compiling}
        >
          {t('compile_whole_document')}
        </OLButton>
      </div>
    </div>
  )
}

export default ChapterCompileBanner
