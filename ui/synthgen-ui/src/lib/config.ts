// Helper function to get API URL from localStorage or fallback to environment variable
export const getApiUrl = (): string => {
    if (typeof window !== 'undefined') {
        const storedApiUrl = localStorage.getItem('api_url');
        if (storedApiUrl) return storedApiUrl;
    }
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

// Don't store as a constant - removed static API_URL assignment
export const API_PORT = process.env.NEXT_PUBLIC_API_PORT || '8000';
export const API_SECRET_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY;

// Calculate the base URL with proper port handling - now calling getApiUrl() each time
export const getBaseUrl = (): string => {
    const apiUrl = getApiUrl();
    // Check if API_URL already has a port specified
    if (apiUrl.includes(':8') || apiUrl.includes(':9')) {
        return apiUrl;
    }
    return `${apiUrl}${API_PORT ? `:${API_PORT}` : ''}`;
};

// API endpoints - now a function instead of a constant
export const getApiBaseUrl = (): string => getBaseUrl();

// Application settings
export const APP_TITLE = 'SynthGen Monitoring';
export const DEFAULT_THEME = 'system';