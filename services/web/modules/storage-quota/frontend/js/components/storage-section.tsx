import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJSON } from '@/infrastructure/fetch-json'
import LoadingSpinner from '@/shared/components/loading-spinner'
import Notification from '@/shared/components/notification'
import OLBadge from '@/shared/components/ol/ol-badge'
import {
  formatSize,
  ProjectSize,
  usedShare,
  useStorageStatus,
} from '../storage-status'
import StorageBar from './storage-bar'

const LARGEST_PROJECTS = 10

// The user's largest projects, so they can see what to delete for space
function LargestProjects() {
  const { t } = useTranslation()
  const [projects, setProjects] = useState<ProjectSize[]>()

  useEffect(() => {
    getJSON<{ projects: ProjectSize[] }>('/user/storage/projects')
      .then(({ projects }) => setProjects(projects))
      .catch(() => setProjects([]))
  }, [])

  if (!projects) return <LoadingSpinner />
  const largest = projects
    .filter(project => project.bytes > 0)
    .slice(0, LARGEST_PROJECTS)
  if (largest.length === 0) return null

  return (
    <>
      <h4 className="h5 mt-3">{t('storage_largest_projects')}</h4>
      <table className="table table-sm">
        <tbody>
          {largest.map(project => (
            <tr key={project.id}>
              <td>
                <a href={`/project/${project.id}`}>{project.name}</a>{' '}
                {project.trashed && (
                  <OLBadge bg="light" text="dark">
                    {t('storage_in_trash')}
                  </OLBadge>
                )}
                {project.archived && !project.trashed && (
                  <OLBadge bg="light" text="dark">
                    {t('archived')}
                  </OLBadge>
                )}
              </td>
              <td className="text-end text-nowrap">
                {formatSize(project.bytes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small text-muted">{t('storage_free_space_how')}</p>
    </>
  )
}

// Account settings section: how much storage the user uses, what they may
// use, and their largest projects. Hidden when there are no limits.
function StorageSection() {
  const { t } = useTranslation()
  const { status, failed } = useStorageStatus(true)

  // The project list links here (#storage) to free up space. The page is
  // drawn after loading, too late for the browser to scroll to it.
  useEffect(() => {
    if (window.location.hash === '#storage') {
      document.getElementById('storage')?.scrollIntoView()
    }
  }, [])

  if (failed || status?.enabled === false) return null

  let body
  if (!status) {
    body = <LoadingSpinner />
  } else if (status.limitBytes == null || status.quotaBytes == null) {
    body = (
      <p>
        {t('storage_used_no_limit', { used: formatSize(status.usedBytes) })}
      </p>
    )
  } else {
    const flexible =
      status.maxBytes != null && status.maxBytes > status.quotaBytes
    body = (
      <>
        <p>
          {t('storage_used_of_quota', {
            used: formatSize(status.usedBytes),
            quota: formatSize(status.limitBytes),
          })}
        </p>
        <StorageBar share={usedShare(status) ?? 0} label={t('storage')} />
        {flexible && !status.serverLowOnSpace && (
          <p className="mt-2 mb-0">
            {t('storage_flexible_explanation', {
              quota: formatSize(status.quotaBytes),
              max: formatSize(status.maxBytes!),
            })}
          </p>
        )}
        {status.serverLowOnSpace && (
          <Notification
            type="warning"
            className="mt-2"
            content={t('storage_server_low_on_space', {
              quota: formatSize(status.quotaBytes),
            })}
          />
        )}
        <p className="small text-muted mt-2">
          {t('storage_quota_explanation')}{' '}
          <a href="/learn#storage">{t('learn_more')}</a>
        </p>
        <LargestProjects />
      </>
    )
  }

  return (
    <>
      <h3 id="storage">{t('storage')}</h3>
      {body}
      <hr />
    </>
  )
}

export default StorageSection
