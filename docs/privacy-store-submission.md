# クリスマス粉砕大作戦：プライバシーポリシー・ストア申告準備

> **公開前ドラフト（2026-10-30時点のmainの検証に基づく）**。このPRをマージ・本番公開・ストア申告する前に、運営者表記、問い合わせ先、制定日、最終ビルドの通信状況を確認すること。

## 対象・実装根拠

- 対象：`KMC48/christmas-sabotage`、パッケージID `jp.kmccreativelab.christmassabotage`。叫び声の録音ゲーム `christmas-smash` とは別のアプリ。
- `game/game.js` の `SKEY = 'xmas-funsai-v1'` にスコア（旧ルール版を含む）、ステージ解放・エンディング状況、称号、既読情報、操作方式の比較メモ、BGM/効果音/振動/低負荷モード/操作位置を保存。
- 起動時は `loadSave()` で復元し `putSave()` で保存。削除ボタンは該当キーを `localStorage.removeItem(SKEY)` して再読み込み。再起動後はデフォルトの保存データが作成されるため、`localStorage` 全体が空になると説明しない。
- 現行のゲームコードに録音・広告・解析・外部送信の処理は見当たらない。利用ライブラリは Capacitor本体、App、Haptics（`package.json` とiOS SPM）で、BGM/SEはWeb Audio API。フォントはアプリ同梱。
- `android/app/src/main/AndroidManifest.xml` は INTERNET 権限・`allowBackup=true`。OSバックアップ先を開発者の送信先と混同しない。iOSの端末バックアップ挙動も最終端末設定に依存する。
- Web版では配信基盤（GitHub Pages）のアクセス情報取り扱いと、本ゲームのスコア保存を区別。

## 実装した導線

- `game/index.html` の設定画面から「プライバシーポリシー」→同梱 `privacy.html` を表示する専用オーバーレイ→「設定に戻る」。ゲームの状態を維持したまま閲覧する。
- Androidの戻る操作はプライバシー画面→設定画面。設定画面に戻ってもゲームを勝手に再開しない。
- 同梱対象は `scripts/build-www.mjs` のコピー処理で `game/privacy.html` → `www/privacy.html`、さらにCapacitor同期で両OSに取り込まれる構成。不要な外部フォントや外部スクリプトは追加しない。

## 公開予定URL（まだ公開されていない）

`https://kmc48.github.io/christmas-sabotage/game/privacy.html`

このURLは、GitHub Pages が **mainブランチのリポジトリルートを配信元**としている場合の候補。ルート `index.html` は `./game/` に移動するが、policyは `game/` 配下へ直接配置する。GitHub Pagesの設定と本番URLでのHTTP 200、SSL、ログイン不要、モバイル表示を実際に確認するまでストアに登録しない。

## App Store Connect：申告案（最終ビルド検証を条件とする）

- プライバシーポリシーURL：上記の公開後URL。
- 「データの収集」：**データを収集しない**を候補とする。端末にのみ保存して外部送信しないデータはAppleの「collect」には当たらない。スコア等が端末内にしか存在しないなら「Gameplay Content」を収集項目として申告する必要はない。
- 「トラッキング」：**行わない**を候補とする。広告ID／広告・解析SDKを導入していないことが前提。
- Capacitor、プラグイン、iOS Privacy Manifest、実機のネットワーク動作、最終配布ビルドのSDKをレビューして確定する。OSやApp Storeが独立して処理するデータと混同しない。

## Google Play：データセーフティ申告案（最終ビルド検証を条件とする）

- ストア掲載とアプリ内の両方に同一方針へのアクセスを用意する。
- 「ユーザーデータの収集・共有」：**いいえ／なし**を候補とする。アプリが端末内でのみアクセスするデータは原則「収集」として扱わない。SDK、通信、バックアップ設定を最終確認する。
- ログイン・アカウント作成：なし。アカウント削除の機能は非該当。ゲーム内「記録と設定を消去」は端末内の保存キーを削除するが、OSバックアップには別途注意が必要。
- INTERNET権限だけで「外部送信している」とも「暗号化転送している」とも断定しない。暗号化・第三者共有などの質問は最終ビルドの実態に合わせる。

## 承認前の必須確認

- [ ] 正式な運営者名（現在「KMC Creative Lab」と仮記載）、連絡先、制定日を決めてHTMLに反映
- [ ] GitHub Pages設定と実際の公開経路、URLのHTTP 200・公開アクセスを確認
- [ ] `npm ci && npm run sync` から `www` と両OSの同梱ファイル一致を確認
- [ ] CIのWeb回帰テスト、Android/iOSビルド、アプリ内リンク・Android戻る動作のテストを確認
- [ ] AndroidリリースAAB・iOS配布用アーカイブの依存関係／権限／実機通信を確認
- [ ] OSバックアップから復元されたときの記録復活を許容するか、必要ならバックアップ制御方針を判断
- [ ] 合意を得てから main へマージ、Web本番更新、ストア申告。PR作成だけでは公開しない

## 公式参考情報

- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple App Store Connect: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Google Play データセーフティ: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play プライバシーポリシーの要件: https://support.google.com/googleplay/android-developer/answer/9859455
