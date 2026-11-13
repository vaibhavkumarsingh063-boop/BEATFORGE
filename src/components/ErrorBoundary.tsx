import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[BEATFORGE STUDIO] Uncaught component error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-[#0a0b10] text-[#e0e6ed] flex flex-col items-center justify-center p-6 select-none">
          <div className="bg-[#121522] border border-[#272e42] rounded-2xl max-w-lg w-full p-8 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-500/50 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-lg font-extrabold text-white tracking-wide uppercase">
                STUDIO RECOVERY MODE
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                A non-critical rendering error was intercepted. Your music data and audio engine are protected.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full bg-[#0a0c12] border border-[#1e2335] rounded-xl p-3 text-[11px] font-mono text-rose-300 text-left overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="flex gap-3 mt-2 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 cursor-pointer transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reload Session</span>
              </button>

              <button
                onClick={this.handleReset}
                className="py-2.5 px-4 rounded-xl bg-[#1b2030] hover:bg-[#252c42] text-gray-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-[#2b334a] cursor-pointer transition-all"
              >
                <span>Reset Cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
