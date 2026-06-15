export function getDateInTimeZone(
  timeZone: string,
  date: Date = new Date()
): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

export function getKoreaDate(date: Date = new Date()): string {
  return getDateInTimeZone('Asia/Seoul', date);
}
