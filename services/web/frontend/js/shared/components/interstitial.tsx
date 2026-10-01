import classNames from 'classnames'
import getMeta from '@/utils/meta'
import overleafLogo from '@/shared/svgs/overleaf-green.svg'

type InterstitialProps = {
  className?: string
  contentClassName?: string
  children: React.ReactNode
  showLogo: boolean
  title?: string
}

export function Interstitial({
  className,
  contentClassName,
  children,
  showLogo,
  title,
}: InterstitialProps) {
  const { appName } = getMeta('ol-ExposedSettings')
  return (
    <div className={classNames('interstitial', className)}>
      {showLogo && <img className="logo" src={overleafLogo} alt={appName} />}
      {title && <h1 className="h3 interstitial-header">{title}</h1>}
      <div className={classNames(contentClassName)}>{children}</div>
    </div>
  )
}
