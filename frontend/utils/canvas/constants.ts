// Canvas configuration constants
export const GRID_SIZE = 20;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;

// Screen-based snapping configuration
export const SCREEN_DPI = 96; // standard CSS px per inch approximation
export const SNAP_DETECT_INCHES = 0.8;      // show guides within 0.8 inch (increased for better detection)
export const SNAP_ACTIVATE_INCHES = 0.15; // strong snap inside ~0.15 inch (reduced for easier disconnection)
export const SNAP_DETECT_PX = SCREEN_DPI * SNAP_DETECT_INCHES;      // ~77px
export const SNAP_ACTIVATE_PX = SCREEN_DPI * SNAP_ACTIVATE_INCHES;  // ~14px

// Additional snap behavior tuning
export const SNAP_SWITCH_PX = SNAP_ACTIVATE_PX * 0.8; // allow switching when within this radius of a new closer target (easier switching)
export const SNAP_HYSTERESIS_PX = SNAP_ACTIVATE_PX * 0.7; // keep current snap until cursor drifts beyond this (much easier unsnapping)
export const DISCONNECT_DISTANCE_PX = SNAP_ACTIVATE_PX * 2; // disconnect when dragged this far from snap point
export const ALIGN_THRESHOLD_PX = 8; // alignment snap threshold (screen px)

// Debug flag for snapping instrumentation
export const DEBUG_SNAP = true; // Temporarily enabled to test blue lines