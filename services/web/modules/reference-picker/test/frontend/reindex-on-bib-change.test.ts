import { expect } from 'chai'
import { bibChangeFromEvent } from '../../frontend/components/reindex-on-bib-change'

describe('bibChangeFromEvent', function () {
  const entities: Record<string, { name: string; type: string }> = {
    bib1: { name: 'library.bib', type: 'doc' },
    tex1: { name: 'main.tex', type: 'doc' },
    dir1: { name: 'refs', type: 'folder' },
  }
  const oldName = (id: string) => entities[id]

  it('re-indexes when a .bib doc or file is uploaded or replaced', function () {
    expect(bibChangeFromEvent('reciveNewDoc', ['root', { name: 'library.bib' }, 'upload'], oldName)).to.equal(true)
    expect(bibChangeFromEvent('reciveNewFile', ['root', { name: 'Refs.BIB' }, 'upload'], oldName)).to.equal(true)
  })

  it('ignores other uploads', function () {
    expect(bibChangeFromEvent('reciveNewDoc', ['root', { name: 'chapter.tex' }, 'upload'], oldName)).to.equal(false)
    expect(bibChangeFromEvent('reciveNewFile', ['root', { name: 'figure.png' }, 'upload'], oldName)).to.equal(false)
  })

  it('re-indexes when a file is renamed to or from .bib', function () {
    expect(bibChangeFromEvent('reciveEntityRename', ['tex1', 'refs.bib'], oldName)).to.equal(true)
    expect(bibChangeFromEvent('reciveEntityRename', ['bib1', 'library.txt'], oldName)).to.equal(true)
    expect(bibChangeFromEvent('reciveEntityRename', ['tex1', 'intro.tex'], oldName)).to.equal(false)
    // The renaming tab already shows the new name, so the old one is unknown.
    expect(bibChangeFromEvent('reciveEntityRename', ['bib1', 'library.bib'], oldName)).to.equal(true)
  })

  it('re-indexes when a .bib is removed, and only then', function () {
    expect(bibChangeFromEvent('removeEntity', ['bib1', 'editor'], oldName)).to.equal(true)
    expect(bibChangeFromEvent('removeEntity', ['tex1', 'editor'], oldName)).to.equal(false)
    expect(bibChangeFromEvent('removeEntity', ['dir1', 'editor'], oldName)).to.equal(true)
    expect(bibChangeFromEvent('removeEntity', ['unknown'], oldName)).to.equal(false)
  })

  it('re-indexes when a .bib replaced by upload has its metadata broadcast', function () {
    expect(bibChangeFromEvent('broadcastDocMeta', [{ docId: 'bib1', meta: {} }], oldName)).to.equal(true)
    expect(bibChangeFromEvent('broadcastDocMeta', [{ docId: 'tex1', meta: {} }], oldName)).to.equal(false)
    expect(bibChangeFromEvent('broadcastDocMeta', [undefined], oldName)).to.equal(false)
  })
})
