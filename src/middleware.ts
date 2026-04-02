import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── In-memory rate limiter (IP 기반) ─────────────────────────────────────────

const SCAN_LIMIT = 5;          // POST /api/scan: 분당 최대 요청 수
const SCAN_WINDOW_MS = 60_000; // 1분

const hitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();

  // 오래된 항목 정리 (매 요청마다 최대 20개씩)
  let cleaned = 0;
  for (const [key, entry] of hitMap) {
    if (now > entry.resetAt) {
      hitMap.delete(key);
      if (++cleaned >= 20) break;
    }
  }

  const entry = hitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    hitMap.set(ip, { count: 1, resetAt: now + SCAN_WINDOW_MS });
    return { allowed: true, remaining: SCAN_LIMIT - 1 };
  }

  entry.count++;
  if (entry.count > SCAN_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: SCAN_LIMIT - entry.count };
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  // POST /api/scan 에만 rate limit 적용
  if (
    request.method === 'POST' &&
    request.nextUrl.pathname === '/api/scan'
  ) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, remaining } = checkRateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 1분 후 다시 시도해주세요.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
