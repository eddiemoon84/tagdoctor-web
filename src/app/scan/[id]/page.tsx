"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  STATUS_CONFIG,
  TRACKER_EMOJI,
  HOSTING_BADGE,
  HOSTING_LABEL,
  HOSTING_PRESCRIPTIONS,
  PRESCRIPTIONS,
  type HostingPrescription,
} from "@/lib/constants";

type TrackerStatus =
  | "ok"
  | "duplicate"
  | "multi_container"
  | "no_event"
  | "not_installed"
  | "missing_events"
  | "partial_events";

interface TrackerDiagnosis {
  tracker_key: string;
  tracker_name: string;
  status: TrackerStatus;
  script_count: number;
  event_count: number;
  ids: string[];
  prescription: string | null;
  score: number;
}

interface RequiredEventsInfo {
  required: string[];
  detected: string[];
  missing: string[];
}

interface MultiPageTag {
  name: string;
  detected: boolean;
  scriptLoadCount: number;
  eventFireCount: number;
  hasEventFire: boolean;
  isDuplicate: boolean;
  isMultiContainer: boolean;
  ids: string[];
  id: string | null;
  status: string;
  detectedEvents?: string[];
  requiredEvents?: RequiredEventsInfo | null;
}

interface MultiPage {
  url: string;
  type: string;
  label?: string;
  score: number;
  tags: Record<string, MultiPageTag>;
  error?: string;
}

interface MultiRawResult {
  overallScore: number;
  pages: MultiPage[];
  hosting: { id: string; name: string };
  pageCount: number;
}

interface ScanData {
  id: string;
  url: string;
  status: "pending" | "scanning" | "completed" | "failed";
  score: number;
  total_trackers: number;
  installed_trackers: number;
  error_message: string | null;
  scanned_at: string;
  tracker_diagnoses: TrackerDiagnosis[];
  is_multi?: boolean;
  raw_result?: (MultiRawResult | Record<string, unknown>) & {
    hosting?: { id: string; name: string };
  };
  hosting_id?: string | null;
  hosting_name?: string | null;
}

function getHostingId(data: ScanData): string {
  if (data.hosting_id) return data.hosting_id;
  const raw = data.raw_result;
  if (raw && typeof raw === "object" && "hosting" in raw) {
    const h = (raw as { hosting?: { id?: string } }).hosting;
    if (h?.id) return h.id;
  }
  return "general";
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ScanData | null>(null);
  const [error, setError] = useState("");

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/scan/${id}`);
      if (!res.ok) {
        setError("스캔 정보를 불러올 수 없습니다.");
        return;
      }
      const result: ScanData = await res.json();
      setData(result);

      if (result.status === "pending" || result.status === "scanning") {
        setTimeout(poll, 2000);
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    }
  }, [id]);

  useEffect(() => {
    if (id) poll();
  }, [id, poll]);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-5xl">😵</p>
          <h1 className="mt-4 text-xl font-bold text-gray-900">{error}</h1>
          <button
            onClick={() => router.push("/")}
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.status === "pending" || data.status === "scanning") {
    return <ScanningView url={data?.url} />;
  }

  if (data.status === "failed") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-5xl">❌</p>
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            스캔에 실패했습니다
          </h1>
          <p className="mt-2 text-sm text-gray-500">{data.url}</p>
          <p className="mt-2 text-sm text-red-500">{data.error_message}</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (data.is_multi && data.raw_result && "pages" in data.raw_result) {
    return <MultiReportView data={data} raw={data.raw_result as MultiRawResult} />;
  }

  return <ReportView data={data} />;
}

// ─── 스캔 중 화면 ──────────────────────────────────────────────────────────────

function ScanningView({ url }: { url?: string }) {
  const steps = [
    "사이트에 접속하는 중...",
    "네트워크 요청을 수집하는 중...",
    "트래킹 스크립트를 분석하는 중...",
    "글로벌 변수를 확인하는 중...",
    "진단 리포트를 생성하는 중...",
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, 5000);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Spinner */}
        <div className="mx-auto w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />

        <h1 className="mt-8 text-xl font-bold text-gray-900">
          사이트를 분석 중입니다
        </h1>
        {url && (
          <p className="mt-2 text-sm text-gray-500 break-all">{url}</p>
        )}

        <div className="mt-8 space-y-3 text-left">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              {i < step ? (
                <span className="text-green-500 text-sm">✓</span>
              ) : i === step ? (
                <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full bg-gray-200 inline-block" />
              )}
              <span
                className={`text-sm ${
                  i <= step ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {s}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-gray-400">
          보통 30초 ~ 1분 정도 소요됩니다
        </p>
      </div>
    </div>
  );
}

// ─── 리포트 화면 ────────────────────────────────────────────────────────────────

function ReportView({ data }: { data: ScanData }) {
  const router = useRouter();
  const installed = data.tracker_diagnoses.filter(
    (d) => d.status !== "not_installed"
  );
  const issues = data.tracker_diagnoses.filter(
    (d) => d.status === "duplicate" || d.status === "no_event"
  );
  const hostingId = getHostingId(data);
  const badge = HOSTING_BADGE[hostingId] || HOSTING_BADGE.general;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-500 hover:text-gray-900 cursor-pointer"
          >
            ← TagDoctor
          </button>
          <span className="text-xs text-gray-400">
            {new Date(data.scanned_at).toLocaleString("ko-KR")}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Score Section */}
        <div className="bg-white rounded-xl p-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <p className="text-sm text-gray-500 break-all">{data.url}</p>
            <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full leading-none">
              BETA
            </span>
          </div>

          <div className="mt-6 inline-flex items-center justify-center w-28 h-28 rounded-full border-4 border-blue-100">
            <div>
              <p
                className={`text-4xl font-bold ${
                  data.score >= 90
                    ? "text-green-600"
                    : data.score >= 70
                      ? "text-amber-500"
                      : "text-red-500"
                }`}
              >
                {data.score}
              </p>
              <p className="text-xs text-gray-400">/ 100</p>
            </div>
          </div>

          <div className="mt-4 flex justify-center items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          <div className="mt-3 flex justify-center gap-6 text-sm">
            <span className="text-gray-600">
              감지 <strong className="text-gray-900">{data.installed_trackers}</strong>/{data.total_trackers}
            </span>
            {issues.length > 0 && (
              <span className="text-amber-600">
                문제 <strong>{issues.length}</strong>건
              </span>
            )}
          </div>
        </div>

        {/* Tracker Cards */}
        <div className="mt-6 space-y-3">
          {data.tracker_diagnoses.map((d) => (
            <TrackerCard key={d.tracker_key} diagnosis={d} hostingId={hostingId} />
          ))}
        </div>

        {/* 스캔 히스토리 */}
        <HistorySection currentUrl={data.url} currentScanId={data.id} />

        {/* 다시 스캔 */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            다른 사이트 진단하기
          </button>
        </div>

        {/* 이메일 구독 */}
        <SubscribeForm siteUrl={data.url} />

        {/* 베타 피드백 */}
        <div className="mt-6 bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-sm font-medium text-gray-600">
            TagDoctor는 현재 베타 서비스입니다.
          </p>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">
            진단 결과가 실제와 다르거나 개선 의견이 있으시면
            <br className="hidden sm:block" />
            알려주세요. 더 정확한 서비스를 만드는 데 큰 도움이 됩니다.
          </p>
          <a
            href="mailto:eddiemoon84@gmail.com"
            className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800"
          >
            eddiemoon84@gmail.com
          </a>
        </div>

        {/* Footer */}
        <footer className="mt-8 pb-4 text-center text-sm text-gray-400">
          <p>TagDoctor — 광고 트래킹 진단 도구 | 문의: eddiemoon84@gmail.com</p>
        </footer>
      </div>
    </div>
  );
}

// ─── 트래커 카드 ────────────────────────────────────────────────────────────────

function TrackerCard({ diagnosis, hostingId }: { diagnosis: TrackerDiagnosis; hostingId: string }) {
  const [open, setOpen] = useState(diagnosis.prescription !== null);
  // 미래에 새 status가 추가되어 STATUS_CONFIG에 라벨이 없을 때도 페이지가 깨지지 않게.
  const config = STATUS_CONFIG[diagnosis.status] ?? STATUS_CONFIG.not_installed;
  const emoji = TRACKER_EMOJI[diagnosis.tracker_key] || "📋";

  // 구조화 처방 사용 가능 여부 (주요 매체 × not_installed)
  const structured = diagnosis.status === "not_installed"
    ? HOSTING_PRESCRIPTIONS[diagnosis.tracker_key]
    : undefined;

  return (
    <div className={`bg-white rounded-xl p-5 ${diagnosis.prescription ? "ring-1 ring-amber-200" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <p className="font-semibold text-gray-900">
              {diagnosis.tracker_name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                {config.emoji} {config.label}
              </span>
              {diagnosis.ids.length > 0 && (
                <span className="text-xs text-gray-400">
                  ID: {diagnosis.ids.join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right text-xs text-gray-400">
          {diagnosis.status !== "not_installed" && (
            <>
              {diagnosis.script_count > 0 && (
                <p>스크립트 {diagnosis.script_count}회</p>
              )}
              {diagnosis.event_count > 0 && (
                <p>이벤트 {diagnosis.event_count}건</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Prescription */}
      {structured ? (
        <HostingPrescriptionView structured={structured} hostingId={hostingId} />
      ) : diagnosis.prescription && (
        <div className="mt-3">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            {open ? "처방 접기 ▲" : "처방 보기 ▼"}
          </button>
          {open && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              💡 {diagnosis.prescription}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 호스팅 분기 처방 ─────────────────────────────────────────────────────

function HostingPrescriptionView({
  structured,
  hostingId,
}: {
  structured: HostingPrescription;
  hostingId: string;
}) {
  const [expandedOther, setExpandedOther] = useState(false);
  const solutions = structured.solutions;

  const detectedKey = (hostingId in solutions ? hostingId : null) as
    | keyof typeof solutions
    | null;
  const detectedSolution = detectedKey ? solutions[detectedKey] : undefined;
  const hostingLabel = HOSTING_LABEL[hostingId] || HOSTING_LABEL.general;

  const otherEntries = (Object.entries(solutions) as [keyof typeof solutions, string][])
    .filter(([key]) => key !== detectedKey);

  const severityColor = structured.severity === "error" ? "bg-red-50 ring-red-200" : "bg-amber-50 ring-amber-200";

  return (
    <div className={`mt-3 p-4 rounded-lg ring-1 ${severityColor}`}>
      <p className="text-sm font-semibold text-gray-900">
        💡 {structured.title}
      </p>
      <p className="mt-1 text-xs text-gray-600 leading-relaxed">
        {structured.why}
      </p>

      {detectedSolution && (
        <div className="mt-3 bg-white rounded-lg p-3 ring-1 ring-blue-200">
          <p className="text-xs font-semibold text-blue-700">
            📍 감지된 호스팅: {hostingLabel} <span className="text-gray-500">(권장)</span>
          </p>
          <p className="mt-2 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
            {detectedSolution}
          </p>
        </div>
      )}

      {!detectedSolution && (
        <p className="mt-3 text-xs text-gray-500">
          감지된 호스팅({hostingLabel})에 대한 맞춤 가이드는 아직 준비 중입니다. 아래 방법 중 상황에 맞는 것을 선택하세요.
        </p>
      )}

      {otherEntries.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpandedOther(!expandedOther)}
            className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            {expandedOther ? "다른 방법 접기 ▲" : "다른 방법으로 설치하기 ▼"}
          </button>
          {expandedOther && (
            <div className="mt-2 space-y-2">
              {otherEntries.map(([key, text]) => (
                <div key={key} className="bg-white rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700">
                    {HOSTING_LABEL[key] || key}
                  </p>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 멀티페이지 리포트 ──────────────────────────────────────────────────────

const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "🏠 메인 페이지",
  product: "📦 상품 상세",
  cart: "🛒 장바구니",
  checkout: "💳 결제",
  thankyou: "✅ 결제 완료",
  custom: "📄 페이지",
};

function MultiReportView({ data, raw }: { data: ScanData; raw: MultiRawResult }) {
  const router = useRouter();
  const pages = raw.pages;
  const validPages = pages.filter((p) => !p.error);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-500 hover:text-gray-900 cursor-pointer"
          >
            ← TagDoctor
          </button>
          <span className="text-xs text-gray-400">
            {new Date(data.scanned_at).toLocaleString("ko-KR")}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 전체 요약 */}
        <div className="bg-white rounded-xl p-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <p className="text-sm text-gray-500 break-all">{data.url}</p>
            <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full leading-none">
              BETA
            </span>
          </div>

          <div className="mt-6 inline-flex items-center justify-center w-28 h-28 rounded-full border-4 border-blue-100">
            <div>
              <p
                className={`text-4xl font-bold ${
                  raw.overallScore >= 90
                    ? "text-green-600"
                    : raw.overallScore >= 70
                      ? "text-amber-500"
                      : "text-red-500"
                }`}
              >
                {raw.overallScore}
              </p>
              <p className="text-xs text-gray-400">/ 100</p>
            </div>
          </div>

          {(() => {
            const hId = getHostingId(data);
            const b = HOSTING_BADGE[hId] || HOSTING_BADGE.general;
            return (
              <div className="mt-4 flex justify-center items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full ${b.bg} ${b.color}`}>
                  {b.label}
                </span>
                <span className="text-xs text-gray-600">
                  📄 진단 페이지: <strong className="text-gray-900">{pages.length}</strong>개
                </span>
              </div>
            );
          })()}
        </div>

        {/* 통합 트래커 진단 (사이트 전체 기준) */}
        <UnifiedTrackerSummary pages={pages} hostingId={getHostingId(data)} />

        {/* 페이지별 카드 */}
        <div className="mt-6 space-y-4">
          {pages.map((page, idx) => (
            <MultiPageCard key={idx} page={page} />
          ))}
        </div>

        {/* 전체 요약 박스 */}
        {validPages.length > 0 && (
          <OverallSummary pages={validPages} />
        )}

        {/* 스캔 히스토리 */}
        <HistorySection currentUrl={data.url} currentScanId={data.id} />

        {/* 다시 스캔 */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            다른 사이트 진단하기
          </button>
        </div>

        {/* 이메일 구독 */}
        <SubscribeForm siteUrl={data.url} />

        {/* 베타 피드백 */}
        <div className="mt-6 bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-sm font-medium text-gray-600">
            TagDoctor는 현재 베타 서비스입니다.
          </p>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">
            진단 결과가 실제와 다르거나 개선 의견이 있으시면
            <br className="hidden sm:block" />
            알려주세요. 더 정확한 서비스를 만드는 데 큰 도움이 됩니다.
          </p>
          <a
            href="mailto:eddiemoon84@gmail.com"
            className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800"
          >
            eddiemoon84@gmail.com
          </a>
        </div>

        <footer className="mt-8 pb-4 text-center text-sm text-gray-400">
          <p>TagDoctor — 광고 트래킹 진단 도구 | 문의: eddiemoon84@gmail.com</p>
        </footer>
      </div>
    </div>
  );
}

function MultiPageCard({ page }: { page: MultiPage }) {
  const typeLabel = page.label || PAGE_TYPE_LABELS[page.type] || page.type;
  const scoreColor =
    page.score >= 90 ? "text-green-600" : page.score >= 70 ? "text-amber-500" : "text-red-500";
  const scoreIcon = page.score >= 90 ? "" : page.score >= 70 ? " ⚠️" : " ❌";

  if (page.error) {
    return (
      <div className="bg-white rounded-xl p-5 ring-1 ring-red-200">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900">{typeLabel}</p>
          <span className="text-xs text-red-500">❌ 스캔 실패</span>
        </div>
        <p className="mt-1 text-xs text-gray-400 break-all">{page.url}</p>
        <p className="mt-2 text-xs text-red-500">{page.error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">
            {typeLabel}
            <span className={`ml-2 text-sm ${scoreColor}`}>점수: {page.score}/100{scoreIcon}</span>
          </p>
          <p className="mt-1 text-xs text-gray-400 break-all">{page.url}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {Object.entries(page.tags)
          .filter(([, tag]) => tag.detected)
          .map(([key, tag]) => (
            <PageTrackerRow key={key} trackerKey={key} tag={tag} />
          ))}
      </div>
    </div>
  );
}

function PageTrackerRow({ trackerKey, tag }: { trackerKey: string; tag: MultiPageTag }) {
  const emoji = TRACKER_EMOJI[trackerKey] || "📋";

  let statusIcon = "✅";
  let statusBg = "bg-green-50";
  if (tag.status === "missing_events" || tag.isDuplicate) {
    statusIcon = "❌";
    statusBg = "bg-red-50";
  } else if (tag.status === "partial_events") {
    statusIcon = "⚠️";
    statusBg = "bg-amber-50";
  } else if (tag.isMultiContainer) {
    statusIcon = "ℹ️";
    statusBg = "bg-blue-50";
  }

  const req = tag.requiredEvents;
  const hasRequirement = req && req.required.length > 0;

  return (
    <div className={`${statusBg} rounded-lg p-3 text-sm`}>
      <div className="flex items-center gap-2">
        <span>{statusIcon}</span>
        <span>{emoji}</span>
        <span className="font-medium text-gray-900">{tag.name}</span>
        {hasRequirement && req.missing.length === 0 && (
          <span className="text-xs text-gray-500">({req.required.join(", ")} 모두 ✓)</span>
        )}
      </div>
      {hasRequirement && req.missing.length > 0 && (
        <div className="mt-2 pl-6 text-xs text-gray-700 leading-relaxed">
          <p>필수: {req.required.join(", ")}</p>
          {req.detected.length > 0 && <p>감지: {req.detected.join(", ")}</p>}
          <p className="text-red-600 font-medium">누락: {req.missing.join(", ")}</p>
          <p className="mt-1 text-gray-600">
            💡 {buildEventPrescription(trackerKey, req.missing)}
          </p>
        </div>
      )}
      {tag.isDuplicate && (
        <p className="mt-1 pl-6 text-xs text-red-600">
          중복 설치됨 (스크립트 {tag.scriptLoadCount}회 로드)
        </p>
      )}
    </div>
  );
}

function buildEventPrescription(trackerKey: string, missing: string[]): string {
  if (trackerKey === "meta_pixel") {
    return `해당 페이지에 ${missing.map((e) => `fbq('track', '${e}')`).join(", ")} 호출 추가 필요`;
  }
  if (trackerKey === "ga4") {
    return `해당 페이지에 gtag('event', '${missing[0]}', {...}) 호출 추가 필요`;
  }
  if (trackerKey === "tiktok") {
    return `해당 페이지에 ttq.track('${missing[0]}') 호출 추가 필요`;
  }
  return `누락 이벤트: ${missing.join(", ")}`;
}

function OverallSummary({ pages }: { pages: MultiPage[] }) {
  const issues: string[] = [];
  const perfectPages: string[] = [];

  for (const page of pages) {
    const typeLabel = PAGE_TYPE_LABELS[page.type] || page.type;
    const missingByTracker: string[] = [];
    for (const [, tag] of Object.entries(page.tags)) {
      if (tag.requiredEvents && tag.requiredEvents.missing.length > 0) {
        missingByTracker.push(`${tag.name}: ${tag.requiredEvents.missing.join(", ")} 누락`);
      }
    }
    if (missingByTracker.length === 0 && page.score >= 90) {
      perfectPages.push(typeLabel);
    } else if (missingByTracker.length > 0) {
      issues.push(`${typeLabel} — ${missingByTracker.join("; ")}`);
    }
  }

  if (issues.length === 0) return null;

  return (
    <div className="mt-8 bg-amber-50 rounded-xl p-6">
      <p className="text-sm font-semibold text-gray-900">💡 전체 요약</p>
      <ul className="mt-3 space-y-2 text-sm text-gray-700 leading-relaxed">
        {perfectPages.length > 0 && (
          <li>✅ 완벽한 페이지: {perfectPages.join(", ")}</li>
        )}
        {issues.map((issue, i) => (
          <li key={i}>⚠️ {issue}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-gray-700 leading-relaxed">
        이대로면 해당 페이지에서 전환 데이터가 전송되지 않아 광고 최적화가 불가능합니다.
      </p>
    </div>
  );
}

// ─── 멀티 스캔: 통합 트래커 요약 ────────────────────────────────────────────

// 페이지들에 흩어진 같은 트래커의 status를 머지해서, 사이트 전체 기준의
// 트래커별 진단 + 처방을 그릴 수 있는 TrackerDiagnosis 배열로 만든다.
function aggregateUnifiedDiagnoses(pages: MultiPage[]): TrackerDiagnosis[] {
  const validPages = pages.filter((p) => !p.error);
  if (validPages.length === 0) return [];

  const allKeys = new Set<string>();
  for (const p of validPages) for (const k of Object.keys(p.tags)) allKeys.add(k);

  const result: TrackerDiagnosis[] = [];
  for (const key of allKeys) {
    const tagsAcrossPages = validPages
      .map((p) => p.tags[key])
      .filter((t): t is MultiPageTag => Boolean(t));
    if (tagsAcrossPages.length === 0) continue;

    const detectedTags = tagsAcrossPages.filter((t) => t.detected);
    const displayName = tagsAcrossPages[0].name;

    if (detectedTags.length === 0) {
      result.push({
        tracker_key: key,
        tracker_name: displayName,
        status: "not_installed",
        ids: [],
        script_count: 0,
        event_count: 0,
        prescription: null,
        score: 0,
      });
      continue;
    }

    const worstTag = detectedTags.reduce((worst, cur) =>
      statusSeverity(cur.status) > statusSeverity(worst.status) ? cur : worst,
    );
    const allIds = Array.from(new Set(detectedTags.flatMap((t) => t.ids || [])));
    const status = (worstTag.status || "ok") as TrackerStatus;

    result.push({
      tracker_key: key,
      tracker_name: displayName,
      status,
      ids: allIds,
      script_count: worstTag.scriptLoadCount,
      event_count: worstTag.eventFireCount,
      prescription: derivePrescription(key, status),
      score: 0,
    });
  }

  // 정렬: 문제 있는 트래커가 위로
  result.sort((a, b) => statusSeverity(b.status) - statusSeverity(a.status));
  return result;
}

// 클수록 worst. not_installed는 다른 경로로 그리니 의도적으로 최상위.
function statusSeverity(s: string): number {
  if (s === "not_installed") return 7;
  if (s === "missing_events") return 6;
  if (s === "duplicate") return 5;
  if (s === "no_event") return 4;
  if (s === "partial_events") return 3;
  if (s === "multi_container") return 2;
  return 1; // ok
}

function derivePrescription(key: string, status: TrackerStatus): string | null {
  if (status === "duplicate") return PRESCRIPTIONS[key]?.duplicate ?? null;
  if (status === "multi_container") return PRESCRIPTIONS[key]?.multi_container ?? null;
  if (status === "no_event" || status === "missing_events" || status === "partial_events") {
    return PRESCRIPTIONS[key]?.no_event ?? null;
  }
  return null;
}

function UnifiedTrackerSummary({ pages, hostingId }: { pages: MultiPage[]; hostingId: string }) {
  const diagnoses = aggregateUnifiedDiagnoses(pages);
  if (diagnoses.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="text-sm font-semibold text-gray-700 mb-3">📋 사이트 전체 트래커 진단</p>
      <div className="space-y-3">
        {diagnoses.map((d) => (
          <TrackerCard key={d.tracker_key} diagnosis={d} hostingId={hostingId} />
        ))}
      </div>
    </div>
  );
}

// ─── 이메일 구독 폼 ──────────────────────────────────────────────────────────

function SubscribeForm({ siteUrl, isFirstScan }: { siteUrl: string; isFirstScan?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "duplicate" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), site_url: siteUrl }),
      });

      if (res.ok) {
        setStatus("success");
      } else if (res.status === 409) {
        setStatus("duplicate");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="mt-10 bg-blue-50 rounded-xl p-6 text-center ring-1 ring-blue-200">
        <p className="text-base font-semibold text-blue-700">
          ✓ 자동 모니터링이 시작되었습니다
        </p>
        <p className="mt-2 text-sm text-gray-600">
          주 1회 자동으로 재스캔하고, 트래킹 상태에 변화가 생기면 이메일로 알려드립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 bg-blue-50 rounded-xl p-6 ring-1 ring-blue-200">
      <div className="text-center">
        <p className="text-base font-semibold text-gray-900">
          📧 이 사이트를 자동으로 감시하시겠습니까?
        </p>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          주 1회 자동으로 재스캔하고, 트래킹 상태에 변화가 생기면
          <br className="hidden sm:block" />
          이메일로 알려드립니다. <span className="font-semibold text-blue-700">(무료)</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
        <input
          type="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
          className="flex-1 h-11 px-4 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="h-11 px-5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "신청 중..." : "무료 모니터링 시작"}
        </button>
      </form>

      {status === "duplicate" && (
        <p className="mt-3 text-xs text-amber-600 text-center">이미 신청된 이메일입니다</p>
      )}
      {status === "error" && (
        <p className="mt-3 text-xs text-red-500 text-center">신청에 실패했습니다. 다시 시도해주세요</p>
      )}

      <ul className="mt-5 space-y-1.5 text-sm text-gray-700 max-w-md mx-auto">
        <li className="flex gap-2">
          <span className="text-blue-600">✓</span>
          <span>트래킹이 갑자기 안 되기 시작했을 때 즉시 알림</span>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-600">✓</span>
          <span>광고 성과가 떨어지는 원인을 놓치지 않음</span>
        </li>
        <li className="flex gap-2">
          <span className="text-blue-600">✓</span>
          <span>언제든 해지 가능</span>
        </li>
      </ul>

      {isFirstScan && (
        <p className="mt-4 text-xs text-gray-500 text-center italic leading-relaxed">
          이 사이트는 처음 스캔되었습니다. 자동 모니터링을 신청하시면<br className="hidden sm:block" />
          변화가 생길 때 알려드립니다.
        </p>
      )}
    </div>
  );
}

// ─── 스캔 히스토리 섹션 ──────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  url: string;
  score: number;
  scanned_at: string;
  summary: Record<string, string>;
}

const HISTORY_TRACKER_PRIORITY = ["meta_pixel", "ga4", "naver", "kakao", "gtm"];
const TRACKER_SHORT_NAME: Record<string, string> = {
  meta_pixel: "Meta",
  ga4: "GA4",
  gtm: "GTM",
  naver: "네이버",
  kakao: "카카오",
  tiktok: "TikTok",
  criteo: "Criteo",
  dable: "Dable",
};

function statusIcon(status: string): string {
  if (!status || status === "not_installed") return "❌";
  if (status === "duplicate" || status === "no_event" || status === "partial_events" || status === "missing_events") return "⚠️";
  return "✅";
}

function relativeLabel(isoDate: string, now: Date): string {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "오늘";
  if (diffDays === 1) return "1일 전";
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths}개월 전`;
}

function HistorySection({ currentUrl, currentScanId }: { currentUrl: string; currentScanId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    fetch(`/api/history?url=${encodeURIComponent(currentUrl)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEntries(d?.entries || []))
      .catch(() => setEntries([]));
  }, [currentUrl]);

  if (entries === null) return null;
  if (entries.length <= 1) return null;

  const now = new Date();
  const current = entries.find((e) => e.id === currentScanId) || entries[0];
  const oldest = entries[entries.length - 1];
  const scoreDelta = current.score - oldest.score;

  const changedTrackers: { key: string; from: string; to: string }[] = [];
  for (const key of Object.keys(current.summary || {})) {
    const oldStatus = oldest.summary?.[key] || "not_installed";
    const newStatus = current.summary[key];
    if (oldStatus !== newStatus) {
      changedTrackers.push({ key, from: oldStatus, to: newStatus });
    }
  }

  // statusIcon 과 같은 기준으로 등급화한다. 표시되는 아이콘이 같으면 라벨도
  // 중립("변경됨")으로 — 아이콘이 동일한데 빨갛게 "악화됨"으로 찍히던 버그 방지.
  const compareDirection = (from: string, to: string): "improved" | "regressed" | "changed" => {
    const tier = (s: string) => {
      if (!s || s === "not_installed") return 0;
      if (s === "duplicate" || s === "no_event" || s === "partial_events" || s === "missing_events") return 1;
      return 2; // ok, multi_container
    };
    const a = tier(from);
    const b = tier(to);
    if (b > a) return "improved";
    if (b < a) return "regressed";
    return "changed";
  };

  return (
    <div className="mt-8 bg-white rounded-xl p-6 ring-1 ring-gray-100">
      <p className="text-base font-semibold text-gray-900">📊 스캔 히스토리</p>

      <div className="mt-4 space-y-2">
        {entries.map((entry) => {
          const isCurrent = entry.id === currentScanId;
          const label = isCurrent ? "현재" : relativeLabel(entry.scanned_at, now);
          const date = new Date(entry.scanned_at).toLocaleDateString("ko-KR");
          return (
            <div
              key={entry.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg text-sm ${
                isCurrent ? "bg-blue-50 font-medium" : "bg-gray-50"
              }`}
            >
              <span className={`text-xs ${isCurrent ? "text-blue-700 font-semibold" : "text-gray-500"}`}>
                [{label}]
              </span>
              <span className="text-xs text-gray-500">{date}</span>
              <span className="text-gray-900">
                <strong>{entry.score}</strong>점
              </span>
              <span className="text-xs text-gray-600 ml-auto flex gap-2 flex-wrap">
                {HISTORY_TRACKER_PRIORITY.map((k) => {
                  const s = entry.summary?.[k];
                  if (!s) return null;
                  return (
                    <span key={k}>
                      {TRACKER_SHORT_NAME[k]} {statusIcon(s)}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>

      {(changedTrackers.length > 0 || scoreDelta !== 0) && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-900">💡 변화 요약</p>
          <ul className="mt-2 space-y-1 text-sm">
            {changedTrackers.map(({ key, from, to }) => {
              const direction = compareDirection(from, to);
              const className =
                direction === "improved"
                  ? "text-green-700"
                  : direction === "regressed"
                    ? "text-red-600"
                    : "text-gray-600";
              const label =
                direction === "improved"
                  ? "(개선됨)"
                  : direction === "regressed"
                    ? "(악화됨)"
                    : "(변경됨)";
              return (
                <li key={key} className={className}>
                  {TRACKER_SHORT_NAME[key] || key}: {statusIcon(from)} → {statusIcon(to)} {label}
                </li>
              );
            })}
            {scoreDelta !== 0 && (
              <li className={scoreDelta > 0 ? "text-green-700" : "text-red-600"}>
                전체 점수: {oldest.score} → {current.score} ({scoreDelta > 0 ? "+" : ""}{scoreDelta}점)
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
