import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error("[claude-watch] ui error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center p-8">
          <div className="max-w-md flex flex-col gap-3 text-sm">
            <div className="text-danger uppercase tracking-[0.16em] text-[10px]">UI error</div>
            <div className="font-mono text-xs text-fg-muted whitespace-pre-wrap">{this.state.error.message}</div>
            <button
              onClick={() => this.setState({ error: null })}
              className="self-start text-[10px] uppercase tracking-[0.16em] px-2 py-1 rounded-sm border border-border bg-bg-card text-fg-muted hover:bg-bg-hover"
            >
              retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
