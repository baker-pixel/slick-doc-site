// The Orange Door logo for HTML emails. Images in email must be absolute URLs, so these point at
// the files the website serves from /brand. Two versions: white text for dark header bars, dark
// text for white backgrounds. alt text shows in clients that block images by default.
const BASE = "https://www.orangedoormarketing.com/brand";

export function emailLogo(onDark: boolean, widthPx = 170): string {
  const file = onDark ? "email-logo-white.png" : "email-logo.png";
  return `<img src="${BASE}/${file}" width="${widthPx}" alt="Orange Door Marketing" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:${widthPx}px;color:${onDark ? "#E8521A" : "#1a1a1a"};font-weight:bold;font-size:14px;">`;
}
