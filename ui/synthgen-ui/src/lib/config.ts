// Helper function to get API URL from localStorage or fallback to environment variable
export const getApiUrl = (): string => {
    const storedApiUrl = localStorage.getItem('api_url');
    return storedApiUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

// Don't store as a constant - removed static API_URL assignment
export const API_PORT = process.env.NEXT_PUBLIC_API_PORT || '8000';
export const API_SECRET_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY;

// Calculate the base URL with proper port handling - now calling getApiUrl() each time
export const getBaseUrl = (): string => {
    const apiUrl = getApiUrl();
    
    // Check if URL has a port using regex - simpler approach to avoid linting issues
    const hasPort = /:[0-9]+/.test(apiUrl);
    
    // If it already has a port, use it as is
    if (hasPort) {
        return apiUrl;
    }
    
    // Otherwise, append the port from environment (if specified)
    return `${apiUrl}${API_PORT ? `:${API_PORT}` : ''}`;
};

// API endpoints - now a function instead of a constant
export const getApiBaseUrl = (): string => getBaseUrl();

// Application settings
export const APP_TITLE = 'SynthGen Monitoring';
export const DEFAULT_THEME = 'system';