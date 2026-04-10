// GET /api/course/search?q=course+name
import { NextRequest, NextResponse } from 'next/server';
import { searchCourses } from '@/lib/services/golf-course-api';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: 'Search query must be at least 2 characters' },
      { status: 400 }
    );
  }

  try {
    const courses = await searchCourses(query);
    return NextResponse.json({ courses });
  } catch (error: any) {
    console.error('Course search error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search courses' },
      { status: 500 }
    );
  }
}
