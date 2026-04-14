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

import { CourseData, HoleData, TeeBoxData } from '@/lib/types';

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
 * Unwrap the course payload. The GolfCourseAPI /v1/courses/{id} endpoint
 * returns the course wrapped in a `course` envelope — older/alternate
 * responses may return it flat. Handle both.
 */
function unwrapCourse(raw: unknown): APICourseDetail {
  if (!raw || typeof raw !== 'object') return {} as APICourseDetail;
  const obj = raw as Record<string, unknown>;
  if (obj.course && typeof obj.course === 'object') return obj.course as APICourseDetail;
  return raw as APICourseDetail;
}

/**
 * Flatten the API tees object/array into our TeeBoxData[] shape,
 * preserving order and tagging male/female where the source shape
 * provides it.
 */
function flattenTees(tees?: APICourseDetail['tees'] | APITeeBox[]): { sex?: 'male' | 'female'; t: APITeeBox }[] {
  if (!tees) return [];
  if (Array.isArray(tees)) return tees.map(t => ({ t }));
  const out: { sex?: 'male' | 'female'; t: APITeeBox }[] = [];
  for (const t of tees.male || []) out.push({ sex: 'male', t });
  for (const t of tees.female || []) out.push({ sex: 'female', t });
  return out;
}

/**
 * Pick the best tee box from the API response.
 * Handles both the documented shape ({ male: [], female: [] }) and
 * variants where `tees` is a flat array of tee boxes.
 */
function pickBestTeeBox(tees?: APICourseDetail['tees'] | APITeeBox[]): APITeeBox | null {
  const candidates = flattenTees(tees).map(c => c.t);
  return candidates.find(t => t.holes && t.holes.length > 0) || candidates[0] || null;
}

/**
 * Convert a single API tee box (with its holes) into TeeBoxData.
 * Generates a fallback name when the API doesn't supply one.
 */
function toTeeBoxData(api: APITeeBox, sex: 'male' | 'female' | undefined, fallbackIdx: number): TeeBoxData {
  const name = api.tee_name?.trim() || (sex === 'female' ? `Red ${fallbackIdx + 1}` : `Tee ${fallbackIdx + 1}`);
  return {
    name,
    sex,
    totalYards: api.total_yards,
    parTotal: api.par_total,
    courseRating: api.course_rating,
    slopeRating: api.slope_rating,
    bogeyRating: api.bogey_rating,
    holes: api.holes ? normalizeHoles(api.holes) : [],
  };
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
  // Response may be { courses: [...] } or a raw array
  const courses: APISearchCourse[] = Array.isArray(data)
    ? data
    : (data.courses || data.results || []);

  return courses
    .filter(c => c && c.id !== undefined)
    .map(c => ({
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

  const raw = await response.json();
  const course = unwrapCourse(raw);

  // Pick the best tee box (used as the default/active for the scorecard)
  const teeBox = pickBestTeeBox(course.tees);
  const holes = teeBox?.holes ? normalizeHoles(teeBox.holes) : [];

  // Build the full set of tees so the UI can let the user switch boxes.
  const allTees: TeeBoxData[] = flattenTees(course.tees)
    .map(({ sex, t }, idx) => toTeeBoxData(t, sex, idx))
    .filter(t => t.holes.length > 0);

  // One-time visibility in Netlify logs when detail lookups come back empty
  if (!course.course_name && !course.club_name) {
    console.warn('[GolfCourseAPI] detail response missing name fields', {
      courseId,
      topLevelKeys: Object.keys(raw || {}),
      courseKeys: Object.keys(course || {}),
    });
  }
  if (holes.length === 0) {
    console.warn('[GolfCourseAPI] detail response missing holes', {
      courseId,
      teesType: Array.isArray(course.tees) ? 'array' : typeof course.tees,
      teeBoxKeys: teeBox ? Object.keys(teeBox) : null,
    });
  }

  return {
    id: String(course.id ?? courseId),
    name: course.course_name || course.club_name || 'Unknown Course',
    city: course.location?.city,
    state: course.location?.state,
    country: course.location?.country,
    lat: course.location?.latitude,
    lon: course.location?.longitude,
    holes,
    tees: allTees,
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
