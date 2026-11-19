import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const endpoint = new URL(process.env.LATEX_PREVIEW_URL || 'http://127.0.0.1:18082')
assert.equal(endpoint.hostname, '127.0.0.1')
const url = endpoint.origin
const container = process.env.LATEX_PREVIEW_CONTAINER
assert.match(container || '', /^latex[0-9]+-candidate$/)
const remote = process.env.LATEX_PREVIEW_SSH
if (remote) assert.match(remote, /^[a-zA-Z0-9][a-zA-Z0-9_@.-]*$/)
const guestEmail = process.env.LATEX_PREVIEW_COLLABORATOR_EMAIL
assert.match(guestEmail || '', /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/)
const accounts = (await readFile(process.env.LATEX_PREVIEW_ACCOUNTS, 'utf8')).trim().split('\n').map(line => line.split(' '))
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true })

function runInPreview(input) {
  const command = ['docker', 'exec', '-i', '-e', 'NODE_NO_WARNINGS=1', '-w', '/overleaf/services/web', container, 'node', '--input-type=module']
  const invocation = remote ? ['ssh', '-o', 'BatchMode=yes', remote, ...command] : command
  return execFileSync(invocation[0], invocation.slice(1), { input, encoding: 'utf8' })
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const sockets = []
let disconnected = false

async function logIn([email, password], owner = false) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 780 },
    recordVideo: owner && process.env.LATEX_PREVIEW_VIDEO_DIR
      ? { dir: process.env.LATEX_PREVIEW_VIDEO_DIR, size: { width: 960, height: 624 } }
      : undefined,
  })
  if (owner) {
    await context.routeWebSocket(/\/socket\.io\//, ws => {
      if (disconnected) return ws.close()
      ws.connectToServer()
      sockets.push(ws)
    })
  }
  const page = await context.newPage()
  const csrf = () => page.locator('meta[name="ol-csrfToken"]').getAttribute('content')
  await page.goto(`${url}/login`)
  const token = await csrf()
  const response = await context.request.post(`${url}/login`, {
    headers: { 'X-Csrf-Token': token, Accept: 'application/json' },
    data: { email, password, _csrf: token },
  })
  assert.equal(response.status(), 200)
  assert.ok((await response.json()).redir)
  await page.goto(`${url}/project`)
  return { context, page, csrf }
}

try {
  const owner = await logIn(accounts[1], true)
  const colleague = await logIn(accounts[0])
  const create = await owner.context.request.post(`${url}/project/new`, {
    headers: { 'X-Csrf-Token': await owner.csrf(), Accept: 'application/json' },
    data: { projectName: 'Synthetic reconnect fixture', template: 'blank' },
  })
  assert.equal(create.status(), 200)
  const { project_id: projectId } = await create.json()
  assert.match(projectId, /^[\da-f]{24}$/)

  const grant = `import { db, ObjectId } from './app/src/infrastructure/mongodb.mjs'
const guest = await db.users.findOne({ email: ${JSON.stringify(guestEmail)} })
if (!guest) process.exit(3)
const result = await db.projects.updateOne({ _id: new ObjectId('${projectId}') }, { $addToSet: { collaberator_refs: guest._id } })
if (result.modifiedCount !== 1) process.exit(2)
process.exit(0)
`
  runInPreview(grant)

  const projectUrl = `${url}/project/${projectId}`
  const editor = page => page.locator('.cm-content[contenteditable="true"]').first()
  const edit = async (page, marker) => {
    await editor(page).waitFor({ timeout: 20_000 })
    await editor(page).click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.insertText(`% ${marker}\n`)
    assert.match(await editor(page).innerText(), new RegExp(marker))
  }
  const serverSource = async () => {
    const response = await colleague.context.request.get(`${url}/Project/${projectId}/download/zip`)
    assert.equal(response.status(), 200)
    return execFileSync('python3', ['-c', 'import io,sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read("main.tex"))'], { input: await response.body() }).toString()
  }
  const readDocument = `import { db, ObjectId } from './app/src/infrastructure/mongodb.mjs'
import DocumentUpdater from './app/src/Features/DocumentUpdater/DocumentUpdaterHandler.mjs'
const id = new ObjectId('${projectId}')
const project = await db.projects.findOne({ _id: id }, { projection: { rootDoc_id: 1 } })
const { lines } = await DocumentUpdater.promises.getDocument(id.toString(), project.rootDoc_id.toString(), 0)
console.log(JSON.stringify(lines))
process.exit(0)
`
  const currentDocument = () => {
    const output = runInPreview(readDocument)
    return JSON.parse(output.trim().split('\n').at(-1)).join('\n')
  }
  const waitSaved = async (...markers) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const source = currentDocument()
      if (markers.every(mark => source.includes(mark))) return source
      await delay(1200)
    }
    throw new Error(`Server did not save markers: ${markers.join(', ')}`)
  }

  await Promise.all([owner.page.goto(projectUrl), colleague.page.goto(projectUrl)])
  await edit(owner.page, 'BEFORE-DISCONNECT')
  await waitSaved('BEFORE-DISCONNECT')

  disconnected = true
  await owner.context.setOffline(true)
  await Promise.allSettled(sockets.map(ws => ws.close({ code: 1001, reason: 'synthetic outage' })))
  await edit(owner.page, 'OFFLINE-OWNER')
  assert.ok(!(await serverSource()).includes('OFFLINE-OWNER'))
  const warning = await owner.page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  assert.equal(warning, true)

  await edit(colleague.page, 'ONLINE-COLLEAGUE')
  await waitSaved('BEFORE-DISCONNECT', 'ONLINE-COLLEAGUE')

  disconnected = false
  await owner.context.setOffline(false)
  await editor(owner.page).click()
  const merged = await waitSaved('BEFORE-DISCONNECT', 'OFFLINE-OWNER', 'ONLINE-COLLEAGUE')
  assert.equal(merged.split('OFFLINE-OWNER').length, 2)
  assert.equal(merged.split('ONLINE-COLLEAGUE').length, 2)
  assert.match(await serverSource(), /OFFLINE-OWNER/)
  await owner.page.reload()
  await editor(owner.page).waitFor({ timeout: 30_000 })
  assert.match(await editor(owner.page).innerText(), /OFFLINE-OWNER/)
  assert.match(await editor(owner.page).innerText(), /ONLINE-COLLEAGUE/)
  await owner.context.close()
  console.log('Two separate accounts: server save before outage, unsaved warning, both concurrent edits saved exactly once after reconnect, and reload persistence passed.')
} finally {
  await browser.close()
}
