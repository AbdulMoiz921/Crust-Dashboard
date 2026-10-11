"use client";
// Attachments are kept in Firestore as data URLs (Firebase Storage needs the paid plan).
// Firestore allows 1 MiB per document, so photos are shrunk in the browser first.

export const MAX_STORED = 900 * 1024;   // bytes of data URL we allow in one document
export const MAX_PDF = 700 * 1024;      // raw PDF size that still fits once base64-encoded

const readAsDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad image")); i.src = src; });

// Resize to at most 1600px on the long side and re-encode as JPEG, lowering quality until it fits.
async function shrinkImage(file) {
  const img = await loadImage(await readAsDataURL(file));
  let side = 1600;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); // transparent PNGs get a white page
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= MAX_STORED) return { data: url, type: "image/jpeg", size: Math.round(url.length * 0.75) };
    }
    side = Math.round(side * 0.75);
  }
  throw new Error("too_big");
}

// Returns {data, type, size} ready to store, or throws an Error whose message is shown to the person.
export async function prepareFile(file) {
  if (file.type.startsWith("image/")) {
    try { return await shrinkImage(file); }
    catch { throw new Error("This photo couldn’t be read. Try taking it again, or use a JPG or PNG."); }
  }
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF) throw new Error(`This PDF is ${Math.round(file.size / 1024)} KB; the limit is 700 KB. Take a photo of the card instead.`);
    return { data: await readAsDataURL(file), type: file.type, size: file.size };
  }
  throw new Error("Only photos (JPG, PNG) and PDF files can be attached.");
}

export function dataUrlToBlob(url) {
  const [head, b64] = url.split(",");
  const type = head.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function downloadDataUrl(url, name) {
  const href = URL.createObjectURL(dataUrlToBlob(url));
  const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export const sizeText = n => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
