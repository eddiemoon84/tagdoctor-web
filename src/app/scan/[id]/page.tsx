"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { STATUS_CONFIG, TRACKER_EMOJI } from "@/lib/constants";

interface TrackerDiagnosis {
  tracker_key: string;
  tracker_name: string;
  status: "ok" | "duplicate" | "multi_container" | "no_event" | "not_installed";
  script_count: number;
  event_count: number;
  ids: string[];
  prescription: string | null;
  score: number;
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

          <div className="mt-4 flex justify-center gap-6 text-sm">
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
            <TrackerCard key={d.tracker_key} diagnosis={d} />
          ))}
        </div>

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

function TrackerCard({ diagnosis }: { diagnosis: TrackerDiagnosis }) {
  const [open, setOpen] = useState(diagnosis.prescription !== null);
  const config = STATUS_CONFIG[diagnosis.status];
  const emoji = TRACKER_EMOJI[diagnosis.tracker_key] || "📋";

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
      {diagnosis.prescription && (
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

// ─── 이메일 구독 폼 ──────────────────────────────────────────────────────────

function SubscribeForm({ siteUrl }: { siteUrl: string }) {
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
      <div className="mt-10 bg-blue-50 rounded-xl p-6 text-center">
        <p className="text-sm font-medium text-blue-700">
          신청 완료! 변화가 감지되면 알려드리겠습니다
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 bg-blue-50 rounded-xl p-6 text-center">
      <p className="text-sm font-semibold text-gray-800">
        정기 모니터링 알림 받기
      </p>
      <p className="mt-1 text-sm text-gray-500">
        사이트 트래킹 상태에 변화가 생기면 이메일로 알려드립니다
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
        <input
          type="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
          className="flex-1 h-10 px-3 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="h-10 px-5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "신청 중..." : "알림 신청"}
        </button>
      </form>
      {status === "duplicate" && (
        <p className="mt-2 text-xs text-amber-600">이미 신청된 이메일입니다</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-xs text-red-500">신청에 실패했습니다. 다시 시도해주세요</p>
      )}
    </div>
  );
}
