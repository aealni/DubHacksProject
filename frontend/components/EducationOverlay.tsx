import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

type QuizState = {
  questionIndex: number;
  selectedOptionIndex: number | null;
  isSubmitted: boolean;
};

type ResizeMode = 'both' | 'horizontal-left';

const topics: Topic[] = [
  {
    title: 'Interpreting CSV Files',
    description: 'Spot column types, delimiters, and hidden quality issues.',
    anchor: '#interpreting-csv-files',
    detail: [
      'Inspect header rows for typos and duplicate column names. Many CSVs ship with inconsistent casing or trailing whitespace that can break column lookups.',
      'Scan several sample rows to confirm delimiters stayed intact during export. Commas embedded inside quoted strings often create silent column shifts.'
    ],
    quiz: [
      {
        question: 'Which quick check helps confirm delimiter integrity in a CSV export?',
        options: [
          'Scanning a few sample rows to ensure commas remain inside quoted values',
          'Relying on the file extension reported by the operating system',
          'Counting how many characters appear in the header line'
        ],
        answerIndex: 0,
        explanation: 'Previewing sample rows surfaces delimiter issues immediately.'
      }
    ]
  },
  {
    title: 'Data Cleaning Basics',
    description: 'Identify missing values, outliers, and malformed records.',
    anchor: '#data-cleaning-basics',
    detail: [
      'Start by profiling null counts per column and the distribution of categorical values. This exposes easy wins for validation rules or type casting.',
      'Document every transformation you make so teammates understand how raw data differs from what they see in the workspace.'
    ],
    quiz: [
      {
        question: 'Which early activity reveals opportunities for validation rules and type casting?',
        options: [
          'Profiling null counts and categorical distributions',
          'Jumping straight into training a predictive model',
          'Skipping documentation to save preparation time'
        ],
        answerIndex: 0,
        explanation: 'Profiling the data exposes null patterns and category balance before transformation.'
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
      }
    ]
  }
];

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
  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
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

const createDefaultQuizState = (): QuizState => ({
  questionIndex: 0,
  selectedOptionIndex: null,
  isSubmitted: false
});

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
        const availableWidth = Math.max(window.innerWidth - DETAIL_MARGIN * 2, 120);
        const availableHeight = Math.max(window.innerHeight - DETAIL_MARGIN * 2, 160);
        const initialWidth = Math.min(DEFAULT_DETAIL_SIZE.width, availableWidth);
        const initialHeight = Math.min(DEFAULT_DETAIL_SIZE.height, availableHeight);
        setDetailSize({ width: initialWidth, height: initialHeight });
      }

      if (detailPosition === null) {
        const width = detailSize?.width ?? Math.min(DEFAULT_DETAIL_SIZE.width, Math.max(window.innerWidth - DETAIL_MARGIN * 2, 120));
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
  }, [selectedTopic, detailPosition, detailSize]);

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
      const availableHeight = Math.max(viewportHeight - DETAIL_MARGIN * 2, 160);

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
    setDetailTab('content');
    setDetailPageIndex(0);
    setSelectedTopicAnchor(anchor);
    setLastSelectedTopicAnchor(anchor);
    onRequestCloseMainOverlay?.();
  };

  const handleCloseDetail = () => {
    setDetailTab('content');
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
    (anchor: string, updater: (prev: QuizState) => QuizState) => {
      setQuizState((prev) => {
        const previous = prev[anchor] ?? createDefaultQuizState();
        return {
          ...prev,
          [anchor]: updater(previous)
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
        setQuizState((prev) => {
          if (prev[selectedTopic.anchor]) {
            return prev;
          }

          return {
            ...prev,
            [selectedTopic.anchor]: createDefaultQuizState()
          };
        });
      }

      setDetailTab(tab);
    },
    [selectedTopic]
  );

  const handleQuizOptionChange = useCallback(
    (anchor: string, optionIndex: number) => {
      updateQuizState(anchor, (prev) => ({
        ...prev,
        selectedOptionIndex: optionIndex,
        isSubmitted: false
      }));
    },
    [updateQuizState]
  );

  const handleQuizSubmit = useCallback(
    (anchor: string) => {
      updateQuizState(anchor, (prev) => {
        if (prev.selectedOptionIndex === null) {
          return prev;
        }

        return {
          ...prev,
          isSubmitted: true
        };
      });
    },
    [updateQuizState]
  );

  const handleQuizNextQuestion = useCallback(
    (anchor: string, totalQuestions: number) => {
      updateQuizState(anchor, (prev) => {
        const nextIndex = Math.min(totalQuestions - 1, prev.questionIndex + 1);
        if (nextIndex === prev.questionIndex) {
          return prev;
        }

        return {
          questionIndex: nextIndex,
          selectedOptionIndex: null,
          isSubmitted: false
        };
      });
    },
    [updateQuizState]
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
  const topicQuizState = selectedTopic
    ? quizState[selectedTopic.anchor] ?? createDefaultQuizState()
    : undefined;
  const currentQuizQuestion = selectedTopic && topicQuizState
    ? selectedTopic.quiz[Math.min(topicQuizState.questionIndex, selectedTopic.quiz.length - 1)]
    : undefined;

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
          <div className="relative mt-8 mb-24 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-300/40 bg-slate-900/95 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                onClose();
              }}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-amber-400 text-lg text-amber-200 transition hover:bg-amber-400 hover:text-slate-950"
              aria-label="Close education overlay"
            >
              X
            </button>
            <div className="no-scrollbar h-full max-h-[90vh] space-y-6 overflow-y-auto p-8 pr-6 text-left text-slate-100">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.4em] text-amber-300">Education Mode</p>
                <h2 className="text-3xl font-semibold">Welcome to the Mango Learning Hub</h2>
                <p className="text-sm text-slate-300">
                  This guided overlay highlights topics to explore while you experiment inside the workspace. Use it as a
                  quick reference or a starting point for a structured session.
                </p>
              </div>
              <div className="rounded-xl border border-amber-300/30 bg-slate-900/60 p-6">
                <h3 className="text-lg font-semibold text-amber-200">Bookmarks</h3>
                {bookmarkedTopics.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Tap <span className="font-semibold text-amber-100">Bookmark</span> on any topic to collect it here for quick access.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {bookmarkedTopics.map((topic) => {
                      const completed = isTopicCompleted(topic.anchor);
                      return (
                        <li key={`bookmark-${topic.anchor}`} className="rounded-lg border border-slate-700/60 bg-slate-800/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <button
                                type="button"
                                onClick={() => handleLearn(topic.anchor)}
                                className="text-left text-sm font-medium text-amber-200 transition hover:text-amber-100"
                              >
                                {topic.title}
                              </button>
                              <p className="mt-1 text-xs text-slate-400">{topic.description}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveBookmark(topic.anchor)}
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-300 text-xs text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                              aria-label={`Remove ${topic.title} from bookmarks`}
                            >
                              X
                            </button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleLearn(topic.anchor)}
                                className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                              >
                                Learn topic
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBookmarkToggle(topic.anchor)}
                                className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                              >
                                {bookmarkedAnchors.includes(topic.anchor) ? 'Unbookmark topic' : 'Bookmark topic'}
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
                                className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                              >
                                {completed ? 'Mark incomplete' : 'Mark complete'}
                              </button>
                            </div>
                            {completed && (
                              <div className="ml-auto">
                                <CompletedBadge />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
                <h3 className="text-lg font-semibold text-amber-200">Concepts</h3>
                <p className="mb-4 text-xs text-slate-400">
                  Each section links to a concept you can explore. Future updates will include interactive walkthroughs and
                  workspace checkpoints.
                </p>
                <ul className="space-y-3">
                  {topics.map((topic) => {
                    const completed = isTopicCompleted(topic.anchor);
                    return (
                      <li
                        key={topic.anchor}
                        className="flex flex-col rounded-lg border border-slate-700/60 bg-slate-800/60 p-4 transition hover:border-amber-300/60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-base font-medium text-slate-100">{topic.title}</span>
                          {completed && <CompletedBadge />}
                        </div>
                        <p className="mt-1 text-sm text-slate-300">{topic.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleLearn(topic.anchor)}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                          >
                            Learn topic
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBookmarkToggle(topic.anchor)}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                          >
                            {bookmarkedAnchors.includes(topic.anchor) ? 'Unbookmark topic' : 'Bookmark topic'}
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
                            className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                          >
                            {completed ? 'Mark incomplete' : 'Mark Complete'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
             
            </div>
          </div>
        </div>
      )}

      {selectedTopic && (
        <aside
          ref={detailRef}
          tabIndex={0}
          className="pointer-events-auto fixed z-[5000] flex flex-col rounded-2xl border border-amber-300/40 bg-slate-900/95 p-6 shadow-xl outline-none focus:outline-none"
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
              <p className="text-xs uppercase tracking-[0.4em] text-amber-300">Focus Topic</p>
              <div className="mt-1 flex items-center gap-2">
                <h3 className="text-2xl font-semibold text-slate-100">{selectedTopic.title}</h3>
                {detailCompleted && <CompletedBadge />}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseDetail}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-400 text-sm text-amber-200 transition hover:bg-amber-400 hover:text-slate-900"
              aria-label="Close topic details"
            >
              X
            </button>
          </div>
          <div className="mt-4 flex gap-2 rounded-full bg-slate-800/60 p-1">
            <button
              type="button"
              onClick={() => handleDetailTabChange('content')}
              className={`flex-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                detailTab === 'content'
                  ? 'bg-amber-300 text-slate-900 shadow-sm'
                  : 'text-amber-200 hover:text-amber-100'
              }`}
            >
              Topic Notes
            </button>
            <button
              type="button"
              onClick={() => handleDetailTabChange('quiz')}
              className={`flex-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                detailTab === 'quiz'
                  ? 'bg-amber-300 text-slate-900 shadow-sm'
                  : 'text-amber-200 hover:text-amber-100'
              }`}
            >
              Quiz Now
            </button>
          </div>
          <div className="mt-4 flex-1 overflow-hidden">
            {detailTab === 'content' ? (
              <div className="flex h-full flex-col">
                <div className="flex-1 overflow-y-auto no-scrollbar text-sm text-slate-200">
                  {currentDetailContent ? (
                    <p>{currentDetailContent}</p>
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
                          className={`flex h-8 w-8 items-center justify-center rounded-full border border-amber-300 text-xs font-semibold transition ${
                            isActive
                              ? 'cursor-default bg-amber-300 text-slate-900 shadow-sm'
                              : 'text-amber-200 hover:bg-amber-300 hover:text-slate-900'
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
                {currentQuizQuestion ? (
                  <>
                    <p className="text-sm font-semibold text-amber-200">{currentQuizQuestion.question}</p>
                    <div className="mt-3 flex-1 overflow-y-auto no-scrollbar space-y-2">
                      {currentQuizQuestion.options.map((option, optionIndex) => {
                        const checked = topicQuizState?.selectedOptionIndex === optionIndex;
                        return (
                          <label
                            key={`${selectedTopic.anchor}-quiz-option-${optionIndex}`}
                            className={`flex items-center gap-3 rounded-lg border border-amber-300/30 bg-slate-800/60 p-3 transition ${
                              checked ? 'border-amber-300/70' : 'hover:border-amber-300/60'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`quiz-${selectedTopic.anchor}`}
                              value={optionIndex}
                              checked={checked}
                              onChange={() => handleQuizOptionChange(selectedTopic.anchor, optionIndex)}
                              className="h-4 w-4 border-amber-300 text-amber-400 focus:ring-amber-400"
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleQuizSubmit(selectedTopic.anchor)}
                        disabled={topicQuizState?.selectedOptionIndex === null || topicQuizState?.isSubmitted}
                        className={`rounded-full border border-amber-300 px-3 py-1 font-semibold uppercase tracking-wide transition ${
                          topicQuizState?.selectedOptionIndex === null || topicQuizState?.isSubmitted
                            ? 'cursor-not-allowed text-slate-500'
                            : 'text-amber-200 hover:bg-amber-300 hover:text-slate-900'
                        }`}
                      >
                        Check answer
                      </button>
                      {topicQuizState?.isSubmitted && topicQuizState.questionIndex < (selectedTopic.quiz.length - 1) && (
                        <button
                          type="button"
                          onClick={() => handleQuizNextQuestion(selectedTopic.anchor, selectedTopic.quiz.length)}
                          className="rounded-full border border-amber-300 px-3 py-1 font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
                        >
                          Next question
                        </button>
                      )}
                    </div>
                    {topicQuizState?.isSubmitted && (
                      <div
                        className={`mt-3 rounded-lg border p-3 text-xs ${
                          topicQuizState.selectedOptionIndex === currentQuizQuestion.answerIndex
                            ? 'border-emerald-400/60 text-emerald-200'
                            : 'border-amber-400/60 text-amber-200'
                        }`}
                      >
                        <p>
                          {topicQuizState.selectedOptionIndex === currentQuizQuestion.answerIndex
                            ? 'Correct! Nice work.'
                            : 'Not quite. Review the notes and try again.'}
                        </p>
                        {currentQuizQuestion.explanation && (
                          <p className="mt-2 text-[11px] text-slate-300">{currentQuizQuestion.explanation}</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Quiz content coming soon.</p>
                )}
              </div>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleBookmarkToggle(selectedTopic.anchor)}
              className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
            >
              {bookmarkedAnchors.includes(selectedTopic.anchor) ? 'Unbookmark' : 'Bookmark'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (detailCompleted) {
                  handleMarkIncomplete(selectedTopic.anchor);
                } else {
                  handleMarkComplete(selectedTopic.anchor);
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
            >
              {detailCompleted ? 'Mark incomplete' : 'Mark complete'}
            </button>
            {!isOpen && onOpenMainOverlay && (
              <button
                type="button"
                onClick={onOpenMainOverlay}
                className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200 transition hover:bg-amber-300 hover:text-slate-900"
              >
                Home
              </button>
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
            className="absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 transform cursor-ew-resize"
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
