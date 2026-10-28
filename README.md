# 공고봇 (gonggobot)

공공기관 채용공고(잡알리오)를 매일 아침 디스코드로 알림

## 빠른 시작

### 1. 로컬 API 탐색 (처음 한 번)

```bash
cp .env.example .env
# .env 파일에 실제 키 입력

node explore.js
```

출력된 `ncsCdNm`, `workRgnNm`, `hireTypeLstNm`, `recrutSeNm` 고유값을  
[codemap.js](codemap.js) 값과 비교하고 필요하면 수정하세요.

### 2. 로컬 테스트 (Discord 전송 포함)

```bash
node index.js
```

### 3. GitHub 저장소 설정

```bash
git init
git add .
git commit -m "feat: init gonggobot"

# GitHub에서 저장소 생성 후
git remote add origin https://github.com/<유저명>/gonggo-bot.git
git push -u origin main
```

**Settings → Secrets and variables → Actions → New repository secret** 에서 두 값 등록:

| 이름 | 값 |
|------|-----|
| `DATA_GO_KR_KEY` | 공공데이터포털 일반 인증키(Decoding) |
| `DISCORD_WEBHOOK_URL` | 디스코드 웹훅 URL |

## 설정 바꾸기 (`config.json`)

```json
{
  "ncs": ["경영·회계·사무"],
  "regions": ["서울", "인천", "경기"],
  "employmentTypes": ["인턴"],
  "urgentDaysThreshold": 3
}
```

| 항목 | 설명 |
|------|------|
| `ncs` | NCS 대분류 이름. 배열로 여러 개 가능 |
| `regions` | 근무지역. `codemap.js`의 `REGION_CODES` 키를 사용 |
| `employmentTypes` | 고용형태·채용구분. `EMPLOYMENT_TYPE_CODES` 키를 사용 |
| `urgentDaysThreshold` | 이 일수 이하이면 마감임박 표시 (기본 3) |

여러 직무 동시 추적:
```json
"ncs": ["경영·회계·사무", "정보통신"]
```

## 알림 시간 변경 (`.github/workflows/notify.yml`)

```yaml
- cron: '7 23 * * *'   # UTC 23:07 = KST 08:07
```

원하는 KST 시각에서 9를 빼면 UTC가 됩니다.  
예) KST 09:00 → UTC 00:00 → `'0 0 * * *'` (정각은 피할 것)

## 파일 구조

```
gonggo-bot/
├── .github/workflows/notify.yml  # 매일 KST 08:07 자동 실행
├── config.json                   # 조건 설정 (여기만 수정)
├── codemap.js                    # 설정 이름 → API 매칭값
├── explore.js                    # API 응답 구조·코드값 확인
├── index.js                      # 메인 봇 스크립트
├── seen.json                     # 이미 전송한 공고 ID (자동 관리)
├── .env.example                  # 환경 변수 템플릿
└── .gitignore                    # .env 제외
```

## 중복 방지

`seen.json`에 전송한 공고의 `recrutPblntSn`(일련번호)을 누적 저장합니다.  
GitHub Actions가 실행 후 자동으로 커밋합니다.

## 데이터 출처

[공공데이터포털 - 재정경제부 공공기관 채용정보 조회서비스(잡알리오)](https://www.data.go.kr/data/15125273/openapi.do)
