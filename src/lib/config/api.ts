// ============================================
// mAI Caddy — API Configuration
// ============================================
// All external API endpoints and settings.

export const API_ENDPOINTS = {
  /** GolfCourseAPI base URL */
  golfCourseApi: 'https://api.golfcourseapi.com/v1',

  /** OpenWeather API base URL (future integration) */
  openWeather: 'https://api.openweathermap.org/data/2.5',
} as const;

export const API_SETTINGS = {
  /** Minimum characters before triggering course search */
  courseSearchMinLength: 2,

  /** Debounce delay (ms) for course search input */
  courseSearchDebounceMs: 400,

  /** Max course search results to display */
  courseSearchMaxResults: 8,

  /** GolfCourseAPI free tier: 300 requests/day */
  golfApiDailyLimit: 300,
} as const;
