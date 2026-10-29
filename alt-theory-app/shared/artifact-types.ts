/** Formats the browser can display directly; TIFF needs a separate decoder. */
export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#]|$)/i.test(path);
}
export function isHtmlPath(path: string): boolean {
  return /\.html?(?:[?#]|$)/i.test(path);
}
