# LaTeX spelling context and local grammar feasibility

The editor already runs spelling in a browser Hunspell worker using dictionaries loaded from the application asset path. The project stores the selected spellcheck language and `LearnedWordsManager` stores learned words as a per-account preference. Learning a word applies to that account across its projects. It does not change shared source or another collaborator's dictionary. The dictionary catalog includes multiple English variants, Hindi and other language options. The existing browser test suite defines suggestion cases for ten locale variants. Deployment still needs a check that the corresponding dictionary assets load.

## Reproduction and change

A synthetic parser fixture tested ordinary and bold prose, LaTeX commands, citation keys, labels, `\url`, inline math, inline verbatim, a verbatim block, `\texttt` and a plain URL. Baseline checks found two gaps. Code set in `\texttt{}` and bare URLs were included in the candidate words sent to Hunspell. The other checked contexts retained the expected behavior.

The proposed change uses the parser's existing exclusion rule for the `\texttt` argument. It identifies common bare URL ranges on the source line and filters overlapping word candidates from both `Intl.Segmenter` and the regex fallback. Ordinary words before and after the URL keep their source offsets. The worker, dictionary routes, project setting and preference scope are unchanged.

The 11 focused spelling/cache tests pass with regression coverage for both segmentation modes. The baseline language-selector fixtures and seven learned-word backend tests also passed. These tests exercise the candidate-word pipeline and preference operations. The running-editor sweep still needs suggestion usability, keyboard access, same-account reload and a separate account, light and dark themes, and input-to-highlight latency on a long manuscript.

## Local grammar option

LanguageTool's open-source distribution provides a locally hosted HTTP grammar server. Its repository uses LGPL-2.1; review bundled dictionaries, rule assets and distribution notices separately. A server adds a JVM, language data and a per-request parsing cost, while the current Hunspell checks run in each browser and do not require server-side text processing. Local grammar would still need parser-selected prose with a reliable offset map and a strict size and concurrency cap. The browser and server performance, supported languages on the installed rule set and false positives on technical prose are unmeasured. [Project and license](https://github.com/languagetool-org/languagetool) · [Local HTTP server](https://dev.languagetool.org/http-server).

**Decision:** Keep grammar disabled for the first release. Estimate one to two engineering days for an isolated English-only grammar spike on synthetic text. Measure startup RAM, per-request CPU, p95 latency and parser-offset accuracy before choosing capacity or proposing an editor preview. Keep processing on Institute infrastructure if a pilot is approved. The existing spelling and local compile diagnostics remain available independently.
