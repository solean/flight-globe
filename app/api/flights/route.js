import { NextResponse } from 'next/server';
import { getFlights } from '../../../lib/db';

export async function GET() {
  try {
    const flights = getFlights();
    return NextResponse.json(flights);
  } catch (err) {
    console.error('Failed to fetch flights', err);
    return NextResponse.json({ error: 'Failed to load flights' }, { status: 500 });
  }
}
