export function retryableLocStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}
