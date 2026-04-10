/**
 * 从阿里云控制台提取主账号 / 登录名（尽力而为）。
 *
 * 1. DOM：控制台账号抽屉里常见 `…_parent-info` 区块（前缀 hash 会变，后缀较稳定），
 *    主账号名多在「第 3 个直接子级 p」内的 `span > span`。
 * 2. 回退：对 body.innerText 做标签 / 邮箱 / UID 正则（控制台改版后仍可能命中）。
 */
export function extractAliyunMainAccountName(): string | null {
  const fromDom = extractFromAliyunParentInfoDom();
  if (fromDom) return fromDom;
  return extractFromAliyunPageText();
}

function cleanAccountCandidate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.replace(/\s+/g, " ").trim();
  v = v.replace(/^(主账号|登录名称|账号名称|当前身份)\s*[:：]\s*/i, "").trim();
  if (v.length < 2 || v.length > 120) return null;
  if (/^[:：\s\-—]+$/.test(v)) return null;
  if (/^(主账号|子账号|RAM|切换账号|暂无|—+)$/i.test(v)) return null;
  return v;
}

/** 匹配用户提供的结构：section[class*="…_parent-info"] > p:nth-child(3) > span > span */
function extractFromAliyunParentInfoDom(): string | null {
  const section =
    document.querySelector('section[class*="_parent-info"]') ??
    document.querySelector('section[class*="parent-info"]');

  const roots: Element[] = [];
  if (section) roots.push(section);
  const loose = document.querySelector('[class*="_parent-info"]:not(section)');
  if (loose && loose !== section) roots.push(loose);

  for (const root of roots) {
    const name = pickNameFromParentInfoRoot(root);
    if (name) return name;
  }
  return null;
}

function pickNameFromParentInfoRoot(root: Element): string | null {
  const section =
    root.tagName === "SECTION"
      ? root
      : (root.querySelector('section[class*="_parent-info"]') as Element | null) ??
        (root.querySelector('section[class*="parent-info"]') as Element | null) ??
        root;

  // 与用户选择器一致：直接子级里第 3 个 p
  const pThird = section.querySelector(":scope > p:nth-child(3)");
  if (pThird) {
    const inner =
      pThird.querySelector(":scope > span > span") ??
      pThird.querySelector(":scope > span span") ??
      pThird.querySelector("span span") ??
      pThird.querySelector("span") ??
      pThird;
    const t = cleanAccountCandidate(inner.textContent);
    if (t) return t;
  }

  const directP = section.querySelectorAll(":scope > p");
  if (directP.length >= 3) {
    const p = directP[2]!;
    const inner =
      p.querySelector(":scope > span > span") ??
      p.querySelector("span span") ??
      p.querySelector("span") ??
      p;
    const t = cleanAccountCandidate(inner.textContent);
    if (t) return t;
  }

  return null;
}

function extractFromAliyunPageText(): string | null {
  const raw = document.body?.innerText ?? "";
  const sample = raw.slice(0, 16000);

  const labeled: RegExp[] = [
    /主账号\s*[:：]\s*([^\n\r]+?)(?=\s*(?:\n|$|子账号|RAM|切换|资源|费用))/i,
    /主账号ID\s*[:：]\s*([^\s\n\r]+)/i,
    /登录名称\s*[:：]\s*([^\s\n\r]+)/,
    /账号名称\s*[:：]\s*([^\s\n\r]+)/,
    /当前身份\s*[:：]\s*([^\s\n\r]+)/,
    /当前登录\s*[:：]\s*([^\s\n\r]+)/,
  ];
  for (const re of labeled) {
    const m = sample.match(re);
    if (m?.[1]) {
      const v = cleanAccountCandidate(m[1]);
      if (v) return v;
    }
  }

  const email = sample.match(
    /[\w.+-]+@[\w.-]+\.(?:aliyun\.com|aliyuncs\.com|alibaba-inc\.com)/i,
  );
  if (email) return email[0].slice(0, 120);

  const uid = sample.match(/(?:UID|账号\s*ID)\s*[:：]\s*(\d{6,20})/i);
  if (uid) return `UID ${uid[1]}`;

  return null;
}
