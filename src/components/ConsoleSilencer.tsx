'use client';

import { useEffect } from 'react';

export default function ConsoleSilencer() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true') {
      return;
    }

    const originalLog = console.log;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const originalWarn = console.warn;

    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};

    return () => {
      console.log = originalLog;
      console.info = originalInfo;
      console.debug = originalDebug;
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
