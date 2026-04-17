import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'url query param is required' }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('scan_results')
    .select('id, url, score, scanned_at, summary, hosting_id, hosting_name')
    .eq('url', url)
    .eq('status', 'completed')
    .order('scanned_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('History query error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }

  return NextResponse.json({ entries: data || [] });
}
