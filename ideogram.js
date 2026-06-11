// ANDNEEDS ERP - 이데오그램 중계 함수 (Vercel Serverless Function)
// 위치: 저장소 루트의 api/ideogram.js  →  주소: /api/ideogram
// API 키는 코드에 넣지 말고, Vercel 환경변수 IDEOGRAM_API_KEY 에 저장하세요.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청만 가능해요.' }); return; }

  const key = process.env.IDEOGRAM_API_KEY;
  if (!key) {
    res.status(500).json({ error: '이데오그램 API 키가 아직 설정되지 않았어요. Vercel 환경변수 IDEOGRAM_API_KEY 를 확인해주세요.' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const { image, mode, prompt } = body || {};
    if (!image) { res.status(400).json({ error: '이미지가 없어요.' }); return; }

    const b64 = image.includes(',') ? image.split(',')[1] : image;
    const buf = Buffer.from(b64, 'base64');
    const blob = new Blob([buf], { type: 'image/png' });

    const form = new FormData();
    let endpoint;

    if (mode === 'edit') {
      // 프롬프트로 편집 (옷 정리 + 배경 변경 등)
      endpoint = 'https://api.ideogram.ai/v1/edit';
      form.append('images', blob, 'input.png');
      form.append('prompt', (prompt && prompt.trim()) ? prompt.trim()
        : 'Neatly straighten the garment and place it on a smooth, even light gray studio background.');
    } else if (mode === 'replace') {
      // 제품은 유지, 배경만 교체
      endpoint = 'https://api.ideogram.ai/v1/ideogram-v3/replace-background';
      form.append('image', blob, 'input.png');
      form.append('prompt', (prompt && prompt.trim()) ? prompt.trim()
        : 'A smooth, even light gray studio background, soft lighting.');
    } else {
      // 고품질 누끼 (투명 PNG)
      endpoint = 'https://api.ideogram.ai/v1/remove-background';
      form.append('image', blob, 'input.png');
    }

    const r = await fetch(endpoint, { method: 'POST', headers: { 'Api-Key': key }, body: form });

    if (!r.ok) {
      const t = await r.text();
      res.status(r.status).json({ error: '이데오그램 오류(' + r.status + '): ' + t.slice(0, 400) });
      return;
    }

    const data = await r.json();
    const outUrl = data && data.data && data.data[0] && data.data[0].url;
    if (!outUrl) { res.status(502).json({ error: '결과 이미지를 못 받았어요.', raw: data }); return; }

    const imgResp = await fetch(outUrl);
    const arr = Buffer.from(await imgResp.arrayBuffer());
    res.status(200).json({ image: 'data:image/png;base64,' + arr.toString('base64') });

  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
