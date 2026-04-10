// GET /api/course/:id
import { NextRequest, NextResponse } from 'next/server';
import { getCourseDetails } from '@/lib/services/golf-course-api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const course = await getCourseDetails(id);
    return NextResponse.json({ course });
  } catch (error: any) {
    console.error('Course details error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get course details' },
      { status: 500 }
    );
  }
}
