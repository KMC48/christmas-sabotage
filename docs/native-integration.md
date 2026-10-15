# Android・iOS 統合検証（2026-10-15）

## 統合内容

PR #3の `ios/project` にPR #2の `0c8a84a486ab8a8fe45253d7b55379f8c044f6ce` をマージ。元のiOS履歴 `616560448bf41fd0e81c9b67f7548c33b5fb94c4` も親として保持。

- Android namespace/applicationId、MainActivityのパッケージ、文字列リソース、iOS Bundle ID、Capacitor appId：`jp.kmccreativelab.christmassabotage`。
- 5点のWOFF2（427,736 bytes）と3点のOFLライセンスを両OSへ同梱。Google Fontsの外部参照なし。
- タイトル説明文は両ブランチで一致していた最新の3行を維持。
- iOSの縦画面、iPhone専用、Version 1.0.0 / Build 1、最低iOS 15、暗色起動画面、暗号化申告、SPM・Hapticsを維持。
- Androidの縦画面、暗色起動画面、署名設定、出力先変更機能を維持。

## 検証と再現手順

```bash
npm ci
npm run sync
node scripts/verify-native-assets.mjs
python -m pip install playwright==1.64.0 Pillow fonttools brotli
python -m playwright install --with-deps chromium
python scripts/subset_fonts.py --check
python game/tests/run_tests.py
python game/tests/test_walk_sprites.py
python game/tests/test_packaged_offline.py
```

ローカルで `npm ci`、Webビルド、両OSのCapacitor sync、ID整合性、Web成果物56ファイルの両OSとのバイト一致、フォントの843文字のチェックに成功。

`.github/workflows/native-validation.yml` で既存ブラウザ回帰テスト、歩行スプライト検証、外部通信遮断表示、Androidのdebug APK／未署名release AAB、iOS Simulator向け署名なしビルドを実施する。各実行結果はPRのChecksを参照。ワークフローの追加自体はビルド成功の証拠ではない。

今回の作業環境はLinux、JDK 17、Android SDK／Xcodeなし。ローカルのGradle実行は配布物取得時の `Network is unreachable` で停止。ネイティブビルドはGitHub Actions側で検証する。

外部通信遮断テストは、キャッシュなしのChromiumでローカル配信のアプリ同梱Web素材を表示する。タイトル画像、5フォントのロード、STAGE 1、外部リクエスト0件、JS／素材エラー0件を検査。`web-timings.json` の値はナビゲーション開始からWebタイトルが描画可能になるまでの計測であり、端末のネイティブ起動時間ではない。

## PRの統合順序

1. PR #1をmainへマージ（歩行スプライト）。
2. PR #2のbaseをmainへ変更し、差分とChecksを確認してマージ（Android基盤・ID・フォント）。
3. PR #3のbaseをmainへ変更し、差分とChecksを確認してマージ（iOS・統合検証）。

依存履歴を保つため、この順序ではmerge commit方式を推奨。squash/rebaseで統合する場合は、後続ブランチを新しいmainと同期し、重複差分を確認する。依存PRの統合とbase変更が済むまで元ブランチは残す。本作業ではmainへのマージ・公開は実施していない。

## 残る確認

- 統合後iOSのコールドスタート時間。以前の約6秒は統合前の観測であり、フォントが原因だったと断定しない。
- 両OSの実機で機内モード起動、音、振動、タッチ、保存、中断復帰、全ステージ。
- Androidの戻る操作は既存の標準動作のまま。
- Androidの配信用署名、iOS Team設定・実機署名・Archive／TestFlight。
