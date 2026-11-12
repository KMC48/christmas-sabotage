# クリスマス粉砕大作戦の開発ルール

## 作業開始・再開

- `git status --short --branch` で未コミット差分を確認し、`git fetch origin` で最新の `origin/main` を取得する。直近の関連PR・進行中のPR・Actionsを確認し、基準mainのSHAと既存の失敗・未確認事項を把握する。
- 新規作業は最新の `origin/main` から作業ブランチを作る。引継ぎ時は記録された作業ブランチとコミットを照合し、差分・Checks・残作業を確認して再開する。既存の未コミット差分や他の作業を上書きしない。
- [README](README.md) と [実装資料](資料/index.html) から関連箇所を把握する。現行の挙動は `game/index.html`・`game/game.js` と関連テスト・PRで確認する。旧版の実装指示書は設計経緯の参照とする。

## 検証

- ゲーム変更はルートから `python game/tests/run_tests.py` と関連テストを実行する。UI変更はスマホ幅で対象画面を確認し、表示文言を変えた場合は `python scripts/subset_fonts.py --check` を実行する。保存変更時は既存の localStorage データとルール版ごとの記録を確認する。
- モバイルの同梱物に関わる変更は [統合手順](docs/native-integration.md) の `npm run sync` と `node scripts/verify-native-assets.mjs` を参照する。[CI定義](.github/workflows/native-validation.yml) でWebのオフライン検証・Android・iOS Simulatorの結果を確認する。
- ローカル、CI、実機の結果を区別し、対象SHAと成功・失敗・未実施を記録する。署名・提出手順は [Android](docs/android/README.md)、[iOS](docs/ios/README.md)、[ストア申告](docs/privacy-store-submission.md) を参照する。

## チェックポイントと引継ぎ

- 機能・修正単位で作業を区切る。関連箇所の動作を確認したら作業ブランチにコミットしてpushし、検証状況をコミット本文または引継ぎ記録に残す。検証途中でも必要なら `WIP:` を付けてコミット・pushし、未完了事項と次に実行するテストを書く。
- 長い作業は早めに作業ブランチとPR本文案を用意し、投稿が許可されていればドラフトPRを作る。投稿前の承認が指定されている場合は、差分と本文案を提示して承認を得る。
- 区切りごとに [引継ぎテンプレート](docs/HANDOFF_TEMPLATE.md) の項目を更新する。PRがあれば本文に、投稿前は作業ブランチ上の `docs/` の作業記録に残す。記録だけを追記する場合は、検証したコミットのSHAを明記し、ブランチの先端はブランチリンクから辿れるようにする。

## 変更範囲と公開

- 依頼の範囲で変更し、既存のゲーム仕様、保存データの互換性、画像素材、ストア設定を維持する。これらに変更が必要なら、影響範囲と検証結果をPRに記す。
- APIキー、署名鍵、パスワード、トークンなどの認証情報をGitやPR、引継ぎ記録に含めない。
- mainへ直接pushしない。mainへのマージ、本番デプロイ、ストア提出は、それぞれユーザーの明示承認を得てから行う。PR投稿の承認はこれらの承認を兼ねない。
- main更新時はGitHub Pagesの自動公開も発生する。マージ前にマージと、それに伴う本番公開の両方が承認済みか確認する。
