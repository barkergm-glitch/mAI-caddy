// GET /api/weather?lat=37.5&lon=-122.3
// Server-side OpenWeather proxy so the API key stays out of the browser.
import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENWEATHER_API_KEY not set' }, { status: 500 });
  }

  const lat = request.nextUrl.searchParams.get('lat');
  const lon = request.nextUrl.searchParams.get('lon');
  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
  }

  try {
    const url = `${BASE_URL}/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=imperial&appid=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } }); // 5-min cache
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: `OpenWeather ${res.status}`, body }, { status: res.status });
    }
    const data = await res.json();

    // Pull just what we need so we don't ship the full payload to the client.
    return NextResponse.json({
      temperatureF: Math.round(data.main?.temp ?? 0),
      feelsLikeF: Math.round(data.main?.feels_like ?? 0),
      humidity: data.main?.humidity ?? 0,
      pressure: data.main?.pressure ?? 0,
      windSpeedMph: Math.round(data.wind?.speed ?? 0),
      windDirectionDegrees: data.wind?.deg ?? 0,
      windDirection: degToCompass(data.wind?.deg ?? 0),
      description: data.weather?.[0]?.description ?? '',
      icon: data.weather?.[0]?.icon ?? '',
      city: data.name ?? '',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function degToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}
