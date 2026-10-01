import type { MenuSectionStructure } from '@/features/ide-react/components/toolbar/command-dropdown'

// "IIT Mandi logo" in the Insert menu; the command is registered by the logo
// controller inside the editor
const sections: MenuSectionStructure[] = [
  { id: 'insert-iitmandi-logo-section', children: ['insert-iitmandi-logo'] },
]

export default sections
