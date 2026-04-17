-- TagDoctor DB Schema
-- Supabase SQL Editor에서 실행

-- 1. 스캔 결과 테이블
CREATE TABLE scan_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanning', 'completed', 'failed')),
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  score INTEGER NOT NULL DEFAULT 0,
  total_trackers INTEGER NOT NULL DEFAULT 0,
  installed_trackers INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}',
  raw_result JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  page_count INTEGER DEFAULT 1,
  is_multi BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 개별 트래커 진단 결과 테이블
CREATE TABLE tracker_diagnoses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,
  tracker_key TEXT NOT NULL,
  tracker_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'duplicate', 'multi_container', 'no_event', 'not_installed')),
  script_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  ids TEXT[] DEFAULT '{}',
  globals_found TEXT[] DEFAULT '{}',
  prescription TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 구독자 테이블 (뉴스레터/알림용)
CREATE TABLE subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  site_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_scan_results_url ON scan_results(url);
CREATE INDEX idx_scan_results_scanned_at ON scan_results(scanned_at DESC);
CREATE INDEX idx_scan_results_status ON scan_results(status);
CREATE INDEX idx_tracker_diagnoses_scan_id ON tracker_diagnoses(scan_id);
CREATE INDEX idx_tracker_diagnoses_tracker_key ON tracker_diagnoses(tracker_key);

-- RLS 활성화
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- RLS 정책: anon 역할에는 읽기 전용, service_role은 RLS 우회 (기본 동작)
-- scan_results: anon은 SELECT만 허용
CREATE POLICY "anon_select_scan_results" ON scan_results
  FOR SELECT TO anon USING (true);

-- tracker_diagnoses: anon은 SELECT만 허용
CREATE POLICY "anon_select_tracker_diagnoses" ON tracker_diagnoses
  FOR SELECT TO anon USING (true);

-- subscribers: anon은 INSERT만 허용 (이메일 구독 신청)
CREATE POLICY "anon_insert_subscribers" ON subscribers
  FOR INSERT TO anon WITH CHECK (true);
