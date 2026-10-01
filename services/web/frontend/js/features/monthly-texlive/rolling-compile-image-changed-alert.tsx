import useTutorial from '@/shared/hooks/promotions/use-tutorial'
import { useProjectContext } from '@/shared/context/project-context'
import Notification from '@/shared/components/notification'
import { useTranslation, Trans } from 'react-i18next'
import { useCallback } from 'react'
import { onRollingBuild } from '@/shared/utils/rolling-build'

export const TUTORIAL_KEY = 'rolling-compile-image-changed'

const RollingCompileImageChangedAlert = () => {
  const { completeTutorial, checkCompletion: hasCompleted } =
    useTutorial(TUTORIAL_KEY)
  const { project } = useProjectContext()

  const { t } = useTranslation()

  const onClose = useCallback(() => {
    completeTutorial({ event: 'promo-click', action: 'complete' })
  }, [completeTutorial])

  if (hasCompleted() || !onRollingBuild(project?.imageName)) {
    return null
  }

  const content = (
    <Trans
      i18nKey="new_compiles_in_this_project_will_automatically_use_the_newest_version"
      components={[
        // eslint-disable-next-line jsx-a11y/anchor-has-content
        <a
          href="/learn"
          target="_blank"
          key="getting-started-link"
          rel="noopener noreferrer"
        />,
      ]}
    />
  )

  return (
    <div className="notification-list">
      <Notification
        className="mt-5"
        isDismissible
        onDismiss={onClose}
        content={content}
        type="info"
        title={t('a_new_version_of_the_rolling_texlive_build_released')}
      />
    </div>
  )
}

export default RollingCompileImageChangedAlert
