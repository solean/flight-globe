import { NextResponse } from 'next/server';
import { getAirports } from '../../../lib/flight-data';

export async function GET() {
  try {
    const airports = getAirports();
    return NextResponse.json(airports);
  } catch (err) {
    console.error('Failed to fetch airports', err);
    return NextResponse.json({ error: 'Failed to load airports' }, { status: 500 });
  }
}
