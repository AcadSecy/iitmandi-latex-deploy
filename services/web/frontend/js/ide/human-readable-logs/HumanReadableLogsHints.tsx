import {
  packageSuggestionsForCommands,
  packageSuggestionsForEnvironments,
} from './HumanReadableLogsPackageSuggestions'
import getMeta from '@/utils/meta'

function WikiLink({
  url,
  children,
}: {
  url: string
  children: React.ReactNode
}) {
  if (getMeta('ol-wikiEnabled')) {
    return (
      <a href={url} target="_blank" rel="noopener">
        {children}
      </a>
    )
  } else {
    return <>{children}</>
  }
}

type LogHint = {
  extraInfoURL?: string | null
  formattedContent: (details?: string[]) => React.ReactNode
}

const hints: { [ruleId: string]: LogHint } = {
  hint_misplaced_alignment_tab_character: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=Misplaced%20alignment%20tab%20character%20%26',
    formattedContent: () => (
      <>
        You have placed an alignment tab character '&' in the wrong place. If
        you want to align something, you must write it inside an align
        environment such as \begin
        {'{align}'} … \end
        {'{align}'}, \begin
        {'{tabular}'} … \end
        {'{tabular}'}, etc. If you want to write an ampersand '&' in text, you
        must write \& instead.
      </>
    ),
  },
  hint_extra_alignment_tab_has_been_changed: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=Extra%20alignment%20tab%20has%20been%20changed%20to%20%5Ccr',
    formattedContent: () => (
      <>
        You have written too many alignment tabs in a table, causing one of them
        to be turned into a line break. Make sure you have specified the correct
        number of columns in your{' '}
        <WikiLink url="/learn">table</WikiLink>.
      </>
    ),
  },
  hint_display_math_should_end_with: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=Display%20math%20should%20end%20with$$',
    formattedContent: () => (
      <>
        You have forgotten a $ sign at the end of 'display math' mode. When
        writing in display math mode, you must always math write inside $$ … $$.
        Check that the number of $s match around each math expression.
      </>
    ),
  },
  hint_missing_inserted: {
    extraInfoURL: 'https://tex.stackexchange.com/search?q=Missing$_inserted',
    formattedContent: () => (
      <>
        <p>
          You need to enclose all mathematical expressions and symbols with
          special markers. These special markers create a ‘math mode’.
        </p>
        <p>
          Use <code>$...$</code> for inline math mode, and <code>\[...\]</code>
          or one of the mathematical environments (e.g. equation) for display
          math mode.
        </p>
        <p>
          This applies to symbols such as subscripts ( <code>_</code> ),
          integrals ( <code>\int</code> ), Greek letters ( <code>\alpha</code>,{' '}
          <code>\beta</code>, <code>\delta</code> ) and modifiers{' '}
          <code>{'(\\vec{x}'}</code>, <code>{'\\tilde{x}'})</code>.
        </p>
      </>
    ),
  },
  hint_reference_undefined: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=There%20were%20undefined%20references',
    formattedContent: () => (
      <>
        You have referenced something which has not yet been labelled. If you
        have labelled it already, make sure that what is written inside \ref
        {'{...}'} is the same as what is written inside \label
        {'{...}'}.
      </>
    ),
  },
  hint_there_were_undefined_references: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=There%20were%20undefined%20references',
    formattedContent: () => (
      <>
        You have referenced something which has not yet been labelled. If you
        have labelled it already, make sure that what is written inside \ref
        {'{...}'} is the same as what is written inside \label
        {'{...}'}.
      </>
    ),
  },
  hint_citation_on_page_undefined_on_input_line: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=Citation%20on%20page%20undefined%20on%20input%20line',
    formattedContent: () => (
      <>
        You have cited something which is not included in your bibliography.
        Make sure that the citation (\cite
        {'{...}'}) has a corresponding key in your bibliography, and that both
        are spelled the same way.
      </>
    ),
  },
  hint_label_multiply_defined_labels: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=There%20were%20multiply-defined%20labels',
    formattedContent: () => (
      <>
        You have used the same label more than once. Check that each \label
        {'{...}'} labels only one item.
      </>
    ),
  },
  hint_float_specifier_changed: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=%60!h'%20float%20specifier%20changed%20to%20%60!ht'',
    formattedContent: () => (
      <>
        The float specifier 'h' is too strict of a demand for LaTeX to place
        your float in a nice way here. Try relaxing it by using 'ht', or even
        'htbp' if necessary. If you want to try keep the float here anyway,
        check out the{' '}
        <WikiLink url="/learn">
          float package
        </WikiLink>
        .
      </>
    ),
  },
  hint_no_positions_in_optional_float_specifier: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=No%20positions%20in%20optional%20float%20specifier',
    formattedContent: () => (
      <>
        You have forgotten to include a float specifier, which tells LaTeX where
        to position your figure. To fix this, either insert a float specifier
        inside the square brackets (e.g. \begin
        {'{figure}'}
        [h]), or remove the square brackets (e.g. \begin
        {'{figure}'}
        ). Find out more about float specifiers{' '}
        <WikiLink url="/learn">
          here
        </WikiLink>
        .
      </>
    ),
  },
  hint_undefined_control_sequence: {
    formattedContent: details => {
      if (details?.length) {
        const command = details[0]
        const suggestion = packageSuggestionsForCommands.get(command)
        if (suggestion) {
          return (
            <>
              <p>
                We think you’ve got a missing package! The{' '}
                <code>{command}</code> command won't work unless you include
                <code>{suggestion.command}</code> in your{' '}
                <WikiLink url="/learn">
                  document preamble
                </WikiLink>
                .{' '}
                <WikiLink url="/learn">
                  Learn more about packages
                </WikiLink>
                .
              </p>
            </>
          )
        }
      }
      return (
        <>
          The compiler is having trouble understanding a command you have used.
          Check that the command is spelled correctly. If the command is part of
          a package, make sure you have included the package in your preamble
          using <code>\usepackage</code>
          {'{...}'}.
          <div className="log-entry-content-link">
            <a
              href="https://tex.stackexchange.com/search?q=Undefined%20control%20sequence"
              target="_blank"
              rel="noopener"
            >
              Learn more
            </a>
          </div>
        </>
      )
    },
  },
  hint_undefined_environment: {
    formattedContent: details => {
      if (details?.length) {
        const environment = details[0]
        const suggestion = packageSuggestionsForEnvironments.get(environment)
        if (suggestion) {
          return (
            <>
              <p>
                We think you’ve got a missing package! The{' '}
                <code>{environment}</code> environment won't work unless you
                include <code>{suggestion.command}</code> in your{' '}
                <WikiLink url="/learn">
                  document preamble
                </WikiLink>
                .{' '}
                <WikiLink url="/learn">
                  Learn more about packages
                </WikiLink>
                .
              </p>
            </>
          )
        }
      }
      return (
        <>
          You have created an environment (using \begin
          {'{…}'} and \end
          {'{…}'} commands) which is not recognized. Make sure you have included
          the required package for that environment in your preamble, and that
          the environment is spelled correctly.
          <div className="log-entry-content-link">
            <a
              href="/learn"
              target="_blank"
              rel="noopener"
            >
              Learn more
            </a>
          </div>
        </>
      )
    },
  },
  hint_file_not_found: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=File%20not%20found%20on%20input%20line',
    formattedContent: () => (
      <>
        The compiler cannot find the file you want to include. Make sure that
        you have{' '}
        <WikiLink url="/learn">
          uploaded the file
        </WikiLink>{' '}
        and{' '}
        <WikiLink url="https://tex.stackexchange.com/search?q=File%20not%20found%20on%20input%20line%20.">
          specified the file location correctly
        </WikiLink>
        .
      </>
    ),
  },
  hint_unknown_graphics_extension: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20Unknown%20graphics%20extension%3A%20.',
    formattedContent: () => (
      <>
        The compiler does not recognise the file type of one of your images.
        Make sure you are using a{' '}
        <WikiLink url="https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20Unknown%20graphics%20extension%3A%20.gif.">
          supported image format
        </WikiLink>{' '}
        for your choice of compiler, and check that there are no periods (.) in
        the name of your image.
      </>
    ),
  },
  hint_unknown_float_option_h: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20Unknown%20float%20option%20%60H'',
    formattedContent: () => (
      <>
        The compiler isn't recognizing the float option 'H'. Include \usepackage
        {'{float}'} in your preamble to fix this.
      </>
    ),
  },
  hint_unknown_float_option_q: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20Unknown%20float%20option%20%60q'',
    formattedContent: () => (
      <>
        You have used a float specifier which the compiler does not understand.
        You can learn more about the different float options available for
        placing figures{' '}
        <WikiLink url="/learn">
          here
        </WikiLink>{' '}
        .
      </>
    ),
  },
  hint_math_allowed_only_in_math_mode: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20%5Cmathrm%20allowed%20only%20in%20math%20mode',
    formattedContent: () => (
      <>
        You have used a font command which is only available in math mode. To
        use this command, you must be in maths mode (E.g. $ … $ or \begin
        {'{math}'} … \end
        {'{math}'}
        ). If you want to use it outside of math mode, use the text version
        instead: \textrm, \textit, etc.
      </>
    ),
  },
  hint_mismatched_environment: {
    formattedContent: () => (
      <>
        You have used \begin
        {'{...}'} without a corresponding \end
        {'{...}'}.
      </>
    ),
  },
  hint_mismatched_brackets: {
    formattedContent: () => (
      <>You have used an open bracket without a corresponding close bracket.</>
    ),
  },
  hint_can_be_used_only_in_preamble: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20Can%20be%20used%20only%20in%20preamble',
    formattedContent: () => (
      <>
        You have used a command in the main body of your document which should
        be used in the preamble. Make sure that \documentclass[…]
        {'{…}'} and all \usepackage
        {'{…}'} commands are written before \begin
        {'{document}'}.
      </>
    ),
  },
  hint_missing_right_inserted: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=Missing%20%5Cright%20insertede',
    formattedContent: () => (
      <>
        You have started an expression with a \left command, but have not
        included a corresponding \right command. Make sure that your \left and
        \right commands balance everywhere, or else try using \Biggl and \Biggr
        commands instead as shown{' '}
        <WikiLink url="https://tex.stackexchange.com/search?q=Missing%20%5Cright%20inserted">
          here
        </WikiLink>
        .
      </>
    ),
  },
  hint_double_superscript: {
    extraInfoURL: 'https://tex.stackexchange.com/search?q=Double%20superscript',
    formattedContent: () => (
      <>
        You have written a double superscript incorrectly as a^b^c, or else you
        have written a prime with a superscript. Remember to include {'{and}'}{' '}
        when using multiple superscripts. Try a^
        {'{b ^ c}'} instead.
      </>
    ),
  },
  hint_double_subscript: {
    extraInfoURL: 'https://tex.stackexchange.com/search?q=Double%20subscript',
    formattedContent: () => (
      <>
        You have written a double subscript incorrectly as a_b_c. Remember to
        include {'{and}'} when using multiple subscripts. Try a_
        {'{b_c}'} instead.
      </>
    ),
  },
  hint_no_author_given: {
    extraInfoURL: 'https://tex.stackexchange.com/search?q=No%20%5Cauthor%20given',
    formattedContent: () => (
      <>
        You have used the \maketitle command, but have not specified any
        \author. To fix this, include an author in your preamble using the
        \author
        {'{…}'} command.
      </>
    ),
  },
  hint_somethings_wrong_perhaps_a_missing_item: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20Something's%20wrong--perhaps%20a%20missing%20%5Citem',
    formattedContent: () => (
      <>
        There are no entries found in a list you have created. Make sure you
        label list entries using the \item command, and that you have not used a
        list inside a table.
      </>
    ),
  },
  hint_misplaced_noalign: {
    extraInfoURL: 'https://tex.stackexchange.com/search?q=Misplaced%20%5Cnoalign',
    formattedContent: () => (
      <>
        You have used a \hline command in the wrong place, probably outside a
        table. If the \hline command is written inside a table, try including \\
        before it.
      </>
    ),
  },
  hint_no_line_here_to_end: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20There's%20no%20line%20here%20to%20end',
    formattedContent: () => (
      <>
        You have used a \\ or \newline command where LaTeX was not expecting
        one. Make sure that you only use line breaks after blocks of text, and
        be careful using linebreaks inside lists and other environments.
      </>
    ),
  },
  hint_verb_ended_by_end_of_line: {
    extraInfoURL:
      'https://tex.stackexchange.com/search?q=LaTeX%20Error%3A%20%5Cverb%20ended%20by%20end%20of%20line',
    formattedContent: () => (
      <>
        You have used a \verb command incorrectly. Try replacling the \verb
        command with \begin
        {'{verbatim}'}
        …\end
        {'{verbatim}'}
        .\
      </>
    ),
  },
  hint_illegal_unit_of_measure_pt_inserted: {
    extraInfoURL:
      '/learn)',
    formattedContent: () => (
      <>
        You have written a length, but have not specified the appropriate units
        (pt, mm, cm etc.). If you have not written a length, check that you have
        not witten a linebreak \\ followed by square brackets […] anywhere.
      </>
    ),
  },
  hint_extra_right: {
    extraInfoURL: 'https://tex.stackexchange.com/search?q=Extra%20%5Cright',
    formattedContent: () => (
      <>
        You have written a \right command without a corresponding \left command.
        Check that all \left and \right commands balance everywhere.
      </>
    ),
  },
  hint_missing_begin_document_: {
    extraInfoURL:
      '/learn',
    formattedContent: () => (
      <>
        No \begin
        {'{document}'} command was found. Make sure you have included \begin
        {'{document}'} in your preamble, and that your main document is set
        correctly.
      </>
    ),
  },
  hint_mismatched_environment2: {
    formattedContent: () => (
      <>
        You have used \begin
        {'{}'} without a corresponding \end
        {'{}'}.
      </>
    ),
  },
  hint_mismatched_environment3: {
    formattedContent: () => (
      <>
        You have used \begin
        {'{}'} without a corresponding \end
        {'{}'}.
      </>
    ),
  },
  hint_mismatched_environment4: {
    formattedContent: () => (
      <>
        You have used \begin
        {'{}'} without a corresponding \end
        {'{}'}.
      </>
    ),
  },
}

export const ruleIds = Object.keys(hints)

if (!getMeta('ol-wikiEnabled')) {
  Object.keys(hints).forEach(ruleId => {
    hints[ruleId].extraInfoURL = null
  })
}

export default hints
