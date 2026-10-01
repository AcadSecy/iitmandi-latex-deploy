import { createRoot } from 'react-dom/client'
import WaitingRoomRoot from '../components/waiting-room-root'

const element = document.getElementById('editor-waiting-room-root')
if (element) {
  const root = createRoot(element)
  root.render(
    <WaitingRoomRoot
      initialPosition={Number(element.dataset.position)}
      limit={Number(element.dataset.limit)}
    />
  )
}
