import fs from 'node:fs/promises'
import path from 'node:path'
import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import EditorPlaces from '../../../editor-waiting-room/app/src/EditorPlaces.mjs'
import CompileManager from '../../../../app/src/Features/Compile/CompileManager.mjs'
import CompileTelemetry from '../../../../app/src/Features/Compile/CompileTelemetry.mjs'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import AuthorizationManager from '../../../../app/src/Features/Authorization/AuthorizationManager.mjs'
import {
  createCapacityCollector,
  createCapacityHandlers,
  createCapacitySources,
} from './CapacityDashboard.mjs'

const collector = createCapacityCollector({
  ...createCapacitySources({
    editorPlaces: EditorPlaces,
    compileManager: CompileManager,
    storageSettings: Settings.storageQuota,
    statfs: fs.statfs,
  }),
  trends: minutes => CompileTelemetry.snapshot(minutes),
})

const handlers = createCapacityHandlers({
  getUserId: req => SessionManager.getLoggedInUserId(req.session),
  isAdmin: userId => AuthorizationManager.promises.isUserSiteAdmin(userId),
  getSnapshot: minutes => collector.snapshot(minutes),
  viewPath: path.resolve(import.meta.dirname, '../views/capacity'),
})

export default {
  page: expressify(handlers.page),
  json: expressify(handlers.json),
}
