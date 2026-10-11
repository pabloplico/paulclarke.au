'use client';

import { Toaster as SonnerToaster, type ToasterProps, toast } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        className: 'bg-card text-card-foreground border-white/[0.08]',
        descriptionClassName: 'text-muted-foreground',
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
