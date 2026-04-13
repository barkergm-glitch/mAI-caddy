// GET /api/course/debug?q=pebble+beach
// Diagnostic endpoint — shows raw API response so we can troubleshoot
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || 'pebble beach';
  const apiKey = process.env.GOLF_COURSE_API_KEY;

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    query,
    apiKeySet: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'NOT SET',
  };

  // Try both base URLs — our current one may be wrong
  const baseUrls = [
    { name: 'no-version', base: 'https://api.golfcourseapi.com' },
    { name: 'v1', base: 'https://api.golfcourseapi.com/v1' },
  ];

  const authFormats = [
    { name: 'Key prefix', header: `Key ${apiKey}` },
    { name: 'Bearer prefix', header: `Bearer ${apiKey}` },
    { name: 'Raw key', header: `${apiKey}` },
  ];

  const searchParams = ['search', 'name', 'q', 'query'];

  const attempts: any[] = [];

  for (const baseUrl of baseUrls) {
    for (const param of searchParams) {
      const url = `${baseUrl.base}/courses?${param}=${encodeURIComponent(query)}`;
      for (const authFormat of authFormats) {
        try {
          const res = await fetch(url, {
            headers: { 'Authorization': authFormat.header },
          });
          const status = res.status;
          let body: any;
          try { body = await res.json(); } catch { body = 'non-json'; }

          const entry: any = {
            base: baseUrl.name,
            param,
            auth: authFormat.name,
            status,
            url,
          };

          if (status === 200) {
            entry.courseCount = Array.isArray(body?.courses) ? body.courses.length : (Array.isArray(body) ? body.length : 'N/A');
            entry.firstCourse = Array.isArray(body?.courses) ? body.courses[0] : (Array.isArray(body) ? body[0] : null);
            entry.topKeys = typeof body === 'object' && body !== null ? Object.keys(body) : [];
            entry.fullBody = body;
          } else {
            entry.body = typeof body === 'string' ? body.substring(0, 200) : body;
          }

          attempts.push(entry);
          if (status === 200) break; // found working auth, skip others
        } catch (err: any) {
          attempts.push({ base: baseUrl.name, param, auth: authFormat.name, error: err.message });
        }
      }
    }

    // Also try bare /courses (no search param) with each auth
    for (const authFormat of authFormats) {
      const url = `${baseUrl.base}/courses`;
      try {
        const res = await fetch(url, { headers: { 'Authorization': authFormat.header } });
        const status = res.status;
        let body: any;
        try { body = await res.json(); } catch { body = 'non-json'; }

        const entry: any = { base: baseUrl.name, param: 'NONE', auth: authFormat.name, status, url };
        if (status === 200) {
          entry.courseCount = Array.isArray(body?.courses) ? body.courses.length : (Array.isArray(body) ? body.length : 'N/A');
          entry.firstCourse = Array.isArray(body?.courses) ? body.courses[0] : (Array.isArray(body) ? body[0] : null);
          entry.topKeys = typeof body === 'object' && body !== null ? Object.keys(body) : [];
        }
        attempts.push(entry);
        if (status === 200) break;
      } catch (err: any) {
        attempts.push({ base: baseUrl.name, param: 'NONE', auth: authFormat.name, error: err.message });
      }
    }
  }

  // Filter to only show successes and first failure per combo for readability
  const successes = attempts.filter(a => a.status === 200);
  const failures = attempts.filter(a => a.status !== 200);

  results.successes = successes;
  results.failureSummary = failures.map(f => `${f.base}/${f.param}/${f.auth} → ${f.status || f.error}`);

  // If we found a working combo, test course detail too
  if (successes.length > 0 && successes[0].firstCourse) {
    const winner = successes[0];
    const courseId = winner.firstCourse.id || winner.firstCourse.courseId;
    const authHeader = authFormats.find(a => a.name === winner.auth)?.header || '';
    const detailBase = baseUrls.find(b => b.name === winner.base)?.base || '';

    if (courseId) {
      try {
        const detailRes = await fetch(`${detailBase}/courses/${courseId}`, {
          headers: { 'Authorization': authHeader },
        });
        const detailBody = await detailRes.json();
        results.courseDetailTest = {
          courseId,
          status: detailRes.status,
          url: `${detailBase}/courses/${courseId}`,
          hasHoles: !!(detailBody?.holes?.length || detailBody?.course?.holes?.length),
          holeCount: detailBody?.holes?.length || detailBody?.course?.holes?.length || 0,
          firstHole: detailBody?.holes?.[0] || detailBody?.course?.holes?.[0] || null,
          topLevelKeys: Object.keys(detailBody || {}),
          fullDetail: detailBody,
        };
      } catch (err: any) {
        results.courseDetailTest = { courseId, error: err.message };
      }
    }
  }

  return NextResponse.json(results, { status: 200 });
}
