import { NextResponse } from 'next/server';
import { getCountries } from '../../../lib/flight-data';

export async function GET() {
  try {
    const countries = getCountries();
    return NextResponse.json(countries);
  } catch (err) {
    console.error('Failed to fetch countries', err);
    return NextResponse.json({ error: 'Failed to load countries' }, { status: 500 });
  }
}
