import { CheckCircle2, Play, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { runAllVerificationTests, type VerificationReport } from '../tests/physicsVerification';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VerificationModal({ isOpen, onClose }: VerificationModalProps) {
  const [report, setReport] = useState<VerificationReport | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReport(runAllVerificationTests());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              Headless 6-DOF Physics Verification Suite
            </h2>
            <p className="text-xs text-slate-400">
              Analytical &amp; RK4 convergence tests executed directly against the pure physics kernel
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close verification modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {report && (
          <div className="mt-4 space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            {report.results.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-800 bg-slate-900/90 p-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {item.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-white">{item.name}</span>
                  </div>
                  <span
                    className={`font-mono-tabular text-xs font-semibold ${
                      item.passed ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {item.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono-tabular text-xs">
                  <div>
                    <span className="text-slate-400">Expected: </span>
                    <span className="text-slate-200">{item.expected}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Measured: </span>
                    <span className="text-sky-300">{item.measured}</span>
                  </div>
                </div>

                <p className="mt-1.5 text-xs text-slate-400">{item.details}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
          <span className="font-mono-tabular text-xs text-slate-400">
            {report
              ? `${report.results.filter((r) => r.passed).length} / ${report.results.length} checks passed`
              : 'Running checks...'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReport(runAllVerificationTests())}
              className="flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Re-Run Checks</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
