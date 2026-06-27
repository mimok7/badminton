import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getFriendlyErrorMessage(err: any): string {
  if (!err) return '알 수 없는 오류가 발생했습니다.';
  
  let message = '';
  if (typeof err === 'string') {
    message = err;
  } else if (err.message) {
    message = err.message;
  } else if (err.error) {
    message = typeof err.error === 'string' ? err.error : (err.error.message || '');
  }
  
  if (message.includes('score_limit')) {
    return '점수는 25점을 초과할 수 없습니다.';
  }
  
  return message || '오류가 발생했습니다.';
}

