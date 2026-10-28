/**
 * 잡알리오 API 탐색 스크립트
 *
 * 실행 전: .env 파일에 DATA_GO_KR_KEY 설정
 * 실행:   node explore.js
 *
 * 출력 내용:
 *  1. 응답 구조 및 전체 필드 목록
 *  2. 필터 파라미터 동작 여부 확인
 *  3. ncsCdNm / workRgnNm / hireTypeLstNm 실제 값 샘플
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── .env 로드 ────────────────────────────────────────────────────────────────
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

loadEnv();

const API_KEY = process.env.DATA_GO_KR_KEY;
if (!API_KEY) {
  console.error('❌ .env 파일에 DATA_GO_KR_KEY가 없습니다.');
  process.exit(1);
}

const BASE_URL = 'https://apis.data.go.kr/1051000/recruitment';

// ── API 호출 헬퍼 ─────────────────────────────────────────────────────────────
async function callApi(extra = {}, rows = 5) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    pageNo: '1',
    numOfRows: String(rows),
    _type: 'json',
    ...extra,
  });
  const url = `${BASE_URL}?${params}`;
  console.log('  📡', url.replace(API_KEY, '****'));

  const res = await fetch(url);
  let data;
  try {
    data = await res.json();
  } catch {
    console.error('  ❌ JSON 파싱 실패');
    return null;
  }

  if (data.resultCode !== 200) {
    console.error(`  ❌ 응답 오류 [${data.resultCode}] ${data.resultMsg}`);
    return null;
  }
  return data;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  잡알리오 API 탐색 스크립트');
  console.log('═══════════════════════════════════════════\n');

  // ── 1. 기본 호출: 응답 구조 확인 ─────────────────────────────────────────
  console.log('【1】 기본 호출 (진행중 공고, 3건)');
  const basic = await callApi({ ongoingYn: 'Y' }, 3);
  if (!basic) return;

  console.log(`  총 진행중 공고 수: ${basic.totalCount}`);
  const items = basic.result ?? [];

  console.log('\n  ▶ 첫 번째 항목 (전체 필드):');
  if (items[0]) console.log(JSON.stringify(items[0], null, 4));

  console.log('\n  ▶ 3개 항목 주요 필드:');
  for (const it of items) {
    console.log({
      recrutPblntSn:  it.recrutPblntSn,
      instNm:         it.instNm,
      recrutPbancTtl: it.recrutPbancTtl,
      ncsCdNmLst:     it.ncsCdNmLst,
      hireTypeNmLst:  it.hireTypeNmLst,
      workRgnNmLst:   it.workRgnNmLst,
      pbancEndYmd:    it.pbancEndYmd,
      decimalDay:     it.decimalDay,
      srcUrl:         it.srcUrl,
    });
  }

  // ── 2. 고유값 수집 (50건) ─────────────────────────────────────────────────
  console.log('\n【2】 50건 샘플로 고유값 수집');
  const sample = await callApi({ ongoingYn: 'Y' }, 50);
  if (sample) {
    const its = sample.result ?? [];
    const uniq = key => {
      const s = new Set();
      for (const it of its)
        (it[key] ?? '').split(',').map(v => v.trim()).filter(Boolean).forEach(v => s.add(v));
      return [...s].sort();
    };
    console.log('\n  ncsCdNmLst 고유값:');
    uniq('ncsCdNmLst').forEach(v => console.log('   ', v));
    console.log('\n  hireTypeNmLst 고유값:');
    uniq('hireTypeNmLst').forEach(v => console.log('   ', v));
    console.log('\n  workRgnNmLst 고유값:');
    uniq('workRgnNmLst').forEach(v => console.log('   ', v));
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  탐색 완료. codemap.js 값을 위 결과로 검증하세요.');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
