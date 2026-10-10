# BOX WOD TIMER

크로스핏 박스 전광판용 경량 웹 타이머입니다. 의존성 없는 정적 HTML/CSS/JavaScript 프로젝트라 GitHub Pages로 바로 배포할 수 있습니다.

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
