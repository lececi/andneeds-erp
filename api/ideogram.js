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

    const form = new FormData();
    form.append('image', new Blob([buf], { type: 'image/png' }), 'input.png');

    let endpoint;
    if (mode === 'replace') {
      endpoint = 'https://api.ideogram.ai/v1/ideogram-v3/replace-background';
      const p = (prompt && prompt.trim()) ? prompt.trim() : 'clean minimal studio background, soft even light';
      form.append('prompt', p);
    } else {
      endpoint = 'https://api.ideogram.ai/v1/remove-background';
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
