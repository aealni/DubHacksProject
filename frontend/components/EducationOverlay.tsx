import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, BookmarkX, X as XIcon } from 'lucide-react';

import { requestPersonalizedPracticeQuiz } from '../utils/ai/practiceQuiz';

import interpretingDataQuizData from '../content/quizzes/interpreting-data.json';
import dataCleaningBasicsQuizData from '../content/quizzes/data-cleaning-basics.json';
import exploratoryDataAnalysisQuizData from '../content/quizzes/exploratory-data-analysis.json';
import interpretingGraphsQuizData from '../content/quizzes/interpreting-graphs.json';
import howToGraphDataQuizData from '../content/quizzes/how-to-graph-data.json';
import trendAnalysisQuizData from '../content/quizzes/trend-analysis.json';
import featureEngineeringQuizData from '../content/quizzes/feature-engineering.json';
import modelEvaluationQuizData from '../content/quizzes/model-evaluation.json';
import makingDashboardsQuizData from '../content/quizzes/making-dashboards.json';
import connectingVisualizationsQuizData from '../content/quizzes/connecting-visualizations.json';
import collaborationWorkflowsQuizData from '../content/quizzes/collaboration-workflows.json';

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
  feedbackCorrect?: string;
  feedbackIncorrect?: string;
};

type Topic = {
  title: string;
  description: string;
  anchor: string;
  detail: string[];
  quiz: QuizQuestion[];
  category?: 'concept' | 'practice';
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

type PracticeQuizHistoryEntry = {
  generatedAt: string;
  datasetName: string;
  questionCount: number;
  emphasizeTags: string[];
  reinforceTags: string[];
  upcomingTags: string[];
  notes?: string;
  score?: {
    correct: number;
    total: number;
    percentage: number;
  };
  questions: QuizQuestion[];
};

type PracticeDatasetQueueEntry = {
  name: string;
  csvContent: string;
  savedAt: number;
};

type ResizeMode = 'both' | 'horizontal-left';

const PRACTICE_TOPIC_ANCHOR = '#personalized-practice-quiz';
const PRACTICE_DATASET_QUEUE_KEY = 'mango:education:pendingPracticeDatasets';
const MAX_PRACTICE_DATASET_QUEUE_LENGTH = 3;

const TOPIC_TAGS: Record<string, string[]> = {
  [PRACTICE_TOPIC_ANCHOR]: ['adaptive-practice', 'mixed-review'],
  '#interpreting-data': ['spreadsheet-basics', 'table-literacy', 'context-clues'],
  '#data-cleaning-basics': ['data-cleaning', 'error-detection', 'formatting'],
  '#advanced-data-cleaning': ['data-cleaning', 'outlier-treatment', 'normalization'],
  '#exploratory-data-analysis': ['exploratory-analysis', 'summary-statistics', 'pattern-spotting'],
  '#interpreting-graphs': ['data-visualization', 'insight-communication', 'interpretation'],
  '#how-to-graph-data': ['chart-building', 'encoding-selection', 'comparisons'],
  '#trend-analysis': ['time-series', 'trend-detection', 'seasonality'],
  '#feature-engineering': ['feature-engineering', 'derived-metrics', 'data-transformation'],
  '#model-evaluation': ['modeling', 'evaluation-metrics', 'performance-diagnostics'],
  '#making-dashboards': ['dashboards', 'layout-design', 'stakeholder-communication'],
  '#connecting-visualizations': ['visual-integration', 'cross-filtering', 'storytelling'],
  '#collaboration-workflows': ['collaboration', 'handoff-process', 'version-practices']
};

const collectTagsForAnchors = (anchors: string[]): string[] => {
  const tagSet = new Set<string>();
  anchors.forEach((anchor) => {
    const topicTags = TOPIC_TAGS[anchor];
    if (topicTags) {
      topicTags.forEach((tag) => tagSet.add(tag));
    }
  });
  return Array.from(tagSet);
};

const buildTagDictionaryForAnchors = (anchors: string[]): Record<string, string[]> => {
  const dictionary: Record<string, string[]> = {};
  anchors.forEach((anchor) => {
    const tags = TOPIC_TAGS[anchor];
    if (tags && tags.length) {
      dictionary[anchor] = Array.from(new Set(tags));
    }
  });
  return dictionary;
};

const lessonQuizzes: Record<string, QuizQuestion[]> = {
  '#interpreting-data': interpretingDataQuizData as QuizQuestion[],
  '#data-cleaning-basics': dataCleaningBasicsQuizData as QuizQuestion[],
  '#exploratory-data-analysis': exploratoryDataAnalysisQuizData as QuizQuestion[],
  '#interpreting-graphs': interpretingGraphsQuizData as QuizQuestion[],
  '#how-to-graph-data': howToGraphDataQuizData as QuizQuestion[],
  '#trend-analysis': trendAnalysisQuizData as QuizQuestion[],
  '#feature-engineering': featureEngineeringQuizData as QuizQuestion[],
  '#model-evaluation': modelEvaluationQuizData as QuizQuestion[],
  '#making-dashboards': makingDashboardsQuizData as QuizQuestion[],
  '#connecting-visualizations': connectingVisualizationsQuizData as QuizQuestion[],
  '#collaboration-workflows': collaborationWorkflowsQuizData as QuizQuestion[]
};

type PracticeQuizPayload = Record<string, unknown>;

type PracticeQuizQuestionPayload = Record<string, unknown>;

type ParsedPracticeQuizContent = {
  datasetCsv?: string;
  datasetName?: string;
  questions: QuizQuestion[];
  notes?: string;
};

const extractPracticeQuizPayload = (content: string): PracticeQuizPayload | null => {
  if (!content || typeof content !== 'string') {
    return null;
  }

  let candidate = content.trim();
  const codeBlockMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    candidate = codeBlockMatch[1].trim();
  }

  const attemptParse = (input: string): PracticeQuizPayload | null => {
    try {
      const parsed = JSON.parse(input) as PracticeQuizPayload;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = attemptParse(candidate);
  if (direct) {
    return direct;
  }

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const fallback = candidate.slice(firstBrace, lastBrace + 1);
    return attemptParse(fallback);
  }

  return null;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const coerceQuizQuestion = (input: PracticeQuizQuestionPayload): QuizQuestion | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const question = normalizeString(input.question);
  if (!question) {
    return null;
  }

  const optionList = Array.isArray(input.options)
    ? input.options
        .map((option) => normalizeString(option))
        .filter((option): option is string => Boolean(option))
    : [];

  if (optionList.length < 4) {
    return null;
  }

  let answerIndexValue: number | null = null;
  if (typeof input.answerIndex === 'number' && Number.isInteger(input.answerIndex)) {
    answerIndexValue = input.answerIndex;
  } else if (typeof input.answerIndex === 'string') {
    const parsedNumber = Number(input.answerIndex);
    if (Number.isInteger(parsedNumber)) {
      answerIndexValue = parsedNumber;
    }
  }

  if (answerIndexValue === null || answerIndexValue < 0 || answerIndexValue >= optionList.length) {
    return null;
  }

  let normalizedOptions: string[];
  if (optionList.length === 4) {
    normalizedOptions = optionList;
  } else {
    const correctOption = optionList[answerIndexValue];
    if (!correctOption) {
      return null;
    }
    const distractors = optionList.filter((_, index) => index !== answerIndexValue).slice(0, 3);
    normalizedOptions = [correctOption, ...distractors];
    answerIndexValue = 0;
  }

  const explanation = normalizeString(input.explanation);

  let feedbackCorrect = normalizeString((input as Record<string, unknown>).feedbackCorrect);
  let feedbackIncorrect = normalizeString((input as Record<string, unknown>).feedbackIncorrect);

  if (!feedbackCorrect || !feedbackIncorrect) {
    const feedbackField = (input as Record<string, unknown>).feedback;
    if (feedbackField && typeof feedbackField === 'object') {
      const feedbackRecord = feedbackField as Record<string, unknown>;
      feedbackCorrect = feedbackCorrect ?? normalizeString(feedbackRecord.correct ?? feedbackRecord.good ?? feedbackRecord.positive);
      feedbackIncorrect = feedbackIncorrect ?? normalizeString(feedbackRecord.incorrect ?? feedbackRecord.bad ?? feedbackRecord.negative);
    }
  }

  feedbackCorrect = feedbackCorrect ?? normalizeString((input as Record<string, unknown>).goodFeedback);
  feedbackIncorrect = feedbackIncorrect ?? normalizeString((input as Record<string, unknown>).badFeedback);

  return {
    question,
    options: normalizedOptions,
    answerIndex: answerIndexValue,
    explanation: explanation,
    feedbackCorrect,
    feedbackIncorrect
  };
};

const parsePracticeQuizContent = (content: string): ParsedPracticeQuizContent | null => {
  const payload = extractPracticeQuizPayload(content);
  if (!payload) {
    return null;
  }

  const questionPayloads: PracticeQuizQuestionPayload[] = [];

  if (Array.isArray(payload.questions)) {
    payload.questions.forEach((item) => {
      if (item && typeof item === 'object') {
        questionPayloads.push(item as PracticeQuizQuestionPayload);
      }
    });
  }

  if (questionPayloads.length === 0) {
    questionPayloads.push(payload);
  }

  const questions = questionPayloads
    .map((item) => coerceQuizQuestion(item))
    .filter((question): question is QuizQuestion => Boolean(question));

  if (questions.length === 0) {
    return null;
  }

  const datasetCsv = normalizeString(payload.datasetCsv ?? (payload as Record<string, unknown>).csv)
    ?? normalizeString((payload as Record<string, unknown>).dataCsv);

  const datasetName = normalizeString(payload.datasetName ?? (payload as Record<string, unknown>).csvName);

  const notes = normalizeString(payload.notes);

  return {
    datasetCsv,
    datasetName,
    questions,
    notes
  };
};

const topics: Topic[] = [
  {
    title: 'Personalized Practice Quiz',
    description: 'Let Gemini tailor a practice quiz around the topics you are exploring in Mango.',
    anchor: PRACTICE_TOPIC_ANCHOR,
    category: 'practice',
    detail: [
      `<h4 class="text-lg font-semibold text-blue-200">Get ready for an adaptive quiz</h4>
<p class="mt-2 text-sm text-slate-200">The personalized practice experience uses Google\'s Gemini model to draft quiz questions that focus on the concepts you care about most. We look at your bookmarked topics and recent completions to shape the prompt we send.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Review the guidance below, then open the practice quiz panel from here.</li>
  <li>Confirm the context and goals that will be passed to Gemini before generating questions.</li>
  <li>Kick off a tailored session and iterate until you feel confident.</li>
  <li>When your quiz is ready, Mango uploads the generated CSV to the canvas and data tab automatically so you can explore it alongside the questions.</li>
</ul>`
    ],
    quiz: []
  },
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
    quiz: lessonQuizzes['#interpreting-data']
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

<p class="mt-2 text-sm text-slate-200">
  Outliers are values that sit far from the rest — they can flag typos, rare events, or important exceptions 
  that deserve attention rather than deletion.
</p>

<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li><strong>Scan visually:</strong> Sort or filter to notice sudden jumps or drops — for instance, a spike in sales or a row of zeros.</li>
  <li><strong>Compare across peers:</strong> Does one region, category, or month show 10× the usual value? Is there any unusual data that doesn't seem like it fits with the other data?</li>
  <li><strong>Use simple math checks:</strong> Analysts often calculate a <em>z-score</em> (how many standard deviations a value is from the mean) or use the <em>IQR rule</em> to flag extreme points. 
      Don’t worry about formulas yet — just know that math can back up what your eyes already see.</li>
  <li><strong>Validate context:</strong> Sometimes an “outlier” isn’t an error but an insight — a new product launch, a one-time refund, or a seasonal high.</li>
</ul>

<p class="mt-3 text-sm text-slate-200">
  <strong>For example:</strong> A “February South” row showing zeros across every metric might mean a delayed launch 
  (see the Notes column) — or a missing upload worth confirming.
</p>

<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">
  Key takeaway: Outliers are <strong>clues</strong> — notice them, question them, and confirm their story before you act.
</p>
`,
      `<h4 class="text-lg font-semibold text-blue-200">Catching Malformed Records</h4>
<p class="mt-2 text-sm text-slate-200">Formatting issues block downstream tools even when values look “fine.” Make consistency part of cleaning.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Align date formats (ISO, month abbreviations, etc.) before exporting to other systems.</li>
  <li>Strip symbols from numeric fields so <code>$45,000</code> becomes <code>45000</code>.</li>
  <li>Standardize categories: “North” and “north” should not coexist.</li>
  <li>Watch for summary rows like “Total” that mix data types in the same column.</li>
</ul>
<p class="mt-3 text-sm text-slate-200"><strong>For example:</strong> The “Total” row in our sample CSV aggregates months and regions; tag or move it so charting tools don’t mistake it for another record.</p>

<p class="mt-3 text-sm text-slate-200"><strong>Fun Fact:</strong> Mango does the above for you automatically!</p>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Consistency makes data reusable and automation-friendly.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Simple Cleaning Strategies</h4>
<p class="mt-2 text-sm text-slate-200">Choose tactics deliberately and leave an audit trail.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li><strong>Remove:</strong> Drop empty or duplicate rows that do not add meaningful information.</li>
  <li><strong>Repair:</strong> Fill missing values using appropriate strategies—grouped medians, means, or placeholders like 0—so calculations remain consistent.</li>
  <li><strong>Replace:</strong> Standardize text or categorical entries (e.g., convert “N/A”, “None”, or “unknown” → blank) to ensure filters, joins, and comparisons work reliably.</li>
  <li><strong>Normalize:</strong> Scale numeric columns or adjust formats so that different ranges, units, or styles do not distort analysis (e.g., dollars vs. thousands, date formats, capitalization).</li>
  <li><strong>Review:</strong> Re-run summaries, totals, or quick charts to confirm that the data still reflects the intended meaning after cleaning.</li>
</ul>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Every cleaning step should be explainable and reversible.</p>`,
      `<h4 class="text-lg font-semibold text-blue-200">Try data cleaning yourself!</h4>
<p class="mt-2 text-sm text-slate-200">Put the concepts to work immediately.</p>





<!-- ADD LATER -->




<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Learning to see dirty data is the first step to cleaning it.</p>`
    ],
    quiz: lessonQuizzes['#data-cleaning-basics']
  },
  {
    title: 'Exploratory Data Analysis',
    description: 'Summaries, visual patterns, and statistical intuition.',
    anchor: '#exploratory-data-analysis',
    detail: [
      `<h4 class="text-lg font-semibold text-blue-200">Understanding Your Data</h4>
<p class="mt-2 text-sm text-slate-200">
  Exploratory Data Analysis (EDA) is the practice of exploring datasets before formal modeling so you understand what story the numbers can actually support.
</p>
<p class="mt-3 text-sm text-slate-200">
  <a class="text-blue-300 underline" href="#" data-education-load-path="/education/eda-operations-snapshot.csv" data-education-dataset-name="EDA Operations Snapshot.csv">
    Load the sample CSV
  </a> to compare Central and Coast region performance across revenue, new customers, support tickets, satisfaction scores, and operational notes.
</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Spot trends, seasonality, and major swings before committing to a model.</li>
  <li>Catch anomalies like March's festival surge or April's missing note so they do not distort downstream work.</li>
  <li>Form hypotheses that can be tested with additional data, feature engineering, or statistical techniques.</li>
</ul>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Explore first so modeling time focuses on real signal.</p>
`,
`<h4 class="text-lg font-semibold text-blue-200">Numerical and Categorical Summaries</h4>
<p class="mt-2 text-sm text-slate-200">
  Start with quick summaries: numeric columns (e.g., revenue, satisfaction) get means, medians, min/max, quartiles, and standard deviations; categorical columns (e.g., region, month) get counts, unique tallies, and frequency tables.
</p>
<p class="mt-3 text-sm text-slate-200"><strong>Example:</strong> Central region revenue has a median near 61,500 across four months, while Coast revenue spikes to 88,000 in March during festival demand.</p>
<p class="mt-3 text-sm text-slate-200">Summaries highlight patterns and outliers quickly, guiding the rest of your EDA.</p>
`,`
<h4 class="text-lg font-semibold text-blue-200">Seeing Data Visually</h4>
<p class="mt-2 text-sm text-slate-200">Charts reveal patterns that tables alone may hide.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Line charts track revenue or satisfaction trends over time to make the March surge obvious.</li>
  <li>Histograms show distributions for support tickets or new customers to highlight skew.</li>
  <li>Scatter plots compare revenue vs. new customers to see relationships.</li>
  <li>Heatmaps of correlations help spot variables that rise and fall together.</li>
</ul>
<p class="mt-3 text-sm text-slate-200">Visual inspection makes it easier to see outliers and clusters before quantifying them.</p>
`,`
<h4 class="text-lg font-semibold text-blue-200">Going Beyond Simple Counts</h4>
<p class="mt-2 text-sm text-slate-200">Once basic summaries are in hand, dig into variance, skewness, and correlations to understand how the dataset behaves.</p>
<p class="mt-3 text-sm text-slate-200">Ask questions such as:</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Which metrics move together? Revenue and new customers often rise in the same months.</li>
  <li>Are there seasonal or regional effects? Coast festival month differs from other months.</li>
  <li>Do variance or skew values suggest transformations needed before modeling?</li>
</ul>
`,`
<h4 class="text-lg font-semibold text-blue-200">Explore, Summarize, Refine</h4>
<p class="mt-2 text-sm text-slate-200">EDA is iterative rather than one-and-done.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Summarize the data to capture where most values sit and where they break pattern.</li>
  <li>Visualize patterns to confirm that tables match the story.</li>
  <li>Spot anomalies, missing values, or stray notes and log follow-up questions.</li>
  <li>Adjust filters, groupings, or cleaning rules and run another pass to deepen understanding.</li>
</ul>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Each iteration peels back another layer, revealing new insights worth validating.</p>
`,`
<h4 class="text-lg font-semibold text-blue-200">Why EDA Matters</h4>
<p class="mt-2 text-sm text-slate-200">Exploratory work pays off later in modeling, dashboarding, and storytelling.</p>
<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-200">
  <li>Detect mistakes (like blank notes) before they leak into production analyses.</li>
  <li>Generate hypotheses for deeper study — do festival campaigns always correlate with more support demand?</li>
  <li>Decide which features, variables, or transformations deserve focus when building models.</li>
  <li>Gain confidence that the dataset's quality and narrative are solid before sharing.</li>
</ul>
<p class="mt-3 text-xs uppercase tracking-wide text-slate-400">Key takeaway: Invest time in exploration so downstream decisions are data-driven and trustworthy.</p>
`,
      '<!-- Interactive practice placeholder -->'
    ],
    quiz: lessonQuizzes['#exploratory-data-analysis']
  },
  {
    title: 'Interpreting Graphs',
    description: 'Read scales, distributions, and context clues to avoid misinterpretation.',
    anchor: '#interpreting-graphs',
    detail: [
      'Always note the axes, units, and scale breaks. A truncated y-axis can make minor changes feel dramatic unless you check the full range.',
      'Look for annotations or confidence bands that explain uncertainty. Missing context often signals that more exploration is needed before drawing conclusions.'
    ],
    quiz: lessonQuizzes['#interpreting-graphs']
  },
  {
    title: 'How to Graph Data',
    description: 'Choose chart types, map variables, and set encodings that reveal insight.',
    anchor: '#how-to-graph-data',
    detail: [
      'Map each variable to an encoding (position, color, size) that matches how you want viewers to compare values. Avoid double-encoding unless it adds clarity.',
      'Prototype multiple chart types quickly. A scatter might highlight correlation while a line chart clarifies evolution over time.'
    ],
    quiz: lessonQuizzes['#how-to-graph-data']
  },
  {
    title: 'Trend Analysis',
    description: 'Detect seasonality, correlation shifts, and meaningful changes over time.',
    anchor: '#trend-analysis',
    detail: [
      'Decompose time series into trend, seasonal, and residual components to understand the forces driving change.',
      'Use windowed statistics (rolling averages, rolling correlation) to observe structural breaks that merit deeper investigation.'
    ],
    quiz: lessonQuizzes['#trend-analysis']
  },
  {
    title: 'Feature Engineering',
    description: 'Transform raw inputs into model-ready features.',
    anchor: '#feature-engineering',
    detail: [
      'Generate interaction features deliberately. Multiplying or concatenating columns can capture non-linear patterns, but only keep what improves validation metrics.',
      'Track feature provenance so you can reproduce training data later. Notebook snippets and pipeline code should align.'
    ],
    quiz: lessonQuizzes['#feature-engineering']
  },
  {
    title: 'Model Evaluation',
    description: 'Understand metrics, validation splits, and fairness checks.',
    anchor: '#model-evaluation',
    detail: [
      'Align evaluation metrics with business objectives. Accuracy might look great even when recall is too low for critical alerts.',
      'Inspect confusion matrices or residual plots per subgroup to flag fairness or calibration issues early.'
    ],
    quiz: lessonQuizzes['#model-evaluation']
  },
  {
    title: 'Making Dashboards',
    description: 'Combine charts with narrative context for decision-ready stories.',
    anchor: '#making-dashboards',
    detail: [
      'Arrange panels to guide readers from overview to detail. Start with a summary insight, then provide supporting evidence in adjacent panels.',
      'Use consistent color palettes and typography across widgets so the dashboard feels cohesive and easy to scan.'
    ],
    quiz: lessonQuizzes['#making-dashboards']
  },
  {
    title: 'Connecting Visualizations',
    description: 'Link charts so interactions reveal multi-dimensional relationships.',
    anchor: '#connecting-visualizations',
    detail: [
      'Coordinate selections between charts using shared keys. Highlighted subsets in one view should update related visuals instantly.',
      'Provide clear reset controls and legends so viewers always understand what filters are active across the connected experience.'
    ],
    quiz: lessonQuizzes['#connecting-visualizations']
  },
  {
    title: 'Collaboration Workflows',
    description: 'Share data stories and iterate on experiments.',
    anchor: '#collaboration-workflows',
    detail: [
      'Share workspace snapshots or exported reports so teammates can retrace your steps and contribute new ideas.',
      'Document decisions inside the platform. Comments attached to panels prevent context from being lost in chat threads.'
    ],
    quiz: lessonQuizzes['#collaboration-workflows']
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

const enqueuePracticeDatasetForDeferredLoad = (entry: PracticeDatasetQueueEntry) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const rawQueue = window.sessionStorage.getItem(PRACTICE_DATASET_QUEUE_KEY);
    const parsedValue = rawQueue ? JSON.parse(rawQueue) : [];
    const existingEntries = Array.isArray(parsedValue) ? parsedValue : [];

    const normalizedExisting: PracticeDatasetQueueEntry[] = existingEntries
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const candidate = item as Record<string, unknown>;
        const name = typeof candidate.name === 'string' ? candidate.name : null;
        const csvContent = typeof candidate.csvContent === 'string' ? candidate.csvContent : null;
        const savedAt = typeof candidate.savedAt === 'number' ? candidate.savedAt : Date.now();
        if (!name || !csvContent) {
          return null;
        }
        return { name, csvContent, savedAt };
      })
      .filter((item): item is PracticeDatasetQueueEntry => Boolean(item));

    const filtered = normalizedExisting.filter((item) => item.name !== entry.name);
    const next = [entry, ...filtered].slice(0, MAX_PRACTICE_DATASET_QUEUE_LENGTH);

    window.sessionStorage.setItem(PRACTICE_DATASET_QUEUE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[EducationOverlay] Unable to queue practice dataset for deferred load', error);
  }
};

const MISSING_VALUE_KEYWORDS = /\b(blank|missing|empty|null|n\/a|na)\b/i;

const questionMentionsMissingData = (question: QuizQuestion): boolean => {
  const fields: Array<string | undefined> = [
    question.question,
    ...question.options,
    question.explanation,
    question.feedbackCorrect,
    question.feedbackIncorrect
  ];

  return fields.some((text) => typeof text === 'string' && MISSING_VALUE_KEYWORDS.test(text));
};

const csvLineHasBlankField = (line: string): boolean => {
  let inQuotes = false;
  let field = '';

  const finalizeField = (): boolean => {
    const trimmed = field.trim();
    field = '';
    return trimmed.length === 0;
  };

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      if (finalizeField()) {
        return true;
      }
      continue;
    }

    field += char;
  }

  return finalizeField();
};

const datasetContainsBlankCell = (csv: string): boolean => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return false;
  }

  return lines.slice(1).some((line) => csvLineHasBlankField(line));
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
  const [asyncQuizStatus, setAsyncQuizStatus] = useState<Record<string, { isLoading: boolean; error: string | null }>>({});
  const [practiceQuizHistory, setPracticeQuizHistory] = useState<PracticeQuizHistoryEntry[]>([]);
  const [expandedHistoryIndex, setExpandedHistoryIndex] = useState<number | null>(null);
  const [practicePanelTab, setPracticePanelTab] = useState<'overview' | 'history'>('overview');
  const [activePracticeRunId, setActivePracticeRunId] = useState<string | null>(null);
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

  const practiceTopic = useMemo(
    () => topics.find((topic) => topic.category === 'practice'),
    []
  );

  const conceptTopics = useMemo(
    () => topics.filter((topic) => topic.category !== 'practice'),
    []
  );

  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    topics.forEach((topic) => map.set(topic.anchor, topic));
    return map;
  }, []);

  const practiceHistoryFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  useEffect(() => {
    setExpandedHistoryIndex((previous) => {
      if (previous === null) {
        return previous;
      }
      return previous < practiceQuizHistory.length ? previous : null;
    });
  }, [practiceQuizHistory]);

  useEffect(() => {
    if (!practiceTopic) {
      return;
    }

    if (!activePracticeRunId) {
      return;
    }

    const anchor = practiceTopic.anchor;
    const questions = shuffledQuizzes[anchor];
    if (!questions || questions.length === 0) {
      return;
    }

    const state = quizState[anchor];
    if (!state) {
      return;
    }

    const ensuredState = ensureQuizStateSize(state, questions.length);
    if (!ensuredState.isComplete) {
      return;
    }

    const correctCount = ensuredState.answers.reduce((count, answer, index) => {
      const question = questions[index];
      if (!question) {
        return count;
      }
      if (!answer || !answer.isSubmitted || answer.selectedOptionIndex === null) {
        return count;
      }
      return count + (answer.selectedOptionIndex === question.answerIndex ? 1 : 0);
    }, 0);

    const totalQuestions = questions.length;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    let didUpdateScore = false;
    setPracticeQuizHistory((previous) => {
      let changed = false;
      const next = previous.map((entry) => {
        if (entry.generatedAt !== activePracticeRunId) {
          return entry;
        }

        const nextScore = {
          correct: correctCount,
          total: totalQuestions,
          percentage
        };

        if (
          !entry.score ||
          entry.score.correct !== nextScore.correct ||
          entry.score.total !== nextScore.total ||
          entry.score.percentage !== nextScore.percentage
        ) {
          changed = true;
          return { ...entry, score: nextScore };
        }

        return entry;
      });

      if (changed) {
        didUpdateScore = true;
        return next;
      }

      return previous;
    });

    if (didUpdateScore) {
      setActivePracticeRunId(null);
    }
  }, [practiceTopic, quizState, shuffledQuizzes, activePracticeRunId]);

  const triggerPracticeDatasetLoad = useCallback((csvContent: string | undefined, datasetName?: string): string | undefined => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const trimmed = csvContent ? csvContent.trim() : '';
    if (!trimmed) {
      return undefined;
    }

    const now = new Date();
    const timestamp = [
      now.getHours().toString().padStart(2, '0'),
      now.getMinutes().toString().padStart(2, '0'),
      now.getSeconds().toString().padStart(2, '0')
    ].join(':');
    const baseNameSource = datasetName && datasetName.length > 0
      ? datasetName
      : 'Personalized Practice Dataset';
    const baseName = `${baseNameSource} ${timestamp}`;

    const sanitizedName = (() => {
      const safeBase = baseName.replace(/[\\/*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
      const ensuredBase = safeBase.length > 0 ? safeBase : 'Personalized Practice Dataset';
      if (ensuredBase.toLowerCase().endsWith('.csv')) {
        return ensuredBase;
      }
      return `${ensuredBase}.csv`;
    })();

    const normalizedCsv = trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`;

    enqueuePracticeDatasetForDeferredLoad({
      name: sanitizedName,
      csvContent: normalizedCsv,
      savedAt: Date.now()
    });

    try {
      window.dispatchEvent(
        new CustomEvent('education-load-sample', {
          detail: {
            csvContent: normalizedCsv,
            name: sanitizedName
          }
        })
      );
    } catch (error) {
      console.error('[EducationOverlay] Failed to dispatch personalized dataset load request', error);
    }

    return sanitizedName;
  }, []);

  const generatePracticeQuiz = useCallback(async (anchor: string, options: { force?: boolean } = {}) => {
    if (!practiceTopic || anchor !== practiceTopic.anchor) {
      return;
    }

    const force = Boolean(options.force);

    if (!force && shuffledQuizzes[anchor]?.length) {
      return;
    }

    let shouldGenerate = true;
    setAsyncQuizStatus((previous) => {
      const current = previous[anchor];
      if (current?.isLoading) {
        shouldGenerate = false;
        return previous;
      }

      return {
        ...previous,
        [anchor]: { isLoading: true, error: null }
      };
    });

    if (!shouldGenerate) {
      return;
    }

    if (force) {
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
    }

    const normalizeWhitespace = (input: string) => input.replace(/\s+/g, ' ').trim();

    const completedConcepts = completedAnchors
      .map((completedAnchor) => topicMap.get(completedAnchor))
      .filter((topic): topic is Topic => Boolean(topic && topic.category !== 'practice'));

    const bookmarkedAnchorSet = new Set(bookmarkedAnchors);

    const completedBookmarkedConcepts = completedConcepts.filter((topic) => bookmarkedAnchorSet.has(topic.anchor));
    const completedUnbookmarkedConcepts = completedConcepts.filter((topic) => !bookmarkedAnchorSet.has(topic.anchor));

    const bookmarkedButPendingConcepts = bookmarkedTopics
      .filter((topic) => topic.category !== 'practice' && !completedAnchors.includes(topic.anchor));

    const panelStatusDescription = (() => {
      if (!isOpen) {
        return 'Education overlay currently closed.';
      }

      if (selectedTopicAnchor === practiceTopic?.anchor) {
        return detailTab === 'quiz'
          ? 'Practice panel open with the quiz tab active.'
          : 'Practice panel open with the overview tab active.';
      }

      if (selectedTopicAnchor) {
        const topic = topicMap.get(selectedTopicAnchor);
        return topic
          ? `Reviewing concept detail for "${topic.title}".`
          : 'Reviewing a concept detail panel.';
      }

      return 'Browsing the main education overlay.';
    })();

    const describeTopic = (topic: Topic) => {
      const summary = normalizeWhitespace(topic.description);
      return `${topic.title} — ${summary}`;
    };

    const learnerStatusLines: string[] = [`Panel status: ${panelStatusDescription}`];

    if (completedBookmarkedConcepts.length > 0) {
      learnerStatusLines.push('Completed & bookmarked lessons to emphasize:');
      completedBookmarkedConcepts.forEach((topic) => {
        learnerStatusLines.push(`- ${describeTopic(topic)}`);
      });
    }

    if (completedUnbookmarkedConcepts.length > 0) {
      learnerStatusLines.push('Other completed lessons:');
      completedUnbookmarkedConcepts.forEach((topic) => {
        learnerStatusLines.push(`- ${describeTopic(topic)}`);
      });
    }

    if (bookmarkedButPendingConcepts.length > 0) {
      learnerStatusLines.push('Bookmarked but still in progress:');
      bookmarkedButPendingConcepts.forEach((topic) => {
        learnerStatusLines.push(`- ${describeTopic(topic)}`);
      });
    }

    if (learnerStatusLines.length === 1) {
      learnerStatusLines.push('No completions logged yet; reinforce introductory spreadsheet literacy concepts.');
    }

    const emphasizeAnchors = completedBookmarkedConcepts.map((topic) => topic.anchor);
    const reinforceAnchors = completedUnbookmarkedConcepts.map((topic) => topic.anchor);
    const upcomingAnchors = bookmarkedButPendingConcepts.map((topic) => topic.anchor);

    const emphasizeTags = collectTagsForAnchors(emphasizeAnchors);
    const reinforceTags = collectTagsForAnchors(reinforceAnchors);
    const upcomingTags = collectTagsForAnchors(upcomingAnchors);

    const relevantAnchors = Array.from(new Set([...emphasizeAnchors, ...reinforceAnchors, ...upcomingAnchors]));
    const relevantTagDictionary = buildTagDictionaryForAnchors(relevantAnchors);
    const serializedTagDictionary = JSON.stringify(relevantTagDictionary, null, 2);

    const tagSignalLines = [
      emphasizeTags.length ? `Emphasize tags: ${emphasizeTags.join(', ')}` : 'Emphasize tags: none',
      reinforceTags.length ? `Reinforce tags: ${reinforceTags.join(', ')}` : 'Reinforce tags: none',
      upcomingTags.length ? `Upcoming tags: ${upcomingTags.join(', ')}` : 'Upcoming tags: none'
    ];

    const prompt = [
      '### Role',
      'You are Mango\'s adaptive data tutor supporting a beginner practicing spreadsheet literacy, data cleaning, exploration, and chart interpretation.',
      '### Objectives',
      '1. Generate an analysis-ready practice dataset as CSV (datasetCsv) that aligns with the highlighted lessons; draw from varied real-world table styles (monthly metrics, inventory logs, survey responses, operations trackers, budget snapshots, etc.).',
  '2. Draft between five and ten multiple-choice questions that require inspecting that CSV to answer correctly.',
      '### Output JSON Contract',
      '{',
      '  "datasetName": string,',
      '  "datasetCsv": string,',
      '  "questions": [',
      '    {',
      '      "question": string,',
      '      "options": string[4],',
      '      "answerIndex": number,',
      '      "feedback": { "correct": string, "incorrect": string },',
      '      "explanation"?: string',
      '    }',
      '  ],',
      '  "notes"?: string',
      '}',
      'Return only this JSON object—no Markdown, prose, or code fences. The datasetCsv value must contain newline-separated rows and comma-separated columns.',
      '### Constraints & Priorities',
  '- Ensure every question references datasetCsv directly and includes four plausible answer choices with exactly one correct option.',
  '- Deliver between five and ten total questions (aim for eight to ten when lesson coverage supports it).',
      '- Craft the datasetCsv first, then derive every question and both feedback lines directly from those rows—never invent facts beyond the table.',
      '- Verify the answerIndex aligns with the correct option by inspecting datasetCsv before responding; adjust options if anything conflicts.',
      '- Use the provided lesson tags to guide column selection, data narratives, and terminology; emphasize the set flagged as "Emphasize" while weaving in supporting tags.',
      '- Prioritize all completed lessons when selecting concepts, layering extra emphasis on the subset that is also bookmarked.',
  '- Craft succinct, question-specific feedback: one celebratory coaching line for correct answers and one constructive cue for incorrect answers.',
  '- Only ask about missing or blank cells when those exact blanks exist in datasetCsv, represented by empty fields (e.g., ",,"); insert them before drafting such questions.',
      '- Double-check each missing-value question against the final datasetCsv, ensuring the blank counts and column references match exactly.',
      '- Maintain internal numeric and logical consistency (totals match components, percentages correspond to counts, time ranges stay realistic).',
      '- Keep datasetCsv free of answer keys, solution notes, or spoiler columns.',
      '- Represent deliberately missing values as empty fields (e.g., ",,") rather than text placeholders.',
      '- If learner history is thin, default to foundational spreadsheet literacy while still fabricating a believable dataset suited to beginner analysis.'
    ].join('\n');

    const context = [
      '### Learner Status Summary',
      learnerStatusLines.join('\n'),
      '### Dataset Guidance',
  'Keep datasetCsv tidy, normalized, and ready for quick inspection inside Mango. Avoid adding fields that reveal quiz answers; instead, embed only scenario-relevant context. Each column referenced in a question must exist in the CSV and contain the evidence needed to identify the correct option. Validate the answerIndex against the final table before responding, and use the tag cues to choose realistic column names, units, and scenarios. When simulating missing values, leave the cell blank so the CSV contains consecutive delimiters (e.g., ",,"). If data-cleaning tags are emphasized or reinforced, deliberately seed two to four blanks in the relevant columns before writing questions so any missing-data prompts are truthful. Audit the finished table to confirm blank counts match the questions before you reply. You may vary structures beyond month/region (e.g., QA issues, ticket backlogs, marketing campaign metrics, budgeting scenarios, classroom attendance, survey scales) so long as the dataset supports the targeted completed lessons.',
      '### Lesson Tag Signals',
      tagSignalLines.join('\n'),
      '### Relevant Lesson Tags',
      'Keys correspond to lesson anchors; values list topical tags to incorporate into the dataset and questions.',
      serializedTagDictionary,
      '### Audience & Voice',
      'Beginner data learner practicing through Mango. Offer supportive, confidence-building framing while encouraging applied reasoning.'
    ].join('\n');

    try {
      const response = await requestPersonalizedPracticeQuiz({
        prompt,
        context
      });

      if (!response.success) {
        setAsyncQuizStatus((previous) => ({
          ...previous,
          [anchor]: {
            isLoading: false,
            error: response.error || 'Gemini could not generate the practice quiz.'
          }
        }));
        return;
      }

      const parsedResult = parsePracticeQuizContent(response.content);

      if (!parsedResult || parsedResult.questions.length === 0) {
        setAsyncQuizStatus((previous) => ({
          ...previous,
          [anchor]: {
            isLoading: false,
            error: 'Gemini returned an unexpected format. Please try again.'
          }
        }));
        return;
      }

      const limitedQuestions = parsedResult.questions.slice(0, 10);

      if (limitedQuestions.length < 5) {
        setAsyncQuizStatus((previous) => ({
          ...previous,
          [anchor]: {
            isLoading: false,
            error: 'Gemini returned fewer than 5 practice questions. Please try generating again.'
          }
        }));
        return;
      }

      if (!parsedResult.datasetCsv) {
        setAsyncQuizStatus((previous) => ({
          ...previous,
          [anchor]: {
            isLoading: false,
            error: 'Gemini did not include a dataset CSV. Please try generating again.'
          }
        }));
        return;
      }

      const datasetHasBlankCells = datasetContainsBlankCell(parsedResult.datasetCsv);
      const unsupportedMissingQuestion = limitedQuestions.find((question) => (
        questionMentionsMissingData(question) && !datasetHasBlankCells
      ));

      if (unsupportedMissingQuestion) {
        setAsyncQuizStatus((previous) => ({
          ...previous,
          [anchor]: {
            isLoading: false,
            error: 'Gemini referenced missing values, but the dataset does not include blank cells. Please regenerate.'
          }
        }));
        return;
      }

      const preparedQuestions = shuffleQuizQuestions(limitedQuestions);

      setShuffledQuizzes((previous) => ({
        ...previous,
        [anchor]: preparedQuestions
      }));

      setQuizState((previous) => ({
        ...previous,
        [anchor]: createDefaultQuizState(preparedQuestions.length)
      }));

      setAsyncQuizStatus((previous) => ({
        ...previous,
        [anchor]: { isLoading: false, error: null }
      }));

      const dispatchedName = triggerPracticeDatasetLoad(parsedResult.datasetCsv, parsedResult.datasetName);

      const practiceRunId = new Date().toISOString();
      const historyEntry: PracticeQuizHistoryEntry = {
        generatedAt: practiceRunId,
        datasetName: dispatchedName || parsedResult.datasetName || 'Personalized Practice Dataset',
        questionCount: preparedQuestions.length,
        emphasizeTags,
        reinforceTags,
        upcomingTags,
        notes: parsedResult.notes,
        questions: preparedQuestions
      };

  setPracticeQuizHistory((previous) => [historyEntry, ...previous].slice(0, 3));
      setActivePracticeRunId(practiceRunId);
      setExpandedHistoryIndex(null);
    } catch (error) {
  console.error('[EducationOverlay] Failed to generate practice quiz batch', error);
      setAsyncQuizStatus((previous) => ({
        ...previous,
        [anchor]: {
          isLoading: false,
          error: 'We could not reach Gemini. Check your network or API key and try again.'
        }
      }));
    }
  }, [
    practiceTopic,
    shuffledQuizzes,
    completedAnchors,
    topicMap,
    bookmarkedTopics,
    bookmarkedAnchors,
    selectedTopicAnchor,
    detailTab,
    isOpen,
    triggerPracticeDatasetLoad
  ]);

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
        if (selectedTopic.anchor === PRACTICE_TOPIC_ANCHOR) {
          void generatePracticeQuiz(selectedTopic.anchor);
        } else {
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
      }

      setDetailTab(tab);
    },
    [selectedTopic, generatePracticeQuiz]
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
      if (anchor === PRACTICE_TOPIC_ANCHOR) {
        void generatePracticeQuiz(anchor, { force: true });
        return;
      }

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
    [topicMap, generatePracticeQuiz]
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
  const isPracticeTopic = selectedTopic?.anchor === PRACTICE_TOPIC_ANCHOR;
  const practiceQuizAsyncState = selectedTopic ? asyncQuizStatus[selectedTopic.anchor] : undefined;
  const practiceQuizLoading = Boolean(isPracticeTopic && practiceQuizAsyncState?.isLoading);
  const practiceQuizErrorMessage = isPracticeTopic ? practiceQuizAsyncState?.error ?? null : null;
  const activeTopics = conceptTopics.filter((topic) => !isTopicCompleted(topic.anchor));
  const completedTopics = conceptTopics.filter((topic) => isTopicCompleted(topic.anchor));

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
                {practiceTopic && (
                  <div className="border border-blue-400/30 bg-slate-900/60 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-blue-200">Personalized Practice Quiz</h3>
                      <div className="flex overflow-hidden rounded border border-blue-400/40">
                        <button
                          type="button"
                          onClick={() => setPracticePanelTab('overview')}
                          className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                            practicePanelTab === 'overview'
                              ? 'bg-blue-600 text-white'
                              : 'text-blue-200 hover:bg-blue-700/40'
                          }`}
                        >
                          Overview
                        </button>
                        <button
                          type="button"
                          onClick={() => setPracticePanelTab('history')}
                          className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                            practicePanelTab === 'history'
                              ? 'bg-blue-600 text-white'
                              : 'text-blue-200 hover:bg-blue-700/40'
                          }`}
                        >
                          History
                        </button>
                      </div>
                    </div>

                    {practicePanelTab === 'overview' ? (
                      <>
                        <p className="mt-2 text-sm text-slate-300">
                          Come learn with our Gemini-powered practice workspace and see how Mango will build adaptive review questions from your current completed lessons. Your last 3 quizzes are saved!
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleLearn(practiceTopic.anchor)}
                            className="inline-flex items-center gap-2 bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-700"
                          >
                            Open practice panel and take a quiz
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 space-y-3 text-sm">
                        {practiceQuizHistory.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            No recent personalized quizzes yet. Generate a practice session to see it logged here.
                          </p>
                        ) : (
                          practiceQuizHistory.map((entry, index) => (
                            <div
                              key={`${entry.generatedAt}-${index}`}
                              className="border border-blue-400/30 bg-slate-900/80 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-blue-200">
                                <span>Quiz {index + 1}</span>
                                <span>{practiceHistoryFormatter.format(new Date(entry.generatedAt))}</span>
                              </div>
                              <p className="mt-2 text-sm font-semibold text-slate-100">{entry.datasetName}</p>
                              <p className="mt-1 text-xs text-slate-300">{entry.questionCount} questions drafted</p>
                              <p className="text-xs text-slate-300">
                                <span className="font-semibold text-blue-200">Score:</span>{' '}
                                {entry.score
                                  ? `${entry.score.correct}/${entry.score.total} (${entry.score.percentage}%)`
                                  : 'In progress'}
                              </p>
                              <div className="mt-3 space-y-1 text-xs">
                                <p className="text-slate-300">
                                  <span className="font-semibold text-blue-200">Emphasize:</span>{' '}
                                  {entry.emphasizeTags.length ? entry.emphasizeTags.join(', ') : 'none'}
                                </p>
                                <p className="text-slate-300">
                                  <span className="font-semibold text-blue-200">Reinforce:</span>{' '}
                                  {entry.reinforceTags.length ? entry.reinforceTags.join(', ') : 'none'}
                                </p>
                                <p className="text-slate-300">
                                  <span className="font-semibold text-blue-200">Upcoming:</span>{' '}
                                  {entry.upcomingTags.length ? entry.upcomingTags.join(', ') : 'none'}
                                </p>
                              </div>
                              {entry.notes && (
                                <p className="mt-3 text-xs text-slate-400">
                                  <span className="font-semibold text-blue-200">Notes:</span> {entry.notes}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => setExpandedHistoryIndex((prev) => (prev === index ? null : index))}
                                className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-300 underline underline-offset-2 transition hover:text-blue-100"
                              >
                                {expandedHistoryIndex === index ? 'Hide questions & answers' : 'View questions & answers'}
                              </button>
                              {expandedHistoryIndex === index && entry.questions.length > 0 && (
                                <div className="mt-3 space-y-4 text-xs text-slate-200">
                                  <ol className="space-y-3 list-decimal pl-5">
                                    {entry.questions.map((question, questionIndex) => (
                                      <li key={`${entry.generatedAt}-question-${questionIndex}`}>
                                        <p className="font-semibold text-slate-100">{question.question}</p>
                                        <ul className="mt-2 space-y-1 list-disc pl-5 text-slate-300">
                                          {question.options.map((option, optionIndex) => {
                                            const isCorrect = optionIndex === question.answerIndex;
                                            return (
                                              <li
                                                key={`${entry.generatedAt}-question-${questionIndex}-option-${optionIndex}`}
                                                className={isCorrect ? 'text-emerald-300' : undefined}
                                              >
                                                <span className="font-semibold text-slate-400">{String.fromCharCode(65 + optionIndex)}.</span>{' '}
                                                {option}
                                                {isCorrect && <span className="ml-2 text-emerald-300">(correct)</span>}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                        {(question.feedbackCorrect || question.feedbackIncorrect) && (
                                          <div className="mt-2 space-y-1 text-slate-300">
                                            {question.feedbackCorrect && (
                                              <p>
                                                <span className="font-semibold text-emerald-300">Correct:</span>{' '}
                                                {question.feedbackCorrect}
                                              </p>
                                            )}
                                            {question.feedbackIncorrect && (
                                              <p>
                                                <span className="font-semibold text-rose-300">Incorrect:</span>{' '}
                                                {question.feedbackIncorrect}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                        {question.explanation && (
                                          <p className="mt-1 text-slate-300">
                                            <span className="font-semibold text-blue-200">Explanation:</span>{' '}
                                            {question.explanation}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                            <p className="font-semibold">
                              {isCurrentCorrect ? 'Correct!' : 'Not quite.'}
                            </p>
                            <p className="mt-2 text-[11px] text-slate-100/90">
                              {isCurrentCorrect
                                ? currentQuizQuestion.feedbackCorrect ?? currentQuizQuestion.explanation ?? 'Great job interpreting the dataset to justify your answer.'
                                : currentQuizQuestion.feedbackIncorrect ?? currentQuizQuestion.explanation ?? 'Take another look at the dataset and compare each option carefully.'}
                            </p>
                            {currentQuizQuestion.explanation &&
                              (currentQuizQuestion.feedbackCorrect || currentQuizQuestion.feedbackIncorrect) &&
                              currentQuizQuestion.explanation !== currentQuizQuestion.feedbackCorrect &&
                              currentQuizQuestion.explanation !== currentQuizQuestion.feedbackIncorrect && (
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
                ) : isPracticeTopic ? (
                  <div className="flex h-full flex-col gap-4 rounded border border-dashed border-blue-400/40 bg-slate-800/40 p-4 text-sm text-slate-100">
                    {practiceQuizLoading ? (
                      <>
                        <p className="font-semibold text-blue-200">Generating a practice quiz…</p>
                        <p className="text-xs text-slate-300">Hang tight while we craft a 5-10 question quiz grounded in a fresh dataset tailored to your progress.</p>
                      </>
                    ) : practiceQuizErrorMessage ? (
                      <>
                        <p className="font-semibold text-rose-300">We couldn’t generate a quiz.</p>
                        <p className="text-xs text-slate-300">{practiceQuizErrorMessage}</p>
                        <div>
                          <button
                            type="button"
                            onClick={() => selectedTopic && generatePracticeQuiz(selectedTopic.anchor, { force: true })}
                            className="mt-2 inline-flex items-center gap-2 border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-600 hover:text-white"
                          >
                            Try again
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-blue-200">Ready for a personalized quiz?</p>
                        <p className="text-xs text-slate-300">
                          We’ll ask Gemini for a 5-10 question multiple-choice quiz aligned with your bookmarks and completed lessons. Each batch includes four answer choices per question, dual feedback, and a generated CSV that loads directly into Mango.
                        </p>
                        <div>
                          <button
                            type="button"
                            onClick={() => selectedTopic && generatePracticeQuiz(selectedTopic.anchor, { force: true })}
                            className="mt-2 inline-flex items-center gap-2 bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-blue-700"
                          >
                            Generate quiz
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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
            {isPracticeTopic && selectedTopic && (
              <button
                type="button"
                onClick={() => generatePracticeQuiz(selectedTopic.anchor, { force: true })}
                disabled={practiceQuizLoading}
                className={`inline-flex items-center gap-2 border border-blue-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                  practiceQuizLoading
                    ? 'cursor-not-allowed border-blue-400/70 text-slate-500'
                    : 'text-blue-200 hover:bg-blue-600 hover:text-white'
                }`}
              >
                {practiceQuizLoading ? 'Generating…' : 'Regenerate quiz'}
              </button>
            )}
            {!isPracticeTopic && (
              <>
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
              </>
            )}
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