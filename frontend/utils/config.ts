// Environment configuration for Mango
declare const process: any;

interface Config {
  apiUrl: string;
  environment: string;
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
  features: {
    analytics: boolean;
    debugMode: boolean;
    devTools: boolean;
  };
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
  };
  build: {
    version: string;
    buildTime: string;
    commitHash: string;
  };
}

const getEnvVar = (key: string, defaultValue: string = ''): string => {
  try {
    return process?.env?.[key] || defaultValue;
  } catch {
    return defaultValue;
  }
};

export const config: Config = {
  apiUrl: getEnvVar('NEXT_PUBLIC_API_URL', 'http://localhost:8000'),
  environment: getEnvVar('NEXT_PUBLIC_ENVIRONMENT', 'development'),
  
  // Environment checks
  get isDevelopment() { 
    return this.environment === 'development';
  },
  get isStaging() { 
    return this.environment === 'staging';
  },
  get isProduction() { 
    return this.environment === 'production';
  },
  
  // Feature flags based on environment
  get features() {
    return {
      analytics: this.environment === 'production',
      debugMode: this.environment !== 'production',
      devTools: this.environment === 'development',
    };
  },
  
  // API configuration
  get api() {
    return {
      baseUrl: this.apiUrl,
      timeout: 30000, // 30 seconds
      retries: 3,
    };
  },
  
  // Build information
  get build() {
    return {
      version: getEnvVar('NEXT_PUBLIC_APP_VERSION', '1.0.0'),
      buildTime: getEnvVar('NEXT_PUBLIC_BUILD_TIME', new Date().toISOString()),
      commitHash: getEnvVar('NEXT_PUBLIC_COMMIT_HASH', 'unknown'),
    };
  }
};

// Environment-specific API URLs
export const getApiUrl = (endpoint: string = '') => {
  const baseUrl = config.api.baseUrl.replace(/\/$/, ''); // Remove trailing slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
};

// Debug logging (only in non-production)
export const debugLog = (...args: any[]) => {
  if (config.features.debugMode) {
    console.log('[Mango Debug]:', ...args);
  }
};

export default config;
