'use client';

import { useFormStatus } from 'react-dom';

type FormSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  'aria-label'?: string;
};

export default function FormSubmitButton({ children, pendingLabel, className, style, disabled, 'aria-label': ariaLabel }: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} style={style} disabled={pending || disabled} aria-disabled={pending || disabled} aria-label={ariaLabel}>
      {pending ? pendingLabel : children}
    </button>
  );
}
