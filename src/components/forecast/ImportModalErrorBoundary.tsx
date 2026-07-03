import React from 'react';

type ImportModalErrorBoundaryProps = {
  children: React.ReactNode;
};

type ImportModalErrorBoundaryState = {
  hasError: boolean;
};

export class ImportModalErrorBoundary extends React.Component<
  ImportModalErrorBoundaryProps,
  ImportModalErrorBoundaryState
> {
  public state: ImportModalErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ImportModalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[import-preview] render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 min-h-[8rem] rounded-lg border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-900">
          <p className="font-semibold">Preview details could not be displayed</p>
          <p className="mt-1 text-red-800">Close this dialog, restart the API server if needed, then run Preview again.</p>
        </div>
      );
    }
    const { children } = this as unknown as React.Component<
      ImportModalErrorBoundaryProps,
      ImportModalErrorBoundaryState
    > & { props: ImportModalErrorBoundaryProps };
    return children;
  }
}
