import { expect } from 'chai'
import { createElement, Fragment } from 'react'
import { render } from '@testing-library/react'
import AdvancedReferenceIndex, {
  type ReferenceHit,
} from '../../frontend/reference-index/advanced-reference-index'
import { highlight } from '../../frontend/components/reference-picker-modal'

function keys(result: { hits: { _source: { EntryKey: string } }[] }) {
  return result.hits.map(hit => hit._source.EntryKey)
}

function titles(result: {
  hits: { _source: { Fields: { title: string } } }[]
}) {
  return result.hits.map(hit => hit._source.Fields.title)
}

describe('AdvancedReferenceIndex', function () {
  beforeEach(function () {
    this.index = new AdvancedReferenceIndex()
    this.index.updateIndex({
      updates: [
        {
          path: 'refs.bib',
          content: `
@article{mueller2020,
  author = {M{\\"u}ller, Hans and Smith, Jane},
  title = {Deep {Learning} for {LaTeX}},
  journal = {Journal of Tests},
  year = {2020}
}
@online{kumar2024,
  author = {Kumar, Priya},
  title = {Compiling Theses Faster},
  date = {2024-03-15}
}
@book{knuth1984,
  author = {Knuth, Donald E.},
  title = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year = {1984}
}
@inproceedings{rao2019,
  author = {Rao, Anil},
  title = {Caching Figures},
  booktitle = {Proceedings of the Typesetting Conference},
  year = {2019}
}`,
        },
        {
          path: 'linked/other.bib',
          content: `@misc{linked2021, author = {Lin, Kai}, title = {Linked File Entry}, year = {2021}}`,
        },
      ],
      deletes: [],
    })
  })

  it('finds by author, title and year together', async function () {
    expect(keys(await this.index.search('muller learning 2020'))).to.deep.equal(
      ['mueller2020']
    )
  })

  it('finds a name written with a TeX accent by its accented form', async function () {
    expect(keys(await this.index.search('müller'))).to.deep.equal([
      'mueller2020',
    ])
  })

  it('finds a title that has braces in it', async function () {
    expect(keys(await this.index.search('deep learning'))).to.deep.equal([
      'mueller2020',
    ])
    expect(keys(await this.index.search('texbook'))).to.deep.equal([
      'knuth1984',
    ])
  })

  it('finds a biblatex entry by the year in its date field', async function () {
    expect(keys(await this.index.search('kumar 2024'))).to.deep.equal([
      'kumar2024',
    ])
  })

  it('finds by book title, publisher and the second author', async function () {
    expect(keys(await this.index.search('typesetting conference'))).to.deep.equal(
      ['rao2019']
    )
    expect(keys(await this.index.search('addison'))).to.deep.equal([
      'knuth1984',
    ])
    expect(keys(await this.index.search('smith'))).to.deep.equal([
      'mueller2020',
    ])
  })

  it('searches every .bib file and forgets a deleted one', async function () {
    expect(keys(await this.index.search('linked'))).to.deep.equal(['linked2021'])
    this.index.updateIndex({ updates: [], deletes: ['linked/other.bib'] })
    expect(keys(await this.index.search('linked'))).to.deep.equal([])
  })

  for (const [name, content] of [
    ['empty', ''],
    ['whitespace-only', ' \n\t\r '],
  ]) {
    it(`forgets old entries when a file becomes ${name}`, async function () {
      expect(() =>
        this.index.updateIndex({
          updates: [{ path: 'refs.bib', content }],
          deletes: [],
        })
      ).not.to.throw()
      expect([...this.index.getKeys()]).to.deep.equal(['linked2021'])
      expect(keys(await this.index.search(''))).to.deep.equal(['linked2021'])
      expect(keys(await this.index.search('muller'))).to.deep.equal([])
    })
  }

  for (const [name, content, expected] of [
    ['an unclosed brace', '@misc{broken, title = {Unclosed', ['before']],
    ['garbage between entries', 'this is not BibTeX', ['before', 'after']],
    ['an entry with no key', '@misc{, title = {No key}}', ['before', 'after']],
  ] as const) {
    it(`keeps good entries and forgets old ones with ${name}`, async function () {
      const contentWithGoodEntries = `@misc{before, title = {Before}}
${content}
@misc{after, title = {After}}`
      expect(() =>
        this.index.updateIndex({
          updates: [{ path: 'refs.bib', content: contentWithGoodEntries }],
          deletes: [],
        })
      ).not.to.throw()
      // The parser cannot recover entries after an unclosed field. A keyless
      // entry may produce a synthetic key; check the valid entries separately.
      const stored = [...this.index.getKeys()]
      expect(stored).to.include.members([...expected, 'linked2021'])
      if (name !== 'an entry with no key') {
        expect(stored).to.deep.equal([...expected, 'linked2021'])
      }
      for (const key of ['mueller2020', 'kumar2024', 'knuth1984', 'rao2019']) {
        expect(stored).not.to.include(key)
        expect(keys(await this.index.search(key))).to.deep.equal([])
      }
      for (const key of expected) {
        const { hits } = await this.index.search(key)
        expect(keys({ hits })).to.deep.equal([key])
        expect(hits[0]._source.Fields.title).to.equal(
          key === 'before' ? 'Before' : 'After'
        )
      }
      expect(keys(await this.index.search('muller'))).to.deep.equal([])
      expect(keys(await this.index.search('linked'))).to.deep.equal(['linked2021'])
    })
  }

  it('keeps the first definition of a key that two .bib files share', async function () {
    const index = new AdvancedReferenceIndex()
    const fileA = { path: 'a.bib', content: '@misc{shared, title = {From A}}' }
    const fileB = { path: 'b.bib', content: '@misc{shared, title = {From B}}' }
    index.updateIndex({ updates: [fileA, fileB], deletes: [] })
    // the copy from the file indexed first is the one shown
    expect(titles(await index.search('shared'))).to.deep.equal(['From A'])

    // editing the second file does not make its copy win
    index.updateIndex({ updates: [fileB], deletes: [] })
    expect(titles(await index.search('shared'))).to.deep.equal(['From A'])

    // deleting the first file falls back to the second copy
    index.updateIndex({ updates: [], deletes: ['a.bib'] })
    expect(titles(await index.search('shared'))).to.deep.equal(['From B'])
    expect([...index.getKeys()]).to.deep.equal(['shared'])
  })

  it('names every file that defines a shared key', async function () {
    const index = new AdvancedReferenceIndex()
    const fileA = { path: 'a.bib', content: '@misc{shared, title = {From A}}' }
    const fileB = { path: 'b.bib', content: '@misc{shared, title = {From B}}' }
    const fileC = { path: 'c.bib', content: '@misc{alone, title = {Only C}}' }
    index.updateIndex({ updates: [fileA, fileB, fileC], deletes: [] })
    const hits = async (query: string) =>
      (await index.search(query)).hits as ReferenceHit[]

    expect((await hits('shared'))[0].files).to.deep.equal(['a.bib', 'b.bib'])
    expect((await hits('alone'))[0]).not.to.have.property('files')
    // the empty query lists the same warning
    const listed = (await hits('')).find(h => h._source.EntryKey === 'shared')
    expect(listed?.files).to.deep.equal(['a.bib', 'b.bib'])

    // delete one copy: the warning goes
    index.updateIndex({ updates: [], deletes: ['a.bib'] })
    expect((await hits('shared'))[0]).not.to.have.property('files')
    expect(titles(await index.search('shared'))).to.deep.equal(['From B'])

    // add it back: indexed after b.bib now, so b.bib's copy is shown first
    index.updateIndex({ updates: [fileA], deletes: [] })
    expect((await hits('shared'))[0].files).to.deep.equal(['b.bib', 'a.bib'])
    expect(titles(await index.search('shared'))).to.deep.equal(['From B'])

    // moving the key between files keeps one entry and the right files
    index.updateIndex({
      updates: [
        { path: 'b.bib', content: '@misc{other, title = {Other}}' },
        { path: 'c.bib', content: '@misc{shared, title = {From C}}' },
      ],
      deletes: [],
    })
    expect(keys(await index.search('shared'))).to.deep.equal(['shared'])
    expect((await hits('shared'))[0].files).to.deep.equal(['c.bib', 'a.bib'])
    expect([...index.getKeys()].sort()).to.deep.equal(['other', 'shared'])
  })

  it('counts a key repeated inside one file once', async function () {
    const index = new AdvancedReferenceIndex()
    index.updateIndex({
      updates: [
        {
          path: 'a.bib',
          content: '@misc{twice, title = {One}}\n@misc{twice, title = {Two}}',
        },
      ],
      deletes: [],
    })
    const { hits } = await index.search('twice')
    expect(hits).to.have.lengthOf(1)
    expect(hits[0]).not.to.have.property('files')
  })

  it('finds a name however its accent is written', async function () {
    const index = new AdvancedReferenceIndex()
    const forms = [
      'M{\\"u}ller',
      'M\\"uller',
      'M\\"{u}ller',
      'Müller',
      '{M\\"{u}ller}',
    ]
    index.updateIndex({
      updates: [
        {
          path: 'a.bib',
          content: forms
            .map((name, i) => `@misc{form${i}, author = {${name}, Ann}}`)
            .join('\n'),
        },
        {
          path: 'b.bib',
          content: `@misc{emile, author = {\\'{E}mile Zola}}
@misc{cech, author = {\\v{C}ech, Eduard}}
@misc{erdos, author = {Erd\\H{o}s, Paul}}
@misc{garcia, author = {Garc\\'{\\i}a, Lu\\'is}}`,
        },
      ],
      deletes: [],
    })
    const all = forms.map((_, i) => `form${i}`)
    expect(keys(await index.search('muller'))).to.deep.equal(all)
    expect(keys(await index.search('müller'))).to.deep.equal(all)
    expect(keys(await index.search('emile'))).to.deep.equal(['emile'])
    expect(keys(await index.search('cech'))).to.deep.equal(['cech'])
    expect(keys(await index.search('erdos'))).to.deep.equal(['erdos'])
    expect(keys(await index.search('garcia luis'))).to.deep.equal(['garcia'])
    const { hits } = await index.search('garcia luis')
    expect(hits[0]._source.Fields.author).to.equal('García, Luís')
  })

  it('finds protected and macro-heavy names without corrupting displayed fields', async function () {
    const index = new AdvancedReferenceIndex()
    const names = [
      [String.raw`{{M\"uller}}`, 'Müller', 'muller'],
      [String.raw`{\relax Ch}ristoph`, 'Christoph', 'christoph'],
      [String.raw`{\"{U}}ber`, 'Über', 'uber'],
      [String.raw`\textsc{Smith}`, 'Smith', 'smith'],
      [String.raw`{\'E}cole`, 'École', 'ecole'],
      ['Müller', 'Müller', 'muller'],
      ['Søren', 'Søren', 'soren'],
    ]
    index.updateIndex({
      updates: [
        {
          path: 'names.bib',
          content: names
            .map(([name], i) => `@misc{name${i},
  author = {${name}}, title = {${name}}, journal = {${name}}
}`)
            .join('\n'),
        },
      ],
      deletes: [],
    })
    for (const [i, [, displayed, query]] of names.entries()) {
      const { hits } = await index.search(query)
      const hit = hits.find(hit => hit._source.EntryKey === `name${i}`)
      expect(hit, query).not.to.equal(undefined)
      for (const field of ['author', 'title', 'journal']) {
        expect(hit!._source.Fields[field], field).to.equal(displayed)
      }
    }
  })

  it('converts bare dot and macron accents without changing escaped punctuation', async function () {
    const index = new AdvancedReferenceIndex()
    index.updateIndex({
      updates: [
        {
          path: 'punctuation.bib',
          content: String.raw`@misc{accents,
  title = {\.Zolc and \=Anand}
}
@misc{punctuation,
  title = {Quoted \" words \" and \' punctuation \' with \. and \= plus \& 50\%}
}`,
        },
      ],
      deletes: [],
    })
    expect(keys(await index.search('zolc anand'))).to.deep.equal(['accents'])
    expect(titles(await index.search('zolc anand'))).to.deep.equal([
      'Żolc and Ānand',
    ])
    expect(keys(await index.search('words punctuation & 50%'))).to.deep.equal([
      'punctuation',
    ])
    expect(titles(await index.search('words punctuation'))).to.deep.equal([
      `Quoted " words " and ' punctuation ' with . and = plus & 50%`,
    ])
  })

  it('leaves a line break before the words relax and textsc alone', async function () {
    const index = new AdvancedReferenceIndex()
    index.updateIndex({
      updates: [
        {
          path: 'breaks.bib',
          content: String.raw`@misc{relax, title = {Stay\\relax}}
@misc{textsc, title = {Line\\textsc{Two}}}
@misc{after, title = {After}}`,
        },
      ],
      deletes: [],
    })
    expect([...index.getKeys()]).to.deep.equal(['relax', 'textsc', 'after'])
    expect(titles(await index.search('after'))).to.deep.equal(['After'])
  })

  it('keeps keys with punctuation exactly as written', async function () {
    const index = new AdvancedReferenceIndex()
    const written = [
      'smith:2020a',
      'doe-2019_v2',
      'van.der.berg/2018',
      'Lee+Kim2021',
      "o'brien2017",
    ]
    index.updateIndex({
      updates: [
        {
          path: 'p.bib',
          content: written
            .map(key => `@misc{${key}, author = {M\\"uller, X}, title = {T}}`)
            .join('\n'),
        },
      ],
      deletes: [],
    })
    expect([...index.getKeys()]).to.deep.equal(written)
    expect(keys(await index.search('muller'))).to.deep.equal(written)
    expect(keys(await index.search('smith:2020a'))).to.deep.equal([
      'smith:2020a',
    ])
    expect(keys(await index.search('van.der'))).to.deep.equal([
      'van.der.berg/2018',
    ])
  })

  it('finds by keyword', async function () {
    const index = new AdvancedReferenceIndex()
    index.updateIndex({
      updates: [
        {
          path: 'k.bib',
          content:
            '@article{das2022, author = {Das, Ravi}, title = {A Study}, keywords = {graph neural networks, chemistry}, year = {2022}}',
        },
      ],
      deletes: [],
    })
    expect(keys(await index.search('neural chemistry'))).to.deep.equal([
      'das2022',
    ])
  })

  it('finds letters that have no separate accent mark', async function () {
    const index = new AdvancedReferenceIndex()
    index.updateIndex({
      updates: [
        {
          path: 'u.bib',
          content: `@book{kierkegaard1843, author = {Kierkegaard, Søren}, title = {Either Or}, year = {1843}}
@article{lukasiewicz1920, author = {Łukasiewicz, Jan}, title = {On Three-Valued Logic}, year = {1920}}`,
        },
      ],
      deletes: [],
    })
    expect(keys(await index.search('soren'))).to.deep.equal(['kierkegaard1843'])
    expect(keys(await index.search('lukasiewicz'))).to.deep.equal([
      'lukasiewicz1920',
    ])
  })

  it('highlights the accented letters that an unaccented query matched', function () {
    const { container } = render(
      createElement(
        Fragment,
        null,
        highlight('Müller, Søren', ['muller', 'soren'])
      )
    )
    const marked = [...container.querySelectorAll('.found-token')].map(
      el => el.textContent
    )
    expect(marked).to.deep.equal(['Müller', 'Søren'])
    expect(container.textContent).to.equal('Müller, Søren')

    // an accent stored as its own character stays with the marked letter
    const decomposed = render(
      createElement(Fragment, null, highlight('Müller', ['muller']))
    )
    expect(
      decomposed.container.querySelector('.found-token')?.textContent
    ).to.equal('Müller')
  })

  it('searches 500 entries quickly', async function () {
    const content = Array.from(
      { length: 500 },
      (_, i) =>
        `@article{key${i}, author = {Author ${i}, Some}, title = {Title number ${i}}, journal = {Journal ${i % 7}}, year = {${1990 + (i % 30)}}}`
    ).join('\n')
    const index = new AdvancedReferenceIndex()
    index.updateIndex({ updates: [{ path: 'big.bib', content }], deletes: [] })
    const start = performance.now()
    const result = await index.search('title 2019 journal')
    const elapsed = performance.now() - start
    expect(keys(result)).to.have.lengthOf(16)
    expect(elapsed).to.be.below(50)
  })
})
