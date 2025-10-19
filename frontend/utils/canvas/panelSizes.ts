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
    collapsed: { width: 320, height: 80 },
    expanded: { width: 600, height: 500 }  // Much larger for full content
  },
  GRAPH: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 650, height: 550 }  // Larger for chart viewing
  },
  MODEL: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 550, height: 450 }  // More space for model options
  },
  MODEL_RESULTS: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 700, height: 600 }  // Large for results viewing
  },
  MODEL_VISUALIZATION: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 550, height: 440 }
  },
  DATA_MANIPULATION: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 450, height: 360 }
  },
  DATA_EDITOR: { 
    collapsed: { width: 320, height: 80 },
    expanded: { width: 450, height: 360 }
  }
};