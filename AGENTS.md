# TextHighlighter 프로젝트 지침

- 푸시는 사용자가 "푸시"라고 말할 때만 한다. iOS 빌드는 푸시된 커밋 기준으로 `scripts/ios-build.sh`를 쓴다.
- 웹(js/, src/) 로직을 바꾸면 `ios/TextHighlighter/PDFEngine.swift`에도 같은 변경을 수동 반영하고 `tests/native-pdf-engine.swift`로 검증한다. `.github/workflows/ios.yml`이 푸시 시 이를 자동 검사한다.
- 앱 삭제, 데이터 초기화, App Store 제출은 별도 지시 없이 수행하지 않는다.
- iOS 앱은 SwiftUI/PDFKit 네이티브 구현을 사용한다. WebKit 및 웹 자산 번들링을 다시 도입하지 않는다.
