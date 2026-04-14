// GET /api/course/debug?q=pebble+beach
// GET /api/course/debug?id=12345
// Diagnostic endpoint — returns raw GolfCourseAPI responses so we can
// see the exact shape and fix any parsing issues.
import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://api.golfcourseapi.com/v1';

type JsonRecord = Record<string, unknown>;

function asRecord(v: unknown): JsonRecord | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : null;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOLF_COURSE_API_KEY;
  const query = request.nextUrl.searchParams.get('q');
  const id = request.nextUrl.searchParams.get('id');

  if (!apiKey) {
    return NextResponse.json({ error: 'GOLF_COURSE_API_KEY not set' }, { status: 500 });
  }

  const headers = { 'Authorization': `Key ${apiKey}` };
  const out: JsonRecord = {
    timestamp: new Date().toISOString(),
    apiKeyPrefix: apiKey.substring(0, 6) + '...',
    base: BASE_URL,
  };

  try {
    if (query) {
      const url = `${BASE_URL}/search?search_query=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers });
      const body = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = body; }

      const rec = asRecord(parsed);
      const coursesArr = rec && Array.isArray(rec.courses) ? (rec.courses as unknown[]) : null;
      const firstCourse = coursesArr?.[0] ?? (Array.isArray(parsed) ? (parsed as unknown[])[0] : undefined);

      out.search = {
        url,
        status: res.status,
        topLevelKeys: rec ? Object.keys(rec) : null,
        isArray: Array.isArray(parsed),
        firstCourseKeys: asRecord(firstCourse) ? Object.keys(asRecord(firstCourse)!) : null,
        body: parsed,
      };
    }

    if (id) {
      const url = `${BASE_URL}/courses/${id}`;
      const res = await fetch(url, { headers });
      const body = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = body; }

      const rec = asRecord(parsed);
      const innerCourse = rec && asRecord(rec.course) ? asRecord(rec.course) : rec;

      out.detail = {
        url,
        status: res.status,
        topLevelKeys: rec ? Object.keys(rec) : null,
        courseKeys: innerCourse ? Object.keys(innerCourse) : null,
        body: parsed,
      };
    }

    if (!query && !id) {
      out.usage = 'Pass ?q=<name> to test search, or ?id=<courseId> to test detail';
    }

    return NextResponse.json(out, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, ...out }, { status: 500 });
  }
}
