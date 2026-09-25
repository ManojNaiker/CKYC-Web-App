import './_group.css';
import { OverviewSample } from './_shared/OverviewSample';

export function Current() {
  return (
    <div className="ckyc-preview-page current">
      <div className="mx-auto max-w-[1560px] p-5 sm:p-8">
        <OverviewSample mode="current" />
      </div>
    </div>
  );
}