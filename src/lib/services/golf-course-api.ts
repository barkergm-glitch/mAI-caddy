// ============================================
// mAI Caddy — GolfCourseAPI Integration
// ============================================
// Fetches real course data: hole layouts, par, yardage,
// handicap index, green/tee coordinates.
// API docs: golfcourseapi.com

import { CourseData, HoleData } from '@/lib/types';
import { API_ENDPOINTS } from '@/lib/config';

const BASE_URL = API_ENDPOINTS.golfCourseApi;

function getApiKey(): string {
  const key = process.env.GOLF_COURSE_API_KEY;
  if (!key) {
    throw new Error('GOLF_COURSE_API_KEY not set in environment variables');
  }
  return key;
}

// --- API Response Types (flexible to handle variant field names) ---

interface APISearchResult {
  id: number | string;
  name?: string;
  club_name?: string;
  location?: { latitude: number; longitude: number };
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
}

interface APIHole {
  number?: number;
  hole_number?: number;
  hole?: number;
  par?: number;
  yards?: number;
  distance?: number;
  yardage?: number;
  handicap?: number;
  stroke_index?: number;
  hdcp?: number;
  green?: {
    center?: { latitude: number; longitude: number };
    front?: { latitude: number; longitude: number };
    back?: { latitude: number; longitude: number };
  };
  green_latitude?: number;
  green_longitude?: number;
  coordinates?: {
    green?: { latitude: number; longitude: number };
    tee?: { latitude: number; longitude: number };
  };
  tee_latitude?: number;
  tee_longitude?: number;
  teeBoxes?: Array<{
    teeType?: string;
    yards?: number;
    latitude?: number;
    longitude?: number;
  }>;
}

interface APICourse {
  id: number | string;
  name?: string;
  club_name?: string;
  city?: string;
  state?: string;
  country?: string;
  course_rating?: number;
  slope_rating?: number;
  holes?: APIHole[];
}

// --- Helper to normalize the flexible API responses ---

function normalizeHole(apiHole: APIHole): HoleData {
  const holeNumber = apiHole.number || apiHole.hole_number || apiHole.hole || 0;
  const par = apiHole.par || 4;
  const yardage = apiHole.yards || apiHole.distance || apiHole.yardage || 0;
  const strokeIndex = apiHole.handicap || apiHole.stroke_index || apiHole.hdcp || holeNumber;

  // Green coordinates — check multiple locations
  let greenLat: number | undefined;
  let greenLon: number | undefined;
  if (apiHole.green?.center) {
    greenLat = apiHole.green.center.latitude;
    greenLon = apiHole.green.center.longitude;
  } else if (apiHole.coordinates?.green) {
    greenLat = apiHole.coordinates.green.latitude;
    greenLon = apiHole.coordinates.green.longitude;
  } else if (apiHole.green_latitude && apiHole.green_longitude) {
    greenLat = apiHole.green_latitude;
    greenLon = apiHole.green_longitude;
  }

  // Tee coordinates
  let teeLat: number | undefined;
  let teeLon: number | undefined;
  if (apiHole.coordinates?.tee) {
    teeLat = apiHole.coordinates.tee.latitude;
    teeLon = apiHole.coordinates.tee.longitude;
  } else if (apiHole.tee_latitude && apiHole.tee_longitude) {
    teeLat = apiHole.tee_latitude;
    teeLon = apiHole.tee_longitude;
  }

  return {
    holeNumber,
    par,
    yardage,
    strokeIndex,
    greenLat,
    greenLon,
    teeLat,
    teeLon,
  };
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
  const apiKey = getApiKey();

  const response = await fetch(
    `${BASE_URL}/courses?search=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `Key ${apiKey}`,
      },
    }
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
  const courses: APISearchResult[] = data.courses || data || [];

  return courses.map(c => ({
    id: String(c.id),
    name: c.name || c.club_name || 'Unknown Course',
    city: c.city,
    state: c.state,
    lat: c.location?.latitude || c.latitude,
    lon: c.location?.longitude || c.longitude,
  }));
}

/**
 * Get full course details including all holes
 */
export async function getCourseDetails(courseId: string): Promise<CourseData> {
  const apiKey = getApiKey();

  const response = await fetch(
    `${BASE_URL}/courses/${courseId}`,
    {
      headers: {
        'Authorization': `Key ${apiKey}`,
      },
    }
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

  const data = await response.json();
  const course: APICourse = data.course || data;

  const holes: HoleData[] = (course.holes || [])
    .map(normalizeHole)
    .sort((a, b) => a.holeNumber - b.holeNumber);

  return {
    id: String(course.id),
    name: course.name || course.club_name || 'Unknown Course',
    city: course.city,
    state: course.state,
    country: course.country,
    holes,
    courseRating: course.course_rating,
    slopeRating: course.slope_rating,
  };
}

/**
 * Get data for a specific hole
 */
export async function getHoleData(courseId: string, holeNumber: number): Promise<HoleData | null> {
  const course = await getCourseDetails(courseId);
  return course.holes.find(h => h.holeNumber === holeNumber) || null;
}
