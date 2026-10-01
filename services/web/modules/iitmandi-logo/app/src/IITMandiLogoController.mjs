import Settings from '@overleaf/settings'
import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'
import EditorController from '../../../../app/src/Features/Editor/EditorController.mjs'
import Errors from '../../../../app/src/Features/Errors/Errors.js'

/**
 * Put the Institute logo in the top folder of the project, unless a file of
 * that name is already there. Collaborators see it appear in the file tree.
 * The editor then inserts \includegraphics for it.
 */
async function addLogo(req, res) {
  const { path: logoPath, fileName } = Settings.institutionLogo
  const projectId = req.params.Project_id
  const userId = SessionManager.getLoggedInUserId(req.session)
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
  })
  const rootFolder = project?.rootFolder?.[0]
  if (!rootFolder) {
    return res.sendStatus(404)
  }
  const exists = (rootFolder.fileRefs || []).some(
    file => file.name === fileName
  )
  if (!exists) {
    try {
      await EditorController.promises.addFile(
        projectId,
        rootFolder._id,
        fileName,
        logoPath,
        null,
        'editor',
        userId
      )
    } catch (err) {
      // added by a second click or another collaborator meanwhile
      if (!(err instanceof Errors.DuplicateNameError)) throw err
    }
  }
  res.json({ fileName, added: !exists })
}

export default {
  addLogo: expressify(addLogo),
}
