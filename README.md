# BOX WOD TIMER

크로스핏 박스 전광판용 경량 웹 타이머입니다. 의존성 없는 정적 HTML/CSS/JavaScript 프로젝트라 GitHub Pages로 바로 배포할 수 있습니다.

## 촬영 모드

고급 옵션에서 **촬영 모드**를 켜면 웹앱이 카메라와 마이크를 직접 사용합니다. 타이머가 카메라 미리보기 위에 표시되고, 녹화 영상에는 마이크와 타이머 비프음이 함께 기록됩니다. 영상이 끝나거나 `STOP REC`를 누르면 `영상 저장` 버튼이 표시됩니다.

- HTTPS 환경에서만 카메라를 사용할 수 있습니다. GitHub Pages는 HTTPS를 지원합니다.
- 카메라·마이크 접근 권한이 필요합니다.
- 구간 음성 안내는 휴대폰 스피커로 재생되며, 브라우저 정책상 녹화 파일에는 비프음만 직접 믹싱됩니다.

## 로컬 실행

`index.html`을 브라우저로 열거나, 프로젝트 폴더에서 아래를 실행합니다.

```bash
python3 -m http.server 8080
```

그 뒤 `http://localhost:8080`으로 접속합니다.

## GitHub Pages 배포

1. GitHub에서 `box-wod-timer` 저장소를 만들고 이 폴더를 push합니다.
2. 저장소 **Settings → Pages**에서 `Deploy from a branch`를 고릅니다.
3. `main` 브랜치와 `/(root)`를 선택 후 저장합니다.
4. `https://kimyouknow.github.io/box-wod-timer/`에서 열립니다.

GitHub 계정이 CLI에서 인증되어 있다면 다음처럼 생성·배포할 수 있습니다.

```bash
git init
git add .
git commit -m "Initial BOX WOD TIMER"
gh repo create kimyouknow/box-wod-timer --public --source=. --remote=origin --push
```
