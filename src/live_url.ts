export function isMeituanLiveUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("liveid=") || u.includes("business-live-broadcast");
}
