import { describe, expect, it } from 'vitest'
import { isSafeChapter, listChapters } from '../../../app/src/Chapters.mjs'

describe('listChapters', function () {
  it('lists \\include arguments in order', function () {
    const text = [
      '\\documentclass{book}',
      '\\begin{document}',
      '\\include{chapters/intro}',
      '\\include {chapters/methods}',
      '\\input{chapters/appendix}',
      '\\end{document}',
    ].join('\n')
    expect(listChapters(text)).toEqual(['chapters/intro', 'chapters/methods'])
  })

  it('ignores \\includeonly, \\includegraphics and commented lines', function () {
    const text = [
      '\\includeonly{chapters/intro}',
      '\\includegraphics{figure}',
      '% \\include{old}',
      '\\include{kept} % \\include{trailing}',
      '100\\% \\include{after-escaped-percent}',
    ].join('\n')
    expect(listChapters(text)).toEqual(['kept', 'after-escaped-percent'])
  })

  it('keeps names with spaces and subfolders, and drops repeats', function () {
    const text = [
      '\\include{part one/my chapter}',
      '\\include{part one/my chapter}',
    ].join('\n')
    expect(listChapters(text)).toEqual(['part one/my chapter'])
  })

  it('returns nothing when the file has no \\include', function () {
    expect(listChapters('\\input{a}\n\\input{b}')).toEqual([])
  })

  it('leaves out unsafe names', function () {
    expect(listChapters('\\include{../secret}\n\\include{a\\b}')).toEqual([])
  })

  it('does not read a macro or a list as file names', function () {
    const text = ['\\include{\\chapdir/one}', '\\include{a,b}'].join('\n')
    expect(listChapters(text)).toEqual([])
  })
})

describe('isSafeChapter', function () {
  it('accepts plain relative paths', function () {
    for (const name of ['intro', 'chapters/ch-1', 'a_b.c/d e', 'v2.1/x']) {
      expect(isSafeChapter(name)).toBe(true)
    }
  })

  it('refuses anything that could reach TeX or a command line', function () {
    const bad = [
      '',
      '/etc/passwd',
      '../up',
      'a/../b',
      'a//b',
      'a.tex',
      'a ',
      ' a',
      'a/',
      'a.',
      'a}\\input{x',
      'a\\b',
      'a"b',
      "a'b",
      'a;b',
      'a$(x)',
      'a`x`',
      'a\nb',
      'a%b',
      'a#b',
      'a^b',
      'a,b',
      'a~b',
      'a&b',
      'a{b',
      'é',
      'a'.repeat(201),
      null,
      undefined,
      42,
    ]
    for (const name of bad) {
      expect(isSafeChapter(name), JSON.stringify(name)).toBe(false)
    }
  })
})
