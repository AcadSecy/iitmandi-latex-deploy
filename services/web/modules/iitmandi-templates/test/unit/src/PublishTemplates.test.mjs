import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assembleTemplate,
  listTemplateIds,
  readTemplate,
} from '../../../scripts/assemble.mjs'
import {
  main,
  parseArgs,
  publishTemplate,
} from '../../../scripts/publish-templates.mjs'

function fakeServices({ status = 'success', conflict = false } = {}) {
  const calls = []
  const record =
    (name, result) =>
    async (...args) => {
      calls.push([name, ...args])
      return typeof result === 'function' ? result(...args) : result
    }
  return {
    calls,
    UserGetter: {
      promises: {
        getUserByMainEmail: record('getUserByMainEmail', email =>
          email === 'templates@iitmandi.ac.in' ? { _id: 'owner-id' } : null
        ),
      },
    },
    ProjectUploadManager: {
      promises: {
        createProjectFromZipArchiveWithName: record('createProject', {
          project: { _id: 'project-id' },
        }),
      },
    },
    ProjectOptionsHandler: {
      promises: { setCompiler: record('setCompiler') },
    },
    ProjectRootDocManager: {
      promises: { setRootDocFromName: record('setRootDocFromName') },
    },
    ProjectDeleter: { promises: { deleteProject: record('deleteProject') } },
    CompileManager: {
      promises: {
        compile: record('compile', {
          status,
          buildId: status === 'success' ? 'build-1' : undefined,
        }),
      },
    },
    TemplateGalleryManager: {
      createTemplateFromProject: record(
        'createTemplateFromProject',
        conflict
          ? { conflict: true, templateOwnerName: 'someone else' }
          : { conflict: false, templateId: 'template-id' }
      ),
    },
  }
}

describe('IIT Mandi templates', function () {
  it('has valid metadata and files for every template', function () {
    const ids = listTemplateIds()
    expect(ids).toContain('thesis')
    for (const id of ids) {
      const { metadata } = readTemplate(id)
      expect(metadata.name).toMatch(/^IIT Mandi /)
      expect(metadata.description.length).toBeLessThan(1000)
    }
  })

  it('never mentions the upstream product name in what users see', function () {
    for (const id of listTemplateIds()) {
      const { metadata } = readTemplate(id)
      expect(JSON.stringify(metadata)).not.toMatch(/overleaf/i)
    }
  })

  describe('assembleTemplate', function () {
    let dir
    beforeEach(function () {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-test-'))
    })
    afterEach(function () {
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('copies the template and its shared files, without template.json', function () {
      const out = path.join(dir, 'thesis')
      assembleTemplate('thesis', out)
      expect(fs.existsSync(path.join(out, 'main.tex'))).toBe(true)
      expect(fs.existsSync(path.join(out, 'iitmandi-thesis.cls'))).toBe(true)
      expect(fs.existsSync(path.join(out, 'iitmandi-logo.jpg'))).toBe(true)
      expect(fs.existsSync(path.join(out, 'template.json'))).toBe(false)
    })
  })

  describe('parseArgs', function () {
    it('selects all templates by default', function () {
      expect(parseArgs(['--owner=a@b.c']).ids).toEqual(listTemplateIds())
    })

    it('selects the templates given with --only', function () {
      expect(parseArgs(['--only=thesis, cv']).ids).toEqual(['thesis', 'cv'])
    })

    it('rejects unknown templates', function () {
      expect(() => parseArgs(['--only=nope'])).toThrow(/unknown template/)
    })
  })

  describe('publishTemplate', function () {
    let workDir
    beforeEach(function () {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-test-'))
    })
    afterEach(function () {
      fs.rmSync(workDir, { recursive: true, force: true })
    })

    it('imports, compiles and publishes the template, then deletes the project', async function () {
      const services = fakeServices()
      const message = await publishTemplate(services, {
        id: 'thesis',
        ownerId: 'owner-id',
        keepProject: false,
        workDir,
      })
      expect(message).toMatch(/published "IIT Mandi Thesis"/)
      expect(services.calls.map(call => call[0])).toEqual([
        'createProject',
        'setCompiler',
        'setRootDocFromName',
        'compile',
        'createTemplateFromProject',
        'deleteProject',
      ])
      const [, ownerId, name, zipPath] = services.calls[0]
      expect(ownerId).toBe('owner-id')
      expect(name).toBe('IIT Mandi Thesis')
      expect(fs.statSync(zipPath).size).toBeGreaterThan(1000)
      const [, publish] = services.calls[4]
      expect(publish).toMatchObject({
        projectId: 'project-id',
        userId: 'owner-id',
        templateSource: {
          name: 'IIT Mandi Thesis',
          category: 'thesis',
          license: 'lppl_1.3c',
          build: 'build-1',
          override: true,
        },
      })
    })

    it('keeps the project when asked to', async function () {
      const services = fakeServices()
      await publishTemplate(services, {
        id: 'cv',
        ownerId: 'owner-id',
        keepProject: true,
        workDir,
      })
      expect(services.calls.map(call => call[0])).not.toContain('deleteProject')
    })

    it('fails without publishing when the compile fails, and still deletes the project', async function () {
      const services = fakeServices({ status: 'failure' })
      const error = await publishTemplate(services, {
        id: 'cv',
        ownerId: 'owner-id',
        keepProject: false,
        workDir,
      }).catch(err => err)
      expect(error.message).toMatch(/status "failure"/)
      const names = services.calls.map(call => call[0])
      expect(names).not.toContain('createTemplateFromProject')
      expect(names[names.length - 1]).toBe('deleteProject')
    })

    it('reports a template owned by someone else', async function () {
      const services = fakeServices({ conflict: true })
      const error = await publishTemplate(services, {
        id: 'cv',
        ownerId: 'owner-id',
        keepProject: false,
        workDir,
      }).catch(err => err)
      expect(error.message).toMatch(/belongs to someone else/)
    })
  })

  describe('main', function () {
    beforeEach(function () {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('asks for an owner', async function () {
      expect(await main([], fakeServices())).toBe(2)
    })

    it('lists the templates on a dry run without touching anything', async function () {
      const services = fakeServices()
      expect(await main(['--owner=x@y.z', '--dry-run'], services)).toBe(0)
      expect(services.calls).toEqual([])
    })

    it('fails for an unknown owner', async function () {
      expect(await main(['--owner=nobody@iitmandi.ac.in'], fakeServices())).toBe(1)
    })

    it('publishes the selected templates', async function () {
      const services = fakeServices()
      expect(
        await main(['--owner=templates@iitmandi.ac.in', '--only=cv'], services)
      ).toBe(0)
      expect(services.calls.map(call => call[0])).toContain(
        'createTemplateFromProject'
      )
    })
  })
})
