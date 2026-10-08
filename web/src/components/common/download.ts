/** Save text as a file in the browser (exports never leave the visitor's machine). */
export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "2026-10-06T03-04-05" for file names. */
export function fileStamp(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/:/g, "-");
}
