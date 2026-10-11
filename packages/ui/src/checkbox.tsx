'use client';

import { forwardRef } from 'react';
import { cn } from './utils';

export const Checkbox = forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'type'>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          'h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded border border-white/20 bg-white/5 transition-colors',
          'checked:border-lime-500 checked:bg-lime-500',
          'hover:border-white/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'relative after:absolute after:inset-0 after:flex after:items-center after:justify-center',
          "after:content-[''] after:opacity-0 checked:after:opacity-100",
          'after:bg-[url("data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2014%2014%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M11.5%204L5.5%2010L2.5%207%22%20stroke%3D%22%23111%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E")] after:bg-center after:bg-no-repeat after:bg-[length:10px_10px]',
          className
        )}
        {...props}
      />
    );
  }
);
Checkbox.displayName = 'Checkbox';
