let seq = 0;

export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
