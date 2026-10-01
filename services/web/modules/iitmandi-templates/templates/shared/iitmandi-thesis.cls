%% iitmandi-thesis.cls
%% Thesis and project report class for IIT Mandi (Indian Institute of Technology Mandi).
%%
%% Options:
%%   report      project report (DP, ISTP, MTP, M.Tech or M.Sc project) instead of a thesis
%%   twoside     two-sided printing (default: one-sided)
%%   cmfont      keep Computer Modern instead of Times
%%   draft, ...  any other option is passed to the standard report class
%%
%% The layout follows theses submitted at IIT Mandi: A4, 12 pt, 1.5 line spacing,
%% title page with the Institute logo, scholar's declaration and supervisor's
%% certificate. Confirm against the Academic Section's current guidelines before
%% submission; page geometry and spacing can be changed in one place below.
%%
%% Released under the LaTeX Project Public License 1.3c or later.

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{iitmandi-thesis}[2026/10/01 v1.0 IIT Mandi thesis and project report]

\newif\if@iitmreport
\newif\if@iitmcmfont
\DeclareOption{report}{\@iitmreporttrue}
\DeclareOption{cmfont}{\@iitmcmfonttrue}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{report}}
\ProcessOptions\relax

\LoadClass[12pt,a4paper]{report}

%% ---------------------------------------------------------------- layout
\RequirePackage[a4paper,left=30mm,right=25mm,top=25mm,bottom=25mm,
  headheight=15pt,footskip=12mm]{geometry}
\RequirePackage{setspace}
\setstretch{1.5}

% amsmath and amsthm must come before newtxmath.
\RequirePackage{amsmath}
\RequirePackage{amsthm}
\if@iitmcmfont
  \RequirePackage{lmodern}
  \RequirePackage{amssymb}
\else
  \RequirePackage{newtxtext}
  \RequirePackage{newtxmath}
  % newtxmath provides the AMS symbols; loading amssymb or amsfonts after it
  % fails, so treat them as loaded.
  \@namedef{ver@amssymb.sty}{2013/01/14 v3.01 (provided by newtxmath)}
  \@namedef{ver@amsfonts.sty}{2013/01/14 v3.01 (provided by newtxmath)}
\fi
\RequirePackage[T1]{fontenc}
\RequirePackage{graphicx}
\RequirePackage{xcolor}
\RequirePackage[nottoc]{tocbibind}
\RequirePackage{titlesec}
\RequirePackage{fancyhdr}
\RequirePackage{etoolbox}

\definecolor{iitmnavy}{HTML}{00237D}

%% Chapters: "Chapter 1" above a bold title, without the large standard gap.
\titleformat{\chapter}[display]
  {\normalfont\bfseries\centering}
  {\Large\chaptertitlename\ \thechapter}{8pt}{\LARGE}
\titleformat{name=\chapter,numberless}[display]
  {\normalfont\bfseries\centering}{}{0pt}{\LARGE}
\titlespacing*{\chapter}{0pt}{0pt}{24pt}
\titleformat*{\section}{\normalfont\large\bfseries}
\titleformat*{\subsection}{\normalfont\normalsize\bfseries}

%% Page numbers at the bottom centre; roman in the front matter.
\pagestyle{plain}
\newcommand{\frontmatter}{\cleardoublepage\pagenumbering{roman}}
\newcommand{\mainmatter}{\cleardoublepage\pagenumbering{arabic}}
\newcommand{\backmatter}{\cleardoublepage}

%% ---------------------------------------------------------------- metadata
\newcommand{\@enrolment}{}
\newcommand{\@degree}{Doctor of Philosophy}
\newcommand{\@discipline}{}
\newcommand{\@school}{School of Computing and Electrical Engineering}
\newcommand{\@schoolabbr}{}
\newcommand{\@course}{}
\newcommand{\@submitted}{\monthname\ \the\year}
\newcommand{\@supervisor}{}
\newcommand{\@supervisordesignation}{}
\newcommand{\@cosupervisor}{}
\newcommand{\@cosupervisordesignation}{}
\newcommand{\@declarant}{I}

\newcommand{\enrolment}[1]{\renewcommand{\@enrolment}{#1}}
\newcommand{\degree}[1]{\renewcommand{\@degree}{#1}}
\newcommand{\discipline}[1]{\renewcommand{\@discipline}{#1}}
\newcommand{\school}[2][]{\renewcommand{\@school}{#2}\renewcommand{\@schoolabbr}{#1}}
\newcommand{\course}[1]{\renewcommand{\@course}{#1}}
\newcommand{\submitted}[1]{\renewcommand{\@submitted}{#1}}
\newcommand{\supervisor}[2]{\renewcommand{\@supervisor}{#1}\renewcommand{\@supervisordesignation}{#2}}
\newcommand{\cosupervisor}[2]{\renewcommand{\@cosupervisor}{#1}\renewcommand{\@cosupervisordesignation}{#2}}
\newcommand{\declarant}[1]{\renewcommand{\@declarant}{#1}}

\newcommand{\monthname}{\ifcase\month\or January\or February\or March\or April\or May\or June\or
  July\or August\or September\or October\or November\or December\fi}

%% The author list inside a sentence: line breaks between team members become commas.
\newcommand{\iitm@inlineauthors}{{\def\\{, }\@author}}

\newcommand{\iitm@institute}{Indian Institute of Technology Mandi}
\newcommand{\iitm@address}{Kamand, Mandi, Himachal Pradesh 175075, India}
\newcommand{\iitm@logo}{iitmandi-logo}

\if@iitmreport
  \declarant{We}
\fi

%% ---------------------------------------------------------------- title page
\renewcommand{\maketitle}{%
  \begin{titlepage}
    \begin{center}
      \setstretch{1.15}
      {\LARGE\bfseries\@title\par}
      \vspace{10mm}
      \if@iitmreport
        {\large\itshape A Project Report\par}
        \vspace{6mm}
        {\normalsize\itshape submitted in partial fulfilment of the requirements of\par}
        \vspace{2mm}
        {\large\bfseries\@course\par}
        \vspace{8mm}
        {\normalsize\itshape by\par}
        \vspace{2mm}
        {\large\bfseries\@author\par}
      \else
        {\large\itshape A Thesis\par}
        \vspace{6mm}
        {\normalsize\itshape submitted in partial fulfilment of the requirements for the degree of\par}
        \vspace{3mm}
        {\large\bfseries\MakeUppercase{\@degree}\par}
        \ifx\@discipline\@empty\else
          \vspace{1mm}
          {\normalsize in \@discipline\par}
        \fi
        \vspace{8mm}
        {\normalsize\itshape by\par}
        \vspace{2mm}
        {\large\bfseries\@author\par}
        \ifx\@enrolment\@empty\else{\normalsize (\@enrolment)\par}\fi
      \fi
      \vspace{8mm}
      {\normalsize\itshape \if@iitmreport Under the guidance of\else Under the supervision of\fi\par}
      \vspace{2mm}
      {\large\bfseries\@supervisor\par}
      \ifx\@cosupervisor\@empty\else
        {\normalsize and\par}
        {\large\bfseries\@cosupervisor\par}
      \fi
      \vfill
      \includegraphics[width=42mm]{\iitm@logo}\par
      \vspace{8mm}
      {\normalsize\bfseries\MakeUppercase{\@school}%
        \ifx\@schoolabbr\@empty\else\ (\@schoolabbr)\fi\par}
      \vspace{1mm}
      {\large\bfseries INDIAN INSTITUTE OF TECHNOLOGY MANDI\par}
      \vspace{1mm}
      {\normalsize\bfseries\@submitted\par}
    \end{center}
  \end{titlepage}%
  \setcounter{page}{1}%
}

%% ---------------------------------------------------------------- signature blocks
\newcommand{\iitm@signature}[2]{%
  \begin{minipage}[t]{0.48\textwidth}
    \raggedright\setstretch{1.15}
    \vspace*{18mm}
    \rule{0.8\linewidth}{0.4pt}\\
    \textbf{#1}\\
    #2
  \end{minipage}}

\newcommand{\iitm@dateplace}{%
  \begin{minipage}[t]{0.48\textwidth}
    \raggedright\setstretch{1.15}
    \vspace*{18mm}
    Date:\\
    Place: IIT Mandi
  \end{minipage}}

%% Scholar's (or students') declaration.
\newcommand{\makedeclaration}{%
  \chapter*{Declaration}
  \addcontentsline{toc}{chapter}{Declaration}
  \noindent \@declarant\ hereby declare that the
  \if@iitmreport project report\else thesis\fi\ entitled
  \textbf{``\@title''} is the result of work carried out by
  \ifdefstring{\@declarant}{We}{us}{me} in the \@school,
  \iitm@institute, under the
  \if@iitmreport guidance\else supervision\fi\ of \@supervisor%
  \ifx\@cosupervisor\@empty\else\ and \@cosupervisor\fi.
  \if@iitmreport
    It has been submitted in partial fulfilment of the requirements of \@course.
  \fi
  This work has not been submitted elsewhere for the award of any degree or
  diploma. Wherever the work of others has been used, it has been
  acknowledged and cited.\par
  \vspace{6mm}
  \noindent\iitm@dateplace\hfill
  \iitm@signature{\@author}{%
    \ifx\@enrolment\@empty\else Enrolment No.\ \@enrolment\\\fi
    \@school\\ \iitm@institute}%
  \clearpage}

%% Supervisor's certificate.
\newcommand{\makecertificate}{%
  \chapter*{Certificate}
  \addcontentsline{toc}{chapter}{Certificate}
  \noindent This is to certify that the
  \if@iitmreport project report\else thesis\fi\ entitled
  \textbf{``\@title''}, submitted by \textbf{\iitm@inlineauthors}%
  \ifx\@enrolment\@empty\else\ (Enrolment No.\ \@enrolment)\fi\
  \if@iitmreport
    in partial fulfilment of the requirements of \@course,
  \else
    to the \iitm@institute\ for the award of the degree of \@degree,
  \fi
  is a record of work carried out under
  \ifx\@cosupervisor\@empty my\else our\fi\
  \if@iitmreport guidance\else supervision\fi\ in the \@school.
  To the best of \ifx\@cosupervisor\@empty my\else our\fi\ knowledge, the
  work has not been submitted elsewhere for the award of any degree or
  diploma\if@iitmreport\else, and it fulfils the requirements of the
  ordinance of the Institute for this degree\fi.\par
  \vspace{6mm}
  \noindent\iitm@dateplace\hfill
  \iitm@signature{\@supervisor}{\@supervisordesignation\\ \@school\\ \iitm@institute}%
  \ifx\@cosupervisor\@empty\else
    \par\noindent\hfill
    \iitm@signature{\@cosupervisor}{\@cosupervisordesignation\\ \iitm@institute}%
  \fi
  \clearpage}

%% ---------------------------------------------------------------- front matter pages
\newenvironment{frontchapter}[1]
  {\chapter*{#1}\addcontentsline{toc}{chapter}{#1}}
  {\clearpage}

\renewenvironment{abstract}
  {\begin{frontchapter}{Abstract}}
  {\end{frontchapter}}

\newenvironment{acknowledgements}
  {\begin{frontchapter}{Acknowledgements}}
  {\end{frontchapter}}

\newenvironment{dedication}
  {\clearpage\thispagestyle{empty}\vspace*{0.3\textheight}\begin{center}\itshape}
  {\end{center}\clearpage}

%% PDF metadata and links (loaded last, as hyperref expects).
\AtEndPreamble{%
  \RequirePackage[hidelinks]{hyperref}%
  % Line breaks between team members become commas in the PDF metadata.
  \pdfstringdefDisableCommands{\def\\{, }}%
  \hypersetup{pdftitle={\@title}, pdfauthor={\@author}}}

\endinput
