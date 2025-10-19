import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, BookmarkX, X as XIcon } from 'lucide-react';

interface EducationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMainOverlay?: () => void;
  onDetailPanelChange?: (isOpen: boolean) => void;
  onOverlayStateChange?: (state: 'main' | 'detail' | 'none') => void;
  onRequestCloseMainOverlay?: () => void;
  onLastDetailAnchorChange?: (anchor: string | null) => void;
  targetView?: 'main' | 'detail' | null;
}

type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
};

type Topic = {
  title: string;
  description: string;
  anchor: string;
  detail: string[];
  quiz: QuizQuestion[];
};

type QuizAnswerState = {
  selectedOptionIndex: number | null;
  isSubmitted: boolean;
};

type QuizState = {
  questionIndex: number;
  answers: QuizAnswerState[];
  isComplete: boolean;
};

type ResizeMode = 'both' | 'horizontal-left';

const topics: Topic[] = [
  {
    title: 'Introduction to Spreadsheets',
    description: 'How to read a spreadsheet and why we use them.',
    anchor: '#interpreting-data',
    detail: [
  `<h4 class="text-lg font-semibold text-blue-200">Introduction</h4>
   <p class="mt-2 text-sm text-slate-200">This module walks through the core elements of a spreadsheet so you can explain what the data shows without touching a calculator.</p>
   <p class="mt-3 text-sm text-slate-200"><a class="text-blue-300 underline" href="#" data-education-load-path="/education/interpreting-data-sample.csv" data-education-dataset-name="Interpreting Data Sample.csv">Load the sample CSV into Mango</a> to add it to your workspace instantly. It tracks monthly sales for the North and South regions plus a summary row.</p>
   <p class="mt-3 text-sm text-slate-200">If you prefer to upload manually, right-click anywhere on the canvas (or tap the plus button in the bottom-right corner) and choose Upload Dataset.</p>
   <p class="mt-3 text-sm text-slate-300">Keep the file visible while you read each page-we will reference the same rows throughout the lesson.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Understanding Spreadsheet Layout</h4>
<p class="mt-3 text-sm text-slate-200"> Open the dataset’s tab from the bottom canvas bar, or tap the plus button in the lower-right corner and choose “Current Data.”</p>
<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">

  <li>
    <strong>Rows</strong> describe individual records — each one holds all the details for a single case or observation. 
    For example, one row might represent a region’s results for a specific month.
  </li>
  <li>
    <strong>Columns</strong> define categories or measures such as <em>Sales</em>, <em>Units</em>, or <em>Returns</em>. 
    Each column tracks one type of information consistently down the page.
  </li>
  <li>
    <strong>Headers</strong> in the first row act like labels on a map — they tell you what each column means and give you the words to describe your data accurately.
  </li>
  <li>
    <strong>Context columns</strong> (like <em>Notes</em> or <em>Comments</em>) capture extra details that explain anomalies or special cases — for example, why a value might be zero or unusually high.
  </li>
  <li>
    <strong>Summary rows</strong> often appear at the bottom to total or average key figures. 
    These might use labels like <em>Total</em> or <em>All</em> to signal aggregation across the dataset. Other common labels include <em>Average</em>, <em>Subtotal</em>, or <em>Overall</em> — all summary statistics designed to give a quick overview of the data.
  </li>
</ul>

       <p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Describe what the spreadsheet is showing without performing calculations.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Why Use Spreadsheets?</h4>

<p class="mt-2 text-sm text-slate-200">
  Spreadsheets turn raw numbers into patterns you can <em>see</em> and questions you can <em>ask</em>.  
  Let’s look at our sample table of <code>month</code>, <code>region</code>, <code>sales</code>, <code>units</code>, and <code>returns</code>.
</p>

<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>
    <strong>See structure instantly:</strong> Each column defines a category — months, regions, performance — so your data stays organized and comparable.
  </li>
  <li>
    <strong>Spot patterns visually:</strong> Rows and columns make it easy to notice things like “South region drops to zero in February” or “March shows recovery.”
  </li>
  <li>
    <strong>Ask better questions:</strong> How do returns compare across regions? Is sales growth consistent month to month? What drives outliers?
  </li>
  <li>
    <strong>Connect to bigger tools:</strong> Clean spreadsheet data can feed directly into charts, dashboards, or analysis notebooks — no retyping required.
  </li>
</ul>

<p class="mt-3 text-sm text-slate-200">
  Behind every dashboard or model, there’s usually a spreadsheet that helped test the first idea.  
  Learning to <strong>read and interpret</strong> tables like this builds the foundation for data analysis everywhere else.
</p>
       <p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Recognize spreadsheets as a launchpad for deeper analysis and collaboration.</p>`
    ],
    quiz: [
      {
        question: 'In the sample CSV, what label appears in the Month column for the row that summarizes the entire sheet?',
        options: [
          'Total',
          'Summary',
          'All Months',
          'Average'
        ],
  answerIndex: 0,
  explanation: 'The summary row switches the Month column to "Total" and the Region column to "All," signaling aggregation.'
      },
      {
        question: 'Why are February South Sales recorded as 0 in the sample spreadsheet?',
        options: [
          'The launch was delayed, as noted in the Notes column',
          'The worksheet filtered that row out of calculations',
          'Sales were not tracked in February for any region',
          'Values under 1 automatically round down to 0'
        ],
  answerIndex: 0,
  explanation: 'The Notes column states "Launch delayed," which explains the zero values across Sales, Units, and Returns.'
      },
      {
        question: 'Which column in the sample CSV adds qualitative context about each row?',
        options: [
          'Notes',
          'Units',
          'Region',
          'Sales'
        ],
  answerIndex: 0,
  explanation: 'The Notes column stores comments such as "Launch delayed" that explain the numeric values.'
      },
      {
        question: 'In the sample CSV, which month and region combination has the highest sales value?',
        options: [
          'March South',
          'March North',
          'January South',
          'February North'
        ],
  answerIndex: 0,
  explanation: 'March South records 55,000 in sales, which is the highest figure in the table.'
      }
    ]
  },
  {
    title: 'Data Cleaning Basics',
    description: 'Identify missing values, outliers, and malformed records.',
    anchor: '#data-cleaning-basics',
    detail: [
      `<h4 class="text-lg font-semibold text-blue-200">Why Data Cleaning Matters</h4>

<p class="mt-2 text-sm text-slate-200">
  Raw data rarely arrives ready for analysis. Typos, blanks, and mismatched totals can sneak in — 
  and every chart or model you build will inherit those mistakes unless you clean first.
</p>

<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li><strong>Validate before you visualize:</strong> Confirm that the numbers make sense before summarizing or automating.</li>
  <li><strong>Prep like a chef:</strong> Data cleaning is your <em>mise en place</em> — prepare the ingredients now to avoid chaos later.</li>
  <li><strong>Build team trust:</strong> Documented fixes and clear methods make your analysis reproducible and reliable.</li>
</ul>

</ul>
<p class="mt-3 text-sm text-slate-200"><a class="text-blue-300 underline" href="#" data-education-load-path="/education/interpreting-data-sample.csv" data-education-dataset-name="Interpreting Data Sample.csv">Load the sample CSV</a> (or reopen its dataset tab from the bottom canvas bar [it's the same dataset as the last lesson]) so you can spot issues as you read.</p>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Clean data = trustworthy insights.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Spotting Missing Values</h4>
<p class="mt-2 text-sm text-slate-200">Missing data hides behind blanks, strings like <code>N/A</code>, zeros, or even em dashes. Scan for them intentionally.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Filter each column to the blank state and note which fields lose coverage.</li>
  <li>Check patterns: are whole columns empty, or do certain regions/months go missing?</li>
  <li>Use conditional formatting or quick summary stats to highlight gaps in bulk.</li>
</ul>
<p class="mt-3 text-sm text-slate-200"><strong>For example:</strong> In the sample CSV, the January South row lacks a note, so documenting “context missing” keeps teammates aware.</p>
<p class="mt-3 text-sm text-slate-200">Need another view? Click the dataset tab in the bottom canvas bar or tap the plus button in the lower-right corner, then choose “Add Existing Dataset” to reopen the table.</p>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Identify and log what’s missing before you fill or drop anything.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Understanding Outliers</h4>
<p class="mt-2 text-sm text-slate-200">Outliers live far from the pack. They can signal data entry errors—or the most important story in the sheet.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Sort numerically to spot sudden jumps (like a spike in sales or returns).</li>
  <li>Compare against peer rows: does one region or month suddenly hit zero or 10× the usual value?</li>
  <li>Pair quick visual checks—sparklines, scatterplots, min/max summaries—with narrative context.</li>
</ul>
<p class="mt-3 text-sm text-slate-200"><strong>For example:</strong> February South drops to zero in every metric. That might be a valid pause (see the Notes column) or a missing upload worth confirming.</p>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Treat outliers as questions, not automatic deletions.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Catching Malformed Records</h4>
<p class="mt-2 text-sm text-slate-200">Formatting issues block downstream tools even when values look “fine.” Make consistency part of cleaning.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Align date formats (ISO, month abbreviations, etc.) before exporting to other systems.</li>
  <li>Strip symbols from numeric fields so <code>$45,000</code> becomes <code>45000</code>.</li>
  <li>Standardize categories: “North” and “north” should not coexist.</li>
  <li>Watch for summary rows like “Total” that mix data types in the same column.</li>
</ul>
<p class="mt-3 text-sm text-slate-200"><strong>For example:</strong> The “Total” row in our sample CSV aggregates months and regions; tag or move it so charting tools don’t mistake it for another record.</p>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Consistency makes data reusable and automation-friendly.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Simple Cleaning Strategies</h4>
<p class="mt-2 text-sm text-slate-200">Choose tactics deliberately and leave an audit trail.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li><strong>Remove:</strong> Drop empty or duplicate rows when they add no signal.</li>
  <li><strong>Repair:</strong> Fill missing values with grouped medians, means, or generic placeholders (like 0).</li>
  <li><strong>Replace:</strong> Normalize text (“N/A” → blank) so filters and joins behave.</li>
  <li><strong>Review:</strong> Re-run summaries to confirm the meaning stayed intact.</li>
</ul>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Every cleaning step should be explainable and reversible.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Try data cleaning yourself!</h4>
<p class="mt-2 text-sm text-slate-200">Put the concepts to work immediately.</p>





<!-- ADD LATER -->




<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Learning to see dirty data is the first step to cleaning it.</p>`
    ],
    quiz: [
      {
        question: 'While scanning the sample CSV for missing data, which field immediately signals follow-up?',
        options: [
          'The blank Notes cell for January South',
          'The Sales value of 49,000 in March North',
          'The Units count of 200 in January South',
          'The Returns total of 5 in March South'
        ],
        answerIndex: 0,
        explanation: 'A missing note is easy to overlook but affects how teammates interpret the row, so it should be documented.'
      },
      {
        question: 'Which pattern best fits the definition of an outlier in the Interpreting Data sample?',
        options: [
          'February South dropping to zero across every metric',
          'March North increasing by 5,000 in sales',
          'January North having 180 units',
          'Returns holding between 4 and 6 each month'
        ],
        answerIndex: 0,
        explanation: 'The across-the-board zero warrants investigation—it could be a true pause or missing data.'
      },
      {
        question: 'What makes the “Total / All” row a candidate for special handling during cleaning?',
        options: [
          'It mixes aggregated labels with regular records',
          'It contains negative numbers',
          'It repeats the March North values',
          'It is already filtered out by default'
        ],
        answerIndex: 0,
        explanation: 'Summary rows need tagging or relocation so analytics tools do not treat them as standard observations.'
      },
      {
        question: 'Why should cleaning steps be logged after you adjust the sample dataset?',
        options: [
          'Documented changes help others trust and reproduce the analysis',
          'Notes automatically delete rows with missing values',
          'Logging steps cancels the need for validation',
          'Documentation forces you to rebuild the dataset from scratch'
        ],
        answerIndex: 0,
        explanation: 'Sharing what changed—and why—keeps collaborators aligned and the dataset auditable.'
      },
      {
        question: 'You discover multiple blanks in the Notes column—what is the best next step before removing those rows?',
        options: [
          'Review the surrounding context and confirm whether the information can be recovered',
          'Delete the rows immediately so charts stay clean',
          'Replace every blank with the word "Unknown" without checking the source',
          'Ignore the blanks because the numeric columns are filled'
        ],
        answerIndex: 0,
        explanation: 'Investigating context first preserves useful records and helps decide whether to impute, annotate, or drop.'
      },
      {
        question: 'Within the Remove-Repair-Replace-Review workflow, which action is an example of the Replace step for the sample CSV?',
        options: [
          'Converting any "N/A" strings in Notes to blank values before analysis',
          'Dropping the February South row because it contains zeros',
          'Duplicating the dataset tab to preserve the raw import',
          'Averaging Sales across months to fill all empty cells'
        ],
        answerIndex: 0,
        explanation: 'Replace focuses on standardizing inconsistent text—turning placeholder strings like "N/A" into true blanks keeps filters and joins reliable.'
      }
    ]
  },
  {
    title: 'Advanced Data Cleaning',
    description: 'Use targeted imputations, normalization, and rule-based corrections.',
    anchor: '#advanced-data-cleaning',
    detail: [
      'Match imputation strategies to feature semantics. Numerical fields might use grouped medians, while categorical fields benefit from most-frequent values per segment.',
      'Layer deterministic rules (regex validation, range checks) ahead of statistical imputations so obvious data errors never get averaged into your model inputs.'
    ],
    quiz: [
      {
        question: 'Why should deterministic rules come before statistical imputations?',
        options: [
          'They prevent obvious errors from influencing averaged imputations',
          'They make the pipeline intentionally slower',
          'They allow you to skip documenting data changes'
        ],
        answerIndex: 0,
        explanation: 'Cleaning with deterministic checks first keeps corrupt values out of downstream imputations.'
      },
      {
        question: 'Which approach keeps numeric features comparable when they span different scales?',
        options: [
          'Applying normalization or standardization that matches feature semantics',
          'Leaving raw magnitudes intact so larger numbers dominate models',
          'Rounding every value to the nearest integer before training'
        ],
        answerIndex: 0,
        explanation: 'Thoughtful scaling preserves relationships while preventing any feature from overpowering the rest.'
      }
    ]
  },
  {
    title: 'Exploratory Data Analysis',
    description: 'Summaries, visual patterns, and statistical intuition.',
    anchor: '#exploratory-data-analysis',
    detail: [
      'Pair quick aggregate tables with distribution plots. Seeing both the mean and the shape of the data keeps you from overlooking skew.',
      'Iteratively slice data by key dimensions (time, geography, customer segment) to locate hidden variability that impacts downstream models.'
    ],
    quiz: [
      {
        question: 'What visual should accompany aggregate tables to avoid missing skew?',
        options: [
          'Distribution plots',
          'A random color palette',
          'A list of font sizes'
        ],
        answerIndex: 0,
        explanation: 'Distributions paired with aggregates reveal hidden skew and shape.'
      },
      {
        question: 'Why do analysts slice data by segments like time or geography?',
        options: [
          'To uncover variability that disappears in overall summaries',
          'To inflate the number of charts in a presentation',
          'To avoid comparing metrics between different cohorts'
        ],
        answerIndex: 0,
        explanation: 'Segmenting surfaces differences that can change conclusions or next steps.'
      }
    ]
  },
  {
    title: 'Interpreting Graphs',
    description: 'Read scales, distributions, and context clues to avoid misinterpretation.',
    anchor: '#interpreting-graphs',
    detail: [
      'Always note the axes, units, and scale breaks. A truncated y-axis can make minor changes feel dramatic unless you check the full range.',
      'Look for annotations or confidence bands that explain uncertainty. Missing context often signals that more exploration is needed before drawing conclusions.'
    ],
    quiz: [
      {
        question: 'What should you inspect first to avoid misreading a graph?',
        options: [
          'Axes, units, and scale breaks',
          'The thickness of the chart border',
          'Whether labels use uppercase letters'
        ],
        answerIndex: 0,
        explanation: 'Axes and scaling decisions heavily influence how changes appear.'
      },
      {
        question: 'How do annotations or confidence bands help interpret a chart?',
        options: [
          'They explain uncertainty and highlight context that might change your takeaway',
          'They clutter the view with unnecessary shapes',
          'They guarantee the numbers are statistically significant'
        ],
        answerIndex: 0,
        explanation: 'Context callouts keep you honest about the reliability of what you are seeing.'
      }
    ]
  },
  {
    title: 'How to Graph Data',
    description: 'Choose chart types, map variables, and set encodings that reveal insight.',
    anchor: '#how-to-graph-data',
    detail: [
      'Map each variable to an encoding (position, color, size) that matches how you want viewers to compare values. Avoid double-encoding unless it adds clarity.',
      'Prototype multiple chart types quickly. A scatter might highlight correlation while a line chart clarifies evolution over time.'
    ],
    quiz: [
      {
        question: 'What should drive your choice of chart encodings?',
        options: [
          'How you want viewers to compare values',
          'The most vibrant palette in your toolkit',
          'Whatever chart type comes first alphabetically'
        ],
        answerIndex: 0,
        explanation: 'Encodings are most effective when they reinforce the intended comparison.'
      },
      {
        question: 'Why prototype multiple chart types early in the design process?',
        options: [
          'Different visuals can surface relationships that one chart alone might hide',
          'Stakeholders expect every dataset to use at least five charts',
          'Switching chart types automatically fixes data quality problems'
        ],
        answerIndex: 0,
        explanation: 'Trying several views quickly reveals which framing best communicates the pattern.'
      }
    ]
  },
  {
    title: 'Trend Analysis',
    description: 'Detect seasonality, correlation shifts, and meaningful changes over time.',
    anchor: '#trend-analysis',
    detail: [
      'Decompose time series into trend, seasonal, and residual components to understand the forces driving change.',
      'Use windowed statistics (rolling averages, rolling correlation) to observe structural breaks that merit deeper investigation.'
    ],
    quiz: [
      {
        question: 'Which technique separates seasonal effects from overall change?',
        options: [
          'Time-series decomposition',
          'Randomly shuffling rows',
          'Dropping all missing values without review'
        ],
        answerIndex: 0,
        explanation: 'Decomposition isolates trend, seasonality, and residual components.'
      },
      {
        question: 'What insight do rolling averages provide when monitoring a metric?',
        options: [
          'They smooth short-term noise so you can spot directional shifts',
          'They automatically predict future revenue',
          'They eliminate the need for any anomaly investigation'
        ],
        answerIndex: 0,
        explanation: 'Windowed metrics reveal gradual movements that raw points can obscure.'
      }
    ]
  },
  {
    title: 'Feature Engineering',
    description: 'Transform raw inputs into model-ready features.',
    anchor: '#feature-engineering',
    detail: [
      'Generate interaction features deliberately. Multiplying or concatenating columns can capture non-linear patterns, but only keep what improves validation metrics.',
      'Track feature provenance so you can reproduce training data later. Notebook snippets and pipeline code should align.'
    ],
    quiz: [
      {
        question: 'Why is tracking feature provenance important?',
        options: [
          'It ensures you can reproduce training data later',
          'It allows you to ignore validation metrics entirely',
          'It automatically reduces the total number of columns'
        ],
        answerIndex: 0,
        explanation: 'Documented provenance keeps feature creation reproducible.'
      },
      {
        question: 'How do validation experiments guide whether to keep a new feature?',
        options: [
          'They show if the feature improves holdout performance without overfitting',
          'They guarantee training accuracy reaches 100%',
          'They let you skip monitoring models after deployment'
        ],
        answerIndex: 0,
        explanation: 'Evaluating features against real metrics ensures additions earn their place.'
      }
    ]
  },
  {
    title: 'Model Evaluation',
    description: 'Understand metrics, validation splits, and fairness checks.',
    anchor: '#model-evaluation',
    detail: [
      'Align evaluation metrics with business objectives. Accuracy might look great even when recall is too low for critical alerts.',
      'Inspect confusion matrices or residual plots per subgroup to flag fairness or calibration issues early.'
    ],
    quiz: [
      {
        question: 'Why should evaluation metrics align with business objectives?',
        options: [
          'Different metrics highlight different failure modes that matter to the business',
          'Accuracy alone always captures every risk',
          'Alignment lets you skip fairness reviews'
        ],
        answerIndex: 0,
        explanation: 'Choosing the right metric keeps focus on the outcomes that matter most.'
      },
      {
        question: 'What does a confusion matrix help you uncover in classification models?',
        options: [
          'Which classes are being mistaken for one another',
          'How to automatically rebalance your dataset',
          'Whether feature engineering is still required'
        ],
        answerIndex: 0,
        explanation: 'Breakdowns by predicted vs. actual class reveal the kinds of errors the model makes.'
      }
    ]
  },
  {
    title: 'Making Dashboards',
    description: 'Combine charts with narrative context for decision-ready stories.',
    anchor: '#making-dashboards',
    detail: [
      'Arrange panels to guide readers from overview to detail. Start with a summary insight, then provide supporting evidence in adjacent panels.',
      'Use consistent color palettes and typography across widgets so the dashboard feels cohesive and easy to scan.'
    ],
    quiz: [
      {
        question: 'How can a dashboard guide readers from overview to detail?',
        options: [
          'Place summary insight panels before supporting evidence',
          'Randomize widget positions on every load',
          'Sort charts alphabetically by title'
        ],
        answerIndex: 0,
        explanation: 'Leading with summaries frames the story before deep-dives.'
      },
      {
        question: 'Why should dashboards reuse a consistent color palette and typography?',
        options: [
          'Consistency keeps attention on the data instead of styling differences',
          'Matching colors automatically enforces access controls',
          'Viewers expect each panel to look completely unique'
        ],
        answerIndex: 0,
        explanation: 'Familiar visuals reduce cognitive load so insights are easier to scan.'
      }
    ]
  },
  {
    title: 'Connecting Visualizations',
    description: 'Link charts so interactions reveal multi-dimensional relationships.',
    anchor: '#connecting-visualizations',
    detail: [
      'Coordinate selections between charts using shared keys. Highlighted subsets in one view should update related visuals instantly.',
      'Provide clear reset controls and legends so viewers always understand what filters are active across the connected experience.'
    ],
    quiz: [
      {
        question: 'What keeps linked visualizations understandable for viewers?',
        options: [
          'Coordinated selections with clear reset controls',
          'Hiding filter states across all charts',
          'Updating only one chart at a time'
        ],
        answerIndex: 0,
        explanation: 'Shared selections plus resets make cross-filtering transparent.'
      },
      {
        question: 'Why should interactive dashboards include a legend for highlighted subsets?',
        options: [
          'It explains what the highlight represents across every linked view',
          'It hides the fact that multiple filters are active',
          'It removes the need for descriptive chart titles'
        ],
        answerIndex: 0,
        explanation: 'Clear legends show people exactly which slice of data is currently emphasized.'
      }
    ]
  },
  {
    title: 'Collaboration Workflows',
    description: 'Share data stories and iterate on experiments.',
    anchor: '#collaboration-workflows',
    detail: [
      'Share workspace snapshots or exported reports so teammates can retrace your steps and contribute new ideas.',
      'Document decisions inside the platform. Comments attached to panels prevent context from being lost in chat threads.'
    ],
    quiz: [
      {
        question: 'Why attach comments directly to panels?',
        options: [
          'They keep context with the data story for teammates',
          'They replace the need for any other documentation',
          'They prevent teammates from sharing feedback'
        ],
        answerIndex: 0,
        explanation: 'Embedded comments preserve context alongside the analysis.'
      },
      {
        question: 'How do shared workspace snapshots help a project move faster?',
        options: [
          'They let teammates retrace steps and build from identical state',
          'They replace the need for code review',
          'They ensure only one person works on the analysis at a time'
        ],
        answerIndex: 0,
        explanation: 'Snapshots provide a reproducible baseline so collaboration stays in sync.'
      }
    ]
  }
];

function shuffleArray<T>(input: T[]): T[] {
  const array = [...input];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

const shuffleQuizQuestions = (quiz: QuizQuestion[]): QuizQuestion[] => {
  return quiz.map((question) => {
    const shuffledOptions = shuffleArray(
      question.options.map((option, optionIndex) => ({ option, optionIndex }))
    );
    const answerIndex = shuffledOptions.findIndex(({ optionIndex }) => optionIndex === question.answerIndex);

    return {
      ...question,
      options: shuffledOptions.map(({ option }) => option),
      answerIndex: answerIndex >= 0 ? answerIndex : 0
    };
  });
};

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-7.01 7.01a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414l2.293 2.293 6.303-6.303a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

const CompletedBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 border border-slate-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
    <CheckIcon className="h-3 w-3" />
  </span>
);

const clamp = (value: number, min: number, max: number) => {
  if (max < min) {
    return max;
  }

  return Math.min(Math.max(value, min), max);
};

const DEFAULT_DETAIL_SIZE = { width: 420, height: 560 } as const;
const DETAIL_MIN_WIDTH = 320;
const DETAIL_MIN_HEIGHT = 260;
const DETAIL_MARGIN = 16;

const createDefaultQuizState = (totalQuestions: number): QuizState => ({
  questionIndex: 0,
  answers: Array.from({ length: Math.max(totalQuestions, 0) }, () => ({
    selectedOptionIndex: null,
    isSubmitted: false
  })),
  isComplete: false
});

const ensureQuizStateSize = (state: QuizState | undefined, totalQuestions: number): QuizState => {
  if (!state) {
    return createDefaultQuizState(totalQuestions);
  }

  const safeLength = Math.max(totalQuestions, 0);

  if (state.answers.length === safeLength) {
    const safeQuestionIndex = Math.min(state.questionIndex, Math.max(safeLength - 1, 0));
    const computedComplete = safeLength > 0 ? state.answers.every((answer) => answer.isSubmitted) : false;

    if (safeQuestionIndex === state.questionIndex && computedComplete === state.isComplete) {
      return state;
    }

    return {
      questionIndex: safeQuestionIndex,
      answers: state.answers,
      isComplete: computedComplete
    };
  }

  const answers = Array.from({ length: safeLength }, (_, index) => {
    const existingAnswer = state.answers[index];
    return existingAnswer ?? { selectedOptionIndex: null, isSubmitted: false };
  });

  const safeQuestionIndex = Math.min(state.questionIndex, Math.max(safeLength - 1, 0));
  const computedComplete = safeLength > 0 ? answers.every((answer) => answer.isSubmitted) : false;

  return {
    questionIndex: safeQuestionIndex,
    answers,
    isComplete: computedComplete
  };
};

const EducationOverlay: React.FC<EducationOverlayProps> = ({
  isOpen,
  onClose,
  onOpenMainOverlay,
  onDetailPanelChange,
  onOverlayStateChange,
  onRequestCloseMainOverlay,
  onLastDetailAnchorChange,
  targetView
}) => {
  const [bookmarkedAnchors, setBookmarkedAnchors] = useState<string[]>([]);
  const [selectedTopicAnchor, setSelectedTopicAnchor] = useState<string | null>(null);
  const [completedAnchors, setCompletedAnchors] = useState<string[]>([]);
  const [lastSelectedTopicAnchor, setLastSelectedTopicAnchor] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ x: number; y: number } | null>(null);
  const [detailSize, setDetailSize] = useState<{ width: number; height: number } | null>(null);
  const [detailPageIndex, setDetailPageIndex] = useState(0);
  const [detailTab, setDetailTab] = useState<'content' | 'quiz'>('content');
  const [quizState, setQuizState] = useState<Record<string, QuizState>>({});
  const [shuffledQuizzes, setShuffledQuizzes] = useState<Record<string, QuizQuestion[]>>({});
  const detailRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeState = useRef<
    {
      startWidth: number;
      startHeight: number;
      startX: number;
      startY: number;
      startLeft: number;
      mode: ResizeMode;
    } | null
  >(null);

  const bookmarkedTopics = useMemo(
    () => topics.filter((topic) => bookmarkedAnchors.includes(topic.anchor)),
    [bookmarkedAnchors]
  );

  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    topics.forEach((topic) => map.set(topic.anchor, topic));
    return map;
  }, []);

  const selectedTopic = selectedTopicAnchor ? topicMap.get(selectedTopicAnchor) : undefined;
  const iconButtonClasses = 'inline-flex h-8 w-8 items-center justify-center border border-blue-400 text-blue-200 transition hover:bg-blue-600 hover:text-white';

  const computeDefaultDetailSize = useCallback((): { width: number; height: number } => {
    if (typeof window === 'undefined') {
      return { width: DEFAULT_DETAIL_SIZE.width, height: DEFAULT_DETAIL_SIZE.height };
    }

    const availableWidth = Math.max(window.innerWidth - DETAIL_MARGIN * 2, 120);
    const availableHeight = Math.max(window.innerHeight - DETAIL_MARGIN * 2, DETAIL_MIN_HEIGHT);

    return {
      width: Math.min(DEFAULT_DETAIL_SIZE.width, availableWidth),
      height: availableHeight
    };
  }, []);

  const isTopicCompleted = useCallback(
    (anchor: string) => completedAnchors.includes(anchor),
    [completedAnchors]
  );

  useEffect(() => {
    onDetailPanelChange?.(Boolean(selectedTopic));
  }, [selectedTopic, onDetailPanelChange]);

  useEffect(() => {
    if (selectedTopic) {
      onOverlayStateChange?.('detail');
    } else if (isOpen) {
      onOverlayStateChange?.('main');
    } else {
      onOverlayStateChange?.('none');
    }
  }, [selectedTopic, isOpen, onOverlayStateChange]);

  useEffect(() => {
    if (!selectedTopicAnchor) {
      return;
    }

    setDetailPageIndex(0);
    setDetailTab('content');
  }, [selectedTopicAnchor]);

  useEffect(() => {
    if (selectedTopic && detailRef.current) {
      detailRef.current.focus();
    }
  }, [selectedTopic]);

  useEffect(() => {
    if (!selectedTopic) {
      return;
    }

    setDetailPageIndex((prev) => {
      const maxIndex = Math.max(0, selectedTopic.detail.length - 1);
      const nextIndex = clamp(prev, 0, maxIndex);
      return nextIndex === prev ? prev : nextIndex;
    });
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic && typeof window !== 'undefined') {
      if (detailSize === null) {
        setDetailSize(computeDefaultDetailSize());
      }

      if (detailPosition === null) {
        const width = detailSize?.width ?? computeDefaultDetailSize().width;
        const defaultX = Math.max(DETAIL_MARGIN, window.innerWidth - width - DETAIL_MARGIN);
        setDetailPosition({ x: defaultX, y: DETAIL_MARGIN });
      }
    }

    if (!selectedTopic && detailPosition !== null) {
      setDetailPosition(null);
    }
    if (!selectedTopic && detailSize !== null) {
      setDetailSize(null);
    }
  }, [selectedTopic, detailPosition, detailSize, computeDefaultDetailSize]);

  useEffect(() => {
    if (!selectedTopic) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(viewportWidth - DETAIL_MARGIN * 2, 120);
  const availableHeight = Math.max(viewportHeight - DETAIL_MARGIN * 2, DETAIL_MIN_HEIGHT);

      setDetailSize((prev) => {
        if (!prev) {
          return prev;
        }

        const nextWidth = Math.min(prev.width, availableWidth);
        const nextHeight = Math.min(prev.height, availableHeight);

        if (nextWidth === prev.width && nextHeight === prev.height) {
          return prev;
        }

        return { width: nextWidth, height: nextHeight };
      });

      setDetailPosition((prev) => {
        const width = detailRef.current?.offsetWidth
          ?? Math.min(detailSize?.width ?? DEFAULT_DETAIL_SIZE.width, availableWidth);
        const height = detailRef.current?.offsetHeight
          ?? Math.min(detailSize?.height ?? DEFAULT_DETAIL_SIZE.height, availableHeight);
        const maxX = Math.max(DETAIL_MARGIN, viewportWidth - width - DETAIL_MARGIN);
        const maxY = Math.max(DETAIL_MARGIN, viewportHeight - height - DETAIL_MARGIN);
        const baseX = prev?.x ?? Math.max(DETAIL_MARGIN, viewportWidth - width - DETAIL_MARGIN);
        const baseY = prev?.y ?? DETAIL_MARGIN;
        const nextX = clamp(baseX, DETAIL_MARGIN, maxX);
        const nextY = clamp(baseY, DETAIL_MARGIN, maxY);

        if (prev && prev.x === nextX && prev.y === nextY) {
          return prev;
        }

        return { x: nextX, y: nextY };
      });
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [selectedTopic, detailSize]);

  useEffect(() => {
    onLastDetailAnchorChange?.(lastSelectedTopicAnchor);
  }, [lastSelectedTopicAnchor, onLastDetailAnchorChange]);

  useEffect(() => {
    if (!targetView) {
      return;
    }

    if (targetView === 'main') {
      if (!isOpen) {
        onOpenMainOverlay?.();
      }
    } else if (targetView === 'detail') {
      if (lastSelectedTopicAnchor) {
        setSelectedTopicAnchor(lastSelectedTopicAnchor);
      } else if (!isOpen) {
        onOpenMainOverlay?.();
      }
    }
  }, [targetView, isOpen, onOpenMainOverlay, lastSelectedTopicAnchor]);

  const handleBookmarkToggle = (anchor: string) => {
    setBookmarkedAnchors((prev) => (
      prev.includes(anchor) ? prev.filter((value) => value !== anchor) : [...prev, anchor]
    ));
  };

  const handleRemoveBookmark = (anchor: string) => {
    setBookmarkedAnchors((prev) => prev.filter((value) => value !== anchor));
    if (selectedTopicAnchor === anchor) {
      setSelectedTopicAnchor(null);
    }
  };

  const handleLearn = (anchor: string) => {
    setShuffledQuizzes((prev) => {
      if (!prev[anchor]) {
        return prev;
      }
      const next = { ...prev };
      delete next[anchor];
      return next;
    });
    setQuizState((prev) => {
      if (!prev[anchor]) {
        return prev;
      }
      const next = { ...prev };
      delete next[anchor];
      return next;
    });
    setDetailTab('content');
    setDetailPageIndex(0);
    setDetailSize(null);
    setDetailPosition(null);
    setSelectedTopicAnchor(anchor);
    setLastSelectedTopicAnchor(anchor);
    onRequestCloseMainOverlay?.();
  };

  const handleCloseDetail = () => {
    setDetailTab('content');
    setDetailSize(null);
    setDetailPosition(null);
    setSelectedTopicAnchor(null);
  };

  const handleMarkComplete = (anchor: string) => {
    setCompletedAnchors((prev) => (
      prev.includes(anchor) ? prev : [...prev, anchor]
    ));
  };

  const handleMarkIncomplete = (anchor: string) => {
    setCompletedAnchors((prev) => prev.filter((value) => value !== anchor));
  };

  const updateQuizState = useCallback(
    (anchor: string, totalQuestions: number, updater: (prev: QuizState) => QuizState) => {
      setQuizState((prev) => {
        const previous = ensureQuizStateSize(prev[anchor], totalQuestions);
        const nextState = updater(previous);
        return {
          ...prev,
          [anchor]: ensureQuizStateSize(nextState, totalQuestions)
        };
      });
    },
    []
  );

  const handleDetailTabChange = useCallback(
    (tab: 'content' | 'quiz') => {
      if (!selectedTopic) {
        return;
      }

      if (tab === 'quiz') {
        setShuffledQuizzes((prev) => {
          if (prev[selectedTopic.anchor]) {
            return prev;
          }
          return {
            ...prev,
            [selectedTopic.anchor]: shuffleQuizQuestions(selectedTopic.quiz)
          };
        });
        setQuizState((prev) => {
          const totalQuestions = selectedTopic.quiz.length;
          const existing = prev[selectedTopic.anchor];
          const ensured = ensureQuizStateSize(existing, totalQuestions);

          if (existing === ensured) {
            return prev;
          }

          return {
            ...prev,
            [selectedTopic.anchor]: ensured
          };
        });
      }

      setDetailTab(tab);
    },
    [selectedTopic]
  );

  const handleQuizOptionChange = useCallback(
    (anchor: string, optionIndex: number, totalQuestions: number) => {
      updateQuizState(anchor, totalQuestions, (prev) => {
        if (!prev.answers.length) {
          return prev;
        }

        const answers = prev.answers.map((answer, index) => (
          index === prev.questionIndex
            ? {
                selectedOptionIndex: optionIndex,
                isSubmitted: false
              }
            : answer
        ));

        const isComplete = answers.length > 0 && answers.every((answer) => answer.isSubmitted);

        return {
          ...prev,
          answers,
          isComplete
        };
      });
    },
    [updateQuizState]
  );

  const handleQuizSubmit = useCallback(
    (anchor: string, totalQuestions: number) => {
      updateQuizState(anchor, totalQuestions, (prev) => {
        if (!prev.answers.length) {
          return prev;
        }

        const currentAnswer = prev.answers[prev.questionIndex];
        if (!currentAnswer || currentAnswer.selectedOptionIndex === null) {
          return prev;
        }

        const answers = prev.answers.map((answer, index) => (
          index === prev.questionIndex
            ? {
                ...answer,
                isSubmitted: true
              }
            : answer
        ));

        const isComplete = answers.length > 0 && answers.every((answer) => answer.isSubmitted);

        return {
          ...prev,
          answers,
          isComplete
        };
      });
    },
    [updateQuizState]
  );

  const handleQuizNextQuestion = useCallback(
    (anchor: string, totalQuestions: number) => {
      updateQuizState(anchor, totalQuestions, (prev) => {
        if (!prev.answers.length) {
          return prev;
        }

        const nextIndex = Math.min(totalQuestions - 1, prev.questionIndex + 1);
        if (nextIndex === prev.questionIndex) {
          return prev;
        }

        return {
          ...prev,
          questionIndex: nextIndex
        };
      });
    },
    [updateQuizState]
  );

  const handleQuizPreviousQuestion = useCallback(
    (anchor: string, totalQuestions: number) => {
      updateQuizState(anchor, totalQuestions, (prev) => {
        if (!prev.answers.length) {
          return prev;
        }

        const previousIndex = Math.max(0, prev.questionIndex - 1);
        if (previousIndex === prev.questionIndex) {
          return prev;
        }

        return {
          ...prev,
          questionIndex: previousIndex
        };
      });
    },
    [updateQuizState]
  );

  const handleQuizRestart = useCallback(
    (anchor: string, totalQuestions: number) => {
      setQuizState((prev) => ({
        ...prev,
        [anchor]: createDefaultQuizState(totalQuestions)
      }));
      const topic = topicMap.get(anchor);
      if (topic) {
        setShuffledQuizzes((prev) => ({
          ...prev,
          [anchor]: shuffleQuizQuestions(topic.quiz)
        }));
      }
    },
    [topicMap]
  );

  const goToPreviousPage = useCallback(() => {
    setDetailPageIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    if (!selectedTopic) {
      return;
    }

    setDetailPageIndex((prev) => {
      const maxIndex = selectedTopic.detail.length - 1;
      return Math.min(maxIndex, prev + 1);
    });
  }, [selectedTopic]);

  const handlePageSelect = useCallback((pageIndex: number) => {
    setDetailPageIndex(pageIndex);
  }, []);

  const handleDetailPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement)?.closest('button')) {
      return;
    }

    if (!detailRef.current) {
      return;
    }

    const rect = detailRef.current.getBoundingClientRect();
    dragState.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };

    setDetailPosition({ x: rect.left, y: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const handleDetailPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !detailRef.current) {
      return;
    }

    event.preventDefault();

    const panelWidth = detailRef.current.offsetWidth;
    const panelHeight = detailRef.current.offsetHeight;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : panelWidth + dragState.current.offsetX;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : panelHeight + dragState.current.offsetY;
    const nextX = event.clientX - dragState.current.offsetX;
    const nextY = event.clientY - dragState.current.offsetY;
    const maxX = Math.max(DETAIL_MARGIN, viewportWidth - panelWidth - DETAIL_MARGIN);
    const maxY = Math.max(DETAIL_MARGIN, viewportHeight - panelHeight - DETAIL_MARGIN);

    setDetailPosition({
      x: Math.min(Math.max(DETAIL_MARGIN, nextX), maxX),
      y: Math.min(Math.max(DETAIL_MARGIN, nextY), maxY)
    });
  }, []);

  const handleDetailPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) {
      return;
    }

    dragState.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (err) {
      // ignore
    }
  }, []);

  const handleDetailPointerCancel = useCallback(() => {
    dragState.current = null;
  }, []);

  const handleResizePointerDown = useCallback(
    (mode: ResizeMode) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();

      if (!detailRef.current) {
        return;
      }

      const rect = detailRef.current.getBoundingClientRect();
      const left = detailPosition?.x ?? DETAIL_MARGIN;

      resizeState.current = {
        startWidth: rect.width,
        startHeight: rect.height,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: left,
        mode
      };

      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [detailPosition]
  );

  const handleResizePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeState.current;
    if (!state) {
      return;
    }

    event.preventDefault();

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : state.startWidth + DETAIL_MARGIN * 2;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : state.startHeight + DETAIL_MARGIN * 2;
    const top = detailPosition?.y ?? DETAIL_MARGIN;
    const availableHeight = Math.max(viewportHeight - top - DETAIL_MARGIN, 80);
    const maxHeight = Math.max(availableHeight, 80);
    const effectiveMinHeight = Math.min(DETAIL_MIN_HEIGHT, maxHeight);
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;

    if (state.mode === 'horizontal-left') {
      const rightEdge = state.startLeft + state.startWidth;
      const maxWidthFromRight = Math.max(rightEdge - DETAIL_MARGIN, 0);
      const effectiveMinWidth = Math.min(DETAIL_MIN_WIDTH, maxWidthFromRight);
      const widthFromPointer = rightEdge - (state.startLeft + deltaX);
      const nextWidth = clamp(widthFromPointer, effectiveMinWidth, maxWidthFromRight);
      const nextLeft = rightEdge - nextWidth;
      const clampedHeight = clamp(state.startHeight, effectiveMinHeight, maxHeight);

      setDetailSize({
        width: nextWidth,
        height: clampedHeight
      });

      setDetailPosition(prev => ({ x: nextLeft, y: prev?.y ?? top }));
      return;
    }

    const left = detailPosition?.x ?? DETAIL_MARGIN;
    const availableWidth = Math.max(viewportWidth - left - DETAIL_MARGIN, 80);
    const maxWidth = Math.max(availableWidth, 80);
    const effectiveMinWidth = Math.min(DETAIL_MIN_WIDTH, maxWidth);
    const proposedWidth = state.startWidth + deltaX;
    const proposedHeight = state.startHeight + deltaY;

    setDetailSize({
      width: clamp(proposedWidth, effectiveMinWidth, maxWidth),
      height: clamp(proposedHeight, effectiveMinHeight, maxHeight)
    });
  }, [detailPosition]);

  const handleResizePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeState.current) {
      return;
    }

    resizeState.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (err) {
      // ignore
    }
  }, []);

  const handleDetailKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (detailTab !== 'content') {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextPage();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPreviousPage();
      }
    },
    [detailTab, goToNextPage, goToPreviousPage]
  );

  const detailCompleted = selectedTopic ? isTopicCompleted(selectedTopic.anchor) : false;
  const detailIsBookmarked = selectedTopic ? bookmarkedAnchors.includes(selectedTopic.anchor) : false;
  const activeTopics = topics.filter((topic) => !isTopicCompleted(topic.anchor));
  const completedTopics = topics.filter((topic) => isTopicCompleted(topic.anchor));

  useEffect(() => {
    if (!selectedTopic || detailTab !== 'content') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextPage();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPreviousPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTopic, detailTab, goToNextPage, goToPreviousPage]);

  const totalDetailPages = selectedTopic?.detail.length ?? 0;
  const currentDetailContent = selectedTopic && totalDetailPages > 0
    ? selectedTopic.detail[Math.min(detailPageIndex, totalDetailPages - 1)]
    : null;
  const currentPageDisplay = totalDetailPages === 0 ? 0 : detailPageIndex + 1;

  const activeQuizQuestions = selectedTopic
    ? shuffledQuizzes[selectedTopic.anchor] ?? selectedTopic.quiz
    : undefined;
  const totalQuizQuestions = activeQuizQuestions?.length ?? 0;
  const rawTopicQuizState = selectedTopic ? quizState[selectedTopic.anchor] : undefined;
  const topicQuizState = selectedTopic
    ? ensureQuizStateSize(rawTopicQuizState, totalQuizQuestions)
    : undefined;
  const currentQuestionIndex = topicQuizState
    ? Math.min(topicQuizState.questionIndex, Math.max(totalQuizQuestions - 1, 0))
    : 0;
  const currentAnswerState = topicQuizState?.answers[currentQuestionIndex];
  const currentQuizQuestion = activeQuizQuestions && totalQuizQuestions > 0
    ? activeQuizQuestions[currentQuestionIndex]
    : undefined;
  const currentSelection = currentAnswerState?.selectedOptionIndex ?? null;
  const isCurrentSubmitted = currentAnswerState?.isSubmitted ?? false;
  const isCurrentCorrect = Boolean(
    isCurrentSubmitted &&
    currentQuizQuestion &&
    currentSelection !== null &&
    currentSelection === currentQuizQuestion.answerIndex
  );
  const answeredCount = topicQuizState
    ? topicQuizState.answers.reduce((count, answer) => count + (answer.isSubmitted ? 1 : 0), 0)
    : 0;
  const correctCount = topicQuizState && activeQuizQuestions
    ? topicQuizState.answers.reduce((count, answer, index) => {
        const quizDefinition = activeQuizQuestions[index];
        if (!answer || !quizDefinition) {
          return count;
        }
        return count + (answer.isSubmitted && answer.selectedOptionIndex === quizDefinition.answerIndex ? 1 : 0);
      }, 0)
    : 0;

  const handleDetailContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>('a[data-education-load-path]');
    if (!anchor) {
      return;
    }

    event.preventDefault();

    const datasetPath = anchor.getAttribute('data-education-load-path');
    if (!datasetPath) {
      return;
    }

    const datasetName = anchor.getAttribute('data-education-dataset-name') || undefined;

    try {
      window.dispatchEvent(
        new CustomEvent('education-load-sample', {
          detail: {
            path: datasetPath,
            name: datasetName
          }
        })
      );
    } catch (error) {
      console.error('[EducationOverlay] Failed to dispatch sample dataset load request', error);
    }
  }, []);

  if (!isOpen && !selectedTopic) {
    return null;
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 sm:p-8"
          style={{ zIndex: 9999 }}
        >
          <div className="relative mt-8 mb-24 max-h-[90vh] w-full max-w-3xl overflow-hidden border border-blue-300/40 bg-slate-900/95 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                onClose();
              }}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center border border-blue-400 text-sm text-blue-200 transition hover:bg-blue-600 hover:text-white"
              aria-label="Close education overlay"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
            <div className="no-scrollbar flex h-full max-h-[90vh] flex-col gap-6 p-8 pr-6 text-left text-slate-100">
              <header className="flex-none space-y-2">
                <p className="text-sm uppercase tracking-[0.4em] text-blue-300">Education Mode</p>
                <h2 className="text-3xl font-semibold">Welcome to the Mango Learning Hub</h2>
                <p className="text-sm text-slate-300">
                  This guided overlay walks you through the foundations of data analysis using Mango. Explore topics,
                  learn interactively, bookmark concepts, and test your knowledge with quizzes as you progress.
                </p>
              </header>
              <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto">
                <div className="border border-blue-300/30 bg-slate-900/60 p-6">
                <h3 className="text-lg font-semibold text-blue-200">Bookmarks</h3>
                {bookmarkedTopics.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Tap the <span className="font-semibold text-blue-100">bookmark icon</span> on any topic to collect it here for quick access.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {bookmarkedTopics.map((topic) => {
                      const completed = isTopicCompleted(topic.anchor);
                      return (
                        <li key={`bookmark-${topic.anchor}`} className="relative border border-slate-700/60 bg-slate-800/60 p-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveBookmark(topic.anchor)}
                            className={`${iconButtonClasses} absolute top-3 right-3`}
                            aria-label={`Remove ${topic.title} from bookmarks`}
                          >
                            <BookmarkX className="h-4 w-4" />
                          </button>
                          <div className="pr-10">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleLearn(topic.anchor)}
                                className="text-left text-sm font-medium text-blue-200 transition hover:text-blue-100"
                              >
                                {topic.title}
                              </button>
                              {completed && <CompletedBadge />}
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{topic.description}</p>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleLearn(topic.anchor)}
                                className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-700"
                              >
                                Learn topic
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (completed) {
                                    handleMarkIncomplete(topic.anchor);
                                  } else {
                                    handleMarkComplete(topic.anchor);
                                  }
                                }}
                                className="inline-flex items-center gap-2 border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                              >
                                {completed ? 'Mark incomplete' : 'Mark complete'}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                </div>
                <div className="border border-slate-700 bg-slate-900/60 p-6">
                  <h3 className="text-lg font-semibold text-blue-200">Concepts</h3>
                <p className="mb-4 text-xs text-slate-400">
                  Each section links to a concept you can explore. Mark topics as complete when you're done to track your progress.
                </p>
                {activeTopics.length === 0 ? (
                  <p className="text-sm text-slate-400">You've completed every topic in this list. Stay tuned for more!</p>
                ) : (
                  <ul className="space-y-3">
                    {activeTopics.map((topic) => {
                      const isBookmarked = bookmarkedAnchors.includes(topic.anchor);
                      return (
                        <li
                          key={topic.anchor}
                          className="relative flex flex-col border border-slate-700/60 bg-slate-800/60 p-4 transition hover:border-blue-400/60"
                        >
                          <button
                            type="button"
                            onClick={() => handleBookmarkToggle(topic.anchor)}
                            className={`${iconButtonClasses} absolute right-4 top-4`}
                            aria-label={isBookmarked ? `Remove ${topic.title} from bookmarks` : `Bookmark ${topic.title}`}
                            title={isBookmarked ? 'Unbookmark topic' : 'Bookmark topic'}
                          >
                            {isBookmarked ? <BookmarkX className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                          </button>
                          <div className="flex items-center gap-2 pr-10">
                            <span className="text-base font-medium text-slate-100">{topic.title}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-300">{topic.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleLearn(topic.anchor)}
                              className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-700"
                            >
                              Learn topic
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkComplete(topic.anchor)}
                              className="inline-flex items-center gap-2 border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                            >
                              Mark complete
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {completedTopics.length > 0 && (
                  <div className="mt-8 border-t border-slate-700/60 pt-6">
                    <h4 className="text-base font-semibold text-blue-200">Completed</h4>
                    <p className="mb-4 mt-1 text-xs text-slate-400">Revisit topics any time or mark them incomplete to move them back into the main list.</p>
                    <ul className="space-y-3">
                      {completedTopics.map((topic) => {
                        const isBookmarked = bookmarkedAnchors.includes(topic.anchor);
                        return (
                          <li
                            key={`completed-${topic.anchor}`}
                            className="relative flex flex-col border border-slate-500/40 bg-slate-800/60 p-4"
                          >
                            <button
                              type="button"
                              onClick={() => handleBookmarkToggle(topic.anchor)}
                              className={`${iconButtonClasses} absolute right-4 top-4`}
                              aria-label={isBookmarked ? `Remove ${topic.title} from bookmarks` : `Bookmark ${topic.title}`}
                              title={isBookmarked ? 'Unbookmark topic' : 'Bookmark topic'}
                            >
                              {isBookmarked ? <BookmarkX className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                            </button>
                            <div className="flex items-center gap-2 pr-10">
                              <span className="text-base font-medium text-slate-100">{topic.title}</span>
                              <CompletedBadge />
                            </div>
                            <p className="mt-1 text-sm text-slate-200">{topic.description}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleLearn(topic.anchor)}
                                className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-700"
                              >
                                Review topic
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMarkIncomplete(topic.anchor)}
                                className="inline-flex items-center gap-2 border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                              >
                                Mark incomplete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                </div>
              </div>
             
            </div>
          </div>
        </div>
      )}

      {selectedTopic && (
        <aside
          ref={detailRef}
          tabIndex={0}
          className="pointer-events-auto fixed z-[5000] flex flex-col border border-blue-300/40 bg-slate-900/95 p-6 shadow-xl outline-none focus:outline-none"
          style={{
            top: detailPosition?.y ?? DETAIL_MARGIN,
            left: detailPosition ? detailPosition.x : undefined,
            right: detailPosition ? undefined : DETAIL_MARGIN,
            width: detailSize?.width ?? DEFAULT_DETAIL_SIZE.width,
            height: detailSize?.height ?? DEFAULT_DETAIL_SIZE.height,
            maxWidth: `calc(100vw - ${DETAIL_MARGIN * 2}px)`,
            maxHeight: `calc(100vh - ${DETAIL_MARGIN * 2}px)`
          }}
          onKeyDown={handleDetailKeyDown}
        >
          <div className="flex items-start justify-between gap-4">
            <div
              className="flex-1 cursor-move select-none"
              onPointerDown={handleDetailPointerDown}
              onPointerMove={handleDetailPointerMove}
              onPointerUp={handleDetailPointerUp}
              onPointerLeave={handleDetailPointerUp}
              onLostPointerCapture={handleDetailPointerCancel}
              onPointerCancel={handleDetailPointerCancel}
            >
              <p className="text-xs uppercase tracking-[0.4em] text-blue-300">Focus Topic</p>
              <div className="mt-1 flex items-center gap-2">
                <h3 className="text-2xl font-semibold text-slate-100">{selectedTopic.title}</h3>
                {detailCompleted && <CompletedBadge />}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseDetail}
              className="flex h-8 w-8 items-center justify-center border border-blue-400 text-sm text-blue-200 transition hover:bg-blue-600 hover:text-white"
              aria-label="Close topic details"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex gap-2 bg-slate-800/60 p-1">
            <button
              type="button"
              onClick={() => handleDetailTabChange('content')}
              className={`flex-1 px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                detailTab === 'content'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-200 hover:text-blue-100'
              }`}
            >
              Topic Notes
            </button>
            <button
              type="button"
              onClick={() => handleDetailTabChange('quiz')}
              className={`flex-1 px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                detailTab === 'quiz'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-200 hover:text-blue-100'
              }`}
            >
              Quiz Now
            </button>
          </div>
          <div className="mt-4 flex-1 overflow-hidden">
            {detailTab === 'content' ? (
              <div className="flex h-full flex-col">
                <div
                  className="flex-1 overflow-y-auto no-scrollbar text-sm text-slate-200"
                  onClick={handleDetailContentClick}
                >
                  {typeof currentDetailContent === 'string' ? (
                    <div
                      className="space-y-3 text-sm text-slate-200"
                      dangerouslySetInnerHTML={{ __html: currentDetailContent }}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">Content coming soon.</p>
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {totalDetailPages > 0 &&
                    Array.from({ length: totalDetailPages }, (_, pageIndex) => {
                      const isActive = pageIndex === detailPageIndex;
                      return (
                        <button
                          key={`${selectedTopic.anchor}-page-${pageIndex}`}
                          type="button"
                          onClick={() => handlePageSelect(pageIndex)}
                          disabled={isActive}
                          aria-current={isActive ? 'page' : undefined}
                          className={`flex h-8 w-8 items-center justify-center border border-blue-400 text-xs font-semibold transition ${
                            isActive
                              ? 'cursor-default bg-blue-600 text-white shadow-sm'
                              : 'text-blue-200 hover:bg-blue-600 hover:text-white'
                          }`}
                        >
                          {pageIndex + 1}
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col text-sm text-slate-200">
                {currentQuizQuestion && topicQuizState ? (
                  <>
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-blue-200">
                      <span>
                        Question {currentQuestionIndex + 1} of {totalQuizQuestions}
                      </span>
                      
                    </div>
                    <p className="mt-2 text-sm font-semibold text-blue-200">{currentQuizQuestion.question}</p>
                    <div className="mt-2 flex flex-1 flex-col gap-3">
                      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                        {currentQuizQuestion.options.map((option, optionIndex) => {
                          const isChecked = currentSelection === optionIndex;
                          const isCorrectOption = isCurrentSubmitted && optionIndex === currentQuizQuestion.answerIndex;

                          return (
                            <label
                              key={`${selectedTopic.anchor}-quiz-option-${optionIndex}`}
                              className={`flex items-center gap-3 border border-blue-300/30 bg-slate-800/60 p-3 transition ${
                                isChecked ? 'border-blue-400/70' : 'hover:border-blue-400/60'
                              } ${
                                isCurrentSubmitted
                                  ? isCorrectOption
                                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-50'
                                    : 'border-rose-500 bg-rose-500/20 text-rose-50'
                                  : ''
                              }`}
                            >
                              <input
                                type="radio"
                                name={`quiz-${selectedTopic.anchor}`}
                                value={optionIndex}
                                checked={isChecked}
                                onChange={() => handleQuizOptionChange(selectedTopic.anchor, optionIndex, totalQuizQuestions)}
                                className="h-4 w-4 border-blue-400 text-blue-500 focus:ring-blue-500"
                                disabled={isCurrentSubmitted}
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="text-xs">
                        <button
                          type="button"
                          onClick={() => handleQuizSubmit(selectedTopic.anchor, totalQuizQuestions)}
                          disabled={currentSelection === null || isCurrentSubmitted}
                          className={`border border-blue-400 px-3 py-1 font-semibold uppercase tracking-wide transition ${
                            currentSelection === null || isCurrentSubmitted
                              ? 'cursor-not-allowed text-slate-500'
                              : 'text-blue-200 hover:bg-blue-600 hover:text-white'
                          }`}
                        >
                          Check answer
                        </button>
                      </div>
                      <div className="mt-auto flex flex-col gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          {currentQuestionIndex > 0 && (
                            <button
                              type="button"
                              onClick={() => handleQuizPreviousQuestion(selectedTopic.anchor, totalQuizQuestions)}
                              className="border border-blue-400 px-3 py-1 font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                            >
                              Previous question
                            </button>
                          )}
                          {isCurrentSubmitted && currentQuestionIndex < (totalQuizQuestions - 1) && (
                            <button
                              type="button"
                              onClick={() => handleQuizNextQuestion(selectedTopic.anchor, totalQuizQuestions)}
                              className="border border-blue-400 px-3 py-1 font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                            >
                              Next question
                            </button>
                          )}
                        </div>
                        {isCurrentSubmitted && (
                          <div
                            className={`border p-3 ${
                              isCurrentCorrect
                                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-50'
                                : 'border-rose-500 bg-rose-500/20 text-rose-50'
                            }`}
                          >
                            <p>
                              {isCurrentCorrect ? 'Correct! Nice work.' : 'Not quite.'}
                            </p>
                            {currentQuizQuestion.explanation && (
                              <p className="mt-2 text-[11px] text-slate-300">{currentQuizQuestion.explanation}</p>
                            )}
                          </div>
                        )}
                        {topicQuizState.isComplete && totalQuizQuestions > 0 && (
                          <div className="flex flex-wrap items-center gap-3 border border-slate-500/60 bg-slate-800/80 p-3 text-slate-100">
                            <div>
                              <p className="font-semibold text-slate-100">Quiz complete!</p>
                              <p className="text-slate-300">
                                You answered {correctCount} of {totalQuizQuestions} correctly.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleQuizRestart(selectedTopic.anchor, totalQuizQuestions)}
                              className="ml-auto border border-blue-400 px-3 py-1 font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                            >
                              Retake quiz
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Quiz content coming soon.</p>
                )}
              </div>
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {!isOpen && onOpenMainOverlay && (
              <button
                type="button"
                onClick={onOpenMainOverlay}
                className="border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
              >
                Home
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (detailCompleted) {
                  handleMarkIncomplete(selectedTopic.anchor);
                } else {
                  handleMarkComplete(selectedTopic.anchor);
                }
              }}
              className="inline-flex items-center gap-2 border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
            >
              {detailCompleted ? 'Mark incomplete' : 'Mark complete'}
            </button>
            <button
              type="button"
              onClick={() => handleBookmarkToggle(selectedTopic.anchor)}
              className="inline-flex items-center justify-center border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
              aria-label={detailIsBookmarked ? `Remove ${selectedTopic.title} from bookmarks` : `Bookmark ${selectedTopic.title}`}
              title={detailIsBookmarked ? 'Unbookmark topic' : 'Bookmark topic'}
            >
              {detailIsBookmarked ? <BookmarkX className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </button>
          </div>
          <div
            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize"
            style={{
              background: `
                linear-gradient(135deg, transparent 45%, white 45%, white 55%, transparent 55%),
                linear-gradient(135deg, transparent 70%, white 70%, white 80%, transparent 80%)
              `
            }}
            onPointerDown={handleResizePointerDown('both')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            aria-hidden="true"
          />
          <div
            className="absolute left-1 top-1/2 h-4 w-2 -translate-y-1/2 transform cursor-ew-resize"
            style={{
                background: `
                linear-gradient(90deg, transparent 45%, white 45%, white 55%, transparent 55%),
                linear-gradient(90deg, transparent 70%, white 70%, white 80%, transparent 80%)
                `,
            }}
            onPointerDown={handleResizePointerDown('horizontal-left')}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            aria-hidden="true"
            />
            



        </aside>
      )}
    </>
  );
};

export default EducationOverlay;