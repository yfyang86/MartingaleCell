/* Toolbar / command-palette friendly project actions. */

import { toast } from 'sonner'
import { useProject } from '@/store/project'
import { loadProjectIntoRuntime } from './load'

export const explorerActions = {
  openFolder: () => void useProject.getState().openFolder(),
  importZip: () => toast('Use the Explorer sidebar — Import ZIP…'),
  openSample: () => void useProject.getState().openSample(),
  exportZip: () => void useProject.getState().exportZip(),
  loadProject: () => void loadProjectIntoRuntime(),
}
