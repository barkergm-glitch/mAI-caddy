// ============================================
// mAI Caddy — GolfCourseAPI Integration
// ============================================
// Fetches real course data: hole layouts, par, yardage,
// handicap index, tee box data, course/slope rating.
// API docs: https://api.golfcourseapi.com/docs/api
//
// Endpoints:
//   Search:  GET /v1/search?search_query=pinehurst
//   Detail:  GET /v1/courses/{id}
//   Auth:    Authorization: Key {apiKey}

import { CourseData, HoleData } from '@/lib/types';

const BASE_URL = 'https://api.golfcourseapi.com/v1';

function getApiKey(): string {
  const key = process.env.GOLF_COURSE_API_KEY;
  if (!key) {
    throw new Error('GOLF_COURSE_API_KEY not set in environment variables');
  }
  return key;
}

function authHeaders(): Record<string, string> {
  return { 'Authorization': `Key ${getApiKey()}` };
}

// --- API Response Types (matching actual GolfCourseAPI schema) ---

interface APISearchCourse {
  id: number;
  club_name?: string;
  course_name?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface APIHole {
  par: number;
  yardage: number;
  handicap?: number;
}

interface APITeeBox {
  tee_name?: string;
  course_rating?: number;
  slope_rating?: number;
  bogey_rating?: number;
  total_yards?: number;
  total_meters?: number;
  number_of_holes?: number;
  par_total?: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  holes?: APIHole[];
}

interface APICourseDetail {
  id: number;
  club_name?: string;
  course_name?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    female?: APITeeBox[];
    male?: APITeeBox[];
  };
}

// --- Helpers ---

/**
 * Pick the best tee box from the API response.
 * Prefers male tees, falls back to female. Returns the first tee set with holes.
 */
function pickBestTeeBox(tees?: APICourseDetail['tees']): APITeeBox | null {
  if (!tees) return null;

  // Try male tees first, then female
  const candidates = [...(tees.male || []), ...(tees.female || [])];
  // Prefer a tee box that actually has hole data
  return candidates.find(t => t.holes && t.holes.length > 0) || candidates[0] || null;
}

/**
 * Convert API holes (positional, no hole number) to our HoleData format
 */
function normalizeHoles(apiHoles: APIHole[]): HoleData[] {
  return apiHoles.map((h, index) => ({
    holeNumber: index + 1,
    par: h.par || 4,
    yardage: h.yardage || 0,
    strokeIndex: h.handicap || (index + 1),
    // GolfCourseAPI doesn't provide coordinates per hole
    greenLat: undefined,
    greenLon: undefined,
    teeLat: undefined,
    teeLon: undefined,
  }));
}

// --- Public API Functions ---

/**
 * Search for golf courses by name
 */
export async function searchCourses(query: string): Promise<{
  id: string;
  name: string;
  city?: string;
  state?: string;
  lat?: number;
  lon?: number;
}[]> {
  const response = await fetch(
    `${BASE_URL}/search?search_query=${encodeURIComponent(query)}`,
    { headers: authHeaders() }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid GolfCourseAPI key. Check your GOLF_COURSE_API_KEY.');
    }
    if (response.status === 429) {
      throw new Error('GolfCourseAPI rate limit reached. Try again later.');
    }
    throw new Error(`GolfCourseAPI error: ${response.status}`);
  }

  const data = await response.json();
  const courses: APISearchCourse[] = data.courses || [];

  return courses.map(c => ({
    id: String(c.id),
    name: c.course_name || c.club_name || 'Unknown Course',
    city: c.location?.city,
    state: c.location?.state,
    lat: c.location?.latitude,
    lon: c.location?.longitude,
  }));
}

/**
 * Get full course details including all holes
 */
export async function getCourseDetails(courseId: string): Promise<CourseData> {
  const response = await fetch(
    `${BASE_URL}/courses/${courseId}`,
    { headers: authHeaders() }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid GolfCourseAPI key.');
    }
    if (response.status === 429) {
      throw new Error('GolfCourseAPI rate limit reached.');
    }
    throw new Error(`GolfCourseAPI error: ${response.status}`);
  }

  const course: APICourseDetail = await response.json();

  // Pick the best tee box and extract hole data
  const teeBox = pickBestTeeBox(course.tees);
  const holes = teeBox?.holes ? normalizeHoles(teeBox.holes) : [];

  return {
    id: String(course.id),
    name: course.course_name || course.club_name || 'Unknown Course',
    city: course.location?.city,
    state: course.location?.state,
    country: course.location?.country,
    holes,
    courseRating: teeBox?.course_rating,
    slopeRating: teeBox?.slope_rating,
  };
}

/**
 * Get data for a specific hole
 */
export async function getHoleData(courseId: string, holeNumber: number): Promise<HoleData | null> {
  const course = await getCourseDetails(courseId);
  return course.holes.find(h => h.holeNumber === holeNumber) || null;
}
