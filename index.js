/**
 * 공고봇 (gonggobot)
 * 공공기관 채용공고를 매일 디스코드로 알림
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NCS_CODES, REGION_CODES, EMPLOYMENT_TYPE_CODES } from './codemap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 환경 설정 ─────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadConfig() {
  const p = path.join(__dirname, 'config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadSeen() {
  const p = path.join(__dirname, 'seen.json');
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function saveSeen(seen) {
  fs.writeFileSync(
    path.join(__dirname, 'seen.json'),
    JSON.stringify(seen, null, 2)
  );
}

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseYmd(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8))
  );
}

function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd ?? '-';
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function daysLeft(yyyymmdd) {
  const end = parseYmd(yyyymmdd);
  if (!end) return Infinity;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end - now) / 86_400_000);
}

// ── API 호출 ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://apis.data.go.kr/1051000/recruitment/list';

async function fetchAllJobs(apiKey) {
  const all = [];
  let pageNo = 1;
  const numOfRows = 100;

  while (true) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      pageNo:     String(pageNo),
      numOfRows:  String(numOfRows),
      _type:      'json',
      ongoingYn:  'Y',
    });

    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.resultCode !== 200)
      throw new Error(`API 오류 ${data.resultCode}: ${data.resultMsg}`);

    const items = data.result ?? [];
    all.push(...items);

    const total = Number(data.totalCount);
    if (pageNo * numOfRows >= total || all.length >= 1000) break;
    pageNo++;
  }

  return all;
}

// ── 필터링 ────────────────────────────────────────────────────────────────────

function matchesConfig(job, config) {
  const { ncs = [], regions = [], employmentTypes = [] } = config;

  // API 응답의 ncsCdNmLst는 마침표(.) 구분: "경영.회계.사무"
  // config는 가운뎃점(·) 허용 → 비교 전 · → . 변환
  if (ncs.length > 0) {
    const jobNcs = (job.ncsCdNmLst ?? '').split(',').map(s => s.trim());
    const ok = ncs.some(name => {
      const normalized = (NCS_CODES[name] ?? name).replace(/·/g, '.');
      return jobNcs.some(n => n.includes(normalized) || normalized.includes(n));
    });
    if (!ok) return false;
  }

  // workRgnNmLst: "서울,경기" 형태
  if (regions.length > 0) {
    const jobRegions = (job.workRgnNmLst ?? '').split(',').map(s => s.trim());
    const ok = regions.some(name => {
      const code = REGION_CODES[name] ?? name;
      return jobRegions.some(r => r.includes(code));
    });
    if (!ok) return false;
  }

  // hireTypeNmLst: "청년인턴(체험형)" 등 — includes()로 부분 매칭
  if (employmentTypes.length > 0) {
    const jobHire = (job.hireTypeNmLst ?? '').split(',').map(s => s.trim());
    const ok = employmentTypes.some(name => {
      const code = EMPLOYMENT_TYPE_CODES[name] ?? name;
      return jobHire.some(h => h.includes(code));
    });
    if (!ok) return false;
  }

  return true;
}

// ── Discord 전송 ──────────────────────────────────────────────────────────────

function buildEmbed(job, urgentThreshold) {
  // decimalDay: API가 직접 제공하는 남은 일수
  const dl       = job.decimalDay ?? daysLeft(job.pbancEndYmd);
  const isUrgent = dl <= urgentThreshold;
  const color    = isUrgent ? 0xFF4444 : 0x4A90D9;

  const deadlineStr = `${formatDate(job.pbancEndYmd)} (D-${dl})`;
  const urgentNote  = isUrgent ? `⚠️ **마감 ${dl}일 전!**\n` : '';

  return {
    color,
    title:       job.recrutPbancTtl ?? '(제목 없음)',
    url:         job.srcUrl ?? null,
    description: `${urgentNote}🏛️ **${job.instNm ?? '-'}**`,
    fields: [
      { name: '📅 마감일',   value: deadlineStr,              inline: true  },
      { name: '📍 지역',     value: job.workRgnNmLst ?? '-',  inline: true  },
      { name: '💼 직무(NCS)',value: job.ncsCdNmLst   ?? '-',  inline: false },
      { name: '👔 고용형태', value: job.hireTypeNmLst ?? '-', inline: true  },
    ],
    footer:    { text: '공고봇 · 잡알리오' },
    timestamp: new Date().toISOString(),
  };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function postWebhook(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord 웹훅 오류 ${res.status}: ${body}`);
  }
}

async function sendToDiscord(jobs, webhookUrl, urgentThreshold) {
  if (jobs.length === 0) {
    await postWebhook(webhookUrl, { content: '오늘 새 공고 없음' });
    console.log('✅ 새 공고 없음 알림 전송');
    return;
  }

  const chunks = chunkArray(jobs, 10);
  for (let i = 0; i < chunks.length; i++) {
    const embeds = chunks[i].map(job => buildEmbed(job, urgentThreshold));
    await postWebhook(webhookUrl, { embeds });
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`✅ 공고 ${jobs.length}건 Discord 전송 완료`);
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const apiKey     = process.env.DATA_GO_KR_KEY;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!apiKey)     throw new Error('DATA_GO_KR_KEY 환경 변수가 없습니다');
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL 환경 변수가 없습니다');

  const config  = loadConfig();
  const seen    = loadSeen();
  const seenSet = new Set(seen);

  console.log(`📋 설정: NCS=${config.ncs} / 지역=${config.regions} / 고용형태=${config.employmentTypes}`);

  const allJobs = await fetchAllJobs(apiKey);
  console.log(`🔍 진행중 공고 ${allJobs.length}건 조회`);

  const filtered = allJobs.filter(job => matchesConfig(job, config));
  console.log(`🔎 필터 후 ${filtered.length}건`);

  const newJobs = filtered.filter(job => !seenSet.has(String(job.recrutPblntSn)));

  console.log(`🆕 신규 ${newJobs.length}건`);

  await sendToDiscord(newJobs, webhookUrl, config.urgentDaysThreshold ?? 3);

  // seen.json 갱신: 새 공고 ID 추가
  for (const job of newJobs) seenSet.add(String(job.recrutPblntSn));
  saveSeen([...seenSet]);
  console.log(`💾 seen.json 저장 (총 ${seenSet.size}건)`);
}

main().catch(err => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
