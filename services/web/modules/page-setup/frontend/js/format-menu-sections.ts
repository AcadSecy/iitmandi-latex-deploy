import type { MenuSectionStructure } from '@/features/ide-react/components/toolbar/command-dropdown'

// "Page setup…" at the end of the Format menu; the command is registered by
// the page setup controller inside the editor
const sections: MenuSectionStructure[] = [
  { id: 'format-page-setup', children: ['page-setup'] },
]

export default sections
