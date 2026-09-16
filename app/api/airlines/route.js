import { NextResponse } from 'next/server';
import { getAirlines } from '../../../lib/flight-data';

export async function GET() {
  try {
    const airlines = getAirlines();
    return NextResponse.json(airlines);
  } catch (err) {
    console.error('Failed to fetch airlines', err);
    return NextResponse.json({ error: 'Failed to load airlines' }, { status: 500 });
  }
}
