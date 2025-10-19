// Standardized panel dimensions
export const PANEL_SIZES = {
  // Default sizes for consistent aesthetics
  SMALL: { width: 320, height: 240 },
  MEDIUM: { width: 450, height: 360 },
  LARGE: { width: 600, height: 480 },
  XLARGE: { width: 750, height: 600 },
  
  // Collapsed sizes (same for all panel types)
  COLLAPSED: { width: 320, height: 80 },
  
  // Specific panel configurations
  DATASET: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 480, height: 360 }
  },
  GRAPH: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 540, height: 400 }
  },
  MODEL: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 540, height: 420 }
  },
  MODEL_RESULTS: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 620, height: 480 }
  },
  MODEL_VISUALIZATION: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 520, height: 400 }
  },
  DATA_MANIPULATION: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 500, height: 380 }
  },
  DATA_EDITOR: { 
    collapsed: { width: 300, height: 72 },
    expanded: { width: 520, height: 400 }
  },
  MERGE: {
    collapsed: { width: 320, height: 90 },
    expanded: { width: 560, height: 420 }
  }
};