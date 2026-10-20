import { expect } from 'chai'
import AdvancedReferenceIndex from '../../frontend/reference-index/advanced-reference-index'

function keys(result: { hits: { _source: { EntryKey: string } }[] }) {
  return result.hits.map(hit => hit._source.EntryKey)
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
