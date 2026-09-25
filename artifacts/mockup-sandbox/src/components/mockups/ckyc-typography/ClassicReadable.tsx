import './_group.css';
import './classic.css';
import { OverviewSample } from './_shared/OverviewSample';

export function ClassicReadable() {
  return (
    <div className="ckyc-preview-page classic">
      <div className="mx-auto max-w-[1560px] p-5 sm:p-8">
        <OverviewSample mode="classic" />
      </div>
    </div>
  );
}