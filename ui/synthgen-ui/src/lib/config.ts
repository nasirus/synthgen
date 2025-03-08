export const API_URL = process.env.API_URL || 'http://localhost';
export const API_PORT = process.env.API_PORT || '8002';
export const API_SECRET_KEY = process.env.API_SECRET_KEY;

// Calculate the base URL with proper port handling
export const getBaseUrl = (): string => {
    // Check if API_URL already has a port specified
    if (API_URL.includes(':8') || API_URL.includes(':9')) {
        return API_URL;
    }
    return `${API_URL}${API_PORT ? `:${API_PORT}` : ''}`;
};

// API endpoints
export const API_BASE_URL = `${getBaseUrl()}`;

// Application settings
export const APP_TITLE = 'SynthGen';
export const DEFAULT_THEME = 'dark'; 