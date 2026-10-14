'use client';

import { Download } from 'lucide-react';
import { useDemoMode } from '@/components/demo/demo-features';
import { SAMPLE_UPLOADS } from '@/lib/demo-seed/samples';

/** Demo mode only: sample files to download and drop into the inbox. */
export function DemoSamples() {
  if (!useDemoMode()) return null;
  return (
    <p className="text-xs text-muted-foreground">
      No files to hand? Download a sample and drop it above:{' '}
      {SAMPLE_UPLOADS.map((name, i) => (
        <span key={name}>
          {i > 0 && ' · '}
          <a
            href={`/demo/${name}`}
            download
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
          >
            <Download size={12} aria-hidden="true" />
            {name}
          </a>
        </span>
      ))}
    </p>
  );
}
