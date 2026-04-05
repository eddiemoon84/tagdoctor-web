import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  let body: { email?: string; site_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '올바른 이메일을 입력해주세요' }, { status: 400 });
  }

  const site_url = body.site_url?.trim() || null;

  const { error } = await supabase
    .from('subscribers')
    .insert({ email, site_url });

  if (error) {
    // UNIQUE 제약조건 위반 (23505)
    if (error.code === '23505') {
      return NextResponse.json({ error: 'duplicate' }, { status: 409 });
    }
    console.error('Subscribe error:', error.message);
    return NextResponse.json({ error: '신청에 실패했습니다' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
