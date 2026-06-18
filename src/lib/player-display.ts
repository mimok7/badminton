export function formatNameWithCoins(name: string, coinBalance?: number | null) {
  if (typeof coinBalance !== 'number') {
    return name;
  }

  return `${name} (${coinBalance})`;
}

export function formatCurrentUserNameWithCoins(name: string, coinBalance?: number | null) {
  if (typeof coinBalance !== 'number') {
    return name;
  }

  return `${name} (${coinBalance}코인)`;
}
